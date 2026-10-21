//! Walk-in sellers: people who come to the bazaar without an account. An organizer
//! creates them on site; they cannot sign in. The organizers of that event create their
//! items and answer for them.

use std::collections::BTreeMap;

use chrono::Utc;
use serde::Deserialize;
use uuid::Uuid;

use super::docs::{self, Event};
use super::event_roles::{self, Role, require_team};
use super::instance::EMAIL_PATTERN;
use super::products::{
    attributes_json, check_category, check_condition, normalize_extras, price, set_images,
};
use super::seller_numbers::next_seller_number;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;
use crate::storage;

/// Same limit as the product form of sellers
const MAX_WALK_IN_IMAGES: usize = 3;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "walkInSellers.createWalkInSeller" => create_walk_in_seller);
    register!(registry, Mutation "walkInSellers.saveWalkInProduct" => save_walk_in_product);
    register!(registry, Mutation "walkInSellers.deleteWalkInProduct" => delete_walk_in_product);
}

/// Event team of an event that is not over.
async fn require_open_event_manager(ctx: &mut Ctx, event: Uuid) -> AppResult<Event> {
    require_team(ctx, event).await?;
    let event = docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("event.over"));
    }
    Ok(event)
}

/// The seller was created at this event's desk and is not paid out yet.
async fn require_unsettled_walk_in(ctx: &mut Ctx, event: Uuid, seller: Uuid) -> AppResult<()> {
    let managed_by: Option<Option<Uuid>> =
        sqlx::query_scalar("SELECT managed_by_event_id FROM users WHERE id = $1")
            .bind(seller)
            .fetch_optional(ctx.conn())
            .await?;
    if managed_by.flatten() != Some(event) {
        return Err(AppError::bad_request("product.walkInOnly"));
    }
    if docs::event_seller(ctx.conn(), event, seller)
        .await?
        .is_some_and(|row| row.payout_received)
    {
        return Err(AppError::bad_request("seller.paidOut"));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    event_id: Id,
    first_name: String,
    last_name: String,
    contact_email: Option<String>,
    phone: Option<String>,
}

async fn create_walk_in_seller(ctx: &mut Ctx, args: CreateArgs) -> AppResult<Uuid> {
    let event = require_open_event_manager(ctx, args.event_id.0).await?;
    let (first, last) = (args.first_name.trim(), args.last_name.trim());
    if first.is_empty() || last.is_empty() {
        return Err(AppError::bad_request("profile.nameRequired"));
    }
    let email = args
        .contact_email
        .as_deref()
        .map(str::trim)
        .filter(|e| !e.is_empty());
    if email.is_some_and(|e| !EMAIL_PATTERN.is_match(e)) {
        return Err(AppError::bad_request("common.invalidEmail"));
    }
    let user: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, first_name, last_name, phone, contact_email, status, system_role,
           needs_onboarding, managed_by_event_id)
         VALUES ($1, $2, $3, $4, $5, 'active', 'user', false, $6) RETURNING id",
    )
    .bind(format!("{first} {last}"))
    .bind(first)
    .bind(last)
    .bind(
        args.phone
            .as_deref()
            .map(str::trim)
            .filter(|p| !p.is_empty()),
    )
    .bind(email)
    .bind(event.id)
    .fetch_one(ctx.conn())
    .await?;
    let number = next_seller_number(ctx, event.id).await?;
    sqlx::query(
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount, payout_received, number)
         VALUES ($1, $2, 0, 0, 0, false, $3)",
    )
    .bind(event.id)
    .bind(user)
    .bind(number)
    .execute(ctx.conn())
    .await?;
    event_roles::add_role(ctx, event.id, user, Role::Seller).await?;
    Ok(user)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveArgs {
    event_id: Id,
    seller_id: Id,
    product_id: Option<Id>,
    title: String,
    description: String,
    condition: String,
    product_category: Id,
    price: f64,
    attributes: Option<BTreeMap<String, String>>,
    accepts_offers: Option<bool>,
    minimum_price: Option<f64>,
    /// Photos taken at the desk; on update they replace the existing ones
    images: Option<Vec<Id>>,
}

