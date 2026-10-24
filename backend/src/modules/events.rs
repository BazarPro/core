//! Bazaars: create, edit, list, approval of public ones, leaving, cash summary.
//!
//! - The access code is only readable for the event team and admins; everybody else
//!   gets a placeholder and `hasAccessCode` (the check happens on the server anyway).
//! - An event with sales cannot be deleted, the sales would lose their event.
//! - Unknown services and visibilities are refused as invalid arguments.

use axum::http::StatusCode;
use chrono::{DateTime, Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value, json};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::access::{active_admins, is_platform_admin, require_admin};
use super::category_fields::requirable_fields;
use super::docs::{self, Event};
use super::event_roles::{
    self, Role, TEAM, has_any_role_or_admin, has_role_or_admin, load_vendors_with_calculations,
    require_team,
};
use super::features::MAX_DISCOUNT_PERCENT;
use super::moderation::{LogEntry, log_action};
use super::notifications::{self, Area, Content, T};
use super::sales;
use crate::config::InstanceMode;
use crate::error::{AppError, AppResult};
use crate::i18n::{Locale, mail_text};
use crate::money::Cents;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, from_ms};
use crate::{AppState, flags, mail, storage};

pub const PENDING_JOB: &str = "events.notifyAdminsEventPending";
const MAX_SELLER_NOTE: usize = 2000;
const SERVICES: [&str; 5] = [
    "Parkplatz",
    "Skiservice",
    "Gastronomie",
    "Imbiss",
    "Getränke",
];
const VISIBILITIES: [&str; 3] = ["public", "logged-in", "approved"];
const LABEL_FORMATS: [&str; 2] = ["standard", "small"];
/// What viewers outside the team see instead of the access code
const HIDDEN_ACCESS_CODE: &str = "••••";

pub fn register(registry: &mut Registry) {
    register!(registry, Query "events.getFeeLock" => get_fee_lock);
    register!(registry, Query "events.getMyEvents" => get_my_events);
    register!(registry, Query "events.get" => get);
    register!(registry, Query "events.getPublicEventsForAdmin" => get_public_events_for_admin);
    register!(registry, Query "events.getEventsForAdmin" => get_events_for_admin);
    register!(registry, Mutation "events.approveEventForAdmin" => approve_event_for_admin);
    register!(registry, Mutation "events.rejectEventForAdmin" => reject_event_for_admin);
    register!(registry, Mutation "events.requestEventReviewForOrganizer" => request_event_review_for_organizer);
    register!(registry, Query "events.getEvent" => get_event);
    register!(registry, Query "events.getPublicEventForViewer" => get_public_event_for_viewer);
    register!(registry, Query "events.getEvents" => get_events);
    register!(registry, Mutation "events.createEvent" => create_event);
    register!(registry, Mutation "events.editEvent" => edit_event);
    register!(registry, Mutation "events.deleteEvent" => delete_event);
    register!(registry, Query "events.getMyRegisteredEvents" => get_my_registered_events);
    register!(registry, Mutation "events.leaveEvent" => leave_event);
    register!(registry, Query "events.getMyProductCountForEvent" => get_my_product_count_for_event);
    register!(registry, Query "events.getEventFinancialSummary" => get_event_financial_summary);
    register!(registry, Query "events.countPendingApprovals" => count_pending_approvals);
}

fn invalid(details: &str) -> AppError {
    AppError::coded(
        StatusCode::BAD_REQUEST,
        "INVALID_ARGUMENTS",
        &[("details", details)],
    )
}

pub fn is_event_approved(event: &Event) -> bool {
    match event.approval_status.as_deref() {
        Some("rejected" | "pending") => false,
        Some("approved") => true,
        _ => event.is_approved != Some(false),
    }
}

/// An event as sent to the app; `hasAccessCode` is added, the code hidden from others.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventView {
    #[serde(flatten)]
    pub event: Event,
    pub has_access_code: bool,
}

pub fn view(mut event: Event, show_access_code: bool) -> EventView {
    let has_access_code = event
        .access_code
        .as_deref()
        .is_some_and(|code| !code.is_empty());
    if has_access_code && !show_access_code {
        event.access_code = Some(HIDDEN_ACCESS_CODE.to_owned());
    }
    EventView {
        event,
        has_access_code,
    }
}

/// Whether the viewer may see the access code: event team or admin.
async fn sees_access_code(ctx: &mut Ctx, event: Uuid) -> sqlx::Result<bool> {
    match ctx.user {
        Some(user) => has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await,
        None => Ok(false),
    }
}

async fn load(ctx: &mut Ctx, id: Uuid) -> AppResult<Event> {
    ctx.read(Topic::Event(id));
    docs::event(ctx.conn(), id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))
}

fn touch_event(ctx: &mut Ctx, id: Uuid) {
    ctx.touch(Topic::Event(id));
    ctx.touch(Topic::Events);
}

/// Sellers register knowing the fees and the item limit: from the first registration
/// on, fees can only go down and the limit only up (while the bazaar runs, the fees stay).
async fn fees_locked(ctx: &mut Ctx, event: &Event) -> sqlx::Result<bool> {
    let now = Utc::now();
    if event.start_date <= now && now <= event.end_date {
        return Ok(true);
    }
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles WHERE event_id = $1 AND role = 'seller')",
    )
    .bind(event.id)
    .fetch_one(ctx.conn())
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

#[derive(Serialize)]
struct FeeLock {
    locked: bool,
}

