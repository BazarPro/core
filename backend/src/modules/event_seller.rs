//! Sellers of an event: joining, leaving, payout.

use chrono::Duration;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use sqlx::PgConnection;
use uuid::Uuid;

use super::docs;
use super::event_exclusions::assert_not_excluded;
use super::event_invitations;
use super::event_roles::{self, Permission, Role};
use super::features::{postal_code_refused, registration_unavailable};
use super::fee_groups;
use super::notifications::{self, Content, T};
use super::offers::close_offers_for_event_product;
use super::sales::{self, intake_fee_for_seller};
use super::seller_numbers::next_seller_number;
use super::seller_records::{missing_profile_fields, snapshot_seller};
use crate::auth::rate_limit;
use crate::error::{AppError, AppResult};
use crate::flags;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventSeller.joinEvent" => join_event);
    register!(registry, Mutation "eventSeller.removeSellerAndCoorganizerRoles" => remove_seller_and_coorganizer_roles);
    register!(registry, Query "eventSeller.isEventSellerForEvent" => is_event_seller_for_event);
    register!(registry, Mutation "eventSeller.checkAccessCode" => check_access_code);
    register!(registry, Mutation "eventSeller.markVendorPayoutReceived" => mark_vendor_payout_received);
    register!(registry, Mutation "eventSeller.settleVendor" => settle_vendor);
    register!(registry, Mutation "eventSeller.unmarkVendorPayoutReceived" => unmark_vendor_payout_received);
    register!(registry, Mutation "eventSeller.removeSellersWithoutItems" => remove_sellers_without_items);
}

/// Sellers (`event_roles r`) who have not announced any item (#304): none announced, at the
/// bazaar or sold; rejected ones take no place, like for the item limit. Not the team, who
/// sell whenever they like, not the excluded, and not walk-in sellers, whom the team
/// manages. Shared by the messages, the seller list and the unregistering of all of them.
pub const WITHOUT_ITEMS: &str = "r.role = 'seller'
    AND NOT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                    WHERE ep.event_id = r.event_id AND p.vendor_id = r.user_id
                      AND ep.status <> 'rejected')
    AND NOT EXISTS (SELECT 1 FROM event_exclusions x
                    WHERE x.event_id = r.event_id AND x.user_id = r.user_id)
    AND NOT EXISTS (SELECT 1 FROM event_roles t
                    WHERE t.event_id = r.event_id AND t.user_id = r.user_id
                      AND t.role IN ('organizer', 'coorganizer'))
    AND NOT EXISTS (SELECT 1 FROM users u
                    WHERE u.id = r.user_id AND u.managed_by_event_id IS NOT NULL)";

/// The sellers of the event without items, oldest first.
pub async fn sellers_without_items(
    conn: &mut PgConnection,
    event: Uuid,
) -> sqlx::Result<Vec<Uuid>> {
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
        "SELECT r.user_id FROM event_roles r WHERE r.event_id = $1 AND {WITHOUT_ITEMS}
         ORDER BY r.created_at"
    )))
    .bind(event)
    .fetch_all(conn)
    .await
}

/// Longest message the organizer adds when unregistering sellers
pub const MAX_UNREGISTER_MESSAGE: usize = 1000;
/// Gap between two mails, like the messages to sellers
const UNREGISTER_MAIL_GAP_MS: i64 = 1000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveWithoutItemsArgs {
    event_id: Id,
    /// Told to each of them, e.g. "Die Plätze sind knapp, gern beim nächsten Mal"
    message: Option<String>,
}

