//! Roles in an event: organizer, co-organizer (helper), seller.
//! Platform administrators count as organizer of every event.

use chrono::Utc;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use sqlx::PgConnection;
use uuid::Uuid;

use super::access::is_platform_admin;
use super::docs::{self, User};
use super::sales::{self, IntakeFee};
use super::seller_records::{keeps_seller_record, with_snapshot};
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::Id;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "eventRoles.isOrganizerOfAnyProductEvent" => is_organizer_of_any_product_event);
    register!(registry, Query "eventRoles.getVendorsForEvent" => get_vendors_for_event);
    register!(registry, Query "eventRoles.isSeller" => is_seller);
    register!(registry, Query "eventRoles.getCoOrganizerIdsForEvent" => get_co_organizer_ids_for_event);
    register!(registry, Query "eventRoles.getMyRolesForEvent" => get_my_roles_for_event);
    register!(registry, Query "eventRoles.getMyRolesForEvents" => get_my_roles_for_events);
    register!(registry, Mutation "eventRoles.addCoOrganizerForEvent" => add_co_organizer_for_event);
    register!(registry, Mutation "eventRoles.removeCoOrganizerForEvent" => remove_co_organizer_for_event);
    register!(registry, Mutation "eventRoles.transferOrganizer" => transfer_organizer);
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    Organizer,
    Coorganizer,
    Seller,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Organizer => "organizer",
            Self::Coorganizer => "coorganizer",
            Self::Seller => "seller",
        }
    }
}

/// The organizer roles, which administrators have in every event
pub const TEAM: [Role; 2] = [Role::Organizer, Role::Coorganizer];

pub async fn has_role(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
    role: Role,
) -> sqlx::Result<bool> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles
                        WHERE event_id = $1 AND user_id = $2 AND role = $3::event_role_kind)",
    )
    .bind(event)
    .bind(user)
    .bind(role.as_str())
    .fetch_one(conn)
    .await
}

pub async fn has_any_role(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
    roles: &[Role],
) -> sqlx::Result<bool> {
    let roles: Vec<&str> = roles.iter().map(|role| role.as_str()).collect();
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles
                        WHERE event_id = $1 AND user_id = $2 AND role::text = ANY($3))",
    )
    .bind(event)
    .bind(user)
    .bind(roles)
    .fetch_one(conn)
    .await
}

/// Neither administrator nor in the event team nor selling items there: sees the event and
/// its items like a visitor without an account, so the answers are shared (`rpc::Audience`).
pub async fn is_bystander(conn: &mut PgConnection, event: Uuid, user: Uuid) -> sqlx::Result<bool> {
    if is_platform_admin(conn, Some(user)).await? {
        return Ok(false);
    }
    let team: Vec<&str> = TEAM.iter().map(|role| role.as_str()).collect();
    sqlx::query_scalar(
        "SELECT NOT EXISTS (SELECT 1 FROM events WHERE id = $1 AND organizer_id = $2)
            AND NOT EXISTS (SELECT 1 FROM event_roles
                            WHERE event_id = $1 AND user_id = $2 AND role::text = ANY($3))
            AND NOT EXISTS (SELECT 1 FROM event_products ep JOIN products p ON p.id = ep.product_id
                            WHERE ep.event_id = $1 AND p.vendor_id = $2)",
    )
    .bind(event)
    .bind(user)
    .bind(team)
    .fetch_one(conn)
    .await
}

/// Any of the roles; administrators pass when an organizer role is asked for.
pub async fn has_any_role_or_admin(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
    roles: &[Role],
) -> sqlx::Result<bool> {
    let admin_bypass = roles.iter().any(|role| TEAM.contains(role));
    if admin_bypass && is_platform_admin(conn, Some(user)).await? {
        return Ok(true);
    }
    has_any_role(conn, event, user, roles).await
}

pub async fn has_role_or_admin(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
    role: Role,
) -> sqlx::Result<bool> {
    has_any_role_or_admin(conn, event, user, &[role]).await
}

/// Signed in and organizer or co-organizer (or admin) of the event.
pub async fn require_team(ctx: &mut Ctx, event: Uuid) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    if !has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    Ok(user)
}

