//! Product categories.

use chrono::{DateTime, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::types::Json;
use uuid::Uuid;

use super::access::require_admin;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Audience, Ctx, Registry};
use crate::shape::{Id, ms};

const TOPIC: Topic = Topic::Table("categories");

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "categories.createCategory" => create_category);
    register!(registry, Mutation "categories.updateCategory" => update_category);
    register!(registry, Mutation "categories.deleteCategory" => delete_category);
    register!(registry, Query "categories.listForAdmin" => list_for_admin);
    register!(registry, Query "categories.getAllCategories" => get_all_categories);
    registry.share("categories.getAllCategories", same_for_everybody);
    register!(registry, Query "categories.getCategoryLabel" => get_category_label);
    register!(registry, Query "categories.getCategoryId" => get_category_id);
    register!(registry, InternalMutation "categories.seedCategories" => seed_categories);
    register!(registry, InternalMutation "categories.seedIfEmpty" => seed_if_empty);
}

/// Names in other languages. `label` remains the name that decides the extra fields
/// (category_fields) and the one shown when a language has no translation.
#[skip_serializing_none]
#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Translations {
    pub en: Option<String>,
}

impl Translations {
    fn trimmed(self) -> Self {
        Self {
            en: self
                .en
                .map(|name| name.trim().to_owned())
                .filter(|name| !name.is_empty()),
        }
    }
}

#[skip_serializing_none]
#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Category {
    #[serde(rename = "_id")]
    pub id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    pub created_at: DateTime<Utc>,
    pub label: String,
    #[serde(rename = "parentCategory")]
    pub parent_id: Option<Uuid>,
    #[serde(with = "ms")]
    pub updated_at: DateTime<Utc>,
    pub translations: Json<Translations>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    label: String,
    parent_category: Option<Id>,
    translations: Option<Translations>,
}

fn clean_label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::bad_request("category.labelEmpty"));
    }
    Ok(label.to_owned())
}

async fn find_by_label(ctx: &mut Ctx, label: &str) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar("SELECT id FROM categories WHERE label = $1 ORDER BY created_at LIMIT 1")
        .bind(label)
        .fetch_optional(ctx.conn())
        .await
}

/// Admins only. Returns the existing category if the label exists already.
async fn create_category(ctx: &mut Ctx, args: CreateArgs) -> AppResult<Uuid> {
    require_admin(ctx).await?;
    let label = clean_label(&args.label)?;
    if let Some(existing) = find_by_label(ctx, &label).await? {
        return Ok(existing);
    }
    // A parent that does not exist is left out
    let parent: Option<Uuid> = match args.parent_category {
        Some(parent) => {
            sqlx::query_scalar("SELECT id FROM categories WHERE id = $1")
                .bind(parent.0)
                .fetch_optional(ctx.conn())
                .await?
        }
        None => None,
    };
    let id = sqlx::query_scalar(
        "INSERT INTO categories (label, parent_id, translations) VALUES ($1, $2, $3) RETURNING id",
    )
    .bind(&label)
    .bind(parent)
    .bind(Json(args.translations.unwrap_or_default().trimmed()))
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateArgs {
    category_id: Id,
    label: String,
    translations: Translations,
}

/// Admins only. Items and bazaars point to the id and follow; sales keep the name they had.
async fn update_category(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let label = clean_label(&args.label)?;
    let taken: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM categories WHERE lower(label) = lower($1) AND id <> $2)",
    )
    .bind(&label)
    .bind(args.category_id.0)
    .fetch_one(ctx.conn())
    .await?;
    if taken {
        return Err(AppError::bad_request("category.labelTaken"));
    }
    let updated = sqlx::query(
        "UPDATE categories SET label = $2, translations = $3, updated_at = now() WHERE id = $1",
    )
    .bind(args.category_id.0)
    .bind(&label)
    .bind(Json(args.translations.trimmed()))
    .execute(ctx.conn())
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::not_found("notFound.category"));
    }
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteArgs {
    category_id: Id,
}

