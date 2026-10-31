//! The documents of the tables in the shape the app expects (`Doc<'users'>`,
//! `Doc<'events'>`, …), with the queries that load them. Nested objects (moderation,
//! sellerLogistics, …) are built from their columns; ID arrays from the join tables.
//!
//! The user document leaves out the secrets (verification, check-in and unsubscribe
//! tokens), which would otherwise reach organizers in seller lists.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::Value;
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::shape::{ms, ms_opt};

/// Set when an administrator hides content; the owner still sees it, with the reason.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Moderation {
    #[serde(with = "ms")]
    pub hidden_at: DateTime<Utc>,
    pub hidden_by: Uuid,
    pub reason: String,
}

fn moderation(
    hidden_at: Option<DateTime<Utc>>,
    hidden_by: Option<Uuid>,
    reason: Option<String>,
) -> Option<Moderation> {
    Some(Moderation {
        hidden_at: hidden_at?,
        hidden_by: hidden_by?,
        reason: reason?,
    })
}

// Users --------------------------------------------------------------------------------

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct User {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub name: Option<String>,
    pub image: Option<String>,
    pub email: Option<String>,
    #[serde(rename = "emailVerificationTime", with = "ms_opt")]
    pub email_verified_at: Option<DateTime<Utc>>,
    pub phone: Option<String>,
    #[serde(rename = "phoneVerificationTime", with = "ms_opt")]
    pub phone_verified_at: Option<DateTime<Utc>>,
    pub is_anonymous: Option<bool>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub street: Option<String>,
    pub city: Option<String>,
    pub zip_code: Option<String>,
    pub country: Option<String>,
    pub is_mail_confirmed: Option<bool>,
    pub status: Option<String>,
    #[serde(with = "ms_opt")]
    pub last_login_at: Option<DateTime<Utc>>,
    pub system_role: Option<String>,
    pub needs_onboarding: Option<bool>,
    #[serde(rename = "checkInTokenExpires", with = "ms_opt")]
    pub check_in_token_expires_at: Option<DateTime<Utc>>,
    #[serde(rename = "managedByEventId")]
    pub managed_by_event_id: Option<Uuid>,
    pub contact_email: Option<String>,
    pub notification_prefs: Option<Value>,
    pub locale: Option<String>,
}

pub const USER_COLUMNS: &str = "id, created_at, name, image, email, email_verified_at, phone,
    phone_verified_at, is_anonymous, first_name, last_name, street, city, zip_code, country,
    is_mail_confirmed, status::text AS status, last_login_at, system_role::text AS system_role,
    needs_onboarding, check_in_token_expires_at, managed_by_event_id, contact_email,
    NULLIF(notification_prefs, '{}'::jsonb) AS notification_prefs, locale::text AS locale";

pub async fn user(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<User>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {USER_COLUMNS} FROM users WHERE id = $1"
    )))
    .bind(id)
    .fetch_optional(conn)
    .await
}

pub async fn users(conn: &mut PgConnection, ids: &[Uuid]) -> sqlx::Result<Vec<User>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {USER_COLUMNS} FROM users WHERE id = ANY($1) ORDER BY created_at"
    )))
    .bind(ids)
    .fetch_all(conn)
    .await
}

// Events -------------------------------------------------------------------------------

#[skip_serializing_none]
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SellerLogistics {
    #[serde(with = "ms_opt")]
    pub dropoff_start: Option<DateTime<Utc>>,
    #[serde(with = "ms_opt")]
    pub dropoff_end: Option<DateTime<Utc>>,
    #[serde(with = "ms_opt")]
    pub pickup_start: Option<DateTime<Utc>>,
    #[serde(with = "ms_opt")]
    pub pickup_end: Option<DateTime<Utc>>,
    pub note: Option<String>,
}

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemindersSent {
    #[serde(with = "ms_opt")]
    pub day_before: Option<DateTime<Utc>>,
    #[serde(with = "ms_opt")]
    pub pickup: Option<DateTime<Utc>>,
}

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub title: String,
    pub description: String,
    pub cover_image: Option<Uuid>,
    pub event_map_image: Option<Uuid>,
    pub location: String,
    /// Address of the venue; `location` is its name or, in older events, all of it
    pub street: Option<String>,
    pub postal_code: Option<String>,
    pub city: Option<String>,
    #[serde(with = "ms")]
    pub start_date: DateTime<Utc>,
    #[serde(with = "ms")]
    pub end_date: DateTime<Utc>,
    pub contact_info: String,
    pub categories: Vec<Uuid>,
    pub services: Vec<String>,
    pub visibility: String,
    pub is_approved: Option<bool>,
    pub approval_status: Option<String>,
    #[serde(with = "ms_opt")]
    pub approved_at: Option<DateTime<Utc>>,
    pub approved_by: Option<Uuid>,
    #[serde(with = "ms_opt")]
    pub rejected_at: Option<DateTime<Utc>>,
    pub rejected_by: Option<Uuid>,
    pub rejection_reason: Option<String>,
    pub access_code: Option<String>,
    pub vendor_limit: Option<i32>,
    pub last_seller_number: Option<i32>,
    pub commission: Decimal,
    pub sale_fee_fixed: Option<Decimal>,
    pub sale_fee_percentage: Option<Decimal>,
    /// eventFeaturesValidator; see `features::resolve`
    pub features: Option<Value>,
    pub seller_logistics: Option<SellerLogistics>,
    pub reminders_sent: Option<RemindersSent>,
    pub moderation: Option<Moderation>,
    pub organizer_id: Uuid,
}

