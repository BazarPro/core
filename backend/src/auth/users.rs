//! Linking sign-ins to users (createOrUpdateUser and promoteConfiguredAdmin of
//! convex/authUsers.ts).

use axum::http::StatusCode;
use chrono::Utc;
use sqlx::PgConnection;
use uuid::Uuid;

use crate::config::Config;
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::{flags, jobs};

/// Job of the seed module: example products for new accounts.
pub const STARTER_PRODUCTS_JOB: &str = "seed.createStarterProducts";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SignInKind {
    /// Sign-up or sign-in with a password
    Credentials,
    /// The user entered the code from the email
    Verification,
    OAuth,
}

#[derive(Clone, Debug, Default)]
pub struct Profile {
    pub email: Option<String>,
    pub name: Option<String>,
    pub image: Option<String>,
    pub locale: Option<Locale>,
    /// The provider confirmed the address (OAuth)
    pub email_verified: bool,
}

/// Rejects banned and deleted accounts with the codes the login pages know.
pub async fn ensure_active(conn: &mut PgConnection, user_id: Uuid) -> AppResult<()> {
    let status: Option<String> = sqlx::query_scalar("SELECT status::text FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_optional(conn)
        .await?
        .flatten();
    match status.as_deref() {
        Some("deleted") => Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "ACCOUNT_DELETED",
            &[],
        )),
        Some("banned") => Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "ACCOUNT_BANNED",
            &[],
        )),
        _ => Ok(()),
    }
}

/// Self-hosting: the account with ADMIN_EMAIL becomes administrator once its address is
/// verified. Without verification anybody could register that address first.
pub async fn promote_configured_admin(
    conn: &mut PgConnection,
    config: &Config,
    user_id: Uuid,
    email: &str,
) -> sqlx::Result<()> {
    let Some(admin_email) = &config.admin_email else {
        return Ok(());
    };
    if !email.trim().eq_ignore_ascii_case(admin_email.trim()) {
        return Ok(());
    }
    sqlx::query("UPDATE users SET system_role = 'admin' WHERE id = $1 AND system_role IS DISTINCT FROM 'admin'")
        .bind(user_id)
        .execute(conn)
        .await?;
    Ok(())
}

async fn find_by_email(conn: &mut PgConnection, email: &str) -> sqlx::Result<Option<Uuid>> {
    sqlx::query_scalar("SELECT id FROM users WHERE email = $1 ORDER BY created_at LIMIT 1")
        .bind(email)
        .fetch_optional(conn)
        .await
}

async fn mark_email_verified(conn: &mut PgConnection, user_id: Uuid) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE users SET is_mail_confirmed = true, email_verified_at = now() WHERE id = $1",
    )
    .bind(user_id)
    .execute(conn)
    .await?;
    Ok(())
}

/// Finds or creates the user of a sign-in: links by email, blocks banned/deleted
/// accounts and respects the login and registration flags.
pub async fn create_or_update_user(
    conn: &mut PgConnection,
    config: &Config,
    existing_user_id: Option<Uuid>,
    kind: SignInKind,
    profile: &Profile,
) -> AppResult<Uuid> {
    if !flags::get(conn, flags::LOGIN_ENABLED, true).await? {
        return Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "LOGIN_DISABLED",
            &[],
        ));
    }
    if let Some(user_id) = existing_user_id {
        ensure_active(conn, user_id).await?;
    }
    let verified = kind == SignInKind::Verification || profile.email_verified;

    let existing = match &profile.email {
        Some(email) => find_by_email(conn, email).await?,
        None => None,
    }
    .or(existing_user_id);
    if let Some(user_id) = existing {
        ensure_active(conn, user_id).await?;
        if verified {
            mark_email_verified(conn, user_id).await?;
            if let Some(email) = &profile.email {
                promote_configured_admin(conn, config, user_id, email).await?;
            }
        }
        return Ok(user_id);
    }

    if !flags::get(conn, flags::REGISTRATION_ENABLED, true).await? {
        return Err(AppError::coded(
            StatusCode::FORBIDDEN,
            "REGISTRATION_DISABLED",
            &[],
        ));
    }
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, email, image, locale, status, system_role, is_mail_confirmed,
                            email_verified_at, needs_onboarding)
         VALUES ($1, $2, $3, $4, 'active', 'user', $5, CASE WHEN $5 THEN now() END, true)
         RETURNING id",
    )
    .bind(&profile.name)
    .bind(&profile.email)
    .bind(&profile.image)
    .bind(profile.locale)
    .bind(verified)
    .fetch_one(&mut *conn)
    .await?;
    if verified && let Some(email) = &profile.email {
        promote_configured_admin(conn, config, user_id, email).await?;
    }
    if flags::get(conn, flags::CREATE_PRODUCTS_ON_SIGNUP, true).await? {
        jobs::enqueue(
            conn,
            STARTER_PRODUCTS_JOB,
            &serde_json::json!({ "userId": user_id }),
            Utc::now(),
        )
        .await?;
    }
    Ok(user_id)
}
