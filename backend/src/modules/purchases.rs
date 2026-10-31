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
use super::offers::{
    OfferView, accepted_offers_of_event, close_offers_for_event_product, reopen_closed_offers,
};
use super::sales::{self, IntakeFee, SaleInfo, intake_fee_for_seller};
use super::seller_records::snapshot_seller;
use crate::error::{AppError, AppResult};
use crate::flags;
use crate::i18n::Locale;
use crate::mail::Detail;
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "purchases.sellProduct" => sell_product);
    register!(registry, Mutation "purchases.sellProducts" => sell_products);
    register!(registry, Query "purchases.getCheckoutItem" => get_checkout_item);
    register!(registry, Query "purchases.getCheckoutSnapshot" => get_checkout_snapshot);
    register!(registry, Mutation "purchases.syncOfflineSales" => sync_offline_sales);
    register!(registry, Query "purchases.getSaleConflicts" => get_sale_conflicts);
    register!(registry, Mutation "purchases.resolveSaleConflict" => resolve_sale_conflict);
    register!(registry, Mutation "purchases.undoSale" => undo_sale);
    register!(registry, Query "purchases.getPurchasesForEvent" => get_purchases_for_event);
    register!(registry, Query "purchases.getMySales" => get_my_sales);
}

/// A cart holds what one buyer takes home; more is a typing or scanning error.
const MAX_CART_ITEMS: usize = 100;
/// Offline sales per sync call; the app sends its queue in batches of this size.
const MAX_SYNC_SALES: usize = 50;

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

/// An item the cash desk may sell: on sale at its event, the seller not paid out yet.
struct Sellable {
    relation: EventProduct,
    event: Event,
    product: Product,
}

/// The checks before a sale; only reads, so a failed check leaves nothing behind.
async fn sellable(ctx: &mut Ctx, event_product: Uuid) -> AppResult<Sellable> {
    let relation = relation_by_id(ctx.conn(), event_product)
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
    Ok(Sellable {
        relation,
        event,
        product,
    })
}

/// What the buyer pays for an item and why.
struct Price {
    total: Decimal,
    discount: Option<Decimal>,
    source: &'static str,
    /// The accepted offer the sale redeems
    offer: Option<Uuid>,
}

/// The price at an online cash desk: list price with discount, a redeemed offer or a
/// negotiated price within the seller's minimum and the list price.
async fn online_price(ctx: &mut Ctx, item: &Sellable, request: &SaleRequest) -> AppResult<Price> {
    if request.offer_id.is_some() && request.negotiated_price.is_some() {
        return Err(AppError::bad_request("checkout.offerOrNegotiated"));
    }
    let list_price = current_list_price(&item.product, &item.relation);
    if let Some(offer) = request.offer_id {
        let amount = accepted_offer(ctx, offer.0, item.relation.id)
            .await?
            .ok_or_else(|| AppError::bad_request("checkout.offerNotAccepted"))?;
        return Ok(Price {
            total: amount.min(list_price),
            discount: None,
            source: "offer",
            offer: Some(offer.0),
        });
    }
    if let Some(negotiated) = request.negotiated_price {
        let Some(minimum) = item
            .product
            .minimum_price
            .filter(|_| item.event.resolved_features().minimum_price)
        else {
            return Err(AppError::bad_request("checkout.noNegotiation"));
        };
        if minimum >= list_price {
            return Err(AppError::bad_request("checkout.labelAtMinimum"));
        }
        let price = money(negotiated).filter(|price| *price >= minimum && *price <= list_price);
        let total = price.ok_or_else(|| {
            AppError::coded(
                axum::http::StatusCode::BAD_REQUEST,
                "checkout.priceRange",
                &[
                    ("min", &format_euro(minimum)),
                    ("max", &format_euro(list_price)),
                ],
            )
        })?;
        return Ok(Price {
            total,
            discount: None,
            source: "negotiated",
            offer: None,
        });
    }
    Ok(Price {
        total: list_price,
        discount: item.relation.discount_percent,
        source: "list",
        offer: None,
    })
}

async fn accepted_offer(ctx: &mut Ctx, offer: Uuid, relation: Uuid) -> AppResult<Option<Decimal>> {
    Ok(sqlx::query_scalar(
        "SELECT amount FROM product_offers WHERE id = $1 AND event_product_id = $2 AND status = 'accepted'",
    )
    .bind(offer)
    .bind(relation)
    .fetch_optional(ctx.conn())
    .await?)
}

