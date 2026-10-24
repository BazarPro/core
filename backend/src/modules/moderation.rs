//! Moderation by platform administrators: reports from users
//! (notice and action), hiding items and events with a stated reason, deleting
//! questions, banning accounts, the contact inbox and a log of every admin decision.
//!
//! Admin lists search in SQL instead of reading at most 5000 documents; the platform
//! totals are counted with one query instead of batches.

use chrono::{DateTime, Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::access::{active_admins, is_platform_admin, require_admin};
use super::docs::{self, Moderation};
use super::instance::{EMAIL_PATTERN, brand_name, site_settings};
use super::notifications::{self, Area, Content, T};
use super::offers::display_name;
use super::users::revoke_sessions;
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::mail::Detail;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};
use crate::storage;

pub const STATS_JOB: &str = "moderation.refreshPlatformStats";
const MIN_DETAILS_LENGTH: usize = 10;
const MAX_DETAILS_LENGTH: usize = 2000;
const MAX_REASON_LENGTH: usize = 1000;
/// Keeps a single account from flooding the admins with reports
const MAX_OPEN_REPORTS_PER_REPORTER: i64 = 20;
/// Reports without login are only limited by the address typed in, which costs nothing
/// to change; these caps keep a script from flooding the queue and the admins.
const MAX_ANONYMOUS_REPORTS_PER_HOUR: i64 = 30;
const MAX_OPEN_REPORTS_PER_TARGET: i64 = 10;
/// Beyond this, new reports only show up in the admin badge, without an email
const MAX_REPORT_MAILS_PER_HOUR: i64 = 10;
const LIST_LIMIT: i64 = 200;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "moderation.reportContent" => report_content);
    register!(registry, Query "moderation.getOverview" => get_overview);
    register!(registry, InternalMutation "moderation.refreshPlatformStats" => refresh_platform_stats);
    register!(registry, Query "moderation.listReports" => list_reports);
    register!(registry, Mutation "moderation.resolveReport" => resolve_report);
    register!(registry, Mutation "moderation.hideProduct" => hide_product);
    register!(registry, Mutation "moderation.restoreProduct" => restore_product);
    register!(registry, Mutation "moderation.hideEvent" => hide_event);
    register!(registry, Mutation "moderation.restoreEvent" => restore_event);
    register!(registry, Mutation "moderation.deleteQuestion" => delete_question);
    register!(registry, Mutation "moderation.banUser" => ban_user);
    register!(registry, Mutation "moderation.unbanUser" => unban_user);
    register!(registry, Query "moderation.listProducts" => list_products);
    register!(registry, Query "moderation.listQuestions" => list_questions);
    register!(registry, Query "moderation.getUserSummary" => get_user_summary);
    register!(registry, Query "moderation.listMessages" => list_messages);
    register!(registry, Mutation "moderation.setMessageHandled" => set_message_handled);
    register!(registry, Query "moderation.listLog" => list_log);
    register!(registry, Query "moderation.isViewerAdmin" => is_viewer_admin);
    register!(registry, Query "moderation.getMenuCounts" => get_menu_counts);
}

pub struct LogEntry<'a> {
    pub admin: Uuid,
    pub action: &'a str,
    pub target_type: &'a str,
    pub target_id: Uuid,
    pub target_label: &'a str,
    pub reason: Option<&'a str>,
    pub report: Option<Uuid>,
}

pub async fn log_action(ctx: &mut Ctx, entry: LogEntry<'_>) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO moderation_log (admin_id, action, target_type, target_id, target_label, reason, report_id)
         VALUES ($1, $2::moderation_action, $3::report_target, $4, $5, $6, $7)",
    )
    .bind(entry.admin)
    .bind(entry.action)
    .bind(entry.target_type)
    .bind(entry.target_id)
    .bind(entry.target_label)
    .bind(entry.reason)
    .bind(entry.report)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(())
}

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase")]
enum Target {
    Product,
    Event,
    Question,
    User,
}

impl Target {
    fn as_str(self) -> &'static str {
        match self {
            Self::Product => "product",
            Self::Event => "event",
            Self::Question => "question",
            Self::User => "user",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "product" => Some(Self::Product),
            "event" => Some(Self::Event),
            "question" => Some(Self::Question),
            "user" => Some(Self::User),
            _ => None,
        }
    }
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Reason {
    Illegal,
    Fraud,
    Offensive,
    PersonalData,
    Spam,
    Other,
}

impl Reason {
    fn as_str(self) -> &'static str {
        match self {
            Self::Illegal => "illegal",
            Self::Fraud => "fraud",
            Self::Offensive => "offensive",
            Self::PersonalData => "personalData",
            Self::Spam => "spam",
            Self::Other => "other",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Illegal => "Rechtswidriger Inhalt",
            Self::Fraud => "Betrug oder Fälschung",
            Self::Offensive => "Beleidigend oder diskriminierend",
            Self::PersonalData => "Persönliche Daten ohne Einwilligung",
            Self::Spam => "Spam oder Werbung",
            Self::Other => "Sonstiges",
        }
    }
}

/// What a report is about, for lists and mails.
#[skip_serializing_none]
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TargetInfo {
    label: String,
    /// App path to look at the content
    path: Option<String>,
    /// Account responsible for the content, notified about decisions
    owner_id: Option<Uuid>,
    owner_name: Option<String>,
    /// Hidden by moderation, deleted or banned
    is_restricted: bool,
    exists: bool,
}

