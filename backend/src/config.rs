use std::net::SocketAddr;

use anyhow::Context;

/// Settings from the environment; see ENV.md.
#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: SocketAddr,
    /// Max. connections per instance; several instances share the Postgres limit.
    pub database_max_connections: u32,
    /// Set to false on instances that should only serve HTTP.
    pub run_workers: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            database_url: std::env::var("DATABASE_URL").context("DATABASE_URL is not set")?,
            listen_addr: env_or("LISTEN_ADDR", "0.0.0.0:3000")
                .parse()
                .context("LISTEN_ADDR is not an address")?,
            database_max_connections: env_or("DATABASE_MAX_CONNECTIONS", "10")
                .parse()
                .context("DATABASE_MAX_CONNECTIONS is not a number")?,
            run_workers: env_or("RUN_WORKERS", "true") != "false",
        })
    }
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_owned())
}
