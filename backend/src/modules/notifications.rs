//! Emails to users and the red markers in the menu.

use std::collections::BTreeMap;
use std::sync::LazyLock;

use chrono::{Duration, Utc};
use regex::Regex;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::i18n::{Locale, mail_text};
use crate::mail::{Detail, Link, NOTIFICATION_JOB, NotificationMail, Unsubscribe};
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "notifications.getUnreadNoticeCounts" => get_unread_notice_counts);
    register!(registry, Mutation "notifications.markNoticesSeen" => mark_notices_seen);
    register!(registry, Query "notifications.getMyNotificationPrefs" => get_my_notification_prefs);
    register!(registry, Mutation "notifications.updateMyNotificationPrefs" => update_my_notification_prefs);
    register!(registry, Query "notifications.getUnsubscribeInfo" => get_unsubscribe_info);
    register!(registry, Mutation "notifications.unsubscribe" => unsubscribe);
    register!(registry, InternalMutation "notifications.unsubscribeOneClick" => unsubscribe_one_click);
}

/// Emails a user can switch off; missing means on. Everything else (receipts,
/// moderation, account and security) is always sent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Category {
    Sales,
    Offers,
    Questions,
    Buyer,
    Reminders,
    Organizer,
}

impl Category {
    pub const ALL: [Category; 6] = [
        Self::Sales,
        Self::Offers,
        Self::Questions,
        Self::Buyer,
        Self::Reminders,
        Self::Organizer,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Sales => "sales",
            Self::Offers => "offers",
            Self::Questions => "questions",
            Self::Buyer => "buyer",
            Self::Reminders => "reminders",
            Self::Organizer => "organizer",
        }
    }

    /// German title for the unsubscribe page (NOTIFICATION_CATEGORY_LABELS)
    fn title(self) -> &'static str {
        match self {
            Self::Sales => "Verkäufe",
            Self::Offers => "Preisvorschläge",
            Self::Questions => "Fragen",
            Self::Buyer => "Meine Vorschläge und Fragen",
            Self::Reminders => "Erinnerungen zum Basar",
            Self::Organizer => "Nachrichten vom Veranstalter",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|category| category.as_str() == value)
    }
}

/// Menu entries that show a red marker for unread notifications.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Area {
    Products,
    Sales,
    Messages,
    Events,
}

impl Area {
    const ALL: [Area; 4] = [Self::Products, Self::Sales, Self::Messages, Self::Events];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Products => "products",
            Self::Sales => "sales",
            Self::Messages => "messages",
            Self::Events => "events",
        }
    }
}

/// An email in the recipient's language; see `notify_user`.
#[derive(Debug, Clone, Default)]
pub struct Content {
    pub subject: String,
    pub heading: String,
    pub paragraphs: Vec<String>,
    pub details: Vec<Detail>,
    pub link: Option<Link>,
    pub footnote: Option<String>,
    /// Kind of email the user can switch off; without, the email is always sent
    pub category: Option<Category>,
}

/// Translator for one language, passed to the content builders: `t("sale.subject", &[…])`.
#[derive(Clone, Copy)]
pub struct T(pub Locale);

impl T {
    pub fn t(&self, key: &str, values: &[(&str, &str)]) -> String {
        mail_text(self.0, key, values)
    }

    pub fn count(&self, key: &str, count: i64, values: &[(&str, &str)]) -> String {
        crate::i18n::mail_text_count(self.0, key, count, values)
    }

    pub fn link(&self, key: &str, path: impl Into<String>) -> Option<Link> {
        Some(Link {
            label: self.t(key, &[]),
            path: path.into(),
        })
    }
}

/// "12,50 €"
pub fn format_euro(amount: Decimal) -> String {
    format!("{:.2} €", amount.cents()).replace('.', ",")
}

#[derive(sqlx::FromRow)]
struct Recipient {
    status: Option<String>,
    email: Option<String>,
    contact_email: Option<String>,
    managed_by_event_id: Option<Uuid>,
    locale: Option<Locale>,
    notification_prefs: Value,
    unsubscribe_token: String,
}

async fn recipient(ctx: &mut Ctx, user: Uuid) -> sqlx::Result<Option<Recipient>> {
    sqlx::query_as(
        "SELECT status::text AS status, email, contact_email, managed_by_event_id, locale,
                notification_prefs, unsubscribe_token
         FROM users WHERE id = $1",
    )
    .bind(user)
    .fetch_optional(ctx.conn())
    .await
}

fn is_blocked(status: Option<&str>) -> bool {
    matches!(status, Some("deleted" | "banned"))
}

/// Whether the user wants emails of this category; everything is on until switched off.
pub fn wants_email(prefs: &Value, category: Option<Category>) -> bool {
    category.is_none_or(|category| prefs.get(category.as_str()) != Some(&Value::Bool(false)))
}

/// Where notifications for a user go: login email, or the contact email of a walk-in seller.
fn address(recipient: &Recipient) -> Option<String> {
    if is_blocked(recipient.status.as_deref()) {
        return None;
    }
    recipient
        .email
        .clone()
        .or_else(|| recipient.contact_email.clone())
}

