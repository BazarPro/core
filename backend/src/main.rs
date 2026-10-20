use bazarpro_backend::{AppState, Config, app, connect, job_registry, jobs, realtime};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    let config = Config::from_env()?;
    let db = connect(&config).await?;
    let hub = realtime::Hub::new();
    let state = AppState {
        db: db.clone(),
        hub: hub.clone(),
    };

    tokio::spawn(async move {
        if let Err(err) = hub.listen(db).await {
            // Without live updates the instance would serve stale pages; let it restart
            tracing::error!(error = ?err, "live updates stopped");
            std::process::exit(1);
        }
    });

    if config.run_workers {
        let registry = job_registry();
        tokio::spawn(jobs::run_crons(state.db.clone(), registry.clone()));
        tokio::spawn(jobs::run_worker(state.clone(), registry));
    }

    let listener = tokio::net::TcpListener::bind(config.listen_addr).await?;
    tracing::info!(addr = %config.listen_addr, "listening");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
