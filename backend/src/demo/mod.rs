//! Demo data for review apps, local development, screenshots of the docs and the
//! end-to-end tests.
//!
//! `core` writes the users and events the end-to-end tests rely on straight to the
//! tables. `extended` then plays through bazaars in every state by calling the real
//! functions as organizers, sellers, buyers and admins, so the data is as consistent as
//! data from real use. Everything runs in one transaction: emails the functions
//! schedule are dropped before the commit, and the dates are moved to their final
//! values at the end.
//!
//! `bazarpro-backend seed [--force] [--locale en]`; English is for screenshots.

pub mod catalog;
pub mod core;
mod extended;

use std::collections::HashMap;

use bytes::Bytes;
use chrono::{DateTime, Duration, Utc};
use futures::future::join_all;
use serde_json::json;
use uuid::Uuid;

use crate::AppState;
use crate::error::AppResult;
use crate::i18n::Locale;
use crate::rpc::Ctx;
use crate::{mail, storage};
use catalog::{CATEGORIES, Cat, IMAGES, Text};

/// Lucia scrypt hash of "123456", the password of every demo account.
const PASSWORD_HASH: &str = "65100a5141a9667926e801573731697a:6061b961e66b635a66ae6a46a35894399203d79c0b65a8518d0ff78c6e2f80630ecc8aff6da48628cb309029ca645b0756e0f8cd56bfce5c6fe2884bc1c6f323";

/// The photos of the end-to-end items, in the order the showcase hands them out.
const PRODUCT_IMAGE_KEYS: [&str; 7] = [
    "ski",
    "ski_helmet",
    "jacket",
    "boots",
    "mtb",
    "mtb_mountains",
    "bike_helmet",
];

pub struct Options {
    /// Seed even when the demo admin exists
    pub force: bool,
    pub locale: Locale,
    /// Download the photos from Unsplash (not in tests)
    pub images: bool,
}

/// What the demo writers share: language, the moment of seeding, photos and categories.
pub struct Seeder {
    pub locale: Locale,
    pub now: DateTime<Utc>,
    images: HashMap<&'static str, Uuid>,
    product_images: Vec<Uuid>,
    categories: HashMap<Cat, Uuid>,
}

pub struct UserSpec<'a> {
    pub email: &'a str,
    pub name: &'a str,
    pub first_name: Option<&'a str>,
    pub last_name: Option<&'a str>,
    pub admin: bool,
    pub status: &'a str,
    pub verified: bool,
    pub street: Option<String>,
    pub zip_code: Option<&'a str>,
    pub city: Option<&'a str>,
    pub country: Option<&'a str>,
    pub phone: Option<String>,
    pub locale: Option<Locale>,
    pub days_ago: i64,
}

impl<'a> UserSpec<'a> {
    pub fn simple(email: &'a str, name: &'a str) -> Self {
        Self {
            email,
            name,
            first_name: None,
            last_name: None,
            admin: false,
            status: "active",
            verified: true,
            street: None,
            zip_code: None,
            city: None,
            country: None,
            phone: None,
            locale: None,
            days_ago: 0,
        }
    }
}

impl Seeder {
    /// Makes sure the default categories exist in the language of the demo.
    pub async fn load(
        ctx: &mut Ctx,
        locale: Locale,
        images: HashMap<&'static str, Uuid>,
        product_images: Option<Vec<Uuid>>,
    ) -> AppResult<Self> {
        let mut categories = HashMap::new();
        for (cat, label) in CATEGORIES {
            let label = label.get(locale);
            let existing: Option<Uuid> = sqlx::query_scalar(
                "SELECT id FROM categories WHERE label = $1 ORDER BY created_at LIMIT 1",
            )
            .bind(label)
            .fetch_optional(ctx.conn())
            .await?;
            let id = match existing {
                Some(id) => id,
                None => {
                    sqlx::query_scalar("INSERT INTO categories (label) VALUES ($1) RETURNING id")
                        .bind(label)
                        .fetch_one(ctx.conn())
                        .await?
                }
            };
            categories.insert(*cat, id);
        }
        ctx.touch(crate::realtime::Topic::Table("categories"));
        let product_images = product_images.unwrap_or_else(|| {
            PRODUCT_IMAGE_KEYS
                .iter()
                .filter_map(|key| images.get(key).copied())
                .collect()
        });
        let now: DateTime<Utc> = sqlx::query_scalar("SELECT now()")
            .fetch_one(ctx.conn())
            .await?;
        Ok(Self {
            locale,
            now,
            images,
            product_images,
            categories,
        })
    }