/// For the event form: whether fees and item limit can still be changed freely.
async fn get_fee_lock(ctx: &mut Ctx, args: EventArgs) -> AppResult<Option<FeeLock>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    ctx.read(Topic::Event(args.event_id.0));
    let Some(event) = docs::event(ctx.conn(), args.event_id.0).await? else {
        return Ok(None);
    };
    if !has_role_or_admin(ctx.conn(), event.id, user, Role::Organizer).await? {
        return Ok(None);
    }
    Ok(Some(FeeLock {
        locked: fees_locked(ctx, &event).await?,
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListArgs {
    include_past: Option<bool>,
}

fn time_condition(include_past: Option<bool>) -> &'static str {
    if include_past == Some(true) {
        "true"
    } else {
        "e.end_date >= now()"
    }
}

/// Events the current user organizes or helps with; in a self-hosted instance admins
/// run every bazaar.
async fn get_my_events(ctx: &mut Ctx, args: ListArgs) -> AppResult<Vec<EventView>> {
    let user = ctx.require_user()?;
    ctx.read(Topic::User(user));
    ctx.read(Topic::Events);
    let time = time_condition(args.include_past);
    let events = if ctx.state.config.mode == InstanceMode::Single
        && is_platform_admin(ctx.conn(), Some(user)).await?
    {
        docs::events_where(ctx.conn(), &format!("{time} AND $1"), true).await?
    } else {
        docs::events_where(
            ctx.conn(),
            &format!(
                "{time} AND e.id IN (SELECT event_id FROM event_roles
                                     WHERE user_id = $1 AND role IN ('organizer', 'coorganizer'))"
            ),
            user,
        )
        .await?
    };
    Ok(events.into_iter().map(|event| view(event, true)).collect())
}

/// All events the viewer may see: public approved ones; signed in also the others
/// (logged-in, approved); admins everything.
async fn get(ctx: &mut Ctx, args: ListArgs) -> AppResult<Vec<EventView>> {
    ctx.read(Topic::Events);
    let time = time_condition(args.include_past);
    let viewer = ctx.user;
    let admin = is_platform_admin(ctx.conn(), viewer).await?;
    let events = docs::events_where(ctx.conn(), &format!("{time} AND $1"), true).await?;
    let signed_in = ctx.user.is_some();
    Ok(events
        .into_iter()
        .filter(|event| {
            admin
                || (event.moderation.is_none()
                    && if signed_in {
                        event.visibility != "public" || is_event_approved(event)
                    } else {
                        event.visibility == "public" && is_event_approved(event)
                    })
        })
        .map(|event| view(event, admin))
        .collect())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminEvent {
    #[serde(flatten)]
    event: EventView,
    organizer_name: Option<String>,
    organizer_email: Option<String>,
}

/// Name and address of an organizer; a deleted account is shown as such.
const DELETED_AWARE_ORGANIZER: &str =
    "SELECT CASE WHEN anonymized_at IS NULL THEN name ELSE 'Gelöschtes Konto' END, email
     FROM users WHERE id = $1";

async fn with_organizers(ctx: &mut Ctx, events: Vec<Event>) -> AppResult<Vec<AdminEvent>> {
    let mut result = Vec::new();
    for mut event in events {
        let organizer: Option<(Option<String>, Option<String>)> =
            sqlx::query_as(DELETED_AWARE_ORGANIZER)
                .bind(event.organizer_id)
                .fetch_optional(ctx.conn())
                .await?;
        let (organizer_name, organizer_email) = organizer.unwrap_or_default();
        // The admin list shows the effective state, also for events from before approvals
        let approved = is_event_approved(&event);
        event.is_approved = Some(approved);
        if event.approval_status.is_none() {
            event.approval_status = Some(if approved { "approved" } else { "pending" }.to_owned());
        }
        result.push(AdminEvent {
            event: view(event, true),
            organizer_name,
            organizer_email,
        });
    }
    Ok(result)
}

async fn get_public_events_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminEvent>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Events);
    let events =
        docs::events_where(ctx.conn(), "e.visibility = $1::event_visibility", "public").await?;
    // Unlike getEventsForAdmin, these are returned unchanged
    let mut result = Vec::new();
    for event in events {
        let organizer: Option<(Option<String>, Option<String>)> =
            sqlx::query_as(DELETED_AWARE_ORGANIZER)
                .bind(event.organizer_id)
                .fetch_optional(ctx.conn())
                .await?;
        let (organizer_name, organizer_email) = organizer.unwrap_or_default();
        result.push(AdminEvent {
            event: view(event, true),
            organizer_name,
            organizer_email,
        });
    }
    Ok(result)
}

async fn get_events_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminEvent>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Events);
    let events = docs::events_where(ctx.conn(), "$1", true).await?;
    with_organizers(ctx, events).await
}

async fn approve_event_for_admin(ctx: &mut Ctx, args: EventArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let event = load(ctx, args.event_id.0).await?;
    sqlx::query(
        "UPDATE events SET is_approved = true, approval_status = 'approved', approved_at = now(),
           approved_by = $2, rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
         WHERE id = $1",
    )
    .bind(event.id)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    log_review(ctx, admin, &event, "approveEvent", None).await?;
    touch_event(ctx, event.id);
    Ok(())
}

