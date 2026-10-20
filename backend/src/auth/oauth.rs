//! Sign-in with Google and GitHub (Auth.js providers in convex/auth.ts).
//!
//! `/api/auth/oauth/{provider}?redirectTo=/x` sends the browser to the provider; it comes
//! back to `/callback`, which links the account to a user, sets the session cookie and
//! redirects into the app. Errors go to `/login?error=<code>`.

use axum::extract::{Path, Query, State};
use axum::response::{IntoResponse, Redirect, Response};
use axum_extra::extract::CookieJar;
use axum_extra::extract::cookie::{Cookie, SameSite};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::password_flows::safe_redirect;
use super::session;
use super::users::{Profile, SignInKind, create_or_update_user, ensure_active};
use crate::AppState;
use crate::config::OAuthCredentials;
use crate::error::{AppError, AppResult};

/// Holds state, PKCE verifier and target between start and callback.
const STATE_COOKIE: &str = "bazarpro_oauth";
const STATE_COOKIE_PATH: &str = "/api/auth/oauth";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Provider {
    Google,
    GitHub,
}

impl Provider {
    fn parse(name: &str) -> Option<Self> {
        match name {
            "google" => Some(Self::Google),
            "github" => Some(Self::GitHub),
            _ => None,
        }
    }

    /// Stored in auth_accounts.provider, as Convex Auth did
    pub fn id(self) -> &'static str {
        match self {
            Self::Google => "google",
            Self::GitHub => "github",
        }
    }

    fn credentials(self, state: &AppState) -> Option<&OAuthCredentials> {
        match self {
            Self::Google => state.config.google.as_ref(),
            Self::GitHub => state.config.github.as_ref(),
        }
    }

    fn authorize_url(self) -> &'static str {
        match self {
            Self::Google => "https://accounts.google.com/o/oauth2/v2/auth",
            Self::GitHub => "https://github.com/login/oauth/authorize",
        }
    }

    fn token_url(self) -> &'static str {
        match self {
            Self::Google => "https://oauth2.googleapis.com/token",
            Self::GitHub => "https://github.com/login/oauth/access_token",
        }
    }

    fn scope(self) -> &'static str {
        match self {
            Self::Google => "openid email profile",
            Self::GitHub => "read:user user:email",
        }
    }
}

fn callback_url(state: &AppState, provider: Provider) -> String {
    format!(
        "{}/api/auth/oauth/{}/callback",
        state.config.site_url,
        provider.id()
    )
}

fn login_error(state: &AppState, code: &str) -> Response {
    Redirect::to(&format!("{}/login?error={code}", state.config.site_url)).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartQuery {
    redirect_to: Option<String>,
}

pub async fn start(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<StartQuery>,
    jar: CookieJar,
) -> AppResult<(CookieJar, Redirect)> {
    let provider =
        Provider::parse(&provider).ok_or_else(|| AppError::not_found("notFound.page"))?;
    let credentials = provider
        .credentials(&state)
        .ok_or_else(|| AppError::not_found("notFound.page"))?;
    let csrf = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 24]>());
    let verifier = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    let target = safe_redirect(query.redirect_to.as_deref().unwrap_or("/"));

    let mut url = format!(
        "{}?response_type=code&client_id={}&redirect_uri={}&scope={}&state={}",
        provider.authorize_url(),
        urlencoding::encode(&credentials.client_id),
        urlencoding::encode(&callback_url(&state, provider)),
        urlencoding::encode(provider.scope()),
        csrf,
    );
    if provider == Provider::Google {
        url.push_str(&format!(
            "&code_challenge={challenge}&code_challenge_method=S256"
        ));
    }
    let cookie = Cookie::build((
        STATE_COOKIE,
        format!("{csrf}.{verifier}.{}", urlencoding::encode(&target)),
    ))
    .path(STATE_COOKIE_PATH)
    .http_only(true)
    .secure(state.config.secure_cookies())
    // Lax: the cookie must come along on the provider's redirect back
    .same_site(SameSite::Lax)
    .max_age(
        std::time::Duration::from_secs(600)
            .try_into()
            .expect("fits"),
    )
    .build();
    Ok((jar.add(cookie), Redirect::to(&url)))
}

#[derive(Deserialize)]
pub struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

pub async fn callback(
    State(state): State<AppState>,
    Path(provider): Path<String>,
    Query(query): Query<CallbackQuery>,
    jar: CookieJar,
) -> Response {
    let Some(provider) = Provider::parse(&provider) else {
        return login_error(&state, "OAUTH_FAILED");
    };
    let stored = jar
        .get(STATE_COOKIE)
        .map(|cookie| cookie.value().to_owned());
    let mut removal = Cookie::build((STATE_COOKIE, ""))
        .path(STATE_COOKIE_PATH)
        .build();
    removal.make_removal();
    let jar = jar.add(removal);

    let parts: Option<(String, String, String)> = stored.as_deref().and_then(|value| {
        let mut parts = value.splitn(3, '.');
        Some((
            parts.next()?.to_owned(),
            parts.next()?.to_owned(),
            urlencoding::decode(parts.next()?).ok()?.into_owned(),
        ))
    });
    let (Some((csrf, verifier, target)), Some(code), None) = (parts, query.code, query.error)
    else {
        return (jar, login_error(&state, "OAUTH_FAILED")).into_response();
    };
    if query.state.as_deref() != Some(csrf.as_str()) {
        return (jar, login_error(&state, "OAUTH_FAILED")).into_response();
    }

    let result = async {
        let identity = fetch_identity(&state, provider, &code, &verifier).await?;
        sign_in(&state, provider, &identity).await
    }
    .await;
    match result {
        Ok(token) => (
            jar.add(session::cookie(&state.config, token)),
            Redirect::to(&format!(
                "{}{}",
                state.config.site_url,
                safe_redirect(&target)
            )),
        )
            .into_response(),
        Err(err) => {
            let code = err.code().unwrap_or("OAUTH_FAILED");
            if err.code().is_none() {
                tracing::error!(error = ?err, provider = provider.id(), "OAuth sign-in failed");
            }
            (jar, login_error(&state, code)).into_response()
        }
    }
}

