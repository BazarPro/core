//! Sellers of an event: joining, leaving, payout.

use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::docs;
use super::event_roles::{self, Role, TEAM, has_any_role_or_admin};
use super::offers::close_offers_for_event_product;
use super::sales::intake_fee_for_seller;
use super::seller_numbers::next_seller_number;
use super::seller_records::{keeps_seller_record, missing_profile_fields};
use crate::auth::rate_limit;
use crate::error::{AppError, AppResult};
use crate::flags;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventSeller.joinEvent" => join_event);
    register!(registry, Mutation "eventSeller.removeSellerAndCoorganizerRoles" => remove_seller_and_coorganizer_roles);
    register!(registry, Query "eventSeller.isEventSellerForEvent" => is_event_seller_for_event);
    register!(registry, Mutation "eventSeller.checkAccessCode" => check_access_code);
    register!(registry, Mutation "eventSeller.markVendorPayoutReceived" => mark_vendor_payout_received);
    register!(registry, Mutation "eventSeller.settleVendor" => settle_vendor);
    register!(registry, Mutation "eventSeller.unmarkVendorPayoutReceived" => unmark_vendor_payout_received);
}

/// Whether the given code opens the event; without a code on the event anything does.
/// In demo mode the code "DEMO" opens every event.
async fn access_code_matches(
    ctx: &mut Ctx,
    event: &docs::Event,
    code: Option<&str>,
) -> AppResult<bool> {
    let required = event.access_code.as_deref().filter(|code| !code.is_empty());
    if required == code.filter(|code| !code.is_empty()) {
        return Ok(true);
    }
    Ok(code == Some("DEMO") && flags::get(ctx.conn(), "is_demo_mode", false).await?)
}

/// `access_code_matches` with the failed attempts of the user limited like sign-ins, so
/// codes cannot be guessed. A correct code does not reset the count: the code of an own
/// event would otherwise refill it. Recorded on the pool, the mutation may roll back.
async fn verify_access_code(
    ctx: &mut Ctx,
    event: &docs::Event,
    code: Option<&str>,
) -> AppResult<bool> {
    let identifier = format!("accessCode:{}", ctx.require_user()?);
    if rate_limit::is_limited(&ctx.state.db, &identifier).await? {
        return Err(AppError::too_many_requests("join.tooManyAttempts"));
    }
    let matches = access_code_matches(ctx, event, code).await?;
    if !matches {
        rate_limit::record_failure(&ctx.state.db, &identifier).await?;
    }
    Ok(matches)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JoinArgs {
    event_id: Id,
    access_code: Option<String>,
    /// Confirmation to sell as a private person, needed where the event asks for it
    private_seller: Option<bool>,
}

/// The current user joins the event as seller and gets the next seller number.
async fn join_event(ctx: &mut Ctx, args: JoinArgs) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.moderation.is_some() {
        return Err(AppError::forbidden("event.blocked"));
    }
    if event.end_date < chrono::Utc::now() {
        return Err(AppError::bad_request("join.past"));
    }
    if !verify_access_code(ctx, &event, args.access_code.as_deref()).await? {
        return Err(AppError::forbidden("join.invalidCode"));
    }
    if event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await? {
        // Joining twice is fine; the seller row exists since the first time
        if let Some(seller) = docs::event_seller(ctx.conn(), event.id, user).await? {
            return Ok(seller.id);
        }
        return Err(anyhow::anyhow!("seller role without event_sellers row").into());
    }
    let features = event.resolved_features();
    if features.private_sellers_only && args.private_seller != Some(true) {
        return Err(AppError::bad_request("join.privateRequired"));
    }
    // A record of who offers what needs complete details; the dialog asks for them first
    if features.fixed_seller_data {
        let complete = docs::user(ctx.conn(), user)
            .await?
            .is_some_and(|user| missing_profile_fields(&user).is_empty());
        if !complete {
            return Err(AppError::bad_request("join.profileIncomplete"));
        }
    }
    if let Some(limit) = event.vendor_limit.filter(|limit| *limit > 0) {
        let sellers: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM event_roles WHERE event_id = $1 AND role = 'seller'",
        )
        .bind(event.id)
        .fetch_one(ctx.conn())
        .await?;
        if sellers >= i64::from(limit) {
            return Err(AppError::bad_request("join.vendorLimit"));
        }
    }
    let number = next_seller_number(ctx, event.id).await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
           payout_received, number, private_seller_confirmed_at)
         VALUES ($1, $2, 0, 0, 0, false, $3, CASE WHEN $4 THEN now() END)
         RETURNING id",
    )
    .bind(event.id)
    .bind(user)
    .bind(number)
    .bind(features.private_sellers_only)
    .fetch_one(ctx.conn())
    .await?;
    event_roles::add_role(ctx, event.id, user, Role::Seller).await?;
    Ok(id)
}

