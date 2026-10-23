//! Deleting accounts (#168). A deletion first only closes the account: the user can no
//! longer sign in, but may reactivate it for `ACCOUNT_DELETION_GRACE_DAYS`. Then (or right
//! away when asked) the account is anonymized: personal data and sign-ins go, the users
//! row stays as an empty placeholder, so sales, events, roles and the moderation log keep
//! their references. Settlements read the snapshots of sales and seller rows (#167).

use chrono::{DateTime, Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::access::require_admin;
use super::docs;
use super::event_seller::remove_seller_and_coorganizer_roles_for_user;
use super::notifications::{self, Area, Category, Content, T, format_euro};
use super::seller_records::keeps_seller_record;
use super::users::revoke_sessions;
use crate::AppState;
use crate::auth::banned_identities;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

pub const ANONYMIZE_JOB: &str = "users.anonymizeDueAccounts";
const ANONYMIZE_BATCH_SIZE: i64 = 20;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "users.getAccountDeletionInfo" => get_account_deletion_info);
    register!(registry, Mutation "users.deleteUserForAdmin" => delete_user_for_admin);
    register!(registry, InternalMutation "users.anonymizeDueAccounts" => anonymize_due_accounts);
}

fn conflict(code: &'static str) -> AppError {
    AppError::coded(axum::http::StatusCode::CONFLICT, code, &[])
}

/// Refuses deletions that would leave a bazaar or the platform without its owner:
/// organizers of bazaars that are not over, the last administrator, and organizers of past
/// bazaars who neither handed them over nor confirmed they exported the settlement.
async fn ensure_deletable(ctx: &mut Ctx, user: Uuid, settlement_exported: bool) -> AppResult<()> {
    let organizes_upcoming: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles r JOIN events e ON e.id = r.event_id
                        WHERE r.user_id = $1 AND r.role = 'organizer' AND e.end_date >= now())",
    )
    .bind(user)
    .fetch_one(ctx.conn())
    .await?;
    if organizes_upcoming {
        return Err(conflict("ACCOUNT_IS_ORGANIZER"));
    }
    let last_admin: bool = sqlx::query_scalar(
        "SELECT u.system_role = 'admin' AND NOT EXISTS (
           SELECT 1 FROM users o
           WHERE o.system_role = 'admin' AND o.id <> u.id AND o.anonymized_at IS NULL
             AND o.status IS DISTINCT FROM 'deleted' AND o.status IS DISTINCT FROM 'banned')
         FROM users u WHERE u.id = $1",
    )
    .bind(user)
    .fetch_optional(ctx.conn())
    .await?
    .unwrap_or(false);
    if last_admin {
        return Err(conflict("ACCOUNT_IS_LAST_ADMIN"));
    }
    if !settlement_exported && !past_organized_events(ctx, user).await?.is_empty() {
        return Err(conflict("ACCOUNT_ORGANIZES_PAST_EVENTS"));
    }
    Ok(())
}

/// Closes the account: checks, leaves the bazaars as seller and helper, ends the sessions.
/// The data stays until `anonymize`, so the user can reactivate the account.
pub async fn close_account(ctx: &mut Ctx, user: Uuid, settlement_exported: bool) -> AppResult<()> {
    ensure_deletable(ctx, user, settlement_exported).await?;
    remove_seller_and_coorganizer_roles_for_user(ctx, user).await?;
    sqlx::query(
        "UPDATE users SET deletion_requested_at = COALESCE(deletion_requested_at, now()),
           -- A ban stays visible until `anonymize` records the address
           status = CASE WHEN status = 'banned' THEN status ELSE 'deleted' END
         WHERE id = $1",
    )
    .bind(user)
    .execute(ctx.conn())
    .await?;
    // Reactivating confirms the address again
    sqlx::query("UPDATE auth_accounts SET email_verified = NULL WHERE user_id = $1")
        .bind(user)
        .execute(ctx.conn())
        .await?;
    revoke_sessions(ctx.conn(), user).await?;
    ctx.touch(Topic::User(user));
    ctx.touch(Topic::Admin);
    Ok(())
}

#[derive(sqlx::FromRow)]
struct OpenOffer {
    product_id: Uuid,
    amount: Decimal,
    status: String,
}

