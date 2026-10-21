//! The cash desk: selling items, the cart, undoing a sale, the seller's sales.
//!
//! Commission and payout are computed in cents: the commission is rounded, the payout is
//! what remains, so both always add up to the price.

use std::collections::HashMap;

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::category_fields::{self, Attribute};
use super::docs::{self, Event, EventProduct, Product};
use super::event_products::{fields_of, relation, relation_by_id, relations_of_product};
use super::event_roles::{assert_vendor_not_paid_out, require_team};
use super::features::discounted_price;
use super::instance::EMAIL_PATTERN;
use super::notifications::{self, Area, Category, Content, T, format_euro};
use super::offers::{close_offers_for_event_product, reopen_closed_offers};
use super::sales::{self, IntakeFee, SaleInfo, intake_fee_for_seller};
use crate::error::{AppError, AppResult};
use crate::flags;
use crate::i18n::Locale;
use crate::mail::Detail;
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "purchases.sellProduct" => sell_product);
    register!(registry, Mutation "purchases.sellProducts" => sell_products);
    register!(registry, Query "purchases.getCheckoutItem" => get_checkout_item);
    register!(registry, Mutation "purchases.undoSale" => undo_sale);
    register!(registry, Query "purchases.getPurchasesForEvent" => get_purchases_for_event);
    register!(registry, Query "purchases.getMySales" => get_my_sales);
}

/// A cart holds what one buyer takes home; more is a typing or scanning error.
const MAX_CART_ITEMS: usize = 100;

/// The price at the cash desk without offer: the label price minus the seller's discount.
pub fn current_list_price(product: &Product, relation: &EventProduct) -> Decimal {
    discounted_price(product.price, relation.discount_percent).cents()
}

