//! Rows written directly, like `t.run((ctx) => ctx.db.insert(…))` in the Convex tests.

use bazarpro_backend::auth::session;
use serde_json::Value;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn user(db: &PgPool, name: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO users (name, email, status, system_role) VALUES ($1, $2, 'active', 'user') RETURNING id",
    )
    .bind(name)
    .bind(format!("{}@test.example", name.to_lowercase().replace(' ', ".")))
    .fetch_one(db)
    .await
    .unwrap()
}

pub async fn admin(db: &PgPool, name: &str) -> Uuid {
    let id = user(db, name).await;
    sqlx::query("UPDATE users SET system_role = 'admin' WHERE id = $1")
        .bind(id)
        .execute(db)
        .await
        .unwrap();
    id
}

/// A session cookie value for the user, like `t.withIdentity({ subject: userId })`.
pub async fn session(db: &PgPool, user: Uuid) -> String {
    let mut conn = db.acquire().await.unwrap();
    session::create(&mut conn, user).await.unwrap()
}

pub async fn category(db: &PgPool, label: &str) -> Uuid {
    sqlx::query_scalar("INSERT INTO categories (label) VALUES ($1) RETURNING id")
        .bind(label)
        .fetch_one(db)
        .await
        .unwrap()
}

/// An event from now - `start_hours` to now + `end_hours`.
pub struct EventSpec<'a> {
    pub title: &'a str,
    pub organizer: Uuid,
    pub start_hours: i32,
    pub end_hours: i32,
    pub commission: i32,
    pub features: Value,
}

impl<'a> EventSpec<'a> {
    pub fn new(title: &'a str, organizer: Uuid) -> Self {
        Self {
            title,
            organizer,
            start_hours: 24,
            end_hours: 30,
            commission: 10,
            features: serde_json::json!({}),
        }
    }
}

pub async fn event(db: &PgPool, spec: EventSpec<'_>) -> Uuid {
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO events (title, description, location, start_date, end_date, contact_info,
           visibility, commission, organizer_id, features)
         VALUES ($1, 'D', 'L', now() + make_interval(hours => $2), now() + make_interval(hours => $3),
           'I', 'public', $4, $5, $6)
         RETURNING id",
    )
    .bind(spec.title)
    .bind(spec.start_hours)
    .bind(spec.end_hours)
    .bind(spec.commission)
    .bind(spec.organizer)
    .bind(spec.features)
    .fetch_one(db)
    .await
    .unwrap();
    role(db, id, spec.organizer, "organizer").await;
    id
}

pub async fn role(db: &PgPool, event: Uuid, user: Uuid, role: &str) {
    sqlx::query(
        "INSERT INTO event_roles (event_id, user_id, role) VALUES ($1, $2, $3::event_role_kind)",
    )
    .bind(event)
    .bind(user)
    .bind(role)
    .execute(db)
    .await
    .unwrap();
}

pub async fn product(db: &PgPool, vendor: Uuid, title: &str, price: f64) -> Uuid {
    let category: Uuid = match sqlx::query_scalar("SELECT id FROM categories LIMIT 1")
        .fetch_optional(db)
        .await
        .unwrap()
    {
        Some(id) => id,
        None => category(db, "Allgemein").await,
    };
    sqlx::query_scalar(
        "INSERT INTO products (title, vendor_id, description, condition, category_id, price,
           ready_for_sale, sold)
         VALUES ($1, $2, 'D', 'new', $3, $4::numeric, true, false) RETURNING id",
    )
    .bind(title)
    .bind(vendor)
    .bind(category)
    .bind(price.to_string())
    .fetch_one(db)
    .await
    .unwrap()
}

pub async fn event_product(db: &PgPool, event: Uuid, product: Uuid, status: &str) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO event_products (event_id, product_id, status) VALUES ($1, $2, $3::event_product_status)
         RETURNING id",
    )
    .bind(event)
    .bind(product)
    .bind(status)
    .fetch_one(db)
    .await
    .unwrap()
}

/// A sale with total, commission and payout in €.
pub async fn purchase(
    db: &PgPool,
    event: Uuid,
    product: Uuid,
    seller: Uuid,
    amounts: (f64, f64, f64),
) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO purchases (product_id, event_id, seller_id, total_amount, commission_amount,
           payout_amount, payout_status, payout_date)
         VALUES ($1, $2, $3, $4::numeric, $5::numeric, $6::numeric, false, now()) RETURNING id",
    )
    .bind(product)
    .bind(event)
    .bind(seller)
    .bind(amounts.0.to_string())
    .bind(amounts.1.to_string())
    .bind(amounts.2.to_string())
    .fetch_one(db)
    .await
    .unwrap()
}

pub async fn event_seller(db: &PgPool, event: Uuid, user: Uuid, number: i32, paid: bool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
           payout_received, number)
         VALUES ($1, $2, 0, 0, 0, $3, $4) RETURNING id",
    )
    .bind(event)
    .bind(user)
    .bind(paid)
    .bind(number)
    .fetch_one(db)
    .await
    .unwrap()
}
