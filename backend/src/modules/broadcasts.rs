//! Messages of an organizer to the sellers of their bazaar (convex/broadcasts.ts).

use std::collections::BTreeMap;

use chrono::{DateTime, Duration, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use std::sync::LazyLock;
use uuid::Uuid;

use super::docs::{self, Event};
use super::event_roles::{Role, TEAM, has_any_role_or_admin, has_role, has_role_or_admin};
use super::notifications::{self, Area, Category, Content, T};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

/// Per bazaar and 24 hours, so sellers are not flooded
pub const MAX_BROADCASTS_PER_DAY: i64 = 5;
pub const MAX_IMPORTANT_PER_DAY: i64 = 1;
const MAX_SUBJECT: usize = 120;
const MAX_BODY: usize = 5000;
/// Gap between two mails of one broadcast, so the SMTP server does not throttle
const SEND_GAP_MS: i64 = 1000;
static PARAGRAPHS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n\s*\n").unwrap());

pub fn register(registry: &mut Registry) {
    register!(registry, Query "broadcasts.getBroadcastPreview" => get_broadcast_preview);
    register!(registry, Mutation "broadcasts.sendSellerBroadcast" => send_seller_broadcast);
    register!(registry, Query "broadcasts.getMyUnreadMessages" => get_my_unread_messages);
    register!(registry, Query "broadcasts.listEventBroadcasts" => list_event_broadcasts);
}

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
enum Audience {
    /// Every seller of the event
    All,
    /// Sellers with items taken in at the bazaar
    Accepted,
    /// Sellers with unsold items still to pick up
    Pickup,
}

impl Audience {
    fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Accepted => "accepted",
            Self::Pickup => "pickup",
        }
    }
}

async fn recipients(ctx: &mut Ctx, event: Uuid, audience: Audience) -> sqlx::Result<Vec<Uuid>> {
    let items = match audience {
        Audience::All => "true",
        Audience::Accepted => {
            "EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                     WHERE ep.event_id = r.event_id AND p.vendor_id = r.user_id AND ep.status <> 'announced')"
        }
        Audience::Pickup => {
            "EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                     WHERE ep.event_id = r.event_id AND p.vendor_id = r.user_id AND ep.status = 'available')"
        }
    };
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT r.user_id FROM event_roles r WHERE r.event_id = $1 AND r.role = 'seller' AND {items}
         ORDER BY r.created_at"
    )))
    .bind(event)
    .fetch_all(ctx.conn())
    .await
}

/// Helpers run the cash desk; writing to all sellers stays with the organizer.
async fn require_organizer(ctx: &mut Ctx, event: Uuid) -> AppResult<(Uuid, Event)> {
    let user = ctx.require_user()?;
    if !has_role_or_admin(ctx.conn(), event, user, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let event = docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    Ok((user, event))
}

/// Broadcasts of the event in the last 24 hours: (all, important).
async fn sent_today(ctx: &mut Ctx, event: Uuid) -> sqlx::Result<(i64, i64)> {
    sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE important) FROM event_broadcasts
         WHERE event_id = $1 AND created_at > now() - interval '1 day'",
    )
    .bind(event)
    .fetch_one(ctx.conn())
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreviewArgs {
    event_id: Id,
    audience: Audience,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Preview {
    recipients: usize,
    left: i64,
    important_left: i64,
}

/// For the send dialog: how many sellers get it and what is left of today's limit.
async fn get_broadcast_preview(ctx: &mut Ctx, args: PreviewArgs) -> AppResult<Preview> {
    require_organizer(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    let (all, important) = sent_today(ctx, args.event_id.0).await?;
    Ok(Preview {
        recipients: recipients(ctx, args.event_id.0, args.audience).await?.len(),
        left: (MAX_BROADCASTS_PER_DAY - all).max(0),
        important_left: (MAX_IMPORTANT_PER_DAY - important).max(0),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SendArgs {
    event_id: Id,
    subject: String,
    body: String,
    audience: Audience,
    important: bool,
}

/// Emails the organizer's message to the sellers, text only. "Important" messages ignore
/// the sellers' email settings.
async fn send_seller_broadcast(ctx: &mut Ctx, args: SendArgs) -> AppResult<usize> {
    let (user, event) = require_organizer(ctx, args.event_id.0).await?;
    let subject = args.subject.trim().to_owned();
    let body = args.body.trim().to_owned();
    if !(3..=MAX_SUBJECT).contains(&subject.chars().count()) {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "broadcast.subjectLength",
            &[("max", &MAX_SUBJECT.to_string())],
        ));
    }
    if !(10..=MAX_BODY).contains(&body.chars().count()) {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "broadcast.bodyLength",
            &[("max", &MAX_BODY.to_string())],
        ));
    }
    let (all, important) = sent_today(ctx, event.id).await?;
    if all >= MAX_BROADCASTS_PER_DAY {
        return Err(AppError::coded(
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            "broadcast.perDay",
            &[("max", &MAX_BROADCASTS_PER_DAY.to_string())],
        ));
    }
    if args.important && important >= MAX_IMPORTANT_PER_DAY {
        return Err(AppError::too_many_requests("broadcast.importantSent"));
    }
    let recipients = recipients(ctx, event.id, args.audience).await?;
    if recipients.is_empty() {
        return Err(AppError::bad_request("broadcast.noRecipients"));
    }
    let broadcast: Uuid = sqlx::query_scalar(
        "INSERT INTO event_broadcasts (event_id, sender_id, subject, body, audience, important)
         VALUES ($1, $2, $3, $4, $5::broadcast_audience, $6) RETURNING id",
    )
    .bind(event.id)
    .bind(user)
    .bind(&subject)
    .bind(&body)
    .bind(args.audience.as_str())
    .bind(args.important)
    .fetch_one(ctx.conn())
    .await?;
    sqlx::query("INSERT INTO event_broadcast_recipients (broadcast_id, user_id) SELECT $1, unnest($2::uuid[])")
        .bind(broadcast)
        .bind(&recipients)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(event.id));

    let paragraphs: Vec<String> = PARAGRAPHS
        .split(&body)
        .map(|p| p.trim().to_owned())
        .collect();
    let (title, path, important) = (
        event.title.clone(),
        format!("/public-events/{}", event.id),
        args.important,
    );
    for (index, recipient) in recipients.iter().enumerate() {
        add_message_notice(ctx, *recipient, event.id).await?;
        notifications::notify_user(
            ctx,
            *recipient,
            |t: T| {
                let mut all = vec![t.t("broadcast.intro", &[("event", &title)])];
                all.extend(paragraphs.iter().cloned());
                Content {
                    subject: if important {
                        t.t(
                            "broadcast.subjectImportant",
                            &[("subject", &subject), ("event", &title)],
                        )
                    } else {
                        t.t(
                            "broadcast.subject",
                            &[("subject", &subject), ("event", &title)],
                        )
                    },
                    heading: if important {
                        t.t("broadcast.headingImportant", &[("subject", &subject)])
                    } else {
                        subject.clone()
                    },
                    paragraphs: all,
                    link: t.link("broadcast.link", path.clone()),
                    category: (!important).then_some(Category::Organizer),
                    ..Content::default()
                }
            },
            None,
            Duration::milliseconds(index as i64 * SEND_GAP_MS),
        )
        .await?;
    }
    Ok(recipients.len())
}