async fn log_review(
    ctx: &mut Ctx,
    admin: Uuid,
    event: &Event,
    action: &str,
    reason: Option<&str>,
) -> sqlx::Result<()> {
    log_action(
        ctx,
        LogEntry {
            admin,
            action,
            target_type: "event",
            target_id: event.id,
            target_label: &event.title,
            reason,
            report: None,
        },
    )
    .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RejectArgs {
    event_id: Id,
    reason: String,
}

async fn reject_event_for_admin(ctx: &mut Ctx, args: RejectArgs) -> AppResult<()> {
    let admin = require_admin(ctx).await?;
    let event = load(ctx, args.event_id.0).await?;
    let reason = args.reason.trim().to_owned();
    if reason.is_empty() {
        return Err(AppError::bad_request("event.rejectionReasonRequired"));
    }
    sqlx::query(
        "UPDATE events SET is_approved = false, approval_status = 'rejected', approved_at = NULL,
           approved_by = NULL, rejected_at = now(), rejected_by = $2, rejection_reason = $3
         WHERE id = $1",
    )
    .bind(event.id)
    .bind(admin)
    .bind(&reason)
    .execute(ctx.conn())
    .await?;
    log_review(ctx, admin, &event, "rejectEvent", Some(&reason)).await?;
    let title = event.title.clone();
    let path = format!("/events/view/{}/settings", event.id);
    notifications::notify_user(
        ctx,
        event.organizer_id,
        |t: T| Content {
            subject: t.t("event.rejected.subject", &[("title", &title)]),
            heading: t.t("event.rejected.heading", &[]),
            paragraphs: vec![
                t.t("event.rejected.text", &[]),
                t.t("moderation.reason", &[("reason", &reason)]),
                t.t("event.rejected.resubmit", &[]),
            ],
            link: t.link("event.rejected.link", path.clone()),
            ..Content::default()
        },
        Some(Area::Events),
        Duration::zero(),
    )
    .await?;
    touch_event(ctx, event.id);
    Ok(())
}

async fn notify_admins_about_pending_event(
    ctx: &mut Ctx,
    event: Uuid,
    triggered_by: Uuid,
) -> sqlx::Result<()> {
    crate::jobs::enqueue(
        ctx.conn(),
        PENDING_JOB,
        &json!({ "eventId": event, "triggeredBy": triggered_by }),
        Utc::now(),
    )
    .await?;
    Ok(())
}

async fn request_event_review_for_organizer(ctx: &mut Ctx, args: EventArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    if !has_role_or_admin(ctx.conn(), args.event_id.0, user, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let event = load(ctx, args.event_id.0).await?;
    if event.visibility != "public" {
        return Err(AppError::bad_request("event.notPublic"));
    }
    sqlx::query(
        "UPDATE events SET is_approved = false, approval_status = 'pending', approved_at = NULL,
           approved_by = NULL, rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
         WHERE id = $1",
    )
    .bind(event.id)
    .execute(ctx.conn())
    .await?;
    if event.approval_status.as_deref() != Some("pending") {
        notify_admins_about_pending_event(ctx, event.id, user).await?;
    }
    touch_event(ctx, event.id);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventDetails {
    #[serde(flatten)]
    pub event: EventView,
    pub cover_image_url: Option<String>,
    pub event_map_image_url: Option<String>,
    pub category_labels: Vec<String>,
}

async fn details(ctx: &mut Ctx, event: Event, show_access_code: bool) -> AppResult<EventDetails> {
    ctx.read(Topic::Table("categories"));
    let config = ctx.state.config.clone();
    let labels: Vec<String> = sqlx::query_scalar(
        "SELECT c.label FROM event_categories ec JOIN categories c ON c.id = ec.category_id
         WHERE ec.event_id = $1 ORDER BY ec.position",
    )
    .bind(event.id)
    .fetch_all(ctx.conn())
    .await?;
    Ok(EventDetails {
        cover_image_url: event.cover_image.map(|id| storage::url(&config, id)),
        event_map_image_url: event.event_map_image.map(|id| storage::url(&config, id)),
        category_labels: labels,
        event: view(event, show_access_code),
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdArgs {
    id: Id,
}

/// One event with image URLs and category labels, if the viewer may see it: public
/// approved events everybody; blocked ones only the team; unapproved public ones the
/// team and its sellers.
async fn get_event(ctx: &mut Ctx, args: IdArgs) -> AppResult<Option<EventDetails>> {
    ctx.read(Topic::Event(args.id.0));
    let Some(event) = docs::event(ctx.conn(), args.id.0).await? else {
        return Ok(None);
    };
    let Some(user) = ctx.user else {
        if event.visibility != "public" || !is_event_approved(&event) || event.moderation.is_some()
        {
            return Ok(None);
        }
        return Ok(Some(details(ctx, event, false).await?));
    };
    ctx.read(Topic::User(user));
    let team = has_any_role_or_admin(ctx.conn(), event.id, user, &TEAM).await?;
    if event.moderation.is_some() && !team {
        return Ok(None);
    }
    let admin = is_platform_admin(ctx.conn(), Some(user)).await?;
    if !admin
        && event.visibility == "public"
        && !is_event_approved(&event)
        && !team
        && !event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await?
    {
        return Ok(None);
    }
    Ok(Some(details(ctx, event, team).await?))
}

async fn get_public_event_for_viewer(
    ctx: &mut Ctx,
    args: IdArgs,
) -> AppResult<Option<EventDetails>> {
    ctx.read(Topic::Event(args.id.0));
    let Some(event) = docs::event(ctx.conn(), args.id.0).await? else {
        return Ok(None);
    };
    if event.visibility != "public" {
        return Ok(None);
    }
    let approved = is_event_approved(&event) && event.moderation.is_none();
    if !approved {
        let Some(user) = ctx.user else {
            return Ok(None);
        };
        if event.organizer_id != user && !is_platform_admin(ctx.conn(), Some(user)).await? {
            return Ok(None);
        }
    }
    let show = sees_access_code(ctx, event.id).await?;
    Ok(Some(details(ctx, event, show).await?))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct IdsArgs {
    ids: Vec<Id>,
}

async fn get_events(ctx: &mut Ctx, args: IdsArgs) -> AppResult<Vec<EventView>> {
    let mut result = Vec::new();
    for id in args.ids {
        ctx.read(Topic::Event(id.0));
        if let Some(event) = docs::event(ctx.conn(), id.0).await? {
            let show = sees_access_code(ctx, event.id).await?;
            result.push(view(event, show));
        }
    }
    Ok(result)
}

/// eventFeaturesValidator
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FeaturesArgs {
    discounts: Option<bool>,
    discount_starts_at: Option<f64>,
    max_discount_percent: Option<f64>,
    price_offers: Option<bool>,
    minimum_price: Option<bool>,
    questions: Option<bool>,
    questions_during_event_only: Option<bool>,
    photos_optional: Option<bool>,
    #[serde(default, with = "serde_with::rust::double_option")]
    required_fields: Option<Option<Vec<String>>>,
    max_items_per_seller: Option<f64>,
    label_format: Option<String>,
    price_on_label: Option<bool>,
    intake_fee: Option<f64>,
    private_sellers_only: Option<bool>,
    fixed_seller_data: Option<bool>,
}

fn sanitize_item_limit(limit: Option<f64>) -> AppResult<Option<f64>> {
    match limit {
        None => Ok(None),
        Some(limit) if limit.is_nan() => Ok(None),
        Some(limit) if limit.fract() != 0.0 || !(1.0..=10_000.0).contains(&limit) => {
            Err(AppError::bad_request("event.itemLimitInvalid"))
        }
        Some(limit) => Ok(Some(limit)),
    }
}

fn sanitize_intake_fee(fee: Option<f64>) -> AppResult<Option<f64>> {
    match fee {
        None => Ok(None),
        Some(fee) if fee.is_nan() || fee == 0.0 => Ok(None),
        Some(fee) if !fee.is_finite() || !(0.0..=100.0).contains(&fee) => {
            Err(AppError::bad_request("event.intakeFeeRange"))
        }
        Some(fee) => Ok(Some((fee * 100.0).round() / 100.0)),
    }
}

/// Validates the organizer's choice. `previous`: the stored features; switches an older
/// client does not send keep their value.
fn sanitize_features(features: FeaturesArgs, previous: Option<&Value>) -> AppResult<Value> {
    let max = features.max_discount_percent;
    if let Some(max) = max
        && (!max.is_finite() || !(1.0..=MAX_DISCOUNT_PERCENT as f64).contains(&max))
    {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "event.maxDiscountRange",
            &[("max", &MAX_DISCOUNT_PERCENT.to_string())],
        ));
    }
    if let Some(format) = &features.label_format
        && !LABEL_FORMATS.contains(&format.as_str())
    {
        return Err(invalid("labelFormat"));
    }
    let previous_bool = |key: &str| previous.and_then(|p| p.get(key)).and_then(Value::as_bool);
    let required_fields: Option<Vec<String>> = match features.required_fields {
        Some(fields) => fields,
        None => previous
            .and_then(|p| p.get("requiredFields"))
            .and_then(|v| serde_json::from_value(v.clone()).ok()),
    };
    let known: Vec<&'static str> = requirable_fields().iter().map(|f| f.key).collect();
    let required_fields: Vec<String> = required_fields
        .unwrap_or_default()
        .into_iter()
        .filter(|key| known.contains(&key.as_str()))
        .fold(Vec::new(), |mut keys, key| {
            if !keys.contains(&key) {
                keys.push(key);
            }
            keys
        });
    let discounts = features.discounts.unwrap_or(true);
    let mut stored = Map::new();
    let mut put = |key: &str, value: Value| {
        if !value.is_null() {
            stored.insert(key.to_owned(), value);
        }
    };
    put("discounts", json!(discounts));
    put(
        "discountStartsAt",
        json!(if discounts {
            features.discount_starts_at
        } else {
            None
        }),
    );
    put("maxDiscountPercent", json!(max.map(f64::round)));
    put("priceOffers", json!(features.price_offers.unwrap_or(false)));
    put(
        "minimumPrice",
        json!(features.minimum_price.unwrap_or(false)),
    );
    put("questions", json!(features.questions.unwrap_or(false)));
    put(
        "questionsDuringEventOnly",
        json!(
            features
                .questions_during_event_only
                .or(previous_bool("questionsDuringEventOnly"))
                .unwrap_or(false)
        ),
    );
    put(
        "photosOptional",
        json!(features.photos_optional.unwrap_or(false)),
    );
    put(
        "requiredFields",
        if required_fields.is_empty() {
            Value::Null
        } else {
            json!(required_fields)
        },
    );
    put(
        "maxItemsPerSeller",
        json!(sanitize_item_limit(features.max_items_per_seller)?),
    );
    put(
        "labelFormat",
        json!(
            features
                .label_format
                .unwrap_or_else(|| "standard".to_owned())
        ),
    );
    put(
        "priceOnLabel",
        json!(features.price_on_label.unwrap_or(false)),
    );
    put(
        "intakeFee",
        json!(sanitize_intake_fee(features.intake_fee)?),
    );
    put(
        "privateSellersOnly",
        json!(
            features
                .private_sellers_only
                .or(previous_bool("privateSellersOnly"))
                .unwrap_or(false)
        ),
    );
    put(
        "fixedSellerData",
        json!(
            features
                .fixed_seller_data
                .or(previous_bool("fixedSellerData"))
                .unwrap_or(false)
        ),
    );
    Ok(Value::Object(stored))
}

/// sellerLogisticsValidator
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LogisticsArgs {
    dropoff_start: Option<f64>,
    dropoff_end: Option<f64>,
    pickup_start: Option<f64>,
    pickup_end: Option<f64>,
    note: Option<String>,
}

#[derive(Debug)]
struct Logistics {
    dropoff_start: Option<DateTime<Utc>>,
    dropoff_end: Option<DateTime<Utc>>,
    pickup_start: Option<DateTime<Utc>>,
    pickup_end: Option<DateTime<Utc>>,
    note: Option<String>,
}

/// Checks the hand-in and pickup times; empty fields are dropped.
fn sanitize_logistics(args: LogisticsArgs) -> AppResult<Logistics> {
    for (label, start, end) in [
        ("Abgabe", args.dropoff_start, args.dropoff_end),
        ("Abholung", args.pickup_start, args.pickup_end),
    ] {
        if end.is_some() && start.is_none() {
            return Err(AppError::coded(
                StatusCode::BAD_REQUEST,
                "event.startMissing",
                &[("label", label)],
            ));
        }
        if let (Some(start), Some(end)) = (start, end)
            && end <= start
        {
            return Err(AppError::coded(
                StatusCode::BAD_REQUEST,
                "event.endBeforeStart",
                &[("label", label)],
            ));
        }
    }
    let note = args
        .note
        .map(|note| note.trim().to_owned())
        .filter(|note| !note.is_empty());
    if note
        .as_ref()
        .is_some_and(|note| note.chars().count() > MAX_SELLER_NOTE)
    {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "event.sellerNoteTooLong",
            &[("max", &MAX_SELLER_NOTE.to_string())],
        ));
    }
    let time = |ms: Option<f64>| ms.and_then(from_ms);
    Ok(Logistics {
        dropoff_start: time(args.dropoff_start),
        dropoff_end: time(args.dropoff_end),
        pickup_start: time(args.pickup_start),
        pickup_end: time(args.pickup_end),
        note,
    })
}

fn time_arg(ms: f64, field: &str) -> AppResult<DateTime<Utc>> {
    from_ms(ms).ok_or_else(|| invalid(field))
}

fn money(value: f64, field: &str) -> AppResult<Decimal> {
    Decimal::from_f64(value)
        .map(|v| v.cents())
        .ok_or_else(|| invalid(field))
}

fn check_lists(services: &[String], visibility: &str) -> AppResult<()> {
    if let Some(service) = services.iter().find(|s| !SERVICES.contains(&s.as_str())) {
        return Err(invalid(&format!("services: {service}")));
    }
    if !VISIBILITIES.contains(&visibility) {
        return Err(invalid("visibility"));
    }
    Ok(())
}

async fn check_files(ctx: &mut Ctx, files: &[Option<Id>]) -> AppResult<()> {
    for id in files.iter().flatten() {
        storage::ensure_exists(ctx.conn(), id.0).await?;
    }
    Ok(())
}

async fn set_categories(ctx: &mut Ctx, event: Uuid, categories: &[Id]) -> AppResult<()> {
    sqlx::query("DELETE FROM event_categories WHERE event_id = $1")
        .bind(event)
        .execute(ctx.conn())
        .await?;
    let mut position = 0i16;
    for category in categories {
        let exists: bool =
            sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM categories WHERE id = $1)")
                .bind(category.0)
                .fetch_one(ctx.conn())
                .await?;
        if !exists {
            return Err(invalid("categories"));
        }
        let inserted = sqlx::query(
            "INSERT INTO event_categories (event_id, position, category_id) VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING",
        )
        .bind(event)
        .bind(position)
        .bind(category.0)
        .execute(ctx.conn())
        .await?;
        position += inserted.rows_affected() as i16;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateArgs {
    title: String,
    description: String,
    cover_image: Option<Id>,
    event_map_image: Option<Id>,
    location: String,
    start_date: f64,
    end_date: f64,
    contact_info: String,
    categories: Vec<Id>,
    services: Vec<String>,
    visibility: String,
    access_code: Option<String>,
    vendor_limit: Option<f64>,
    commission: f64,
    features: Option<FeaturesArgs>,
    seller_logistics: Option<LogisticsArgs>,
}

/// Creates an event with the creator as organizer. Public events on the platform wait for
/// approval; in a self-hosted instance only admins create events, without approval.
async fn create_event(ctx: &mut Ctx, args: CreateArgs) -> AppResult<Uuid> {
    if !flags::get(ctx.conn(), "is_event_creation_enabled", true).await? {
        return Err(AppError::forbidden("feature.eventCreationDisabled"));
    }
    let user = ctx.require_user()?;
    let single = ctx.state.config.mode == InstanceMode::Single;
    if single && !is_platform_admin(ctx.conn(), Some(user)).await? {
        return Err(AppError::forbidden("auth.adminOnlyEvents"));
    }
    check_lists(&args.services, &args.visibility)?;
    check_files(ctx, &[args.cover_image, args.event_map_image]).await?;
    let public = args.visibility == "public" && !single;
    let features = args
        .features
        .map(|f| sanitize_features(f, None))
        .transpose()?;
    let logistics = args.seller_logistics.map(sanitize_logistics).transpose()?;
    let logistics = logistics.as_ref();
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO events (title, description, cover_image_id, map_image_id, location, start_date,
           end_date, contact_info, services, visibility, is_approved, approval_status, access_code,
           vendor_limit, commission, features, dropoff_start, dropoff_end, pickup_start, pickup_end,
           logistics_note, organizer_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::event_service[], $10::event_visibility, $11,
           $12::approval_status, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
         RETURNING id",
    )
    .bind(&args.title)
    .bind(&args.description)
    .bind(args.cover_image.map(|id| id.0))
    .bind(args.event_map_image.map(|id| id.0))
    .bind(&args.location)
    .bind(time_arg(args.start_date, "startDate")?)
    .bind(time_arg(args.end_date, "endDate")?)
    .bind(&args.contact_info)
    .bind(&args.services)
    .bind(&args.visibility)
    .bind(!public)
    .bind(if public { "pending" } else { "approved" })
    .bind(&args.access_code)
    .bind(args.vendor_limit.map(|limit| limit as i32))
    .bind(money(args.commission, "commission")?)
    .bind(features.unwrap_or_else(|| json!({})))
    .bind(logistics.and_then(|l| l.dropoff_start))
    .bind(logistics.and_then(|l| l.dropoff_end))
    .bind(logistics.and_then(|l| l.pickup_start))
    .bind(logistics.and_then(|l| l.pickup_end))
    .bind(logistics.and_then(|l| l.note.clone()))
    .bind(user)
    .fetch_one(ctx.conn())
    .await?;
    set_categories(ctx, id, &args.categories).await?;
    event_roles::add_role(ctx, id, user, Role::Organizer).await?;
    if public {
        notify_admins_about_pending_event(ctx, id, user).await?;
    }
    touch_event(ctx, id);
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EditArgs {
    id: Id,
    title: String,
    description: String,
    cover_image: Option<Id>,
    event_map_image: Option<Id>,
    location: String,
    start_date: f64,
    end_date: f64,
    categories: Vec<Id>,
    contact_info: String,
    commission: f64,
    services: Vec<String>,
    visibility: String,
    access_code: Option<String>,
    vendor_limit: Option<f64>,
    clear_cover_image: Option<bool>,
    clear_event_map_image: Option<bool>,
    features: Option<FeaturesArgs>,
    seller_logistics: Option<LogisticsArgs>,
}

/// Edits an event (organizer only). A running event keeps its dates, commission and
/// visibility; once sellers registered, fees only go down and the item limit only up.
async fn edit_event(ctx: &mut Ctx, args: EditArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let event = load(ctx, args.id.0).await?;
    let now = Utc::now();
    if event.end_date < now {
        return Err(AppError::bad_request("event.pastNoEdit"));
    }
    if !has_role_or_admin(ctx.conn(), event.id, user, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    check_lists(&args.services, &args.visibility)?;
    check_files(ctx, &[args.cover_image, args.event_map_image]).await?;
    let mut start = time_arg(args.start_date, "startDate")?;
    let mut end = time_arg(args.end_date, "endDate")?;
    let commission = money(args.commission, "commission")?;
    let running = event.start_date <= now && now <= event.end_date;
    if running {
        // datetime-local inputs drop seconds, so an unchanged date may differ slightly
        let changed =
            |a: DateTime<Utc>, b: DateTime<Utc>| (a - b).num_milliseconds().abs() >= 60_000;
        if changed(start, event.start_date) || changed(end, event.end_date) {
            return Err(AppError::bad_request("event.runningNoDate"));
        }
        if args.visibility != event.visibility {
            return Err(AppError::bad_request("event.runningNoVisibility"));
        }
        start = event.start_date;
        end = event.end_date;
    }
    let features = match args.features {
        Some(features) => sanitize_features(features, event.features.as_ref())?,
        None => event.features.clone().unwrap_or_else(|| json!({})),
    };
    if fees_locked(ctx, &event).await? {
        let fee = |features: Option<&Value>| {
            features
                .and_then(|f| f.get("intakeFee"))
                .and_then(Value::as_f64)
                .unwrap_or(0.0)
        };
        let (old_fee, new_fee) = (fee(event.features.as_ref()), fee(Some(&features)));
        if running {
            if commission != event.commission || new_fee != old_fee {
                return Err(AppError::bad_request("event.runningNoFees"));
            }
        } else if commission > event.commission || new_fee > old_fee {
            return Err(AppError::bad_request("event.feesOnlyLower"));
        }
        let limit = |features: Option<&Value>| {
            features
                .and_then(|f| f.get("maxItemsPerSeller"))
                .and_then(Value::as_f64)
                .unwrap_or(f64::INFINITY)
        };
        if limit(Some(&features)) < limit(event.features.as_ref()) {
            return Err(AppError::bad_request("event.limitOnlyHigher"));
        }
    }
    let making_public = event.visibility != "public"
        && args.visibility == "public"
        && ctx.state.config.mode != InstanceMode::Single;
    let logistics = args.seller_logistics.map(sanitize_logistics).transpose()?;
    let keep_logistics = logistics.is_none();
    let logistics = logistics.as_ref();
    sqlx::query(
        "UPDATE events SET title = $2, description = $3,
           cover_image_id = CASE WHEN $4 THEN NULL ELSE COALESCE($5, cover_image_id) END,
           map_image_id = CASE WHEN $6 THEN NULL ELSE COALESCE($7, map_image_id) END,
           location = $8, start_date = $9, end_date = $10, contact_info = $11, commission = $12,
           services = $13::event_service[], visibility = $14::event_visibility,
           access_code = CASE WHEN $15 THEN $16 ELSE access_code END,
           vendor_limit = CASE WHEN $17 THEN $18 ELSE vendor_limit END,
           features = $19,
           dropoff_start = CASE WHEN $20 THEN dropoff_start ELSE $21 END,
           dropoff_end = CASE WHEN $20 THEN dropoff_end ELSE $22 END,
           pickup_start = CASE WHEN $20 THEN pickup_start ELSE $23 END,
           pickup_end = CASE WHEN $20 THEN pickup_end ELSE $24 END,
           logistics_note = CASE WHEN $20 THEN logistics_note ELSE $25 END,
           is_approved = CASE WHEN $26 THEN false ELSE is_approved END,
           approval_status = CASE WHEN $26 THEN 'pending' ELSE approval_status END
         WHERE id = $1",
    )
    .bind(event.id)
    .bind(&args.title)
    .bind(&args.description)
    .bind(args.clear_cover_image == Some(true))
    .bind(args.cover_image.map(|id| id.0))
    .bind(args.clear_event_map_image == Some(true))
    .bind(args.event_map_image.map(|id| id.0))
    .bind(&args.location)
    .bind(start)
    .bind(end)
    .bind(&args.contact_info)
    .bind(commission)
    .bind(&args.services)
    .bind(&args.visibility)
    .bind(args.access_code.is_some())
    .bind(&args.access_code)
    .bind(args.vendor_limit.is_some())
    .bind(args.vendor_limit.map(|limit| limit as i32))
    .bind(features)
    .bind(keep_logistics)
    .bind(logistics.and_then(|l| l.dropoff_start))
    .bind(logistics.and_then(|l| l.dropoff_end))
    .bind(logistics.and_then(|l| l.pickup_start))
    .bind(logistics.and_then(|l| l.pickup_end))
    .bind(logistics.and_then(|l| l.note.clone()))
    .bind(making_public)
    .execute(ctx.conn())
    .await?;
    set_categories(ctx, event.id, &args.categories).await?;
    if making_public {
        notify_admins_about_pending_event(ctx, event.id, user).await?;
    }
    touch_event(ctx, event.id);
    Ok(())
}

/// Deletes an upcoming or running event (organizer only); not when it has sales.
async fn delete_event(ctx: &mut Ctx, args: IdArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let event = load(ctx, args.id.0).await?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("event.pastNoDelete"));
    }
    if !has_role_or_admin(ctx.conn(), event.id, user, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let has_sales: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM purchases WHERE event_id = $1)")
            .bind(event.id)
            .fetch_one(ctx.conn())
            .await?;
    if has_sales {
        return Err(AppError::coded(
            StatusCode::CONFLICT,
            "EVENT_HAS_SALES",
            &[],
        ));
    }
    // Items, roles, sellers, messages and offers of the event go with it (foreign keys)
    sqlx::query("DELETE FROM events WHERE id = $1")
        .bind(event.id)
        .execute(ctx.conn())
        .await?;
    touch_event(ctx, event.id);
    Ok(())
}

/// Events the current user sells at.
async fn get_my_registered_events(ctx: &mut Ctx, args: ListArgs) -> AppResult<Vec<EventView>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(user));
    ctx.read(Topic::Events);
    let time = time_condition(args.include_past);
    let events = docs::events_where(
        ctx.conn(),
        &format!("{time} AND e.id IN (SELECT event_id FROM event_roles WHERE user_id = $1 AND role = 'seller')"),
        user,
    )
    .await?;
    let mut result = Vec::new();
    for event in events {
        let show = has_any_role_or_admin(ctx.conn(), event.id, user, &TEAM).await?;
        result.push(view(event, show));
    }
    Ok(result)
}

/// A seller leaves the event: not after it, not when paid out or with items already
/// handed in. Announced items are taken out.
async fn leave_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let event = load(ctx, args.event_id.0).await?;
    if event.end_date < Utc::now() {
        return Err(AppError::bad_request("leave.past"));
    }
    let seller = docs::event_seller(ctx.conn(), event.id, user).await?;
    if seller.as_ref().is_some_and(|s| s.payout_received) {
        return Err(AppError::bad_request("leave.paidOut"));
    }
    let handed_in: bool = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                        WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status IN {})",
        sales::ACCEPTED_STATUSES
    )))
    .bind(event.id)
    .bind(user)
    .fetch_one(ctx.conn())
    .await?;
    if handed_in {
        return Err(AppError::bad_request("leave.itemsHandledIn"));
    }
    let products: Vec<Uuid> = sqlx::query_scalar(
        "DELETE FROM event_products ep USING products p
         WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2
         RETURNING ep.product_id",
    )
    .bind(event.id)
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for product in products {
        ctx.touch(Topic::Product(product));
    }
    if let Some(seller) = seller {
        sqlx::query("DELETE FROM event_sellers WHERE id = $1")
            .bind(seller.id)
            .execute(ctx.conn())
            .await?;
    }
    event_roles::remove_role(ctx, event.id, user, Role::Seller).await?;
    Ok(())
}

