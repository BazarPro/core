//! Demo data and setup helpers: starter items for new accounts, the
//! default feature flags, wiping a test database.

use futures::FutureExt;
use futures::future::BoxFuture;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::AppState;
use crate::auth::users::STARTER_PRODUCTS_JOB;
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

const SEED_ADMIN_EMAIL: &str = "admin@bazarpro.de";

pub fn register(registry: &mut Registry) {
    register!(registry, InternalMutation "seed.createStarterProducts" => create_starter_products);
    register!(registry, InternalMutation "seed.isSeeded" => is_seeded);
    register!(registry, InternalMutation "seed.seedFeatureFlags" => seed_feature_flags);
    register!(registry, InternalMutation "seed.toggleFeatureFlag" => toggle_feature_flag);
    register!(registry, InternalMutation "seed.removeAllData" => remove_all_data);
    register!(registry, InternalMutation "seed.createFeatureShowcase" => create_feature_showcase);
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ShowcaseArgs {
    title: String,
    locale: Option<String>,
}

/// Another showcase bazaar with its own title, so end-to-end tests that change data
/// (offers, sales, …) do not interfere with each other. Requires the demo users.
async fn create_feature_showcase(
    ctx: &mut Ctx,
    args: ShowcaseArgs,
) -> AppResult<crate::demo::core::Showcase> {
    if std::env::var("ALLOW_REMOVE_ALL_DATA").as_deref() != Ok("true") {
        return Err(AppError::forbidden("DEMO_DATA_NOT_ALLOWED"));
    }
    let locale = args
        .locale
        .as_deref()
        .and_then(Locale::parse)
        .unwrap_or_default();
    crate::demo::create_feature_showcase(ctx, &args.title, locale).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UserArgs {
    user_id: Id,
}

/// Two example items for a new account (flag is_create_products_on_signup_enabled),
/// with the photos of the demo items if there are any.
async fn create_starter_products(ctx: &mut Ctx, args: UserArgs) -> AppResult<()> {
    let category: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM categories ORDER BY label = 'Sport' DESC, created_at LIMIT 1",
    )
    .fetch_optional(ctx.conn())
    .await?;
    let Some(category) = category else {
        tracing::warn!("no category, starter items not created");
        return Ok(());
    };
    let items = [
        (
            "Mountainbike 'Rockrider' 26 Zoll",
            "Gut erhaltenes Mountainbike für Einsteiger. 21 Gänge, Federgabel vorne. Bremsen und Schaltung wurden erst kürzlich geprüft. Kleine Kratzer am Rahmen, aber technisch einwandfrei.",
            "good",
            "145",
            "Mountainbike",
        ),
        (
            "Fahrradhelm Gr. M (55-59cm) FLAIR",
            "Sicherer Fahrradhelm der Marke FLAIR in Größe M (55-59cm). Verstellbar für optimalen Sitz. Inklusive Belüftungssystem und waschbarem Innenfutter. Der Helm ist sturzfrei und in sehr gutem Zustand.",
            "very-good",
            "35",
            "Kindersitz",
        ),
    ];
    for (title, description, condition, price, template) in items {
        let product: Uuid = sqlx::query_scalar(
            "INSERT INTO products (title, vendor_id, description, condition, category_id, price, ready_for_sale, sold)
             VALUES ($1, $2, $3, $4::product_condition, $5, $6::numeric, true, false) RETURNING id",
        )
        .bind(title)
        .bind(args.user_id.0)
        .bind(description)
        .bind(condition)
        .bind(category)
        .bind(price)
        .fetch_one(ctx.conn())
        .await?;
        // The photos of the latest demo item with this title, shared with it
        sqlx::query(
            "INSERT INTO product_images (product_id, position, file_id)
             SELECT $1, i.position, i.file_id FROM product_images i
             WHERE i.product_id = (SELECT id FROM products WHERE title LIKE '%' || $2 || '%' AND id <> $1
                                   ORDER BY created_at DESC LIMIT 1)",
        )
        .bind(product)
        .bind(template)
        .execute(ctx.conn())
        .await?;
    }
    ctx.touch(Topic::User(args.user_id.0));
    ctx.touch(Topic::Table("products"));
    Ok(())
}

/// Job after sign-up, see auth::users.
pub fn starter_products_job(
    state: AppState,
    payload: Value,
) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        crate::rpc::call(
            &state,
            None,
            "seed.createStarterProducts",
            json!({ "userId": payload["userId"] }),
        )
        .await
        .map_err(|err| anyhow::anyhow!("{err}"))?;
        Ok(())
    }
    .boxed()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// The demo data is there once its admin exists.
async fn is_seeded(ctx: &mut Ctx, _: NoArgs) -> AppResult<bool> {
    Ok(
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM users WHERE email = $1)")
            .bind(SEED_ADMIN_EMAIL)
            .fetch_one(ctx.conn())
            .await?,
    )
}

/// The flags of a demo or review instance.
async fn seed_feature_flags(ctx: &mut Ctx, _: NoArgs) -> AppResult<&'static str> {
    let defaults = [
        (
            "is_demo_mode",
            true,
            "Shows a demo banner on the landing page",
        ),
        ("is_login_enabled", true, "Enables the login page"),
        (
            "is_registration_enabled",
            false,
            "Enables the registration page",
        ),
        (
            "is_event_creation_enabled",
            true,
            "Enables creation of new events",
        ),
        (
            "is_create_products_on_signup_enabled",
            true,
            "Enables automatic creation of starter products for new users",
        ),
        (
            "allow_undo_inventory_actions",
            true,
            "Enables the ability to undo sales and returns in the inventory",
        ),
        (
            "is_e2e_auth_skip_email",
            false,
            "Skips SMTP delivery in E2E and stores auth verification codes for tests",
        ),
    ];
    for (key, value, description) in defaults {
        sqlx::query(
            "INSERT INTO feature_flags (key, value, description) VALUES ($1, $2, $3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description",
        )
        .bind(key)
        .bind(value)
        .bind(description)
        .execute(ctx.conn())
        .await?;
    }
    ctx.touch(Topic::Table("feature_flags"));
    Ok("Feature flags seeded")
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct KeyArgs {
    key: String,
}

async fn toggle_feature_flag(ctx: &mut Ctx, args: KeyArgs) -> AppResult<()> {
    sqlx::query("UPDATE feature_flags SET value = NOT value WHERE key = $1")
        .bind(args.key)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Table("feature_flags"));
    Ok(())
}

/// Empties all tables of a test database. Only with ALLOW_REMOVE_ALL_DATA=true, so it
/// cannot happen on a production instance by mistake. Uploaded files stay in the store.
async fn remove_all_data(ctx: &mut Ctx, _: NoArgs) -> AppResult<&'static str> {
    if std::env::var("ALLOW_REMOVE_ALL_DATA").as_deref() != Ok("true") {
        return Err(AppError::forbidden("REMOVE_ALL_DATA_NOT_ALLOWED"));
    }
    let tables: Vec<String> = sqlx::query_scalar(
        "SELECT tablename::text FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_sqlx_migrations'",
    )
    .fetch_all(ctx.conn())
    .await?;
    let list = tables
        .iter()
        .map(|t| format!("\"{t}\""))
        .collect::<Vec<_>>()
        .join(", ");
    sqlx::query(sqlx::AssertSqlSafe(format!("TRUNCATE {list} CASCADE")))
        .execute(ctx.conn())
        .await?;
    Ok("All data removed.")
}

pub const STARTER_JOB: &str = STARTER_PRODUCTS_JOB;
