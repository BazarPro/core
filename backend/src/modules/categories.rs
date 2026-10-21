//! Product categories.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::access::require_admin;
use crate::error::AppResult;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

const TOPIC: Topic = Topic::Table("categories");

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "categories.createCategory" => create_category);
    register!(registry, Query "categories.getAllCategories" => get_all_categories);
    register!(registry, Query "categories.getCategoryLabel" => get_category_label);
    register!(registry, Query "categories.getCategoryId" => get_category_id);
    register!(registry, InternalMutation "categories.seedCategories" => seed_categories);
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    label: String,
    parent_category: Option<Id>,
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
    if let Some(existing) = find_by_label(ctx, &args.label).await? {
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
        "INSERT INTO categories (label, parent_id) VALUES ($1, $2) RETURNING id",
    )
    .bind(&args.label)
    .bind(parent)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

async fn get_all_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<Category>> {
    ctx.read(TOPIC);
    Ok(sqlx::query_as(
        "SELECT id, created_at, label, parent_id, updated_at FROM categories ORDER BY created_at",
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

/// The default categories (German labels); adds the missing ones, safe to run repeatedly:
/// `bazarpro-backend run categories.seedCategories`
pub const DEFAULT_CATEGORIES: [&str; 11] = [
    "Kleidung",
    "Schuhe",
    "Sport",
    "Fahrräder",
    "Elektronik",
    "Bücher",
    "Spielzeug",
    "Möbel",
    "Haushalt",
    "Accessoires",
    "Sonstiges",
];

async fn seed_categories(ctx: &mut Ctx, _: NoArgs) -> AppResult<&'static str> {
    for label in DEFAULT_CATEGORIES {
        if find_by_label(ctx, label).await?.is_none() {
            sqlx::query("INSERT INTO categories (label) VALUES ($1)")
                .bind(label)
                .execute(ctx.conn())
                .await?;
        }
    }
    ctx.touch(TOPIC);
    Ok("Categories seeded successfully")
}
