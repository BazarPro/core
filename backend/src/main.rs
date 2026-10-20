use bazarpro_backend::{
    AppState, Config, app, connect, import, job_registry, jobs, mail, rpc, storage,
};
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
    let mailer = mail::Mailer::from_config(&config)?;
    let run_workers = config.run_workers;
    let listen_addr = config.listen_addr;
    let store = storage::open(&config)?;
    let state = AppState::new(db.clone(), config, mailer, store);

    let args: Vec<String> = std::env::args().collect();
    match args
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>()
        .as_slice()
    {
        // Fills an empty database from a Convex export
        [_, "import", path] => {
            let report = import::run(&state, path).await?;
            println!("{report}");
            return Ok(());
        }
        // Runs a function like `npx convex run`, also internal ones: run categories.seedCategories '{}'
        [_, "run", name, rest @ ..] => {
            let args: serde_json::Value =
                serde_json::from_str(rest.first().copied().unwrap_or("{}"))?;
            let value = rpc::call(&state, None, name, args)
                .await
                .map_err(|err| anyhow::anyhow!("{err}"))?;
            println!("{}", serde_json::to_string_pretty(&value)?);
            return Ok(());
        }
        _ => {}
    }
    let hub = state.hub.clone();

    tokio::spawn(async move {
        if let Err(err) = hub.listen(db).await {
            // Without live updates the instance would serve stale pages; let it restart
            tracing::error!(error = ?err, "live updates stopped");
            std::process::exit(1);
        }
    });

    if run_workers {
        let registry = job_registry();
        tokio::spawn(jobs::run_crons(state.db.clone(), registry.clone()));
        tokio::spawn(jobs::run_worker(state.clone(), registry));
    }

    let listener = tokio::net::TcpListener::bind(listen_addr).await?;
    tracing::info!(addr = %listen_addr, "listening");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;
    Ok(())
}
