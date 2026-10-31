//! Who offered what at a bazaar, e.g. the list for the police at a bike market (feature
//! fixedSellerData). When the team accepts an item on site, title, category, price and
//! fields of the item are recorded (offer_records), and with the first one the seller's
//! details on the seller row; with fixedSellerData those stay fixed from then on. Before,
//! the seller may still correct them, e.g. when they differ from the ID card.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::category_fields::{self, Attribute};
use super::docs::{self, Event, Product, User};
use super::event_roles::require_team;
use super::sales;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "sellerRecords.getProofOfOffers" => get_proof_of_offers);
}

/// Profile fields a seller needs before joining a bazaar.
pub const SELLER_PROFILE_FIELDS: [&str; 7] = [
    "firstName",
    "lastName",
    "phone",
    "street",
    "city",
    "zipCode",
    "country",
];

/// Fields that stay fixed while a record of the seller is needed.
pub const FIXED_PROFILE_FIELDS: [&str; 6] = [
    "firstName",
    "lastName",
    "street",
    "zipCode",
    "city",
    "country",
];

/// A profile field of the user by its name in the app (`firstName`, …).
pub fn profile_field<'a>(user: &'a User, field: &str) -> Option<&'a str> {
    match field {
        "firstName" => user.first_name.as_deref(),
        "lastName" => user.last_name.as_deref(),
        "phone" => user.phone.as_deref(),
        "street" => user.street.as_deref(),
        "city" => user.city.as_deref(),
        "zipCode" => user.zip_code.as_deref(),
        "country" => user.country.as_deref(),
        _ => None,
    }
}

pub fn missing_profile_fields(user: &User) -> Vec<&'static str> {
    SELLER_PROFILE_FIELDS
        .into_iter()
        .filter(|field| profile_field(user, field).is_none_or(|value| value.trim().is_empty()))
        .collect()
}

pub fn keeps_seller_record(event: &Event) -> bool {
    event.resolved_features().fixed_seller_data
}

/// Records the items the team accepted on site, as they are now; an item taken in again
/// keeps its first record. With the first item, the seller's details are taken too.
pub async fn record_offers(
    conn: &mut PgConnection,
    event: &Event,
    seller: Uuid,
    products: &[Uuid],
) -> sqlx::Result<()> {
    snapshot_seller(&mut *conn, event, seller, false).await?;
    sqlx::query(
        "INSERT INTO offer_records (event_id, product_id, seller_id, title, category_id,
           category_label, attributes, price)
         SELECT $1, p.id, p.vendor_id, p.title, p.category_id, c.label, p.attributes, p.price
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = ANY($2)
         ON CONFLICT (event_id, product_id) DO NOTHING",
    )
    .bind(event.id)
    .bind(products)
    .execute(conn)
    .await?;
    Ok(())
}

/// Copies name, address and contact of the seller to their seller row, so the settlement
/// keeps them when the profile changes or the account is deleted. Taken at the first
/// accepted item; `refresh` (the payout) takes them again, except the fixed record of a
/// bazaar with fixedSellerData, and of a deleted account. Nothing without a seller row.
pub async fn snapshot_seller(
    conn: &mut PgConnection,
    event: &Event,
    user_id: Uuid,
    refresh: bool,
) -> sqlx::Result<()> {
    let Some(user) = docs::user(&mut *conn, user_id).await? else {
        return Ok(());
    };
    let snapshot = json!({
        "name": user.name,
        "firstName": user.first_name,
        "lastName": user.last_name,
        "street": user.street,
        "zipCode": user.zip_code,
        "city": user.city,
        "country": user.country,
        "phone": user.phone,
        "email": user.email.or(user.contact_email),
        "takenAt": Utc::now().timestamp_millis(),
    });
    // A deleted account keeps what was recorded: anonymized, its profile is empty
    let closed = user.status.as_deref() == Some("deleted");
    let overwrite = refresh && !keeps_seller_record(event) && !closed;
    sqlx::query(
        "UPDATE event_sellers SET seller_snapshot = jsonb_strip_nulls($3)
         WHERE event_id = $1 AND user_id = $2 AND (seller_snapshot IS NULL OR $4)",
    )
    .bind(event.id)
    .bind(user_id)
    .bind(snapshot)
    .bind(overwrite)
    .execute(conn)
    .await?;
    Ok(())
}

