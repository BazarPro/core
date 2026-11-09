//! Promo page of a bazaar: texts and choices for flyers, posters and social media pictures.
//! The pictures are drawn in the app; the backend only keeps the organizers' texts, so
//! co-organizers and other devices see the same.

use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::event_roles::require_team;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

/// Texts of a few pictures fit easily; more is no promo text
const MAX_PROMO_BYTES: usize = 64 * 1024;

fn invalid(details: &str) -> AppError {
    AppError::coded(
        StatusCode::BAD_REQUEST,
        "INVALID_ARGUMENTS",
        &[("details", details)],
    )
}

pub fn register(registry: &mut Registry) {
    register!(registry, Query "promos.getPromo" => get_promo);
    register!(registry, Mutation "promos.savePromo" => save_promo);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Promo {
    promo: Value,
    #[serde(with = "crate::shape::ms")]
    updated_at: DateTime<Utc>,
}

async fn get_promo(ctx: &mut Ctx, args: EventArgs) -> AppResult<Option<Promo>> {
    let event = args.event_id.0;
    require_team(ctx, event).await?;
    ctx.read(Topic::Promo(event));
    let promo = sqlx::query_as::<_, (Value, DateTime<Utc>)>(
        "SELECT promo, updated_at FROM event_promos WHERE event_id = $1",
    )
    .bind(event)
    .fetch_optional(ctx.conn())
    .await?
    .map(|(promo, updated_at)| Promo { promo, updated_at });
    Ok(promo)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveArgs {
    event_id: Id,
    promo: Value,
}

async fn save_promo(ctx: &mut Ctx, args: SaveArgs) -> AppResult<()> {
    let event = args.event_id.0;
    let user = require_team(ctx, event).await?;
    if !args.promo.is_object() {
        return Err(invalid("promoNoObject"));
    }
    if serde_json::to_vec(&args.promo).is_ok_and(|json| json.len() > MAX_PROMO_BYTES) {
        return Err(invalid("promoTooLarge"));
    }
    sqlx::query(
        "INSERT INTO event_promos (event_id, promo, updated_by) VALUES ($1, $2, $3)
         ON CONFLICT (event_id) DO UPDATE
         SET promo = EXCLUDED.promo, updated_by = EXCLUDED.updated_by, updated_at = now()",
    )
    .bind(event)
    .bind(args.promo)
    .bind(user)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Promo(event));
    Ok(())
}
