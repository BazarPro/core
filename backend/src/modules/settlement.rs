//! The settlement of a bazaar as its organizers keep it (§ 147 AO, #173): every sale, and
//! per seller the totals and the payout. From the sales and the seller rows only (#167),
//! so it stays complete after the sold items are deleted (#169), until the bazaar goes.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::docs;
use super::event_roles::{load_vendors_with_calculations, require_team};
use super::sales;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "settlement.getExport" => get_export);
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportEvent {
    title: String,
    location: String,
    #[serde(with = "ms")]
    start_date: DateTime<Utc>,
    #[serde(with = "ms")]
    end_date: DateTime<Utc>,
    /// Percent of each sale the bazaar keeps
    commission: Decimal,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportSale {
    #[serde(with = "ms")]
    sold_at: DateTime<Utc>,
    title: String,
    category: String,
    seller_number: Option<i32>,
    list_price: Decimal,
    /// What the buyer paid
    total_amount: Decimal,
    price_source: String,
    commission: Decimal,
    payout: Decimal,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportSeller {
    seller_number: Option<i32>,
    first_name: Option<String>,
    last_name: Option<String>,
    street: Option<String>,
    zip_code: Option<String>,
    city: Option<String>,
    country: Option<String>,
    revenue: Decimal,
    commission: Decimal,
    intake_fee: Decimal,
    /// Negative when the seller owes the bazaar
    payout: Decimal,
    paid: bool,
}

#[derive(Serialize)]
struct Export {
    event: ExportEvent,
    sales: Vec<ExportSale>,
    sellers: Vec<ExportSeller>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

/// Sales by time, sellers by number; with name and address as the settlement shows them
/// (from the seller row's snapshot once the bazaar is over). Event team only.
async fn get_export(ctx: &mut Ctx, args: EventArgs) -> AppResult<Export> {
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    ctx.read(Topic::Event(event_id));
    let event = docs::event(ctx.conn(), event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let vendors = load_vendors_with_calculations(ctx, event_id).await?;
    let numbers: HashMap<Uuid, i32> = vendors
        .iter()
        .filter_map(|vendor| Some((vendor.user.id, vendor.seller_number?)))
        .collect();
    let mut purchases = docs::purchases_where(ctx.conn(), "event_id = $1", event_id).await?;
    purchases.sort_by_key(|purchase| (purchase.created_at, purchase.id));
    let sales = purchases
        .iter()
        .map(|purchase| {
            let sale = sales::sale_info(purchase);
            ExportSale {
                sold_at: sale.sold_at,
                title: purchase.product_title.clone().unwrap_or_default(),
                category: purchase.category_label.clone().unwrap_or_default(),
                seller_number: purchase
                    .seller_number
                    .or_else(|| numbers.get(&purchase.seller_id).copied()),
                list_price: sale.list_price,
                total_amount: sale.total_amount,
                price_source: sale.price_source,
                commission: sale.commission,
                payout: sale.payout,
            }
        })
        .collect();
    let mut sellers: Vec<ExportSeller> = vendors
        .into_iter()
        .map(|vendor| ExportSeller {
            seller_number: vendor.seller_number,
            first_name: vendor.user.first_name.or(vendor.user.name),
            last_name: vendor.user.last_name,
            street: vendor.user.street,
            zip_code: vendor.user.zip_code,
            city: vendor.user.city,
            country: vendor.user.country,
            revenue: vendor.total_revenue,
            commission: vendor.commission,
            intake_fee: vendor.intake_fee.total,
            payout: vendor.payout,
            paid: vendor.paid,
        })
        .collect();
    sellers.sort_by_key(|seller| seller.seller_number.unwrap_or(i32::MAX));
    Ok(Export {
        event: ExportEvent {
            title: event.title,
            location: event.location,
            start_date: event.start_date,
            end_date: event.end_date,
            commission: event.commission,
        },
        sales,
        sellers,
    })
}