/// The organizer unregisters every seller without items at once (#304), e.g. at a bazaar
/// with a seller limit, so their places are free. Unlike an exclusion (#252), they may
/// join again. Who announces an item meanwhile stays: the transaction is serializable, so
/// one of the two is repeated and sees the other. Returns how many were unregistered.
async fn remove_sellers_without_items(
    ctx: &mut Ctx,
    args: RemoveWithoutItemsArgs,
) -> AppResult<usize> {
    let viewer = ctx.require_user()?;
    let event_id = args.event_id.0;
    // Helpers take items in; whom the bazaar has as sellers is the organizer's decision
    if !event_roles::has_role_or_admin(ctx.conn(), event_id, viewer, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let event = docs::event(ctx.conn(), event_id)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.end_date < chrono::Utc::now() {
        return Err(AppError::bad_request("seller.unregisterPast"));
    }
    let message = args
        .message
        .map(|message| message.trim().to_owned())
        .filter(|message| !message.is_empty());
    if message
        .as_ref()
        .is_some_and(|message| message.chars().count() > MAX_UNREGISTER_MESSAGE)
    {
        return Err(AppError::coded(
            axum::http::StatusCode::BAD_REQUEST,
            "seller.unregisterMessageTooLong",
            &[("max", &MAX_UNREGISTER_MESSAGE.to_string())],
        ));
    }
    let sellers = sellers_without_items(ctx.conn(), event.id).await?;
    let (title, path) = (event.title.clone(), format!("/public-events/{}", event.id));
    let reopens = super::features::registration_unavailable(&event, chrono::Utc::now()).is_none();
    // Rejected items stay, as when sellers leave on their own (`events::leave_event`)
    sqlx::query("DELETE FROM event_sellers WHERE event_id = $1 AND user_id = ANY($2)")
        .bind(event.id)
        .bind(&sellers)
        .execute(ctx.conn())
        .await?;
    sqlx::query(
        "DELETE FROM event_roles WHERE event_id = $1 AND user_id = ANY($2) AND role = $3::event_role_kind",
    )
    .bind(event.id)
    .bind(&sellers)
    .bind(Role::Seller.as_str())
    .execute(ctx.conn())
    .await?;
    for seller in &sellers {
        ctx.touch(Topic::User(*seller));
    }
    event_roles::touch_seller_places(ctx, event.id).await?;
    notifications::notify_users(
        ctx,
        &sellers,
        |t: T| {
            let values = [("event", title.as_str())];
            let mut paragraphs = vec![t.t("participation.unregistered.text", &values)];
            if let Some(message) = &message {
                paragraphs.push(t.t(
                    "participation.unregistered.message",
                    &[("message", message)],
                ));
            }
            paragraphs.push(t.t(
                if reopens {
                    "participation.unregistered.join"
                } else {
                    "participation.unregistered.joinClosed"
                },
                &[],
            ));
            Content {
                subject: t.t("participation.unregistered.subject", &values),
                heading: t.t("participation.unregistered.heading", &[]),
                paragraphs,
                link: t.link("participation.openEvent", path.clone()),
                ..Content::default()
            }
        },
        Duration::milliseconds(UNREGISTER_MAIL_GAP_MS),
    )
    .await?;
    ctx.touch(Topic::Event(event.id));
    Ok(sellers.len())
}

/// Places taken toward the seller limit: sellers, without the excluded and the team
/// (`docs::SELLER_PLACES_SQL`, shared with the free places shown in the lists).
pub async fn seller_places_taken(conn: &mut PgConnection, event: Uuid) -> sqlx::Result<i64> {
    sqlx::query_scalar(docs::SELLER_PLACES_SQL)
        .bind(event)
        .fetch_one(conn)
        .await
}

/// Whether the given code opens the event; without a code on the event anything does,
/// except on one reached by link and code, which stays closed until it has a code.
/// In demo mode the code "DEMO" opens every event.
async fn access_code_matches(
    ctx: &mut Ctx,
    event: &docs::Event,
    code: Option<&str>,
) -> AppResult<bool> {
    let required = event.access_code.as_deref().filter(|code| !code.is_empty());
    let closed = required.is_none() && event.visibility == "approved";
    if !closed && required == code.filter(|code| !code.is_empty()) {
        return Ok(true);
    }
    Ok(code == Some("DEMO") && flags::get(ctx.conn(), "is_demo_mode", false).await?)
}

/// `access_code_matches` with the failed attempts of the user limited like sign-ins, so
/// codes cannot be guessed. The attempt is taken before the check, so parallel requests
/// do not get more guesses. A correct code gives its attempt back and does not reset the
/// count: the code of an own event would otherwise refill it. Recorded on the pool, the
/// mutation may roll back.
async fn verify_access_code(
    ctx: &mut Ctx,
    event: &docs::Event,
    code: Option<&str>,
) -> AppResult<bool> {
    let identifier = format!("accessCode:{}", ctx.require_user()?);
    let per_hour = rate_limit::GUESSES_PER_HOUR;
    if !rate_limit::try_consume(&ctx.state.db, &identifier, per_hour).await? {
        return Err(AppError::too_many_requests("join.tooManyAttempts"));
    }
    let matches = access_code_matches(ctx, event, code).await;
    if !matches!(matches, Ok(false)) {
        rate_limit::refund(&ctx.state.db, &identifier, per_hour).await?;
    }
    matches
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JoinArgs {
    event_id: Id,
    access_code: Option<String>,
    /// Confirmation to sell as a private person, needed where the event asks for it
    private_seller: Option<bool>,
    /// The link of an invitation by mail: replaces the access code
    invitation: Option<String>,
    /// A fee group the seller says they belong to, checked at the intake (#302)
    fee_group_id: Option<String>,
}

/// The current user joins the event as seller and gets the next seller number.
async fn join_event(ctx: &mut Ctx, args: JoinArgs) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    if event.moderation.is_some() {
        return Err(AppError::forbidden("event.blocked"));
    }
    if event.end_date < chrono::Utc::now() {
        return Err(AppError::bad_request("join.past"));
    }
    // Excluded by the organizer: no code or invitation gets them back in
    assert_not_excluded(ctx.conn(), event.id, user).await?;
    let invited_as_helper = match args.invitation.as_deref() {
        Some(token) => Some(event_invitations::check(ctx, event.id, token, user).await?),
        None => None,
    };
    // Organizer and helpers sell their own items at their bazaar whenever they like: the
    // registration window, the code and the seller limit are for the public. By role, not
    // for platform administrators: they manage every bazaar but are not on its team
    let team = event_roles::has_any_role(ctx.conn(), event.id, user, &event_roles::TEAM).await?;
    // Closed or outside its window: only an invitation lets new sellers in. Asked before
    // the code, so a code typed in vain does not count against the user.
    if invited_as_helper.is_none()
        && !team
        && let Some(code) = registration_unavailable(&event, chrono::Utc::now())
        && !event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await?
    {
        return Err(AppError::bad_request(code));
    }
    if invited_as_helper.is_none()
        && !team
        && !verify_access_code(ctx, &event, args.access_code.as_deref()).await?
    {
        return Err(AppError::forbidden("join.invalidCode"));
    }
    if event_roles::has_role(ctx.conn(), event.id, user, Role::Seller).await? {
        // Joining twice is fine; the seller row exists since the first time
        if let Some(seller) = docs::event_seller(ctx.conn(), event.id, user).await? {
            if let (Some(token), Some(helper)) = (args.invitation.as_deref(), invited_as_helper) {
                event_invitations::redeem(ctx, event.id, token, user, helper).await?;
            }
            return Ok(seller.id);
        }
        return Err(anyhow::anyhow!("seller role without event_sellers row").into());
    }
    let features = event.resolved_features();
    fee_groups::check_choice(&event, args.fee_group_id.as_deref())?;
    if features.private_sellers_only && args.private_seller != Some(true) {
        return Err(AppError::bad_request("join.privateRequired"));
    }
    // A bazaar for its region (#304): an invitation, the access code or a place on the team
    // let others in too, so the organizer can make exceptions
    let has_code = event
        .access_code
        .as_deref()
        .is_some_and(|code| !code.is_empty());
    let region = features
        .postal_codes
        .as_ref()
        .filter(|_| invited_as_helper.is_none() && !team && !has_code);
    // Loaded once for both checks below
    let profile = if region.is_some() || features.fixed_seller_data {
        docs::user(ctx.conn(), user).await?
    } else {
        None
    };
    if let Some(region) = region {
        let (zip, country) = profile.as_ref().map_or((None, None), |u| {
            (u.zip_code.as_deref(), u.country.as_deref())
        });
        match postal_code_refused(&features, zip, country) {
            Some("join.postalCode") => {
                return Err(AppError::coded(
                    axum::http::StatusCode::BAD_REQUEST,
                    "join.postalCode",
                    &[("codes", &region.describe())],
                ));
            }
            Some(code) => return Err(AppError::bad_request(code)),
            None => {}
        }
    }
    // A record of who offers what needs complete details; the dialog asks for them first
    if features.fixed_seller_data {
        let complete = profile
            .as_ref()
            .is_some_and(|user| missing_profile_fields(user).is_empty());
        if !complete {
            return Err(AppError::bad_request("join.profileIncomplete"));
        }
    }
    // A helper the organizer asked for, or one of the team, does not take a seller's place
    // and is not counted either (`docs::SELLER_PLACES_SQL`)
    if let Some(limit) = event
        .vendor_limit
        .filter(|limit| *limit > 0 && invited_as_helper != Some(true) && !team)
        && seller_places_taken(ctx.conn(), event.id).await? >= i64::from(limit)
    {
        return Err(AppError::bad_request("join.vendorLimit"));
    }
    let number = next_seller_number(ctx, event.id).await?;
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
           payout_received, number, private_seller_confirmed_at, fee_group_id, admitted_by_region)
         VALUES ($1, $2, 0, 0, 0, false, $3, CASE WHEN $4 THEN now() END, $5, $6)
         RETURNING id",
    )
    .bind(event.id)
    .bind(user)
    .bind(number)
    .bind(features.private_sellers_only)
    .bind(&args.fee_group_id)
    .bind(region.is_some())
    .fetch_one(ctx.conn())
    .await?;
    event_roles::add_role(ctx, event.id, user, Role::Seller).await?;
    if let (Some(token), Some(helper)) = (args.invitation.as_deref(), invited_as_helper) {
        event_invitations::redeem(ctx, event.id, token, user, helper).await?;
    }
    Ok(id)
}