/// How long after a bazaar items handed in or sold count as not settled while the seller
/// is not marked as paid out. Later the organizer may simply not use the payout flag.
const SETTLEMENT_DAYS: i32 = 90;

/// The user leaves every event as seller and helper (deleting the account). Refused while
/// a bazaar still has items of the user (handed in or sold, not over or not paid out
/// within `SETTLEMENT_DAYS`): the cash desk and the payout need them.
///
/// Bazaars that are not over lose the user's announced items, seller row and role. Items
/// with history and every past bazaar stay as they are, so the settlement stays complete;
/// a bazaar that keeps a record of who offered what keeps the items and seller row too.
/// Helper roles go everywhere.
pub async fn remove_seller_and_coorganizer_roles_for_user(
    ctx: &mut Ctx,
    user: Uuid,
) -> AppResult<()> {
    let unsettled: bool = sqlx::query_scalar(
        "SELECT EXISTS (
           SELECT 1 FROM event_products ep
           JOIN products p ON p.id = ep.product_id
           JOIN events e ON e.id = ep.event_id
           LEFT JOIN event_sellers s ON s.event_id = ep.event_id AND s.user_id = p.vendor_id
           WHERE p.vendor_id = $1 AND ep.status IN ('available', 'sold')
             AND (e.end_date >= now()
                  OR (e.end_date >= now() - make_interval(days => $2)
                      AND s.payout_received IS NOT TRUE)))",
    )
    .bind(user)
    .bind(SETTLEMENT_DAYS)
    .fetch_one(ctx.conn())
    .await?;
    if unsettled {
        return Err(AppError::coded(
            axum::http::StatusCode::CONFLICT,
            "ACCOUNT_HAS_OPEN_SALES",
            &[],
        ));
    }

    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT event_id FROM event_roles WHERE user_id = $1 AND role IN ('seller', 'coorganizer')",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    let now = chrono::Utc::now();
    for event_id in events {
        event_roles::remove_role(ctx, event_id, user, Role::Coorganizer).await?;
        let Some(event) = docs::event(ctx.conn(), event_id).await? else {
            continue;
        };
        if event.end_date < now {
            continue;
        }
        let has_history: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                            WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status <> 'announced')",
        )
        .bind(event_id)
        .bind(user)
        .fetch_one(ctx.conn())
        .await?;
        if has_history {
            continue;
        }
        if !keeps_seller_record(&event) {
            let products: Vec<Uuid> = sqlx::query_scalar(
                "DELETE FROM event_products ep USING products p
                 WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2
                 RETURNING ep.product_id",
            )
            .bind(event_id)
            .bind(user)
            .fetch_all(ctx.conn())
            .await?;
            for product in products {
                ctx.touch(Topic::Product(product));
            }
            sqlx::query("DELETE FROM event_sellers WHERE event_id = $1 AND user_id = $2")
                .bind(event_id)
                .bind(user)
                .execute(ctx.conn())
                .await?;
        }
        event_roles::remove_role(ctx, event_id, user, Role::Seller).await?;
    }
    ctx.touch(Topic::User(user));
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

