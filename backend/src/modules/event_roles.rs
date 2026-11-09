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
use super::event_exclusions::{Exclusion, exclusions_of_event};
use super::features::label_mark;
use super::labels::seller_sort_code;
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
    register!(registry, Query "eventRoles.getMyPermissionsForEvent" => get_my_permissions_for_event);
    register!(registry, Mutation "eventRoles.addCoOrganizerForEvent" => add_co_organizer_for_event);
    register!(registry, Mutation "eventRoles.removeCoOrganizerForEvent" => remove_co_organizer_for_event);
    register!(registry, Mutation "eventRoles.setHelperPermissions" => set_helper_permissions);
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

/// What a helper may do at the bazaar; the organizer chooses per helper (#47). Organizers
/// and administrators may always do everything, helpers without a choice too.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Permission {
    /// Intake: accept items, walk-in sellers and their items
    Intake,
    /// Cash desk: sell, undo sales, settle offline sales
    Sale,
    /// Give items back to their sellers
    Return,
    /// Settle sellers and pay them out
    Payout,
    /// See the cash summary (Kassensturz)
    CashSummary,
}

impl Permission {
    pub const ALL: [Permission; 5] = [
        Self::Intake,
        Self::Sale,
        Self::Return,
        Self::Payout,
        Self::CashSummary,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Intake => "intake",
            Self::Sale => "sale",
            Self::Return => "return",
            Self::Payout => "payout",
            Self::CashSummary => "cashSummary",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|p| p.as_str() == value)
    }

    /// The error when the helper lacks it
    fn missing(self) -> AppError {
        AppError::forbidden(match self {
            Self::Intake => "helper.intake",
            Self::Sale => "helper.sale",
            Self::Return => "helper.return",
            Self::Payout => "helper.payout",
            Self::CashSummary => "helper.cashSummary",
        })
    }
}

/// The stored choice as permissions: none stored means all. Unknown names are left out.
fn permissions_of(stored: Option<Vec<String>>) -> Vec<Permission> {
    match stored {
        None => Permission::ALL.to_vec(),
        Some(names) => Permission::ALL
            .into_iter()
            .filter(|p| names.iter().any(|name| Permission::parse(name) == Some(*p)))
            .collect(),
    }
}

/// For storing: in the order of `Permission::ALL`, each once.
fn permission_names(permissions: &[Permission]) -> Vec<&'static str> {
    Permission::ALL
        .into_iter()
        .filter(|p| permissions.contains(p))
        .map(Permission::as_str)
        .collect()
}

/// What the user may do at the event: all for organizers and administrators, the chosen
/// for helpers; `None` outside the event team. One look at the roles, so the team check
/// and the permissions come from the same answer.
pub async fn team_permissions(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
) -> sqlx::Result<Option<Vec<Permission>>> {
    if is_platform_admin(conn, Some(user)).await? {
        return Ok(Some(Permission::ALL.to_vec()));
    }
    let roles: Vec<(String, Option<Vec<String>>)> = sqlx::query_as(
        "SELECT role::text, permissions FROM event_roles
         WHERE event_id = $1 AND user_id = $2 AND role IN ('organizer', 'coorganizer')",
    )
    .bind(event)
    .bind(user)
    .fetch_all(conn)
    .await?;
    if roles
        .iter()
        .any(|(role, _)| role == Role::Organizer.as_str())
    {
        return Ok(Some(Permission::ALL.to_vec()));
    }
    Ok(roles
        .into_iter()
        .next()
        .map(|(_, stored)| permissions_of(stored)))
}

/// What the user may do at the event; nothing outside the team.
pub async fn permissions(
    conn: &mut PgConnection,
    event: Uuid,
    user: Uuid,
) -> sqlx::Result<Vec<Permission>> {
    Ok(team_permissions(conn, event, user)
        .await?
        .unwrap_or_default())
}

/// Signed in and in the event team with the permission. Outside the team the answer is the
/// same as for `require_team`, helpers learn which permission they lack.
pub async fn require_permission(
    ctx: &mut Ctx,
    event: Uuid,
    permission: Permission,
) -> AppResult<Uuid> {
    require_permission_or(ctx, event, permission, "auth.forbidden").await
}

/// `require_permission` with its own error for users outside the team.
pub async fn require_permission_or(
    ctx: &mut Ctx,
    event: Uuid,
    permission: Permission,
    outside_team: &'static str,
) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    // The answer of a query depends on the choice, which is stored on the role
    ctx.read(Topic::Event(event));
    match team_permissions(ctx.conn(), event, user).await? {
        None => Err(AppError::forbidden(outside_team)),
        Some(permissions) if !permissions.contains(&permission) => Err(permission.missing()),
        Some(_) => Ok(user),
    }
}

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

