//! SumUp connected with OAuth, for card payments at the cash desk (#155).
//!
//! SumUp recommends OAuth for new integrations of its reader SDK. The organizer connects
//! their SumUp account once: `sumup.startConnect` gives a link to `/api/sumup/start`, which
//! sends the browser to SumUp; SumUp comes back to `/api/sumup/callback`, and the backend
//! keeps the refresh token. A cash desk of the event's team asks `/api/sumup/token` for an
//! access token and logs the SDK in with it (src/native/sumup.ts). Helpers need no SumUp
//! login of their own, and the money goes to the organizer's account.
//!
//! Without SUMUP_CLIENT_ID and SUMUP_CLIENT_SECRET each device logs the SDK in with
//! SumUp's own login screen, as before.
//!
//! The tokens are stored encrypted with a key derived from the client secret: a database
//! dump alone gives no access to the merchant accounts. A new secret makes the stored
//! tokens unreadable; the organizers then connect again.

use std::time::Duration;

use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use chrono::{DateTime, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

use super::event_roles::{Permission, require_permission, team_permissions};
use super::features;
use crate::AppState;
use crate::auth::AuthUser;
use crate::auth::password_flows::safe_redirect;
use crate::config::OAuthCredentials;
use crate::error::{AppError, AppResult};
use crate::realtime::{self, Topic};
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "sumup.getConnection" => get_connection);
    register!(registry, Mutation "sumup.startConnect" => start_connect);
    register!(registry, Mutation "sumup.disconnect" => disconnect);
}

/// `/api/sumup/…`: the browser's way to SumUp and back, and the desks' access tokens.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/start", get(start))
        .route("/callback", get(callback))
        .route("/token", post(token))
}

/// Binds the flow to the browser that started it
const STATE_COOKIE: &str = "bazarpro_sumup";
const COOKIE_PATH: &str = "/api/sumup";
/// From the link to SumUp's answer: enough to log in at SumUp
const STATE_LIFETIME: Duration = Duration::from_secs(600);
/// Target of a connection made from the mobile app
const APP_TARGET: &str = "app";
/// Deep link back into the mobile app
const APP_CALLBACK: &str = "bazarpro://sumup";
/// A desk gets a token that lasts at least this long, so a payment does not run out
const MIN_TOKEN_LIFE: chrono::Duration = chrono::Duration::minutes(10);
/// Used when SumUp does not say how long its access token lasts
const DEFAULT_TOKEN_LIFE: i64 = 3600;
/// Stored tokens: random nonce, then ciphertext
const NONCE_LEN: usize = 24;

fn credentials(state: &AppState) -> AppResult<&OAuthCredentials> {
    state
        .config
        .sumup
        .as_ref()
        .ok_or_else(|| AppError::not_found("sumup.notConfigured"))
}

fn not_connected() -> AppError {
    AppError::not_found("sumup.notConnected")
}

fn callback_url(state: &AppState) -> String {
    format!("{}/api/sumup/callback", state.config.site_url)
}