/// Schedules an email to a user, silently skipped without address or when the user
/// switched the category off. With `area`, the matching menu entry shows a red marker
/// until the user opens it. `delay` spreads many mails so the SMTP server does not throttle.
pub async fn notify_user(
    ctx: &mut Ctx,
    user: Uuid,
    content: impl Fn(T) -> Content,
    area: Option<Area>,
    delay: Duration,
) -> AppResult<()> {
    let Some(recipient) = recipient(ctx, user).await? else {
        return Ok(());
    };
    // Walk-in sellers cannot log in, so they never see a marker
    if let Some(area) = area
        && !is_blocked(recipient.status.as_deref())
        && recipient.managed_by_event_id.is_none()
    {
        add_notice(ctx, user, area, None).await?;
    }
    let Some(to) = address(&recipient) else {
        return Ok(());
    };
    let locale = recipient.locale.unwrap_or_default();
    let t = T(locale);
    let mail = content(t);
    if !wants_email(&recipient.notification_prefs, mail.category) {
        return Ok(());
    }
    let unsubscribe = match mail.category {
        Some(category) => {
            let query = format!("?t={}&k={}", recipient.unsubscribe_token, category.as_str());
            Some(Unsubscribe {
                path: format!("/benachrichtigungen/abbestellen{query}"),
                one_click_path: format!("/api/unsubscribe{query}"),
                category: t.t(&format!("categories.{}", category.as_str()), &[]),
            })
        }
        None => None,
    };
    queue(ctx, to, locale, mail, unsubscribe, delay).await
}

/// A red marker in the menu; `event` lets the bazaar's page clear only its own.
pub async fn add_notice(
    ctx: &mut Ctx,
    user: Uuid,
    area: Area,
    event: Option<Uuid>,
) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO unread_notices (user_id, area, event_id) VALUES ($1, $2::notice_area, $3)",
    )
    .bind(user)
    .bind(area.as_str())
    .bind(event)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(user));
    Ok(())
}

/// Email to a plain address, e.g. a receipt for a buyer without account, in the language
/// the sender chose.
pub async fn notify_address(
    ctx: &mut Ctx,
    to: String,
    locale: Locale,
    content: impl Fn(T) -> Content,
) -> AppResult<()> {
    let mail = content(T(locale));
    queue(ctx, to, locale, mail, None, Duration::zero()).await
}