/// Admins only, and only what nothing uses: items and bazaars need their category, and a
/// sub-category would lose the fields it inherits. Sales keep the name they recorded.
async fn delete_category(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    require_admin(ctx).await?;
    let id = args.category_id.0;
    let (exists, in_use, others): (bool, bool, bool) = sqlx::query_as(
        "SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1),
                EXISTS (SELECT 1 FROM products WHERE category_id = $1)
                  OR EXISTS (SELECT 1 FROM event_categories WHERE category_id = $1)
                  OR EXISTS (SELECT 1 FROM categories WHERE parent_id = $1),
                EXISTS (SELECT 1 FROM categories WHERE id <> $1)",
    )
    .bind(id)
    .fetch_one(ctx.conn())
    .await?;
    if !exists {
        return Err(AppError::not_found("notFound.category"));
    }
    if in_use {
        return Err(AppError::bad_request("category.inUse"));
    }
    // No bazaar could be created without one, and the next start would bring the defaults back
    if !others {
        return Err(AppError::bad_request("category.lastOne"));
    }
    sqlx::query("DELETE FROM categories WHERE id = $1")
        .bind(id)
        .execute(ctx.conn())
        .await?;
    ctx.touch(TOPIC);
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminCategory {
    #[sqlx(flatten)]
    #[serde(flatten)]
    category: Category,
    product_count: i64,
    event_count: i64,
    child_count: i64,
}

async fn list_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminCategory>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    Ok(sqlx::query_as(
        "SELECT c.id, c.created_at, c.label, c.parent_id, c.updated_at, c.translations,
           (SELECT count(*) FROM products p WHERE p.category_id = c.id) AS product_count,
           (SELECT count(*) FROM event_categories e WHERE e.category_id = c.id) AS event_count,
           (SELECT count(*) FROM categories s WHERE s.parent_id = c.id) AS child_count
         FROM categories c ORDER BY c.created_at, c.id",
    )
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

fn same_for_everybody<'a>(
    _: &'a mut sqlx::PgConnection,
    _: Uuid,
    _: &'a serde_json::Value,
) -> BoxFuture<'a, sqlx::Result<Audience>> {
    async { Ok(Audience::Visitors) }.boxed()
}

async fn get_all_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<Category>> {
    ctx.read(TOPIC);
    Ok(sqlx::query_as(
        "SELECT c.id, c.created_at, c.label, c.parent_id, c.updated_at, c.translations
         FROM categories c ORDER BY c.created_at",
    )
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LabelArgs {
    category_id: Id,
}

async fn get_category_label(ctx: &mut Ctx, args: LabelArgs) -> AppResult<Option<String>> {
    ctx.read(TOPIC);
    Ok(
        sqlx::query_scalar("SELECT label FROM categories WHERE id = $1")
            .bind(args.category_id.0)
            .fetch_optional(ctx.conn())
            .await?,
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdArgs {
    category_label: String,
}

async fn get_category_id(ctx: &mut Ctx, args: IdArgs) -> AppResult<Option<Uuid>> {
    ctx.read(TOPIC);
    Ok(find_by_label(ctx, &args.category_label).await?)
}

/// The default categories (German label, English name); adds the missing ones, safe to run
/// repeatedly: `bazarpro-backend run categories.seedCategories`
pub const DEFAULT_CATEGORIES: [(&str, &str); 11] = [
    ("Kleidung", "Clothing"),
    ("Schuhe", "Shoes"),
    ("Sport", "Sports"),
    ("Fahrräder", "Bikes"),
    ("Elektronik", "Electronics"),
    ("Bücher", "Books"),
    ("Spielzeug", "Toys"),
    ("Möbel", "Furniture"),
    ("Haushalt", "Household"),
    ("Accessoires", "Accessories"),
    ("Sonstiges", "Other"),
];

async fn seed_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<&'static str> {
    for (label, en) in DEFAULT_CATEGORIES {
        if find_by_label(ctx, label).await?.is_none() {
            sqlx::query("INSERT INTO categories (label, translations) VALUES ($1, $2)")
                .bind(label)
                .bind(Json(Translations {
                    en: Some(en.to_owned()),
                }))
                .execute(ctx.conn())
                .await?;
        }
    }
    ctx.touch(TOPIC);
    Ok("Categories seeded successfully")
}

/// On every start of the server: without categories no bazaar can be created, and the app
/// has no page to add them. An instance that already has categories keeps exactly those.
async fn seed_if_empty(ctx: &mut Ctx, args: NoArgs) -> AppResult<&'static str> {
    let any: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories)")
        .fetch_one(ctx.conn())
        .await?;
    if any {
        return Ok("Categories already exist");
    }
    seed_categories(ctx, args).await
}