fn name_or_email(user: Option<&docs::User>) -> Option<String> {
    user.and_then(|u| u.name.clone().or_else(|| u.email.clone()))
}

async fn describe_target(ctx: &mut Ctx, target: Target, id: Uuid) -> AppResult<TargetInfo> {
    let missing = TargetInfo {
        label: "Gelöschter Inhalt".into(),
        path: None,
        owner_id: None,
        owner_name: None,
        is_restricted: true,
        exists: false,
    };
    Ok(match target {
        Target::Product => match docs::product(ctx.conn(), id).await? {
            None => missing,
            Some(product) => {
                let owner = docs::user(ctx.conn(), product.vendor_id).await?;
                TargetInfo {
                    path: Some(format!("/products/view/{}", product.id)),
                    owner_id: Some(product.vendor_id),
                    owner_name: name_or_email(owner.as_ref()),
                    is_restricted: product.moderation.is_some(),
                    exists: true,
                    label: product.title,
                }
            }
        },
        Target::Event => match docs::event(ctx.conn(), id).await? {
            None => missing,
            Some(event) => {
                let owner = docs::user(ctx.conn(), event.organizer_id).await?;
                TargetInfo {
                    path: Some(format!("/events/view/{}", event.id)),
                    owner_id: Some(event.organizer_id),
                    owner_name: name_or_email(owner.as_ref()),
                    is_restricted: event.moderation.is_some(),
                    exists: true,
                    label: event.title,
                }
            }
        },
        Target::Question => {
            let question: Option<(String, Uuid, Uuid)> = sqlx::query_as(
                "SELECT question, product_id, asker_id FROM product_questions WHERE id = $1",
            )
            .bind(id)
            .fetch_optional(ctx.conn())
            .await?;
            match question {
                None => missing,
                Some((question, product, asker)) => {
                    let owner = docs::user(ctx.conn(), asker).await?;
                    TargetInfo {
                        label: format!("„{question}“"),
                        path: Some(format!("/products/view/{product}")),
                        owner_id: Some(asker),
                        owner_name: name_or_email(owner.as_ref()),
                        is_restricted: false,
                        exists: true,
                    }
                }
            }
        }
        Target::User => match docs::user(ctx.conn(), id).await? {
            None => missing,
            Some(user) => TargetInfo {
                label: user
                    .name
                    .clone()
                    .or_else(|| user.email.clone())
                    .unwrap_or_else(|| "Unbekannt".into()),
                path: None,
                owner_id: Some(user.id),
                owner_name: name_or_email(Some(&user)),
                is_restricted: user.status.as_deref() == Some("banned"),
                exists: true,
            },
        },
    })
}

fn require_reason(reason: &str) -> AppResult<String> {
    let text = reason.trim();
    if text.chars().count() < 5 {
        return Err(AppError::bad_request("moderation.reasonRequired"));
    }
    Ok(text.chars().take(MAX_REASON_LENGTH).collect())
}

/// Closes a report after a decision and tells the reporter the outcome.
async fn close_report(
    ctx: &mut Ctx,
    admin: Uuid,
    report: Uuid,
    status: &str,
    note: Option<&str>,
) -> AppResult<()> {
    let row: Option<(String, Uuid, Option<Uuid>, Option<String>)> = sqlx::query_as(
        "UPDATE reports SET status = $2::report_status, resolved_at = now(), resolved_by = $3, resolution_note = $4
         WHERE id = $1 AND status = 'open'
         RETURNING target_type::text, target_id, reporter_id, reporter_email",
    )
    .bind(report)
    .bind(status)
    .bind(admin)
    .bind(note)
    .fetch_optional(ctx.conn())
    .await?;
    let Some((target_type, target_id, reporter, email)) = row else {
        return Ok(());
    };
    ctx.touch(Topic::Admin);
    let target = describe_target(
        ctx,
        Target::parse(&target_type).unwrap_or(Target::User),
        target_id,
    )
    .await?;
    let resolved = status == "resolved";
    let note = note.map(str::to_owned);
    let content = |t: T| {
        let mut paragraphs = vec![t.t(
            if resolved {
                "report.closed.resolved"
            } else {
                "report.closed.dismissed"
            },
            &[],
        )];
        if let Some(note) = &note {
            paragraphs.push(t.t("moderation.reason", &[("reason", note)]));
        }
        Content {
            subject: t.t("report.closed.subject", &[]),
            heading: t.t("report.closed.heading", &[]),
            paragraphs,
            details: vec![Detail {
                label: t.t("report.closed.target", &[]),
                value: target.label.clone(),
            }],
            ..Content::default()
        }
    };
    match (reporter, email) {
        (Some(reporter), _) => {
            notifications::notify_user(ctx, reporter, content, None, Duration::zero()).await
        }
        (None, Some(email)) => notifications::notify_address(ctx, email, Locale::De, content).await,
        _ => Ok(()),
    }
}

/// Closes all open reports about the same content after a decision.
async fn close_reports_for_target(
    ctx: &mut Ctx,
    admin: Uuid,
    target: Target,
    id: Uuid,
    status: &str,
    note: Option<&str>,
) -> AppResult<()> {
    let reports: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM reports WHERE target_type = $1::report_target AND target_id = $2 AND status = 'open' ORDER BY created_at",
    )
    .bind(target.as_str())
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    for report in reports {
        close_report(ctx, admin, report, status, note).await?;
    }
    Ok(())
}

async fn brand(ctx: &mut Ctx) -> sqlx::Result<String> {
    let settings = site_settings(ctx).await?;
    Ok(brand_name(&ctx.state.config, settings.as_ref()))
}

