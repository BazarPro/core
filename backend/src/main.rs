use bazarpro_backend::{
    AppState, Config, app, connect, import, job_registry, jobs, mail, rpc, storage,
};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // On stderr: `run` and `seed` print their result on stdout
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
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
        // Makes an existing account administrator: admin <email>
        [_, "admin", email] => {
            let value = rpc::call(
                &state,
                None,
                "users.makeAdmin",
                serde_json::json!({ "email": email }),
            )
            .await
            .map_err(|err| anyhow::anyhow!("{err}"))?;
            println!("{}", value.as_str().unwrap_or_default());
            return Ok(());
        }
        // Demo data: seed [--force] [--locale en] [--no-images]
        [_, "seed", flags @ ..] => {
            let locale = match flags.iter().position(|flag| *flag == "--locale") {
                Some(i) => flags
                    .get(i + 1)
                    .and_then(|value| bazarpro_backend::i18n::Locale::parse(value))
                    .ok_or_else(|| anyhow::anyhow!("--locale needs de or en"))?,
                None => bazarpro_backend::i18n::Locale::De,
            };
            let options = bazarpro_backend::demo::Options {
                force: flags.contains(&"--force"),
                locale,
                images: !flags.contains(&"--no-images"),
            };
            println!("{}", bazarpro_backend::demo::run(&state, options).await?);
            return Ok(());
        }
        // Runs a function, also internal ones: run categories.seedCategories '{}'
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
    // ADMIN_EMAIL becomes administrator once the account exists
    if state.config.admin_email.is_some()
        && let Err(err) = rpc::call(
            &state,
            None,
            "users.promoteConfiguredAdmin",
            serde_json::json!({}),
        )
        .await
    {
        tracing::warn!(error = %err, "ADMIN_EMAIL not promoted");
    }
    if let Err(err) = rpc::call(
        &state,
        None,
        "categories.seedIfEmpty",
        serde_json::json!({}),
    )
    .await
    {
        tracing::warn!(error = %err, "default categories not created");
    }
    let hub = state.hub.clone();

    tokio::spawn(async move {
        if let Err(err) = hub.listen(db).await {
            // Without live updates the instance would serve stale pages; let it restart
            tracing::error!(error = ?err, "live updates stopped");
            std::process::exit(1);
        }
    });

    let (stop, stopping) = tokio::sync::watch::channel(false);
    let worker = run_workers.then(|| {
        let registry = job_registry();
        supervise(
            "cron jobs",
            tokio::spawn(jobs::run_crons(state.db.clone(), registry.clone())),
            stopping.clone(),
        );
        supervise(
            "job worker",
            tokio::spawn(jobs::run_worker(state.clone(), registry, stopping.clone())),
            stopping,
        )
    });

    let listener = tokio::net::TcpListener::bind(listen_addr).await?;
    tracing::info!(addr = %listen_addr, "listening");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    // Let the running job finish, within Docker's grace period of 10 seconds
    let _ = stop.send(true);
    if let Some(worker) = worker
        && tokio::time::timeout(WORKER_SHUTDOWN, worker).await.is_err()
    {
        tracing::warn!("running job not finished, its lock expires later");
    }
    tracing::info!("stopped");
    Ok(())
}

const WORKER_SHUTDOWN: std::time::Duration = std::time::Duration::from_secs(7);

/// The background tasks run forever. If one ends anyway (a panic outside a job handler),
/// the instance would serve requests without sending mails or running crons; exit so
/// Docker restarts it (#270).
fn supervise(
    name: &'static str,
    task: tokio::task::JoinHandle<()>,
    stopping: tokio::sync::watch::Receiver<bool>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let result = task.await;
        if result.is_ok() && *stopping.borrow() {
            return;
        }
        tracing::error!(task = name, error = ?result.err(), "background task stopped");
        std::process::exit(1);
    })
}

/// Ctrl-C, or SIGTERM from `docker stop` and deployments. As PID 1 in the container the
/// process ignores SIGTERM without a handler and is killed after the grace period (#269).
async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(err) => {
                tracing::warn!(error = %err, "no SIGTERM handler");
                std::future::pending::<()>().await;
            }
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }
    tracing::info!("shutting down");
}
