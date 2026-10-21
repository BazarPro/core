//! Login sessions in an HttpOnly cookie.
//! The database stores only the SHA-256 of the token, so a database dump cannot be used
//! to sign in.

use std::time::Duration;

use axum::extract::{FromRequestParts, OptionalFromRequestParts};
use axum::http::request::Parts;
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::AppState;
use crate::config::Config;
use crate::error::AppError;

pub const COOKIE: &str = "bazarpro_session";
/// A session ends after 30 days without use
pub const LIFETIME: Duration = Duration::from_secs(30 * 24 * 3600);
/// last_seen_at is written at most this often, not on every request
const TOUCH_AFTER: Duration = Duration::from_secs(3600);

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

/// Creates a session and returns the token for the cookie.
pub async fn create(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<String> {
    let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    sqlx::query(
        "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + $3)",
    )
    .bind(user_id)
    .bind(token_hash(&token))
    .bind(LIFETIME)
    .execute(&mut *conn)
    .await?;
    sqlx::query("UPDATE users SET last_login_at = now() WHERE id = $1")
        .bind(user_id)
        .execute(conn)
        .await?;
    Ok(token)
}

pub async fn delete(conn: &mut PgConnection, session_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sessions WHERE id = $1")
        .bind(session_id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Signs the user out everywhere else, e.g. after a password reset.
pub async fn delete_all_of_user(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(user_id)
        .execute(conn)
        .await?;
    Ok(())
}

/// Signs the user out on every other device, e.g. after changing the password.
pub async fn delete_others_of_user(
    conn: &mut PgConnection,
    user_id: Uuid,
    keep: Uuid,
) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND id <> $2")
        .bind(user_id)
        .bind(keep)
        .execute(conn)
        .await?;
    Ok(())
}

pub fn cookie(config: &Config, token: String) -> Cookie<'static> {
    Cookie::build((COOKIE, token))
        .path("/")
        .http_only(true)
        .secure(config.secure_cookies())
        .same_site(SameSite::Lax)
        .max_age(LIFETIME.try_into().expect("fits"))
        .build()
}

pub fn removal_cookie(config: &Config) -> Cookie<'static> {
    let mut cookie = cookie(config, String::new());
    cookie.make_removal();
    cookie
}

/// The signed-in user of a request. As extractor it rejects anonymous requests with
/// `auth.required`; use `Option<AuthUser>` where signing in is optional.
#[derive(Clone, Copy, Debug)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub session_id: Uuid,
}

impl AuthUser {
    pub async fn from_token(conn: &mut PgConnection, token: &str) -> sqlx::Result<Option<Self>> {
        let row: Option<(Uuid, Uuid, bool)> = sqlx::query_as(
            "SELECT id, user_id, last_seen_at < now() - $2
             FROM sessions WHERE token_hash = $1 AND expires_at > now()",
        )
        .bind(token_hash(token))
        .bind(TOUCH_AFTER)
        .fetch_optional(&mut *conn)
        .await?;
        let Some((session_id, user_id, stale)) = row else {
            return Ok(None);
        };
        if stale {
            sqlx::query(
                "UPDATE sessions SET last_seen_at = now(), expires_at = now() + $2 WHERE id = $1",
            )
            .bind(session_id)
            .bind(LIFETIME)
            .execute(conn)
            .await?;
        }
        Ok(Some(Self {
            user_id,
            session_id,
        }))
    }
}

impl OptionalFromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Option<Self>, AppError> {
        let jar = CookieJar::from_headers(&parts.headers);
        let Some(cookie) = jar.get(COOKIE) else {
            return Ok(None);
        };
        let mut conn = state.db.acquire().await?;
        Ok(Self::from_token(&mut conn, cookie.value()).await?)
    }
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, AppError> {
        <Self as OptionalFromRequestParts<AppState>>::from_request_parts(parts, state)
            .await?
            .ok_or_else(|| AppError::unauthorized("auth.required"))
    }
}
