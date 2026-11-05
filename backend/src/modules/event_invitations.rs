//! Invitations by mail: the organizer names an address, the person gets a link with the
//! bazaar's details and joins with their own account as seller or helper.
//!
//! The answer never tells whether an address has an account. Only the account with the
//! invited address can use a link, so a forwarded mail does not make someone a helper.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::berlin_time::format_range;
use super::docs;
use super::event_roles::{self, Role};
use super::events::{EventDetails, details};
use super::instance::EMAIL_PATTERN;
use super::notifications::{self, Content, T};
use crate::auth::users::normalize_email;
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::mail::Detail;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

/// Per bazaar and 24 hours, also when taken back again: the mails go to strangers
pub const MAX_INVITATIONS_PER_DAY: i64 = 30;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventInvitations.send" => send);
    register!(registry, Mutation "eventInvitations.revoke" => revoke);
    register!(registry, Query "eventInvitations.listOpen" => list_open);
    register!(registry, Query "eventInvitations.getByToken" => get_by_token);
}

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.trim().as_bytes()).to_vec()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SendArgs {
    event_id: Id,
    email: String,
    helper: bool,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

async fn send(ctx: &mut Ctx, args: SendArgs) -> AppResult<Success> {
    let event_id = args.event_id.0;
    let viewer = ctx.require_user()?;
    if !event_roles::has_role_or_admin(ctx.conn(), event_id, viewer, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let event = docs::event(ctx.conn(), event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.moderation.is_some() {
        return Err(AppError::forbidden("event.blocked"));
    }
    if event.end_date < chrono::Utc::now() {
        return Err(AppError::bad_request("join.past"));
    }
    let email = normalize_email(&args.email);
    if !EMAIL_PATTERN.is_match(&email) {
        return Err(AppError::bad_request("invitation.invalidEmail"));
    }
    let sent: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM event_invitations
         WHERE event_id = $1 AND created_at > now() - interval '1 day'",
    )
    .bind(event_id)
    .fetch_one(ctx.conn())
    .await?;
    if sent >= MAX_INVITATIONS_PER_DAY {
        return Err(AppError::too_many_requests("invitation.limit"));
    }

    sqlx::query(
        "UPDATE event_invitations SET closed_at = now()
         WHERE event_id = $1 AND email = $2 AND closed_at IS NULL",
    )
    .bind(event_id)
    .bind(&email)
    .execute(ctx.conn())
    .await?;
    let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    sqlx::query(
        "INSERT INTO event_invitations (event_id, email, helper, invited_by, token_hash)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(event_id)
    .bind(&email)
    .bind(args.helper)
    .bind(viewer)
    .bind(token_hash(&token))
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event_id));

    let inviter = docs::user(ctx.conn(), viewer).await?;
    let inviter_name = inviter
        .as_ref()
        .and_then(|user| user.name.clone())
        .unwrap_or_default();
    let locale: Locale = sqlx::query_scalar("SELECT locale FROM users WHERE id = $1")
        .bind(viewer)
        .fetch_optional(ctx.conn())
        .await?
        .flatten()
        .unwrap_or_default();
    let path = format!("/invite/{token}");
    let when = format_range(event.start_date, Some(event.end_date), locale);
    let place = [
        Some(event.location.clone()).filter(|text| !text.is_empty()),
        event.city.clone(),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(", ");
    let title = event.title.clone();
    notifications::notify_address(ctx, email, locale, |t: T| {
        let values = [("event", title.as_str()), ("name", inviter_name.as_str())];
        let mut rows = vec![
            Detail {
                label: t.t("reminder.bazaar", &[]),
                value: title.clone(),
            },
            Detail {
                label: t.t("invitation.when", &[]),
                value: when.clone(),
            },
        ];
        if !place.is_empty() {
            rows.push(Detail {
                label: t.t("reminder.location", &[]),
                value: place.clone(),
            });
        }
        let role = if args.helper { "helper" } else { "seller" };
        Content {
            subject: t.t("invitation.subject", &values),
            heading: t.t("invitation.heading", &values),
            paragraphs: vec![
                t.t(&format!("invitation.{role}"), &values),
                t.t("invitation.next", &[]),
            ],
            details: rows,
            link: t.link("invitation.link", path.clone()),
            footnote: Some(t.t("invitation.footnote", &[])),
            category: None,
        }
    })
    .await?;
    Ok(Success { success: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevokeArgs {
    event_id: Id,
    invitation_id: Id,
}

async fn revoke(ctx: &mut Ctx, args: RevokeArgs) -> AppResult<Success> {
    let viewer = ctx.require_user()?;
    if !event_roles::has_role_or_admin(ctx.conn(), args.event_id.0, viewer, Role::Organizer).await?
    {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    sqlx::query(
        "UPDATE event_invitations SET closed_at = now()
         WHERE id = $1 AND event_id = $2 AND closed_at IS NULL",
    )
    .bind(args.invitation_id.0)
    .bind(args.event_id.0)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(args.event_id.0));
    Ok(Success { success: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenInvitation {
    #[serde(rename = "_id")]
    id: Uuid,
    email: String,
    helper: bool,
    #[serde(with = "ms")]
    sent_at: chrono::DateTime<chrono::Utc>,
}

async fn list_open(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<OpenInvitation>> {
    let viewer = ctx.require_user()?;
    if !event_roles::has_role_or_admin(ctx.conn(), args.event_id.0, viewer, Role::Organizer).await?
    {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    ctx.read(Topic::Event(args.event_id.0));
    let rows: Vec<(Uuid, String, bool, chrono::DateTime<chrono::Utc>)> = sqlx::query_as(
        "SELECT id, email, helper, created_at FROM event_invitations
         WHERE event_id = $1 AND closed_at IS NULL ORDER BY created_at DESC",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?;
    Ok(rows
        .into_iter()
        .map(|(id, email, helper, sent_at)| OpenInvitation {
            id,
            email,
            helper,
            sent_at,
        })
        .collect())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TokenArgs {
    token: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InvitationView {
    /// Whoever holds the link got it at this address
    email: String,
    helper: bool,
    event: EventDetails,
}

/// What the invited person sees; the link alone opens it, without an account yet. Also for
/// bazaars that visitors cannot see otherwise. Nothing once used, taken back or over.
async fn get_by_token(ctx: &mut Ctx, args: TokenArgs) -> AppResult<Option<InvitationView>> {
    let row: Option<(Uuid, String, bool)> = sqlx::query_as(
        "SELECT event_id, email, helper FROM event_invitations
         WHERE token_hash = $1 AND closed_at IS NULL",
    )
    .bind(token_hash(&args.token))
    .fetch_optional(ctx.conn())
    .await?;
    let Some((event_id, email, helper)) = row else {
        return Ok(None);
    };
    ctx.read(Topic::Event(event_id));
    let Some(event) = docs::event(ctx.conn(), event_id).await? else {
        return Ok(None);
    };
    if event.moderation.is_some() || event.end_date < chrono::Utc::now() {
        return Ok(None);
    }
    Ok(Some(InvitationView {
        email,
        helper,
        event: details(ctx, event, false).await?,
    }))
}

/// Whether the link fits this event and account; the answer is whether it makes a helper.
pub async fn check(ctx: &mut Ctx, event: Uuid, token: &str, user: Uuid) -> AppResult<bool> {
    let row: Option<(String, bool)> = sqlx::query_as(
        "SELECT email, helper FROM event_invitations
         WHERE token_hash = $1 AND event_id = $2 AND closed_at IS NULL",
    )
    .bind(token_hash(token))
    .bind(event)
    .fetch_optional(ctx.conn())
    .await?;
    let (email, helper) = row.ok_or_else(|| AppError::bad_request("invitation.invalid"))?;
    let account = docs::user(ctx.conn(), user)
        .await?
        .and_then(|user| user.email);
    if account.as_deref().map(normalize_email).as_deref() != Some(email.as_str()) {
        return Err(AppError::forbidden("invitation.otherAccount"));
    }
    Ok(helper)
}

/// After joining: the link is used up, and a helper invitation takes effect.
pub async fn redeem(
    ctx: &mut Ctx,
    event: Uuid,
    token: &str,
    user: Uuid,
    helper: bool,
) -> AppResult<()> {
    sqlx::query("UPDATE event_invitations SET closed_at = now() WHERE token_hash = $1")
        .bind(token_hash(token))
        .execute(ctx.conn())
        .await?;
    if helper && !event_roles::has_role(ctx.conn(), event, user, Role::Organizer).await? {
        event_roles::add_role(ctx, event, user, Role::Coorganizer).await?;
    }
    ctx.touch(Topic::Event(event));
    Ok(())
}

/// Used by the retention job: addresses of people who may never have answered.
pub const CLEAN_UP_SQL: &str = "DELETE FROM event_invitations i USING events e
     WHERE e.id = i.event_id AND (e.end_date < now() OR i.closed_at < now() - make_interval(days => $1))";
/// Closed rows only count for the daily limit
pub const CLOSED_DAYS: i32 = 2;
