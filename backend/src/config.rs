use std::net::SocketAddr;
use std::time::Duration;

use anyhow::Context;
use base64::Engine;

/// Where the Capacitor app runs: iOS and Android
const DEFAULT_APP_ORIGINS: &str = "capacitor://localhost,https://localhost";

/// Settings from the environment; see backend/README.md.
#[derive(Clone, Debug)]
pub struct Config {
    pub database_url: String,
    pub listen_addr: SocketAddr,
    /// Max. connections per instance; several instances share the Postgres limit.
    pub database_max_connections: u32,
    /// Set to false on instances that should only serve HTTP.
    pub run_workers: bool,
    /// Address of the app, e.g. https://bazarpro.de; the API is served below /api.
    pub site_url: String,
    /// Origins of the mobile app (Capacitor), allowed to call the API with a bearer token
    pub app_origins: Vec<String>,
    pub mode: InstanceMode,
    /// Self-hosting: this account becomes administrator once its address is verified.
    pub admin_email: Option<String>,
    pub smtp: Option<SmtpConfig>,
    /// From header, e.g. `BazarPro <noreply@bazarpro.de>`
    pub email_from: String,
    pub google: Option<OAuthCredentials>,
    pub github: Option<OAuthCredentials>,
    pub storage: StorageConfig,
}

/// Where uploaded files are kept.
#[derive(Clone, Debug)]
pub enum StorageConfig {
    /// A directory (Docker volume); enough for one server
    Local { dir: String },
    /// S3-compatible bucket, needed when several instances run
    S3 {
        bucket: String,
        /// Self-hosted store, e.g. http://garage:3900; unset means AWS
        endpoint: Option<String>,
        region: String,
        access_key_id: String,
        secret_access_key: String,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InstanceMode {
    /// bazarpro.de with many organizers and the marketing pages
    Platform,
    /// A self-hosted instance of one association that runs its own bazaars
    Single,
}

#[derive(Clone, Debug)]
pub struct SmtpConfig {
    pub host: String,
    pub port: u16,
    /// Implicit TLS (port 465)
    pub secure: bool,
    /// Upgrade with STARTTLS when the server offers it
    pub starttls: bool,
    pub user: Option<String>,
    pub pass: Option<String>,
    pub ehlo_host: Option<String>,
    pub timeout: Duration,
}

#[derive(Clone, Debug)]
pub struct OAuthCredentials {
    pub client_id: String,
    pub client_secret: String,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        let smtp = match env("AUTH_SMTP_HOST") {
            Some(host) => Some(SmtpConfig {
                host,
                port: env_or("AUTH_SMTP_PORT", "587")
                    .parse()
                    .context("AUTH_SMTP_PORT is not a port")?,
                secure: env_bool("AUTH_SMTP_SECURE", false),
                starttls: env_bool("AUTH_SMTP_STARTTLS", true),
                user: env("AUTH_SMTP_USER"),
                pass: env("AUTH_SMTP_PASS"),
                ehlo_host: env("AUTH_SMTP_EHLO_HOST"),
                timeout: Duration::from_millis(
                    env_or("AUTH_SMTP_TIMEOUT_MS", "30000")
                        .parse()
                        .context("AUTH_SMTP_TIMEOUT_MS is not a number")?,
                ),
            }),
            None => None,
        };
        Ok(Self {
            database_url: env("DATABASE_URL").context("DATABASE_URL is not set")?,
            listen_addr: env_or("LISTEN_ADDR", "0.0.0.0:3000")
                .parse()
                .context("LISTEN_ADDR is not an address")?,
            database_max_connections: env_or("DATABASE_MAX_CONNECTIONS", "10")
                .parse()
                .context("DATABASE_MAX_CONNECTIONS is not a number")?,
            run_workers: env_or("RUN_WORKERS", "true") != "false",
            site_url: env_or("SITE_URL", "http://localhost:5173")
                .trim_end_matches('/')
                .to_owned(),
            app_origins: env_or("APP_ORIGINS", DEFAULT_APP_ORIGINS)
                .split(',')
                .map(|origin| origin.trim().to_owned())
                .filter(|origin| !origin.is_empty())
                .collect(),
            mode: match env("BAZARPRO_MODE").as_deref() {
                Some("single") => InstanceMode::Single,
                _ => InstanceMode::Platform,
            },
            admin_email: env("ADMIN_EMAIL"),
            smtp,
            email_from: decode_email_from(env("AUTH_EMAIL_FROM")),
            google: oauth("AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"),
            github: oauth("AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"),
            storage: match env("S3_BUCKET") {
                Some(bucket) => StorageConfig::S3 {
                    bucket,
                    endpoint: env("S3_ENDPOINT"),
                    region: env_or("S3_REGION", "garage"),
                    access_key_id: env("S3_ACCESS_KEY_ID")
                        .context("S3_ACCESS_KEY_ID is not set")?,
                    secret_access_key: env("S3_SECRET_ACCESS_KEY")
                        .context("S3_SECRET_ACCESS_KEY is not set")?,
                },
                None => StorageConfig::Local {
                    dir: env_or("STORAGE_DIR", "/data/files"),
                },
            },
        })
    }

    /// Settings for tests: no SMTP, no OAuth, platform mode.
    pub fn for_tests(database_url: &str) -> Self {
        Self {
            database_url: database_url.to_owned(),
            listen_addr: "127.0.0.1:0".parse().unwrap(),
            database_max_connections: 5,
            run_workers: false,
            site_url: "https://bazarpro.test".to_owned(),
            app_origins: DEFAULT_APP_ORIGINS.split(',').map(str::to_owned).collect(),
            mode: InstanceMode::Platform,
            admin_email: None,
            smtp: None,
            email_from: "BazarPro <noreply@bazarpro.test>".to_owned(),
            google: None,
            github: None,
            storage: StorageConfig::Local {
                dir: "unused-in-tests".to_owned(),
            },
        }
    }

    /// Cookies get `Secure` unless the app runs on plain http (local development).
    pub fn secure_cookies(&self) -> bool {
        self.site_url.starts_with("https://")
    }
}

fn env(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn env_or(key: &str, default: &str) -> String {
    env(key).unwrap_or_else(|| default.to_owned())
}

fn env_bool(key: &str, default: bool) -> bool {
    env(key).map_or(default, |value| value.eq_ignore_ascii_case("true"))
}

fn oauth(id: &str, secret: &str) -> Option<OAuthCredentials> {
    Some(OAuthCredentials {
        client_id: env(id)?,
        client_secret: env(secret)?,
    })
}

/// AUTH_EMAIL_FROM may be base64-encoded, because `<` and `>` were hard to pass through
/// some deployment tools.
fn decode_email_from(raw: Option<String>) -> String {
    let Some(raw) = raw else {
        return "BazarPro <noreply@localhost>".to_owned();
    };
    if raw.contains('<') && raw.contains('@') {
        return raw;
    }
    base64::engine::general_purpose::STANDARD
        .decode(&raw)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .map(|decoded| decoded.trim().to_owned())
        .filter(|decoded| decoded.contains('<') && decoded.contains('@'))
        .unwrap_or(raw)
}
