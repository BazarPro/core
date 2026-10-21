//! Seller reminders: the info mail the evening before the bazaar and the pickup reminder
//! after it.

use std::sync::LazyLock;

use chrono::{DateTime, Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use regex::Regex;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::berlin_time::{evening_before, format_range};
use super::docs::{self, Event};
use super::event_roles::load_vendors_with_calculations;
use super::events::is_event_approved;
use super::notifications::{self, Category, Content, T};
use crate::AppState;
use crate::error::AppResult;
use crate::mail::Detail;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub const DUE_JOB: &str = "reminders.sendDueReminders";
/// Pickup reminders only shortly after they are due, not for long-gone bazaars
const PICKUP_WINDOW_HOURS: i64 = 12;
/// A pickup can be days after the end, e.g. the next weekend
const PICKUP_LOOKBACK_HOURS: i64 = 7 * 24;
/// Lead time before a pickup that starts later than the bazaar ends
const PICKUP_LEAD_HOURS: i64 = 2;
/// Gap between two mails, so the SMTP server does not throttle
const SEND_GAP_MS: i64 = 1000;
const MAX_LISTED_ITEMS: usize = 10;
static PARAGRAPHS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\n\s*\n").unwrap());

pub fn register(registry: &mut Registry) {
    register!(registry, InternalMutation "reminders.findDueReminders" => find_due_reminders);
    register!(registry, InternalMutation "reminders.sendDayBeforeInfo" => send_day_before_info);
    register!(registry, InternalMutation "reminders.sendPickupReminder" => send_pickup_reminder);
}

/// When the pickup reminder goes out: at the end, or 2 hours before a pickup that starts
/// later (e.g. the next morning), so it does not arrive the evening before.
pub fn pickup_reminder_due(event: &Event) -> DateTime<Utc> {
    match event.seller_logistics.as_ref().and_then(|l| l.pickup_start) {
        Some(start) => event
            .end_date
            .max(start - Duration::hours(PICKUP_LEAD_HOURS)),
        None => event.end_date,
    }
}

/// Blocked or not (yet) approved bazaars send nothing.
fn sends_reminders(event: &Event) -> bool {
    event.moderation.is_none() && is_event_approved(event)
}

fn sent_for(event: &Event, kind: &str) -> Option<DateTime<Utc>> {
    let sent = event.reminders_sent.as_ref()?;
    if kind == "dayBefore" {
        sent.day_before
    } else {
        sent.pickup
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Due {
    day_before: Vec<Uuid>,
    pickup: Vec<Uuid>,
}

/// The bazaars whose reminders are due now.
async fn find_due_reminders(ctx: &mut Ctx, _: NoArgs) -> AppResult<Due> {
    let now = Utc::now();
    let starting = docs::events_where(
        ctx.conn(),
        "e.start_date > now() AND e.start_date <= now() + make_interval(hours => $1)",
        48i32,
    )
    .await?;
    let day_before = starting
        .into_iter()
        .filter(|e| {
            sends_reminders(e)
                && sent_for(e, "dayBefore") != Some(e.start_date)
                && now >= evening_before(e.start_date)
        })
        .map(|e| e.id)
        .collect();
    let ended = docs::events_where(
        ctx.conn(),
        "e.end_date <= now() AND e.end_date >= now() - make_interval(hours => $1)",
        PICKUP_LOOKBACK_HOURS as i32,
    )
    .await?;
    let pickup = ended
        .into_iter()
        .filter(|e| {
            let due = pickup_reminder_due(e);
            // Pickup already over: a reminder would only confuse
            let over = e
                .seller_logistics
                .as_ref()
                .and_then(|l| l.pickup_end)
                .is_some_and(|end| now >= end);
            sends_reminders(e)
                && sent_for(e, "pickup") != Some(e.end_date)
                && now >= due
                && now <= due + Duration::hours(PICKUP_WINDOW_HOURS)
                && !over
        })
        .map(|e| e.id)
        .collect();
    Ok(Due { day_before, pickup })
}

/// Hourly cron: each due bazaar's mails in their own transaction.
pub fn due_job(state: AppState, _: Value) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let call = |name: &'static str, args: Value| {
            let state = state.clone();
            async move {
                crate::rpc::call(&state, None, name, args)
                    .await
                    .map_err(|err| anyhow::anyhow!("{err}"))
            }
        };
        let due: Due =
            serde_json::from_value(call("reminders.findDueReminders", json!({})).await?)?;
        for event in due.day_before {
            call("reminders.sendDayBeforeInfo", json!({ "eventId": event })).await?;
        }
        for event in due.pickup {
            call("reminders.sendPickupReminder", json!({ "eventId": event })).await?;
        }
        Ok(())
    }
    .boxed()
}