async fn remove_seller_and_coorganizer_roles(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<bool>> {
    let Some(user) = ctx.user else {
        return Ok(Some(false));
    };
    remove_seller_and_coorganizer_roles_for_user(ctx, user).await?;
    Ok(None)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn is_event_seller_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<bool> {
    let Some(user) = ctx.user else {
        return Ok(false);
    };
    ctx.read(Topic::User(user));
    Ok(event_roles::has_role(ctx.conn(), args.event_id.0, user, Role::Seller).await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AccessCodeArgs {
    event_id: Id,
    access_code: Option<String>,
}

/// A mutation, not a query: every wrong code counts against the user's limit.
async fn check_access_code(ctx: &mut Ctx, args: AccessCodeArgs) -> AppResult<bool> {
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    verify_access_code(ctx, &event, args.access_code.as_deref()).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VendorArgs {
    event_id: Id,
    vendor_user_id: Id,
}

async fn mark_vendor_payout_received(ctx: &mut Ctx, args: VendorArgs) -> AppResult<()> {
    record_payout(ctx, args.event_id.0, args.vendor_user_id.0).await
}

#[derive(Serialize)]
struct Settled {
    returned: i64,
}

/// Settles a seller in one step at the end of the event: their unsold items go back to
/// them (available → returned) and the payout is marked as done. Organizers and helpers.
async fn settle_vendor(ctx: &mut Ctx, args: VendorArgs) -> AppResult<Settled> {
    let (event, vendor) = (args.event_id.0, args.vendor_user_id.0);
    record_payout(ctx, event, vendor).await?;
    let unsold: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        "UPDATE event_products ep SET status = 'returned' FROM products p
         WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'available'
         RETURNING ep.id, p.id, p.title",
    )
    .bind(event)
    .bind(vendor)
    .fetch_all(ctx.conn())
    .await?;
    for (relation, product, title) in &unsold {
        ctx.touch(Topic::Product(*product));
        close_offers_for_event_product(ctx, *relation, title, "return").await?;
    }
    // Also when the payout was recorded before and record_payout touched nothing
    if !unsold.is_empty() {
        ctx.touch(Topic::Event(event));
    }
    Ok(Settled {
        returned: unsold.len() as i64,
    })
}

async fn require_staff_and_seller(
    ctx: &mut Ctx,
    event: Uuid,
    vendor: Uuid,
    staff_code: &'static str,
) -> AppResult<docs::Event> {
    let user = ctx.require_user()?;
    let event = docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    // Helpers (coorganizers) run the cash desk and settle sellers as well
    if !has_any_role_or_admin(ctx.conn(), event.id, user, &TEAM).await? {
        return Err(AppError::forbidden(staff_code));
    }
    if !event_roles::has_role(ctx.conn(), event.id, vendor, Role::Seller).await? {
        return Err(AppError::bad_request("seller.notSeller"));
    }
    Ok(event)
}

/// Marks the payout of a seller as done and stores the totals and the intake fee kept.
/// Nothing happens when already paid.
async fn record_payout(ctx: &mut Ctx, event_id: Uuid, vendor: Uuid) -> AppResult<()> {
    let event = require_staff_and_seller(ctx, event_id, vendor, "seller.payoutStaffOnly").await?;
    let row = docs::event_seller(ctx.conn(), event.id, vendor).await?;
    if row.as_ref().is_some_and(|row| row.payout_received) {
        return Ok(());
    }
    let (commission, payout): (Decimal, Decimal) = sqlx::query_as(
        "SELECT COALESCE(sum(commission_amount), 0), COALESCE(sum(payout_amount), 0)
         FROM purchases WHERE event_id = $1 AND seller_id = $2",
    )
    .bind(event.id)
    .bind(vendor)
    .fetch_one(ctx.conn())
    .await?;
    let fee = intake_fee_for_seller(ctx.conn(), &event, vendor, row.as_ref()).await?;
    match row {
        Some(row) => {
            sqlx::query(
                "UPDATE event_sellers SET commission_fee = $2, payout_amount = $3, intake_fee = $4,
                   intake_fee_items = $5, payout_received = true
                 WHERE id = $1",
            )
            .bind(row.id)
            .bind(commission)
            .bind(payout - fee.total)
            .bind(fee.total)
            .bind(fee.items as i32)
            .execute(ctx.conn())
            .await?;
        }
        None => {
            let number = next_seller_number(ctx, event.id).await?;
            sqlx::query(
                "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
                   intake_fee, intake_fee_items, payout_received, number)
                 VALUES ($1, $2, 0, $3, $4, $5, $6, true, $7)",
            )
            .bind(event.id)
            .bind(vendor)
            .bind(commission)
            .bind(payout - fee.total)
            .bind(fee.total)
            .bind(fee.items as i32)
            .bind(number)
            .execute(ctx.conn())
            .await?;
        }
    }
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(vendor));
    Ok(())
}

async fn unmark_vendor_payout_received(ctx: &mut Ctx, args: VendorArgs) -> AppResult<()> {
    let (event, vendor) = (args.event_id.0, args.vendor_user_id.0);
    require_staff_and_seller(ctx, event, vendor, "seller.undoPayoutStaffOnly").await?;
    sqlx::query(
        "UPDATE event_sellers SET payout_received = false, commission_fee = 0, payout_amount = 0,
           intake_fee = NULL, intake_fee_items = NULL
         WHERE event_id = $1 AND user_id = $2 AND payout_received",
    )
    .bind(event)
    .bind(vendor)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::User(vendor));
    Ok(())
}