fn money(value: f64) -> Option<Decimal> {
    Decimal::from_f64(value).map(|v| v.cents())
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaleRequest {
    event_product_id: Id,
    offer_id: Option<Id>,
    negotiated_price: Option<f64>,
}

struct SoldItem {
    purchase: Uuid,
    product: Product,
    total: Decimal,
    commission: Decimal,
    payout: Decimal,
}

fn receipt_address(buyer_email: Option<&str>) -> AppResult<Option<String>> {
    let address = buyer_email.map(str::trim).filter(|a| !a.is_empty());
    if address.is_some_and(|a| !EMAIL_PATTERN.is_match(a)) {
        return Err(AppError::bad_request("checkout.invalidEmail"));
    }
    Ok(address.map(str::to_owned))
}

/// Sells one item: checks, price (list price with discount, a redeemed offer or a
/// negotiated price), purchase record, closing its offers and other listings. The
/// emails are sent by the caller, so a cart can bundle them.
async fn sell_event_product(ctx: &mut Ctx, request: &SaleRequest) -> AppResult<(Event, SoldItem)> {
    let relation = relation_by_id(ctx.conn(), request.event_product_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    require_team(ctx, relation.event_id).await?;
    let event = docs::event(ctx.conn(), relation.event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let product = docs::product(ctx.conn(), relation.product_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if docs::event_seller(ctx.conn(), event.id, product.vendor_id)
        .await?
        .is_some_and(|seller| seller.payout_received)
    {
        return Err(AppError::bad_request("seller.paidOutNoSales"));
    }
    if relation.status != "available" {
        return Err(AppError::bad_request("product.notForSale"));
    }
    if request.offer_id.is_some() && request.negotiated_price.is_some() {
        return Err(AppError::bad_request("checkout.offerOrNegotiated"));
    }

    let list_price = current_list_price(&product, &relation);
    let mut total = list_price;
    let mut discount = relation.discount_percent;
    let mut source = "list";
    if let Some(offer) = request.offer_id {
        let accepted: Option<Decimal> = sqlx::query_scalar(
            "SELECT amount FROM product_offers WHERE id = $1 AND event_product_id = $2 AND status = 'accepted'",
        )
        .bind(offer.0)
        .bind(relation.id)
        .fetch_optional(ctx.conn())
        .await?;
        let amount = accepted.ok_or_else(|| AppError::bad_request("checkout.offerNotAccepted"))?;
        total = amount.min(list_price);
        discount = None;
        source = "offer";
    } else if let Some(negotiated) = request.negotiated_price {
        let Some(minimum) = product
            .minimum_price
            .filter(|_| event.resolved_features().minimum_price)
        else {
            return Err(AppError::bad_request("checkout.noNegotiation"));
        };
        if minimum >= list_price {
            return Err(AppError::bad_request("checkout.labelAtMinimum"));
        }
        let price = money(negotiated).filter(|price| *price >= minimum && *price <= list_price);
        total = price.ok_or_else(|| {
            AppError::coded(
                axum::http::StatusCode::BAD_REQUEST,
                "checkout.priceRange",
                &[
                    ("min", &format_euro(minimum)),
                    ("max", &format_euro(list_price)),
                ],
            )
        })?;
        discount = None;
        source = "negotiated";
    }
    let commission = (total * event.commission / Decimal::ONE_HUNDRED).cents();
    let payout = total - commission;

    sqlx::query("UPDATE event_products SET status = 'sold' WHERE id = $1")
        .bind(relation.id)
        .execute(ctx.conn())
        .await?;
    // The redeemed offer cannot be used again; every other open offer is void now
    if let Some(offer) = request.offer_id {
        sqlx::query(
            "UPDATE product_offers SET status = 'redeemed', responded_at = now() WHERE id = $1",
        )
        .bind(offer.0)
        .execute(ctx.conn())
        .await?;
    }
    close_offers_for_event_product(ctx, relation.id, &product.title, "sale").await?;
    sqlx::query("UPDATE products SET sold = true WHERE id = $1")
        .bind(product.id)
        .execute(ctx.conn())
        .await?;
    // Sold: the item leaves all other events
    for other in relations_of_product(ctx.conn(), product.id).await? {
        if other.event_id != event.id {
            close_offers_for_event_product(ctx, other.id, &product.title, "removed").await?;
            sqlx::query("DELETE FROM event_products WHERE id = $1")
                .bind(other.id)
                .execute(ctx.conn())
                .await?;
            ctx.touch(Topic::Event(other.event_id));
        }
    }
    let purchase: Uuid = sqlx::query_scalar(
        "INSERT INTO purchases (product_id, event_id, seller_id, total_amount, commission_amount, payout_amount,
           payout_status, payout_date, discount_percent, list_price, price_source, offer_id)
         VALUES ($1, $2, $3, $4, $5, $6, false, 'epoch', $7, $8, $9::purchase_price_source, $10)
         RETURNING id",
    )
    .bind(product.id)
    .bind(event.id)
    .bind(product.vendor_id)
    .bind(total)
    .bind(commission)
    .bind(payout)
    .bind(discount)
    .bind(product.price)
    .bind(source)
    .bind(request.offer_id.map(|id| id.0))
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    ctx.touch(Topic::Table("products"));
    Ok((
        event,
        SoldItem {
            purchase,
            product,
            total,
            commission,
            payout,
        },
    ))
}

/// One email per seller: a single item, or several items as a list with the total.
async fn notify_seller(
    ctx: &mut Ctx,
    event: &Event,
    vendor: Uuid,
    items: &[&SoldItem],
) -> AppResult<()> {
    let title = event.title.clone();
    if let [item] = items {
        let (product, total, commission, payout) = (
            item.product.title.clone(),
            item.total,
            item.commission,
            item.payout,
        );
        return notifications::notify_user(
            ctx,
            vendor,
            |t: T| Content {
                category: Some(Category::Sales),
                subject: t.t("sale.one.subject", &[("title", &product)]),
                heading: t.t("sale.one.heading", &[]),
                paragraphs: vec![t.t("sale.one.text", &[("title", &product), ("event", &title)])],
                details: vec![
                    Detail {
                        label: t.t("sale.price", &[]),
                        value: format_euro(total),
                    },
                    Detail {
                        label: t.t("sale.commission", &[]),
                        value: format_euro(commission),
                    },
                    Detail {
                        label: t.t("sale.payout", &[]),
                        value: format_euro(payout),
                    },
                ],
                link: t.link("sale.one.link", "/my-products"),
                footnote: Some(t.t("sale.footnote", &[])),
            },
            Some(Area::Sales),
            Duration::zero(),
        )
        .await;
    }
    let count = items.len() as i64;
    let lines: Vec<(String, Decimal)> = items
        .iter()
        .map(|item| (item.product.title.clone(), item.total))
        .collect();
    let commission: Decimal = items.iter().map(|item| item.commission).sum();
    let payout: Decimal = items.iter().map(|item| item.payout).sum();
    notifications::notify_user(
        ctx,
        vendor,
        |t: T| {
            let mut details: Vec<Detail> = lines
                .iter()
                .map(|(label, total)| Detail {
                    label: label.clone(),
                    value: format_euro(*total),
                })
                .collect();
            details.push(Detail {
                label: t.t("sale.commission", &[]),
                value: format_euro(commission),
            });
            details.push(Detail {
                label: t.t("sale.payout", &[]),
                value: format_euro(payout),
            });
            Content {
                category: Some(Category::Sales),
                subject: t.count("sale.many.subject", count, &[("event", &title)]),
                heading: t.count("sale.many.heading", count, &[]),
                paragraphs: vec![t.count("sale.many.text", count, &[("event", &title)])],
                details,
                link: t.link("sale.many.link", "/my-sales"),
                footnote: Some(t.t("sale.footnote", &[])),
            }
        },
        Some(Area::Sales),
        Duration::zero(),
    )
    .await
}

/// The buyer's receipt; the address is used for this email only, in the language of the
/// cash desk (the buyer has no account).
async fn send_receipt(
    ctx: &mut Ctx,
    address: String,
    event: &Event,
    items: &[SoldItem],
    locale: Locale,
) -> AppResult<()> {
    let title = event.title.clone();
    if let [item] = items {
        let fields = fields_of(ctx.conn(), item.product.product_category).await?;
        let attributes =
            category_fields::describe_attributes(fields, item.product.attributes.as_ref());
        let (product, total, path) = (
            item.product.title.clone(),
            item.total,
            format!("/products/view/{}", item.product.id),
        );
        return notifications::notify_address(ctx, address, locale, |t: T| {
            let mut details = vec![Detail {
                label: t.t("receipt.item", &[]),
                value: product.clone(),
            }];
            details.extend(attributes.iter().map(|a| Detail {
                label: a.label.to_owned(),
                value: a.value.clone(),
            }));
            details.push(Detail {
                label: t.t("receipt.paid", &[]),
                value: format_euro(total),
            });
            Content {
                subject: t.t("receipt.one.subject", &[("title", &product)]),
                heading: t.t("receipt.heading", &[]),
                paragraphs: vec![t.t("receipt.one.text", &[("event", &title)])],
                details,
                link: t.link("moderation.viewProduct", path.clone()),
                footnote: Some(t.t("receipt.footnote", &[])),
                category: None,
            }
        })
        .await;
    }
    let count = items.len() as i64;
    let lines: Vec<(String, Decimal)> = items
        .iter()
        .map(|item| (item.product.title.clone(), item.total))
        .collect();
    let paid: Decimal = items.iter().map(|item| item.total).sum();
    notifications::notify_address(ctx, address, locale, |t: T| {
        let mut details: Vec<Detail> = lines
            .iter()
            .map(|(label, total)| Detail {
                label: label.clone(),
                value: format_euro(*total),
            })
            .collect();
        details.push(Detail {
            label: t.t("receipt.paid", &[]),
            value: format_euro(paid),
        });
        Content {
            subject: t.count("receipt.many.subject", count, &[("event", &title)]),
            heading: t.t("receipt.heading", &[]),
            paragraphs: vec![t.t("receipt.many.text", &[("event", &title)])],
            details,
            footnote: Some(t.t("receipt.footnote", &[])),
            ..Content::default()
        }
    })
    .await
}

async fn cash_desk_locale(ctx: &mut Ctx, user: Uuid) -> AppResult<Locale> {
    let locale: Option<Locale> = sqlx::query_scalar("SELECT locale FROM users WHERE id = $1")
        .bind(user)
        .fetch_optional(ctx.conn())
        .await?
        .flatten();
    Ok(locale.unwrap_or_default())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SellArgs {
    event_product_id: Id,
    offer_id: Option<Id>,
    negotiated_price: Option<f64>,
    buyer_email: Option<String>,
}

/// Sells one item at the cash desk; with `buyerEmail` the buyer gets a receipt.
async fn sell_product(ctx: &mut Ctx, args: SellArgs) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    let address = receipt_address(args.buyer_email.as_deref())?;
    let request = SaleRequest {
        event_product_id: args.event_product_id,
        offer_id: args.offer_id,
        negotiated_price: args.negotiated_price,
    };
    let (event, sold) = sell_event_product(ctx, &request).await?;
    notify_seller(ctx, &event, sold.product.vendor_id, &[&sold]).await?;
    let purchase = sold.purchase;
    if let Some(address) = address {
        let locale = cash_desk_locale(ctx, user).await?;
        send_receipt(ctx, address, &event, &[sold], locale).await?;
    }
    Ok(purchase)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CartArgs {
    items: Vec<SaleRequest>,
    buyer_email: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CartResult {
    purchase_ids: Vec<Uuid>,
    total: Decimal,
}

/// The cart: all items of one buyer in one transaction. If one cannot be sold, nothing is
/// sold and the error names the item. One email per seller, one receipt for the buyer.
async fn sell_products(ctx: &mut Ctx, args: CartArgs) -> AppResult<CartResult> {
    let user = ctx.require_user()?;
    if args.items.is_empty() {
        return Err(AppError::bad_request("checkout.empty"));
    }
    if args.items.len() > MAX_CART_ITEMS {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "checkout.tooMany",
            &[("max", &MAX_CART_ITEMS.to_string())],
        ));
    }
    let mut seen = std::collections::HashSet::new();
    if !args
        .items
        .iter()
        .all(|item| seen.insert(item.event_product_id.0))
    {
        return Err(AppError::bad_request("checkout.duplicate"));
    }
    let address = receipt_address(args.buyer_email.as_deref())?;

    let mut event: Option<Event> = None;
    let mut sold: Vec<SoldItem> = Vec::new();
    for item in &args.items {
        let result = async {
            let (item_event, item_sold) = sell_event_product(ctx, item).await?;
            if event.as_ref().is_some_and(|e| e.id != item_event.id) {
                return Err(AppError::bad_request("checkout.mixedEvents"));
            }
            Ok((item_event, item_sold))
        }
        .await;
        match result {
            Ok((item_event, item_sold)) => {
                event = Some(item_event);
                sold.push(item_sold);
            }
            Err(err) => {
                // The mutation rolls back as a whole; tell the cash desk which item failed
                let title: Option<String> = sqlx::query_scalar(
                    "SELECT p.title FROM event_products ep JOIN products p ON p.id = ep.product_id WHERE ep.id = $1",
                )
                .bind(item.event_product_id.0)
                .fetch_optional(ctx.conn())
                .await
                .ok()
                .flatten();
                return Err(match title {
                    Some(title) => {
                        AppError::with_cause("checkout.itemFailed", &[("title", &title)], err)
                    }
                    None => err,
                });
            }
        }
    }
    let event = event.ok_or_else(|| AppError::bad_request("checkout.empty"))?;
    let mut by_vendor: Vec<(Uuid, Vec<&SoldItem>)> = Vec::new();
    for item in &sold {
        match by_vendor
            .iter_mut()
            .find(|(vendor, _)| *vendor == item.product.vendor_id)
        {
            Some((_, items)) => items.push(item),
            None => by_vendor.push((item.product.vendor_id, vec![item])),
        }
    }
    for (vendor, items) in &by_vendor {
        notify_seller(ctx, &event, *vendor, items).await?;
    }
    let result = CartResult {
        purchase_ids: sold.iter().map(|item| item.purchase).collect(),
        total: sold.iter().map(|item| item.total).sum(),
    };
    if let Some(address) = address {
        let locale = cash_desk_locale(ctx, user).await?;
        send_receipt(ctx, address, &event, &sold, locale).await?;
    }
    Ok(result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckoutItemArgs {
    event_id: Id,
    product_id: String,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutItem {
    event_product_id: Uuid,
    product_id: Uuid,
    title: String,
    #[serde(serialize_with = "nullable")]
    image: Option<Uuid>,
    status: String,
    price: Decimal,
    discount_percent: Option<Decimal>,
    list_price: Decimal,
    minimum_price: Option<Decimal>,
    seller_paid_out: bool,
    attributes: Vec<Attribute>,
}

fn nullable<S: serde::Serializer>(value: &Option<Uuid>, serializer: S) -> Result<S::Ok, S::Error> {
    value.serialize(serializer)
}

/// One line of the cart: the scanned item of this event with its current price; live, so
/// a sale at another desk shows up right away. Event team only. The product ID comes from
/// the scanner and may be anything.
async fn get_checkout_item(
    ctx: &mut Ctx,
    args: CheckoutItemArgs,
) -> AppResult<Option<CheckoutItem>> {
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    let Some(product_id) = Id::parse(&args.product_id) else {
        return Ok(None);
    };
    ctx.read(Topic::Event(event_id));
    ctx.read(Topic::Product(product_id.0));
    let (Some(event), Some(product), Some(relation)) = (
        docs::event(ctx.conn(), event_id).await?,
        docs::product(ctx.conn(), product_id.0).await?,
        relation(ctx.conn(), event_id, product_id.0).await?,
    ) else {
        return Ok(None);
    };
    let paid_out = docs::event_seller(ctx.conn(), event_id, product.vendor_id)
        .await?
        .is_some_and(|seller| seller.payout_received);
    let list_price = current_list_price(&product, &relation);
    let fields = fields_of(ctx.conn(), product.product_category).await?;
    let minimum_price = product
        .minimum_price
        .filter(|minimum| event.resolved_features().minimum_price && *minimum < list_price);
    Ok(Some(CheckoutItem {
        event_product_id: relation.id,
        product_id: product.id,
        image: product.images.first().copied(),
        status: relation.status,
        price: product.price,
        discount_percent: relation.discount_percent,
        list_price,
        minimum_price,
        seller_paid_out: paid_out,
        attributes: category_fields::describe_attributes(fields, product.attributes.as_ref()),
        title: product.title,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UndoArgs {
    event_product_id: Id,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// Undoes a sale (flag allow_undo_inventory_actions): the item is available again, a
/// redeemed offer accepted again, the offers the sale closed valid again.
async fn undo_sale(ctx: &mut Ctx, args: UndoArgs) -> AppResult<Success> {
    ctx.require_user()?;
    if !flags::get(ctx.conn(), "allow_undo_inventory_actions", false).await? {
        return Err(AppError::forbidden("feature.disabled"));
    }
    let relation = relation_by_id(ctx.conn(), args.event_product_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    require_team(ctx, relation.event_id).await?;
    if relation.status != "sold" {
        return Err(AppError::bad_request("product.notSold"));
    }
    let product = docs::product(ctx.conn(), relation.product_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    assert_vendor_not_paid_out(ctx.conn(), relation.event_id, product.vendor_id).await?;
    let offer: Option<Option<Uuid>> = sqlx::query_scalar(
        "DELETE FROM purchases WHERE id = (
           SELECT id FROM purchases WHERE event_id = $1 AND seller_id = $2 AND product_id = $3
           ORDER BY created_at LIMIT 1)
         RETURNING offer_id",
    )
    .bind(relation.event_id)
    .bind(product.vendor_id)
    .bind(product.id)
    .fetch_optional(ctx.conn())
    .await?;
    // The buyer gets their deal back, so the offer can be redeemed at the next sale
    if let Some(Some(offer)) = offer {
        sqlx::query(
            "UPDATE product_offers SET status = 'accepted' WHERE id = $1 AND status = 'redeemed'",
        )
        .bind(offer)
        .execute(ctx.conn())
        .await?;
    }
    sqlx::query("UPDATE event_products SET status = 'available' WHERE id = $1")
        .bind(relation.id)
        .execute(ctx.conn())
        .await?;
    sqlx::query("UPDATE products SET sold = false WHERE id = $1")
        .bind(product.id)
        .execute(ctx.conn())
        .await?;
    reopen_closed_offers(ctx, relation.id, &product.title, "sale").await?;
    ctx.touch(Topic::Event(relation.event_id));
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    Ok(Success { success: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn get_purchases_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<docs::Purchase>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    Ok(docs::purchases_where(ctx.conn(), "event_id = $1", args.event_id.0).await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaleItem {
    product_id: Uuid,
    title: String,
    description: String,
    images: Vec<Uuid>,
    sale: SaleInfo,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SalesEvent {
    #[serde(rename = "_id")]
    id: Uuid,
    title: String,
    #[serde(with = "ms")]
    start_date: DateTime<Utc>,
    #[serde(with = "ms")]
    end_date: DateTime<Utc>,
    commission_percent: Decimal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Totals {
    revenue: Decimal,
    commission: Decimal,
    intake_fee: IntakeFee,
    payout: Decimal,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SalesGroup {
    event: SalesEvent,
    paid: bool,
    seller_number: Option<i32>,
    items: Vec<SaleItem>,
    totals: Totals,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// The seller's sales per event with totals and payout state; bazaars without a sale
/// count where an intake fee is due. Newest event first.
async fn get_my_sales(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<SalesGroup>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(user));
    let purchases = docs::purchases_where(ctx.conn(), "seller_id = $1", user).await?;
    let mut events: Vec<Uuid> = Vec::new();
    for purchase in &purchases {
        if !events.contains(&purchase.event_id) {
            events.push(purchase.event_id);
        }
    }
    let seller_events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT event_id FROM event_roles WHERE user_id = $1 AND role = 'seller'",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for event in seller_events {
        if !events.contains(&event) {
            events.push(event);
        }
    }
    let mut products: HashMap<Uuid, Option<Product>> = HashMap::new();
    let mut groups = Vec::new();
    for event_id in events {
        ctx.read(Topic::Event(event_id));
        let Some(event) = docs::event(ctx.conn(), event_id).await? else {
            continue;
        };
        let seller = docs::event_seller(ctx.conn(), event_id, user).await?;
        let mut items = Vec::new();
        for purchase in purchases.iter().filter(|p| p.event_id == event_id) {
            if let std::collections::hash_map::Entry::Vacant(e) =
                products.entry(purchase.product_id)
            {
                let product = docs::product(ctx.conn(), purchase.product_id).await?;
                e.insert(product);
            }
            let product = products[&purchase.product_id].as_ref();
            items.push(SaleItem {
                product_id: purchase.product_id,
                title: product.map_or_else(|| "Gelöschter Artikel".to_owned(), |p| p.title.clone()),
                description: product.map(|p| p.description.clone()).unwrap_or_default(),
                images: product.map(|p| p.images.clone()).unwrap_or_default(),
                sale: sales::sale_info(purchase),
            });
        }
        items.sort_by_key(|item| std::cmp::Reverse(item.sale.sold_at));
        let intake_fee = intake_fee_for_seller(ctx.conn(), &event, user, seller.as_ref()).await?;
        if items.is_empty() && intake_fee.total.is_zero() {
            continue;
        }
        let revenue: Decimal = items.iter().map(|i| i.sale.total_amount).sum();
        let commission: Decimal = items.iter().map(|i| i.sale.commission).sum();
        let payout: Decimal =
            items.iter().map(|i| i.sale.payout).sum::<Decimal>() - intake_fee.total;
        groups.push(SalesGroup {
            event: SalesEvent {
                id: event.id,
                title: event.title.clone(),
                start_date: event.start_date,
                end_date: event.end_date,
                commission_percent: event.commission,
            },
            paid: seller.as_ref().is_some_and(|s| s.payout_received),
            seller_number: seller.and_then(|s| s.number),
            items,
            totals: Totals {
                revenue,
                commission,
                intake_fee,
                payout,
            },
        });
    }
    groups.sort_by_key(|group| std::cmp::Reverse(group.event.start_date));
    Ok(groups)
}