async fn notify_admins_about_report(ctx: &mut Ctx, label: &str, reason: &str) -> AppResult<()> {
    let brand = brand(ctx).await?;
    for admin in active_admins(ctx.conn()).await? {
        notifications::notify_user(
            ctx,
            admin,
            |t: T| Content {
                subject: t.t("report.new.subject", &[("label", label)]),
                heading: t.t("report.new.heading", &[]),
                paragraphs: vec![t.t("report.new.text", &[("brand", &brand)])],
                details: vec![
                    Detail {
                        label: t.t("report.new.content", &[]),
                        value: label.to_owned(),
                    },
                    Detail {
                        label: t.t("report.new.reason", &[]),
                        value: reason.to_owned(),
                    },
                ],
                link: t.link("report.new.link", "/admin/reports"),
                footnote: Some(t.t("report.new.footnote", &[("brand", &brand)])),
                category: None,
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReportArgs {
    target_type: Target,
    target_id: String,
    reason: Reason,
    details: String,
    email: Option<String>,
}

/// Reports content to the administrators. Signed-in users report with their account,
/// everybody else leaves an address for the outcome.
async fn report_content(ctx: &mut Ctx, args: ReportArgs) -> AppResult<()> {
    let user = ctx.user;
    let email = args
        .email
        .as_deref()
        .map(str::trim)
        .filter(|e| !e.is_empty())
        .map(str::to_owned);
    if user.is_none() && !email.as_ref().is_some_and(|e| EMAIL_PATTERN.is_match(e)) {
        return Err(AppError::bad_request("report.emailRequired"));
    }
    let details = args.details.trim().to_owned();
    let length = details.chars().count();
    if length < MIN_DETAILS_LENGTH {
        return Err(AppError::bad_request("report.detailsRequired"));
    }
    if length > MAX_DETAILS_LENGTH {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "report.detailsTooLong",
            &[("max", &MAX_DETAILS_LENGTH.to_string())],
        ));
    }
    let target_id = Id::parse(&args.target_id)
        .ok_or_else(|| AppError::not_found("notFound.content"))?
        .0;
    let target = describe_target(ctx, args.target_type, target_id).await?;
    if !target.exists {
        return Err(AppError::not_found("notFound.content"));
    }
    let (last_hour, anonymous_last_hour): (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE reporter_id IS NULL) FROM reports WHERE created_at >= now() - interval '1 hour'",
    )
    .fetch_one(ctx.conn())
    .await?;
    if user.is_none() && anonymous_last_hour >= MAX_ANONYMOUS_REPORTS_PER_HOUR {
        return Err(AppError::too_many_requests("report.rateLimited"));
    }
    let open_for_target: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM reports WHERE target_type = $1::report_target AND target_id = $2 AND status = 'open'",
    )
    .bind(args.target_type.as_str())
    .bind(target_id)
    .fetch_one(ctx.conn())
    .await?;
    if open_for_target >= MAX_OPEN_REPORTS_PER_TARGET {
        return Err(AppError::bad_request("report.alreadyReported"));
    }
    let (mine, mine_for_target): (i64, i64) = sqlx::query_as(
        "SELECT count(*), count(*) FILTER (WHERE target_type = $3::report_target AND target_id = $4)
         FROM reports WHERE status = 'open' AND (reporter_id = $1 OR ($1 IS NULL AND reporter_email = $2))",
    )
    .bind(user)
    .bind(&email)
    .bind(args.target_type.as_str())
    .bind(target_id)
    .fetch_one(ctx.conn())
    .await?;
    if mine_for_target > 0 {
        return Err(AppError::bad_request("report.youReported"));
    }
    if mine >= MAX_OPEN_REPORTS_PER_REPORTER {
        return Err(AppError::bad_request("report.tooManyOpen"));
    }
    sqlx::query(
        "INSERT INTO reports (target_type, target_id, reason, details, reporter_id, reporter_email, status)
         VALUES ($1::report_target, $2, $3::report_reason, $4, $5, $6, 'open')",
    )
    .bind(args.target_type.as_str())
    .bind(target_id)
    .bind(args.reason.as_str())
    .bind(&details)
    .bind(user)
    .bind(if user.is_some() { None } else { email })
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    // Further reports about the same content and floods only raise the badge count
    if open_for_target == 0 && last_hour < MAX_REPORT_MAILS_PER_HOUR {
        notify_admins_about_report(ctx, &target.label, args.reason.label()).await?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Overview {
    open_reports: i64,
    pending_events: i64,
    unhandled_messages: i64,
    running_events: i64,
    upcoming_events: i64,
    users: Option<i64>,
    new_users: i64,
    banned_users: i64,
    products: Option<i64>,
    #[serde(with = "ms_opt")]
    stats_updated_at: Option<DateTime<Utc>>,
    hidden_products: i64,
    hidden_events: i64,
}

/// The admin dashboard; the totals of users and items come from the hourly count.
async fn get_overview(ctx: &mut Ctx, _: NoArgs) -> AppResult<Overview> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    ctx.read(Topic::Events);
    Ok(sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM reports WHERE status = 'open') AS open_reports,
           (SELECT count(*) FROM events WHERE approval_status = 'pending' AND visibility = 'public') AS pending_events,
           (SELECT count(*) FROM contact_messages WHERE handled_at IS NULL) AS unhandled_messages,
           (SELECT count(*) FROM events WHERE end_date >= now() AND start_date <= now()) AS running_events,
           (SELECT count(*) FROM events WHERE start_date > now()) AS upcoming_events,
           (SELECT users FROM platform_stats) AS users,
           (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days'
              AND managed_by_event_id IS NULL AND status IS DISTINCT FROM 'deleted') AS new_users,
           (SELECT count(*) FROM users WHERE status = 'banned' AND managed_by_event_id IS NULL) AS banned_users,
           (SELECT products FROM platform_stats) AS products,
           (SELECT updated_at FROM platform_stats) AS stats_updated_at,
           (SELECT count(*) FROM products WHERE hidden_at IS NOT NULL) AS hidden_products,
           (SELECT count(*) FROM events WHERE hidden_at IS NOT NULL) AS hidden_events",
    )
    .fetch_one(ctx.conn())
    .await?)
}