/// Creates (or with productId updates) an item of a walk-in seller and lists it in the
/// event; new items start as announced and go through the normal intake.
async fn save_walk_in_product(ctx: &mut Ctx, args: SaveArgs) -> AppResult<Uuid> {
    let event = require_open_event_manager(ctx, args.event_id.0).await?;
    let seller = args.seller_id.0;
    require_unsettled_walk_in(ctx, event.id, seller).await?;
    let title = args.title.trim().to_owned();
    if title.chars().count() < 3 {
        return Err(AppError::bad_request("product.titleTooShort"));
    }
    let price = price(args.price)?;
    if args
        .images
        .as_ref()
        .is_some_and(|images| images.len() > MAX_WALK_IN_IMAGES)
    {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "product.tooManyImages",
            &[("max", &MAX_WALK_IN_IMAGES.to_string())],
        ));
    }
    check_condition(&args.condition)?;
    check_category(ctx.conn(), args.product_category.0).await?;
    let (attributes, minimum) = normalize_extras(
        ctx.conn(),
        args.product_category.0,
        price,
        args.attributes.as_ref(),
        args.minimum_price,
    )
    .await?;
    // Without an account nobody could answer online offers
    let _ = args.accepts_offers;
    let id = match args.product_id {
        Some(id) => {
            let product = docs::product(ctx.conn(), id.0)
                .await?
                .filter(|p| p.vendor_id == seller)
                .ok_or_else(|| AppError::not_found("notFound.product"))?;
            if product.sold {
                return Err(AppError::bad_request("product.soldNoEdit"));
            }
            sqlx::query(
                "UPDATE products SET title = $2, description = $3, condition = $4::product_condition, category_id = $5,
                   price = $6, attributes = $7, accepts_offers = false, minimum_price = $8, updated_at = now()
                 WHERE id = $1",
            )
            .bind(product.id)
            .bind(&title)
            .bind(&args.description)
            .bind(&args.condition)
            .bind(args.product_category.0)
            .bind(price)
            .bind(attributes_json(attributes))
            .bind(minimum)
            .execute(ctx.conn())
            .await?;
            if let Some(images) = &args.images {
                set_images(ctx, product.id, images).await?;
            }
            product.id
        }
        None => {
            let id: Uuid = sqlx::query_scalar(
                "INSERT INTO products (title, vendor_id, description, condition, category_id, price, ready_for_sale,
                   sold, attributes, accepts_offers, minimum_price)
                 VALUES ($1, $2, $3, $4::product_condition, $5, $6, true, false, $7, false, $8) RETURNING id",
            )
            .bind(&title)
            .bind(seller)
            .bind(&args.description)
            .bind(&args.condition)
            .bind(args.product_category.0)
            .bind(price)
            .bind(attributes_json(attributes))
            .bind(minimum)
            .fetch_one(ctx.conn())
            .await?;
            set_images(ctx, id, args.images.as_deref().unwrap_or(&[])).await?;
            sqlx::query("INSERT INTO event_products (event_id, product_id, status) VALUES ($1, $2, 'announced')")
                .bind(event.id)
                .bind(id)
                .execute(ctx.conn())
                .await?;
            id
        }
    };
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::Product(id));
    ctx.touch(Topic::User(seller));
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteArgs {
    event_id: Id,
    product_id: Id,
}

/// Deletes an item recorded by mistake: not when sold or the seller is paid out; its
/// questions and photos go with it.
async fn delete_walk_in_product(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    let event = require_open_event_manager(ctx, args.event_id.0).await?;
    let product = docs::product(ctx.conn(), args.product_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    require_unsettled_walk_in(ctx, event.id, product.vendor_id).await?;
    let sold_somewhere: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_products WHERE product_id = $1 AND status = 'sold')",
    )
    .bind(product.id)
    .fetch_one(ctx.conn())
    .await?;
    if product.sold || sold_somewhere {
        return Err(AppError::bad_request("product.soldNoDelete"));
    }
    // Event products, questions and offers go with it through the foreign keys
    sqlx::query("DELETE FROM products WHERE id = $1")
        .bind(product.id)
        .execute(ctx.conn())
        .await?;
    for image in &product.images {
        storage::delete_later(ctx.conn(), *image).await?;
    }
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    Ok(())
}
