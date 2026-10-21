//! Items in events: announcing, intake, returns, discounts, location.
//!
//! addProductToEvent only accepts the status `announced` from the seller (the app never
//! sends another), so a seller cannot register an item as handed in or sold, skipping
//! intake and cash desk.

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::category_fields::{self, CategoryField};
use super::docs::{self, EVENT_PRODUCT_COLUMNS, Event, EventProduct, Product, User};
use super::event_roles::{TEAM, assert_vendor_not_paid_out, has_any_role_or_admin, require_team};
use super::events::is_event_approved;
use super::features::discount_unavailable;
use super::offers::{close_offers_for_event_product, reopen_closed_offers};
use super::sales::{self, SaleInfo};
use super::seller_numbers::assert_item_limit;
use super::seller_records::{fixed_item_data, keeps_seller_record, record_seller_details};
use crate::error::{AppError, AppResult};
use crate::flags;
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

const MAX_INTERNAL_NOTE_LENGTH: usize = 500;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventProducts.addProductToEvent" => add_product_to_event);
    register!(registry, Mutation "eventProducts.removeProductFromEvent" => remove_product_from_event);
    register!(registry, Mutation "eventProducts.setProductEvents" => set_product_events);
    register!(registry, Query "eventProducts.getEventIdsForProduct" => get_event_ids_for_product);
    register!(registry, Query "eventProducts.getEventLocationsForProduct" => get_event_locations_for_product);
    register!(registry, Query "eventProducts.getProductIdsForEvent" => get_product_ids_for_event);
    register!(registry, Query "eventProducts.getMyEventProductStatuses" => get_my_event_product_statuses);
    register!(registry, Query "eventProducts.getFixedItemData" => get_fixed_item_data);
    register!(registry, Query "eventProducts.isProductLockedForSeller" => is_product_locked_for_seller);
    register!(registry, Query "eventProducts.getProductsForEvent" => get_products_for_event);
    register!(registry, Query "eventProducts.getProductsForEventManagement" => get_products_for_event_management);
    register!(registry, Query "eventProducts.getEventProduct" => get_event_product);
    register!(registry, Mutation "eventProducts.setEventProductNote" => set_event_product_note);
    register!(registry, Mutation "eventProducts.updateProductDiscount" => update_product_discount);
    register!(registry, Mutation "eventProducts.updateProductStatus" => update_product_status);
    register!(registry, Mutation "eventProducts.setEventProductLocationCategory" => set_event_product_location_category);
    register!(registry, Mutation "eventProducts.markAllVendorProductsAvailable" => mark_all_vendor_products_available);
    register!(registry, Mutation "eventProducts.markAllVendorProductsReturned" => mark_all_vendor_products_returned);
    register!(registry, Mutation "eventProducts.undoReturn" => undo_return);
}

/// Loads events at most once per function (many relations share one event).
#[derive(Default)]
pub struct Events(HashMap<Uuid, Option<Event>>);

impl Events {
    pub async fn get(&mut self, conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<&Event>> {
        if let std::collections::hash_map::Entry::Vacant(entry) = self.0.entry(id) {
            entry.insert(docs::event(conn, id).await?);
        }
        Ok(self.0[&id].as_ref())
    }
}

pub async fn relations_of_product(
    conn: &mut PgConnection,
    product: Uuid,
) -> sqlx::Result<Vec<EventProduct>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_PRODUCT_COLUMNS} FROM event_products ep WHERE ep.product_id = $1 ORDER BY ep.created_at, ep.id"
    )))
    .bind(product)
    .fetch_all(conn)
    .await
}

pub async fn relation(
    conn: &mut PgConnection,
    event: Uuid,
    product: Uuid,
) -> sqlx::Result<Option<EventProduct>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_PRODUCT_COLUMNS} FROM event_products ep WHERE ep.event_id = $1 AND ep.product_id = $2"
    )))
    .bind(event)
    .bind(product)
    .fetch_optional(conn)
    .await
}

pub async fn relation_by_id(
    conn: &mut PgConnection,
    id: Uuid,
) -> sqlx::Result<Option<EventProduct>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_PRODUCT_COLUMNS} FROM event_products ep WHERE ep.id = $1"
    )))
    .bind(id)
    .fetch_optional(conn)
    .await
}

