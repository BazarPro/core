//! Data for the label PDFs (convex/labels.ts).

use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::docs::{self, Event};
use super::event_products::{find_active_listing, relation};
use super::event_roles::{TEAM, has_any_role_or_admin};
use super::features::shows_price_on_label;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

/// More labels at once would be a huge PDF; nobody prints that many in one go.
const MAX_LABELS: usize = 500;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "labels.getLabelData" => get_label_data);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LabelArgs {
    product_ids: Vec<Id>,
    event_id: Option<Id>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Label {
    product_id: Uuid,
    title: String,
    seller_number: Option<i32>,
    size: Option<String>,
    price: Option<Decimal>,
}

#[derive(Serialize)]
struct Labels {
    format: String,
    labels: Vec<Label>,
}

/// Title, seller number, size and, where the bazaar prints it, the price of the items.
/// With `eventId` for that bazaar (event team or the items' seller); without, for each
/// item's current or next bazaar (own items only).
async fn get_label_data(ctx: &mut Ctx, args: LabelArgs) -> AppResult<Labels> {
    let user = ctx.require_user()?;
    if args.product_ids.len() > MAX_LABELS {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "product.tooManyLabels",
            &[("max", &MAX_LABELS.to_string())],
        ));
    }
    let event = match args.event_id {
        Some(id) => Some(
            docs::event(ctx.conn(), id.0)
                .await?
                .ok_or_else(|| AppError::not_found("notFound.event"))?,
        ),
        None => None,
    };
    let team = match &event {
        Some(event) => has_any_role_or_admin(ctx.conn(), event.id, user, &TEAM).await?,
        None => false,
    };
    let now = Utc::now();
    let mut formats: Vec<String> = Vec::new();
    let mut labels = Vec::new();
    for id in args.product_ids {
        ctx.read(Topic::Product(id.0));
        let Some(product) = docs::product(ctx.conn(), id.0).await? else {
            continue;
        };
        if product.vendor_id != user {
            // Others' items only for the event team, and only items of that bazaar
            let listed = match &event {
                Some(event) => relation(ctx.conn(), event.id, product.id).await?.is_some(),
                None => false,
            };
            if !team || !listed {
                return Err(AppError::forbidden("auth.forbidden"));
            }
        }
        let label_event: Option<Event> = match &event {
            Some(event) => Some(event.clone()),
            None => find_active_listing(ctx.conn(), product.id, now)
                .await?
                .map(|(event, _)| event),
        };
        let mut seller_number = None;
        let mut price = None;
        if let Some(label_event) = &label_event {
            seller_number = docs::event_seller(ctx.conn(), label_event.id, product.vendor_id)
                .await?
                .and_then(|row| row.number);
            let format = label_event.resolved_features().label_format;
            if !formats.contains(&format) {
                formats.push(format);
            }
            if shows_price_on_label(label_event) {
                price = Some(product.price);
            }
        }
        labels.push(Label {
            product_id: product.id,
            size: product
                .attributes
                .as_ref()
                .and_then(|a| a.get("size"))
                .and_then(|v| v.as_str())
                .map(str::to_owned),
            title: product.title,
            seller_number,
            price,
        });
    }
    // Items of bazaars with different sheets: the large labels
    let format = if formats.len() == 1 {
        formats.remove(0)
    } else {
        "standard".to_owned()
    };
    Ok(Labels { format, labels })
}