pub async fn add_role(ctx: &mut Ctx, event: Uuid, user: Uuid, role: Role) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO event_roles (event_id, user_id, role) VALUES ($1, $2, $3::event_role_kind)
         ON CONFLICT DO NOTHING",
    )
    .bind(event)
    .bind(user)
    .bind(role.as_str())
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::User(user));
    Ok(())
}

pub async fn remove_role(ctx: &mut Ctx, event: Uuid, user: Uuid, role: Role) -> sqlx::Result<()> {
    sqlx::query("DELETE FROM event_roles WHERE event_id = $1 AND user_id = $2 AND role = $3::event_role_kind")
        .bind(event)
        .bind(user)
        .bind(role.as_str())
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::User(user));
    Ok(())
}

/// Once a seller is paid out, the settlement is final: no more sales, returns or undos
/// for their items. To correct it, the payout has to be taken back first.
pub async fn assert_vendor_not_paid_out(
    conn: &mut PgConnection,
    event: Uuid,
    vendor: Uuid,
) -> AppResult<()> {
    let paid: Option<bool> = sqlx::query_scalar(
        "SELECT payout_received FROM event_sellers WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event)
    .bind(vendor)
    .fetch_optional(conn)
    .await?;
    if paid == Some(true) {
        return Err(AppError::bad_request("seller.paidOutUndoFirst"));
    }
    Ok(())
}

/// The first event of the list the user organizes; administrators get the item's latest
/// event.
pub async fn find_organizer_event(
    conn: &mut PgConnection,
    events: &[Uuid],
    user: Uuid,
) -> sqlx::Result<Option<Uuid>> {
    let organized: Option<Uuid> = sqlx::query_scalar(
        "SELECT event_id FROM event_roles
         WHERE event_id = ANY($1) AND user_id = $2 AND role IN ('organizer', 'coorganizer')
         ORDER BY array_position($1, event_id) LIMIT 1",
    )
    .bind(events)
    .bind(user)
    .fetch_optional(&mut *conn)
    .await?;
    if organized.is_some() || events.is_empty() || !is_platform_admin(conn, Some(user)).await? {
        return Ok(organized);
    }
    sqlx::query_scalar("SELECT id FROM events WHERE id = ANY($1) ORDER BY start_date DESC LIMIT 1")
        .bind(events)
        .fetch_optional(conn)
        .await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductUserArgs {
    product_id: Id,
    user_id: Option<Id>,
}

async fn is_organizer_of_any_product_event(
    ctx: &mut Ctx,
    args: ProductUserArgs,
) -> AppResult<Option<Uuid>> {
    let Some(user) = args.user_id else {
        return Ok(None);
    };
    ctx.read(Topic::Product(args.product_id.0));
    ctx.read(Topic::User(user.0));
    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT event_id FROM event_products WHERE product_id = $1 ORDER BY created_at",
    )
    .bind(args.product_id.0)
    .fetch_all(ctx.conn())
    .await?;
    Ok(find_organizer_event(ctx.conn(), &events, user.0).await?)
}

/// A seller of the event with their sales totals and payout state.
#[skip_serializing_none]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorWithCalculations {
    #[serde(flatten)]
    pub user: User,
    pub total_revenue: Decimal,
    pub commission: Decimal,
    /// Fixed fee per accepted item, kept from the payout
    pub intake_fee: IntakeFee,
    /// Sales minus commission and intake fee; negative when the seller owes the bazaar
    pub payout: Decimal,
    pub paid: bool,
    pub gross_revenue: Decimal,
    pub total_discount: Decimal,
    pub is_helper: bool,
    /// Seller number of this event; missing for sellers from before numbers existed
    pub seller_number: Option<i32>,
    /// Bazaars with fixedSellerData: name and address are recorded (first item accepted).
    /// Before, the team checks them against the ID card and the seller may still correct them.
    pub details_recorded: Option<bool>,
}