    pub fn text(&self, text: Text) -> &'static str {
        text.get(self.locale)
    }

    pub fn image(&self, key: &str) -> Option<Uuid> {
        self.images.get(key).copied()
    }

    pub fn product_images(&self) -> Vec<Uuid> {
        self.product_images.clone()
    }

    pub fn category(&self, cat: Cat) -> Uuid {
        self.categories[&cat]
    }

    /// The user with this email, created with a password account if missing.
    pub async fn ensure_user(&self, ctx: &mut Ctx, spec: &UserSpec<'_>) -> AppResult<Uuid> {
        let existing: Option<Uuid> =
            sqlx::query_scalar("SELECT id FROM users WHERE email = $1 ORDER BY created_at LIMIT 1")
                .bind(spec.email)
                .fetch_optional(ctx.conn())
                .await?;
        if let Some(id) = existing {
            return Ok(id);
        }
        let mut parts = spec.name.splitn(2, ' ');
        let first = spec.first_name.or(parts.next()).unwrap_or(spec.name);
        let last = spec.last_name.or(parts.next()).unwrap_or("User");
        let created = self.now - Duration::days(spec.days_ago);
        let id: Uuid = sqlx::query_scalar(
            "INSERT INTO users (name, email, first_name, last_name, system_role, status, is_mail_confirmed,
               email_verified_at, needs_onboarding, street, zip_code, city, country, phone, locale, created_at)
             VALUES ($1, $2, $3, $4, $5::system_role, $6::user_status, $7, $8, false, $9, $10, $11, $12,
               $13, $14::locale, $15)
             RETURNING id",
        )
        .bind(spec.name)
        .bind(spec.email)
        .bind(first)
        .bind(last)
        .bind(if spec.admin { "admin" } else { "user" })
        .bind(spec.status)
        .bind(spec.verified)
        .bind(spec.verified.then_some(created))
        .bind(spec.street.as_deref())
        .bind(spec.zip_code)
        .bind(spec.city)
        .bind(spec.country)
        .bind(spec.phone.as_deref())
        .bind(spec.locale.map(Locale::as_str))
        .bind(created)
        .fetch_one(ctx.conn())
        .await?;
        sqlx::query(
            "INSERT INTO auth_accounts (user_id, provider, provider_account_id, secret, email_verified)
             VALUES ($1, 'password', $2, $3, $4)",
        )
        .bind(id)
        .bind(spec.email)
        .bind(PASSWORD_HASH)
        .bind(spec.verified.then_some(spec.email))
        .execute(ctx.conn())
        .await?;
        Ok(id)
    }

    pub async fn add_role(
        &self,
        ctx: &mut Ctx,
        event: Uuid,
        user: Uuid,
        role: &str,
    ) -> AppResult<()> {
        sqlx::query(
            "INSERT INTO event_roles (event_id, user_id, role) VALUES ($1, $2, $3::event_role_kind)
             ON CONFLICT DO NOTHING",
        )
        .bind(event)
        .bind(user)
        .bind(role)
        .execute(ctx.conn())
        .await?;
        Ok(())
    }

    /// Registers a user as seller of an event with the next seller number, like joining.
    pub async fn add_seller(
        &self,
        ctx: &mut Ctx,
        event: Uuid,
        user: Uuid,
        payout_received: bool,
    ) -> AppResult<()> {
        self.add_role(ctx, event, user, "seller").await?;
        let number: i32 = sqlx::query_scalar(
            "UPDATE events SET last_seller_number = COALESCE(last_seller_number, 0) + 1
             WHERE id = $1 RETURNING last_seller_number",
        )
        .bind(event)
        .fetch_one(ctx.conn())
        .await?;
        sqlx::query(
            "INSERT INTO event_sellers (event_id, user_id, payout_received, total_fee, commission_fee,
               payout_amount, number)
             VALUES ($1, $2, $3, 0, 0, 0, $4)",
        )
        .bind(event)
        .bind(user)
        .bind(payout_received)
        .bind(number)
        .execute(ctx.conn())
        .await?;
        Ok(())
    }

    pub async fn set_images(ctx: &mut Ctx, product: Uuid, images: &[Uuid]) -> AppResult<()> {
        for (position, file) in images.iter().enumerate() {
            sqlx::query(
                "INSERT INTO product_images (product_id, position, file_id) VALUES ($1, $2, $3)",
            )
            .bind(product)
            .bind(position as i16)
            .bind(file)
            .execute(ctx.conn())
            .await?;
        }
        Ok(())
    }
}

