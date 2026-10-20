//! `signIn('password', { flow, … })` of convex/CustomPassword.ts, as one endpoint with the
//! same parameters, so the login pages only swap the call.

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use axum_extra::extract::CookieJar;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

use super::session::{self, AuthUser};
use super::users::{
    Profile, SignInKind, create_or_update_user, ensure_active, ensure_login_enabled,
};
use super::{password, rate_limit};
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::mail::{self, VerificationMail};

pub const PROVIDER: &str = "password";
/// Codes for sign-up confirmation and password reset (SmtpOTP in Convex)
const OTP_PROVIDER: &str = "smtp-otp";
const OTP_VALID_MINUTES: i32 = 15;

#[derive(Debug, Deserialize)]
#[serde(tag = "flow", rename_all_fields = "camelCase")]
pub enum PasswordRequest {
    #[serde(rename = "signUp")]
    SignUp {
        email: String,
        password: String,
        name: Option<String>,
        /// The verification email goes out in the language of the app
        locale: Option<String>,
        redirect_to: Option<String>,
    },
    #[serde(rename = "signIn")]
    SignIn {
        email: String,
        password: String,
        redirect_to: Option<String>,
    },
    /// With `code`: confirms the address. Without: sends a new code.
    #[serde(rename = "email-verification")]
    EmailVerification {
        email: String,
        code: Option<String>,
        redirect_to: Option<String>,
    },
    #[serde(rename = "reset")]
    Reset {
        email: String,
        redirect_to: Option<String>,
    },
    #[serde(rename = "reset-verification")]
    ResetVerification {
        email: String,
        code: String,
        new_password: String,
    },
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SignInResult {
    /// false: a code was sent and has to be entered first
    pub signing_in: bool,
}

/// What a flow did; the handler turns a session into the cookie.
pub enum Outcome {
    CodeSent,
    SignedIn { token: String },
}

pub async fn handler(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    jar: CookieJar,
    Json(request): Json<PasswordRequest>,
) -> AppResult<(CookieJar, Json<SignInResult>)> {
    let outcome = run(&state, current, request).await?;
    Ok(match outcome {
        Outcome::CodeSent => (jar, Json(SignInResult { signing_in: false })),
        Outcome::SignedIn { token } => (
            jar.add(session::cookie(&state.config, token)),
            Json(SignInResult { signing_in: true }),
        ),
    })
}

fn invalid_credentials() -> AppError {
    AppError::coded(StatusCode::UNAUTHORIZED, "INVALID_CREDENTIALS", &[])
}

fn invalid_code() -> AppError {
    AppError::coded(StatusCode::BAD_REQUEST, "INVALID_CODE", &[])
}

fn invalid_password() -> AppError {
    AppError::coded(StatusCode::BAD_REQUEST, "INVALID_PASSWORD", &[])
}

struct Account {
    id: Uuid,
    user_id: Uuid,
    secret: Option<String>,
    email_verified: bool,
}

async fn find_account(conn: &mut PgConnection, email: &str) -> sqlx::Result<Option<Account>> {
    let row: Option<(Uuid, Uuid, Option<String>, bool)> = sqlx::query_as(
        "SELECT id, user_id, secret, email_verified IS NOT NULL FROM auth_accounts
         WHERE provider = $1 AND provider_account_id = $2",
    )
    .bind(PROVIDER)
    .bind(email)
    .fetch_optional(conn)
    .await?;
    Ok(row.map(|(id, user_id, secret, email_verified)| Account {
        id,
        user_id,
        secret,
        email_verified,
    }))
}

fn code_hash(code: &str) -> Vec<u8> {
    Sha256::digest(code.trim().as_bytes()).to_vec()
}

/// Replaces the account's code with a new one and sends it.
async fn send_code(
    conn: &mut PgConnection,
    account_id: Uuid,
    email: &str,
    reset: bool,
    redirect_to: Option<String>,
) -> anyhow::Result<()> {
    let code = rand::random_range(100_000..1_000_000).to_string();
    sqlx::query(
        "INSERT INTO verification_codes (account_id, provider, code_hash, expires_at)
         VALUES ($1, $2, $3, now() + make_interval(mins => $4))
         ON CONFLICT (account_id) DO UPDATE SET
           code_hash = EXCLUDED.code_hash, created_at = now(), expires_at = EXCLUDED.expires_at",
    )
    .bind(account_id)
    .bind(OTP_PROVIDER)
    .bind(code_hash(&code))
    .bind(OTP_VALID_MINUTES)
    .execute(&mut *conn)
    .await?;
    mail::queue_verification(
        conn,
        VerificationMail {
            to: email.to_owned(),
            code,
            reset,
            redirect_to: redirect_to.map(|path| safe_redirect(&path)),
        },
    )
    .await
}

/// Checks and uses up the code; confirms the address of account and user.
async fn verify_code(
    state: &AppState,
    conn: &mut PgConnection,
    email: &str,
    code: &str,
) -> AppResult<Account> {
    if rate_limit::is_limited(&state.db, email).await? {
        return Err(AppError::too_many_requests("TOO_MANY_FAILED_ATTEMPTS"));
    }
    let account = find_account(conn, email).await?.ok_or_else(invalid_code)?;
    let used = sqlx::query(
        "DELETE FROM verification_codes
         WHERE account_id = $1 AND code_hash = $2 AND expires_at > now()",
    )
    .bind(account.id)
    .bind(code_hash(code))
    .execute(&mut *conn)
    .await?;
    if used.rows_affected() == 0 {
        rate_limit::record_failure(&state.db, email).await?;
        return Err(invalid_code());
    }
    rate_limit::reset(&state.db, email).await?;
    sqlx::query("UPDATE auth_accounts SET email_verified = $2 WHERE id = $1")
        .bind(account.id)
        .bind(email)
        .execute(&mut *conn)
        .await?;
    let profile = Profile {
        email: Some(email.to_owned()),
        ..Profile::default()
    };
    create_or_update_user(
        conn,
        &state.config,
        Some(account.user_id),
        SignInKind::Verification,
        &profile,
    )
    .await?;
    Ok(Account {
        email_verified: true,
        ..account
    })
}

/// Only paths inside the app, so links in emails cannot lead elsewhere.
pub fn safe_redirect(path: &str) -> String {
    if path.starts_with('/') && !path.starts_with("//") && !path.contains('\\') {
        path.to_owned()
    } else {
        "/".to_owned()
    }
}

pub async fn run(
    state: &AppState,
    current: Option<AuthUser>,
    request: PasswordRequest,
) -> AppResult<Outcome> {
    let mut tx = state.db.begin().await?;
    let outcome = match request {
        PasswordRequest::SignUp {
            email,
            password,
            name,
            locale,
            redirect_to,
        } => {
            let email = email.trim().to_owned();
            if !password::is_valid(&password) {
                return Err(invalid_password());
            }
            if find_account(&mut tx, &email).await?.is_some() {
                return Err(AppError::coded(
                    StatusCode::CONFLICT,
                    "ACCOUNT_ALREADY_EXISTS",
                    &[],
                ));
            }
            let profile = Profile {
                email: Some(email.clone()),
                name,
                locale: locale.as_deref().and_then(Locale::parse),
                ..Profile::default()
            };
            let user_id = create_or_update_user(
                &mut tx,
                &state.config,
                current.map(|current| current.user_id),
                SignInKind::Credentials,
                &profile,
            )
            .await?;
            let secret = password::hash(password).await?;
            let account_id: Uuid = sqlx::query_scalar(
                "INSERT INTO auth_accounts (user_id, provider, provider_account_id, secret)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (provider, provider_account_id) DO NOTHING
                 RETURNING id",
            )
            .bind(user_id)
            .bind(PROVIDER)
            .bind(&email)
            .bind(secret)
            .fetch_optional(&mut *tx)
            .await?
            // A parallel sign-up with the same address won
            .ok_or_else(|| AppError::coded(StatusCode::CONFLICT, "ACCOUNT_ALREADY_EXISTS", &[]))?;
            send_code(&mut tx, account_id, &email, false, redirect_to).await?;
            Outcome::CodeSent
        }

        PasswordRequest::SignIn {
            email,
            password,
            redirect_to,
        } => {
            let email = email.trim().to_owned();
            // Before the password check, so the refusal costs no attempts
            ensure_login_enabled(&mut tx).await?;
            if rate_limit::is_limited(&state.db, &email).await? {
                return Err(AppError::too_many_requests("TOO_MANY_FAILED_ATTEMPTS"));
            }
            let Some(account) = find_account(&mut tx, &email).await? else {
                rate_limit::record_failure(&state.db, &email).await?;
                return Err(invalid_credentials());
            };
            let Some(secret) = account.secret.clone() else {
                return Err(invalid_credentials());
            };
            let verified = password::verify(password.clone(), secret).await?;
            if !verified.matches {
                rate_limit::record_failure(&state.db, &email).await?;
                return Err(invalid_credentials());
            }
            rate_limit::reset(&state.db, &email).await?;
            ensure_active(&mut tx, account.user_id).await?;
            if verified.needs_rehash {
                sqlx::query("UPDATE auth_accounts SET secret = $2 WHERE id = $1")
                    .bind(account.id)
                    .bind(password::hash(password).await?)
                    .execute(&mut *tx)
                    .await?;
            }
            if account.email_verified {
                Outcome::SignedIn {
                    token: session::create(&mut tx, account.user_id).await?,
                }
            } else {
                send_code(&mut tx, account.id, &email, false, redirect_to).await?;
                Outcome::CodeSent
            }
        }

        PasswordRequest::EmailVerification {
            email,
            code,
            redirect_to,
        } => {
            let email = email.trim().to_owned();
            match code {
                Some(code) => {
                    let account = verify_code(state, &mut tx, &email, &code).await?;
                    ensure_active(&mut tx, account.user_id).await?;
                    Outcome::SignedIn {
                        token: session::create(&mut tx, account.user_id).await?,
                    }
                }
                None => {
                    let account = find_account(&mut tx, &email)
                        .await?
                        .ok_or_else(invalid_code)?;
                    ensure_active(&mut tx, account.user_id).await?;
                    send_code(&mut tx, account.id, &email, false, redirect_to).await?;
                    Outcome::CodeSent
                }
            }
        }

        PasswordRequest::Reset { email, redirect_to } => {
            let email = email.trim().to_owned();
            // The reset ends in a sign-in; no code that could not be used
            ensure_login_enabled(&mut tx).await?;
            // No password account (unknown or OAuth-only): answer like a sent code, so the
            // form does not reveal which addresses exist
            if let Some(account) = find_account(&mut tx, &email).await? {
                ensure_active(&mut tx, account.user_id).await?;
                send_code(&mut tx, account.id, &email, true, redirect_to).await?;
            }
            Outcome::CodeSent
        }

        PasswordRequest::ResetVerification {
            email,
            code,
            new_password,
        } => {
            let email = email.trim().to_owned();
            if !password::is_valid(&new_password) {
                return Err(invalid_password());
            }
            let account = verify_code(state, &mut tx, &email, &code).await?;
            ensure_active(&mut tx, account.user_id).await?;
            sqlx::query("UPDATE auth_accounts SET secret = $2 WHERE id = $1")
                .bind(account.id)
                .bind(password::hash(new_password).await?)
                .execute(&mut *tx)
                .await?;
            // Whoever knew the old password is signed out
            session::delete_all_of_user(&mut tx, account.user_id).await?;
            Outcome::SignedIn {
                token: session::create(&mut tx, account.user_id).await?,
            }
        }
    };
    tx.commit().await?;
    Ok(outcome)
}