/// Fills the snapshots of sales, seller rows and accepted items that have none, from the
/// products and profiles; the same as migrations 0006 and 0009, for data imported later.
pub async fn backfill_snapshots(conn: &mut PgConnection) -> sqlx::Result<()> {
    for statement in [
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount, payout_received)
         SELECT DISTINCT event_id, seller_id, 0, 0, 0, false FROM purchases
         ON CONFLICT (event_id, user_id) DO NOTHING",
        "UPDATE purchases pu
         SET product_title = p.title, category_id = p.category_id, category_label = c.label,
             product_attributes = p.attributes
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         WHERE p.id = pu.product_id AND pu.product_title IS NULL",
        "UPDATE purchases pu SET seller_number = s.number
         FROM event_sellers s
         WHERE s.event_id = pu.event_id AND s.user_id = pu.seller_id AND pu.seller_number IS NULL",
        "INSERT INTO offer_records (event_id, product_id, seller_id, title, category_id,
           category_label, attributes, price, accepted_at)
         SELECT ep.event_id, p.id, p.vendor_id, p.title, p.category_id, c.label, p.attributes,
                p.price, ep.created_at
         FROM event_products ep JOIN products p ON p.id = ep.product_id
         LEFT JOIN categories c ON c.id = p.category_id
         WHERE ep.status <> 'announced'
         ON CONFLICT (event_id, product_id) DO NOTHING",
        "UPDATE purchases pu SET offer_record_id = r.id
         FROM offer_records r
         WHERE r.event_id = pu.event_id AND r.product_id = pu.product_id
           AND pu.offer_record_id IS NULL",
        "UPDATE event_sellers s
         SET seller_snapshot = jsonb_strip_nulls(jsonb_build_object(
           'name', u.name, 'firstName', u.first_name, 'lastName', u.last_name, 'street', u.street,
           'zipCode', u.zip_code, 'city', u.city, 'country', u.country, 'phone', u.phone,
           'email', COALESCE(u.email, u.contact_email),
           'takenAt', floor(extract(epoch FROM now()) * 1000)::bigint))
         FROM users u
         WHERE u.id = s.user_id AND s.seller_snapshot IS NULL",
    ] {
        sqlx::query(statement).execute(&mut *conn).await?;
    }
    Ok(())
}

/// The user with name, address and contact from the snapshot of a seller row; fields
/// missing there stay as in the profile.
pub fn with_snapshot(mut user: User, snapshot: &Value) -> User {
    let field = |key: &str| snapshot_str(snapshot, key);
    let fields: [(&mut Option<String>, &str); 9] = [
        (&mut user.name, "name"),
        (&mut user.first_name, "firstName"),
        (&mut user.last_name, "lastName"),
        (&mut user.street, "street"),
        (&mut user.zip_code, "zipCode"),
        (&mut user.city, "city"),
        (&mut user.country, "country"),
        (&mut user.phone, "phone"),
        // Walk-in sellers have no sign-in address, only one for notifications
        if user.email.is_none() && user.contact_email.is_some() {
            (&mut user.contact_email, "email")
        } else {
            (&mut user.email, "email")
        },
    ];
    for (target, key) in fields {
        if let Some(value) = field(key) {
            *target = Some(value);
        }
    }
    user
}

/// Whether name and address of the user are fixed: a bazaar keeping their record accepted
/// an item and is not over.
pub async fn is_profile_fixed(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<bool> {
    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT s.event_id FROM event_sellers s JOIN events e ON e.id = s.event_id
         WHERE s.user_id = $1 AND s.seller_snapshot IS NOT NULL AND e.end_date >= now()",
    )
    .bind(user_id)
    .fetch_all(&mut *conn)
    .await?;
    for event in events {
        if docs::event(&mut *conn, event)
            .await?
            .is_some_and(|event| keeps_seller_record(&event))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Whether title, category, price and required fields of the item are fixed: a bazaar
/// that keeps a record accepted it and is not over. Returns the required fields of those
/// bazaars.
pub async fn fixed_item_data(
    conn: &mut PgConnection,
    product_id: Uuid,
) -> sqlx::Result<Option<Vec<String>>> {
    let events = docs::events_where(
        conn,
        "e.end_date >= now() AND e.id IN (
           SELECT event_id FROM event_products WHERE product_id = $1 AND status <> 'announced')",
        product_id,
    )
    .await?;
    let mut fixed = false;
    let mut keys: Vec<String> = Vec::new();
    for event in events.iter().filter(|event| keeps_seller_record(event)) {
        fixed = true;
        for key in event.resolved_features().required_fields {
            if !keys.contains(&key) {
                keys.push(key);
            }
        }
    }
    Ok(fixed.then_some(keys))
}

/// What a product change may touch; None keeps the value.
pub struct ItemChange<'a> {
    pub title: Option<&'a str>,
    pub category: Option<Uuid>,
    pub price: Option<Decimal>,
    pub attributes: Option<&'a std::collections::BTreeMap<String, String>>,
}