#[derive(sqlx::FromRow)]
struct EventRow {
    id: Uuid,
    created_at: DateTime<Utc>,
    title: String,
    description: String,
    cover_image_id: Option<Uuid>,
    map_image_id: Option<Uuid>,
    location: String,
    street: Option<String>,
    postal_code: Option<String>,
    city: Option<String>,
    start_date: DateTime<Utc>,
    end_date: DateTime<Utc>,
    contact_info: String,
    categories: Vec<Uuid>,
    services: Vec<String>,
    visibility: String,
    is_approved: Option<bool>,
    approval_status: Option<String>,
    approved_at: Option<DateTime<Utc>>,
    approved_by: Option<Uuid>,
    rejected_at: Option<DateTime<Utc>>,
    rejected_by: Option<Uuid>,
    rejection_reason: Option<String>,
    access_code: Option<String>,
    vendor_limit: Option<i32>,
    last_seller_number: Option<i32>,
    commission: Decimal,
    sale_fee_fixed: Option<Decimal>,
    sale_fee_percentage: Option<Decimal>,
    features: Value,
    dropoff_start: Option<DateTime<Utc>>,
    dropoff_end: Option<DateTime<Utc>>,
    pickup_start: Option<DateTime<Utc>>,
    pickup_end: Option<DateTime<Utc>>,
    logistics_note: Option<String>,
    reminder_day_before_sent_for: Option<DateTime<Utc>>,
    reminder_pickup_sent_for: Option<DateTime<Utc>>,
    hidden_at: Option<DateTime<Utc>>,
    hidden_by: Option<Uuid>,
    hidden_reason: Option<String>,
    organizer_id: Uuid,
}

impl From<EventRow> for Event {
    fn from(row: EventRow) -> Self {
        let logistics = SellerLogistics {
            dropoff_start: row.dropoff_start,
            dropoff_end: row.dropoff_end,
            pickup_start: row.pickup_start,
            pickup_end: row.pickup_end,
            note: row.logistics_note,
        };
        let has_logistics = logistics.dropoff_start.is_some()
            || logistics.dropoff_end.is_some()
            || logistics.pickup_start.is_some()
            || logistics.pickup_end.is_some()
            || logistics.note.is_some();
        let reminders = (row.reminder_day_before_sent_for.is_some()
            || row.reminder_pickup_sent_for.is_some())
        .then_some(RemindersSent {
            day_before: row.reminder_day_before_sent_for,
            pickup: row.reminder_pickup_sent_for,
        });
        Self {
            id: row.id,
            created_at: row.created_at,
            title: row.title,
            description: row.description,
            cover_image: row.cover_image_id,
            event_map_image: row.map_image_id,
            location: row.location,
            street: row.street,
            postal_code: row.postal_code,
            city: row.city,
            start_date: row.start_date,
            end_date: row.end_date,
            contact_info: row.contact_info,
            categories: row.categories,
            services: row.services,
            visibility: row.visibility,
            is_approved: row.is_approved,
            approval_status: row.approval_status,
            approved_at: row.approved_at,
            approved_by: row.approved_by,
            rejected_at: row.rejected_at,
            rejected_by: row.rejected_by,
            rejection_reason: row.rejection_reason,
            access_code: row.access_code,
            vendor_limit: row.vendor_limit,
            last_seller_number: row.last_seller_number,
            commission: row.commission,
            sale_fee_fixed: row.sale_fee_fixed,
            sale_fee_percentage: row.sale_fee_percentage,
            features: row
                .features
                .as_object()
                .is_some_and(|f| !f.is_empty())
                .then_some(row.features),
            seller_logistics: has_logistics.then_some(logistics),
            reminders_sent: reminders,
            moderation: moderation(row.hidden_at, row.hidden_by, row.hidden_reason),
            organizer_id: row.organizer_id,
        }
    }
}

