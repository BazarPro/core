//! Accounts and profiles.
//!
//! `update` does not take `status`, so a banned user cannot make themselves active
//! again; `changePassword` checks the minimum length like sign-up; check-in tokens come
//! from a secure random generator.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::access::require_admin;
use super::account_deletion;
use super::docs::{self, User};
use super::event_roles::{Role, has_any_role, require_team};
use super::offline;
use super::seller_records::{
    FIXED_PROFILE_FIELDS, is_profile_fixed, missing_profile_fields, profile_field,
};
use crate::auth::{session, users::promote_configured_admin};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};
use crate::{flags, i18n::Locale};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "users.viewer" => viewer);
    register!(registry, Query "users.getUserSystemRole" => get_user_system_role);
    register!(registry, Query "users.getUserProviders" => get_user_providers);
    register!(registry, Mutation "users.markOnboardingSeen" => mark_onboarding_seen);
    register!(registry, Query "users.getUserById" => get_user_by_id);
    register!(registry, Mutation "users.update" => update);
    register!(registry, Query "users.isMyProfileFixed" => is_my_profile_fixed);
    register!(registry, Query "users.getMissinfProfileData" => get_missing_profile_data);
    register!(registry, Mutation "users.setDeleted" => set_deleted);
    register!(registry, Mutation "users.generateCheckInToken" => generate_check_in_token);
    register!(registry, Query "users.getUserByCheckInToken" => get_user_by_check_in_token);
    register!(registry, Query "users.getExportData" => get_export_data);
    register!(registry, Query "users.getE2eVerificationCode" => get_e2e_verification_code);
    register!(registry, Mutation "users.confirmEmailForE2E" => confirm_email_for_e2e);
    register!(registry, Mutation "users.setProfileForE2E" => set_profile_for_e2e);
    register!(registry, Query "users.listUsersForAdmin" => list_users_for_admin);
    register!(registry, Mutation "users.setUserStatusForAdmin" => set_user_status_for_admin);
    register!(registry, Mutation "users.setMyLocale" => set_my_locale);
    register!(registry, InternalMutation "users.makeAdmin" => make_admin);
    register!(registry, InternalMutation "users.promoteConfiguredAdmin" => promote_configured_admin_on_start);
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

/// Signs the user out everywhere.
pub async fn revoke_sessions(conn: &mut PgConnection, user: Uuid) -> sqlx::Result<()> {
    session::delete_all_of_user(conn, user).await
}