/// Counts users (people, not walk-ins or deleted accounts) and items for the overview.
async fn refresh_platform_stats(ctx: &mut Ctx, _: NoArgs) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO platform_stats (users, products, updated_at)
         SELECT (SELECT count(*) FROM users WHERE managed_by_event_id IS NULL AND status IS DISTINCT FROM 'deleted'),
                (SELECT count(*) FROM products), now()
         ON CONFLICT (singleton) DO UPDATE SET users = EXCLUDED.users, products = EXCLUDED.products,
           updated_at = EXCLUDED.updated_at",
    )
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(())
}

pub fn stats_job(state: AppState, _: Value) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        crate::rpc::call(
            &state,
            None,
            "moderation.refreshPlatformStats",
            serde_json::json!({}),
        )
        .await
        .map_err(|err| anyhow::anyhow!("{err}"))?;
        Ok(())
    }
    .boxed()
}

#[derive(sqlx::FromRow)]
struct ReportRow {
    id: Uuid,
    created_at: DateTime<Utc>,
    target_type: String,
    target_id: Uuid,
    reason: String,
    details: String,
    reporter_id: Option<Uuid>,
    reporter_email: Option<String>,
    status: String,
    resolved_at: Option<DateTime<Utc>>,
    resolved_by: Option<Uuid>,
    resolution_note: Option<String>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportView {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    creation_time: DateTime<Utc>,
    target_type: String,
    target_id: Uuid,
    reason: String,
    details: String,
    reporter_id: Option<Uuid>,
    reporter_email: Option<String>,
    status: String,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[serde(with = "ms_opt")]
    resolved_at: Option<DateTime<Utc>>,
    resolved_by: Option<Uuid>,
    resolution_note: Option<String>,
    target: TargetInfo,
    report_count: i64,
    reporter_label: String,
    resolver_name: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusArgs {
    status: String,
}

async fn list_reports(ctx: &mut Ctx, args: StatusArgs) -> AppResult<Vec<ReportView>> {
    require_admin(ctx).await?;
    if !["open", "resolved", "dismissed"].contains(&args.status.as_str()) {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "INVALID_ARGUMENTS",
            &[("details", "status")],
        ));
    }
    ctx.read(Topic::Admin);
    let reports: Vec<ReportRow> = sqlx::query_as(
        "SELECT id, created_at, target_type::text AS target_type, target_id, reason::text AS reason, details,
                reporter_id, reporter_email, status::text AS status, resolved_at, resolved_by, resolution_note
         FROM reports WHERE status = $1::report_status ORDER BY created_at DESC LIMIT $2",
    )
    .bind(&args.status)
    .bind(LIST_LIMIT)
    .fetch_all(ctx.conn())
    .await?;
    let mut views = Vec::new();
    for report in reports {
        let target = describe_target(
            ctx,
            Target::parse(&report.target_type).unwrap_or(Target::User),
            report.target_id,
        )
        .await?;
        let count: i64 = sqlx::query_scalar(
            "SELECT count(*) FROM reports WHERE target_type = $1::report_target AND target_id = $2",
        )
        .bind(&report.target_type)
        .bind(report.target_id)
        .fetch_one(ctx.conn())
        .await?;
        let reporter = match report.reporter_id {
            Some(id) => docs::user(ctx.conn(), id).await?,
            None => None,
        };
        let resolver = match report.resolved_by {
            Some(id) => docs::user(ctx.conn(), id).await?,
            None => None,
        };
        views.push(ReportView {
            reporter_label: match &reporter {
                Some(reporter) => name_or_email(Some(reporter)).unwrap_or_else(|| "Nutzer".into()),
                None => report
                    .reporter_email
                    .clone()
                    .unwrap_or_else(|| "Anonym".into()),
            },
            resolver_name: name_or_email(resolver.as_ref()),
            id: report.id,
            creation_time: report.created_at,
            target_type: report.target_type,
            target_id: report.target_id,
            reason: report.reason,
            details: report.details,
            reporter_id: report.reporter_id,
            reporter_email: report.reporter_email,
            status: report.status,
            created_at: report.created_at,
            resolved_at: report.resolved_at,
            resolved_by: report.resolved_by,
            resolution_note: report.resolution_note,
            target,
            report_count: count,
        });
    }
    Ok(views)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ResolveArgs {
    report_id: Id,
    status: String,
    note: Option<String>,
}

/// Closes a report without touching the content, e.g. after deciding it is fine.
async fn resolve_report(ctx: &mut Ctx, args: ResolveArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    if args.status != "resolved" && args.status != "dismissed" {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "INVALID_ARGUMENTS",
            &[("details", "status")],
        ));
    }
    let report: Option<(String, String, Uuid)> = sqlx::query_as(
        "SELECT status::text, target_type::text, target_id FROM reports WHERE id = $1",
    )
    .bind(args.report_id.0)
    .fetch_optional(ctx.conn())
    .await?;
    let (status, target_type, target_id) =
        report.ok_or_else(|| AppError::not_found("notFound.report"))?;
    if status != "open" {
        return Err(AppError::bad_request("report.closed"));
    }
    let note = args
        .note
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty())
        .map(str::to_owned);
    let target = describe_target(
        ctx,
        Target::parse(&target_type).unwrap_or(Target::User),
        target_id,
    )
    .await?;
    close_report(ctx, admin, args.report_id.0, &args.status, note.as_deref()).await?;
    log_action(
        ctx,
        LogEntry {
            admin,
            action: if args.status == "resolved" {
                "resolveReport"
            } else {
                "dismissReport"
            },
            target_type: &target_type,
            target_id,
            target_label: &target.label,
            reason: note.as_deref(),
            report: Some(args.report_id.0),
        },
    )
    .await?;
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HideProductArgs {
    product_id: Id,
    reason: String,
    report_id: Option<Id>,
}

