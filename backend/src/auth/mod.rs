//! Sign-in: passwords with email codes, Google and GitHub,
//! sessions in an HttpOnly cookie or, for the mobile app, as bearer token.

pub mod oauth;
pub mod password;
pub mod password_flows;
pub mod rate_limit;
pub mod session;
pub mod users;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::CookieJar;
use serde::Deserialize;
use serde_json::{Value, json};

pub use session::AuthUser;

use crate::error::{AppError, AppResult};
use crate::{AppState, flags};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/password", post(password_flows::handler))
        .route("/change-password", post(password_flows::change_password))
        .route("/signout", post(sign_out))
        .route("/session", get(current_session))
        .route("/providers", get(providers))
        .route("/oauth/{provider}", get(oauth::start))
        .route("/oauth/{provider}/callback", get(oauth::callback))
        .route("/app-exchange", post(oauth::app_exchange))
        .route("/e2e-code", get(e2e_code))
}

async fn sign_out(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    jar: CookieJar,
) -> AppResult<(CookieJar, StatusCode)> {
    if let Some(current) = current {
        let mut conn = state.db.acquire().await?;
        session::delete(&mut conn, current.session_id).await?;
    }
    Ok((
        jar.add(session::removal_cookie(&state.config)),
        StatusCode::NO_CONTENT,
    ))
}

/// Whether the browser is signed in, and as whom. The app asks on every start: a valid
/// session gets its cookie again, so the browser keeps it as long as the server does.
async fn current_session(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    jar: CookieJar,
) -> (CookieJar, Json<Value>) {
    let token = jar
        .get(session::COOKIE)
        .map(|cookie| cookie.value().to_owned());
    let jar = match (current, token) {
        (Some(_), Some(token)) => jar.add(session::cookie(&state.config, token)),
        _ => jar,
    };
    let user_id = current.map(|current| current.user_id);
    (jar, Json(json!({ "userId": user_id })))
}

/// OAuth providers with credentials on this instance; the login page only offers these.
async fn providers(State(state): State<AppState>) -> Json<Value> {
    Json(json!({
        "google": state.config.google.is_some(),
        "github": state.config.github.is_some(),
    }))
}

#[derive(Deserialize)]
struct E2eCodeQuery {
    email: String,
}

/// E2E tests read the sign-in code here instead of from an inbox; only with the flag
/// is_e2e_auth_skip_email.
async fn e2e_code(
    State(state): State<AppState>,
    Query(query): Query<E2eCodeQuery>,
) -> AppResult<Json<Value>> {
    let mut conn = state.db.acquire().await?;
    if !flags::get(&mut conn, flags::E2E_AUTH_SKIP_EMAIL, false).await? {
        return Err(AppError::forbidden("E2E_AUTH_DISABLED"));
    }
    let code: Option<String> =
        sqlx::query_scalar("SELECT code FROM e2e_auth_tokens WHERE email = $1")
            .bind(&query.email)
            .fetch_optional(&mut *conn)
            .await?;
    let code = code.ok_or_else(|| AppError::not_found("E2E_CODE_NOT_FOUND"))?;
    Ok(Json(json!({ "code": code })))
}