fn note_paragraphs(event: &Event) -> Vec<String> {
    event
        .seller_logistics
        .as_ref()
        .and_then(|l| l.note.as_deref())
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(|note| {
            PARAGRAPHS
                .split(note)
                .map(|p| p.trim().to_owned())
                .collect()
        })
        .unwrap_or_default()
}

fn contact_paragraph(event: &Event, t: T) -> Vec<String> {
    let contact = event.contact_info.trim();
    if contact.is_empty() {
        Vec::new()
    } else {
        vec![t.t("reminder.contact", &[("contact", contact)])]
    }
}

fn range(t: T, start: Option<DateTime<Utc>>, end: Option<DateTime<Utc>>) -> Option<String> {
    start.map(|start| format_range(start, end, t.0))
}

/// The info mail on the evening before the bazaar.
pub fn day_before_info(
    event: &Event,
    item_count: i64,
    seller_number: Option<i32>,
    t: T,
) -> Content {
    let logistics = event.seller_logistics.clone().unwrap_or_default();
    let dropoff = range(t, logistics.dropoff_start, logistics.dropoff_end);
    let mut details = vec![
        Detail {
            label: t.t("reminder.bazaar", &[]),
            value: format_range(event.start_date, Some(event.end_date), t.0),
        },
        Detail {
            label: t.t("reminder.location", &[]),
            value: event.location.clone(),
        },
    ];
    if let Some(dropoff) = &dropoff {
        details.push(Detail {
            label: t.t("reminder.dropoff", &[]),
            value: dropoff.clone(),
        });
    }
    if let Some(number) = seller_number {
        details.push(Detail {
            label: t.t("reminder.yourNumber", &[]),
            value: number.to_string(),
        });
    }
    details.push(Detail {
        label: t.t("reminder.yourItems", &[]),
        value: item_count.to_string(),
    });
    let mut paragraphs = vec![t.count("reminder.dayBefore.items", item_count, &[])];
    if let Some(dropoff) = &dropoff {
        paragraphs.push(t.t("reminder.dayBefore.dropoff", &[("dropoff", dropoff)]));
    }
    paragraphs.push(t.t("reminder.dayBefore.digitalId", &[]));
    paragraphs.extend(note_paragraphs(event));
    paragraphs.extend(contact_paragraph(event, t));
    Content {
        subject: t.t("reminder.dayBefore.subject", &[("event", &event.title)]),
        heading: t.t("reminder.dayBefore.heading", &[("event", &event.title)]),
        paragraphs,
        details,
        link: t.link("reminder.dayBefore.link", "/my-products"),
        category: Some(Category::Reminders),
        footnote: None,
    }
}

