pub mod config;
pub mod error;
pub mod jobs;
pub mod realtime;
mod routes;

use axum::Router;
use sqlx::PgPool;
use sqlx::postgres::PgPoolOptions;
use tower_http::trace::TraceLayer;

pub use config::Config;

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

/// Shared by all requests and jobs of one instance.
#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub hub: realtime::Hub,
}

pub fn app(state: AppState) -> Router {
    routes::router()
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Job kinds of the ported modules.
pub fn job_registry() -> jobs::Registry {
    jobs::Registry::default()
}

pub async fn connect(config: &Config) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(config.database_max_connections)
        .connect(&config.database_url)
        .await?;
    // Concurrent instances wait for each other: sqlx takes an advisory lock
    MIGRATOR.run(&pool).await?;
    Ok(pool)
}