/// Sellers of an event with their sales totals and payout state. No permission check.
///
/// Sellers are found by role, seller row and sales, so one whose role is gone (account
/// deleted) stays in the settlement. Once the bazaar is over, or the account deleted,
/// name, address and contact come from the snapshot of the seller row.
pub async fn load_vendors_with_calculations(
    ctx: &mut Ctx,
    event_id: Uuid,
) -> AppResult<Vec<VendorWithCalculations>> {
    ctx.read(Topic::Event(event_id));
    let Some(event) = docs::event(ctx.conn(), event_id).await? else {
        return Ok(Vec::new());
    };
    let vendor_ids: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM (
           SELECT user_id, created_at, 0 AS source FROM event_roles WHERE event_id = $1 AND role = 'seller'
           UNION ALL SELECT user_id, created_at, 1 FROM event_sellers WHERE event_id = $1
           UNION ALL SELECT seller_id, created_at, 2 FROM purchases WHERE event_id = $1
         ) sellers
         GROUP BY user_id
         ORDER BY min(source), min(created_at) FILTER (WHERE source = 0), min(created_at), user_id",
    )
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;
    let accepted = if event.resolved_features().intake_fee.is_some() {
        sales::accepted_items_by_seller(ctx.conn(), event_id).await?
    } else {
        Default::default()
    };
    let helpers: Vec<Uuid> = sqlx::query_scalar(
        "SELECT user_id FROM event_roles WHERE event_id = $1 AND role = 'coorganizer'",
    )
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;

    let all_purchases = docs::purchases_where(ctx.conn(), "event_id = $1", event_id).await?;
    let mut vendors = Vec::new();
    let users = docs::users(ctx.conn(), &vendor_ids).await?;
    let over = event.end_date < Utc::now();
    let keeps_record = keeps_seller_record(&event);
    for vendor in vendor_ids {
        let Some(mut user) = users.iter().find(|user| user.id == vendor).cloned() else {
            continue;
        };
        ctx.read(Topic::User(vendor));
        let purchases: Vec<_> = all_purchases
            .iter()
            .filter(|purchase| purchase.seller_id == vendor)
            .collect();
        let total_revenue: Decimal = purchases.iter().map(|p| p.total_amount).sum();
        let commission: Decimal = purchases.iter().map(|p| p.commission_amount).sum();
        let sales_payout: Decimal = purchases.iter().map(|p| p.payout_amount).sum();
        let gross_revenue: Decimal = purchases.iter().map(|p| sales::list_price(p)).sum();
        let seller = docs::event_seller(ctx.conn(), event_id, vendor).await?;
        if (over || user.status.as_deref() == Some("deleted"))
            && let Some(snapshot) = seller.as_ref().and_then(|s| s.seller_snapshot.as_ref())
        {
            user = with_snapshot(user, snapshot);
        }
        let intake_fee = sales::intake_fee_of(
            &event,
            seller.as_ref(),
            accepted.get(&vendor).copied().unwrap_or(0),
        );
        vendors.push(VendorWithCalculations {
            user,
            total_revenue,
            commission,
            intake_fee,
            payout: sales_payout - intake_fee.total,
            paid: seller.as_ref().is_some_and(|seller| seller.payout_received),
            gross_revenue,
            total_discount: gross_revenue - total_revenue,
            is_helper: helpers.contains(&vendor),
            details_recorded: keeps_record.then(|| {
                seller
                    .as_ref()
                    .is_some_and(|seller| seller.seller_snapshot.is_some())
            }),
            seller_number: seller.and_then(|seller| seller.number),
        });
    }
    Ok(vendors)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventArgs {
    event_id: Id,
}

async fn get_vendors_for_event(
    ctx: &mut Ctx,
    args: EventArgs,
) -> AppResult<Vec<VendorWithCalculations>> {
    require_team(ctx, args.event_id.0).await?;
    load_vendors_with_calculations(ctx, args.event_id.0).await
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UserArgs {
    user_id: Id,
}

async fn is_seller(ctx: &mut Ctx, args: UserArgs) -> AppResult<bool> {
    ctx.read(Topic::User(args.user_id.0));
    Ok(sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM event_roles WHERE user_id = $1 AND role = 'seller')",
    )
    .bind(args.user_id.0)
    .fetch_one(ctx.conn())
    .await?)
}

async fn get_co_organizer_ids_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<Uuid>> {
    require_team(ctx, args.event_id.0).await?;
    ctx.read(Topic::Event(args.event_id.0));
    Ok(sqlx::query_scalar(
        "SELECT user_id FROM event_roles WHERE event_id = $1 AND role = 'coorganizer' ORDER BY created_at",
    )
    .bind(args.event_id.0)
    .fetch_all(ctx.conn())
    .await?)
}