/// Books a checked item at its price: purchase record, closing its offers and other
/// listings. The emails are sent by the caller, so a cart can bundle them.
async fn book(
    ctx: &mut Ctx,
    item: Sellable,
    price: Price,
    desk_sale: Option<DeskSale>,
) -> AppResult<(Event, SoldItem)> {
    let Sellable {
        relation,
        event,
        product,
    } = item;
    let total = price.total;
    let commission = (total * event.commission / Decimal::ONE_HUNDRED).cents();
    let payout = total - commission;

    sqlx::query("UPDATE event_products SET status = 'sold' WHERE id = $1")
        .bind(relation.id)
        .execute(ctx.conn())
        .await?;
    // The redeemed offer cannot be used again; every other open offer is void now
    if let Some(offer) = price.offer {
        sqlx::query(
            "UPDATE product_offers SET status = 'redeemed', responded_at = now() WHERE id = $1",
        )
        .bind(offer)
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
    // An offline sale counts from when the buyer paid, not from when it was booked
    let purchase: Uuid = sqlx::query_scalar(
        "INSERT INTO purchases (product_id, event_id, seller_id, total_amount, commission_amount, payout_amount,
           payout_status, payout_date, discount_percent, list_price, price_source, offer_id,
           product_title, category_id, category_label, product_attributes, seller_number,
           offer_record_id, desk_sale_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, false, 'epoch', $7, $8, $9::purchase_price_source, $10,
           $11, $12, (SELECT label FROM categories WHERE id = $12), $13,
           (SELECT number FROM event_sellers WHERE event_id = $2 AND user_id = $3),
           (SELECT id FROM offer_records WHERE event_id = $2 AND product_id = $1),
           $14, COALESCE($15, now()))
         RETURNING id",
    )
    .bind(product.id)
    .bind(event.id)
    .bind(product.vendor_id)
    .bind(total)
    .bind(commission)
    .bind(payout)
    .bind(price.discount)
    .bind(product.price)
    .bind(price.source)
    .bind(price.offer)
    .bind(&product.title)
    .bind(product.product_category)
    .bind(&product.attributes)
    .bind(desk_sale.map(|sale| sale.id))
    .bind(desk_sale.map(|sale| sale.sold_at))
    .fetch_one(ctx.conn())
    .await?;
    snapshot_seller(ctx.conn(), &event, product.vendor_id, false).await?;
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

/// Sells one item at the online price.
async fn sell_event_product(
    ctx: &mut Ctx,
    request: &SaleRequest,
    desk_sale: Option<DeskSale>,
) -> AppResult<(Event, SoldItem)> {
    let item = sellable(ctx, request.event_product_id.0).await?;
    let price = online_price(ctx, &item, request).await?;
    book(ctx, item, price, desk_sale).await
}

/// A sale of one cash desk (desk_sales): the ID comes from the app, so the same sale sent
/// twice is booked once.
#[derive(Clone, Copy)]
struct DeskSale {
    id: Uuid,
    sold_at: DateTime<Utc>,
}

enum Claim {
    New,
    /// Booked before; its purchases
    Booked(Vec<Uuid>),
}

/// Records a desk sale of the event, or finds that it was booked before. Concurrent calls
/// with the same ID conflict on the primary key and the mutation retries.
async fn claim_desk_sale(
    ctx: &mut Ctx,
    sale: DeskSale,
    event: Uuid,
    user: Uuid,
) -> AppResult<Claim> {
    let existing: Option<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM desk_sales WHERE id = $1")
            .bind(sale.id)
            .fetch_optional(ctx.conn())
            .await?;
    match existing {
        Some(other) if other != event => Err(AppError::bad_request("checkout.mixedEvents")),
        Some(_) => Ok(Claim::Booked(
            sqlx::query_scalar(
                "SELECT id FROM purchases WHERE desk_sale_id = $1 ORDER BY created_at, id",
            )
            .bind(sale.id)
            .fetch_all(ctx.conn())
            .await?,
        )),
        None => {
            sqlx::query(
                "INSERT INTO desk_sales (id, event_id, user_id, sold_at) VALUES ($1, $2, $3, $4)",
            )
            .bind(sale.id)
            .bind(event)
            .bind(user)
            .bind(sale.sold_at)
            .execute(ctx.conn())
            .await?;
            Ok(Claim::New)
        }
    }
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

/// One email to each seller of the sold items.
async fn notify_sellers(ctx: &mut Ctx, event: &Event, sold: &[SoldItem]) -> AppResult<()> {
    let mut by_vendor: Vec<(Uuid, Vec<&SoldItem>)> = Vec::new();
    for item in sold {
        match by_vendor
            .iter_mut()
            .find(|(vendor, _)| *vendor == item.product.vendor_id)
        {
            Some((_, items)) => items.push(item),
            None => by_vendor.push((item.product.vendor_id, vec![item])),
        }
    }
    for (vendor, items) in &by_vendor {
        notify_seller(ctx, event, *vendor, items).await?;
    }
    Ok(())
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
    let (event, sold) = sell_event_product(ctx, &request, None).await?;
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
    /// From the app: a retry after a lost reply returns the first sale
    desk_sale_id: Option<Id>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CartResult {
    purchase_ids: Vec<Uuid>,
    total: Decimal,
}

/// The cart: all items of one buyer in one transaction. If one cannot be sold, nothing is
/// sold and the error names the item. One email per seller, one receipt for the buyer.
/// With `deskSaleId` a cart sent again is not sold twice.
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

    let desk_sale = match args.desk_sale_id {
        Some(id) => {
            let sale = DeskSale {
                id: id.0,
                sold_at: Utc::now(),
            };
            let event = relation_by_id(ctx.conn(), args.items[0].event_product_id.0)
                .await?
                .ok_or_else(|| AppError::not_found("notFound.product"))?
                .event_id;
            require_team(ctx, event).await?;
            if let Claim::Booked(purchase_ids) = claim_desk_sale(ctx, sale, event, user).await? {
                let total: Decimal = sqlx::query_scalar(
                    "SELECT COALESCE(sum(total_amount), 0) FROM purchases WHERE desk_sale_id = $1",
                )
                .bind(sale.id)
                .fetch_one(ctx.conn())
                .await?;
                return Ok(CartResult {
                    purchase_ids,
                    total,
                });
            }
            Some(sale)
        }
        None => None,
    };

    let mut event: Option<Event> = None;
    let mut sold: Vec<SoldItem> = Vec::new();
    for item in &args.items {
        let result = async {
            let (item_event, item_sold) = sell_event_product(ctx, item, desk_sale).await?;
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
    notify_sellers(ctx, &event, &sold).await?;
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
    /// The team's note from the drop-off, e.g. the hook of the key
    internal_note: Option<String>,
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
        internal_note: relation.internal_note,
        title: product.title,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventIdArgs {
    event_id: Id,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SnapshotItem {
    #[serde(flatten)]
    item: CheckoutItem,
    /// Accepted offers the desk may redeem
    offers: Vec<OfferView>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CheckoutSnapshot {
    #[serde(with = "ms")]
    taken_at: DateTime<Utc>,
    items: Vec<SnapshotItem>,
}

/// Every item of the event as the cash desk sees it, for the app to sell offline. Event
/// team only. Not live: the app loads it again when it is online.
async fn get_checkout_snapshot(ctx: &mut Ctx, args: EventIdArgs) -> AppResult<CheckoutSnapshot> {
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    let event = docs::event(ctx.conn(), event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let minimum_allowed = event.resolved_features().minimum_price;
    let relations: Vec<EventProduct> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {} FROM event_products ep WHERE ep.event_id = $1",
        docs::EVENT_PRODUCT_COLUMNS
    )))
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;
    let products: HashMap<Uuid, Product> = docs::products_where(
        ctx.conn(),
        "p.id IN (SELECT product_id FROM event_products WHERE event_id = $1)",
        event_id,
    )
    .await?
    .into_iter()
    .map(|product| (product.id, product))
    .collect();
    let paid_out: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM event_sellers WHERE event_id = $1 AND payout_received",
    )
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;
    let categories = category_fields::load_categories(ctx.conn()).await?;
    let mut offers = accepted_offers_of_event(ctx, event_id).await?;
    let mut items = Vec::with_capacity(relations.len());
    for relation in relations {
        let Some(product) = products.get(&relation.product_id) else {
            continue;
        };
        let list_price = current_list_price(product, &relation);
        let fields = category_fields::category_fields(product.product_category, &categories);
        items.push(SnapshotItem {
            offers: offers.remove(&relation.id).unwrap_or_default(),
            item: CheckoutItem {
                event_product_id: relation.id,
                product_id: product.id,
                title: product.title.clone(),
                image: product.images.first().copied(),
                status: relation.status,
                price: product.price,
                discount_percent: relation.discount_percent,
                list_price,
                minimum_price: product
                    .minimum_price
                    .filter(|minimum| minimum_allowed && *minimum < list_price),
                seller_paid_out: paid_out.contains(&product.vendor_id),
                attributes: category_fields::describe_attributes(
                    fields,
                    product.attributes.as_ref(),
                ),
                internal_note: relation.internal_note,
            },
        });
    }
    Ok(CheckoutSnapshot {
        taken_at: Utc::now(),
        items,
    })
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum PriceSource {
    List,
    Offer,
    Negotiated,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OfflineItem {
    event_product_id: Id,
    product_id: Id,
    /// From the snapshot, for the conflict when the item is gone
    title: String,
    /// What the buyer paid at the desk
    paid: f64,
    price_source: PriceSource,
    offer_id: Option<Id>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OfflineSale {
    desk_sale_id: Id,
    #[serde(with = "ms")]
    sold_at: DateTime<Utc>,
    items: Vec<OfflineItem>,
    buyer_email: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SyncArgs {
    event_id: Id,
    sales: Vec<OfflineSale>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncedSale {
    desk_sale_id: Uuid,
    /// False when the sale was booked by an earlier call
    booked_now: bool,
    purchase_ids: Vec<Uuid>,
    /// Products that could not be booked; the team sees them in getSaleConflicts
    conflicts: Vec<Uuid>,
}

/// The price an offline desk took: the money is in the till, so it counts as paid even
/// when a discount changed since the snapshot. An offer is redeemed if it is still
/// accepted. None when the amount is no price.
async fn offline_price(
    ctx: &mut Ctx,
    item: &Sellable,
    request: &OfflineItem,
) -> AppResult<Option<Price>> {
    let Some(total) = money(request.paid).filter(|paid| *paid >= Decimal::ZERO) else {
        return Ok(None);
    };
    let offer = match (request.price_source, request.offer_id) {
        (PriceSource::Offer, Some(offer)) => accepted_offer(ctx, offer.0, item.relation.id)
            .await?
            .map(|_| offer.0),
        _ => None,
    };
    Ok(Some(match request.price_source {
        PriceSource::List => Price {
            total,
            discount: item.relation.discount_percent,
            source: "list",
            offer: None,
        },
        PriceSource::Offer => Price {
            total,
            discount: None,
            source: "offer",
            offer,
        },
        PriceSource::Negotiated => Price {
            total,
            discount: None,
            source: "negotiated",
            offer: None,
        },
    }))
}

/// Books the queue of an offline cash desk. Each sale is booked once, however often it
/// is sent. Unlike the online cart an item that cannot be sold any more (sold at another
/// desk, gone from the bazaar, seller paid out) does not stop the sale: the buyer has
/// paid, so it becomes a conflict for the team and the other items are booked.
async fn sync_offline_sales(ctx: &mut Ctx, args: SyncArgs) -> AppResult<Vec<SyncedSale>> {
    let user = ctx.require_user()?;
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    if args.sales.len() > MAX_SYNC_SALES {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "checkout.tooManySales",
            &[("max", &MAX_SYNC_SALES.to_string())],
        ));
    }
    let mut result = Vec::with_capacity(args.sales.len());
    for sale in args.sales {
        if sale.items.len() > MAX_CART_ITEMS {
            return Err(AppError::coded(
                axum::http::StatusCode::BAD_REQUEST,
                "checkout.tooMany",
                &[("max", &MAX_CART_ITEMS.to_string())],
            ));
        }
        let desk_sale = DeskSale {
            id: sale.desk_sale_id.0,
            // A wrong clock on the device must not date a sale into the future
            sold_at: sale.sold_at.min(Utc::now()),
        };
        if let Claim::Booked(purchase_ids) = claim_desk_sale(ctx, desk_sale, event_id, user).await?
        {
            result.push(SyncedSale {
                desk_sale_id: desk_sale.id,
                booked_now: false,
                purchase_ids,
                conflicts: Vec::new(),
            });
            continue;
        }
        let mut sold: Vec<SoldItem> = Vec::new();
        let mut conflicts = Vec::new();
        for request in &sale.items {
            let checked = match sellable(ctx, request.event_product_id.0).await {
                Ok(item) if item.event.id != event_id => Err("checkout.mixedEvents"),
                Ok(item) => match offline_price(ctx, &item, request).await? {
                    Some(price) => Ok((item, price)),
                    None => Err("checkout.invalidPrice"),
                },
                Err(err) => Err(err.code().ok_or(err)?),
            };
            match checked {
                Ok((item, price)) => sold.push(book(ctx, item, price, Some(desk_sale)).await?.1),
                Err(reason) => {
                    record_conflict(ctx, desk_sale.id, event_id, request, reason).await?;
                    conflicts.push(request.product_id.0);
                }
            }
        }
        if !sold.is_empty() {
            let event = docs::event(ctx.conn(), event_id)
                .await?
                .ok_or_else(|| AppError::not_found("notFound.event"))?;
            notify_sellers(ctx, &event, &sold).await?;
            // The desk checked the address offline; a bad one costs the receipt, not the sale
            if let Ok(Some(address)) = receipt_address(sale.buyer_email.as_deref()) {
                let locale = cash_desk_locale(ctx, user).await?;
                send_receipt(ctx, address, &event, &sold, locale).await?;
            }
        }
        if !conflicts.is_empty() {
            ctx.touch(Topic::Event(event_id));
        }
        result.push(SyncedSale {
            desk_sale_id: desk_sale.id,
            booked_now: true,
            purchase_ids: sold.iter().map(|item| item.purchase).collect(),
            conflicts,
        });
    }
    Ok(result)
}

async fn record_conflict(
    ctx: &mut Ctx,
    desk_sale: Uuid,
    event: Uuid,
    request: &OfflineItem,
    reason: &str,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO sale_conflicts (desk_sale_id, event_id, product_id, title, amount, reason)
         VALUES ($1, $2, (SELECT id FROM products WHERE id = $3),
           COALESCE((SELECT title FROM products WHERE id = $3), $4), $5, $6)",
    )
    .bind(desk_sale)
    .bind(event)
    .bind(request.product_id.0)
    .bind(&request.title)
    .bind(money(request.paid).unwrap_or_default())
    .bind(reason)
    .execute(ctx.conn())
    .await?;
    Ok(())
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct SaleConflict {
    #[serde(rename = "_id")]
    id: Uuid,
    product_id: Option<Uuid>,
    title: String,
    amount: Decimal,
    reason: String,
    #[serde(with = "ms")]
    sold_at: DateTime<Utc>,
    /// Who sold it at the desk
    cashier: Option<String>,
    #[serde(with = "ms_opt")]
    resolved_at: Option<DateTime<Utc>>,
}

/// Items of offline sales that could not be booked, open ones first. Event team only.
async fn get_sale_conflicts(ctx: &mut Ctx, args: EventIdArgs) -> AppResult<Vec<SaleConflict>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_as(
        "SELECT c.id, c.product_id, c.title, c.amount, c.reason, d.sold_at, u.name AS cashier,
                c.resolved_at
         FROM sale_conflicts c
         JOIN desk_sales d ON d.id = c.desk_sale_id
         LEFT JOIN users u ON u.id = d.user_id
         WHERE c.event_id = $1
         ORDER BY c.resolved_at IS NOT NULL, d.sold_at",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConflictArgs {
    conflict_id: Id,
}

/// The team settled a conflict by hand (money back to the buyer, or booked otherwise).
async fn resolve_sale_conflict(ctx: &mut Ctx, args: ConflictArgs) -> AppResult<Success> {
    let user = ctx.require_user()?;
    let event: Uuid = sqlx::query_scalar("SELECT event_id FROM sale_conflicts WHERE id = $1")
        .bind(args.conflict_id.0)
        .fetch_optional(ctx.conn())
        .await?
        .ok_or_else(|| AppError::not_found("notFound.content"))?;
    require_team(ctx, event).await?;
    sqlx::query(
        "UPDATE sale_conflicts SET resolved_at = now(), resolved_by = $2
         WHERE id = $1 AND resolved_at IS NULL",
    )
    .bind(args.conflict_id.0)
    .bind(user)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    Ok(Success { success: true })
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
    let event = docs::event(ctx.conn(), relation.event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    sales::assert_settlement_open(&event)?;
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

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SaleItem {
    purchase_id: Uuid,
    /// None once the product is deleted
    product_id: Option<Uuid>,
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
            let product = match purchase.product_id {
                Some(id) => {
                    if let std::collections::hash_map::Entry::Vacant(e) = products.entry(id) {
                        let product = docs::product(ctx.conn(), id).await?;
                        e.insert(product);
                    }
                    products[&id].as_ref()
                }
                None => None,
            };
            // The title at the sale, even when the item was renamed or deleted since
            let title = purchase
                .product_title
                .clone()
                .or_else(|| product.map(|p| p.title.clone()))
                .unwrap_or_else(|| "Gelöschter Artikel".to_owned());
            items.push(SaleItem {
                purchase_id: purchase.id,
                product_id: purchase.product_id,
                title,
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
