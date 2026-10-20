//! Items of sellers (convex/products.ts).

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::access::is_platform_admin;
use super::category_fields::{self, Attribute};
use super::docs::{self, Event, EventProduct, Product};
use super::event_products::{
    Events, are_relations_locked, fields_of, is_product_locked, missing_for_event, missing_label,
    pick_active_listing, relations_of_product,
};
use super::event_roles::find_organizer_event;
use super::features::discount_unavailable;
use super::sales::{self, SaleInfo};
use super::seller_records::{ItemChange, assert_item_data_unchanged};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms_opt};
use crate::storage;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "products.get" => get);
    register!(registry, Mutation "products.generateUploadUrl" => generate_upload_url);
    register!(registry, Mutation "products.addProduct" => add_product);
    register!(registry, Mutation "products.updateProduct" => update_product);
    register!(registry, Mutation "products.addProductImages" => add_product_images);
    register!(registry, Mutation "products.addProductAttributes" => add_product_attributes);
    register!(registry, Mutation "products.setProductReadyForSale" => set_product_ready_for_sale);
    register!(registry, Mutation "products.deleteProduct" => delete_product);
    register!(registry, Mutation "products.deleteProducts" => delete_products);
    register!(registry, Query "products.canDeleteProduct" => can_delete_product);
    register!(registry, Query "products.getProduct" => get_product);
    register!(registry, Query "products.getImageUrls" => get_image_urls);
    register!(registry, Query "products.getMyProducts" => get_my_products);
    register!(registry, Query "products.getProductsWithEvents" => get_products_with_events);
}

const CONDITIONS: [&str; 4] = ["new", "very-good", "good", "ok"];

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// All items that are not hidden, without the private fields.
async fn get(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<Product>> {
    ctx.read(Topic::Table("products"));
    Ok(
        docs::products_where(ctx.conn(), "p.hidden_at IS NULL AND $1", true)
            .await?
            .into_iter()
            .map(Product::without_private_fields)
            .collect(),
    )
}

/// Signed-in users only, so the storage cannot be filled anonymously. The upload goes to
/// the returned address and answers `{storageId}`, like the Convex upload URL.
async fn generate_upload_url(ctx: &mut Ctx, _: NoArgs) -> AppResult<String> {
    if ctx.user.is_none() {
        return Err(AppError::unauthorized("auth.loginToUpload"));
    }
    Ok(format!("{}/api/files", ctx.state.config.site_url))
}

/// Shared checks of the optional fields: attributes of the category only, minimum price
/// below the price.
pub(super) async fn normalize_extras(
    conn: &mut PgConnection,
    category: Uuid,
    price: Decimal,
    attributes: Option<&BTreeMap<String, String>>,
    minimum_price: Option<f64>,
) -> AppResult<(Option<BTreeMap<String, String>>, Option<Decimal>)> {
    let fields = fields_of(conn, category).await?;
    let minimum = match minimum_price {
        Some(minimum) if !minimum.is_finite() || minimum < 0.0 => {
            return Err(AppError::bad_request("product.minimumNegative"));
        }
        Some(minimum) => {
            let minimum = Decimal::from_f64(minimum).unwrap_or_default().round_dp(2);
            if minimum >= price {
                return Err(AppError::bad_request("product.minimumAbovePrice"));
            }
            Some(minimum)
        }
        None => None,
    };
    Ok((
        category_fields::sanitize_attributes(fields, attributes),
        minimum,
    ))
}

pub(super) fn price(value: f64) -> AppResult<Decimal> {
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::bad_request("product.priceNegative"));
    }
    Ok(Decimal::from_f64(value).unwrap_or_default().round_dp(2))
}

pub(super) fn check_condition(condition: &str) -> AppResult<()> {
    if CONDITIONS.contains(&condition) {
        Ok(())
    } else {
        Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "INVALID_ARGUMENTS",
            &[("details", "condition")],
        ))
    }
}

pub(super) async fn check_category(conn: &mut PgConnection, category: Uuid) -> AppResult<()> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)")
        .bind(category)
        .fetch_one(conn)
        .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::not_found("notFound.category"))
    }
}

