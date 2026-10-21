use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::{Value, json};
use tower_http::CompressionLevel;
use tower_http::compression::CompressionLayer;

use crate::error::AppResult;
use crate::{AppState, auth, realtime, rpc, storage};

/// The app's web server and Traefik send everything below /api here, so cookies stay on
/// the app's own domain.
pub fn router() -> Router<AppState> {
    let api = Router::new()
        .route("/ws", get(realtime::ws_handler))
        .nest("/auth", auth::router())
        .nest("/files", storage::router())
        .merge(rpc_routes())
        .route(
            "/unsubscribe",
            post(crate::modules::notifications::one_click_handler),
        )
        .layer(axum::middleware::from_fn(run_to_completion));
    Router::new()
        .route("/healthz", get(healthz))
        .nest("/api", api)
}

/// Answers can be large (all items of an event, ~70 KB) and are refetched on every
/// change: gzip makes them about a third. The fastest level, so the cache stays cheap.
fn rpc_routes() -> Router<AppState> {
    Router::new()
        .route("/query/{name}", post(rpc::query_handler))
        .route("/mutation/{name}", post(rpc::mutation_handler))
        .layer(CompressionLayer::new().quality(CompressionLevel::Fastest))
}

/// Finishes a request even when the client goes away (a reload, a closed tab). Dropping
/// a handler in the middle of a database call can hand its connection back to the pool
/// with the transaction still open, and a mutation would stop halfway.
async fn run_to_completion(request: Request, next: Next) -> Response {
    match tokio::spawn(next.run(request)).await {
        Ok(response) => response,
        Err(err) => {
            tracing::error!(error = %err, "request task failed");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

/// For the Docker healthcheck and Traefik: also fails when the database is unreachable.
async fn healthz(State(state): State<AppState>) -> AppResult<Json<Value>> {
    sqlx::query("SELECT 1").execute(&state.db).await?;
    Ok(Json(json!({ "ok": true })))
}
