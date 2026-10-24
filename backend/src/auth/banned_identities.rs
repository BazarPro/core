//! Addresses of banned users whose account was anonymized (#168). Only an HMAC of the
//! address is kept, so the table names nobody; sign-up checks against it, so a ban cannot
//! be dodged by deleting the account and registering again.

use chrono::{DateTime, Utc};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;
use sqlx::PgConnection;

use crate::config::Config;

/// How long an anonymized banned address stays blocked
pub const BAN_DAYS: i32 = 2 * 365;

const KEY_NAME: &str = "identity_hmac_key";

/// IDENTITY_HMAC_KEY, or a random key the instance created once and keeps in the database.
/// The configured key is better: a database dump alone then cannot test addresses.
async fn key(conn: &mut PgConnection, config: &Config) -> sqlx::Result<Vec<u8>> {
    if let Some(key) = &config.identity_hmac_key {
        return Ok(key.as_bytes().to_vec());
    }
    let stored: Option<Vec<u8>> =
        sqlx::query_scalar("SELECT value FROM instance_secrets WHERE name = $1")
            .bind(KEY_NAME)
            .fetch_optional(&mut *conn)
            .await?;
    if let Some(key) = stored {
        return Ok(key);
    }
    // A parallel first use may win; then its key is the one
    sqlx::query(
        "INSERT INTO instance_secrets (name, value) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
    )
    .bind(KEY_NAME)
    .bind(rand::random::<[u8; 32]>().to_vec())
    .execute(&mut *conn)
    .await?;
    sqlx::query_scalar("SELECT value FROM instance_secrets WHERE name = $1")
        .bind(KEY_NAME)
        .fetch_one(conn)
        .await
}

async fn email_hmac(
    conn: &mut PgConnection,
    config: &Config,
    email: &str,
) -> sqlx::Result<Vec<u8>> {
    let key = key(conn, config).await?;
    let mut mac = Hmac::<Sha256>::new_from_slice(&key).expect("HMAC takes keys of any length");
    mac.update(email.trim().to_lowercase().as_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

/// Blocks the address until `until`; an existing longer block stays.
pub async fn ban(
    conn: &mut PgConnection,
    config: &Config,
    email: &str,
    until: DateTime<Utc>,
) -> sqlx::Result<()> {
    let hmac = email_hmac(conn, config, email).await?;
    sqlx::query(
        "INSERT INTO banned_identities (email_hmac, expires_at) VALUES ($1, $2)
         ON CONFLICT (email_hmac) DO UPDATE SET
           banned_at = now(), expires_at = GREATEST(banned_identities.expires_at, EXCLUDED.expires_at)",
    )
    .bind(hmac)
    .bind(until)
    .execute(conn)
    .await?;
    Ok(())
}

pub async fn is_banned(
    conn: &mut PgConnection,
    config: &Config,
    email: &str,
) -> sqlx::Result<bool> {
    let hmac = email_hmac(conn, config, email).await?;
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM banned_identities WHERE email_hmac = $1 AND expires_at > now())",
    )
    .bind(hmac)
    .fetch_one(conn)
    .await
}
