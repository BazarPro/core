//! The installation: platform or self-hosted association, its settings, the start page
//! and who may organize.

use std::sync::LazyLock;

use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::access::{is_platform_admin, require_admin};
use crate::config::{Config, InstanceMode};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};
use crate::storage;

pub const SETTINGS: Topic = Topic::Table("site_settings");
const MAX_NAME_LENGTH: usize = 80;

/// Address check shared by backend and frontend
pub static EMAIL_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$").unwrap());
static DOMAIN_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^([a-z0-9-]+\.)+[a-z]{2,}$").unwrap());
static HTTPS_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^https://[^\s/]+(/[^\s]*)?$").unwrap());

pub fn register(registry: &mut Registry) {
    register!(registry, Query "instance.getConfig" => get_config);
    register!(registry, Mutation "instance.updateSettings" => update_settings);
    register!(registry, Query "instance.getCurrentEvent" => get_current_event);
    register!(registry, Query "instance.getMyAccess" => get_my_access);
}

#[derive(Debug, Default, sqlx::FromRow)]
pub struct SiteSettings {
    pub name: Option<String>,
    pub contact_email: Option<String>,
    pub logo_id: Option<Uuid>,
    pub plausible_enabled: Option<bool>,
    pub plausible_domain: Option<String>,
    pub plausible_api_host: Option<String>,
    pub start_page: Option<String>,
}

pub async fn site_settings(ctx: &mut Ctx) -> sqlx::Result<Option<SiteSettings>> {
    ctx.read(SETTINGS);
    sqlx::query_as(
        "SELECT name, contact_email, logo_id, plausible_enabled, plausible_domain,
                plausible_api_host, start_page::text AS start_page
         FROM site_settings",
    )
    .fetch_optional(ctx.conn())
    .await
}

/// The name in emails and pages: the association's in single mode, else BazarPro.
pub fn brand_name(config: &Config, settings: Option<&SiteSettings>) -> String {
    match config.mode {
        InstanceMode::Single => settings
            .and_then(|settings| settings.name.clone())
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "Basar".to_owned()),
        InstanceMode::Platform => "BazarPro".to_owned(),
    }
}