/// The listing that matters for buyers right now: the running or next upcoming event in
/// which the product is announced or available. Offers and questions belong to it.
pub async fn pick_active_listing(
    conn: &mut PgConnection,
    relations: &[EventProduct],
    events: &mut Events,
    now: DateTime<Utc>,
) -> sqlx::Result<Option<(Event, EventProduct)>> {
    let mut best: Option<(Event, EventProduct)> = None;
    for relation in relations {
        if relation.status != "announced" && relation.status != "available" {
            continue;
        }
        let Some(event) = events.get(&mut *conn, relation.event_id).await? else {
            continue;
        };
        if event.end_date < now || event.moderation.is_some() {
            continue;
        }
        if event.visibility == "public" && !is_event_approved(event) {
            continue;
        }
        if best
            .as_ref()
            .is_none_or(|(b, _)| event.start_date < b.start_date)
        {
            best = Some((event.clone(), relation.clone()));
        }
    }
    Ok(best)
}

pub async fn find_active_listing(
    conn: &mut PgConnection,
    product: Uuid,
    now: DateTime<Utc>,
) -> sqlx::Result<Option<(Event, EventProduct)>> {
    let relations = relations_of_product(&mut *conn, product).await?;
    pick_active_listing(conn, &relations, &mut Events::default(), now).await
}

/// Locked for the seller while handed in at a running or upcoming bazaar, and for good
/// once sold. Returned items are back with the seller; items still available after a
/// bazaar ended (never booked back) do not lock either.
pub async fn are_relations_locked(
    conn: &mut PgConnection,
    relations: &[EventProduct],
    events: &mut Events,
    now: DateTime<Utc>,
) -> sqlx::Result<bool> {
    for relation in relations {
        if relation.status == "sold" {
            return Ok(true);
        }
        if relation.status != "available" {
            continue;
        }
        if events
            .get(&mut *conn, relation.event_id)
            .await?
            .is_some_and(|event| event.end_date >= now)
        {
            return Ok(true);
        }
    }
    Ok(false)
}

pub async fn is_product_locked(
    conn: &mut PgConnection,
    product: Uuid,
    now: DateTime<Utc>,
) -> sqlx::Result<bool> {
    let sold: Option<bool> = sqlx::query_scalar("SELECT sold FROM products WHERE id = $1")
        .bind(product)
        .fetch_optional(&mut *conn)
        .await?;
    if sold == Some(true) {
        return Ok(true);
    }
    let relations = relations_of_product(&mut *conn, product).await?;
    are_relations_locked(conn, &relations, &mut Events::default(), now).await
}

/// What the item still needs for this event: a photo (`photo`) or a required field of
/// its category (`field:<key>`). Products may be saved without photo; only events that
/// require photos ask for one.
pub fn missing_for_event(
    product: &Product,
    event: &Event,
    fields: &[CategoryField],
) -> Vec<String> {
    let features = event.resolved_features();
    let mut missing = Vec::new();
    if product.images.is_empty() && !features.photos_optional {
        missing.push("photo".to_owned());
    }
    for key in &features.required_fields {
        if !fields.iter().any(|field| field.key == key) {
            continue;
        }
        let value = product
            .attributes
            .as_ref()
            .and_then(|a| a.get(key))
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("");
        if value.is_empty() {
            missing.push(format!("field:{key}"));
        }
    }
    missing
}

/// German name of what is missing, for error messages.
pub fn missing_label(info: &str, fields: &[CategoryField]) -> String {
    match info.strip_prefix("field:") {
        Some(key) => fields
            .iter()
            .find(|field| field.key == key)
            .map_or_else(|| key.to_owned(), |field| field.label.to_owned()),
        None => "Foto".to_owned(),
    }
}

pub async fn fields_of(
    conn: &mut PgConnection,
    category: Uuid,
) -> sqlx::Result<&'static [CategoryField]> {
    let categories = category_fields::load_categories(conn).await?;
    Ok(category_fields::category_fields(category, &categories))
}

/// Refuses a new announcement when the item lacks something the event requires.
async fn assert_ready_for_event(
    conn: &mut PgConnection,
    product: &Product,
    event: &Event,
) -> AppResult<()> {
    let fields = fields_of(conn, product.product_category).await?;
    let missing = missing_for_event(product, event, fields);
    if missing.is_empty() {
        return Ok(());
    }
    let labels: Vec<String> = missing
        .iter()
        .map(|info| missing_label(info, fields))
        .collect();
    Err(AppError::coded(
        axum::http::StatusCode::BAD_REQUEST,
        "product.incomplete",
        &[
            ("title", &product.title),
            ("event", &event.title),
            ("missing", &labels.join(", ")),
        ],
    ))
}