async fn get_my_product_count_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<i64> {
    let Some(user) = ctx.user else { return Ok(0) };
    ctx.read(Topic::Event(args.event_id.0));
    ctx.read(Topic::User(user));
    Ok(sqlx::query_scalar(
        "SELECT count(*) FROM event_products ep JOIN products p ON p.id = ep.product_id
         WHERE ep.event_id = $1 AND p.vendor_id = $2",
    )
    .bind(args.event_id.0)
    .bind(user)
    .fetch_one(ctx.conn())
    .await?)
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SellerToCollect {
    name: String,
    seller_number: Option<i32>,
    amount: Decimal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FinancialSummary {
    total_gross_revenue: Decimal,
    total_net_revenue: Decimal,
    total_discounts: Decimal,
    total_commission: Decimal,
    total_payout_soll: Decimal,
    total_paid_out: Decimal,
    total_pending_payout: Decimal,
    total_intake_fees: Decimal,
    total_fees_collected: Decimal,
    total_fees_to_collect: Decimal,
    sellers_to_collect: Vec<SellerToCollect>,
    cash_in_hand_soll: Decimal,
    sales_count: usize,
    vendors_paid_count: usize,
    vendors_total_count: usize,
}

/// The cash summary of an event (Kassensturz), for the event team.
async fn get_event_financial_summary(
    ctx: &mut Ctx,
    args: EventArgs,
) -> AppResult<FinancialSummary> {
    let event = args.event_id.0;
    require_team(ctx, event).await?;
    ctx.read(Topic::Event(event));
    let purchases = docs::purchases_where(ctx.conn(), "event_id = $1", event).await?;
    let gross: Decimal = purchases.iter().map(sales::list_price).sum();
    let net: Decimal = purchases.iter().map(|p| p.total_amount).sum();
    let commission: Decimal = purchases.iter().map(|p| p.commission_amount).sum();
    let payout_soll: Decimal = purchases.iter().map(|p| p.payout_amount).sum();

    let vendors = load_vendors_with_calculations(ctx, event).await?;
    // A seller whose sales do not cover the intake fee pays in instead of getting paid out
    let owes = |payout: Decimal| payout < Decimal::new(-5, 3);
    let sum = |paid: bool, owing: bool| -> Decimal {
        vendors
            .iter()
            .filter(|v| v.paid == paid && owes(v.payout) == owing)
            .map(|v| v.payout)
            .sum()
    };
    let paid_out = sum(true, false);
    let fees_collected = -sum(true, true);
    let pending = sum(false, false);
    let mut to_collect: Vec<SellerToCollect> = vendors
        .iter()
        .filter(|v| !v.paid && owes(v.payout))
        .map(|v| SellerToCollect {
            name: v
                .user
                .name
                .clone()
                .unwrap_or_else(|| "Verkäufer".to_owned()),
            seller_number: v.seller_number,
            amount: -v.payout,
        })
        .collect();
    to_collect.sort_by_key(|s| s.seller_number.unwrap_or(i32::MAX));
    Ok(FinancialSummary {
        total_gross_revenue: gross,
        total_net_revenue: net,
        total_discounts: gross - net,
        total_commission: commission,
        total_payout_soll: payout_soll,
        total_paid_out: paid_out,
        total_pending_payout: pending,
        total_intake_fees: vendors.iter().map(|v| v.intake_fee.total).sum(),
        total_fees_collected: fees_collected,
        total_fees_to_collect: to_collect.iter().map(|s| s.amount).sum(),
        sellers_to_collect: to_collect,
        cash_in_hand_soll: net - paid_out + fees_collected,
        sales_count: purchases.len(),
        vendors_paid_count: vendors.iter().filter(|v| v.paid).count(),
        vendors_total_count: vendors.len(),
    })
}

/// Public events waiting for approval; 0 for everyone but administrators.
async fn count_pending_approvals(ctx: &mut Ctx, _: NoArgs) -> AppResult<i64> {
    let viewer = ctx.user;
    if !is_platform_admin(ctx.conn(), viewer).await? {
        return Ok(0);
    }
    ctx.read(Topic::Events);
    Ok(sqlx::query_scalar(
        "SELECT count(*) FROM events WHERE visibility = 'public' AND approval_status = 'pending'",
    )
    .fetch_one(ctx.conn())
    .await?)
}

/// Job: emails all active administrators (except who triggered it) that a public event
/// waits for approval. Nothing if it is no longer pending.
pub fn notify_admins_event_pending(
    state: AppState,
    payload: Value,
) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let event_id: Uuid = serde_json::from_value(payload["eventId"].clone())?;
        let triggered_by: Uuid = serde_json::from_value(payload["triggeredBy"].clone())?;
        let mut conn = state.db.acquire().await?;
        if flags::get(&mut conn, flags::E2E_AUTH_SKIP_EMAIL, false).await? {
            return Ok(());
        }
        let Some(event) = docs::event(&mut conn, event_id).await? else {
            return Ok(());
        };
        if event.visibility != "public" || event.approval_status.as_deref() != Some("pending") {
            return Ok(());
        }
        let organizer = docs::user(&mut conn, event.organizer_id).await?;
        let organizer_name = organizer
            .as_ref()
            .map(|o| {
                let full = [o.first_name.clone(), o.last_name.clone()]
                    .into_iter()
                    .flatten()
                    .filter(|p| !p.is_empty())
                    .collect::<Vec<_>>()
                    .join(" ");
                if full.is_empty() {
                    o.name.clone().or_else(|| o.email.clone()).unwrap_or_default()
                } else {
                    full
                }
            })
            .filter(|name| !name.is_empty())
            .unwrap_or_else(|| "Unbekannt".to_owned());
        let mut recipients = Vec::new();
        for admin in active_admins(&mut conn).await? {
            if admin == triggered_by {
                continue;
            }
            if let Some(user) = docs::user(&mut conn, admin).await?
                && user.status.as_deref() != Some("inactive")
                && let Some(email) = user.email
            {
                let locale = user.locale.as_deref().and_then(Locale::parse).unwrap_or_default();
                recipients.push((email, locale));
            }
        }
        drop(conn);
        let brand = mail::Brand {
            name: "BazarPro".to_owned(),
            logo_url: None,
            is_instance: false,
        };
        for (to, locale) in recipients {
            let t = |key: &str, values: &[(&str, &str)]| mail::escape_html(&mail_text(locale, key, values));
            let start = super::berlin_time::format_date(event.start_date, locale);
            let end = super::berlin_time::format_date(event.end_date, locale);
            let date = if start == end { start } else { format!("{start} – {end}") };
            let row = |label: &str, value: &str, bold: bool| {
                format!(
                    r#"<tr><td style="padding: 4px 12px 4px 0; color: #6b7280;">{}</td><td style="padding: 4px 0;{} color: #111827;">{}</td></tr>"#,
                    t(label, &[]),
                    if bold { " font-weight: 600;" } else { "" },
                    mail::escape_html(value)
                )
            };
            let content = format!(
                r#"
            <h1>{}</h1>
            <p>{}</p>
            <table style="margin: 0 auto 8px; text-align: left; border-collapse: collapse;">
              {}
              {}
              {}
            </table>
            <a href="{}/admin/events" class="button">{}</a>
            <p class="expiry">{}</p>
    "#,
                t("pending.heading", &[]),
                t("pending.text", &[("name", &organizer_name)]),
                row("pending.bazaar", &event.title, true),
                row("pending.date", &date, false),
                row("pending.location", &event.location, false),
                state.config.site_url,
                t("pending.button", &[]),
                t("pending.footnote", &[]),
            );
            let mail = mail::Mail {
                to: to.clone(),
                subject: mail_text(locale, "pending.subject", &[("title", &event.title)]),
                html: mail::layout(&content, &brand, locale),
                sender_name: None,
                list_unsubscribe: None,
            };
            // One unreachable admin must not keep the others from being notified
            if let Err(err) = state.mailer.send(mail).await {
                tracing::error!(error = ?err, to, event = %event_id, "could not notify admin about pending event");
            }
        }
        Ok(())
    }
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn features_are_sanitized() {
        let stored = sanitize_features(
            FeaturesArgs {
                discounts: Some(false),
                discount_starts_at: Some(1.0),
                required_fields: Some(Some(vec![
                    "frameNumber".into(),
                    "unknown".into(),
                    "frameNumber".into(),
                ])),
                intake_fee: Some(0.555),
                ..FeaturesArgs::default()
            },
            Some(&json!({ "fixedSellerData": true })),
        )
        .unwrap();
        assert_eq!(stored["discounts"], false);
        assert!(stored.get("discountStartsAt").is_none());
        assert_eq!(stored["requiredFields"], json!(["frameNumber"]));
        assert_eq!(stored["intakeFee"], 0.56);
        // Not sent by an older client: kept
        assert_eq!(stored["fixedSellerData"], true);
        assert_eq!(stored["labelFormat"], "standard");
    }

    #[test]
    fn feature_ranges_are_checked() {
        let err = |features: FeaturesArgs| sanitize_features(features, None).unwrap_err().code();
        assert_eq!(
            err(FeaturesArgs {
                max_discount_percent: Some(80.0),
                ..Default::default()
            }),
            Some("event.maxDiscountRange")
        );
        assert_eq!(
            err(FeaturesArgs {
                max_items_per_seller: Some(1.5),
                ..Default::default()
            }),
            Some("event.itemLimitInvalid")
        );
        assert_eq!(
            err(FeaturesArgs {
                intake_fee: Some(101.0),
                ..Default::default()
            }),
            Some("event.intakeFeeRange")
        );
    }

    #[test]
    fn logistics_need_start_before_end() {
        let err = sanitize_logistics(LogisticsArgs {
            dropoff_end: Some(5.0),
            ..Default::default()
        })
        .unwrap_err();
        assert_eq!(err.code(), Some("event.startMissing"));
        let err = sanitize_logistics(LogisticsArgs {
            pickup_start: Some(5.0),
            pickup_end: Some(5.0),
            ..Default::default()
        })
        .unwrap_err();
        assert_eq!(err.code(), Some("event.endBeforeStart"));
    }
}