async fn get_my_roles_for_event(ctx: &mut Ctx, args: EventArgs) -> AppResult<Vec<String>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(user));
    if is_platform_admin(ctx.conn(), Some(user)).await? {
        return Ok(vec!["organizer".to_owned()]);
    }
    Ok(sqlx::query_scalar(
        "SELECT role::text FROM event_roles WHERE event_id = $1 AND user_id = $2 ORDER BY created_at",
    )
    .bind(args.event_id.0)
    .bind(user)
    .fetch_all(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventsArgs {
    event_ids: Vec<Id>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EventRoles {
    event_id: Uuid,
    roles: Vec<String>,
}

async fn get_my_roles_for_events(ctx: &mut Ctx, args: EventsArgs) -> AppResult<Vec<EventRoles>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(user));
    let ids: Vec<Uuid> = args.event_ids.iter().map(|id| id.0).collect();
    let rows: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT event_id, role::text FROM event_roles WHERE user_id = $1 AND event_id = ANY($2)
         ORDER BY created_at",
    )
    .bind(user)
    .bind(ids)
    .fetch_all(ctx.conn())
    .await?;
    let mut by_event: Vec<EventRoles> = Vec::new();
    for (event_id, role) in rows {
        match by_event.iter_mut().find(|entry| entry.event_id == event_id) {
            Some(entry) if !entry.roles.contains(&role) => entry.roles.push(role),
            Some(_) => {}
            None => by_event.push(EventRoles {
                event_id,
                roles: vec![role],
            }),
        }
    }
    Ok(by_event)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventUserArgs {
    event_id: Id,
    user_id: Id,
}

#[derive(Serialize)]
struct Success {
    success: bool,
}

async fn organizer_of(ctx: &mut Ctx, event: Uuid) -> AppResult<Uuid> {
    let viewer = ctx.require_user()?;
    if !has_role_or_admin(ctx.conn(), event, viewer, Role::Organizer).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let organizer: Option<Uuid> =
        sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
            .bind(event)
            .fetch_optional(ctx.conn())
            .await?;
    organizer.ok_or_else(|| AppError::not_found("notFound.event"))
}

/// The organizer makes a seller of the event a helper (co-organizer).
async fn add_co_organizer_for_event(ctx: &mut Ctx, args: EventUserArgs) -> AppResult<Success> {
    let (event, user) = (args.event_id.0, args.user_id.0);
    if organizer_of(ctx, event).await? == user {
        return Err(AppError::bad_request("seller.organizerHasAll"));
    }
    if !has_role(ctx.conn(), event, user, Role::Seller).await? {
        return Err(AppError::bad_request("seller.notParticipant"));
    }
    add_role(ctx, event, user, Role::Coorganizer).await?;
    Ok(Success { success: true })
}

async fn remove_co_organizer_for_event(ctx: &mut Ctx, args: EventUserArgs) -> AppResult<Success> {
    let (event, user) = (args.event_id.0, args.user_id.0);
    if organizer_of(ctx, event).await? == user {
        return Err(AppError::bad_request("seller.organizerRoleFixed"));
    }
    remove_role(ctx, event, user, Role::Coorganizer).await?;
    // Their devices may keep the keys of the sellers' ID codes
    super::offline::renew_check_in_keys(ctx, event).await?;
    Ok(Success { success: true })
}

/// The organizer hands the event over to one of its helpers, e.g. before deleting their
/// account, so the settlement keeps an owner. The former organizer stays as helper.
async fn transfer_organizer(ctx: &mut Ctx, args: EventUserArgs) -> AppResult<Success> {
    let (event, user) = (args.event_id.0, args.user_id.0);
    let organizer = organizer_of(ctx, event).await?;
    if organizer == user {
        return Err(AppError::bad_request("seller.organizerHasAll"));
    }
    if !has_role(ctx.conn(), event, user, Role::Coorganizer).await? {
        return Err(AppError::bad_request("seller.notHelper"));
    }
    sqlx::query("UPDATE events SET organizer_id = $2 WHERE id = $1")
        .bind(event)
        .bind(user)
        .execute(ctx.conn())
        .await?;
    remove_role(ctx, event, user, Role::Coorganizer).await?;
    add_role(ctx, event, user, Role::Organizer).await?;
    remove_role(ctx, event, organizer, Role::Organizer).await?;
    add_role(ctx, event, organizer, Role::Coorganizer).await?;
    ctx.touch(Topic::Events);
    Ok(Success { success: true })
}
