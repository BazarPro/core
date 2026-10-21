//! Where items are kept at the bazaar, e.g. "Halle A".

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::event_roles::require_team;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "eventLocationCategories.listForEvent" => list_for_event);
    register!(registry, Mutation "eventLocationCategories.createCategory" => create_category);
    register!(registry, Mutation "eventLocationCategories.updateCategoryLabel" => update_category_label);
    register!(registry, Mutation "eventLocationCategories.deleteCategory" => delete_category);
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LocationCategory {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    created_at: DateTime<Utc>,
    event_id: Uuid,
    label: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn list_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<LocationCategory>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_as(
        "SELECT id, created_at, event_id, label FROM event_location_categories
         WHERE event_id = $1 ORDER BY created_at, id",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

fn label(label: &str) -> AppResult<String> {
    let label = label.trim();
    if label.is_empty() {
        return Err(AppError::bad_request("event.labelEmpty"));
    }
    Ok(label.to_owned())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    event_id: Id,
    label: String,
}

async fn create_category(ctx: &mut Ctx, args: CreateArgs) -> AppResult<Uuid> {
    require_team(ctx, args.event_id.0).await?;
    let label = label(&args.label)?;
    let id = sqlx::query_scalar(
        "INSERT INTO event_location_categories (event_id, label) VALUES ($1, $2) RETURNING id",
    )
    .bind(args.event_id.0)
    .bind(label)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(args.event_id.0));
    Ok(id)
}

/// The event of a location category, after checking the viewer is in its team.
async fn team_event_of(ctx: &mut Ctx, category: Uuid) -> AppResult<Uuid> {
    ctx.require_user()?;
    let event: Option<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM event_location_categories WHERE id = $1")
            .bind(category)
            .fetch_optional(ctx.conn())
            .await?;
    let event = event.ok_or_else(|| AppError::not_found("notFound.category"))?;
    require_team(ctx, event).await?;
    Ok(event)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateArgs {
    category_id: Id,
    label: String,
}

async fn update_category_label(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    let event = team_event_of(ctx, args.category_id.0).await?;
    let label = label(&args.label)?;
    sqlx::query("UPDATE event_location_categories SET label = $2 WHERE id = $1")
        .bind(args.category_id.0)
        .bind(label)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(event));
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteArgs {
    category_id: Id,
}

/// Items at the location keep their place in the event, without location.
async fn delete_category(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    let event = team_event_of(ctx, args.category_id.0).await?;
    // event_products.location_category_id is set to NULL by the foreign key
    sqlx::query("DELETE FROM event_location_categories WHERE id = $1")
        .bind(args.category_id.0)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(event));
    Ok(())
}
