//! The event team without internet. Intake actions done offline are replayed through the
//! same functions once the app is online again (`offline.replay`); what the backend
//! refuses then becomes a failed action the team settles. The seller's ID QR code carries
//! a time-based code (TOTP, RFC 6238 with SHA-256) that phone and team devices compute
//! without connection.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Utc};
use hmac::{Hmac, KeyInit, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use sha2::Sha256;
use uuid::Uuid;

use super::event_roles::require_team;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "offline.replay" => replay);
    register!(registry, Query "offline.getFailedActions" => get_failed_actions);
    register!(registry, Mutation "offline.resolveFailedAction" => resolve_failed_action);
    register!(registry, Mutation "offline.ensureCheckInSecret" => ensure_check_in_secret);
    register!(registry, Mutation "offline.getCheckInSecretsForEvent" => get_check_in_secrets_for_event);
}

/// What the app may do offline and replay: intake actions that set a state, so doing
/// them later still means what the team did.
const REPLAYABLE: &[&str] = &[
    "eventProducts.updateProductStatus",
    "eventProducts.setEventProductNote",
    "eventProducts.setEventProductLocationCategory",
    "eventProducts.markAllVendorProductsAvailable",
];
/// Actions per replay call; the app sends its queue in batches of this size.
const MAX_ACTIONS: usize = 100;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Action {
    id: Id,
    name: String,
    args: Value,
    label: String,
    #[serde(with = "ms")]
    done_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayArgs {
    event_id: Id,
    actions: Vec<Action>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Replayed {
    id: Uuid,
    /// False when an earlier call already did it
    done_now: bool,
    /// Error code when the backend refused it
    error: Option<String>,
}

/// Replays the offline actions of the team in order, each once however often it is sent.
/// An action the backend refuses does not stop the others: it is recorded with its error
/// and nothing of it stays.
async fn replay(ctx: &mut Ctx, args: ReplayArgs) -> AppResult<Vec<Replayed>> {
    let user = ctx.require_user()?;
    let event = args.event_id.0;
    require_team(ctx, event).await?;
    if args.actions.len() > MAX_ACTIONS {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "offline.tooMany",
            &[("max", &MAX_ACTIONS.to_string())],
        ));
    }
    let mut result = Vec::with_capacity(args.actions.len());
    for action in args.actions {
        let id = action.id.0;
        let known: Option<Option<String>> =
            sqlx::query_scalar("SELECT error FROM offline_actions WHERE id = $1")
                .bind(id)
                .fetch_optional(ctx.conn())
                .await?;
        if let Some(error) = known {
            result.push(Replayed {
                id,
                done_now: false,
                error,
            });
            continue;
        }
        let refused = if REPLAYABLE.contains(&action.name.as_str()) {
            sqlx::query("SAVEPOINT offline_action")
                .execute(ctx.conn())
                .await?;
            match ctx
                .call(Some(user), &action.name, action.args.clone())
                .await
            {
                Ok(_) => {
                    sqlx::query("RELEASE SAVEPOINT offline_action")
                        .execute(ctx.conn())
                        .await?;
                    None
                }
                // Refused like online (withdrawn item, paid-out seller): undo what it did
                Err(err) if err.code().is_some() => {
                    sqlx::query("ROLLBACK TO SAVEPOINT offline_action")
                        .execute(ctx.conn())
                        .await?;
                    Some((
                        err.code().unwrap_or_default().to_owned(),
                        err.message().unwrap_or_default().to_owned(),
                    ))
                }
                // A conflict with a parallel mutation: the whole call is retried
                Err(err) => return Err(err),
            }
        } else {
            Some((
                "offline.notReplayable".to_owned(),
                crate::i18n::error_text("offline.notReplayable", &[]),
            ))
        };
        sqlx::query(
            "INSERT INTO offline_actions (id, event_id, user_id, name, args, label, done_at,
               error, error_message)
             VALUES ($1, $2, $3, $4, $5, $6, LEAST($7, now()), $8, $9)",
        )
        .bind(id)
        .bind(event)
        .bind(user)
        .bind(&action.name)
        .bind(&action.args)
        .bind(&action.label)
        .bind(action.done_at)
        .bind(refused.as_ref().map(|(code, _)| code))
        .bind(refused.as_ref().map(|(_, message)| message))
        .execute(ctx.conn())
        .await?;
        if refused.is_some() {
            ctx.touch(Topic::Event(event));
        }
        result.push(Replayed {
            id,
            done_now: true,
            error: refused.map(|(code, _)| code),
        });
    }
    Ok(result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct FailedAction {
    #[serde(rename = "_id")]
    id: Uuid,
    name: String,
    label: String,
    error: String,
    error_message: String,
    #[serde(with = "ms")]
    done_at: DateTime<Utc>,
    /// Who did it on the device
    user_name: Option<String>,
    #[serde(with = "ms_opt")]
    resolved_at: Option<DateTime<Utc>>,
}

/// Offline actions the backend refused, open ones first. Event team only.
async fn get_failed_actions(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<FailedAction>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_as(
        "SELECT a.id, a.name, a.label, a.error, COALESCE(a.error_message, a.error) AS error_message,
                a.done_at, u.name AS user_name, a.resolved_at
         FROM offline_actions a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.event_id = $1 AND a.error IS NOT NULL
         ORDER BY a.resolved_at IS NOT NULL, a.done_at",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ActionArgs {
    action_id: Id,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// The team settled a refused offline action by hand.
async fn resolve_failed_action(ctx: &mut Ctx, args: ActionArgs) -> AppResult<Success> {
    let user = ctx.require_user()?;
    let event: Uuid = sqlx::query_scalar(
        "SELECT event_id FROM offline_actions WHERE id = $1 AND error IS NOT NULL",
    )
    .bind(args.action_id.0)
    .fetch_optional(ctx.conn())
    .await?
    .ok_or_else(|| AppError::not_found("notFound.content"))?;
    require_team(ctx, event).await?;
    sqlx::query(
        "UPDATE offline_actions SET resolved_at = now(), resolved_by = $2
         WHERE id = $1 AND resolved_at IS NULL",
    )
    .bind(args.action_id.0)
    .bind(user)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    Ok(Success { success: true })
}

// --- the time-based code of the ID QR code

/// Seconds a code is valid for; the app shows the next one in time.
pub const TOTP_STEP_SECONDS: i64 = 30;
/// Codes before and after the current one that still count: clocks of phones differ.
pub const TOTP_WINDOW: i64 = 2;
const TOTP_DIGITS: u32 = 8;

/// The code of `secret` for time step `counter` (RFC 4226 dynamic truncation).
pub fn totp(secret: &[u8], counter: u64) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC takes keys of any length");
    mac.update(&counter.to_be_bytes());
    let hash = mac.finalize().into_bytes();
    let offset = (hash[hash.len() - 1] & 0x0f) as usize;
    let binary = u32::from_be_bytes([
        hash[offset] & 0x7f,
        hash[offset + 1],
        hash[offset + 2],
        hash[offset + 3],
    ]);
    format!(
        "{:0width$}",
        binary % 10u32.pow(TOTP_DIGITS),
        width = TOTP_DIGITS as usize
    )
}

/// Whether `code` is the code of `secret` now, give or take TOTP_WINDOW steps.
pub fn totp_matches(secret: &[u8], code: &str, now: DateTime<Utc>) -> bool {
    let step = now.timestamp() / TOTP_STEP_SECONDS;
    (step - TOTP_WINDOW..=step + TOTP_WINDOW)
        .filter(|counter| *counter >= 0)
        .any(|counter| totp(secret, counter as u64) == code)
}

/// The user's key, made on first use.
async fn check_in_secret(ctx: &mut Ctx, user: Uuid) -> AppResult<Vec<u8>> {
    let fresh = rand::random::<[u8; 20]>().to_vec();
    Ok(sqlx::query_scalar(
        "UPDATE users SET check_in_secret = COALESCE(check_in_secret, $2) WHERE id = $1
         RETURNING check_in_secret",
    )
    .bind(user)
    .bind(fresh)
    .fetch_one(ctx.conn())
    .await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckInSecret {
    user_id: Uuid,
    /// Base64url without padding
    secret: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// The own key, kept by the app so the ID QR code works offline.
async fn ensure_check_in_secret(ctx: &mut Ctx, _: NoArgs) -> AppResult<CheckInSecret> {
    let user = ctx.require_user()?;
    let secret = check_in_secret(ctx, user).await?;
    Ok(CheckInSecret {
        user_id: user,
        secret: URL_SAFE_NO_PAD.encode(secret),
    })
}

/// The keys of every seller of the event, for the team's devices to recognise ID QR
/// codes offline. A mutation: sellers who never opened their ID get their key now, so it
/// is the one their phone fetches later.
async fn get_check_in_secrets_for_event(
    ctx: &mut Ctx,
    args: EventArgs,
) -> AppResult<Vec<CheckInSecret>> {
    let event = args.event_id.0;
    require_team(ctx, event).await?;
    let sellers: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT user_id FROM event_roles WHERE event_id = $1 AND role = 'seller'",
    )
    .bind(event)
    .fetch_all(ctx.conn())
    .await?;
    let mut result = Vec::with_capacity(sellers.len());
    for seller in sellers {
        let secret = check_in_secret(ctx, seller).await?;
        result.push(CheckInSecret {
            user_id: seller,
            secret: URL_SAFE_NO_PAD.encode(secret),
        });
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_follow_rfc_6238_with_sha256() {
        // RFC 6238 appendix B, SHA-256 seed, T = 59 s → counter 1
        let seed = b"12345678901234567890123456789012";
        assert_eq!(totp(seed, 1), "46119246");
        assert_eq!(totp(seed, 1111111109 / 30), "68084774");
    }

    #[test]
    fn a_code_counts_for_a_minute_around_now() {
        let secret = b"geheim";
        let now = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
        let code = totp(secret, (now.timestamp() / TOTP_STEP_SECONDS) as u64);
        assert!(totp_matches(secret, &code, now));
        assert!(totp_matches(
            secret,
            &code,
            now + chrono::Duration::seconds(55)
        ));
        assert!(!totp_matches(
            secret,
            &code,
            now + chrono::Duration::seconds(120)
        ));
        assert!(!totp_matches(secret, "00000000", now));
    }
}
