//! Sales, intake fees and payouts as sellers, organizers and receipts need them.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::docs::{Event, EventSeller, Purchase};
use crate::shape::ms;

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaleInfo {
    /// Label price of the item
    pub list_price: Decimal,
    /// Discount at the time of sale; only for sales at the (discounted) list price
    pub discount_percent: Option<Decimal>,
    pub price_source: String,
    /// What the buyer paid
    pub total_amount: Decimal,
    /// Fee the bazaar keeps
    pub commission: Decimal,
    /// What the seller gets
    pub payout: Decimal,
    #[serde(with = "ms")]
    pub sold_at: DateTime<Utc>,
}

pub fn list_price(purchase: &Purchase) -> Decimal {
    // Older rows have no listPrice; derive it from the discount
    purchase
        .list_price
        .unwrap_or_else(|| match purchase.discount_percent {
            Some(percent) if !percent.is_zero() => (purchase.total_amount
                / (Decimal::ONE - percent / Decimal::ONE_HUNDRED))
                .round_dp(2),
            _ => purchase.total_amount,
        })
}

pub fn sale_info(purchase: &Purchase) -> SaleInfo {
    SaleInfo {
        list_price: list_price(purchase),
        discount_percent: purchase.discount_percent,
        price_source: purchase
            .price_source
            .clone()
            .unwrap_or_else(|| "list".to_owned()),
        total_amount: purchase.total_amount,
        commission: purchase.commission_amount,
        payout: purchase.payout_amount,
        sold_at: purchase.created_at,
    }
}

/// Items the bazaar took in at intake; they pay the fee whether they sell or not.
pub const ACCEPTED_STATUSES: &str = "('available', 'sold', 'returned')";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntakeFee {
    /// Fee per item in €
    pub per_item: Decimal,
    pub items: i64,
    /// Fee in € kept from the payout
    pub total: Decimal,
}

pub const NO_FEE: IntakeFee = IntakeFee {
    per_item: Decimal::ZERO,
    items: 0,
    total: Decimal::ZERO,
};

fn fee_for(per_item: Decimal, items: i64) -> IntakeFee {
    IntakeFee {
        per_item,
        items,
        total: (per_item * Decimal::from(items)).round_dp(2),
    }
}

/// The fee as stored at payout, so later changes of the setting do not alter old settlements.
fn stored_fee(seller: Option<&EventSeller>) -> Option<IntakeFee> {
    let seller = seller.filter(|seller| seller.payout_received)?;
    let total = seller.intake_fee?;
    let items = i64::from(seller.intake_fee_items.unwrap_or(0));
    Some(IntakeFee {
        per_item: if items > 0 {
            total / Decimal::from(items)
        } else {
            Decimal::ZERO
        },
        items,
        total,
    })
}

/// Accepted items per seller of the event, for the event-wide views.
pub async fn accepted_items_by_seller(
    conn: &mut PgConnection,
    event_id: Uuid,
) -> sqlx::Result<HashMap<Uuid, i64>> {
    let rows: Vec<(Uuid, i64)> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT p.vendor_id, count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND ep.status IN {ACCEPTED_STATUSES}
         GROUP BY p.vendor_id"
    )))
    .bind(event_id)
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().collect())
}

/// Intake fee of one seller, given the accepted items (see accepted_items_by_seller).
pub fn intake_fee_of(
    event: &Event,
    seller: Option<&EventSeller>,
    accepted_items: i64,
) -> IntakeFee {
    if let Some(stored) = stored_fee(seller) {
        return stored;
    }
    match event.resolved_features().intake_fee {
        Some(per_item) if per_item > Decimal::ZERO => fee_for(per_item, accepted_items),
        _ => NO_FEE,
    }
}

/// Intake fee of one seller; counts only that seller's items.
pub async fn intake_fee_for_seller(
    conn: &mut PgConnection,
    event: &Event,
    seller_id: Uuid,
    seller: Option<&EventSeller>,
) -> sqlx::Result<IntakeFee> {
    if let Some(stored) = stored_fee(seller) {
        return Ok(stored);
    }
    let Some(per_item) = event
        .resolved_features()
        .intake_fee
        .filter(|fee| *fee > Decimal::ZERO)
    else {
        return Ok(NO_FEE);
    };
    let items: i64 = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status IN {ACCEPTED_STATUSES}"
    )))
    .bind(event.id)
    .bind(seller_id)
    .fetch_one(conn)
    .await?;
    Ok(fee_for(per_item, items))
}
