use axum::extract::State;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};

use crate::error::AppResult;
use crate::{AppState, auth, realtime, rpc, storage};

/// The app's web server and Traefik send everything below /api here, so cookies stay on
/// the app's own domain.
pub fn router() -> Router<AppState> {
    let api = Router::new()
        .route("/ws", get(realtime::ws_handler))
        .nest("/auth", auth::router())
        .nest("/files", storage::router())
        .route("/query/{name}", post(rpc::query_handler))
        .route("/mutation/{name}", post(rpc::mutation_handler))
        .route(
            "/unsubscribe",
            post(crate::modules::notifications::one_click_handler),
        );
    Router::new()
        .route("/healthz", get(healthz))
        .nest("/api", api)
}

/// For the Docker healthcheck and Traefik: also fails when the database is unreachable.
async fn healthz(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}