/// The user leaves every event as seller and helper (deleting the account). Refused while
/// a bazaar still has items of the user (handed in or sold, not over or not paid out
/// within `sales::SETTLEMENT_DAYS`): the cash desk and the payout need them. Later the
/// organizer may simply not use the payout flag.
///
/// Bazaars that are not over lose the user's announced items, seller row and role. Items
/// with history and every past bazaar stay as they are, so the settlement and the record
/// of who offered what stay complete. Helper roles go everywhere.
pub async fn remove_seller_and_coorganizer_roles_for_user(
    ctx: &mut Ctx,
    user: Uuid,
) -> AppResult<()> {
    let unsettled: bool = sqlx::query_scalar(
        "SELECT EXISTS (
           SELECT 1 FROM event_products ep
           JOIN products p ON p.id = ep.product_id
           JOIN events e ON e.id = ep.event_id
           LEFT JOIN event_sellers s ON s.event_id = ep.event_id AND s.user_id = p.vendor_id
           WHERE p.vendor_id = $1 AND ep.status IN ('available', 'sold')
             AND (e.end_date >= now()
                  OR (e.end_date >= now() - make_interval(days => $2)
                      AND s.payout_received IS NOT TRUE)))",
    )
    .bind(user)
    .bind(sales::SETTLEMENT_DAYS as i32)
    .fetch_one(ctx.conn())
    .await?;
    if unsettled {
        return Err(AppError::coded(
            axum::http::StatusCode::CONFLICT,
            "ACCOUNT_HAS_OPEN_SALES",
            &[],
        ));
    }

    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT event_id FROM event_roles WHERE user_id = $1 AND role IN ('seller', 'coorganizer')",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    let now = chrono::Utc::now();
    for event_id in events {
        if event_roles::has_role(ctx.conn(), event_id, user, Role::Coorganizer).await? {
            event_roles::remove_role(ctx, event_id, user, Role::Coorganizer).await?;
            // Their devices may keep the keys of the sellers' ID codes
            super::offline::renew_check_in_keys(ctx, event_id).await?;
        }
        let Some(event) = docs::event(ctx.conn(), event_id).await? else {
            continue;
        };
        if event.end_date < now {
            continue;
        }
        let has_history: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                            WHERE ep.event_id = $1 AND p.vendor_id = $2
                              AND ep.status NOT IN ('announced', 'rejected'))",
        )
        .bind(event_id)
        .bind(user)
        .fetch_one(ctx.conn())
        .await?;
        if has_history {
            continue;
        }
        let products: Vec<Uuid> = sqlx::query_scalar(
            "DELETE FROM event_products ep USING products p
             WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2
             RETURNING ep.product_id",
        )
        .bind(event_id)
        .bind(user)
        .fetch_all(ctx.conn())
        .await?;
        for product in products {
            ctx.touch(Topic::Product(product));
        }
        sqlx::query("DELETE FROM event_sellers WHERE event_id = $1 AND user_id = $2")
            .bind(event_id)
            .bind(user)
            .execute(ctx.conn())
            .await?;
        event_roles::remove_role(ctx, event_id, user, Role::Seller).await?;
    }
    ctx.touch(Topic::User(user));
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