/// Neither administrator nor in the event team nor selling items there, and the event is
/// public: sees the event and its items like a visitor without an account, so the answers are
/// shared (`rpc::Audience`). Other events show visitors nothing, signed-in users more.
pub async fn is_bystander(conn: &mut PgConnection, event: Uuid, user: Uuid) -> sqlx::Result<bool> {
    if is_platform_admin(conn, Some(user)).await? {
        return Ok(false);
    }
    let team: Vec<&str> = TEAM.iter().map(|role| role.as_str()).collect();
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM events WHERE id = $1 AND visibility = 'public')
            AND NOT EXISTS (SELECT 1 FROM events WHERE id = $1 AND organizer_id = $2)
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
    /// What the helper may do; only for helpers
    pub helper_permissions: Option<Vec<Permission>>,
    /// Seller number of this event; missing for sellers from before numbers existed
    pub seller_number: Option<i32>,
    /// The seller's lasting code, on bazaars with universal labels
    pub sort_code: Option<i32>,
    /// Bazaars with fixedSellerData: name and address are recorded (first item accepted).
    /// Before, the team checks them against the ID card and the seller may still correct them.
    pub details_recorded: Option<bool>,
    /// The organizer took the seller out of the bazaar
    pub excluded: Option<Exclusion>,
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
    let helpers: Vec<(Uuid, Option<Vec<String>>)> = sqlx::query_as(
        "SELECT user_id, permissions FROM event_roles WHERE event_id = $1 AND role = 'coorganizer'",
    )
    .bind(event_id)
    .fetch_all(ctx.conn())
    .await?;

    let exclusions = exclusions_of_event(ctx.conn(), event_id).await?;
    let all_purchases = docs::purchases_where(ctx.conn(), "event_id = $1", event_id).await?;
    let mut vendors = Vec::new();
    let users = docs::users(ctx.conn(), &vendor_ids).await?;
    let over = event.end_date < Utc::now();
    let keeps_record = keeps_seller_record(&event);
    let universal = label_mark(&event) == "universal";
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
        let sort_code = if universal {
            seller_sort_code(ctx, vendor).await?
        } else {
            None
        };
        let helper_permissions = helpers
            .iter()
            .find(|(user, _)| *user == vendor)
            .map(|(_, stored)| permissions_of(stored.clone()));
        vendors.push(VendorWithCalculations {
            user,
            total_revenue,
            commission,
            intake_fee,
            payout: sales_payout - intake_fee.total,
            paid: seller.as_ref().is_some_and(|seller| seller.payout_received),
            gross_revenue,
            total_discount: gross_revenue - total_revenue,
            is_helper: helper_permissions.is_some(),
            helper_permissions,
            details_recorded: keeps_record.then(|| {
                seller
                    .as_ref()
                    .is_some_and(|seller| seller.seller_snapshot.is_some())
            }),
            seller_number: seller.and_then(|seller| seller.number),
            sort_code,
            excluded: exclusions
                .iter()
                .find(|(user, _)| *user == vendor)
                .map(|(_, exclusion)| exclusion.clone()),
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

/// What the signed-in user may do at the event (`Permission`); empty outside the team.
async fn get_my_permissions_for_event(
    ctx: &mut Ctx,
    args: EventArgs,
) -> AppResult<Vec<Permission>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::User(user));
    ctx.read(Topic::Event(args.event_id.0));
    Ok(permissions(ctx.conn(), args.event_id.0, user).await?)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AddHelperArgs {
    event_id: Id,
    user_id: Id,
    /// What the helper may do; without it everything
    permissions: Option<Vec<Permission>>,
}

/// The organizer makes a seller of the event a helper (co-organizer).
async fn add_co_organizer_for_event(ctx: &mut Ctx, args: AddHelperArgs) -> AppResult<Success> {
    let (event, user) = (args.event_id.0, args.user_id.0);
    if organizer_of(ctx, event).await? == user {
        return Err(AppError::bad_request("seller.organizerHasAll"));
    }
    if !has_role(ctx.conn(), event, user, Role::Seller).await? {
        return Err(AppError::bad_request("seller.notParticipant"));
    }
    add_role(ctx, event, user, Role::Coorganizer).await?;
    // Also when already a helper: appointing again sets the rights anew
    store_permissions(ctx, event, user, args.permissions.as_deref()).await?;
    Ok(Success { success: true })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PermissionsArgs {
    event_id: Id,
    user_id: Id,
    permissions: Vec<Permission>,
}

/// The organizer changes what a helper may do.
async fn set_helper_permissions(ctx: &mut Ctx, args: PermissionsArgs) -> AppResult<Success> {
    let (event, user) = (args.event_id.0, args.user_id.0);
    organizer_of(ctx, event).await?;
    if !has_role(ctx.conn(), event, user, Role::Coorganizer).await? {
        return Err(AppError::bad_request("seller.notHelper"));
    }
    store_permissions(ctx, event, user, Some(&args.permissions)).await?;
    Ok(Success { success: true })
}

/// Stores what the helper may do; `None`: everything.
async fn store_permissions(
    ctx: &mut Ctx,
    event: Uuid,
    user: Uuid,
    permissions: Option<&[Permission]>,
) -> sqlx::Result<()> {
    sqlx::query(
        "UPDATE event_roles SET permissions = $3
         WHERE event_id = $1 AND user_id = $2 AND role = 'coorganizer'",
    )
    .bind(event)
    .bind(user)
    .bind(permissions.map(permission_names))
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Event(event));
    ctx.touch(Topic::User(user));
    Ok(())
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
