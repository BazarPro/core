//! Deadlines of the deletion concept (#169). A daily cron moves every bazaar through
//! phases by its end date; everything else hangs on the bazaar:
//!
//! - Settlement (`sales::SETTLEMENT_DAYS`): the bazaar leaves the lists and its items are no
//!   longer public; the sellers still see theirs.
//! - Public archive (until `event_public_days`): sold items are deleted with their images,
//!   questions and offers; the sale keeps what the settlement needs (#167). The record of
//!   accepted items goes, unless the bazaar keeps one (fixedSellerData: until the end of
//!   its year plus `seller_record_years`). The page of the bazaar stays public.
//! - Internal archive (until the end of its year plus `records_years`): only the team sees
//!   the bazaar; images, texts, messages and storage locations are deleted. Settlement and
//!   export stay.
//! - Then sales, sellers, roles and the bazaar itself are deleted.
//!
//! Besides: deleted accounts are anonymized (#168), walk-in sellers lose their contact,
//! contact messages, reports, the moderation log and expired sign-ins are cleaned up.
//!
//! Every step works in batches, each in its own transaction, and is idempotent. When a
//! step had a full batch, the job schedules itself again right away.

use chrono::{Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use super::account_deletion::{self, ANONYMIZE_STEP};
use super::docs::Event;
use super::sales::SETTLEMENT_DAYS;
use crate::AppState;
use crate::config::Retention;
use crate::error::AppResult;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};

pub const RUN_JOB: &str = "retention.run";
const DEFAULT_BATCH_SIZE: i64 = 20;

/// The steps of the cron, in this order.
const STEPS: [&str; 7] = [
    ANONYMIZE_STEP,
    "retention.purgeSoldItems",
    "retention.purgeEventContent",
    "retention.reduceSellerRecords",
    "retention.clearWalkInContacts",
    "retention.deleteExpiredEvents",
    "retention.cleanUpOldData",
];

pub fn register(registry: &mut Registry) {
    register!(registry, InternalMutation "retention.purgeSoldItems" => purge_sold_items);
    register!(registry, InternalMutation "retention.purgeEventContent" => purge_event_content);
    register!(registry, InternalMutation "retention.reduceSellerRecords" => reduce_seller_records);
    register!(registry, InternalMutation "retention.clearWalkInContacts" => clear_walk_in_contacts);
    register!(registry, InternalMutation "retention.deleteExpiredEvents" => delete_expired_events);
    register!(registry, InternalMutation "retention.cleanUpOldData" => clean_up_old_data);
}

/// The page of the bazaar is only for its team and admins: the public archive is over.
pub fn is_archived(retention: &Retention, event: &Event) -> bool {
    event.end_date + Duration::days(retention.event_public_days.into()) < Utc::now()
}

/// SQL: the bazaar `e` ended in a year that is over for `$1` more years (in Berlin).
const YEARS_AFTER_ITS_YEAR: &str = "(now() AT TIME ZONE 'Europe/Berlin')::date
    >= make_date(extract(year FROM e.end_date AT TIME ZONE 'Europe/Berlin')::int + 1 + $1, 1, 1)";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BatchArgs {
    batch_size: Option<i64>,
}

impl BatchArgs {
    fn size(&self) -> i64 {
        self.batch_size.unwrap_or(DEFAULT_BATCH_SIZE).clamp(1, 1000)
    }
}

#[derive(Serialize)]
struct Done {
    done: i64,
    /// The batch was full: run again
    more: bool,
}

impl Done {
    fn of(done: usize, batch: i64) -> Self {
        Self {
            done: done as i64,
            more: done as i64 >= batch,
        }
    }
}

/// Files no row references any more go after the commit.
async fn delete_files(ctx: &mut Ctx, files: Vec<Uuid>) -> AppResult<()> {
    for file in files {
        crate::storage::delete_later(ctx.conn(), file).await?;
    }
    Ok(())
}