async fn hide_product(ctx: &mut Ctx, args: HideProductArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let product = docs::product(ctx.conn(), args.product_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    let reason = require_reason(&args.reason)?;
    sqlx::query(
        "UPDATE products SET hidden_at = now(), hidden_by = $2, hidden_reason = $3 WHERE id = $1",
    )
    .bind(product.id)
    .bind(admin)
    .bind(&reason)
    .execute(ctx.conn())
    .await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "hideProduct",
            target_type: "product",
            target_id: product.id,
            target_label: &product.title,
            reason: Some(&reason),
            report: args.report_id.map(|id| id.0),
        },
    )
    .await?;
    let (title, path) = (
        product.title.clone(),
        format!("/products/view/{}", product.id),
    );
    notifications::notify_user(
        ctx,
        product.vendor_id,
        |t: T| Content {
            subject: t.t("moderation.productHidden.subject", &[("title", &title)]),
            heading: t.t("moderation.productHidden.heading", &[]),
            paragraphs: vec![
                t.t("moderation.productHidden.text", &[]),
                t.t("moderation.reason", &[("reason", &reason)]),
                t.t("moderation.appeal", &[]),
            ],
            link: t.link("moderation.viewProduct", path.clone()),
            ..Content::default()
        },
        Some(Area::Products),
        Duration::zero(),
    )
    .await?;
    close_reports_for_target(
        ctx,
        admin,
        Target::Product,
        product.id,
        "resolved",
        Some(&reason),
    )
    .await
}