/// Rejects a change of fixed item data, see fixed_item_data.
pub async fn assert_item_data_unchanged(
    conn: &mut PgConnection,
    product: &Product,
    next: &ItemChange<'_>,
) -> AppResult<()> {
    let Some(keys) = fixed_item_data(conn, product.id).await? else {
        return Ok(());
    };
    let old_attr = |key: &str| {
        product
            .attributes
            .as_ref()
            .and_then(|a| a.get(key))
            .and_then(Value::as_str)
            .filter(|v| !v.is_empty())
    };
    let changed = next.title.is_some_and(|title| title != product.title)
        || next
            .category
            .is_some_and(|category| category != product.product_category)
        || next.price.is_some_and(|price| price != product.price)
        || next.attributes.is_some_and(|attributes| {
            keys.iter().any(|key| {
                old_attr(key).is_some_and(|old| attributes.get(key).map(|v| v.trim()) != Some(old))
            })
        });
    if changed {
        return Err(AppError::bad_request("product.dataFixed"));
    }
    Ok(())
}

#[skip_serializing_none]
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofSeller {
    seller_number: Option<i32>,
    first_name: Option<String>,
    last_name: Option<String>,
    street: Option<String>,
    zip_code: Option<String>,
    city: Option<String>,
    country: Option<String>,
    phone: Option<String>,
    email: Option<String>,
    /// When the seller confirmed to sell privately (feature privateSellersOnly)
    #[serde(with = "ms_opt")]
    private_seller_confirmed_at: Option<DateTime<Utc>>,
    /// The details are the copy from the first registered item, not today's profile
    from_record: bool,
}

#[skip_serializing_none]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofItem {
    /// None once the product was deleted; the record and the sale keep its data
    product_id: Option<Uuid>,
    title: String,
    category: String,
    attributes: Vec<Attribute>,
    price: Decimal,
    status: String,
    sold_for: Option<Decimal>,
    #[serde(with = "ms_opt")]
    sold_at: Option<DateTime<Utc>>,
    seller: ProofSeller,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProofEvent {
    title: String,
    location: String,
    #[serde(with = "ms")]
    start_date: DateTime<Utc>,
    #[serde(with = "ms")]
    end_date: DateTime<Utc>,
}