/// The buyer is gone: open and accepted offers end, the sellers are told.
async fn withdraw_offers(ctx: &mut Ctx, user: Uuid) -> AppResult<()> {
    let offers: Vec<OpenOffer> = sqlx::query_as(
        "WITH open AS (
           SELECT id, product_id, amount, status::text AS status FROM product_offers
           WHERE buyer_id = $1 AND status IN ('pending', 'accepted') FOR UPDATE)
         UPDATE product_offers o SET status = 'withdrawn', responded_at = now()
         FROM open WHERE o.id = open.id
         RETURNING open.product_id, open.amount, open.status",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for offer in offers {
        let Some(product) = docs::product(ctx.conn(), offer.product_id).await? else {
            continue;
        };
        ctx.touch(Topic::Product(product.id));
        ctx.touch(Topic::User(product.vendor_id));
        let (title, amount) = (product.title.clone(), format_euro(offer.amount));
        let accepted = offer.status == "accepted";
        let path = format!("/products/view/{}", product.id);
        notifications::notify_user(
            ctx,
            product.vendor_id,
            |t: T| Content {
                category: Some(Category::Offers),
                subject: t.t("offer.withdrawn.subject", &[("title", &title)]),
                heading: t.t("offer.withdrawn.heading", &[]),
                paragraphs: vec![t.t(
                    if accepted {
                        "offer.withdrawn.accepted"
                    } else {
                        "offer.withdrawn.pending"
                    },
                    &[("title", &title), ("amount", &amount)],
                )],
                link: t.link("offer.new.link", path.clone()),
                ..Content::default()
            },
            Some(Area::Products),
            Duration::zero(),
        )
        .await?;
    }
    // What the buyer wrote goes too; amount and status stay for the seller's overview
    sqlx::query("UPDATE product_offers SET message = NULL WHERE buyer_id = $1")
        .bind(user)
        .execute(ctx.conn())
        .await?;
    Ok(())
}

/// Items without a sale go, with their images, offers and questions. Sold items stay for
/// the deadlines of #169, and so do items of a bazaar that keeps a record of who offered
/// what (fixedSellerData).
async fn delete_unsold_products(ctx: &mut Ctx, user: Uuid) -> AppResult<()> {
    let candidates: Vec<(Uuid, Vec<Uuid>)> = sqlx::query_as(
        "SELECT p.id, COALESCE(array_agg(ep.event_id) FILTER (WHERE ep.event_id IS NOT NULL), '{}')
         FROM products p LEFT JOIN event_products ep ON ep.product_id = p.id
         WHERE p.vendor_id = $1
           AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.product_id = p.id)
         GROUP BY p.id",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    let mut recording = std::collections::HashMap::new();
    let mut deleted = Vec::new();
    for (product, events) in candidates {
        let mut on_record = false;
        for event in events {
            let keeps = match recording.get(&event) {
                Some(keeps) => *keeps,
                None => {
                    let keeps = docs::event(ctx.conn(), event)
                        .await?
                        .is_some_and(|event| keeps_seller_record(&event));
                    recording.insert(event, keeps);
                    keeps
                }
            };
            on_record |= keeps;
        }
        if !on_record {
            deleted.push(product);
        }
    }
    // The images are left to the cleanup of orphaned uploads
    sqlx::query("DELETE FROM products WHERE id = ANY($1)")
        .bind(&deleted)
        .execute(ctx.conn())
        .await?;
    for product in deleted {
        ctx.touch(Topic::Product(product));
    }
    Ok(())
}