/// SELECT list of the events table aliased `e`.
pub const EVENT_COLUMNS: &str = "e.id, e.created_at, e.title, e.description, e.cover_image_id,
    e.map_image_id, e.location, e.street, e.postal_code, e.city, e.start_date, e.end_date, e.contact_info,
    ARRAY(SELECT c.category_id FROM event_categories c WHERE c.event_id = e.id ORDER BY c.position)
      AS categories,
    e.services::text[] AS services, e.visibility::text AS visibility, e.is_approved,
    e.approval_status::text AS approval_status, e.approved_at, e.approved_by, e.rejected_at,
    e.rejected_by, e.rejection_reason, e.access_code, e.vendor_limit, e.last_seller_number,
    e.commission, e.sale_fee_fixed, e.sale_fee_percentage, e.features, e.dropoff_start,
    e.dropoff_end, e.pickup_start, e.pickup_end, e.logistics_note, e.reminder_day_before_sent_for,
    e.reminder_pickup_sent_for, e.hidden_at, e.hidden_by, e.hidden_reason, e.organizer_id";

pub async fn event(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Event>> {
    let row: Option<EventRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_COLUMNS} FROM events e WHERE e.id = $1"
    )))
    .bind(id)
    .fetch_optional(conn)
    .await?;
    Ok(row.map(Event::from))
}

/// Events matching `condition` (SQL on `e`, with `$1` bound to `param`), ordered by start.
pub async fn events_where<P>(
    conn: &mut PgConnection,
    condition: &str,
    param: P,
) -> sqlx::Result<Vec<Event>>
where
    P: for<'q> sqlx::Encode<'q, sqlx::Postgres> + sqlx::Type<sqlx::Postgres> + Send,
{
    let rows: Vec<EventRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_COLUMNS} FROM events e WHERE {condition} ORDER BY e.start_date, e.id"
    )))
    .bind(param)
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(Event::from).collect())
}

// Products -----------------------------------------------------------------------------

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Product {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub title: String,
    pub vendor_id: Uuid,
    pub description: String,
    pub condition: String,
    pub images: Vec<Uuid>,
    pub product_category: Uuid,
    #[serde(with = "ms")]
    pub updated_at: DateTime<Utc>,
    pub price: Decimal,
    pub ready_for_sale: bool,
    pub sold: bool,
    pub attributes: Option<Value>,
    pub accepts_offers: Option<bool>,
    /// Lowest price at the cash desk; never sent to buyers (see `without_private_fields`)
    pub minimum_price: Option<Decimal>,
    pub moderation: Option<Moderation>,
}

impl Product {
    /// What buyers and the public may see
    pub fn without_private_fields(mut self) -> Self {
        self.minimum_price = None;
        self
    }
}

#[derive(sqlx::FromRow)]
struct ProductRow {
    id: Uuid,
    created_at: DateTime<Utc>,
    title: String,
    vendor_id: Uuid,
    description: String,
    condition: String,
    images: Vec<Uuid>,
    category_id: Uuid,
    updated_at: DateTime<Utc>,
    price: Decimal,
    ready_for_sale: bool,
    sold: bool,
    attributes: Value,
    accepts_offers: Option<bool>,
    minimum_price: Option<Decimal>,
    hidden_at: Option<DateTime<Utc>>,
    hidden_by: Option<Uuid>,
    hidden_reason: Option<String>,
}

impl From<ProductRow> for Product {
    fn from(row: ProductRow) -> Self {
        Self {
            id: row.id,
            created_at: row.created_at,
            title: row.title,
            vendor_id: row.vendor_id,
            description: row.description,
            condition: row.condition,
            images: row.images,
            product_category: row.category_id,
            updated_at: row.updated_at,
            price: row.price,
            ready_for_sale: row.ready_for_sale,
            sold: row.sold,
            attributes: row
                .attributes
                .as_object()
                .is_some_and(|a| !a.is_empty())
                .then_some(row.attributes),
            accepts_offers: row.accepts_offers,
            minimum_price: row.minimum_price,
            moderation: moderation(row.hidden_at, row.hidden_by, row.hidden_reason),
        }
    }
}

/// SELECT list of the products table aliased `p`.
pub const PRODUCT_COLUMNS: &str = "p.id, p.created_at, p.title, p.vendor_id, p.description,
    p.condition::text AS condition,
    ARRAY(SELECT i.file_id FROM product_images i WHERE i.product_id = p.id ORDER BY i.position)
      AS images,
    p.category_id, p.updated_at, p.price, p.ready_for_sale, p.sold, p.attributes,
    p.accepts_offers, p.minimum_price, p.hidden_at, p.hidden_by, p.hidden_reason";

