//! Sign-in with password, `signIn('password', { flow, … })` of the login pages: sign-up,
//! sign-in, email confirmation and password reset as one endpoint.

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
use crate::realtime::{self, Topic};

pub const PROVIDER: &str = "password";
/// Codes for sign-up confirmation and password reset
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
    /// Brings a deleted account back; the address is confirmed again at the next sign-in.
    #[serde(rename = "reactivate")]
    Reactivate { email: String, password: String },
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
    Reactivated,
    SignedIn { token: String },
}

pub async fn handler(
    State(state): State<AppState>,
    jar: CookieJar,
    Json(request): Json<PasswordRequest>,
) -> AppResult<(CookieJar, Json<SignInResult>)> {
    let outcome = run(&state, request).await?;
    Ok(match outcome {
        Outcome::CodeSent | Outcome::Reactivated => (jar, Json(SignInResult { signing_in: false })),
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

/// Whether another code mail may go to the address, so nobody can flood an inbox: 10 per
/// hour, counted for unknown addresses too, so the limit does not reveal which exist.
/// On the pool, before the transaction of the flow.
async fn may_send_code(state: &AppState, email: &str) -> AppResult<bool> {
    let identifier = format!("codeMail:{email}");
    if rate_limit::is_limited(&state.db, &identifier).await? {
        tracing::info!("code mail limit reached");
        return Ok(false);
    }
    rate_limit::record_failure(&state.db, &identifier).await?;
    Ok(true)
}

/// Checks and uses up the code; confirms the address of account and user.
async fn verify_code(
    state: &AppState,
    conn: &mut PgConnection,
    email: &str,
    code: &str,
) -> AppResult<Account> {
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
        return Err(invalid_code());
    }
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

impl PasswordRequest {
    /// The address whose failed attempts count, for flows that check a secret.
    fn rate_limited_email(&self) -> Option<String> {
        match self {
            Self::SignIn { email, .. }
            | Self::EmailVerification {
                email,
                code: Some(_),
                ..
            }
            | Self::ResetVerification { email, .. }
            | Self::Reactivate { email, .. } => Some(email.trim().to_owned()),
            _ => None,
        }
    }
}

/// Runs a flow with the rate limit around it. The limit is read before and written after
/// the flow's transaction, so a request never holds two connections: with as many
/// parallel sign-ins as pool connections, all would wait for a second one.
pub async fn run(state: &AppState, request: PasswordRequest) -> AppResult<Outcome> {
    let limited = request.rate_limited_email();
    if let Some(email) = &limited
        && rate_limit::is_limited(&state.db, email).await?
    {
        return Err(AppError::too_many_requests("TOO_MANY_FAILED_ATTEMPTS"));
    }
    let result = run_flow(state, request).await;
    if let Some(email) = &limited {
        match &result {
            Ok(_) => rate_limit::reset(&state.db, email).await?,
            Err(err) if matches!(err.code(), Some("INVALID_CREDENTIALS" | "INVALID_CODE")) => {
                rate_limit::record_failure(&state.db, email).await?;
            }
            Err(_) => {}
        }
    }
    result
}

async fn run_flow(state: &AppState, request: PasswordRequest) -> AppResult<Outcome> {
    // Password hashing takes a moment of CPU: it happens before the transaction, so a
    // connection of the pool is only held for the database work
    let (outcome, tx) = match request {
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
            let secret = password::hash(password).await?;
            let mut tx = state.db.begin().await?;
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
            // Never linked to the signed-in user: the address is not confirmed yet, and
            // confirming it later would make whoever signed up here its owner
            let user_id = create_or_update_user(
                &mut tx,
                &state.config,
                None,
                SignInKind::Credentials,
                &profile,
            )
            .await?;
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
            (Outcome::CodeSent, tx)
        }

        PasswordRequest::SignIn {
            email,
            password,
            redirect_to,
        } => {
            let email = email.trim().to_owned();
            let account = {
                let mut conn = state.db.acquire().await?;
                // Before the password check, so the refusal costs no attempts
                ensure_login_enabled(&mut conn).await?;
                find_account(&mut conn, &email).await?
            };
            let Some(account) = account else {
                return Err(invalid_credentials());
            };
            let Some(secret) = account.secret.clone() else {
                return Err(invalid_credentials());
            };
            let verified = password::verify(password.clone(), secret).await?;
            if !verified.matches {
                return Err(invalid_credentials());
            }
            let rehashed = match verified.needs_rehash {
                true => Some(password::hash(password).await?),
                false => None,
            };
            let mut tx = state.db.begin().await?;
            ensure_active(&mut tx, account.user_id).await?;
            if let Some(secret) = rehashed {
                sqlx::query("UPDATE auth_accounts SET secret = $2 WHERE id = $1")
                    .bind(account.id)
                    .bind(secret)
                    .execute(&mut *tx)
                    .await?;
            }
            let outcome = if account.email_verified {
                Outcome::SignedIn {
                    token: session::create(&mut tx, account.user_id).await?,
                }
            } else {
                send_code(&mut tx, account.id, &email, false, redirect_to).await?;
                Outcome::CodeSent
            };
            (outcome, tx)
        }

        PasswordRequest::EmailVerification {
            email,
            code,
            redirect_to,
        } => {
            let email = email.trim().to_owned();
            let may_send = code.is_none() && may_send_code(state, &email).await?;
            let mut tx = state.db.begin().await?;
            let outcome = match code {
                Some(code) => {
                    let account = verify_code(state, &mut tx, &email, &code).await?;
                    ensure_active(&mut tx, account.user_id).await?;
                    Outcome::SignedIn {
                        token: session::create(&mut tx, account.user_id).await?,
                    }
                }
                // Unknown addresses and the mail limit answer like a sent code, as in reset
                None => {
                    if may_send && let Some(account) = find_account(&mut tx, &email).await? {
                        ensure_active(&mut tx, account.user_id).await?;
                        send_code(&mut tx, account.id, &email, false, redirect_to).await?;
                    }
                    Outcome::CodeSent
                }
            };
            (outcome, tx)
        }

        PasswordRequest::Reset { email, redirect_to } => {
            let email = email.trim().to_owned();
            let may_send = may_send_code(state, &email).await?;
            let mut tx = state.db.begin().await?;
            // The reset ends in a sign-in; no code that could not be used
            ensure_login_enabled(&mut tx).await?;
            // No password account (unknown or OAuth-only) or the mail limit reached: answer
            // like a sent code, so the form does not reveal which addresses exist
            if may_send && let Some(account) = find_account(&mut tx, &email).await? {
                ensure_active(&mut tx, account.user_id).await?;
                send_code(&mut tx, account.id, &email, true, redirect_to).await?;
            }
            (Outcome::CodeSent, tx)
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
            let secret = password::hash(new_password).await?;
            let mut tx = state.db.begin().await?;
            let account = verify_code(state, &mut tx, &email, &code).await?;
            ensure_active(&mut tx, account.user_id).await?;
            sqlx::query("UPDATE auth_accounts SET secret = $2 WHERE id = $1")
                .bind(account.id)
                .bind(secret)
                .execute(&mut *tx)
                .await?;
            // Whoever knew the old password is signed out
            session::delete_all_of_user(&mut tx, account.user_id).await?;
            let token = session::create(&mut tx, account.user_id).await?;
            (Outcome::SignedIn { token }, tx)
        }

        PasswordRequest::Reactivate { email, password } => {
            let email = email.trim().to_owned();
            let account = {
                let mut conn = state.db.acquire().await?;
                find_account(&mut conn, &email).await?
            };
            let Some(Account {
                user_id,
                secret: Some(secret),
                ..
            }) = account
            else {
                return Err(invalid_credentials());
            };
            if !password::verify(password, secret).await?.matches {
                return Err(invalid_credentials());
            }
            let mut tx = state.db.begin().await?;
            // Banned accounts stay banned
            let reactivated = sqlx::query(
                "UPDATE users SET status = 'active' WHERE id = $1 AND status = 'deleted'",
            )
            .bind(user_id)
            .execute(&mut *tx)
            .await?;
            if reactivated.rows_affected() == 0 {
                return Err(AppError::bad_request("account.cannotReactivate"));
            }
            realtime::touch(&mut tx, &[Topic::User(user_id)]).await?;
            (Outcome::Reactivated, tx)
        }
    };
    tx.commit().await?;
    Ok(outcome)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangePassword {
    old_password: String,
    new_password: String,
}

/// The signed-in user changes their password. Like the sign-in, the hashing runs outside
/// any transaction and wrong old passwords count against the limit of the address.
pub async fn change_password(
    State(state): State<AppState>,
    current: AuthUser,
    Json(args): Json<ChangePassword>,
) -> AppResult<StatusCode> {
    let account: Option<(Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT id, provider_account_id, secret FROM auth_accounts
         WHERE user_id = $1 AND provider = $2",
    )
    .bind(current.user_id)
    .bind(PROVIDER)
    .fetch_optional(&state.db)
    .await?;
    let Some((account, email, secret)) = account else {
        return Err(AppError::not_found("PASSWORD_ACCOUNT_NOT_FOUND"));
    };
    let Some(secret) = secret else {
        return Err(AppError::bad_request("PASSWORD_ACCOUNT_INCOMPLETE"));
    };
    if rate_limit::is_limited(&state.db, &email).await? {
        return Err(AppError::too_many_requests("TOO_MANY_FAILED_ATTEMPTS"));
    }
    if !password::verify(args.old_password, secret).await?.matches {
        rate_limit::record_failure(&state.db, &email).await?;
        return Err(AppError::bad_request("account.wrongPassword"));
    }
    if !password::is_valid(&args.new_password) {
        return Err(invalid_password());
    }
    let secret = password::hash(args.new_password).await?;
    sqlx::query("UPDATE auth_accounts SET secret = $2 WHERE id = $1")
        .bind(account)
        .bind(secret)
        .execute(&state.db)
        .await?;
    rate_limit::reset(&state.db, &email).await?;
    Ok(StatusCode::NO_CONTENT)
}