/// Removes the personal data of the account for good. Idempotent.
pub async fn anonymize(ctx: &mut Ctx, user: Uuid) -> AppResult<()> {
    let row: Option<(Option<String>, Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT email, image, status::text FROM users
         WHERE id = $1 AND anonymized_at IS NULL FOR UPDATE",
    )
    .bind(user)
    .fetch_optional(ctx.conn())
    .await?;
    let Some((email, image, status)) = row else {
        return Ok(());
    };
    let email = email.map(|email| email.trim().to_lowercase());

    if status.as_deref() == Some("banned")
        && let Some(email) = &email
    {
        let config = ctx.state.config.clone();
        let until = Utc::now() + Duration::days(banned_identities::BAN_DAYS.into());
        banned_identities::ban(ctx.conn(), &config, email, until).await?;
    }

    // Settlements read the seller rows' snapshots from now on; rows with sales got one at
    // the sale, this only covers rows from before #167 that the backfill missed
    sqlx::query(
        "UPDATE event_sellers s
         SET seller_snapshot = jsonb_strip_nulls(jsonb_build_object(
           'name', u.name, 'firstName', u.first_name, 'lastName', u.last_name, 'street', u.street,
           'zipCode', u.zip_code, 'city', u.city, 'country', u.country, 'phone', u.phone,
           'email', COALESCE(u.email, u.contact_email),
           'takenAt', floor(extract(epoch FROM now()) * 1000)::bigint))
         FROM users u
         WHERE u.id = s.user_id AND s.user_id = $1 AND s.seller_snapshot IS NULL
           AND EXISTS (SELECT 1 FROM purchases pu
                       WHERE pu.event_id = s.event_id AND pu.seller_id = s.user_id)",
    )
    .bind(user)
    .execute(ctx.conn())
    .await?;
    withdraw_offers(ctx, user).await?;
    delete_unsold_products(ctx, user).await?;

    // Sign-ins (their codes go with the accounts), sessions and what only the user saw
    for table in [
        "auth_accounts",
        "sessions",
        "app_sign_in_codes",
        "unread_notices",
        "event_broadcast_recipients",
    ] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table} WHERE user_id = $1"
        )))
        .bind(user)
        .execute(ctx.conn())
        .await?;
    }
    sqlx::query("UPDATE reports SET reporter_email = NULL WHERE reporter_id = $1")
        .bind(user)
        .execute(ctx.conn())
        .await?;
    // Mails and other work still waiting for the user, e.g. starter items
    sqlx::query(
        "DELETE FROM jobs WHERE payload->>'userId' = $1::uuid::text
           OR ($2::text IS NOT NULL AND lower(payload->>'to') = $2)",
    )
    .bind(user)
    .bind(&email)
    .execute(ctx.conn())
    .await?;
    if let Some(email) = &email {
        sqlx::query("DELETE FROM auth_rate_limits WHERE identifier = $1 OR identifier = $2")
            .bind(email)
            .bind(format!("codeMail:{email}"))
            .execute(ctx.conn())
            .await?;
        sqlx::query("DELETE FROM e2e_auth_tokens WHERE lower(email) = $1")
            .bind(email)
            .execute(ctx.conn())
            .await?;
    }
    // A profile picture uploaded here (imported accounts); OAuth pictures are only links
    if let Some(file) = image
        .as_deref()
        .and_then(|url| url.rsplit_once("/api/files/"))
        .and_then(|(_, id)| Uuid::parse_str(id).ok())
    {
        crate::storage::delete_later(ctx.conn(), file).await?;
    }

    sqlx::query(
        "UPDATE users SET
           name = NULL, image = NULL, email = NULL, email_verified_at = NULL, phone = NULL,
           phone_verified_at = NULL, first_name = NULL, last_name = NULL, street = NULL,
           city = NULL, zip_code = NULL, country = NULL, verification_token = NULL,
           check_in_token = NULL, check_in_token_expires_at = NULL, contact_email = NULL,
           last_login_at = NULL, locale = NULL, notification_prefs = '{}',
           unsubscribe_token = replace(gen_random_uuid()::text, '-', ''),
           is_mail_confirmed = NULL, needs_onboarding = NULL, system_role = 'user',
           status = 'deleted', deletion_requested_at = COALESCE(deletion_requested_at, now()),
           anonymized_at = now()
         WHERE id = $1",
    )
    .bind(user)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(user));
    ctx.touch(Topic::Admin);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Helper {
    #[serde(rename = "_id")]
    id: Uuid,
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PastEvent {
    #[serde(rename = "_id")]
    id: Uuid,
    title: String,
    #[serde(with = "ms")]
    end_date: DateTime<Utc>,
    /// Helpers who could take the event over (eventRoles.transferOrganizer)
    co_organizers: Vec<Helper>,
}

async fn past_organized_events(ctx: &mut Ctx, user: Uuid) -> AppResult<Vec<PastEvent>> {
    let events: Vec<(Uuid, String, DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, title, end_date FROM events
         WHERE organizer_id = $1 AND end_date < now() ORDER BY end_date DESC",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    let mut result = Vec::new();
    for (id, title, end_date) in events {
        let co_organizers: Vec<(Uuid, Option<String>)> = sqlx::query_as(
            "SELECT u.id, u.name FROM event_roles r JOIN users u ON u.id = r.user_id
             WHERE r.event_id = $1 AND r.role = 'coorganizer' AND u.anonymized_at IS NULL
               AND u.status IS DISTINCT FROM 'deleted' AND u.status IS DISTINCT FROM 'banned'
             ORDER BY r.created_at",
        )
        .bind(id)
        .fetch_all(ctx.conn())
        .await?;
        result.push(PastEvent {
            id,
            title,
            end_date,
            co_organizers: co_organizers
                .into_iter()
                .map(|(id, name)| Helper { id, name })
                .collect(),
        });
    }
    Ok(result)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DeletionInfo {
    grace_days: i32,
    /// Past bazaars the user organizes; deleting asks to hand them over or to confirm
    /// that their settlements were exported
    past_organized_events: Vec<PastEvent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InfoArgs {
    /// Admins ask about another user
    user_id: Option<Id>,
}

/// What the deletion dialog has to tell the user before they delete their account.
async fn get_account_deletion_info(ctx: &mut Ctx, args: InfoArgs) -> AppResult<DeletionInfo> {
    let user = match args.user_id {
        Some(user) => {
            require_admin(ctx).await?;
            user.0
        }
        None => ctx.require_user()?,
    };
    ctx.read(Topic::User(user));
    ctx.read(Topic::Events);
    Ok(DeletionInfo {
        grace_days: ctx.state.config.account_deletion_grace_days,
        past_organized_events: past_organized_events(ctx, user).await?,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdminDeleteArgs {
    user_id: Id,
    #[serde(default)]
    settlement_exported: bool,
}

#[derive(Serialize)]
struct Done {
    ok: bool,
}

/// Admins delete an account for good when asked by email, or a walk-in seller when the
/// organizer passes on such a request. The same checks as for the user; no grace period.
async fn delete_user_for_admin(ctx: &mut Ctx, args: AdminDeleteArgs) -> AppResult<Done> {
    let admin = require_admin(ctx).await?;
    let user = args.user_id.0;
    if admin == user {
        return Err(AppError::bad_request("moderation.noDeleteSelf"));
    }
    if docs::user(ctx.conn(), user).await?.is_none() {
        return Err(AppError::not_found("notFound.user"));
    }
    close_account(ctx, user, args.settlement_exported).await?;
    anonymize(ctx, user).await?;
    Ok(Done { ok: true })
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct DueArgs {}

#[derive(Serialize)]
struct Anonymized {
    anonymized: i64,
    more: bool,
}

/// Anonymizes one batch of accounts whose grace period is over. `more`: run again.
async fn anonymize_due_accounts(ctx: &mut Ctx, _: DueArgs) -> AppResult<Anonymized> {
    let due: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM users
         WHERE deletion_requested_at < now() - make_interval(days => $1)
           AND anonymized_at IS NULL AND status = 'deleted'
         ORDER BY deletion_requested_at LIMIT $2",
    )
    .bind(ctx.state.config.account_deletion_grace_days)
    .bind(ANONYMIZE_BATCH_SIZE)
    .fetch_all(ctx.conn())
    .await?;
    for user in &due {
        anonymize(ctx, *user).await?;
    }
    Ok(Anonymized {
        anonymized: due.len() as i64,
        more: due.len() as i64 == ANONYMIZE_BATCH_SIZE,
    })
}

/// Daily cron: anonymizes the accounts batch by batch, each in its own transaction.
pub fn anonymize_job(state: AppState, _: Value) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        loop {
            let result = crate::rpc::call(&state, None, ANONYMIZE_JOB, json!({}))
                .await
                .map_err(|err| anyhow::anyhow!("{err}"))?;
            if result["more"] != Value::Bool(true) {
                return Ok(());
            }
        }
    }
    .boxed()
}
