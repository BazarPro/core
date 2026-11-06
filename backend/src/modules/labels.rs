//! Data for the label PDFs.

use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::docs::{self, Event};
use super::event_products::{find_active_listing, relation};
use super::event_roles::{TEAM, has_any_role_or_admin};
use super::features::{label_mark, shows_price_on_label};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

/// More labels at once would be a huge PDF; nobody prints that many in one go.
const MAX_LABELS: usize = 500;
/// Sorting codes with the same rest differ by the extra letter only: SORT_PATTERNS in
/// src/shared/sortCode.ts and sort_code_patterns() in migration 0023
const SORT_PATTERNS: i32 = 9_956_000;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "labels.getLabelData" => get_label_data);
    register!(registry, Query "labels.getSortMarkClashes" => get_sort_mark_clashes);
    register!(registry, Query "labels.getMyBasketLabel" => get_my_basket_label);
    register!(registry, Query "labels.getEventLabelIds" => get_event_label_ids);
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
    /// The seller's lasting code for sorting back; none on QR-only labels
    sort_code: Option<i32>,
    size: Option<String>,
    price: Option<Decimal>,
}

#[derive(Serialize)]
struct Labels {
    format: String,
    labels: Vec<Label>,
}

/// Title, sorting code, size and, where the bazaar prints it, the price of the items.
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
        let mut price = None;
        // Without a bazaar yet the label stays usable with the seller's code
        let universal = label_event
            .as_ref()
            .is_none_or(|event| label_mark(event) == "universal");
        let sort_code = if universal {
            seller_sort_code(ctx, product.vendor_id).await?
        } else {
            None
        };
        if let Some(label_event) = &label_event {
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
            sort_code,
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

/// The seller's lasting code; given with the first item or bazaar (migration 0020).
pub async fn seller_sort_code(ctx: &mut Ctx, seller: Uuid) -> AppResult<Option<i32>> {
    let code: Option<Option<i32>> = sqlx::query_scalar("SELECT sort_code FROM users WHERE id = $1")
        .bind(seller)
        .fetch_optional(ctx.conn())
        .await?;
    Ok(code.flatten())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClashArgs {
    event_ids: Vec<Id>,
}

/// Bazaars with universal labels among the given ones where another seller has the same
/// pattern as the viewer, so that their labels differ by the extra letter only. Names no one.
async fn get_sort_mark_clashes(ctx: &mut Ctx, args: ClashArgs) -> AppResult<Vec<Uuid>> {
    let user = ctx.require_user()?;
    let mut clashes = Vec::new();
    for id in args.event_ids {
        ctx.read(Topic::Event(id.0));
        let Some(event) = docs::event(ctx.conn(), id.0).await? else {
            continue;
        };
        if label_mark(&event) != "universal" {
            continue;
        }
        let clash: bool = sqlx::query_scalar(
            "SELECT EXISTS (
               SELECT 1
               FROM event_sellers mine
               JOIN users me ON me.id = mine.user_id
               JOIN event_sellers theirs ON theirs.event_id = mine.event_id AND theirs.user_id <> mine.user_id
               JOIN users other ON other.id = theirs.user_id
               WHERE mine.event_id = $1 AND mine.user_id = $2
                 AND other.sort_code % $3 = me.sort_code % $3
             )",
        )
        .bind(event.id)
        .bind(user)
        .bind(SORT_PATTERNS)
        .fetch_one(ctx.conn())
        .await?;
        if clash {
            clashes.push(event.id);
        }
    }
    Ok(clashes)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BasketLabel {
    sort_code: i32,
    name: Option<String>,
}

/// What the viewer's basket label shows; none before the first item or bazaar.
async fn get_my_basket_label(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<BasketLabel>> {
    let user = ctx.require_user()?;
    ctx.read(Topic::User(user));
    let row: Option<(Option<i32>, Option<String>)> =
        sqlx::query_as("SELECT sort_code, name FROM users WHERE id = $1")
            .bind(user)
            .fetch_optional(ctx.conn())
            .await?;
    Ok(row.and_then(|(code, name)| code.map(|sort_code| BasketLabel { sort_code, name })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventLabelsArgs {
    event_id: Id,
}

/// The items of a bazaar that still need a label, for the team: not sold or returned, one
/// seller after the other, so that the sheets can be handed out by seller.
async fn get_event_label_ids(ctx: &mut Ctx, args: EventLabelsArgs) -> AppResult<Vec<Uuid>> {
    let user = ctx.require_user()?;
    if !has_any_role_or_admin(ctx.conn(), args.event_id.0, user, &TEAM).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_scalar(
        "SELECT p.id
         FROM event_products ep
         JOIN products p ON p.id = ep.product_id
         JOIN users u ON u.id = p.vendor_id
         WHERE ep.event_id = $1 AND ep.status IN ('announced', 'available')
         ORDER BY u.sort_code, u.id, p.created_at, p.id",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}