/// A grey 1×1 PNG for photos that could not be downloaded.
const PLACEHOLDER_PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x00, 0x00, 0x00, 0x00, 0x3A, 0x7E, 0x9B,
    0x55, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0xD8, 0x00, 0x00, 0x00,
    0xB2, 0x00, 0xB1, 0x55, 0x0A, 0xE8, 0x2A, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];

/// Downloads the photos (with `download`); a photo that fails, or all of them without
/// `download`, becomes a grey placeholder, so seeding works offline and in tests.
async fn load_images(
    state: &AppState,
    download: bool,
) -> anyhow::Result<HashMap<&'static str, Uuid>> {
    let downloads = join_all(IMAGES.iter().map(|(key, id)| async move {
        if !download {
            return (*key, None);
        }
        let response = state
            .http
            .get(catalog::image_url(id))
            .send()
            .await
            .and_then(|response| response.error_for_status());
        let bytes: Option<Bytes> = match response {
            Ok(response) => response.bytes().await.ok(),
            Err(err) => {
                tracing::warn!(%err, key, "demo photo not downloaded");
                None
            }
        };
        (*key, bytes)
    }))
    .await;
    let mut conn = state.db.acquire().await?;
    let mut images = HashMap::new();
    let mut placeholder = None;
    for (key, bytes) in downloads {
        let id = match (bytes, placeholder) {
            (Some(bytes), _) => storage::store(state, &mut conn, bytes, "image/jpeg", None).await?,
            (None, Some(id)) => id,
            (None, None) => {
                let bytes = Bytes::from_static(PLACEHOLDER_PNG);
                let id = storage::store(state, &mut conn, bytes, "image/png", None).await?;
                *placeholder.insert(id)
            }
        };
        images.insert(key, id);
    }
    Ok(images)
}

/// Inserts the demo data. Skips when the database is already seeded, because review
/// apps run it on every deploy; then it only moves the running demo bazaars to today.
pub async fn run(state: &AppState, options: Options) -> anyhow::Result<String> {
    let seeded: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)")
        .bind(core::SEED_ADMIN_EMAIL)
        .fetch_one(&state.db)
        .await?;
    if seeded && !options.force {
        let mut ctx = Ctx::begin(state).await?;
        refresh_running(&mut ctx).await?;
        ctx.commit().await?;
        return Ok("Seed übersprungen: Datenbank enthält bereits Demo-Daten.".to_owned());
    }

    tracing::info!("downloading demo photos");
    let images = load_images(state, options.images).await?;
    let failed = |err: crate::error::AppError| anyhow::anyhow!("{err}");

    let mut ctx = Ctx::begin(state).await?;
    ctx.call(None, "seed.seedFeatureFlags", json!({}))
        .await
        .map_err(failed)?;
    let seeder = Seeder::load(&mut ctx, options.locale, images, None)
        .await
        .map_err(failed)?;
    tracing::info!("inserting the test users and events");
    let users = core::insert_users(&seeder, &mut ctx)
        .await
        .map_err(failed)?;
    core::insert(&seeder, &mut ctx, &users)
        .await
        .map_err(failed)?;
    tracing::info!("playing through the demo bazaars");
    extended::insert(&seeder, &mut ctx, &users).await?;

    // Reminders are due by the dates; the demo bazaars count as reminded
    sqlx::query(
        "UPDATE events SET reminder_day_before_sent_for = start_date, reminder_pickup_sent_for = end_date",
    )
    .execute(ctx.conn())
    .await?;
    // Emails the functions scheduled for the demo accounts
    sqlx::query("DELETE FROM jobs WHERE created_at = now() AND kind = ANY($1)")
        .bind([mail::NOTIFICATION_JOB, mail::VERIFICATION_JOB])
        .execute(ctx.conn())
        .await?;
    // Sales and sellers inserted directly get their snapshots like real ones
    crate::modules::seller_records::backfill_snapshots(ctx.conn()).await?;
    ctx.call(None, "moderation.refreshPlatformStats", json!({}))
        .await
        .map_err(failed)?;
    ctx.commit().await.map_err(failed)?;
    Ok(if options.images {
        "Seeding abgeschlossen! Bilder wurden geladen und zugeordnet."
    } else {
        "Seeding abgeschlossen (ohne Fotos)."
    }
    .to_owned())
}