/// Settlement over: sold items go with their images, questions and offers; the sales keep
/// title, category and seller (#167). So do the questions and offers of returned items,
/// and the record of accepted items unless the bazaar keeps one (fixedSellerData).
async fn purge_sold_items(ctx: &mut Ctx, args: BatchArgs) -> AppResult<Done> {
    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM events
         WHERE products_purged_at IS NULL AND end_date < now() - make_interval(days => $1)
         ORDER BY end_date LIMIT $2",
    )
    .bind(SETTLEMENT_DAYS as i32)
    .bind(args.size())
    .fetch_all(ctx.conn())
    .await?;
    for &event in &events {
        let files: Vec<Uuid> = sqlx::query_scalar(
            "SELECT i.file_id FROM product_images i
             JOIN purchases pu ON pu.product_id = i.product_id WHERE pu.event_id = $1",
        )
        .bind(event)
        .fetch_all(ctx.conn())
        .await?;
        // Relations, images, offers and questions go with the product (foreign keys)
        let deleted: Vec<(Uuid, Uuid)> = sqlx::query_as(
            "DELETE FROM products p USING purchases pu
             WHERE pu.product_id = p.id AND pu.event_id = $1
             RETURNING p.id, p.vendor_id",
        )
        .bind(event)
        .fetch_all(ctx.conn())
        .await?;
        for table in ["product_questions", "product_offers"] {
            sqlx::query(sqlx::AssertSqlSafe(format!(
                "DELETE FROM {table} WHERE event_id = $1"
            )))
            .bind(event)
            .execute(ctx.conn())
            .await?;
        }
        // Who offered what is only kept by bazaars with fixedSellerData
        sqlx::query(
            "DELETE FROM offer_records r USING events e
             WHERE e.id = r.event_id AND e.id = $1
               AND NOT COALESCE((e.features->>'fixedSellerData')::boolean, false)",
        )
        .bind(event)
        .execute(ctx.conn())
        .await?;
        sqlx::query("UPDATE events SET products_purged_at = now() WHERE id = $1")
            .bind(event)
            .execute(ctx.conn())
            .await?;
        delete_files(ctx, files).await?;
        for (product, vendor) in deleted {
            ctx.touch(Topic::Product(product));
            ctx.touch(Topic::User(vendor));
        }
        ctx.touch(Topic::Event(event));
    }
    Ok(Done::of(events.len(), args.size()))
}

/// Public archive over: the bazaar keeps title, dates, place and fees for the settlement;
/// cover, map, description, logistics note, messages, storage locations and internal notes
/// go. From now on only the team sees it (`is_archived`).
async fn purge_event_content(ctx: &mut Ctx, args: BatchArgs) -> AppResult<Done> {
    let events: Vec<(Uuid, Option<Uuid>, Option<Uuid>)> = sqlx::query_as(
        "UPDATE events SET cover_image_id = NULL, map_image_id = NULL, description = '',
           logistics_note = NULL, content_purged_at = now()
         FROM (SELECT id, cover_image_id, map_image_id FROM events
               WHERE content_purged_at IS NULL AND end_date < now() - make_interval(days => $1)
               ORDER BY end_date LIMIT $2 FOR UPDATE) old
         WHERE events.id = old.id
         RETURNING old.id, old.cover_image_id, old.map_image_id",
    )
    .bind(ctx.state.config.retention.event_public_days)
    .bind(args.size())
    .fetch_all(ctx.conn())
    .await?;
    let ids: Vec<Uuid> = events.iter().map(|(id, ..)| *id).collect();
    for table in [
        "event_broadcasts",
        "event_location_categories",
        "unread_notices",
    ] {
        sqlx::query(sqlx::AssertSqlSafe(format!(
            "DELETE FROM {table} WHERE event_id = ANY($1)"
        )))
        .bind(&ids)
        .execute(ctx.conn())
        .await?;
    }
    sqlx::query("UPDATE event_products SET internal_note = NULL WHERE event_id = ANY($1)")
        .bind(&ids)
        .execute(ctx.conn())
        .await?;
    let files = events
        .iter()
        .flat_map(|(_, cover, map)| [*cover, *map])
        .flatten()
        .collect();
    delete_files(ctx, files).await?;
    for id in &ids {
        ctx.touch(Topic::Event(*id));
    }
    if !ids.is_empty() {
        ctx.touch(Topic::Events);
    }
    Ok(Done::of(ids.len(), args.size()))
}