async fn touch_product(ctx: &mut Ctx, product: Uuid, vendor: Uuid) -> sqlx::Result<()> {
    ctx.touch(Topic::Product(product));
    ctx.touch(Topic::User(vendor));
    ctx.touch(Topic::Table("products"));
    let events: Vec<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM event_products WHERE product_id = $1")
            .bind(product)
            .fetch_all(ctx.conn())
            .await?;
    for event in events {
        ctx.touch(Topic::Event(event));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductArgs {
    product_id: Id,
}

async fn restore_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let product = docs::product(ctx.conn(), args.product_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if product.moderation.is_none() {
        return Ok(());
    }
    sqlx::query("UPDATE products SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = $1")
        .bind(product.id)
        .execute(ctx.conn())
        .await?;
    touch_product(ctx, product.id, product.vendor_id).await?;
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "restoreProduct",
            target_type: "product",
            target_id: product.id,
            target_label: &product.title,
            reason: None,
            report: None,
        },
    )
    .await?;
    let (title, path) = (
        product.title.clone(),
        format!("/products/view/{}", product.id),
    );
    notifications::notify_user(
        ctx,
        product.vendor_id,
        |t: T| Content {
            subject: t.t("moderation.productRestored.subject", &[("title", &title)]),
            heading: t.t("moderation.productRestored.heading", &[]),
            paragraphs: vec![t.t("moderation.productRestored.text", &[])],
            link: t.link("moderation.viewProduct", path.clone()),
            ..Content::default()
        },
        Some(Area::Products),
        Duration::zero(),
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HideEventArgs {
    event_id: Id,
    reason: String,
    report_id: Option<Id>,
}

/// Hides an event from everybody except its team; works for every visibility.
async fn hide_event(ctx: &mut Ctx, args: HideEventArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    let reason = require_reason(&args.reason)?;
    sqlx::query(
        "UPDATE events SET hidden_at = now(), hidden_by = $2, hidden_reason = $3 WHERE id = $1",
    )
    .bind(event.id)
    .bind(admin)
    .bind(&reason)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::Events);
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "hideEvent",
            target_type: "event",
            target_id: event.id,
            target_label: &event.title,
            reason: Some(&reason),
            report: args.report_id.map(|id| id.0),
        },
    )
    .await?;
    let (title, path) = (event.title.clone(), format!("/events/view/{}", event.id));
    notifications::notify_user(
        ctx,
        event.organizer_id,
        |t: T| Content {
            subject: t.t("moderation.eventHidden.subject", &[("title", &title)]),
            heading: t.t("moderation.eventHidden.heading", &[]),
            paragraphs: vec![
                t.t("moderation.eventHidden.text", &[]),
                t.t("moderation.reason", &[("reason", &reason)]),
                t.t("moderation.appeal", &[]),
            ],
            link: t.link("moderation.openEvent", path.clone()),
            ..Content::default()
        },
        Some(Area::Events),
        Duration::zero(),
    )
    .await?;
    close_reports_for_target(
        ctx,
        admin,
        Target::Event,
        event.id,
        "resolved",
        Some(&reason),
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn restore_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.moderation.is_none() {
        return Ok(());
    }
    sqlx::query(
        "UPDATE events SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL WHERE id = $1",
    )
    .bind(event.id)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::Events);
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "restoreEvent",
            target_type: "event",
            target_id: event.id,
            target_label: &event.title,
            reason: None,
            report: None,
        },
    )
    .await?;
    let (title, path) = (event.title.clone(), format!("/events/view/{}", event.id));
    notifications::notify_user(
        ctx,
        event.organizer_id,
        |t: T| Content {
            subject: t.t("moderation.eventRestored.subject", &[("title", &title)]),
            heading: t.t("moderation.eventRestored.heading", &[]),
            paragraphs: vec![t.t("moderation.eventRestored.text", &[])],
            link: t.link("moderation.openEvent", path.clone()),
            ..Content::default()
        },
        Some(Area::Events),
        Duration::zero(),
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteQuestionArgs {
    question_id: Id,
    reason: String,
    report_id: Option<Id>,
}

async fn delete_question(ctx: &mut Ctx, args: DeleteQuestionArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let question: Option<(String, Option<String>, Uuid, Uuid)> = sqlx::query_as(
        "SELECT question, answer, product_id, asker_id FROM product_questions WHERE id = $1",
    )
    .bind(args.question_id.0)
    .fetch_optional(ctx.conn())
    .await?;
    let (question, answer, product_id, asker) =
        question.ok_or_else(|| AppError::not_found("notFound.question"))?;
    let reason = require_reason(&args.reason)?;
    let product = docs::product(ctx.conn(), product_id).await?;
    close_reports_for_target(
        ctx,
        admin,
        Target::Question,
        args.question_id.0,
        "resolved",
        Some(&reason),
    )
    .await?;
    sqlx::query("DELETE FROM product_questions WHERE id = $1")
        .bind(args.question_id.0)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Product(product_id));
    let label = match &answer {
        Some(answer) => format!("„{question}“ / Antwort: „{answer}“"),
        None => format!("„{question}“"),
    };
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "deleteQuestion",
            target_type: "question",
            target_id: args.question_id.0,
            target_label: &label,
            reason: Some(&reason),
            report: args.report_id.map(|id| id.0),
        },
    )
    .await?;
    let title = product.map(|p| p.title);
    notifications::notify_user(
        ctx,
        asker,
        |t: T| Content {
            subject: t.t("moderation.questionDeleted.subject", &[]),
            heading: t.t("moderation.questionDeleted.heading", &[]),
            paragraphs: vec![
                match &title {
                    Some(title) => t.t(
                        "moderation.questionDeleted.textProduct",
                        &[("title", title)],
                    ),
                    None => t.t("moderation.questionDeleted.text", &[]),
                },
                t.t("moderation.reason", &[("reason", &reason)]),
            ],
            details: vec![Detail {
                label: t.t("moderation.questionDeleted.question", &[]),
                value: question.clone(),
            }],
            ..Content::default()
        },
        None,
        Duration::zero(),
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BanArgs {
    user_id: Id,
    reason: String,
    report_id: Option<Id>,
}

async fn ban_user(ctx: &mut Ctx, args: BanArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let target = args.user_id.0;
    if admin == target {
        return Err(AppError::bad_request("moderation.noBanSelf"));
    }
    let user = docs::user(ctx.conn(), target)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.user"))?;
    if user.system_role.as_deref() == Some("admin") {
        return Err(AppError::bad_request("moderation.noBanAdmin"));
    }
    let reason = require_reason(&args.reason)?;
    // Tell the user before the ban: notifications skip banned accounts
    let brand = brand(ctx).await?;
    notifications::notify_user(
        ctx,
        target,
        |t: T| Content {
            subject: t.t("moderation.banned.subject", &[("brand", &brand)]),
            heading: t.t("moderation.banned.heading", &[]),
            paragraphs: vec![
                t.t("moderation.banned.text", &[]),
                t.t("moderation.reason", &[("reason", &reason)]),
                t.t("moderation.banned.appeal", &[]),
            ],
            ..Content::default()
        },
        None,
        Duration::zero(),
    )
    .await?;
    sqlx::query("UPDATE users SET status = 'banned' WHERE id = $1")
        .bind(target)
        .execute(ctx.conn())
        .await?;
    revoke_sessions(ctx.conn(), target).await?;
    ctx.touch(Topic::User(target));
    let label = user
        .name
        .clone()
        .or_else(|| user.email.clone())
        .unwrap_or_else(|| "Unbekannt".into());
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "banUser",
            target_type: "user",
            target_id: target,
            target_label: &label,
            reason: Some(&reason),
            report: args.report_id.map(|id| id.0),
        },
    )
    .await?;
    close_reports_for_target(ctx, admin, Target::User, target, "resolved", Some(&reason)).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UserArgs {
    user_id: Id,
}