/// A bazaar that keeps a record of who offered what: once started, its items stay.
fn assert_removable_from_record(event: &Event) -> AppResult<()> {
    if keeps_seller_record(event) && event.start_date <= Utc::now() {
        return Err(AppError::bad_request("product.recordedNoRemove"));
    }
    Ok(())
}

async fn own_product(ctx: &mut Ctx, product: Uuid) -> AppResult<(Uuid, Product)> {
    let user = ctx.require_user()?;
    let product = docs::product(ctx.conn(), product)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if product.vendor_id != user {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    Ok((user, product))
}

async fn event_of(ctx: &mut Ctx, event: Uuid) -> AppResult<Event> {
    docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))
}

pub fn touch_listing(ctx: &mut Ctx, event: Uuid, product: Uuid, vendor: Uuid) {
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::Product(product));
    ctx.touch(Topic::User(vendor));
}

async fn insert_announcement(ctx: &mut Ctx, event: &Event, product: &Product) -> AppResult<Uuid> {
    assert_ready_for_event(ctx.conn(), product, event).await?;
    assert_item_limit(ctx, event, product.vendor_id, 1).await?;
    let id = sqlx::query_scalar(
        "INSERT INTO event_products (event_id, product_id, status) VALUES ($1, $2, 'announced') RETURNING id",
    )
    .bind(event.id)
    .bind(product.id)
    .fetch_one(ctx.conn())
    .await?;
    record_seller_details(ctx.conn(), event, product.vendor_id).await?;
    touch_listing(ctx, event.id, product.id, product.vendor_id);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AddArgs {
    event_id: Id,
    product_id: Id,
    status: Option<String>,
}

/// The seller announces their item for an event; returns the existing relation if any.
async fn add_product_to_event(ctx: &mut Ctx, args: AddArgs) -> AppResult<Uuid> {
    ctx.require_user()?;
    if args
        .status
        .as_deref()
        .is_some_and(|status| status != "announced")
    {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let event = event_of(ctx, args.event_id.0).await?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("product.pastNoAdd"));
    }
    let (_, product) = own_product(ctx, args.product_id.0).await?;
    if product.sold {
        return Err(AppError::bad_request("product.soldNoEvents"));
    }
    if let Some(existing) = relation(ctx.conn(), event.id, product.id).await? {
        return Ok(existing.id);
    }
    insert_announcement(ctx, &event, &product).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventProductArgs {
    event_id: Id,
    product_id: Id,
}

/// The seller withdraws an announced item.
async fn remove_product_from_event(ctx: &mut Ctx, args: EventProductArgs) -> AppResult<()> {
    ctx.require_user()?;
    let event = event_of(ctx, args.event_id.0).await?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("product.pastNoRemove"));
    }
    let (_, product) = own_product(ctx, args.product_id.0).await?;
    if product.sold {
        return Err(AppError::bad_request("product.soldNoRemove"));
    }
    if let Some(relation) = relation(ctx.conn(), event.id, product.id).await? {
        if relation.status != "announced" {
            return Err(AppError::bad_request("product.acceptedNoRemove"));
        }
        assert_removable_from_record(&event)?;
        sqlx::query("DELETE FROM event_products WHERE id = $1")
            .bind(relation.id)
            .execute(ctx.conn())
            .await?;
        touch_listing(ctx, event.id, product.id, product.vendor_id);
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SetEventsArgs {
    product_id: Id,
    event_ids: Vec<Id>,
}

/// Replaces the announcements of an item. Handed-in, sold and returned entries are the
/// bazaar's history and stay as they are.
async fn set_product_events(ctx: &mut Ctx, args: SetEventsArgs) -> AppResult<Vec<Uuid>> {
    let (_, product) = own_product(ctx, args.product_id.0).await?;
    if product.sold && !args.event_ids.is_empty() {
        return Err(AppError::bad_request("product.soldNoEvents"));
    }
    let wanted: Vec<Uuid> = args.event_ids.iter().map(|id| id.0).collect();
    let existing = relations_of_product(ctx.conn(), product.id).await?;
    for relation in &existing {
        if relation.status == "announced" && !wanted.contains(&relation.event_id) {
            if let Some(event) = docs::event(ctx.conn(), relation.event_id).await? {
                assert_removable_from_record(&event)?;
            }
            close_offers_for_event_product(ctx, relation.id, &product.title, "removed").await?;
            sqlx::query("DELETE FROM event_products WHERE id = $1")
                .bind(relation.id)
                .execute(ctx.conn())
                .await?;
            touch_listing(ctx, relation.event_id, product.id, product.vendor_id);
        }
    }
    let mut ids = Vec::new();
    for event_id in wanted {
        if let Some(existing) = existing.iter().find(|r| r.event_id == event_id) {
            ids.push(existing.id);
            continue;
        }
        let Some(event) = docs::event(ctx.conn(), event_id).await? else {
            continue;
        };
        if event.end_date < Utc::now() {
            return Err(AppError::bad_request("product.pastNoLink"));
        }
        ids.push(insert_announcement(ctx, &event, &product).await?);
    }
    Ok(ids)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductArgs {
    product_id: Id,
}

async fn get_event_ids_for_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<Vec<Uuid>> {
    ctx.read(Topic::Product(args.product_id.0));
    Ok(sqlx::query_scalar(
        "SELECT event_id FROM event_products WHERE product_id = $1 ORDER BY created_at, id",
    )
    .bind(args.product_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct EventLocation {
    event_id: Uuid,
    location_label: Option<String>,
}

async fn get_event_locations_for_product(
    ctx: &mut Ctx,
    args: ProductArgs,
) -> AppResult<Vec<EventLocation>> {
    ctx.read(Topic::Product(args.product_id.0));
    Ok(sqlx::query_as(
        "SELECT ep.event_id, l.label AS location_label FROM event_products ep
         LEFT JOIN event_location_categories l ON l.id = ep.location_category_id
         WHERE ep.product_id = $1 ORDER BY ep.created_at, ep.id",
    )
    .bind(args.product_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn get_product_ids_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<Uuid>> {
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_scalar(
        "SELECT product_id FROM event_products WHERE event_id = $1 ORDER BY created_at, id",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct MyStatus {
    product_id: Uuid,
    status: String,
    discount_percent: Option<Decimal>,
}

async fn get_my_event_product_statuses(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<MyStatus>> {
    let user = ctx.require_user()?;
    ctx.read(Topic::Event(args.event_id.0));
    ctx.read(Topic::User(user));
    Ok(sqlx::query_as(
        "SELECT ep.product_id, ep.status::text AS status, ep.discount_percent
         FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2 ORDER BY ep.created_at, ep.id",
    )
    .bind(args.event_id.0)
    .bind(user)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FixedItemData {
    fixed: bool,
    field_keys: Vec<String>,
}

/// Which item data is fixed for the seller, see seller_records::fixed_item_data.
async fn get_fixed_item_data(ctx: &mut Ctx, args: ProductArgs) -> AppResult<FixedItemData> {
    ctx.read(Topic::Product(args.product_id.0));
    Ok(
        match fixed_item_data(ctx.conn(), args.product_id.0).await? {
            Some(keys) => FixedItemData {
                fixed: true,
                field_keys: keys,
            },
            None => FixedItemData {
                fixed: false,
                field_keys: Vec::new(),
            },
        },
    )
}

async fn is_product_locked_for_seller(ctx: &mut Ctx, args: ProductArgs) -> AppResult<bool> {
    ctx.read(Topic::Product(args.product_id.0));
    Ok(is_product_locked(ctx.conn(), args.product_id.0, Utc::now()).await?)
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedProduct {
    #[serde(flatten)]
    pub product: Product,
    pub event_product_id: Uuid,
    pub status: String,
    pub discount_percent: Option<Decimal>,
    pub location_category_id: Option<Uuid>,
    pub location_label: Option<String>,
    pub internal_note: Option<String>,
    pub sale: Option<SaleInfo>,
}

async fn listed_products(
    ctx: &mut Ctx,
    event: Uuid,
) -> AppResult<Vec<(EventProduct, Product, Option<String>)>> {
    let relations: Vec<EventProduct> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_PRODUCT_COLUMNS} FROM event_products ep WHERE ep.event_id = $1 ORDER BY ep.created_at, ep.id"
    )))
    .bind(event)
    .fetch_all(ctx.conn())
    .await?;
    let products = docs::products_where(
        ctx.conn(),
        "p.id IN (SELECT product_id FROM event_products WHERE event_id = $1)",
        event,
    )
    .await?;
    let labels: Vec<(Uuid, String)> =
        sqlx::query_as("SELECT id, label FROM event_location_categories WHERE event_id = $1")
            .bind(event)
            .fetch_all(ctx.conn())
            .await?;
    Ok(relations
        .into_iter()
        .filter_map(|relation| {
            let product = products
                .iter()
                .find(|p| p.id == relation.product_id)?
                .clone();
            let label = relation.location_category_id.and_then(|id| {
                labels
                    .iter()
                    .find(|(l, _)| *l == id)
                    .map(|(_, label)| label.clone())
            });
            Some((relation, product, label))
        })
        .collect())
}

/// The items of an event for visitors: the viewer's own and those ready for sale.
async fn get_products_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<ListedProduct>> {
    let event_id = args.event_id.0;
    ctx.read(Topic::Event(event_id));
    let Some(event) = docs::event(ctx.conn(), event_id).await? else {
        return Ok(Vec::new());
    };
    let viewer = ctx.user;
    // Blocked by moderation: only the event team and admins still see the items
    if event.moderation.is_some() {
        let team = match viewer {
            Some(user) => has_any_role_or_admin(ctx.conn(), event_id, user, &TEAM).await?,
            None => false,
        };
        if !team {
            return Ok(Vec::new());
        }
    }
    Ok(listed_products(ctx, event_id)
        .await?
        .into_iter()
        .filter(|(_, product, _)| {
            Some(product.vendor_id) == viewer
                || (product.ready_for_sale && product.moderation.is_none())
        })
        .map(|(relation, product, label)| ListedProduct {
            product: product.without_private_fields(),
            event_product_id: relation.id,
            status: relation.status,
            discount_percent: relation.discount_percent,
            location_category_id: relation.location_category_id,
            location_label: label,
            internal_note: None,
            sale: None,
        })
        .collect())
}

/// All items of an event with intake state, notes and sales, for the event team.
async fn get_products_for_event_management(
    ctx: &mut Ctx,
    args: EventArgs,
) -> AppResult<Vec<ListedProduct>> {
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    ctx.read(Topic::Event(event_id));
    // What was actually paid: offers and negotiated prices differ from the label
    let purchases = docs::purchases_where(ctx.conn(), "event_id = $1", event_id).await?;
    Ok(listed_products(ctx, event_id)
        .await?
        .into_iter()
        .map(|(relation, product, label)| {
            let sale = (relation.status == "sold")
                .then(|| purchases.iter().find(|p| p.product_id == product.id))
                .flatten()
                .map(sales::sale_info);
            ListedProduct {
                product,
                event_product_id: relation.id,
                status: relation.status,
                discount_percent: relation.discount_percent,
                location_category_id: relation.location_category_id,
                location_label: label,
                internal_note: relation.internal_note,
                sale,
            }
        })
        .collect())
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventProductDetails {
    #[serde(flatten)]
    relation: EventProduct,
    product: Product,
    vendor: Option<User>,
    location_label: Option<String>,
}

async fn get_event_product(
    ctx: &mut Ctx,
    args: EventProductArgs,
) -> AppResult<Option<EventProductDetails>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    ctx.read(Topic::Product(args.product_id.0));
    let Some(relation) = relation(ctx.conn(), args.event_id.0, args.product_id.0).await? else {
        return Ok(None);
    };
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(None);
    };
    ctx.read(Topic::User(product.vendor_id));
    let vendor = docs::user(ctx.conn(), product.vendor_id).await?;
    let location_label: Option<String> = match relation.location_category_id {
        Some(id) => {
            sqlx::query_scalar("SELECT label FROM event_location_categories WHERE id = $1")
                .bind(id)
                .fetch_optional(ctx.conn())
                .await?
        }
        None => None,
    };
    Ok(Some(EventProductDetails {
        relation,
        product,
        vendor,
        location_label,
    }))
}

/// The relation, after checking the viewer is in the event team.
async fn team_relation(ctx: &mut Ctx, id: Uuid) -> AppResult<EventProduct> {
    ctx.require_user()?;
    let relation = relation_by_id(ctx.conn(), id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    require_team(ctx, relation.event_id).await?;
    Ok(relation)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NoteArgs {
    event_product_id: Id,
    note: String,
}

/// The organizers' note on an item, e.g. the hook number on the key board; empty removes it.
async fn set_event_product_note(ctx: &mut Ctx, args: NoteArgs) -> AppResult<()> {
    let relation = team_relation(ctx, args.event_product_id.0).await?;
    let note = args.note.trim();
    if note.chars().count() > MAX_INTERNAL_NOTE_LENGTH {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "product.noteTooLong",
            &[("max", &MAX_INTERNAL_NOTE_LENGTH.to_string())],
        ));
    }
    sqlx::query("UPDATE event_products SET internal_note = NULLIF($2, '') WHERE id = $1")
        .bind(relation.id)
        .bind(note)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(relation.event_id));
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DiscountArgs {
    event_id: Id,
    product_id: Id,
    discount_percent: f64,
}

/// The seller discounts an item handed in at the running event, up to the event's
/// maximum; a discount can only go up.
async fn update_product_discount(ctx: &mut Ctx, args: DiscountArgs) -> AppResult<()> {
    let (user, product) = own_product(ctx, args.product_id.0).await?;
    let event = event_of(ctx, args.event_id.0).await?;
    if let Some(code) = discount_unavailable(&event, Utc::now()) {
        return Err(AppError::bad_request(code));
    }
    let max = event.resolved_features().max_discount_percent;
    if !(0.0..=f64::from(max)).contains(&args.discount_percent) {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "discount.max",
            &[("max", &max.to_string())],
        ));
    }
    let relation = relation(ctx.conn(), event.id, product.id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if relation.status != "available" {
        return Err(AppError::bad_request("discount.onlyAvailable"));
    }
    let percent = Decimal::from_f64(args.discount_percent)
        .unwrap_or_default()
        .cents();
    if relation
        .discount_percent
        .is_some_and(|current| percent < current)
    {
        return Err(AppError::bad_request("discount.onlyIncrease"));
    }
    sqlx::query("UPDATE event_products SET discount_percent = $2 WHERE id = $1")
        .bind(relation.id)
        .bind(percent)
        .execute(ctx.conn())
        .await?;
    touch_listing(ctx, event.id, product.id, user);
    Ok(())
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum Status {
    Announced,
    Available,
    Sold,
    Returned,
}

impl Status {
    fn as_str(self) -> &'static str {
        match self {
            Self::Announced => "announced",
            Self::Available => "available",
            Self::Sold => "sold",
            Self::Returned => "returned",
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatusArgs {
    event_product_id: Id,
    status: Status,
    location_category_id: Option<Id>,
}

async fn check_location(ctx: &mut Ctx, event: Uuid, location: Uuid) -> AppResult<()> {
    let ok: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_location_categories WHERE id = $1 AND event_id = $2)",
    )
    .bind(location)
    .bind(event)
    .fetch_one(ctx.conn())
    .await?;
    if ok {
        Ok(())
    } else {
        Err(AppError::bad_request("event.invalidLocationCategory"))
    }
}

/// The event team moves an item on: intake (with location), return, back in.
async fn update_product_status(ctx: &mut Ctx, args: StatusArgs) -> AppResult<Uuid> {
    let relation = team_relation(ctx, args.event_product_id.0).await?;
    let product = docs::product(ctx.conn(), relation.product_id).await?;
    if let Some(product) = &product {
        assert_vendor_not_paid_out(ctx.conn(), relation.event_id, product.vendor_id).await?;
    }
    if let Some(location) = args.location_category_id {
        if args.status != Status::Available {
            return Err(AppError::bad_request("event.locationOnlyOnAccept"));
        }
        check_location(ctx, relation.event_id, location.0).await?;
    }
    let title = product
        .as_ref()
        .map_or_else(|| "Artikel".to_owned(), |p| p.title.clone());
    if args.status == Status::Returned && relation.status != "returned" {
        // The item went back to the seller, open offers for it are void
        close_offers_for_event_product(ctx, relation.id, &title, "return").await?;
    } else if args.status == Status::Available && relation.status == "returned" {
        // Taken back in after a return: same as undoing it
        reopen_closed_offers(ctx, relation.id, &title, "return").await?;
    }
    sqlx::query(
        "UPDATE event_products SET status = $2::event_product_status,
           location_category_id = CASE WHEN $3 THEN $4 ELSE location_category_id END
         WHERE id = $1",
    )
    .bind(relation.id)
    .bind(args.status.as_str())
    .bind(args.location_category_id.is_some())
    .bind(args.location_category_id.map(|id| id.0))
    .execute(ctx.conn())
    .await?;
    if let Some(product) = product {
        touch_listing(ctx, relation.event_id, product.id, product.vendor_id);
    }
    Ok(relation.id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocationArgs {
    event_product_id: Id,
    location_category_id: Option<Id>,
}

async fn set_event_product_location_category(ctx: &mut Ctx, args: LocationArgs) -> AppResult<Uuid> {
    let relation = team_relation(ctx, args.event_product_id.0).await?;
    if let Some(location) = args.location_category_id {
        check_location(ctx, relation.event_id, location.0).await?;
    }
    sqlx::query("UPDATE event_products SET location_category_id = $2 WHERE id = $1")
        .bind(relation.id)
        .bind(args.location_category_id.map(|id| id.0))
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(relation.event_id));
    ctx.touch(Topic::Product(relation.product_id));
    Ok(relation.id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VendorArgs {
    event_id: Id,
    vendor_id: Id,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Updated {
    updated_count: i64,
}

/// Intake of all announced items of a seller at once.
async fn mark_all_vendor_products_available(ctx: &mut Ctx, args: VendorArgs) -> AppResult<Updated> {
    let (event, vendor) = (args.event_id.0, args.vendor_id.0);
    require_team(ctx, event).await?;
    assert_vendor_not_paid_out(ctx.conn(), event, vendor).await?;
    let products: Vec<Uuid> = sqlx::query_scalar(
        "UPDATE event_products ep SET status = 'available' FROM products p
         WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'announced'
         RETURNING p.id",
    )
    .bind(event)
    .bind(vendor)
    .fetch_all(ctx.conn())
    .await?;
    for product in &products {
        touch_listing(ctx, event, *product, vendor);
    }
    Ok(Updated {
        updated_count: products.len() as i64,
    })
}

/// Returns all handed-in items of a seller at once; their open offers end.
async fn mark_all_vendor_products_returned(ctx: &mut Ctx, args: VendorArgs) -> AppResult<Updated> {
    let (event, vendor) = (args.event_id.0, args.vendor_id.0);
    require_team(ctx, event).await?;
    assert_vendor_not_paid_out(ctx.conn(), event, vendor).await?;
    let returned: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        "UPDATE event_products ep SET status = 'returned' FROM products p
         WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'available'
         RETURNING ep.id, p.id, p.title",
    )
    .bind(event)
    .bind(vendor)
    .fetch_all(ctx.conn())
    .await?;
    for (relation, product, title) in &returned {
        close_offers_for_event_product(ctx, *relation, title, "return").await?;
        touch_listing(ctx, event, *product, vendor);
    }
    Ok(Updated {
        updated_count: returned.len() as i64,
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RelationArgs {
    event_product_id: Id,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// Takes a returned item back in; needs the flag allow_undo_inventory_actions.
async fn undo_return(ctx: &mut Ctx, args: RelationArgs) -> AppResult<Success> {
    ctx.require_user()?;
    if !flags::get(ctx.conn(), "allow_undo_inventory_actions", false).await? {
        return Err(AppError::forbidden("feature.disabled"));
    }
    let relation = team_relation(ctx, args.event_product_id.0).await?;
    if relation.status != "returned" {
        return Err(AppError::bad_request("product.notReturned"));
    }
    let product = docs::product(ctx.conn(), relation.product_id).await?;
    if let Some(product) = &product {
        assert_vendor_not_paid_out(ctx.conn(), relation.event_id, product.vendor_id).await?;
    }
    sqlx::query("UPDATE event_products SET status = 'available' WHERE id = $1")
        .bind(relation.id)
        .execute(ctx.conn())
        .await?;
    let title = product
        .as_ref()
        .map_or_else(|| "Artikel".to_owned(), |p| p.title.clone());
    reopen_closed_offers(ctx, relation.id, &title, "return").await?;
    if let Some(product) = product {
        touch_listing(ctx, relation.event_id, product.id, product.vendor_id);
    }
    Ok(Success { success: true })
}