/// Red marker on "Events" and the bazaar card, also for sellers who switched the emails
/// off. Walk-in sellers cannot log in and get none.
async fn add_message_notice(ctx: &mut Ctx, user: Uuid, event: Uuid) -> AppResult<()> {
    let can_see: Option<bool> = sqlx::query_scalar(
        "SELECT managed_by_event_id IS NULL AND status IS DISTINCT FROM 'deleted'
                AND status IS DISTINCT FROM 'banned'
         FROM users WHERE id = $1",
    )
    .bind(user)
    .fetch_optional(ctx.conn())
    .await?;
    if can_see == Some(true) {
        notifications::add_notice(ctx, user, Area::Messages, Some(event)).await?;
    }
    Ok(())
}

#[derive(Serialize)]
struct Unread {
    count: i64,
    /// Time of the oldest unread message; everything from then on is new
    #[serde(with = "ms")]
    since: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// Unread organizer messages of the current user per bazaar, for the bazaar cards.
async fn get_my_unread_messages(ctx: &mut Ctx, _: NoArgs) -> AppResult<BTreeMap<Uuid, Unread>> {
    let Some(user) = ctx.user else {
        return Ok(BTreeMap::new());
    };
    ctx.read(Topic::User(user));
    let rows: Vec<(Uuid, i64, DateTime<Utc>)> = sqlx::query_as(
        "SELECT event_id, count(*), min(created_at) FROM unread_notices
         WHERE user_id = $1 AND area = 'messages' AND event_id IS NOT NULL GROUP BY event_id",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    Ok(rows
        .into_iter()
        .map(|(event, count, since)| (event, Unread { count, since }))
        .collect())
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct BroadcastView {
    #[serde(rename = "_id")]
    id: Uuid,
    subject: String,
    body: String,
    important: bool,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    /// Only for the organizer team
    audience: Option<String>,
    recipient_count: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// The bazaar's messages, newest first: the team sees all with audience and recipient
/// count, a seller only the ones sent to them.
async fn list_event_broadcasts(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<BroadcastView>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    let event = args.event_id.0;
    ctx.read(Topic::Event(event));
    if has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await? {
        return Ok(sqlx::query_as(
            "SELECT b.id, b.subject, b.body, b.important, b.created_at, b.audience::text AS audience,
                    (SELECT count(*) FROM event_broadcast_recipients r WHERE r.broadcast_id = b.id) AS recipient_count
             FROM event_broadcasts b WHERE b.event_id = $1 ORDER BY b.created_at DESC LIMIT 50",
        )
        .bind(event)
        .fetch_all(ctx.conn())
        .await?);
    }
    if !has_role(ctx.conn(), event, user, Role::Seller).await? {
        return Ok(Vec::new());
    }
    Ok(sqlx::query_as(
        "SELECT * FROM (
           SELECT b.id, b.subject, b.body, b.important, b.created_at, NULL::text AS audience,
                  NULL::bigint AS recipient_count
           FROM event_broadcasts b WHERE b.event_id = $1 ORDER BY b.created_at DESC LIMIT 50
         ) latest
         WHERE EXISTS (SELECT 1 FROM event_broadcast_recipients r WHERE r.broadcast_id = latest.id AND r.user_id = $2)
         ORDER BY created_at DESC",
    )
    .bind(event)
    .bind(user)
    .fetch_all(ctx.conn())
    .await?)
}
