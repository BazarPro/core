//! The organizer takes a seller out of the bazaar (#252), e.g. after trouble at the last
//! one. The excluded person cannot join again, neither with the access code nor with an
//! invitation, until the organizer takes the exclusion back.
//!
//! What happened at the bazaar stays: handed-in items go back in the normal return, sales
//! and the settlement remain. Only items that were merely announced leave the bazaar.
//! Sellers without an account (walk-in) cannot be excluded: the team manages them anyway.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::docs;
use super::event_roles::{self, Role};
use super::features::registration_unavailable;
use super::notifications::{self, Area, Content, T};
use super::offers::close_offers_for_event_product;
use crate::error::{AppError, AppResult};
use crate::mail::Detail;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

/// Longest reason for an exclusion told to the seller
pub const MAX_REASON_LENGTH: usize = 500;

/// The optional reason for an exclusion: trimmed, empty is none, refused with `code` when
/// longer than MAX_REASON_LENGTH.
fn normalize_reason(reason: Option<String>, code: &'static str) -> AppResult<Option<String>> {
    let reason = reason
        .map(|reason| reason.trim().to_owned())
        .filter(|reason| !reason.is_empty());
    if reason
        .as_ref()
        .is_some_and(|reason| reason.chars().count() > MAX_REASON_LENGTH)
    {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            code,
            &[("max", &MAX_REASON_LENGTH.to_string())],
        ));
    }
    Ok(reason)
}

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventExclusions.exclude" => exclude);
    register!(registry, Mutation "eventExclusions.readmit" => readmit);
    register!(registry, Query "eventExclusions.getMine" => get_mine);
}

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Exclusion {
    #[serde(with = "ms")]
    pub excluded_at: DateTime<Utc>,
    pub reason: Option<String>,
}

pub async fn exclusion(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
) -> sqlx::Result<Option<Exclusion>> {
    sqlx::query_as(
        "SELECT created_at AS excluded_at, reason FROM event_exclusions
         WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event)
    .bind(user)
    .fetch_optional(conn)
    .await
}

/// The excluded sellers of an event by user, for the seller list of the team.
pub async fn exclusions_of_event(
    conn: &mut PgConnection,
    event: Uuid,
) -> sqlx::Result<HashMap<Uuid, Exclusion>> {
    let rows: Vec<(Uuid, DateTime<Utc>, Option<String>)> = sqlx::query_as(
        "SELECT user_id, created_at, reason FROM event_exclusions WHERE event_id = $1",
    )
    .bind(event)
    .fetch_all(conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(user, excluded_at, reason)| {
            (
                user,
                Exclusion {
                    excluded_at,
                    reason,
                },
            )
        })
        .collect())
}

/// Refuses whoever the organizer excluded from the event.
pub async fn assert_not_excluded(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
) -> AppResult<()> {
    if exclusion(conn, event, user).await?.is_some() {
        return Err(AppError::forbidden("join.excluded"));
    }
    Ok(())
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// Organizer and administrators only: helpers may reject items, not people.
async fn organizer_event(ctx: &mut Ctx, event: Uuid) -> AppResult<docs::Event> {
    let viewer = ctx.require_user()?;
    if !event_roles::has_role_or_admin(ctx.conn(), event, viewer, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExcludeArgs {
    event_id: Id,
    user_id: Id,
    reason: Option<String>,
}

async fn exclude(ctx: &mut Ctx, args: ExcludeArgs) -> AppResult<Success> {
    let (event_id, user) = (args.event_id.0, args.user_id.0);
    let event = organizer_event(ctx, event_id).await?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("exclusion.past"));
    }
    if user == event.organizer_id {
        return Err(AppError::bad_request("exclusion.organizer"));
    }
    let seller = docs::user(ctx.conn(), user)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.user"))?;
    if seller.managed_by_event_id.is_some() {
        return Err(AppError::bad_request("exclusion.walkIn"));
    }
    let participates = event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await?
        || docs::event_seller(ctx.conn(), event.id, user)
            .await?
            .is_some();
    if !participates {
        return Err(AppError::bad_request("seller.notParticipant"));
    }
    let reason = normalize_reason(args.reason, "exclusion.reasonTooLong")?;
    let inserted = sqlx::query(
        "INSERT INTO event_exclusions (event_id, user_id, excluded_by, reason)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
    )
    .bind(event.id)
    .bind(user)
    .bind(ctx.user)
    .bind(&reason)
    .execute(ctx.conn())
    .await?;
    if inserted.rows_affected() == 0 {
        // Excluded before: nothing more to take away, no second mail
        return Ok(Success { success: true });
    }

    // Announced items leave the bazaar; their buyers learn that offers are void
    let announced: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        "SELECT ep.id, p.id, p.title FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'announced'",
    )
    .bind(event.id)
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for (relation, product, title) in &announced {
        close_offers_for_event_product(ctx, *relation, title, "removed").await?;
        sqlx::query("DELETE FROM event_products WHERE id = $1")
            .bind(relation)
            .execute(ctx.conn())
            .await?;
        ctx.touch(Topic::Product(*product));
    }
    let was_helper = event_roles::has_role(ctx.conn(), event.id, user, Role::Coorganizer).await?;
    if was_helper {
        event_roles::remove_role(ctx, event.id, user, Role::Coorganizer).await?;
        // Their devices may keep the keys of the sellers' ID codes
        super::offline::renew_check_in_keys(ctx, event.id).await?;
    }
    let handed_in = has_handed_in(ctx, event.id, user).await?;
    // The seller row stays with number and settlement, so the team still finds them. With
    // items handed in the role stays too: the ID code, the bazaar in the seller's list and
    // the return depend on it, and the exclusion alone keeps new items out.
    if !handed_in {
        event_roles::remove_role(ctx, event.id, user, Role::Seller).await?;
    }
    let (title, contact, path) = (
        event.title.clone(),
        event.contact_info.clone(),
        format!("/public-events/{}", event.id),
    );
    notifications::notify_user(
        ctx,
        user,
        |t: T| {
            let values = [("event", title.as_str())];
            let mut paragraphs = vec![t.t("participation.excluded.text", &values)];
            if let Some(reason) = &reason {
                paragraphs.push(t.t("moderation.reason", &[("reason", reason)]));
            }
            if handed_in {
                paragraphs.push(t.t("participation.excluded.handedIn", &[]));
            }
            Content {
                subject: t.t("participation.excluded.subject", &values),
                heading: t.t("participation.excluded.heading", &[]),
                paragraphs,
                details: contact_detail(t, &contact),
                link: t.link("participation.openEvent", path.clone()),
                ..Content::default()
            }
        },
        // "Organisieren" only concerns helpers; a seller learns it on the bazaar's page
        was_helper.then_some(Area::Events),
        Duration::zero(),
    )
    .await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(user));
    Ok(Success { success: true })
}