fn mode_name(mode: InstanceMode) -> &'static str {
    match mode {
        InstanceMode::Platform => "platform",
        InstanceMode::Single => "single",
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Plausible {
    enabled: Option<bool>,
    domain: Option<String>,
    api_host: Option<String>,
}

/// What the mobile app needs from the API: bearer token, CORS, OAuth via deep link.
/// Raised on breaking changes; the app refuses servers below its minimum.
pub const APP_API: u32 = 1;

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InstanceConfig {
    mode: &'static str,
    app_api: u32,
    brand: String,
    name: Option<String>,
    contact_email: Option<String>,
    /// null without logo
    #[serde(serialize_with = "serialize_nullable")]
    logo_url: Option<String>,
    start_page: String,
    plausible: Plausible,
}

fn serialize_nullable<S: serde::Serializer>(
    value: &Option<String>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    value.serialize(serializer)
}

/// Public: what every page needs to know about this instance (mode, name, logo).
async fn get_config(ctx: &mut Ctx, _: NoArgs) -> AppResult<InstanceConfig> {
    let settings = site_settings(ctx).await?;
    let config = ctx.state.config.clone();
    let brand = brand_name(&config, settings.as_ref());
    let settings = settings.unwrap_or_default();
    Ok(InstanceConfig {
        mode: mode_name(config.mode),
        app_api: APP_API,
        brand,
        name: settings.name,
        contact_email: settings.contact_email,
        logo_url: settings.logo_id.map(|id| storage::url(&config, id)),
        start_page: settings.start_page.unwrap_or_else(|| "overview".to_owned()),
        plausible: Plausible {
            enabled: settings.plausible_enabled,
            domain: settings.plausible_domain,
            api_host: settings.plausible_api_host,
        },
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PlausibleArgs {
    enabled: bool,
    domain: String,
    api_host: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateSettingsArgs {
    name: Option<String>,
    contact_email: Option<String>,
    /// null removes the logo, absent keeps it
    #[serde(default, with = "serde_with::rust::double_option")]
    logo: Option<Option<Id>>,
    /// Absent keeps the stored start page
    start_page: Option<StartPage>,
    /// Absent keeps the stored analytics settings
    plausible: Option<PlausibleArgs>,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum StartPage {
    Overview,
    CurrentEvent,
}

impl StartPage {
    fn as_str(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::CurrentEvent => "currentEvent",
        }
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

/// Admins: name, contact address, logo, start page and analytics of the instance.
async fn update_settings(ctx: &mut Ctx, args: UpdateSettingsArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let name = non_empty(args.name);
    if name
        .as_ref()
        .is_some_and(|name| name.chars().count() > MAX_NAME_LENGTH)
    {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "profile.nameTooLong",
            &[("max", &MAX_NAME_LENGTH.to_string())],
        ));
    }
    let contact_email = non_empty(args.contact_email);
    if contact_email
        .as_ref()
        .is_some_and(|email| !EMAIL_PATTERN.is_match(email))
    {
        return Err(AppError::bad_request("common.invalidEmail"));
    }
    let plausible = args.plausible.map(|plausible| {
        (
            plausible.enabled,
            non_empty(Some(plausible.domain.to_lowercase())),
            non_empty(Some(
                plausible.api_host.trim().trim_end_matches('/').to_owned(),
            )),
        )
    });
    if let Some((_, Some(domain), _)) = &plausible
        && (domain.len() > 253 || !DOMAIN_PATTERN.is_match(domain))
    {
        return Err(AppError::bad_request("settings.domainFormat"));
    }
    if let Some((_, _, Some(api_host))) = &plausible
        && !HTTPS_PATTERN.is_match(api_host)
    {
        return Err(AppError::bad_request("settings.plausibleHttps"));
    }

    let existing = site_settings(ctx).await?;
    let old_logo = existing.as_ref().and_then(|settings| settings.logo_id);
    let logo = match args.logo {
        None => old_logo,
        Some(logo) => logo.map(|id| id.0),
    };
    if let Some(logo) = logo
        && Some(logo) != old_logo
    {
        storage::ensure_exists(ctx.conn(), logo).await?;
    }
    if let Some(old) = old_logo
        && Some(old) != logo
    {
        storage::delete_later(ctx.conn(), old).await?;
    }
    let existing = existing.unwrap_or_default();
    let (plausible_enabled, plausible_domain, plausible_api_host) = match plausible {
        Some((enabled, domain, api_host)) => (Some(enabled), domain, api_host),
        None => (
            existing.plausible_enabled,
            existing.plausible_domain,
            existing.plausible_api_host,
        ),
    };
    let start_page = args
        .start_page
        .map(|page| page.as_str().to_owned())
        .or(existing.start_page);
    sqlx::query(
        "INSERT INTO site_settings (name, contact_email, logo_id, plausible_enabled, plausible_domain,
           plausible_api_host, start_page, updated_at, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::start_page, now(), $8)
         ON CONFLICT (singleton) DO UPDATE SET
           name = EXCLUDED.name, contact_email = EXCLUDED.contact_email, logo_id = EXCLUDED.logo_id,
           plausible_enabled = EXCLUDED.plausible_enabled, plausible_domain = EXCLUDED.plausible_domain,
           plausible_api_host = EXCLUDED.plausible_api_host, start_page = EXCLUDED.start_page,
           updated_at = now(), updated_by = EXCLUDED.updated_by",
    )
    .bind(name)
    .bind(contact_email)
    .bind(logo)
    .bind(plausible_enabled)
    .bind(plausible_domain)
    .bind(plausible_api_host)
    .bind(start_page)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    ctx.touch(SETTINGS);
    Ok(())
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct CurrentEvent {
    #[serde(rename = "_id")]
    id: Uuid,
    title: String,
    #[serde(with = "ms")]
    start_date: DateTime<Utc>,
}

/// The bazaar the start page of a self-hosted instance leads to: the running one, else
/// the next upcoming. Hidden events are skipped; null if there is none.
async fn get_current_event(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<CurrentEvent>> {
    ctx.read(Topic::Events);
    Ok(sqlx::query_as(
        "SELECT id, title, start_date FROM events
         WHERE hidden_at IS NULL AND end_date >= now()
         ORDER BY (start_date <= now()) DESC,
                  CASE WHEN start_date <= now() THEN end_date ELSE start_date END
         LIMIT 1",
    )
    .fetch_optional(ctx.conn())
    .await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Access {
    can_organize: bool,
    can_create_events: bool,
}

/// Whether the organizer area is offered: on the platform to anybody signed in; in a
/// self-hosted instance to admins and the event teams (who may not create events).
async fn get_my_access(ctx: &mut Ctx, _: NoArgs) -> AppResult<Access> {
    let Some(user) = ctx.user else {
        return Ok(Access {
            can_organize: false,
            can_create_events: false,
        });
    };
    ctx.read(Topic::User(user));
    if ctx.state.config.mode == InstanceMode::Platform
        || is_platform_admin(ctx.conn(), Some(user)).await?
    {
        return Ok(Access {
            can_organize: true,
            can_create_events: true,
        });
    }
    let in_team: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles WHERE user_id = $1 AND role IN ('organizer', 'coorganizer'))",
    )
    .bind(user)
    .fetch_one(ctx.conn())
    .await?;
    Ok(Access {
        can_organize: in_team,
        can_create_events: false,
    })
}