async fn me(ctx: &mut Ctx) -> AppResult<(Uuid, User)> {
    let id = ctx.require_user()?;
    ctx.read(Topic::User(id));
    let user = docs::user(ctx.conn(), id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.user"))?;
    Ok((id, user))
}

/// The signed-in user, or null.
async fn viewer(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<User>> {
    let Some(id) = ctx.user else { return Ok(None) };
    ctx.read(Topic::User(id));
    Ok(docs::user(ctx.conn(), id).await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UserArgs {
    user_id: Id,
}

async fn get_user_system_role(ctx: &mut Ctx, args: UserArgs) -> AppResult<Option<String>> {
    ctx.read(Topic::User(args.user_id.0));
    Ok(
        sqlx::query_scalar("SELECT system_role::text FROM users WHERE id = $1")
            .bind(args.user_id.0)
            .fetch_optional(ctx.conn())
            .await?
            .flatten(),
    )
}

/// Sign-in methods of the current user (password, google, github).
async fn get_user_providers(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<String>> {
    let Some(id) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(id));
    Ok(sqlx::query_scalar(
        "SELECT provider FROM auth_accounts WHERE user_id = $1 ORDER BY created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?)
}

async fn mark_onboarding_seen(ctx: &mut Ctx, _: NoArgs) -> AppResult<()> {
    let (id, user) = me(ctx).await?;
    if user.needs_onboarding == Some(true) {
        sqlx::query("UPDATE users SET needs_onboarding = false WHERE id = $1")
            .bind(id)
            .execute(ctx.conn())
            .await?;
        ctx.touch(Topic::User(id));
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UserByIdArgs {
    user_id: Id,
    event_id: Option<Id>,
}

/// Oneself, or a seller or helper of an event the viewer organizes.
async fn get_user_by_id(ctx: &mut Ctx, args: UserByIdArgs) -> AppResult<Option<User>> {
    let viewer = ctx.require_user()?;
    match args.event_id {
        None if viewer != args.user_id.0 => return Err(AppError::forbidden("auth.forbidden")),
        None => {}
        Some(event) => {
            require_team(ctx, event.0).await?;
            let roles = [Role::Organizer, Role::Coorganizer, Role::Seller];
            if !has_any_role(ctx.conn(), event.0, args.user_id.0, &roles).await? {
                return Err(AppError::forbidden("auth.forbidden"));
            }
        }
    }
    ctx.read(Topic::User(args.user_id.0));
    Ok(docs::user(ctx.conn(), args.user_id.0).await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateArgs {
    first_name: Option<String>,
    last_name: Option<String>,
    phone: Option<String>,
    street: Option<String>,
    city: Option<String>,
    zip_code: Option<String>,
    country: Option<String>,
}

impl UpdateArgs {
    fn get(&self, field: &str) -> Option<&str> {
        match field {
            "firstName" => self.first_name.as_deref(),
            "lastName" => self.last_name.as_deref(),
            "phone" => self.phone.as_deref(),
            "street" => self.street.as_deref(),
            "city" => self.city.as_deref(),
            "zipCode" => self.zip_code.as_deref(),
            "country" => self.country.as_deref(),
            _ => None,
        }
    }
}

/// The own profile. Name and address are fixed while a bazaar keeps a record of the user.
async fn update(ctx: &mut Ctx, args: UpdateArgs) -> AppResult<()> {
    let (id, user) = me(ctx).await?;
    let changes_fixed = FIXED_PROFILE_FIELDS.iter().any(|field| {
        args.get(field)
            .is_some_and(|value| value != profile_field(&user, field).unwrap_or(""))
    });
    if changes_fixed && is_profile_fixed(ctx.conn(), id).await? {
        return Err(AppError::bad_request("profile.fixed"));
    }
    let first = args.first_name.clone().or(user.first_name);
    let last = args.last_name.clone().or(user.last_name);
    let name = [first, last]
        .into_iter()
        .flatten()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    sqlx::query(
        "UPDATE users SET
           first_name = COALESCE($2, first_name), last_name = COALESCE($3, last_name),
           phone = COALESCE($4, phone), street = COALESCE($5, street), city = COALESCE($6, city),
           zip_code = COALESCE($7, zip_code), country = COALESCE($8, country),
           name = CASE WHEN $9 <> '' THEN $9 ELSE name END
         WHERE id = $1",
    )
    .bind(id)
    .bind(args.first_name)
    .bind(args.last_name)
    .bind(args.phone)
    .bind(args.street)
    .bind(args.city)
    .bind(args.zip_code)
    .bind(args.country)
    .bind(name)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(id));
    Ok(())
}

async fn is_my_profile_fixed(ctx: &mut Ctx, _: NoArgs) -> AppResult<bool> {
    let Some(id) = ctx.user else { return Ok(false) };
    ctx.read(Topic::User(id));
    Ok(is_profile_fixed(ctx.conn(), id).await?)
}

/// Profile fields the user still has to fill in before joining a bazaar; only their own.
async fn get_missing_profile_data(ctx: &mut Ctx, args: UserArgs) -> AppResult<Vec<&'static str>> {
    if ctx.require_user()? != args.user_id.0 {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    ctx.read(Topic::User(args.user_id.0));
    let user = docs::user(ctx.conn(), args.user_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.user"))?;
    Ok(missing_profile_fields(&user))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteArgs {
    /// Anonymize right away instead of after the grace period
    #[serde(default)]
    immediately: bool,
    /// The organizer of past bazaars confirms they exported the settlements
    #[serde(default)]
    settlement_exported: bool,
}

/// Deletes the own account, see `account_deletion`. Organizers of running or upcoming
/// events and users with open sales cannot; seller and helper roles are removed, sessions
/// ended. The account can be reactivated within the grace period unless `immediately`.
async fn set_deleted(ctx: &mut Ctx, args: DeleteArgs) -> AppResult<()> {
    let id = ctx.require_user()?;
    account_deletion::close_account(ctx, id, args.settlement_exported).await?;
    if args.immediately {
        account_deletion::anonymize(ctx, id).await?;
    }
    Ok(())
}

#[derive(Serialize)]
struct CheckInToken {
    token: String,
    #[serde(with = "ms")]
    expires: DateTime<Utc>,
}

/// A token for the QR code the cash desk scans; valid for 60 seconds.
async fn generate_check_in_token(ctx: &mut Ctx, _: NoArgs) -> AppResult<CheckInToken> {
    let id = ctx.require_user()?;
    let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 16]>());
    let expires = Utc::now() + Duration::seconds(60);
    sqlx::query(
        "UPDATE users SET check_in_token = $2, check_in_token_expires_at = $3 WHERE id = $1",
    )
    .bind(id)
    .bind(&token)
    .bind(expires)
    .execute(ctx.conn())
    .await?;
    Ok(CheckInToken { token, expires })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CheckInArgs {
    token: String,
    event_id: Id,
}

/// The user of a scanned QR code, for the team of the event; null if expired. The token
/// is the 60-second one from generateCheckInToken or `<user>.<code>[.<code>…]`, the
/// time-based codes of the user's bazaars; one must be the code for this event.
async fn get_user_by_check_in_token(ctx: &mut Ctx, args: CheckInArgs) -> AppResult<Option<User>> {
    require_team(ctx, args.event_id.0).await?;
    let user = match args.token.split_once('.') {
        // "<user>.<codes>": the time-based codes the phone shows, also offline
        Some((user, codes)) => match Uuid::parse_str(user) {
            Ok(user) => {
                let secret: Option<Vec<u8>> =
                    sqlx::query_scalar("SELECT check_in_secret FROM users WHERE id = $1")
                        .bind(user)
                        .fetch_optional(ctx.conn())
                        .await?
                        .flatten();
                secret
                    .filter(|secret| {
                        offline::event_code_matches(secret, args.event_id.0, codes, Utc::now())
                    })
                    .map(|_| user)
            }
            Err(_) => None,
        },
        None => sqlx::query_scalar(
            "SELECT id FROM users WHERE check_in_token = $1 AND check_in_token_expires_at >= now()",
        )
        .bind(&args.token)
        .fetch_optional(ctx.conn())
        .await?,
    };
    let Some(user) = user else { return Ok(None) };
    ctx.read(Topic::User(user));
    Ok(docs::user(ctx.conn(), user).await?)
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProfile {
    name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    first_name: Option<String>,
    last_name: Option<String>,
    street: Option<String>,
    city: Option<String>,
    zip_code: Option<String>,
    country: Option<String>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportProduct {
    title: String,
    description: String,
    price: Decimal,
    condition: String,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportEvent {
    title: String,
    description: String,
    location: String,
    #[serde(with = "ms")]
    start_date: DateTime<Utc>,
    #[serde(with = "ms")]
    end_date: DateTime<Utc>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportSale {
    event: String,
    title: Option<String>,
    total_amount: Decimal,
    commission_amount: Decimal,
    payout_amount: Decimal,
    #[serde(with = "ms")]
    sold_at: DateTime<Utc>,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportParticipation {
    event: String,
    seller_number: Option<i32>,
    payout_received: bool,
    payout_amount: Decimal,
    intake_fee: Option<Decimal>,
    #[serde(with = "ms_opt")]
    private_seller_confirmed_at: Option<DateTime<Utc>>,
    /// Name, address and contact as the bazaar keeps them
    recorded_details: Option<serde_json::Value>,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportOffer {
    event: String,
    product: String,
    amount: Decimal,
    message: Option<String>,
    status: String,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportQuestion {
    event: String,
    product: String,
    question: String,
    answer: Option<String>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ExportRole {
    event: String,
    role: String,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Export {
    profile: ExportProfile,
    products: Vec<ExportProduct>,
    organized_events: Vec<ExportEvent>,
    sales: Vec<ExportSale>,
    seller_participations: Vec<ExportParticipation>,
    offers: Vec<ExportOffer>,
    questions: Vec<ExportQuestion>,
    event_roles: Vec<ExportRole>,
    export_date: String,
}

/// The own data for download (GDPR, Art. 15 and 20): profile, items, organized events,
/// sales and payouts, offers, questions and roles.
async fn get_export_data(ctx: &mut Ctx, _: NoArgs) -> AppResult<Export> {
    let (id, user) = me(ctx).await?;
    let products = sqlx::query_as(
        "SELECT title, description, price, condition::text AS condition, created_at
         FROM products WHERE vendor_id = $1 ORDER BY created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let organized_events = sqlx::query_as(
        "SELECT title, description, location, start_date, end_date, created_at
         FROM events WHERE organizer_id = $1 ORDER BY created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let sales = sqlx::query_as(
        "SELECT e.title AS event, COALESCE(pu.product_title, p.title) AS title, pu.total_amount,
                pu.commission_amount, pu.payout_amount, pu.created_at AS sold_at
         FROM purchases pu JOIN events e ON e.id = pu.event_id
         LEFT JOIN products p ON p.id = pu.product_id
         WHERE pu.seller_id = $1 ORDER BY pu.created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let seller_participations = sqlx::query_as(
        "SELECT e.title AS event, s.number AS seller_number, s.payout_received, s.payout_amount,
                s.intake_fee, s.private_seller_confirmed_at, s.seller_snapshot AS recorded_details
         FROM event_sellers s JOIN events e ON e.id = s.event_id
         WHERE s.user_id = $1 ORDER BY s.created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let offers = sqlx::query_as(
        "SELECT e.title AS event, p.title AS product, o.amount, o.message, o.status::text AS status,
                o.created_at
         FROM product_offers o JOIN events e ON e.id = o.event_id JOIN products p ON p.id = o.product_id
         WHERE o.buyer_id = $1 ORDER BY o.created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let questions = sqlx::query_as(
        "SELECT e.title AS event, p.title AS product, q.question, q.answer, q.created_at
         FROM product_questions q JOIN events e ON e.id = q.event_id JOIN products p ON p.id = q.product_id
         WHERE q.asker_id = $1 ORDER BY q.created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    let event_roles = sqlx::query_as(
        "SELECT e.title AS event, r.role::text AS role, r.created_at
         FROM event_roles r JOIN events e ON e.id = r.event_id
         WHERE r.user_id = $1 ORDER BY r.created_at",
    )
    .bind(id)
    .fetch_all(ctx.conn())
    .await?;
    Ok(Export {
        profile: ExportProfile {
            name: user.name,
            email: user.email,
            phone: user.phone,
            first_name: user.first_name,
            last_name: user.last_name,
            street: user.street,
            city: user.city,
            zip_code: user.zip_code,
            country: user.country,
            created_at: user.created_at,
        },
        products,
        organized_events,
        sales,
        seller_participations,
        offers,
        questions,
        event_roles,
        export_date: Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })
}

async fn require_e2e(ctx: &mut Ctx) -> AppResult<()> {
    if flags::get(ctx.conn(), flags::E2E_AUTH_SKIP_EMAIL, false).await? {
        Ok(())
    } else {
        Err(AppError::forbidden("E2E_AUTH_DISABLED"))
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct EmailArgs {
    email: String,
}

async fn get_e2e_verification_code(ctx: &mut Ctx, args: EmailArgs) -> AppResult<String> {
    require_e2e(ctx).await?;
    let code: Option<String> =
        sqlx::query_scalar("SELECT code FROM e2e_auth_tokens WHERE lower(email) = lower($1)")
            .bind(&args.email)
            .fetch_optional(ctx.conn())
            .await?;
    code.ok_or_else(|| AppError::not_found("E2E_CODE_NOT_FOUND"))
}

async fn user_by_email(ctx: &mut Ctx, email: &str) -> AppResult<Uuid> {
    let user: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE lower(email) = lower($1) ORDER BY created_at LIMIT 1",
    )
    .bind(email)
    .fetch_optional(ctx.conn())
    .await?;
    user.ok_or_else(|| {
        AppError::coded(
            axum::http::StatusCode::NOT_FOUND,
            "notFound.accountByEmail",
            &[("email", email)],
        )
    })
}

#[derive(Serialize)]
struct Done {
    ok: bool,
}

async fn confirm_email_for_e2e(ctx: &mut Ctx, args: EmailArgs) -> AppResult<Done> {
    require_e2e(ctx).await?;
    let user = user_by_email(ctx, &args.email).await?;
    sqlx::query(
        "UPDATE users SET is_mail_confirmed = true, email_verified_at = now() WHERE id = $1",
    )
    .bind(user)
    .execute(ctx.conn())
    .await?;
    sqlx::query(
        "UPDATE auth_accounts SET email_verified = $1 WHERE lower(provider_account_id) = lower($1)",
    )
    .bind(&args.email)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(user));
    Ok(Done { ok: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct E2eProfileArgs {
    email: String,
    first_name: Option<String>,
    last_name: Option<String>,
    phone: Option<String>,
    street: Option<String>,
    zip_code: Option<String>,
    city: Option<String>,
    country: Option<String>,
}

/// E2E tests: fills the profile, avoiding flaky form interactions.
async fn set_profile_for_e2e(ctx: &mut Ctx, args: E2eProfileArgs) -> AppResult<Done> {
    require_e2e(ctx).await?;
    let user = user_by_email(ctx, &args.email).await?;
    sqlx::query(
        "UPDATE users SET first_name = $2, last_name = $3, phone = $4, street = $5, zip_code = $6,
           city = $7, country = $8 WHERE id = $1",
    )
    .bind(user)
    .bind(args.first_name.unwrap_or_else(|| "E2E".into()))
    .bind(args.last_name.unwrap_or_else(|| "Onboarding".into()))
    .bind(args.phone.unwrap_or_else(|| "+49 123 456789".into()))
    .bind(args.street.unwrap_or_else(|| "Musterstraße 1".into()))
    .bind(args.zip_code.unwrap_or_else(|| "12345".into()))
    .bind(args.city.unwrap_or_else(|| "Musterstadt".into()))
    .bind(args.country.unwrap_or_else(|| "Deutschland".into()))
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::User(user));
    Ok(Done { ok: true })
}

#[skip_serializing_none]
#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct AdminUser {
    #[serde(rename = "_id")]
    id: Uuid,
    #[serde(rename = "_creationTime", with = "ms")]
    created_at: DateTime<Utc>,
    name: Option<String>,
    email: Option<String>,
    phone: Option<String>,
    status: Option<String>,
    system_role: Option<String>,
    #[serde(with = "ms_opt")]
    last_login_at: Option<DateTime<Utc>>,
    is_walk_in: bool,
}

async fn list_users_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminUser>> {
    require_admin(ctx).await?;
    ctx.read(Topic::Admin);
    Ok(sqlx::query_as(
        "SELECT id, created_at, name, email, phone, status::text AS status,
                system_role::text AS system_role, last_login_at,
                managed_by_event_id IS NOT NULL AS is_walk_in
         FROM users WHERE anonymized_at IS NULL ORDER BY created_at",
    )
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StatusArgs {
    user_id: Id,
    status: UserStatus,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum UserStatus {
    NotVerified,
    Active,
    Inactive,
    Deleted,
    Banned,
}

impl UserStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::NotVerified => "notVerified",
            Self::Active => "active",
            Self::Inactive => "inactive",
            Self::Deleted => "deleted",
            Self::Banned => "banned",
        }
    }
}

/// Admins set the status of a user; a ban ends the user's sessions.
async fn set_user_status_for_admin(ctx: &mut Ctx, args: StatusArgs) -> AppResult<Done> {
    let admin = require_admin(ctx).await?;
    let user = args.user_id.0;
    if admin == user && args.status == UserStatus::Banned {
        return Err(AppError::bad_request("moderation.noBanSelf"));
    }
    // Only the status: deleting for good, with its checks, is users.deleteUserForAdmin.
    // Any other status ends a pending deletion.
    let updated = sqlx::query(
        "UPDATE users SET status = $2::user_status,
           deletion_requested_at = CASE WHEN $2 = 'deleted' THEN deletion_requested_at END
         WHERE id = $1 AND anonymized_at IS NULL",
    )
    .bind(user)
    .bind(args.status.as_str())
    .execute(ctx.conn())
    .await?;
    if updated.rows_affected() == 0 {
        return Err(AppError::not_found("notFound.user"));
    }
    if args.status == UserStatus::Banned {
        revoke_sessions(ctx.conn(), user).await?;
    }
    ctx.touch(Topic::User(user));
    ctx.touch(Topic::Admin);
    Ok(Done { ok: true })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct LocaleArgs {
    locale: Locale,
}

/// The language the user chose; emails to them use it as well.
async fn set_my_locale(ctx: &mut Ctx, args: LocaleArgs) -> AppResult<()> {
    let Some(id) = ctx.user else { return Ok(()) };
    sqlx::query("UPDATE users SET locale = $2 WHERE id = $1")
        .bind(id)
        .bind(args.locale)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::User(id));
    Ok(())
}

/// Makes an existing user administrator: `bazarpro-backend run users.makeAdmin '{"email":"…"}'`
async fn make_admin(ctx: &mut Ctx, args: EmailArgs) -> AppResult<String> {
    let email = args.email.trim().to_owned();
    let user = user_by_email(ctx, &email).await?;
    sqlx::query("UPDATE users SET system_role = 'admin' WHERE id = $1")
        .bind(user)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::User(user));
    Ok(format!("{email} ist jetzt Administrator."))
}

/// On every start of a self-hosted instance: makes the verified account with ADMIN_EMAIL
/// administrator. Until it exists, sign-up promotes it later (auth::users).
async fn promote_configured_admin_on_start(ctx: &mut Ctx, _: NoArgs) -> AppResult<String> {
    let Some(email) = ctx.state.config.admin_email.clone() else {
        return Ok("ADMIN_EMAIL ist nicht gesetzt.".to_owned());
    };
    // Imported addresses keep how they were typed; .env may differ in case
    let user: Option<(Uuid, Option<bool>)> = sqlx::query_as(
        "SELECT id, is_mail_confirmed FROM users WHERE lower(email) = lower($1)
         ORDER BY email = $1 DESC, created_at LIMIT 1",
    )
    .bind(&email)
    .fetch_optional(ctx.conn())
    .await?;
    match user {
        Some((id, Some(true))) => {
            let config = ctx.state.config.clone();
            promote_configured_admin(ctx.conn(), &config, id, &email).await?;
            ctx.touch(Topic::User(id));
            Ok(format!("{email} ist Administrator."))
        }
        _ => Ok(format!(
            "{email} wird Administrator, sobald sich das Konto registriert und die E-Mail bestätigt."
        )),
    }
}