fn state_hash(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

// --- encryption of the stored tokens

fn cipher(credentials: &OAuthCredentials) -> XChaCha20Poly1305 {
    let mut mac = Hmac::<Sha256>::new_from_slice(credentials.client_secret.as_bytes())
        .expect("HMAC takes keys of any length");
    mac.update(b"bazarpro sumup tokens v1");
    let key: [u8; 32] = mac.finalize().into_bytes().into();
    XChaCha20Poly1305::new(&key.into())
}

/// The token, encrypted and bound to its user: a row copied to another user is useless.
fn seal(credentials: &OAuthCredentials, user: Uuid, token: &str) -> Vec<u8> {
    let nonce: [u8; NONCE_LEN] = rand::random();
    let ciphertext = cipher(credentials)
        .encrypt(
            &XNonce::from(nonce),
            Payload {
                msg: token.as_bytes(),
                aad: user.as_bytes(),
            },
        )
        .expect("encryption of a short token");
    [nonce.as_slice(), &ciphertext].concat()
}

/// None when it was sealed with another secret or for another user.
fn open(credentials: &OAuthCredentials, user: Uuid, sealed: &[u8]) -> Option<String> {
    if sealed.len() <= NONCE_LEN {
        return None;
    }
    let (nonce, ciphertext) = sealed.split_at(NONCE_LEN);
    let nonce: [u8; NONCE_LEN] = nonce.try_into().ok()?;
    let plain = cipher(credentials)
        .decrypt(
            &XNonce::from(nonce),
            Payload {
                msg: ciphertext,
                aad: user.as_bytes(),
            },
        )
        .ok()?;
    String::from_utf8(plain).ok()
}

// --- queries and mutations

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ConnectionArgs {
    /// The event whose organizer's account the desk uses; without it the own account
    event_id: Option<Id>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionView {
    /// This server connects SumUp with OAuth; without it each device logs in itself
    oauth: bool,
    connected: bool,
    merchant_code: Option<String>,
    /// The account is the signed-in user's, who may connect or disconnect it
    mine: bool,
    #[serde(with = "ms_opt")]
    connected_at: Option<DateTime<Utc>>,
}

/// The SumUp account the desk charges: the event organizer's, or the own one.
async fn get_connection(ctx: &mut Ctx, args: ConnectionArgs) -> AppResult<ConnectionView> {
    let user = ctx.require_user()?;
    let owner = match args.event_id {
        Some(event) => {
            require_permission(ctx, event.0, Permission::Sale).await?;
            event_organizer(ctx.conn(), event.0).await?
        }
        None => user,
    };
    let mine = owner == user;
    if mine {
        ctx.read(Topic::User(user));
    }
    if ctx.state.config.sumup.is_none() {
        return Ok(ConnectionView {
            oauth: false,
            connected: false,
            merchant_code: None,
            mine,
            connected_at: None,
        });
    }
    let row: Option<(Option<String>, DateTime<Utc>)> = sqlx::query_as(
        "SELECT merchant_code, connected_at FROM sumup_connections WHERE user_id = $1",
    )
    .bind(owner)
    .fetch_optional(ctx.conn())
    .await?;
    Ok(ConnectionView {
        oauth: true,
        connected: row.is_some(),
        merchant_code: row.as_ref().and_then(|(code, _)| code.clone()),
        mine,
        connected_at: row.map(|(_, at)| at),
    })
}

async fn event_organizer(conn: &mut PgConnection, event: Uuid) -> AppResult<Uuid> {
    sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(event)
        .fetch_optional(conn)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StartArgs {
    /// From the mobile app: SumUp opens in the system browser, which returns by deep link
    #[serde(default)]
    app: bool,
    /// Web: the page to return to
    redirect_to: Option<String>,
}

#[derive(Serialize)]
struct StartLink {
    url: String,
}

/// A link that connects the signed-in user's SumUp account; valid once, for ten minutes.
async fn start_connect(ctx: &mut Ctx, args: StartArgs) -> AppResult<StartLink> {
    let user = ctx.require_user()?;
    credentials(&ctx.state)?;
    let state = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let target = if args.app {
        APP_TARGET.to_owned()
    } else {
        safe_redirect(args.redirect_to.as_deref().unwrap_or("/"))
    };
    sqlx::query("DELETE FROM sumup_oauth_states WHERE user_id = $1 OR expires_at < now()")
        .bind(user)
        .execute(ctx.conn())
        .await?;
    sqlx::query(
        "INSERT INTO sumup_oauth_states (state_hash, user_id, target, expires_at)
         VALUES ($1, $2, $3, now() + $4)",
    )
    .bind(state_hash(&state))
    .bind(user)
    .bind(&target)
    .bind(STATE_LIFETIME)
    .execute(ctx.conn())
    .await?;
    Ok(StartLink {
        url: format!(
            "{}/api/sumup/start?state={state}",
            ctx.state.config.site_url
        ),
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[derive(Serialize)]
struct Success {
    success: bool,
}

/// Forgets the own SumUp account. The desks fall back to recording card payments by hand;
/// the merchant can also revoke BazarPro's access in SumUp itself.
async fn disconnect(ctx: &mut Ctx, _: NoArgs) -> AppResult<Success> {
    let user = ctx.require_user()?;
    remove_connection(ctx.conn(), user).await?;
    ctx.touch(Topic::User(user));
    Ok(Success { success: true })
}

/// Deletes the connection and tells the desks of the user's events.
async fn remove_connection(conn: &mut PgConnection, user: Uuid) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM sumup_connections WHERE user_id = $1")
        .bind(user)
        .execute(&mut *conn)
        .await?;
    touch_events(conn, user).await
}

/// Helpers read the connection through the event, they cannot follow the organizer's topic.
async fn touch_events(conn: &mut PgConnection, user: Uuid) -> sqlx::Result<()> {
    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM events WHERE organizer_id = $1 AND end_date > now() - interval '1 day'",
    )
    .bind(user)
    .fetch_all(&mut *conn)
    .await?;
    let mut topics: Vec<Topic> = events.into_iter().map(Topic::Event).collect();
    topics.push(Topic::User(user));
    realtime::touch(conn, &topics).await
}

// --- the browser's way to SumUp and back

#[derive(Deserialize)]
pub struct StartQuery {
    state: String,
}

/// Opened from the link of `sumup.startConnect`: remembers the flow in this browser and
/// goes on to SumUp's consent page.
async fn start(
    State(state): State<AppState>,
    Query(query): Query<StartQuery>,
    jar: CookieJar,
) -> AppResult<Response> {
    let credentials = credentials(&state)?;
    let target: Option<String> = sqlx::query_scalar(
        "SELECT target FROM sumup_oauth_states WHERE state_hash = $1 AND expires_at > now()",
    )
    .bind(state_hash(&query.state))
    .fetch_optional(&state.db)
    .await?;
    if target.is_none() {
        return Ok(
            Redirect::to(&format!("{}/?sumup=sumup.expired", state.config.site_url))
                .into_response(),
        );
    }
    let url = format!(
        "{}/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}",
        state.config.sumup_api_url,
        urlencoding::encode(&credentials.client_id),
        urlencoding::encode(&callback_url(&state)),
        urlencoding::encode(&state.config.sumup_scopes),
        urlencoding::encode(&query.state),
    );
    let cookie = Cookie::build((STATE_COOKIE, query.state))
        .path(COOKIE_PATH)
        .http_only(true)
        .secure(state.config.secure_cookies())
        // Lax: the cookie must come along on SumUp's redirect back
        .same_site(SameSite::Lax)
        .max_age(STATE_LIFETIME.try_into().expect("fits"))
        .build();
    Ok((jar.add(cookie), Redirect::to(&url)).into_response())
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

/// SumUp's answer: trades the code for tokens and stores them for the user who started.
async fn callback(
    State(state): State<AppState>,
    Query(query): Query<CallbackQuery>,
    jar: CookieJar,
) -> Response {
    let stored = jar
        .get(STATE_COOKIE)
        .map(|cookie| cookie.value().to_owned());
    let mut removal = Cookie::build((STATE_COOKIE, "")).path(COOKIE_PATH).build();
    removal.make_removal();
    let jar = jar.add(removal);

    // Another browser's answer, or one for a flow this browser did not start
    let Some(flow) = query
        .state
        .filter(|value| stored.as_deref() == Some(value.as_str()))
    else {
        return (jar, finish(&state, "/", Err("sumup.failed"))).into_response();
    };
    let claimed: sqlx::Result<Option<(Uuid, String)>> = sqlx::query_as(
        "DELETE FROM sumup_oauth_states WHERE state_hash = $1 AND expires_at > now()
         RETURNING user_id, target",
    )
    .bind(state_hash(&flow))
    .fetch_optional(&state.db)
    .await;
    let (user, target) = match claimed {
        Ok(Some(row)) => row,
        Ok(None) => return (jar, finish(&state, "/", Err("sumup.expired"))).into_response(),
        Err(err) => {
            tracing::error!(error = ?err, "SumUp callback failed");
            return (jar, finish(&state, "/", Err("sumup.failed"))).into_response();
        }
    };
    let result = match (query.code, query.error) {
        (Some(code), None) => connect(&state, user, &code).await.map_err(|err| {
            tracing::error!(error = ?err, "connecting SumUp failed");
            "sumup.failed"
        }),
        // The merchant declined on SumUp's page
        _ => Err("sumup.cancelled"),
    };
    (jar, finish(&state, &target, result)).into_response()
}

/// Back to where the flow started: the app's deep link or a page of the web app, with
/// `connected` or the error's code.
fn finish(state: &AppState, target: &str, result: Result<(), &str>) -> Response {
    let outcome = match result {
        Ok(()) => "result=connected".to_owned(),
        Err(code) => format!("error={code}"),
    };
    if target == APP_TARGET {
        return Redirect::to(&format!("{APP_CALLBACK}?{outcome}")).into_response();
    }
    let path = safe_redirect(target);
    let separator = if path.contains('?') { '&' } else { '?' };
    Redirect::to(&format!(
        "{}{path}{separator}sumup={}",
        state.config.site_url,
        match result {
            Ok(()) => "connected",
            Err(code) => code,
        }
    ))
    .into_response()
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

/// SumUp refused the grant: the merchant revoked the access, or the refresh token is gone.
#[derive(Debug, thiserror::Error)]
#[error("SumUp refused the grant")]
struct Refused;

async fn request_tokens(
    state: &AppState,
    form: &[(&str, &str)],
) -> anyhow::Result<Result<TokenResponse, Refused>> {
    let response = state
        .http
        .post(format!("{}/token", state.config.sumup_api_url))
        .header("Accept", "application/json")
        .form(form)
        .send()
        .await?;
    // invalid_grant and the like; retrying does not help, the merchant must connect again
    if matches!(
        response.status(),
        StatusCode::BAD_REQUEST | StatusCode::UNAUTHORIZED
    ) {
        return Ok(Err(Refused));
    }
    Ok(Ok(response.error_for_status()?.json().await?))
}

/// The merchant code of the account, so the team sees which account takes the money.
async fn merchant_code(state: &AppState, access_token: &str) -> Option<String> {
    let me: Value = state
        .http
        .get(format!("{}/v0.1/me", state.config.sumup_api_url))
        .bearer_auth(access_token)
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?
        .json()
        .await
        .ok()?;
    me["merchant_profile"]["merchant_code"]
        .as_str()
        .map(str::to_owned)
}

fn expiry(tokens: &TokenResponse) -> DateTime<Utc> {
    Utc::now() + chrono::Duration::seconds(tokens.expires_in.unwrap_or(DEFAULT_TOKEN_LIFE))
}

async fn connect(state: &AppState, user: Uuid, code: &str) -> anyhow::Result<()> {
    let credentials = state
        .config
        .sumup
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("SumUp is not configured"))?;
    let redirect_uri = callback_url(state);
    let tokens = request_tokens(
        state,
        &[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("client_id", &credentials.client_id),
            ("client_secret", &credentials.client_secret),
            ("redirect_uri", &redirect_uri),
        ],
    )
    .await??;
    let refresh_token = tokens
        .refresh_token
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("SumUp sent no refresh token"))?;
    let merchant = merchant_code(state, &tokens.access_token).await;

    let mut tx = state.db.begin().await?;
    sqlx::query(
        "INSERT INTO sumup_connections
           (user_id, merchant_code, refresh_token, access_token, access_expires_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET merchant_code = $2, refresh_token = $3,
           access_token = $4, access_expires_at = $5, connected_at = now()",
    )
    .bind(user)
    .bind(merchant)
    .bind(seal(credentials, user, refresh_token))
    .bind(seal(credentials, user, &tokens.access_token))
    .bind(expiry(&tokens))
    .execute(&mut *tx)
    .await?;
    touch_events(&mut tx, user).await?;
    tx.commit().await?;
    Ok(())
}

// --- access tokens for the desks

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenRequest {
    event_id: Id,
}

/// Merchant code, sealed refresh token, sealed access token and its expiry
type StoredConnection = (
    Option<String>,
    Vec<u8>,
    Option<Vec<u8>>,
    Option<DateTime<Utc>>,
);

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeskToken {
    access_token: String,
    #[serde(with = "ms")]
    expires_at: DateTime<Utc>,
    merchant_code: Option<String>,
}

/// An access token of the event organizer's SumUp account, for a desk with the right to
/// sell at an event that takes cards. Refreshed here under a row lock: SumUp may hand out
/// a new refresh token each time, and two desks refreshing at once would lose one.
async fn token(
    State(state): State<AppState>,
    current: AuthUser,
    Json(request): Json<TokenRequest>,
) -> AppResult<Json<DeskToken>> {
    let credentials = credentials(&state)?;
    let event = request.event_id.0;
    let mut tx = state.db.begin().await?;
    match team_permissions(&mut tx, event, current.user_id).await? {
        None => return Err(AppError::forbidden("auth.forbidden")),
        Some(permissions) if !permissions.contains(&Permission::Sale) => {
            return Err(AppError::forbidden("helper.sale"));
        }
        Some(_) => {}
    }
    let (owner, stored_features): (Uuid, Option<Value>) =
        sqlx::query_as("SELECT organizer_id, features FROM events WHERE id = $1")
            .bind(event)
            .fetch_optional(&mut *tx)
            .await?
            .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if !features::resolve(stored_features.as_ref()).card_payments {
        return Err(AppError::forbidden("sumup.cardPaymentsOff"));
    }

    let row: Option<StoredConnection> = sqlx::query_as(
        "SELECT merchant_code, refresh_token, access_token, access_expires_at
             FROM sumup_connections WHERE user_id = $1 FOR UPDATE",
    )
    .bind(owner)
    .fetch_optional(&mut *tx)
    .await?;
    let Some((merchant_code, sealed_refresh, sealed_access, expires_at)) = row else {
        return Err(not_connected());
    };

    // The last token while it lasts long enough
    if let (Some(sealed), Some(expires_at)) = (sealed_access, expires_at)
        && expires_at > Utc::now() + MIN_TOKEN_LIFE
        && let Some(access_token) = open(credentials, owner, &sealed)
    {
        tx.commit().await?;
        return Ok(Json(DeskToken {
            access_token,
            expires_at,
            merchant_code,
        }));
    }

    let Some(refresh_token) = open(credentials, owner, &sealed_refresh) else {
        // Sealed with an earlier secret: only a new connection helps
        remove_connection(&mut tx, owner).await?;
        tx.commit().await?;
        return Err(not_connected());
    };
    let tokens = match request_tokens(
        &state,
        &[
            ("grant_type", "refresh_token"),
            ("refresh_token", &refresh_token),
            ("client_id", &credentials.client_id),
            ("client_secret", &credentials.client_secret),
        ],
    )
    .await
    {
        Ok(Ok(tokens)) => tokens,
        Ok(Err(Refused)) => {
            remove_connection(&mut tx, owner).await?;
            tx.commit().await?;
            return Err(not_connected());
        }
        Err(err) => {
            tracing::error!(error = ?err, "refreshing the SumUp token failed");
            return Err(AppError::coded(
                StatusCode::BAD_GATEWAY,
                "sumup.unreachable",
                &[],
            ));
        }
    };
    let expires_at = expiry(&tokens);
    // SumUp may send a new refresh token; without one the old one stays valid
    let sealed_refresh = match &tokens.refresh_token {
        Some(token) => seal(credentials, owner, token),
        None => sealed_refresh,
    };
    sqlx::query(
        "UPDATE sumup_connections
         SET refresh_token = $2, access_token = $3, access_expires_at = $4 WHERE user_id = $1",
    )
    .bind(owner)
    .bind(sealed_refresh)
    .bind(seal(credentials, owner, &tokens.access_token))
    .bind(expires_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(DeskToken {
        access_token: tokens.access_token,
        expires_at,
        merchant_code,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn credentials(secret: &str) -> OAuthCredentials {
        OAuthCredentials {
            client_id: "id".to_owned(),
            client_secret: secret.to_owned(),
        }
    }

    #[test]
    fn tokens_open_only_with_the_same_secret_and_user() {
        let user = Uuid::new_v4();
        let sealed = seal(&credentials("a"), user, "rt_123");
        assert_eq!(
            open(&credentials("a"), user, &sealed).as_deref(),
            Some("rt_123")
        );
        assert_eq!(open(&credentials("b"), user, &sealed), None);
        assert_eq!(open(&credentials("a"), Uuid::new_v4(), &sealed), None);
        assert_eq!(open(&credentials("a"), user, &sealed[..10]), None);
    }
}