/// The user as the provider knows them.
#[derive(Clone, Debug)]
pub struct Identity {
    /// Google `sub`, GitHub user id: auth_accounts.provider_account_id
    pub account_id: String,
    pub profile: Profile,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

async fn fetch_identity(
    state: &AppState,
    provider: Provider,
    code: &str,
    verifier: &str,
) -> anyhow::Result<Identity> {
    let credentials = provider
        .credentials(state)
        .ok_or_else(|| anyhow::anyhow!("provider not configured"))?;
    let redirect_uri = callback_url(state, provider);
    let mut form = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("client_id", credentials.client_id.as_str()),
        ("client_secret", credentials.client_secret.as_str()),
        ("redirect_uri", redirect_uri.as_str()),
    ];
    if provider == Provider::Google {
        form.push(("code_verifier", verifier));
    }
    let token: TokenResponse = state
        .http
        .post(provider.token_url())
        .header("Accept", "application/json")
        .form(&form)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    let bearer = format!("Bearer {}", token.access_token);

    match provider {
        Provider::Google => {
            #[derive(Deserialize)]
            struct UserInfo {
                sub: String,
                email: Option<String>,
                email_verified: Option<bool>,
                name: Option<String>,
                picture: Option<String>,
            }
            let info: UserInfo = state
                .http
                .get("https://openidconnect.googleapis.com/v1/userinfo")
                .header("Authorization", &bearer)
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            Ok(Identity {
                account_id: info.sub,
                profile: Profile {
                    email: info.email,
                    name: info.name,
                    image: info.picture,
                    locale: None,
                    email_verified: info.email_verified.unwrap_or(false),
                },
            })
        }
        Provider::GitHub => {
            #[derive(Deserialize)]
            struct User {
                id: u64,
                name: Option<String>,
                login: String,
                avatar_url: Option<String>,
            }
            #[derive(Deserialize)]
            struct Email {
                email: String,
                primary: bool,
                verified: bool,
            }
            let get = |url: &'static str| {
                state
                    .http
                    .get(url)
                    .header("Authorization", &bearer)
                    .header("Accept", "application/vnd.github+json")
                    .header("User-Agent", "BazarPro")
            };
            let user: User = get("https://api.github.com/user")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let emails: Vec<Email> = get("https://api.github.com/user/emails")
                .send()
                .await?
                .error_for_status()?
                .json()
                .await?;
            let primary = emails.into_iter().find(|email| email.primary);
            Ok(Identity {
                account_id: user.id.to_string(),
                profile: Profile {
                    email_verified: primary.as_ref().is_some_and(|email| email.verified),
                    email: primary.map(|email| email.email),
                    name: user.name.or(Some(user.login)),
                    image: user.avatar_url,
                    locale: None,
                },
            })
        }
    }
}

/// Finds or creates user and account for the identity; returns the session token.
pub async fn sign_in(
    state: &AppState,
    provider: Provider,
    identity: &Identity,
) -> AppResult<String> {
    let mut tx = state.db.begin().await?;
    let linked: Option<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_account_id = $2",
    )
    .bind(provider.id())
    .bind(&identity.account_id)
    .fetch_optional(&mut *tx)
    .await?;

    let user_id = match linked {
        Some(user_id) => {
            // Only the flag and status checks: the address at the provider may have
            // changed to one of another user here
            create_or_update_user(
                &mut tx,
                &state.config,
                Some(user_id),
                SignInKind::OAuth,
                &Profile::default(),
            )
            .await?;
            user_id
        }
        None => {
            // Linking by email would let anyone with an unverified address at the provider
            // take over the account of that address here
            let profile = if identity.profile.email_verified {
                identity.profile.clone()
            } else {
                return Err(AppError::forbidden("EMAIL_NOT_VERIFIED"));
            };
            let user_id =
                create_or_update_user(&mut tx, &state.config, None, SignInKind::OAuth, &profile)
                    .await?;
            sqlx::query(
                "INSERT INTO auth_accounts (user_id, provider, provider_account_id, email_verified)
                 VALUES ($1, $2, $3, $4)",
            )
            .bind(user_id)
            .bind(provider.id())
            .bind(&identity.account_id)
            .bind(&profile.email)
            .execute(&mut *tx)
            .await?;
            user_id
        }
    };
    ensure_active(&mut tx, user_id).await?;
    let token = session::create(&mut tx, user_id).await?;
    tx.commit().await?;
    Ok(token)
}