/// Whether the seller has items at the bazaar: handed in, sold or returned.
async fn has_handed_in(ctx: &mut Ctx, event: Uuid, user: Uuid) -> sqlx::Result<bool> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                        WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status IN {})",
        super::sales::ACCEPTED_STATUSES
    )))
    .bind(event)
    .bind(user)
    .fetch_one(ctx.conn())
    .await
}

/// The organizer's contact, for questions about the decision.
fn contact_detail(t: T, contact: &str) -> Vec<Detail> {
    let contact = contact.trim();
    if contact.is_empty() {
        return Vec::new();
    }
    vec![Detail {
        label: t.t("reminder.contact", &[]),
        value: contact.to_owned(),
    }]
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadmitArgs {
    event_id: Id,
    user_id: Id,
}

/// Takes the exclusion back: before the end the person is a seller again, with the same
/// number, if the bazaar still has a place for them. Items that left the bazaar have to be
/// announced anew. Without a seller row they may join again, if the registration is open.
async fn readmit(ctx: &mut Ctx, args: ReadmitArgs) -> AppResult<Success> {
    let (event_id, user) = (args.event_id.0, args.user_id.0);
    let event = organizer_event(ctx, event_id).await?;
    let now = Utc::now();
    let running = event.end_date >= now;
    let seller_row = docs::event_seller(ctx.conn(), event.id, user).await?;
    let returns = running
        && seller_row.is_some()
        && !event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await?;
    // The exclusion freed the place: someone else may have taken it meanwhile
    if returns && let Some(limit) = event.vendor_limit.filter(|limit| *limit > 0) {
        let sellers: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM event_roles WHERE event_id = $1 AND role = 'seller'",
        )
        .bind(event.id)
        .fetch_one(ctx.conn())
        .await?;
        if sellers >= i64::from(limit) {
            return Err(AppError::bad_request("exclusion.vendorLimit"));
        }
    }
    let removed = sqlx::query("DELETE FROM event_exclusions WHERE event_id = $1 AND user_id = $2")
        .bind(event.id)
        .bind(user)
        .execute(ctx.conn())
        .await?;
    if removed.rows_affected() == 0 {
        return Ok(Success { success: true });
    }
    if returns {
        event_roles::add_role(ctx, event.id, user, Role::Seller).await?;
    }
    if running {
        let text = if seller_row.is_some() {
            "participation.readmitted.text"
        } else if registration_unavailable(&event, now).is_some() {
            // Closed: only an invitation of the organizer lets them in
            "participation.readmitted.joinClosed"
        } else {
            "participation.readmitted.join"
        };
        let (title, path) = (event.title.clone(), format!("/public-events/{}", event.id));
        notifications::notify_user(
            ctx,
            user,
            |t: T| {
                let values = [("event", title.as_str())];
                Content {
                    subject: t.t("participation.readmitted.subject", &values),
                    heading: t.t("participation.readmitted.heading", &[]),
                    paragraphs: vec![t.t(text, &values)],
                    link: t.link("participation.openEvent", path.clone()),
                    ..Content::default()
                }
            },
            // No helper role comes back, so nothing for "Organisieren"
            None,
            Duration::zero(),
        )
        .await?;
    }
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(user));
    Ok(Success { success: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// Whether the organizer excluded the signed-in user, and why; for the bazaar's page.
async fn get_mine(ctx: &mut Ctx, args: EventArgs) -> AppResult<Option<Exclusion>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    ctx.read(Topic::User(user));
    Ok(exclusion(ctx.conn(), args.event_id.0, user).await?)
}