async fn unban_user(ctx: &mut Ctx, args: UserArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let user = docs::user(ctx.conn(), args.user_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.user"))?;
    if user.status.as_deref() != Some("banned") {
        return Ok(());
    }
    // An account deleted before the ban stays deleted and is anonymized after the grace period
    sqlx::query(
        "UPDATE users
         SET status = CASE WHEN deletion_requested_at IS NULL THEN 'active' ELSE 'deleted' END::user_status
         WHERE id = $1",
    )
        .bind(user.id)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::User(user.id));
    let label = user
        .name
        .clone()
        .or_else(|| user.email.clone())
        .unwrap_or_else(|| "Unbekannt".into());
    log_action(
        ctx,
        LogEntry {
            admin,
            action: "unbanUser",
            target_type: "user",
            target_id: user.id,
            target_label: &label,
            reason: None,
            report: None,
        },
    )
    .await?;
    Ok(())
}

/// `%term%` for ILIKE, with the wildcards of the term escaped.
fn like(term: &str) -> String {
    format!(
        "%{}%",
        term.replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_")
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListProductsArgs {
    search: Option<String>,
    vendor_id: Option<Id>,
    only_hidden: Option<bool>,
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminProduct {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    created_at: DateTime<Utc>,
    title: String,
    description: String,
    price: Decimal,
    sold: bool,
    moderation: Option<Moderation>,
    #[serde(serialize_with = "nullable")]
    image_url: Option<String>,
    vendor_id: Uuid,
    vendor_name: String,
}

fn nullable<S: serde::Serializer>(
    value: &Option<String>,
    serializer: S,
) -> Result<S::Ok, S::Error> {
    value.serialize(serializer)
}

/// Latest items, optionally filtered by text (or ID), seller or moderation state.
async fn list_products(ctx: &mut Ctx, args: ListProductsArgs) -> AppResult<Vec<AdminProduct>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Table("products"));
    let term = args
        .search
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty());
    let ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT id FROM products
         WHERE ($1::uuid IS NULL OR vendor_id = $1) AND (NOT $2 OR hidden_at IS NOT NULL)
           AND ($3::text IS NULL OR title ILIKE $3 OR description ILIKE $3 OR id::text = $4)
         ORDER BY created_at DESC LIMIT $5",
    )
    .bind(args.vendor_id.map(|id| id.0))
    .bind(args.only_hidden == Some(true))
    .bind(term.map(like))
    .bind(term.map(str::to_lowercase))
    .bind(LIST_LIMIT)
    .fetch_all(ctx.conn())
    .await?;
    let config = ctx.state.config.clone();
    let mut result = Vec::new();
    for id in ids {
        let Some(product) = docs::product(ctx.conn(), id).await? else {
            continue;
        };
        let vendor = docs::user(ctx.conn(), product.vendor_id).await?;
        result.push(AdminProduct {
            id: product.id,
            created_at: product.created_at,
            image_url: product
                .images
                .first()
                .map(|image| storage::url(&config, *image)),
            vendor_id: product.vendor_id,
            vendor_name: name_or_email(vendor.as_ref()).unwrap_or_else(|| "Unbekannt".into()),
            title: product.title,
            description: product.description,
            price: product.price,
            sold: product.sold,
            moderation: product.moderation,
        });
    }
    Ok(result)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListQuestionsArgs {
    search: Option<String>,
    asker_id: Option<Id>,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminQuestion {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    creation_time: DateTime<Utc>,
    event_id: Uuid,
    product_id: Uuid,
    asker_id: Uuid,
    question: String,
    answer: Option<String>,
    answered_by: Option<Uuid>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[serde(with = "ms_opt")]
    answered_at: Option<DateTime<Utc>>,
    #[sqlx(default)]
    product_title: String,
    #[sqlx(default)]
    asker_name: String,
}

/// Latest public questions and answers.
async fn list_questions(ctx: &mut Ctx, args: ListQuestionsArgs) -> AppResult<Vec<AdminQuestion>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    let term = args
        .search
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty());
    let mut questions: Vec<AdminQuestion> = sqlx::query_as(
        "SELECT q.id, q.created_at AS creation_time, q.event_id, q.product_id, q.asker_id, q.question, q.answer,
                q.answered_by, q.created_at, q.answered_at, COALESCE(p.title, 'Gelöschter Artikel') AS product_title
         FROM product_questions q LEFT JOIN products p ON p.id = q.product_id
         WHERE ($1::uuid IS NULL OR q.asker_id = $1) AND ($2::text IS NULL OR q.question ILIKE $2 OR q.answer ILIKE $2)
         ORDER BY q.created_at DESC LIMIT $3",
    )
    .bind(args.asker_id.map(|id| id.0))
    .bind(term.map(like))
    .bind(LIST_LIMIT)
    .fetch_all(ctx.conn())
    .await?;
    for question in &mut questions {
        let asker = docs::user(ctx.conn(), question.asker_id).await?;
        question.asker_name = name_or_email(asker.as_ref())
            .unwrap_or_else(|| display_name(asker.as_ref(), T(Locale::De)));
    }
    Ok(questions)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryEvent {
    #[serde(rename = "_id")]
    id: Uuid,
    title: String,
    hidden: bool,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct LogView {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    creation_time: DateTime<Utc>,
    admin_id: Uuid,
    action: String,
    target_type: String,
    target_id: Uuid,
    target_label: String,
    reason: Option<String>,
    report_id: Option<Uuid>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[sqlx(default)]
    admin_name: Option<String>,
}

const LOG_COLUMNS: &str = "id, created_at AS creation_time, admin_id, action::text AS action,
    target_type::text AS target_type, target_id, target_label, reason, report_id, created_at";

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct UserSummary {
    #[serde(rename = "_id")]
    id: Uuid,
    name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    status: String,
    system_role: Option<String>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[serde(with = "ms_opt")]
    last_login_at: Option<DateTime<Utc>>,
    is_walk_in: bool,
    product_count: i64,
    hidden_product_count: i64,
    events: Vec<SummaryEvent>,
    question_count: i64,
    seller_event_count: i64,
    report_count: i64,
    history: Vec<LogView>,
}

/// Everything an account has created, for the user detail view.
async fn get_user_summary(ctx: &mut Ctx, args: UserArgs) -> AppResult<Option<UserSummary>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    ctx.read(Topic::User(args.user_id.0));
    let Some(user) = docs::user(ctx.conn(), args.user_id.0).await? else {
        return Ok(None);
    };
    let (products, hidden, questions, seller_events, reports): (i64, i64, i64, i64, i64) =
        sqlx::query_as(
            "SELECT (SELECT count(*) FROM products WHERE vendor_id = $1),
                (SELECT count(*) FROM products WHERE vendor_id = $1 AND hidden_at IS NOT NULL),
                (SELECT count(*) FROM product_questions WHERE asker_id = $1),
                (SELECT count(*) FROM event_roles WHERE user_id = $1 AND role = 'seller'),
                (SELECT count(*) FROM reports WHERE target_type = 'user' AND target_id = $1)",
        )
        .bind(user.id)
        .fetch_one(ctx.conn())
        .await?;
    let events: Vec<(Uuid, String, bool)> =
        sqlx::query_as("SELECT id, title, hidden_at IS NOT NULL FROM events WHERE organizer_id = $1 ORDER BY created_at")
            .bind(user.id)
            .fetch_all(ctx.conn())
            .await?;
    let history: Vec<LogView> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {LOG_COLUMNS} FROM moderation_log WHERE target_type = 'user' AND target_id = $1 ORDER BY created_at DESC"
    )))
    .bind(user.id)
    .fetch_all(ctx.conn())
    .await?;
    Ok(Some(UserSummary {
        id: user.id,
        email: user.email.clone().or_else(|| user.contact_email.clone()),
        name: user.name,
        phone: user.phone,
        status: user.status.unwrap_or_else(|| "active".into()),
        system_role: user.system_role,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        is_walk_in: user.managed_by_event_id.is_some(),
        product_count: products,
        hidden_product_count: hidden,
        events: events
            .into_iter()
            .map(|(id, title, hidden)| SummaryEvent { id, title, hidden })
            .collect(),
        question_count: questions,
        seller_event_count: seller_events,
        report_count: reports,
        history,
    }))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct MessagesArgs {
    handled: bool,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct MessageView {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    creation_time: DateTime<Utc>,
    name: String,
    email: String,
    message: String,
    accepted_privacy_policy: bool,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[serde(with = "ms_opt")]
    handled_at: Option<DateTime<Utc>>,
    handled_by: Option<Uuid>,
}

/// The contact inbox: open messages newest first, or handled ones by handling time.
async fn list_messages(ctx: &mut Ctx, args: MessagesArgs) -> AppResult<Vec<MessageView>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    let condition = if args.handled {
        "handled_at IS NOT NULL ORDER BY handled_at DESC"
    } else {
        "handled_at IS NULL ORDER BY created_at DESC"
    };
    Ok(sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT id, created_at AS creation_time, name, email, message, accepted_privacy_policy, created_at,
                handled_at, handled_by
         FROM contact_messages WHERE {condition} LIMIT $1"
    )))
    .bind(LIST_LIMIT)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HandledArgs {
    message_id: Id,
    handled: bool,
}

