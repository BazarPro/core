//! Seller numbers: every seller of an event gets a short running number (1, 2, …) for
//! labels, sorting items back after the bazaar and calling sellers at the pay-out.
//! Numbers are never reused within an event.

use serde::Deserialize;
use uuid::Uuid;

use super::docs::{self, Event, EventSeller};
use super::event_roles::require_team;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "sellerNumbers.assignMissingSellerNumbers" => assign_missing_seller_numbers);
    register!(registry, Query "sellerNumbers.getMySellerNumber" => get_my_seller_number);
}

/// The next number; the counter on the event remembers numbers of sellers who left.
pub async fn next_seller_number(ctx: &mut Ctx, event: Uuid) -> AppResult<i32> {
    let number: Option<i32> = sqlx::query_scalar(
        "UPDATE events SET last_seller_number = GREATEST(
           COALESCE(last_seller_number, 0),
           COALESCE((SELECT max(number) FROM event_sellers WHERE event_id = $1), 0)) + 1
         WHERE id = $1 RETURNING last_seller_number",
    )
    .bind(event)
    .fetch_optional(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    number.ok_or_else(|| AppError::not_found("notFound.event"))
}

/// The seller's row of the event with a number; created or numbered if missing.
pub async fn ensure_seller_row(ctx: &mut Ctx, event: &Event, user: Uuid) -> AppResult<EventSeller> {
    let row = docs::event_seller(ctx.conn(), event.id, user).await?;
    if let Some(row) = &row
        && row.number.is_some()
    {
        return Ok(row.clone());
    }
    let number = next_seller_number(ctx, event.id).await?;
    match row {
        Some(row) => {
            sqlx::query("UPDATE event_sellers SET number = $2 WHERE id = $1")
                .bind(row.id)
                .bind(number)
                .execute(ctx.conn())
                .await?;
        }
        None => {
            sqlx::query(
                "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
                   payout_received, number)
                 VALUES ($1, $2, 0, 0, 0, false, $3)",
            )
            .bind(event.id)
            .bind(user)
            .bind(number)
            .execute(ctx.conn())
            .await?;
        }
    }
    ctx.touch(Topic::User(user));
    Ok(docs::event_seller(ctx.conn(), event.id, user)
        .await?
        .expect("just written"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// Numbers for sellers from before numbers existed, in the order they joined; when the
/// event team opens the lists.
async fn assign_missing_seller_numbers(ctx: &mut Ctx, args: EventArgs) -> AppResult<i64> {
    require_team(ctx, args.event_id.0).await?;
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let without: Vec<Uuid> = sqlx::query_scalar(
        "SELECT r.user_id FROM event_roles r
         LEFT JOIN event_sellers s ON s.event_id = r.event_id AND s.user_id = r.user_id
         WHERE r.event_id = $1 AND r.role = 'seller' AND s.number IS NULL
         ORDER BY r.created_at",
    )
    .bind(event.id)
    .fetch_all(ctx.conn())
    .await?;
    for user in &without {
        ensure_seller_row(ctx, &event, *user).await?;
    }
    Ok(without.len() as i64)
}

async fn get_my_seller_number(ctx: &mut Ctx, args: EventArgs) -> AppResult<Option<i32>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    ctx.read(Topic::Event(args.event_id.0));
    ctx.read(Topic::User(user));
    Ok(
        sqlx::query_scalar("SELECT number FROM event_sellers WHERE event_id = $1 AND user_id = $2")
            .bind(args.event_id.0)
            .bind(user)
            .fetch_optional(ctx.conn())
            .await?
            .flatten(),
    )
}

/// Refuses when `adding` more items would exceed the event's limit per seller.
pub async fn assert_item_limit(
    ctx: &mut Ctx,
    event: &Event,
    vendor: Uuid,
    adding: i64,
) -> AppResult<()> {
    let Some(limit) = event.resolved_features().max_items_per_seller else {
        return Ok(());
    };
    if adding <= 0 {
        return Ok(());
    }
    let current: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2",
    )
    .bind(event.id)
    .bind(vendor)
    .fetch_one(ctx.conn())
    .await?;
    let limit = i64::from(limit);
    if current + adding > limit {
        let left = (limit - current).max(0).to_string();
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "seller.itemLimit",
            &[
                ("event", &event.title),
                ("limit", &limit.to_string()),
                ("left", &left),
            ],
        ));
    }
    Ok(())
}
