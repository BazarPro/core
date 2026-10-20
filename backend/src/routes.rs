use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::error::AppResult;
use crate::{AppState, realtime};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/healthz", get(healthz))
        .route("/ws", get(realtime::ws_handler))
}

/// For the Docker healthcheck and Traefik: also fails when the database is unreachable.
async fn healthz(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}
