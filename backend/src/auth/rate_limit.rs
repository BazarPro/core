//! Failed attempts per identifier, against guessing passwords and codes: sign-ins per
//! email, event access codes per user (`accessCode:<user id>`). 10 failures, refilled
//! by 10 per hour.
//!
//! Runs on the pool, not in the transaction of the request: the failure must stay
//! recorded although the request itself fails and rolls back.

use sqlx::PgPool;

const MAX_ATTEMPTS: f64 = 10.0;
const REFILL_PER_SECOND: f64 = MAX_ATTEMPTS / 3600.0;

pub async fn is_limited(db: &PgPool, identifier: &str) -> sqlx::Result<bool> {
    let left: Option<f64> = sqlx::query_scalar(
        "SELECT least($2, attempts_left + extract(epoch FROM now() - last_attempt_at) * $3)
         FROM auth_rate_limits WHERE identifier = $1",
    )
    .bind(identifier)
    .bind(MAX_ATTEMPTS)
    .bind(REFILL_PER_SECOND)
    .fetch_optional(db)
    .await?;
    Ok(left.is_some_and(|left| left < 1.0))
}

pub async fn record_failure(db: &PgPool, identifier: &str) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO auth_rate_limits (identifier, attempts_left, last_attempt_at)
         VALUES ($1, $2 - 1, now())
         ON CONFLICT (identifier) DO UPDATE SET
           attempts_left = least($2, auth_rate_limits.attempts_left
             + extract(epoch FROM now() - auth_rate_limits.last_attempt_at) * $3) - 1,
           last_attempt_at = now()",
    )
    .bind(identifier)
    .bind(MAX_ATTEMPTS)
    .bind(REFILL_PER_SECOND)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn reset(db: &PgPool, identifier: &str) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM auth_rate_limits WHERE identifier = $1")
        .bind(identifier)
        .execute(db)
        .await?;
    Ok(())
}