pub async fn set_images(ctx: &mut Ctx, product: Uuid, images: &[Id]) -> AppResult<()> {
    for image in images {
        storage::ensure_exists(ctx.conn(), image.0).await?;
    }
    sqlx::query("DELETE FROM product_images WHERE product_id = $1")
        .bind(product)
        .execute(ctx.conn())
        .await?;
    for (position, image) in images.iter().enumerate() {
        sqlx::query(
            "INSERT INTO product_images (product_id, position, file_id) VALUES ($1, $2, $3)",
        )
        .bind(product)
        .bind(position as i16)
        .bind(image.0)
        .execute(ctx.conn())
        .await?;
    }
    Ok(())
}

pub(super) fn attributes_json(attributes: Option<BTreeMap<String, String>>) -> Value {
    serde_json::to_value(attributes.unwrap_or_default()).unwrap_or_default()
}

/// Touches what shows the item: its page, the lists of its events and the seller's lists.
async fn touch_product(ctx: &mut Ctx, product: Uuid, vendor: Uuid) -> sqlx::Result<()> {
    ctx.touch(Topic::Product(product));
    ctx.touch(Topic::User(vendor));
    ctx.touch(Topic::Table("products"));
    let events: Vec<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM event_products WHERE product_id = $1")
            .bind(product)
            .fetch_all(ctx.conn())
            .await?;
    for event in events {
        ctx.touch(Topic::Event(event));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AddArgs {
    title: String,
    vendor_id: Id,
    description: String,
    condition: String,
    images: Vec<Id>,
    product_category: Id,
    price: f64,
    ready_for_sale: bool,
    sold: bool,
    attributes: Option<BTreeMap<String, String>>,
    accepts_offers: Option<bool>,
    minimum_price: Option<f64>,
}

async fn add_product(ctx: &mut Ctx, args: AddArgs) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    if args.vendor_id.0 != user {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    check_condition(&args.condition)?;
    check_category(ctx.conn(), args.product_category.0).await?;
    let price = price(args.price)?;
    let (attributes, minimum) = normalize_extras(
        ctx.conn(),
        args.product_category.0,
        price,
        args.attributes.as_ref(),
        args.minimum_price,
    )
    .await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO products (title, vendor_id, description, condition, category_id, price, ready_for_sale,
           sold, attributes, accepts_offers, minimum_price)
         VALUES ($1, $2, $3, $4::product_condition, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
    )
    .bind(&args.title)
    .bind(user)
    .bind(&args.description)
    .bind(&args.condition)
    .bind(args.product_category.0)
    .bind(price)
    .bind(args.ready_for_sale)
    .bind(args.sold)
    .bind(attributes_json(attributes))
    .bind(args.accepts_offers)
    .bind(minimum)
    .fetch_one(ctx.conn())
    .await?;
    set_images(ctx, id, &args.images).await?;
    touch_product(ctx, id, user).await?;
    Ok(id)
}

async fn own_product(ctx: &mut Ctx, id: Uuid) -> AppResult<Product> {
    let user = ctx.require_user()?;
    let product = docs::product(ctx.conn(), id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if product.vendor_id != user {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    Ok(product)
}

async fn own_unlocked_product(ctx: &mut Ctx, id: Uuid) -> AppResult<Product> {
    let product = own_product(ctx, id).await?;
    if is_product_locked(ctx.conn(), id, Utc::now()).await? {
        return Err(AppError::bad_request("product.locked"));
    }
    Ok(product)
}

/// An edit must not remove what an upcoming event of the item requires, e.g. its last
/// photo or a required field like the frame number.
async fn assert_ready_for_upcoming_events(ctx: &mut Ctx, product: &Product) -> AppResult<()> {
    let fields = fields_of(ctx.conn(), product.product_category).await?;
    let now = Utc::now();
    for relation in relations_of_product(ctx.conn(), product.id).await? {
        let Some(event) = docs::event(ctx.conn(), relation.event_id).await? else {
            continue;
        };
        if event.end_date < now {
            continue;
        }
        let missing = missing_for_event(product, &event, fields);
        if missing.iter().any(|m| m == "photo") {
            return Err(AppError::coded(
                axum::http::StatusCode::BAD_REQUEST,
                "product.photoRequired",
                &[("event", &event.title)],
            ));
        }
        if let Some(field) = missing.iter().find(|m| m.starts_with("field:")) {
            return Err(AppError::coded(
                axum::http::StatusCode::BAD_REQUEST,
                "product.fieldRequired",
                &[
                    ("event", &event.title),
                    ("field", &missing_label(field, fields)),
                ],
            ));
        }
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateArgs {
    product_id: Id,
    title: String,
    description: String,
    condition: String,
    product_category: Id,
    images: Vec<Id>,
    price: f64,
    ready_for_sale: bool,
    attributes: Option<BTreeMap<String, String>>,
    accepts_offers: Option<bool>,
    minimum_price: Option<f64>,
}

/// The seller edits an item; not while it is handed in or sold, and not the fixed data
/// of a bazaar that keeps a record.
async fn update_product(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    let product = own_unlocked_product(ctx, args.product_id.0).await?;
    check_condition(&args.condition)?;
    check_category(ctx.conn(), args.product_category.0).await?;
    let price = price(args.price)?;
    let (attributes, minimum) = normalize_extras(
        ctx.conn(),
        args.product_category.0,
        price,
        args.attributes.as_ref(),
        args.minimum_price,
    )
    .await?;
    let empty = BTreeMap::new();
    assert_item_data_unchanged(
        ctx.conn(),
        &product,
        &ItemChange {
            title: Some(&args.title),
            category: Some(args.product_category.0),
            price: Some(price),
            attributes: Some(attributes.as_ref().unwrap_or(&empty)),
        },
    )
    .await?;
    let next = Product {
        title: args.title.clone(),
        description: args.description.clone(),
        condition: args.condition.clone(),
        product_category: args.product_category.0,
        images: args.images.iter().map(|id| id.0).collect(),
        price,
        ready_for_sale: args.ready_for_sale,
        attributes: attributes
            .clone()
            .map(|a| serde_json::to_value(a).unwrap_or_default()),
        accepts_offers: args.accepts_offers,
        minimum_price: minimum,
        ..product.clone()
    };
    assert_ready_for_upcoming_events(ctx, &next).await?;
    sqlx::query(
        "UPDATE products SET title = $2, description = $3, condition = $4::product_condition, category_id = $5,
           price = $6, ready_for_sale = $7, attributes = $8, accepts_offers = $9, minimum_price = $10,
           updated_at = now()
         WHERE id = $1",
    )
    .bind(product.id)
    .bind(&args.title)
    .bind(&args.description)
    .bind(&args.condition)
    .bind(args.product_category.0)
    .bind(price)
    .bind(args.ready_for_sale)
    .bind(attributes_json(attributes))
    .bind(args.accepts_offers)
    .bind(minimum)
    .execute(ctx.conn())
    .await?;
    set_images(ctx, product.id, &args.images).await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImagesArgs {
    product_id: Id,
    images: Vec<Id>,
}

/// Adds photos, e.g. when an event requires one before the item can be announced.
async fn add_product_images(ctx: &mut Ctx, args: ImagesArgs) -> AppResult<()> {
    let product = own_unlocked_product(ctx, args.product_id.0).await?;
    let mut images: Vec<Id> = product.images.iter().map(|id| Id(*id)).collect();
    images.extend(args.images);
    set_images(ctx, product.id, &images).await?;
    sqlx::query("UPDATE products SET updated_at = now() WHERE id = $1")
        .bind(product.id)
        .execute(ctx.conn())
        .await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AttributesArgs {
    product_id: Id,
    attributes: BTreeMap<String, String>,
}

/// Fills in category fields, e.g. the frame number an event requires; keeps the others.
async fn add_product_attributes(ctx: &mut Ctx, args: AttributesArgs) -> AppResult<()> {
    let product = own_unlocked_product(ctx, args.product_id.0).await?;
    let fields = fields_of(ctx.conn(), product.product_category).await?;
    let mut merged: BTreeMap<String, String> = product
        .attributes
        .as_ref()
        .and_then(|a| serde_json::from_value(a.clone()).ok())
        .unwrap_or_default();
    merged.extend(args.attributes);
    let merged = category_fields::sanitize_attributes(fields, Some(&merged));
    let empty = BTreeMap::new();
    assert_item_data_unchanged(
        ctx.conn(),
        &product,
        &ItemChange {
            title: None,
            category: None,
            price: None,
            attributes: Some(merged.as_ref().unwrap_or(&empty)),
        },
    )
    .await?;
    sqlx::query("UPDATE products SET attributes = $2, updated_at = now() WHERE id = $1")
        .bind(product.id)
        .bind(attributes_json(merged))
        .execute(ctx.conn())
        .await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadyArgs {
    product_id: Id,
    ready_for_sale: bool,
}

async fn set_product_ready_for_sale(ctx: &mut Ctx, args: ReadyArgs) -> AppResult<()> {
    let product = own_product(ctx, args.product_id.0).await?;
    sqlx::query("UPDATE products SET ready_for_sale = $2 WHERE id = $1")
        .bind(product.id)
        .bind(args.ready_for_sale)
        .execute(ctx.conn())
        .await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    Ok(())
}

struct DeletionInfo {
    can_delete: bool,
    has_history: bool,
}

/// Items handed in or sold at a bazaar stay until it has ended; returned items are back
/// with the seller and may go right away.
async fn deletion_info(
    conn: &mut PgConnection,
    relations: &[EventProduct],
    events: &mut Events,
) -> sqlx::Result<DeletionInfo> {
    let now = Utc::now();
    let mut info = DeletionInfo {
        can_delete: true,
        has_history: false,
    };
    for relation in relations {
        if relation.status == "announced" {
            continue;
        }
        info.has_history = true;
        if relation.status == "returned" {
            continue;
        }
        if events
            .get(&mut *conn, relation.event_id)
            .await?
            .is_some_and(|event| event.end_date > now)
        {
            info.can_delete = false;
        }
    }
    Ok(info)
}

/// Deletes an item of the seller. Items with bazaar history are archived instead, so the
/// organizer's settlement keeps its data; they leave the seller's list.
async fn delete_own_product(ctx: &mut Ctx, id: Uuid) -> AppResult<()> {
    let user = ctx.require_user()?;
    let Some(product) = docs::product(ctx.conn(), id).await? else {
        return Ok(());
    };
    if product.vendor_id != user {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let relations = relations_of_product(ctx.conn(), id).await?;
    let info = deletion_info(ctx.conn(), &relations, &mut Events::default()).await?;
    if !info.can_delete {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "product.acceptedNoDelete",
            &[("title", &product.title)],
        ));
    }
    touch_product(ctx, id, user).await?;
    sqlx::query("DELETE FROM event_products WHERE product_id = $1 AND status = 'announced'")
        .bind(id)
        .execute(ctx.conn())
        .await?;
    if info.has_history {
        sqlx::query(
            "UPDATE products SET archived_at = now(), ready_for_sale = false WHERE id = $1",
        )
        .bind(id)
        .execute(ctx.conn())
        .await?;
    } else {
        // Images, offers and questions go with it; the files are left to the cleanup
        sqlx::query("DELETE FROM products WHERE id = $1")
            .bind(id)
            .execute(ctx.conn())
            .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdArgs {
    id: Id,
}

async fn delete_product(ctx: &mut Ctx, args: IdArgs) -> AppResult<()> {
    own_product(ctx, args.id.0).await?;
    delete_own_product(ctx, args.id.0).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdsArgs {
    ids: Vec<Id>,
}

async fn delete_products(ctx: &mut Ctx, args: IdsArgs) -> AppResult<()> {
    ctx.require_user()?;
    for id in args.ids {
        delete_own_product(ctx, id.0).await?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductArgs {
    product_id: Id,
}

async fn can_delete_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<bool> {
    let Some(user) = ctx.user else {
        return Ok(false);
    };
    ctx.read(Topic::Product(args.product_id.0));
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(false);
    };
    if product.vendor_id != user {
        return Ok(false);
    }
    let relations = relations_of_product(ctx.conn(), product.id).await?;
    Ok(
        deletion_info(ctx.conn(), &relations, &mut Events::default())
            .await?
            .can_delete,
    )
}

/// Discount rules of the running event, so the app can explain why discounts are locked.
#[skip_serializing_none]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountRules {
    allowed: bool,
    reason: Option<String>,
    max_discount_percent: u32,
    #[serde(with = "ms_opt")]
    discount_starts_at: Option<DateTime<Utc>>,
}

fn discount_rules(event: &Event, now: DateTime<Utc>) -> DiscountRules {
    let features = event.resolved_features();
    let reason = discount_unavailable(event, now).map(|code| crate::i18n::error_text(code, &[]));
    DiscountRules {
        allowed: reason.is_none(),
        reason,
        max_discount_percent: features.max_discount_percent,
        discount_starts_at: features.discount_starts_at,
    }
}

#[derive(Default)]
struct RunningInfo {
    discount_percent: Option<Decimal>,
    discount_rules: Option<DiscountRules>,
    event_status: Option<String>,
    is_available: Option<bool>,
}

/// Discount and status of the item in the event running right now, if any.
async fn running_event_info(
    conn: &mut PgConnection,
    relations: &[EventProduct],
    events: &mut Events,
    now: DateTime<Utc>,
) -> sqlx::Result<RunningInfo> {
    for relation in relations {
        if let Some(event) = events.get(&mut *conn, relation.event_id).await?
            && event.start_date <= now
            && now <= event.end_date
        {
            return Ok(RunningInfo {
                discount_percent: relation.discount_percent,
                discount_rules: Some(discount_rules(event, now)),
                event_status: Some(relation.status.clone()),
                is_available: Some(relation.status == "available"),
            });
        }
    }
    Ok(RunningInfo::default())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ActiveListing {
    event_id: Uuid,
    event_product_id: Uuid,
    event_title: String,
    features: Value,
    /// Status in that event and its dates, e.g. for when offers open
    status: String,
    #[serde(with = "crate::shape::ms")]
    start_date: DateTime<Utc>,
    #[serde(with = "crate::shape::ms")]
    end_date: DateTime<Utc>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProductDetails {
    #[serde(flatten)]
    product: Product,
    attribute_list: Vec<Attribute>,
    #[serde(serialize_with = "nullable")]
    active_listing: Option<ActiveListing>,
    /// Price can be negotiated at the cash desk; the minimum itself stays private
    is_negotiable: bool,
    vendor_phone: Option<String>,
    vendor_first_name: Option<String>,
    vendor_last_name: Option<String>,
    category_name: String,
    is_organizer: bool,
    #[serde(serialize_with = "nullable")]
    organizer_event_id: Option<Uuid>,
    discount_percent: Option<Decimal>,
    discount_rules: Option<DiscountRules>,
    is_locked: bool,
    event_status: Option<String>,
    is_available: Option<bool>,
}

fn nullable<T: Serialize, S: serde::Serializer>(
    value: &Option<T>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    value.serialize(serializer)
}

/// The resolved features as the app reads them (resolveEventFeatures).
fn features_json(event: &Event) -> Value {
    let f = event.resolved_features();
    let mut value = serde_json::json!({
        "discounts": f.discounts,
        "maxDiscountPercent": f.max_discount_percent,
        "priceOffers": f.price_offers,
        "minimumPrice": f.minimum_price,
        "questions": f.questions,
        "questionsDuringEventOnly": f.questions_during_event_only,
        "photosOptional": f.photos_optional,
        "labelFormat": f.label_format,
        "priceOnLabel": f.price_on_label,
        "privateSellersOnly": f.private_sellers_only,
        "fixedSellerData": f.fixed_seller_data,
    });
    let map = value.as_object_mut().expect("object");
    if let Some(start) = f.discount_starts_at {
        map.insert(
            "discountStartsAt".into(),
            serde_json::json!(crate::shape::to_ms(&start)),
        );
    }
    if !f.required_fields.is_empty() {
        map.insert(
            "requiredFields".into(),
            serde_json::json!(f.required_fields),
        );
    }
    if let Some(limit) = f.max_items_per_seller {
        map.insert("maxItemsPerSeller".into(), serde_json::json!(limit));
    }
    if let Some(fee) = f.intake_fee {
        map.insert("intakeFee".into(), serde_json::json!(fee));
    }
    value
}

/// The item page: for the public without private fields; the seller and the organizers
/// of its events see more. Hidden items only for seller, event team and admins.
async fn get_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<Option<ProductDetails>> {
    ctx.read(Topic::Product(args.product_id.0));
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(None);
    };
    let viewer = ctx.user;
    let now = Utc::now();
    let relations = relations_of_product(ctx.conn(), product.id).await?;
    for relation in &relations {
        ctx.read(Topic::Event(relation.event_id));
    }
    let mut events = Events::default();
    let organizer_event = match viewer {
        Some(user) => {
            let ids: Vec<Uuid> = relations.iter().map(|r| r.event_id).collect();
            find_organizer_event(ctx.conn(), &ids, user).await?
        }
        None => None,
    };
    let is_organizer = organizer_event.is_some();
    let is_locked =
        product.sold || are_relations_locked(ctx.conn(), &relations, &mut events, now).await?;
    let running = running_event_info(ctx.conn(), &relations, &mut events, now).await?;
    let is_owner = viewer == Some(product.vendor_id);
    let is_admin = is_platform_admin(ctx.conn(), viewer).await?;
    if product.moderation.is_some() && !is_owner && !is_organizer && !is_admin {
        return Ok(None);
    }
    let fields = fields_of(ctx.conn(), product.product_category).await?;
    let listing = pick_active_listing(ctx.conn(), &relations, &mut events, now).await?;
    let vendor = if is_organizer {
        ctx.read(Topic::User(product.vendor_id));
        docs::user(ctx.conn(), product.vendor_id).await?
    } else {
        None
    };
    let category: Option<String> = sqlx::query_scalar("SELECT label FROM categories WHERE id = $1")
        .bind(product.product_category)
        .fetch_optional(ctx.conn())
        .await?;
    let is_negotiable = listing.as_ref().is_some_and(|(event, _)| {
        event.resolved_features().minimum_price && product.minimum_price.is_some()
    });
    Ok(Some(ProductDetails {
        attribute_list: category_fields::describe_attributes(fields, product.attributes.as_ref()),
        active_listing: listing.map(|(event, relation)| ActiveListing {
            event_id: event.id,
            event_product_id: relation.id,
            event_title: event.title.clone(),
            features: features_json(&event),
            status: relation.status,
            start_date: event.start_date,
            end_date: event.end_date,
        }),
        is_negotiable,
        vendor_phone: vendor.as_ref().and_then(|v| v.phone.clone()),
        vendor_first_name: is_organizer.then(|| {
            vendor
                .as_ref()
                .and_then(|v| v.first_name.clone().or_else(|| v.name.clone()))
                .unwrap_or_else(|| "Anonym".to_owned())
        }),
        vendor_last_name: is_organizer.then(|| {
            vendor
                .as_ref()
                .and_then(|v| v.last_name.clone())
                .unwrap_or_default()
        }),
        category_name: category.unwrap_or_else(|| "–".to_owned()),
        is_organizer,
        organizer_event_id: organizer_event,
        discount_percent: running.discount_percent,
        discount_rules: running.discount_rules,
        is_locked,
        event_status: running.event_status,
        is_available: running.is_available,
        product: if is_owner || is_organizer {
            product
        } else {
            product.without_private_fields()
        },
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImageUrlsArgs {
    storage_ids: Vec<Id>,
}

async fn get_image_urls(ctx: &mut Ctx, args: ImageUrlsArgs) -> AppResult<Vec<String>> {
    let ids: Vec<Uuid> = args.storage_ids.iter().map(|id| id.0).collect();
    let existing: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM files WHERE id = ANY($1)")
        .bind(&ids)
        .fetch_all(ctx.conn())
        .await?;
    let config = ctx.state.config.clone();
    Ok(ids
        .into_iter()
        .filter(|id| existing.contains(id))
        .map(|id| storage::url(&config, id))
        .collect())
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProductWithEvents {
    #[serde(flatten)]
    product: Product,
    event_ids: Vec<Uuid>,
    discount_percent: Option<Decimal>,
    discount_rules: Option<DiscountRules>,
    pending_offer_count: Option<i64>,
    unanswered_question_count: Option<i64>,
    is_locked: bool,
    can_delete: Option<bool>,
    event_status: Option<String>,
    is_available: Option<bool>,
    /// Sold items: price, fee and payout of the sale
    sale: Option<SaleInfo>,
}

/// The seller's items (without archived ones) with their state in events.
async fn get_my_products(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<ProductWithEvents>> {
    let user = ctx.require_user()?;
    ctx.read(Topic::User(user));
    let products = docs::products_where(
        ctx.conn(),
        "p.vendor_id = $1 AND p.archived_at IS NULL",
        user,
    )
    .await?;
    let now = Utc::now();
    let mut events = Events::default();
    let mut result = Vec::new();
    for product in products {
        ctx.read(Topic::Product(product.id));
        let relations = relations_of_product(ctx.conn(), product.id).await?;
        for relation in &relations {
            ctx.read(Topic::Event(relation.event_id));
        }
        let event_ids = relations.iter().map(|r| r.event_id).collect();
        let can_delete = deletion_info(ctx.conn(), &relations, &mut events)
            .await?
            .can_delete;
        if product.sold {
            let purchase = docs::purchases_where(ctx.conn(), "product_id = $1", product.id)
                .await?
                .into_iter()
                .next();
            result.push(ProductWithEvents {
                event_ids,
                discount_percent: purchase.as_ref().and_then(|p| p.discount_percent),
                discount_rules: None,
                pending_offer_count: Some(0),
                unanswered_question_count: Some(0),
                is_locked: true,
                can_delete: Some(can_delete),
                event_status: None,
                is_available: None,
                sale: purchase.as_ref().map(sales::sale_info),
                product,
            });
            continue;
        }
        let is_locked = are_relations_locked(ctx.conn(), &relations, &mut events, now).await?;
        let running = running_event_info(ctx.conn(), &relations, &mut events, now).await?;
        // Offers belong to an event of the item; only running or upcoming ones count
        let pending_offers: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM product_offers o JOIN events e ON e.id = o.event_id
             WHERE o.product_id = $1 AND o.status = 'pending' AND e.end_date >= now()",
        )
        .bind(product.id)
        .fetch_one(ctx.conn())
        .await?;
        let unanswered: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM product_questions WHERE product_id = $1 AND answer IS NULL",
        )
        .bind(product.id)
        .fetch_one(ctx.conn())
        .await?;
        result.push(ProductWithEvents {
            event_ids,
            discount_percent: running.discount_percent,
            discount_rules: running.discount_rules,
            pending_offer_count: Some(pending_offers),
            unanswered_question_count: Some(unanswered),
            is_locked,
            can_delete: Some(can_delete),
            event_status: running.event_status,
            is_available: running.is_available,
            sale: None,
            product,
        });
    }
    Ok(result)
}

/// All visible items with their events, for the public overview.
async fn get_products_with_events(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<ProductWithEvents>> {
    ctx.read(Topic::Table("products"));
    let products = docs::products_where(ctx.conn(), "p.hidden_at IS NULL AND $1", true).await?;
    let relations: Vec<(Uuid, Uuid)> =
        sqlx::query_as("SELECT product_id, event_id FROM event_products ORDER BY created_at, id")
            .fetch_all(ctx.conn())
            .await?;
    Ok(products
        .into_iter()
        .map(|product| ProductWithEvents {
            event_ids: relations
                .iter()
                .filter(|(p, _)| *p == product.id)
                .map(|(_, e)| *e)
                .collect(),
            discount_percent: None,
            discount_rules: None,
            pending_offer_count: None,
            unanswered_question_count: None,
            is_locked: false,
            can_delete: None,
            event_status: None,
            is_available: None,
            sale: None,
            product: product.without_private_fields(),
        })
        .collect())
}