/// Bazaars that should be running whenever someone looks at a review app.
const RUNNING_TITLES: [Text; 2] = [core::SHOWCASE_TITLE, extended::KIDS_TITLE];

/// Review apps keep their database across deploys, so the bazaars seeded with the first
/// deploy would be over after a while: moves each one ending within a day to "started two
/// hours ago" (on the full hour), keeping its length.
pub async fn refresh_running(ctx: &mut Ctx) -> AppResult<()> {
    let titles: Vec<&str> = RUNNING_TITLES
        .iter()
        .flat_map(|title| [title.de, title.en])
        .collect();
    let moved: Vec<Uuid> = sqlx::query_scalar(
        "UPDATE events SET
           end_date = date_trunc('hour', now()) - interval '2 hours' + (end_date - start_date),
           start_date = date_trunc('hour', now()) - interval '2 hours',
           features = CASE WHEN features ? 'discountStartsAt'
             THEN jsonb_set(features, '{discountStartsAt}',
               to_jsonb((extract(epoch FROM now() - interval '1 hour') * 1000)::bigint))
             ELSE features END,
           reminder_day_before_sent_for = date_trunc('hour', now()) - interval '2 hours'
         WHERE title = ANY($1) AND end_date < now() + interval '1 day'
         RETURNING id",
    )
    .bind(&titles)
    .fetch_all(ctx.conn())
    .await?;
    sqlx::query("UPDATE events SET reminder_pickup_sent_for = end_date WHERE id = ANY($1)")
        .bind(&moved)
        .execute(ctx.conn())
        .await?;
    for id in moved {
        ctx.touch(crate::realtime::Topic::Event(id));
    }
    ctx.touch(crate::realtime::Topic::Events);
    Ok(())
}

/// `seed.createFeatureShowcase`: another showcase with its own title, so end-to-end tests
/// that change data (offers, sales, …) do not interfere with each other.
pub async fn create_feature_showcase(
    ctx: &mut Ctx,
    title: &str,
    locale: Locale,
) -> AppResult<core::Showcase> {
    let images: Vec<Uuid> = sqlx::query_scalar(
        "SELECT file_id FROM product_images GROUP BY file_id ORDER BY min(position), file_id",
    )
    .fetch_all(ctx.conn())
    .await?;
    let cover = images.first().copied();
    let seeder = Seeder::load(ctx, locale, HashMap::new(), Some(images)).await?;
    let mut user = async |email: &str| -> AppResult<Uuid> {
        let id: Option<Uuid> = sqlx::query_scalar("SELECT id FROM users WHERE email = $1")
            .bind(email)
            .fetch_optional(ctx.conn())
            .await?;
        id.ok_or_else(|| {
            crate::error::AppError::coded(
                axum::http::StatusCode::NOT_FOUND,
                "SEED_USER_MISSING",
                &[("email", email)],
            )
        })
    };
    let users = core::ShowcaseUsers {
        organizer: user("user1@bazarpro.de").await?,
        helper: user("user2@bazarpro.de").await?,
        sellers: [
            user("seller@bazarpro.de").await?,
            user("user3@bazarpro.de").await?,
            user("haendler@bazarpro.de").await?,
        ],
        buyers: [
            user("kaeufer1@bazarpro.de").await?,
            user("kaeufer2@bazarpro.de").await?,
        ],
    };
    let showcase = core::insert_feature_showcase(&seeder, ctx, title, &users, cover).await?;
    ctx.touch(crate::realtime::Topic::Events);
    Ok(showcase)
}