async fn remove_seller_and_coorganizer_roles(ctx: &mut Ctx, _: NoArgs) -> AppResult<Option<bool>> {
    let Some(user) = ctx.user else {
        return Ok(Some(false));
    };
    remove_seller_and_coorganizer_roles_for_user(ctx, user).await?;
    Ok(None)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn is_event_seller_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<bool> {
    let Some(user) = ctx.user else {
        return Ok(false);
    };
    ctx.read(Topic::User(user));
    Ok(event_roles::has_role(ctx.conn(), args.event_id.0, user, Role::Seller).await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AccessCodeArgs {
    event_id: Id,
    access_code: Option<String>,
}

/// A mutation, not a query: every wrong code counts against the user's limit.
async fn check_access_code(ctx: &mut Ctx, args: AccessCodeArgs) -> AppResult<bool> {
    let event = docs::event(ctx.conn(), args.event_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    verify_access_code(ctx, &event, args.access_code.as_deref()).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct VendorArgs {
    event_id: Id,
    vendor_user_id: Id,
}

async fn mark_vendor_payout_received(ctx: &mut Ctx, args: VendorArgs) -> AppResult<()> {
    record_payout(ctx, args.event_id.0, args.vendor_user_id.0).await
}

#[derive(Serialize)]
struct Settled {
    returned: i64,
}

/// Settles a seller in one step at the end of the event: their unsold items go back to
/// them (available → returned) and the payout is marked as done. Organizers and helpers
/// with the payout right; with unsold items left also the return right.
async fn settle_vendor(ctx: &mut Ctx, args: VendorArgs) -> AppResult<Settled> {
    let (event, vendor) = (args.event_id.0, args.vendor_user_id.0);
    let has_unsold: bool = sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                        WHERE ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'available')",
    )
    .bind(event)
    .bind(vendor)
    .fetch_one(ctx.conn())
    .await?;
    if has_unsold {
        event_roles::require_permission_or(
            ctx,
            event,
            Permission::Return,
            "seller.payoutStaffOnly",
        )
        .await?;
    }
    record_payout(ctx, event, vendor).await?;
    let unsold: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        "UPDATE event_products ep SET status = 'returned' FROM products p
         WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2 AND ep.status = 'available'
         RETURNING ep.id, p.id, p.title",
    )
    .bind(event)
    .bind(vendor)
    .fetch_all(ctx.conn())
    .await?;
    for (relation, product, title) in &unsold {
        ctx.touch(Topic::Product(*product));
        close_offers_for_event_product(ctx, *relation, title, "return").await?;
    }
    // Also when the payout was recorded before and record_payout touched nothing
    if !unsold.is_empty() {
        ctx.touch(Topic::Event(event));
    }
    Ok(Settled {
        returned: unsold.len() as i64,
    })
}

async fn require_staff_and_seller(
    ctx: &mut Ctx,
    event: Uuid,
    vendor: Uuid,
    staff_code: &'static str,
) -> AppResult<docs::Event> {
    let event = docs::event(ctx.conn(), event)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.event"))?;
    // Helpers (coorganizers) settle sellers as well, when the organizer lets them
    event_roles::require_permission_or(ctx, event.id, Permission::Payout, staff_code).await?;
    // A seller whose account was deleted lost the role but keeps the seller row
    if !event_roles::has_role(ctx.conn(), event.id, vendor, Role::Seller).await?
        && docs::event_seller(ctx.conn(), event.id, vendor)
            .await?
            .is_none()
    {
        return Err(AppError::bad_request("seller.notSeller"));
    }
    Ok(event)
}

/// Marks the payout of a seller as done and stores the totals and the intake fee kept.
/// Nothing happens when already paid.
async fn record_payout(ctx: &mut Ctx, event_id: Uuid, vendor: Uuid) -> AppResult<()> {
    let event = require_staff_and_seller(ctx, event_id, vendor, "seller.payoutStaffOnly").await?;
    write_payout(ctx, &event, vendor, false).await?;
    Ok(())
}

/// Sellers whose items were handed in and are all back with them, with nothing sold and
/// not settled yet: candidates for `settle_sellers_without_money`.
const WITHOUT_MONEY_CANDIDATES: &str = "SELECT p.vendor_id FROM event_products ep
     JOIN products p ON p.id = ep.product_id
     WHERE ep.event_id = $1
     GROUP BY p.vendor_id
     HAVING bool_or(ep.status = 'returned') AND NOT bool_or(ep.status IN ('available', 'sold'))
       AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.event_id = $1 AND pu.seller_id = p.vendor_id)
       AND NOT EXISTS (SELECT 1 FROM event_sellers s
                       WHERE s.event_id = $1 AND s.user_id = p.vendor_id AND s.payout_received)
     ORDER BY p.vendor_id";

/// Settles the sellers of a bazaar without money either way (#305): what they handed in
/// went back, nothing was sold and no intake fee is due, so the payout is 0 €. Everyone
/// else stays open: settled means the money changed hands, which only the team knows.
/// Gives how many were settled.
pub async fn settle_sellers_without_money(ctx: &mut Ctx, event: &docs::Event) -> AppResult<usize> {
    let candidates: Vec<Uuid> = sqlx::query_scalar(WITHOUT_MONEY_CANDIDATES)
        .bind(event.id)
        .fetch_all(ctx.conn())
        .await?;
    let mut settled = 0;
    for vendor in candidates {
        if write_payout(ctx, event, vendor, true).await? {
            settled += 1;
        }
    }
    Ok(settled)
}

/// Writes the settlement of a seller as it stands; `only_without_money`: only when nothing
/// is paid either way (no commission, no intake fee, payout 0 €). Gives whether it wrote.
async fn write_payout(
    ctx: &mut Ctx,
    event: &docs::Event,
    vendor: Uuid,
    only_without_money: bool,
) -> AppResult<bool> {
    let row = docs::event_seller(ctx.conn(), event.id, vendor).await?;
    if row.as_ref().is_some_and(|row| row.payout_received) {
        return Ok(false);
    }
    let (commission, payout): (Decimal, Decimal) = sqlx::query_as(
        "SELECT COALESCE(sum(commission_amount), 0), COALESCE(sum(payout_amount), 0)
         FROM purchases WHERE event_id = $1 AND seller_id = $2",
    )
    .bind(event.id)
    .bind(vendor)
    .fetch_one(ctx.conn())
    .await?;
    let fee = intake_fee_for_seller(ctx.conn(), event, vendor, row.as_ref()).await?;
    let fees = fee_groups::seller_fees(ctx.conn(), event, vendor).await?;
    // Fees above the cap go back to the seller with the payout
    let credit = sales::fee_cap_credit_of(&fees, row.as_ref(), commission, &fee);
    // The group applied, kept with the settlement (#302)
    let group = fees.group.as_ref().map(|group| group.label.clone());
    let payout = payout - fee.total + credit;
    if only_without_money && !(commission.is_zero() && fee.total.is_zero() && payout.is_zero()) {
        return Ok(false);
    }
    let credit = (!credit.is_zero()).then_some(credit);
    match row {
        Some(row) => {
            sqlx::query(
                "UPDATE event_sellers SET commission_fee = $2, payout_amount = $3, intake_fee = $4,
                   intake_fee_items = $5, fee_cap_credit = $6, fee_group_label = $7,
                   commission_percent = $8, payout_received = true
                 WHERE id = $1",
            )
            .bind(row.id)
            .bind(commission)
            .bind(payout)
            .bind(fee.total)
            .bind(fee.items as i32)
            .bind(credit)
            .bind(&group)
            .bind(fees.commission)
            .execute(ctx.conn())
            .await?;
        }
        None => {
            let number = next_seller_number(ctx, event.id).await?;
            sqlx::query(
                "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount,
                   intake_fee, intake_fee_items, fee_cap_credit, fee_group_label, commission_percent,
                   payout_received, number)
                 VALUES ($1, $2, 0, $3, $4, $5, $6, $7, $8, $9, true, $10)",
            )
            .bind(event.id)
            .bind(vendor)
            .bind(commission)
            .bind(payout)
            .bind(fee.total)
            .bind(fee.items as i32)
            .bind(credit)
            .bind(&group)
            .bind(fees.commission)
            .bind(number)
            .execute(ctx.conn())
            .await?;
        }
    }
    // Who was paid out, as they are now
    snapshot_seller(ctx.conn(), event, vendor, true).await?;
    ctx.touch(Topic::Event(event.id));
    ctx.touch(Topic::User(vendor));
    Ok(true)
}

async fn unmark_vendor_payout_received(ctx: &mut Ctx, args: VendorArgs) -> AppResult<()> {
    let (event, vendor) = (args.event_id.0, args.vendor_user_id.0);
    require_staff_and_seller(ctx, event, vendor, "seller.undoPayoutStaffOnly").await?;
    sqlx::query(
        "UPDATE event_sellers SET payout_received = false, commission_fee = 0, payout_amount = 0,
           intake_fee = NULL, intake_fee_items = NULL, fee_cap_credit = NULL,
           fee_group_label = NULL, commission_percent = NULL
         WHERE event_id = $1 AND user_id = $2 AND payout_received",
    )
    .bind(event)
    .bind(vendor)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::User(vendor));
    Ok(())
}