/// Bazaars with fixedSellerData: the record of who offered what is kept for the claims of
/// buyers (§ 195 BGB); then the recorded items go and the sellers' recorded details shrink
/// to their name (the number is in the row).
async fn reduce_seller_records(ctx: &mut Ctx, args: BatchArgs) -> AppResult<Done> {
    // Rows, not bazaars: a batch of bazaars could be thousands of sellers and items
    let batch = args.size() * 50;
    let years = ctx.state.config.retention.seller_record_years;
    let items = sqlx::query(sqlx::AssertSqlSafe(format!(
        "DELETE FROM offer_records WHERE id IN (
           SELECT r.id FROM offer_records r JOIN events e ON e.id = r.event_id
           WHERE {YEARS_AFTER_ITS_YEAR} LIMIT $2)"
    )))
    .bind(years)
    .bind(batch)
    .execute(ctx.conn())
    .await?
    .rows_affected();
    let sellers = sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE event_sellers SET seller_snapshot = seller_snapshot
           - ARRAY['street', 'zipCode', 'city', 'country', 'phone', 'email']
         WHERE id IN (
           SELECT s.id FROM event_sellers s JOIN events e ON e.id = s.event_id
           WHERE (e.features->>'fixedSellerData')::boolean
             AND s.seller_snapshot ?| ARRAY['street', 'zipCode', 'city', 'country', 'phone', 'email']
             AND {YEARS_AFTER_ITS_YEAR}
           LIMIT $2)"
    )))
    .bind(years)
    .bind(batch)
    .execute(ctx.conn())
    .await?
    .rows_affected();
    Ok(Done::of(items.max(sellers) as usize, batch))
}

/// Walk-in sellers gave an address and phone only to be told about their items; both go
/// some time after their last bazaar. Name and address stay with the seller rows.
async fn clear_walk_in_contacts(ctx: &mut Ctx, args: BatchArgs) -> AppResult<Done> {
    let cleared: Vec<Uuid> = sqlx::query_scalar(
        "UPDATE users SET contact_email = NULL, phone = NULL
         WHERE id IN (
           SELECT u.id FROM users u
           WHERE u.managed_by_event_id IS NOT NULL
             AND (u.contact_email IS NOT NULL OR u.phone IS NOT NULL)
             AND NOT EXISTS (
               SELECT 1 FROM events e
               WHERE e.end_date >= now() - make_interval(days => $1)
                 AND (e.id = u.managed_by_event_id
                      OR e.id IN (SELECT event_id FROM event_sellers WHERE user_id = u.id)))
           LIMIT $2)
         RETURNING id",
    )
    .bind(ctx.state.config.retention.walk_in_contact_days)
    .bind(args.size() * 50)
    .fetch_all(ctx.conn())
    .await?;
    for user in &cleared {
        ctx.touch(Topic::User(*user));
    }
    Ok(Done::of(cleared.len(), args.size() * 50))
}

/// The retention period of the books is over (§ 147 AO): sales, sellers, roles and the
/// bazaar go. Its walk-in sellers are anonymized; items the sellers got back stay theirs.
async fn delete_expired_events(ctx: &mut Ctx, args: BatchArgs) -> AppResult<Done> {
    let events: Vec<(Uuid, Option<Uuid>, Option<Uuid>)> =
        sqlx::query_as(sqlx::AssertSqlSafe(format!(
            "SELECT e.id, e.cover_image_id, e.map_image_id FROM events e
             WHERE {YEARS_AFTER_ITS_YEAR} ORDER BY e.end_date LIMIT $2"
        )))
        .bind(ctx.state.config.retention.records_years)
        .bind(args.size())
        .fetch_all(ctx.conn())
        .await?;
    for &(event, cover, map) in &events {
        let walk_ins: Vec<Uuid> =
            sqlx::query_scalar("SELECT id FROM users WHERE managed_by_event_id = $1")
                .bind(event)
                .fetch_all(ctx.conn())
                .await?;
        sqlx::query("DELETE FROM purchases WHERE event_id = $1")
            .bind(event)
            .execute(ctx.conn())
            .await?;
        // Sellers, roles, relations, offers, questions and messages go with it
        sqlx::query("DELETE FROM events WHERE id = $1")
            .bind(event)
            .execute(ctx.conn())
            .await?;
        for user in walk_ins {
            account_deletion::anonymize(ctx, user).await?;
        }
        delete_files(ctx, cover.into_iter().chain(map).collect()).await?;
        ctx.touch(Topic::Event(event));
    }
    if !events.is_empty() {
        ctx.touch(Topic::Events);
    }
    Ok(Done::of(events.len(), args.size()))
}