pub async fn product(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<Option<Product>> {
    let row: Option<ProductRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {PRODUCT_COLUMNS} FROM products p WHERE p.id = $1"
    )))
    .bind(id)
    .fetch_optional(conn)
    .await?;
    Ok(row.map(Product::from))
}

/// Products matching `condition` (SQL on `p`, `$1` bound to `param`), oldest first.
pub async fn products_where<P>(
    conn: &mut PgConnection,
    condition: &str,
    param: P,
) -> sqlx::Result<Vec<Product>>
where
    P: for<'q> sqlx::Encode<'q, sqlx::Postgres> + sqlx::Type<sqlx::Postgres> + Send,
{
    let rows: Vec<ProductRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {PRODUCT_COLUMNS} FROM products p WHERE {condition} ORDER BY p.created_at, p.id"
    )))
    .bind(param)
    .fetch_all(conn)
    .await?;
    Ok(rows.into_iter().map(Product::from).collect())
}

// Event products, sellers, roles, purchases ------------------------------------------------

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventProduct {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub event_id: Uuid,
    pub product_id: Uuid,
    pub status: String,
    pub discount_percent: Option<Decimal>,
    pub location_category_id: Option<Uuid>,
    pub internal_note: Option<String>,
}

pub const EVENT_PRODUCT_COLUMNS: &str = "ep.id, ep.created_at, ep.event_id, ep.product_id,
    ep.status::text AS status, ep.discount_percent, ep.location_category_id, ep.internal_note";

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EventSeller {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    #[serde(rename = "event")]
    pub event_id: Uuid,
    #[serde(rename = "user")]
    pub user_id: Uuid,
    pub total_fee: Decimal,
    #[serde(rename = "comissionFee")]
    pub commission_fee: Decimal,
    pub sale_fee_fixed: Option<Decimal>,
    pub sale_fee_percentage: Option<Decimal>,
    #[serde(rename = "numberpayoutAmount")]
    pub payout_amount: Decimal,
    pub payout_received: bool,
    pub number: Option<i32>,
    pub intake_fee: Option<Decimal>,
    pub intake_fee_items: Option<i32>,
    #[serde(with = "ms_opt")]
    pub private_seller_confirmed_at: Option<DateTime<Utc>>,
    pub seller_snapshot: Option<Value>,
}

pub const EVENT_SELLER_COLUMNS: &str =
    "id, created_at, event_id, user_id, total_fee, commission_fee,
    sale_fee_fixed, sale_fee_percentage, payout_amount, payout_received, number, intake_fee,
    intake_fee_items, private_seller_confirmed_at, seller_snapshot";

pub async fn event_seller(
    conn: &mut PgConnection,
    event_id: Uuid,
    user_id: Uuid,
) -> sqlx::Result<Option<EventSeller>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {EVENT_SELLER_COLUMNS} FROM event_sellers WHERE event_id = $1 AND user_id = $2"
    )))
    .bind(event_id)
    .bind(user_id)
    .fetch_optional(conn)
    .await
}

#[skip_serializing_none]
#[derive(Clone, Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Purchase {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    /// None once the product is deleted; the sale keeps its title and category
    #[serde(rename = "product")]
    pub product_id: Option<Uuid>,
    #[serde(rename = "event")]
    pub event_id: Uuid,
    #[serde(rename = "seller")]
    pub seller_id: Uuid,
    pub total_amount: Decimal,
    #[serde(rename = "comissionAmount")]
    pub commission_amount: Decimal,
    pub payout_amount: Decimal,
    pub payout_status: bool,
    #[serde(with = "ms")]
    pub payout_date: DateTime<Utc>,
    pub discount_percent: Option<Decimal>,
    pub list_price: Option<Decimal>,
    pub price_source: Option<String>,
    pub offer_id: Option<Uuid>,
    /// Title, category, extra fields and seller number at the sale
    pub product_title: Option<String>,
    pub category_id: Option<Uuid>,
    pub category_label: Option<String>,
    pub product_attributes: Option<Value>,
    pub seller_number: Option<i32>,
}

pub const PURCHASE_COLUMNS: &str = "id, created_at, product_id, event_id, seller_id, total_amount,
    commission_amount, payout_amount, payout_status, payout_date, discount_percent, list_price,
    price_source::text AS price_source, offer_id, product_title, category_id, category_label,
    product_attributes, seller_number";

pub async fn purchases_where<P>(
    conn: &mut PgConnection,
    condition: &str,
    param: P,
) -> sqlx::Result<Vec<Purchase>>
where
    P: for<'q> sqlx::Encode<'q, sqlx::Postgres> + sqlx::Type<sqlx::Postgres> + Send,
{
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {PURCHASE_COLUMNS} FROM purchases WHERE {condition} ORDER BY created_at, id"
    )))
    .bind(param)
    .fetch_all(conn)
    .await
}
