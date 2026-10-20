pub mod auth;
pub mod config;
pub mod error;
pub mod flags;
pub mod i18n;
pub mod jobs;
pub mod mail;
pub mod realtime;
mod routes;
pub mod storage;

use std::sync::Arc;

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
    pub config: Arc<Config>,
    pub mailer: mail::Mailer,
    pub storage: storage::Store,
    /// For OAuth providers
    pub http: reqwest::Client,
}

impl AppState {
    pub fn new(db: PgPool, config: Config, mailer: mail::Mailer, storage: storage::Store) -> Self {
        Self {
            db,
            hub: realtime::Hub::new(),
            config: Arc::new(config),
            mailer,
            storage,
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(15))
                .build()
                .expect("HTTP client"),
        }
    }
}

pub fn app(state: AppState) -> Router {
    routes::router()
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// Job kinds of the ported modules.
pub fn job_registry() -> jobs::Registry {
    jobs::Registry::default()
        .register(mail::VERIFICATION_JOB, mail::send_verification)
        .register(storage::CLEANUP_JOB, storage::cleanup_orphaned_uploads)
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