/// The reminder after the bazaar to pick up unsold items and the money.
pub fn pickup_reminder(
    event: &Event,
    sold: i64,
    payout: Decimal,
    unsold: &[String],
    t: T,
) -> Content {
    let logistics = event.seller_logistics.clone().unwrap_or_default();
    let pickup = range(t, logistics.pickup_start, logistics.pickup_end);
    let mut listed = unsold
        .iter()
        .take(MAX_LISTED_ITEMS)
        .cloned()
        .collect::<Vec<_>>()
        .join(", ");
    if unsold.len() > MAX_LISTED_ITEMS {
        listed.push_str(&t.count(
            "reminder.pickup.more",
            (unsold.len() - MAX_LISTED_ITEMS) as i64,
            &[],
        ));
    }
    let euro = notifications::format_euro(payout.abs());
    let mut paragraphs = vec![t.count("reminder.pickup.over", sold, &[("event", &event.title)])];
    if !unsold.is_empty() {
        paragraphs.push(t.t("reminder.pickup.toPickUp", &[("items", &listed)]));
    }
    paragraphs.push(match &pickup {
        Some(pickup) => t.t(
            "reminder.pickup.when",
            &[("pickup", pickup), ("location", &event.location)],
        ),
        None => t.t("reminder.pickup.where", &[("location", &event.location)]),
    });
    paragraphs.extend(note_paragraphs(event));
    paragraphs.extend(contact_paragraph(event, t));
    Content {
        subject: t.t("reminder.pickup.subject", &[("event", &event.title)]),
        heading: t.t("reminder.pickup.heading", &[]),
        paragraphs,
        details: vec![
            Detail {
                label: t.t("reminder.pickup.sold", &[]),
                value: t.count("common.items", sold, &[]),
            },
            Detail {
                label: t.t(
                    if payout < Decimal::ZERO {
                        "reminder.pickup.feeDue"
                    } else {
                        "reminder.pickup.payout"
                    },
                    &[],
                ),
                value: euro,
            },
            Detail {
                label: t.t("reminder.pickup.unsold", &[]),
                value: t.count("common.items", unsold.len() as i64, &[]),
            },
        ],
        link: t.link("reminder.pickup.link", "/my-sales"),
        category: Some(Category::Reminders),
        footnote: None,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// Items of the event per seller: (seller, status, title).
async fn items(ctx: &mut Ctx, event: Uuid) -> sqlx::Result<Vec<(Uuid, String, String)>> {
    sqlx::query_as(
        "SELECT p.vendor_id, ep.status::text, p.title FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 ORDER BY ep.created_at, ep.id",
    )
    .bind(event)
    .fetch_all(ctx.conn())
    .await
}

/// Evening before: everything sellers need, only to those with registered items; once
/// per start date (a moved bazaar gets it again).
async fn send_day_before_info(ctx: &mut Ctx, args: EventArgs) -> AppResult<i64> {
    let Some(event) = docs::event(ctx.conn(), args.event_id.0).await? else {
        return Ok(0);
    };
    if sent_for(&event, "dayBefore") == Some(event.start_date) {
        return Ok(0);
    }
    sqlx::query("UPDATE events SET reminder_day_before_sent_for = start_date WHERE id = $1")
        .bind(event.id)
        .execute(ctx.conn())
        .await?;
    let items = items(ctx, event.id).await?;
    let sellers: Vec<Uuid> = sqlx::query_scalar("SELECT user_id FROM event_roles WHERE event_id = $1 AND role = 'seller' ORDER BY created_at")
        .bind(event.id)
        .fetch_all(ctx.conn())
        .await?;
    let mut sent = 0;
    for seller in sellers {
        let count = items
            .iter()
            .filter(|(s, status, _)| {
                *s == seller && (status == "announced" || status == "available")
            })
            .count() as i64;
        if count == 0 {
            continue;
        }
        let number = docs::event_seller(ctx.conn(), event.id, seller)
            .await?
            .and_then(|row| row.number);
        notifications::notify_user(
            ctx,
            seller,
            |t: T| day_before_info(&event, count, number, t),
            None,
            Duration::milliseconds(sent * SEND_GAP_MS),
        )
        .await?;
        sent += 1;
    }
    Ok(sent)
}

/// After the end: sellers not yet paid out who handed something in pick up their unsold
/// items and money; once per end date.
async fn send_pickup_reminder(ctx: &mut Ctx, args: EventArgs) -> AppResult<i64> {
    let Some(event) = docs::event(ctx.conn(), args.event_id.0).await? else {
        return Ok(0);
    };
    if sent_for(&event, "pickup") == Some(event.end_date) {
        return Ok(0);
    }
    sqlx::query("UPDATE events SET reminder_pickup_sent_for = end_date WHERE id = $1")
        .bind(event.id)
        .execute(ctx.conn())
        .await?;
    let items = items(ctx, event.id).await?;
    let mut sent = 0;
    for vendor in load_vendors_with_calculations(ctx, event.id).await? {
        if vendor.paid {
            continue;
        }
        let own: Vec<&(Uuid, String, String)> = items
            .iter()
            .filter(|(s, ..)| *s == vendor.user.id)
            .collect();
        // Never handed anything in: nothing to pick up
        if !own.iter().any(|(_, status, _)| status != "announced") {
            continue;
        }
        let sold = own.iter().filter(|(_, status, _)| status == "sold").count() as i64;
        let unsold: Vec<String> = own
            .iter()
            .filter(|(_, status, _)| status == "available")
            .map(|(.., title)| title.clone())
            .collect();
        notifications::notify_user(
            ctx,
            vendor.user.id,
            |t: T| pickup_reminder(&event, sold, vendor.payout, &unsold, t),
            None,
            Duration::milliseconds(sent * SEND_GAP_MS),
        )
        .await?;
        sent += 1;
    }
    Ok(sent)
}