/// Data without a bazaar: contact messages, reporters of resolved reports, the moderation
/// log, banned addresses, expired sessions and codes, jobs that gave up.
async fn clean_up_old_data(ctx: &mut Ctx, _: BatchArgs) -> AppResult<Done> {
    let retention = ctx.state.config.retention.clone();
    let statements: [(&str, Option<i32>); 10] = [
        (
            "DELETE FROM contact_messages
             WHERE COALESCE(handled_at + make_interval(days => $1),
                            created_at + make_interval(days => 2 * $1)) < now()",
            Some(retention.contact_message_days),
        ),
        (
            "UPDATE reports SET reporter_email = NULL, reporter_id = NULL, details = ''
             WHERE resolved_at < now() - make_interval(days => $1)
               AND (reporter_email IS NOT NULL OR reporter_id IS NOT NULL OR details <> '')",
            Some(retention.report_days),
        ),
        (
            "DELETE FROM moderation_log WHERE created_at < now() - make_interval(days => $1)",
            Some(retention.moderation_log_days),
        ),
        (
            "DELETE FROM banned_identities WHERE expires_at < now()",
            None,
        ),
        ("DELETE FROM sessions WHERE expires_at < now()", None),
        (
            "DELETE FROM verification_codes WHERE expires_at < now()",
            None,
        ),
        (
            "DELETE FROM app_sign_in_codes WHERE expires_at < now()",
            None,
        ),
        // Refilled long ago
        (
            "DELETE FROM auth_rate_limits WHERE last_attempt_at < now() - interval '1 day'",
            None,
        ),
        (
            "DELETE FROM e2e_auth_tokens WHERE created_at < now() - interval '1 day'",
            None,
        ),
        // Kept for inspection, see jobs::run_next
        (
            "DELETE FROM jobs WHERE run_at = 'infinity' AND created_at < now() - interval '30 days'",
            None,
        ),
    ];
    let mut done = 0;
    for (sql, days) in statements {
        let mut query = sqlx::query(sql);
        if let Some(days) = days {
            query = query.bind(days);
        }
        done += query.execute(ctx.conn()).await?.rows_affected();
    }
    ctx.touch(Topic::Admin);
    Ok(Done {
        done: done as i64,
        more: false,
    })
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct JobArgs {
    batch_size: Option<i64>,
}

/// Daily cron: runs every step once, each in its own transaction. A step with a full
/// batch schedules the job again right away.
pub fn run_job(state: AppState, payload: Value) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let args: JobArgs = serde_json::from_value(payload).unwrap_or_default();
        let mut more = false;
        for step in STEPS {
            let step_args = if step == ANONYMIZE_STEP {
                json!({})
            } else {
                json!({ "batchSize": args.batch_size })
            };
            let result = crate::rpc::call(&state, None, step, step_args)
                .await
                .map_err(|err| anyhow::anyhow!("{step}: {err}"))?;
            more |= result["more"] == Value::Bool(true);
        }
        if more {
            let mut conn = state.db.acquire().await?;
            crate::jobs::enqueue(
                &mut conn,
                RUN_JOB,
                &json!({ "batchSize": args.batch_size }),
                Utc::now(),
            )
            .await?;
        }
        Ok(())
    }
    .boxed()
}