#[derive(Serialize)]
struct Proof {
    event: ProofEvent,
    items: Vec<ProofItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

fn snapshot_str(snapshot: &Value, key: &str) -> Option<String> {
    snapshot.get(key).and_then(Value::as_str).map(str::to_owned)
}

/// The seller as the proof lists them: from the record of the seller row, else from the
/// profile. Loaded once per seller.
async fn proof_seller(
    ctx: &mut Ctx,
    sellers: &mut std::collections::HashMap<Uuid, ProofSeller>,
    event_id: Uuid,
    vendor: Uuid,
) -> AppResult<ProofSeller> {
    if let Some(seller) = sellers.get(&vendor) {
        return Ok(seller.clone());
    }
    let row = docs::event_seller(ctx.conn(), event_id, vendor).await?;
    let user = docs::user(ctx.conn(), vendor).await?;
    let snapshot = row.as_ref().and_then(|row| row.seller_snapshot.clone());
    let from_user = |get: fn(&User) -> Option<String>| user.as_ref().and_then(get);
    let detail = |key: &str, get: fn(&User) -> Option<String>| match &snapshot {
        Some(snapshot) => snapshot_str(snapshot, key),
        None => from_user(get),
    };
    let seller = ProofSeller {
        seller_number: row.as_ref().and_then(|row| row.number),
        first_name: detail("firstName", |u| u.first_name.clone())
            .or_else(|| from_user(|u| u.name.clone())),
        last_name: detail("lastName", |u| u.last_name.clone()),
        street: detail("street", |u| u.street.clone()),
        zip_code: detail("zipCode", |u| u.zip_code.clone()),
        city: detail("city", |u| u.city.clone()),
        country: detail("country", |u| u.country.clone()),
        phone: detail("phone", |u| u.phone.clone()),
        email: detail("email", |u| {
            u.email.clone().or_else(|| u.contact_email.clone())
        }),
        private_seller_confirmed_at: row.as_ref().and_then(|row| row.private_seller_confirmed_at),
        from_record: snapshot.is_some(),
    };
    sellers.insert(vendor, seller.clone());
    Ok(seller)
}

#[derive(sqlx::FromRow)]
struct RecordRow {
    product_id: Option<Uuid>,
    seller_id: Uuid,
    title: String,
    category_id: Option<Uuid>,
    category_label: Option<String>,
    attributes: Option<Value>,
    price: Decimal,
    /// Of the item at the bazaar, while the product exists
    status: Option<String>,
    sold_for: Option<Decimal>,
    sold_at: Option<DateTime<Utc>>,
}

fn attributes(
    categories: &[category_fields::CategoryRef],
    category: Option<Uuid>,
    attributes: Option<&Value>,
) -> Vec<Attribute> {
    match category {
        Some(category) => category_fields::describe_attributes(
            category_fields::category_fields(category, categories),
            attributes,
        ),
        None => Vec::new(),
    }
}

/// Every item the team accepted on site, as recorded then, with the seller's recorded
/// details and the sale; and sales without such a record (from before). Event team only.
async fn get_proof_of_offers(ctx: &mut Ctx, args: EventArgs) -> AppResult<Proof> {
    let event_id = args.event_id.0;
    require_team(ctx, event_id).await?;
    ctx.read(Topic::Event(event_id));
    let event = docs::event(ctx.conn(), event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let categories = category_fields::load_categories(ctx.conn()).await?;
    let records: Vec<RecordRow> = sqlx::query_as(
        "SELECT r.product_id, r.seller_id, r.title, r.category_id, r.category_label, r.attributes,
                r.price, ep.status::text AS status, pu.total_amount AS sold_for,
                pu.created_at AS sold_at
         FROM offer_records r
         LEFT JOIN event_products ep ON ep.event_id = r.event_id AND ep.product_id = r.product_id
         LEFT JOIN purchases pu ON pu.offer_record_id = r.id
         WHERE r.event_id = $1 ORDER BY r.accepted_at",
    )
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;
    let unrecorded = docs::purchases_where(
        ctx.conn(),
        "event_id = $1 AND offer_record_id IS NULL",
        event_id,
    )
    .await?;

    let mut sellers: std::collections::HashMap<Uuid, ProofSeller> = Default::default();
    let mut items = Vec::new();
    for record in records {
        let seller = proof_seller(ctx, &mut sellers, event_id, record.seller_id).await?;
        let status = match (&record.sold_for, record.status) {
            (Some(_), _) => "sold".to_owned(),
            (None, Some(status)) => status,
            // The seller deleted it after the bazaar or the return
            (None, None) => "returned".to_owned(),
        };
        items.push(ProofItem {
            product_id: record.product_id,
            category: record.category_label.unwrap_or_default(),
            attributes: attributes(&categories, record.category_id, record.attributes.as_ref()),
            title: record.title,
            price: record.price,
            status,
            sold_for: record.sold_for,
            sold_at: record.sold_at,
            seller,
        });
    }
    for purchase in &unrecorded {
        let seller = proof_seller(ctx, &mut sellers, event_id, purchase.seller_id).await?;
        items.push(ProofItem {
            product_id: purchase.product_id,
            category: purchase.category_label.clone().unwrap_or_default(),
            attributes: attributes(
                &categories,
                purchase.category_id,
                purchase.product_attributes.as_ref(),
            ),
            title: purchase.product_title.clone().unwrap_or_default(),
            price: sales::list_price(purchase),
            status: "sold".to_owned(),
            sold_for: Some(purchase.total_amount),
            sold_at: Some(purchase.created_at),
            seller,
        });
    }
    items.sort_by(|a, b| {
        let number = |item: &ProofItem| item.seller.seller_number.unwrap_or(i32::MAX);
        number(a)
            .cmp(&number(b))
            .then_with(|| a.title.cmp(&b.title))
    });
    Ok(Proof {
        event: ProofEvent {
            title: event.title,
            location: event.location,
            start_date: event.start_date,
            end_date: event.end_date,
        },
        items,
    })
}