async fn queue(
    ctx: &mut Ctx,
    to: String,
    locale: Locale,
    mail: Content,
    unsubscribe: Option<Unsubscribe>,
    delay: Duration,
) -> AppResult<()> {
    let payload = NotificationMail {
        to,
        subject: mail.subject,
        heading: mail.heading,
        paragraphs: mail.paragraphs,
        details: mail.details,
        link: mail.link,
        footnote: mail.footnote,
        locale,
        unsubscribe,
    };
    crate::jobs::enqueue(ctx.conn(), NOTIFICATION_JOB, &payload, Utc::now() + delay).await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// Unread notifications of the current user per menu entry.
async fn get_unread_notice_counts(
    ctx: &mut Ctx,
    _: NoArgs,
) -> AppResult<BTreeMap<&'static str, i64>> {
    let mut counts: BTreeMap<&'static str, i64> =
        Area::ALL.iter().map(|area| (area.as_str(), 0)).collect();
    let Some(user) = ctx.user else {
        return Ok(counts);
    };
    ctx.read(Topic::User(user));
    let rows: Vec<(String, i64)> = sqlx::query_as(
        "SELECT area::text, count(*) FROM unread_notices WHERE user_id = $1 GROUP BY area",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for (area, count) in rows {
        if let Some(entry) = Area::ALL.iter().find(|a| a.as_str() == area) {
            counts.insert(entry.as_str(), count);
        }
    }
    Ok(counts)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SeenArgs {
    area: Area,
    event_id: Option<Id>,
}

/// The user opened the page of `area` (or of one bazaar): its marker goes away.
async fn mark_notices_seen(ctx: &mut Ctx, args: SeenArgs) -> AppResult<()> {
    let Some(user) = ctx.user else { return Ok(()) };
    sqlx::query(
        "DELETE FROM unread_notices WHERE user_id = $1 AND area = $2::notice_area
           AND ($3::uuid IS NULL OR event_id = $3)",
    )
    .bind(user)
    .bind(args.area.as_str())
    .bind(args.event_id.map(|id| id.0))
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(user));
    Ok(())
}

/// The current user's email settings, one switch per category.
async fn get_my_notification_prefs(
    ctx: &mut Ctx,
    _: NoArgs,
) -> AppResult<Option<BTreeMap<&'static str, bool>>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    ctx.read(Topic::User(user));
    let prefs: Option<Value> =
        sqlx::query_scalar("SELECT notification_prefs FROM users WHERE id = $1")
            .bind(user)
            .fetch_optional(ctx.conn())
            .await?;
    Ok(prefs.map(|prefs| {
        Category::ALL
            .iter()
            .map(|category| (category.as_str(), wants_email(&prefs, Some(*category))))
            .collect()
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct PrefsArgs {
    prefs: Prefs,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Prefs {
    #[serde(skip_serializing_if = "Option::is_none")]
    sales: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    offers: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    questions: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    buyer: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    reminders: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    organizer: Option<bool>,
}

async fn update_my_notification_prefs(ctx: &mut Ctx, args: PrefsArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let changes = serde_json::to_value(args.prefs).map_err(anyhow::Error::from)?;
    sqlx::query("UPDATE users SET notification_prefs = notification_prefs || $2 WHERE id = $1")
        .bind(user)
        .bind(changes)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::User(user));
    Ok(())
}

/// Tokens are 32 hex characters; anything else cannot match
static TOKEN_PATTERN: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[0-9a-f]{32}$").unwrap());

async fn find_by_unsubscribe_token(
    ctx: &mut Ctx,
    token: &str,
) -> sqlx::Result<Option<(Uuid, Value, bool)>> {
    if !TOKEN_PATTERN.is_match(token) {
        return Ok(None);
    }
    sqlx::query_as(
        "SELECT id, notification_prefs, managed_by_event_id IS NULL FROM users WHERE unsubscribe_token = $1",
    )
    .bind(token)
    .fetch_optional(ctx.conn())
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct TokenArgs {
    token: String,
    category: Category,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UnsubscribeInfo {
    category: &'static str,
    subscribed: bool,
    /// Walk-in sellers have no login, so the account settings are no help to them
    can_log_in: bool,
}

/// For the unsubscribe page: which category the link is about; null for unknown tokens.
async fn get_unsubscribe_info(
    ctx: &mut Ctx,
    args: TokenArgs,
) -> AppResult<Option<UnsubscribeInfo>> {
    let Some((user, prefs, can_log_in)) = find_by_unsubscribe_token(ctx, &args.token).await? else {
        return Ok(None);
    };
    ctx.read(Topic::User(user));
    Ok(Some(UnsubscribeInfo {
        category: args.category.title(),
        subscribed: wants_email(&prefs, Some(args.category)),
        can_log_in,
    }))
}

/// Switches one category off; false for unknown tokens.
pub async fn unsubscribe_by_token(
    ctx: &mut Ctx,
    token: &str,
    category: Category,
) -> sqlx::Result<bool> {
    let Some((user, ..)) = find_by_unsubscribe_token(ctx, token).await? else {
        return Ok(false);
    };
    sqlx::query("UPDATE users SET notification_prefs = notification_prefs || $2 WHERE id = $1")
        .bind(user)
        .bind(json!({ category.as_str(): false }))
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::User(user));
    Ok(true)
}

/// From the link in an email, without login.
async fn unsubscribe(ctx: &mut Ctx, args: TokenArgs) -> AppResult<()> {
    if !unsubscribe_by_token(ctx, &args.token, args.category).await? {
        return Err(AppError::bad_request("unsubscribe.invalid"));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct OneClickArgs {
    token: String,
    category: String,
}

/// One-click unsubscribe from the mail client, see `one_click_handler`.
async fn unsubscribe_one_click(ctx: &mut Ctx, args: OneClickArgs) -> AppResult<bool> {
    match Category::parse(&args.category) {
        Some(category) => Ok(unsubscribe_by_token(ctx, &args.token, category).await?),
        None => Ok(false),
    }
}

#[derive(Deserialize)]
pub struct OneClickQuery {
    t: Option<String>,
    k: Option<String>,
}

/// `POST /api/unsubscribe?t=…&k=…` from the List-Unsubscribe header (RFC 8058). Only POST,
/// so link scanners following the URL do not unsubscribe anyone.
pub async fn one_click_handler(
    axum::extract::State(state): axum::extract::State<crate::AppState>,
    axum::extract::Query(query): axum::extract::Query<OneClickQuery>,
) -> AppResult<(
    axum::http::StatusCode,
    [(axum::http::HeaderName, &'static str); 1],
    &'static str,
)> {
    let args =
        json!({ "token": query.t.unwrap_or_default(), "category": query.k.unwrap_or_default() });
    let done = crate::rpc::call(&state, None, "notifications.unsubscribeOneClick", args).await?;
    let content_type = [(
        axum::http::header::CONTENT_TYPE,
        "text/plain; charset=utf-8",
    )];
    Ok(if done == Value::Bool(true) {
        (axum::http::StatusCode::OK, content_type, "Abbestellt")
    } else {
        (
            axum::http::StatusCode::BAD_REQUEST,
            content_type,
            "Ungültiger Abmeldelink",
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn euros_with_comma() {
        assert_eq!(format_euro(Decimal::new(1250, 2)), "12,50 €");
        assert_eq!(format_euro(Decimal::new(3, 0)), "3,00 €");
    }

    #[test]
    fn everything_is_on_until_switched_off() {
        let prefs = json!({ "sales": false });
        assert!(!wants_email(&prefs, Some(Category::Sales)));
        assert!(wants_email(&prefs, Some(Category::Offers)));
        assert!(wants_email(&prefs, None));
    }
}