async fn set_message_handled(ctx: &mut Ctx, args: HandledArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    sqlx::query(
        "UPDATE contact_messages SET handled_at = CASE WHEN $2 THEN now() END, handled_by = CASE WHEN $2 THEN $3 END
         WHERE id = $1",
    )
    .bind(args.message_id.0)
    .bind(args.handled)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(())
}

async fn list_log(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<LogView>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    let mut entries: Vec<LogView> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {LOG_COLUMNS} FROM moderation_log ORDER BY created_at DESC LIMIT $1"
    )))
    .bind(LIST_LIMIT)
    .fetch_all(ctx.conn())
    .await?;
    for entry in &mut entries {
        let admin = docs::user(ctx.conn(), entry.admin_id).await?;
        // An anonymized admin has neither name nor address left
        entry.admin_name = Some(name_or_email(admin.as_ref()).unwrap_or_else(|| {
            match admin.and_then(|admin| admin.status) {
                Some(status) if status == "deleted" => "Gelöschtes Konto".into(),
                _ => "Admin".into(),
            }
        }));
    }
    Ok(entries)
}

/// Whether the viewer is an admin; shows the moderation tools on public pages.
async fn is_viewer_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<bool> {
    let viewer = ctx.user;
    if let Some(user) = viewer {
        ctx.read(Topic::User(user));
    }
    Ok(is_platform_admin(ctx.conn(), viewer).await?)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MenuCounts {
    open_reports: i64,
    unhandled_messages: i64,
}

/// Small counters for the admin menu; null for everybody else.
async fn get_menu_counts(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<MenuCounts>> {
    let viewer = ctx.user;
    if !is_platform_admin(ctx.conn(), viewer).await? {
        return Ok(None);
    }
    ctx.read(Topic::Admin);
    let (open_reports, unhandled_messages): (i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM reports WHERE status = 'open'),
                (SELECT count(*) FROM contact_messages WHERE handled_at IS NULL)",
    )
    .fetch_one(ctx.conn())
    .await?;
    Ok(Some(MenuCounts {
        open_reports,
        unhandled_messages,
    }))
}
