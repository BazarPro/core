//! Online price offers: buyers propose a price, the seller accepts or rejects, the
//! cash desk redeems an accepted offer.

use chrono::{DateTime, Duration, Utc};
use futures::FutureExt;
use futures::future::BoxFuture;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::docs::{self, Product, User};
use super::event_products::{find_active_listing, relation_by_id};
use super::event_roles::{TEAM, has_any_role_or_admin};
use super::features::are_offers_open;
use super::notifications::{self, Area, Category, Content, T, format_euro};
use super::purchases::current_list_price;
use crate::AppState;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms};

pub const EXPIRE_JOB: &str = "offers.expireOffersOfEndedEvents";
const MAX_MESSAGE_LENGTH: usize = 300;
const EXPIRE_BATCH_SIZE: i64 = 200;

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "offers.makeOffer" => make_offer);
    register!(registry, Mutation "offers.withdrawOffer" => withdraw_offer);
    register!(registry, Mutation "offers.respondToOffer" => respond_to_offer);
    register!(registry, Query "offers.getOffersForProduct" => get_offers_for_product);
    register!(registry, Query "offers.getOffersForStaff" => get_offers_for_staff);
    register!(registry, Query "offers.getMyOfferForProduct" => get_my_offer_for_product);
    register!(registry, Query "offers.getAcceptedOffersForEventProduct" => get_accepted_offers_for_event_product);
    register!(registry, InternalMutation "offers.expireOffersOfEndedEvents" => expire_offers_of_ended_events);
}

/// How the app greets a user in mails and lists: first name, else the first word of the
/// name.
pub fn display_name(user: Option<&User>, t: T) -> String {
    let Some(user) = user else {
        return t.t("common.unknown", &[]);
    };
    user.first_name
        .clone()
        .filter(|name| !name.is_empty())
        .or_else(|| {
            user.name
                .as_deref()
                .and_then(|n| n.split(' ').next())
                .filter(|n| !n.is_empty())
                .map(str::to_owned)
        })
        .unwrap_or_else(|| t.t("common.someone", &[]))
}

/// Who answers for an item: its seller, or for walk-in sellers without login the
/// organizers of the event that created them.
pub async fn can_act_for_seller(
    ctx: &mut Ctx,
    product: &Product,
    user: Uuid,
) -> sqlx::Result<bool> {
    if product.vendor_id == user {
        return Ok(true);
    }
    let managed_by: Option<Uuid> =
        sqlx::query_scalar("SELECT managed_by_event_id FROM users WHERE id = $1")
            .bind(product.vendor_id)
            .fetch_optional(ctx.conn())
            .await?
            .flatten();
    match managed_by {
        Some(event) => has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await,
        None => Ok(false),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MakeArgs {
    product_id: Id,
    amount: f64,
    message: Option<String>,
}

/// A buyer proposes (or changes) a price for an item at its next event; the event must
/// allow offers and the seller accept them. One open offer per buyer and item.
async fn make_offer(ctx: &mut Ctx, args: MakeArgs) -> AppResult<Uuid> {
    let user = ctx
        .user
        .ok_or_else(|| AppError::unauthorized("auth.loginToOffer"))?;
    let product = docs::product(ctx.conn(), args.product_id.0)
        .await?
        .filter(|p| p.moderation.is_none())
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if product.vendor_id == user {
        return Err(AppError::bad_request("offer.ownItem"));
    }
    if product.sold {
        return Err(AppError::bad_request("product.alreadySold"));
    }
    let now = Utc::now();
    let listing = find_active_listing(ctx.conn(), product.id, now).await?;
    let Some((event, relation)) = listing.filter(|(event, _)| {
        event.resolved_features().price_offers && product.accepts_offers == Some(true)
    }) else {
        return Err(AppError::bad_request("offer.notAllowed"));
    };
    if !are_offers_open(&relation.status, &event, now) {
        return Err(AppError::bad_request("offer.notOpenYet"));
    }
    let amount = Decimal::from_f64(args.amount)
        .map(|a| a.round_dp(2))
        .filter(|a| *a > Decimal::ZERO)
        .ok_or_else(|| AppError::bad_request("offer.invalidAmount"))?;
    let list_price = current_list_price(&product, &relation);
    if amount >= list_price {
        return Err(AppError::bad_request("offer.belowPrice"));
    }
    let message: Option<String> = args
        .message
        .map(|m| {
            m.trim()
                .chars()
                .take(MAX_MESSAGE_LENGTH)
                .collect::<String>()
        })
        .filter(|m| !m.is_empty());

    let offers: Vec<(Uuid, Uuid, String)> = sqlx::query_as(
        "SELECT id, buyer_id, status::text FROM product_offers WHERE event_product_id = $1",
    )
    .bind(relation.id)
    .fetch_all(ctx.conn())
    .await?;
    if offers
        .iter()
        .any(|(_, buyer, status)| *buyer == user && status == "accepted")
    {
        return Err(AppError::bad_request("offer.alreadyAcceptedYours"));
    }
    if offers.iter().any(|(_, _, status)| status == "accepted") {
        return Err(AppError::bad_request("offer.alreadyAcceptedOther"));
    }
    let pending = offers
        .iter()
        .find(|(_, buyer, status)| *buyer == user && status == "pending");
    let id: Uuid = match pending {
        Some((id, ..)) => {
            sqlx::query("UPDATE product_offers SET amount = $2, message = $3, created_at = now() WHERE id = $1")
                .bind(id)
                .bind(amount)
                .bind(&message)
                .execute(ctx.conn())
                .await?;
            *id
        }
        None => {
            sqlx::query_scalar(
                "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, message, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING id",
            )
            .bind(event.id)
            .bind(product.id)
            .bind(relation.id)
            .bind(user)
            .bind(amount)
            .bind(&message)
            .fetch_one(ctx.conn())
            .await?
        }
    };
    touch_offer(ctx, &product, user);

    let buyer = docs::user(ctx.conn(), user).await?;
    let (title, event_title, path) = (
        product.title.clone(),
        event.title.clone(),
        format!("/products/view/{}", product.id),
    );
    notifications::notify_user(
        ctx,
        product.vendor_id,
        |t: T| {
            let mut paragraphs = vec![t.t(
                "offer.new.text",
                &[
                    ("name", &display_name(buyer.as_ref(), t)),
                    ("title", &title),
                    ("amount", &format_euro(amount)),
                    ("price", &format_euro(list_price)),
                ],
            )];
            if let Some(message) = &message {
                paragraphs.push(t.t("offer.new.message", &[("message", message)]));
            }
            Content {
                category: Some(Category::Offers),
                subject: t.t("offer.new.subject", &[("title", &title)]),
                heading: t.t("offer.new.heading", &[]),
                paragraphs,
                link: t.link("offer.new.link", path.clone()),
                footnote: Some(t.t("offer.new.footnote", &[("event", &event_title)])),
                ..Content::default()
            }
        },
        Some(Area::Products),
        Duration::zero(),
    )
    .await?;
    Ok(id)
}

fn touch_offer(ctx: &mut Ctx, product: &Product, buyer: Uuid) {
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    ctx.touch(Topic::User(buyer));
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct OfferArgs {
    offer_id: Id,
}

#[derive(sqlx::FromRow)]
struct OfferRow {
    id: Uuid,
    event_id: Uuid,
    product_id: Uuid,
    event_product_id: Uuid,
    buyer_id: Uuid,
    amount: Decimal,
    message: Option<String>,
    status: String,
    created_at: DateTime<Utc>,
}

const OFFER_COLUMNS: &str = "id, event_id, product_id, event_product_id, buyer_id, amount, message, status::text AS status, created_at";

async fn offer(ctx: &mut Ctx, id: Uuid) -> sqlx::Result<Option<OfferRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {OFFER_COLUMNS} FROM product_offers WHERE id = $1"
    )))
    .bind(id)
    .fetch_optional(ctx.conn())
    .await
}

async fn offers_for(ctx: &mut Ctx, event_product: Uuid) -> sqlx::Result<Vec<OfferRow>> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT {OFFER_COLUMNS} FROM product_offers WHERE event_product_id = $1 ORDER BY created_at"
    )))
    .bind(event_product)
    .fetch_all(ctx.conn())
    .await
}

/// The buyer takes back an open or accepted offer.
async fn withdraw_offer(ctx: &mut Ctx, args: OfferArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let offer = offer(ctx, args.offer_id.0)
        .await?
        .filter(|o| o.buyer_id == user)
        .ok_or_else(|| AppError::not_found("notFound.offer"))?;
    if offer.status != "pending" && offer.status != "accepted" {
        return Err(AppError::bad_request("offer.closed"));
    }
    sqlx::query(
        "UPDATE product_offers SET status = 'withdrawn', responded_at = now() WHERE id = $1",
    )
    .bind(offer.id)
    .execute(ctx.conn())
    .await?;
    if let Some(product) = docs::product(ctx.conn(), offer.product_id).await? {
        touch_offer(ctx, &product, user);
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RespondArgs {
    offer_id: Id,
    accept: bool,
}

/// The seller accepts or rejects an open offer. Accepting rejects all other open offers
/// for the item, so only one buyer holds a deal.
async fn respond_to_offer(ctx: &mut Ctx, args: RespondArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let offer = offer(ctx, args.offer_id.0)
        .await?
        .ok_or_else(|| AppError::not_found("notFound.offer"))?;
    let product = docs::product(ctx.conn(), offer.product_id).await?;
    let Some(product) = product else {
        return Err(AppError::forbidden("auth.forbidden"));
    };
    if !can_act_for_seller(ctx, &product, user).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    if offer.status != "pending" {
        return Err(AppError::bad_request("offer.notOpen"));
    }
    let relation = relation_by_id(ctx.conn(), offer.event_product_id)
        .await?
        .filter(|r| r.status == "announced" || r.status == "available")
        .ok_or_else(|| AppError::bad_request("product.unavailable"))?;
    let event = docs::event(ctx.conn(), offer.event_id).await?;
    let now = Utc::now();
    if args.accept
        && !event
            .as_ref()
            .is_some_and(|event| are_offers_open(&relation.status, event, now))
    {
        return Err(AppError::bad_request("offer.notOpenYet"));
    }
    let others = offers_for(ctx, offer.event_product_id).await?;
    if args.accept && others.iter().any(|other| other.status == "accepted") {
        return Err(AppError::bad_request("offer.youAccepted"));
    }
    sqlx::query(
        "UPDATE product_offers SET status = $2::offer_status, responded_at = now() WHERE id = $1",
    )
    .bind(offer.id)
    .bind(if args.accept { "accepted" } else { "rejected" })
    .execute(ctx.conn())
    .await?;
    touch_offer(ctx, &product, offer.buyer_id);
    let (title, path) = (
        product.title.clone(),
        format!("/products/view/{}", product.id),
    );
    let amount = format_euro(offer.amount);
    let event_title = event.as_ref().map(|e| e.title.clone());
    let accept = args.accept;
    notifications::notify_user(
        ctx,
        offer.buyer_id,
        |t: T| Content {
            category: Some(Category::Buyer),
            subject: if accept {
                t.t("offer.accepted.subject", &[("title", &title)])
            } else {
                t.t("offer.rejected.subject", &[("title", &title)])
            },
            heading: t.t(
                if accept {
                    "offer.accepted.heading"
                } else {
                    "offer.rejected.heading"
                },
                &[],
            ),
            paragraphs: if accept {
                vec![
                    t.t(
                        "offer.accepted.text",
                        &[("amount", &amount), ("title", &title)],
                    ),
                    match &event_title {
                        Some(event) => t.t("offer.accepted.payAt", &[("event", event)]),
                        None => t.t("offer.accepted.payAtEvent", &[]),
                    },
                ]
            } else {
                vec![t.t(
                    "offer.rejected.text",
                    &[("title", &title), ("amount", &amount)],
                )]
            },
            link: t.link("moderation.viewProduct", path.clone()),
            ..Content::default()
        },
        None,
        Duration::zero(),
    )
    .await?;
    if !accept {
        return Ok(());
    }
    for other in others
        .iter()
        .filter(|o| o.id != offer.id && o.status == "pending")
    {
        sqlx::query(
            "UPDATE product_offers SET status = 'rejected', responded_at = now() WHERE id = $1",
        )
        .bind(other.id)
        .execute(ctx.conn())
        .await?;
        ctx.touch(Topic::User(other.buyer_id));
        notifications::notify_user(
            ctx,
            other.buyer_id,
            |t: T| Content {
                category: Some(Category::Buyer),
                subject: t.t("offer.rejected.subject", &[("title", &title)]),
                heading: t.t("offer.rejected.heading", &[]),
                paragraphs: vec![t.t("offer.rejected.other", &[("title", &title)])],
                link: t.link("moderation.viewProduct", path.clone()),
                ..Content::default()
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(())
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OfferView {
    #[serde(rename = "_id")]
    id: Uuid,
    amount: Decimal,
    message: Option<String>,
    status: String,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    buyer_name: String,
}

async fn views(ctx: &mut Ctx, offers: Vec<OfferRow>, full_name: bool) -> AppResult<Vec<OfferView>> {
    let mut result = Vec::new();
    for offer in offers {
        let buyer = docs::user(ctx.conn(), offer.buyer_id).await?;
        let mut name = display_name(buyer.as_ref(), T(crate::i18n::Locale::De));
        if full_name {
            let full = buyer
                .as_ref()
                .map(|b| {
                    [b.first_name.clone(), b.last_name.clone()]
                        .into_iter()
                        .flatten()
                        .filter(|p| !p.is_empty())
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            if !full.is_empty() {
                name = full;
            }
        }
        result.push(OfferView {
            id: offer.id,
            amount: offer.amount,
            message: offer.message,
            status: offer.status,
            created_at: offer.created_at,
            buyer_name: name,
        });
    }
    Ok(result)
}

async fn open_offers_of_listing(
    ctx: &mut Ctx,
    product: Uuid,
) -> AppResult<Option<(Uuid, Vec<OfferView>)>> {
    let Some((event, relation)) = find_active_listing(ctx.conn(), product, Utc::now()).await?
    else {
        return Ok(None);
    };
    let offers: Vec<OfferRow> = offers_for(ctx, relation.id)
        .await?
        .into_iter()
        .filter(|o| o.status == "pending" || o.status == "accepted")
        .collect();
    let mut views = views(ctx, offers, false).await?;
    views.sort_by_key(|view| std::cmp::Reverse(view.amount));
    Ok(Some((event.id, views)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductArgs {
    product_id: Id,
}

/// Open offers of the item's current listing, for its seller (or walk-in organizer).
async fn get_offers_for_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<Vec<OfferView>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    ctx.read(Topic::Product(args.product_id.0));
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(Vec::new());
    };
    if !can_act_for_seller(ctx, &product, user).await? {
        return Ok(Vec::new());
    }
    Ok(open_offers_of_listing(ctx, product.id)
        .await?
        .map(|(_, v)| v)
        .unwrap_or_default())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StaffOffers {
    offers: Vec<OfferView>,
    can_respond: bool,
}

/// The offers as the event staff sees them: organizers and helpers read along; only the
/// seller (or the organizer of a walk-in seller) may answer.
async fn get_offers_for_staff(ctx: &mut Ctx, args: ProductArgs) -> AppResult<StaffOffers> {
    let empty = StaffOffers {
        offers: Vec::new(),
        can_respond: false,
    };
    let Some(user) = ctx.user else {
        return Ok(empty);
    };
    ctx.read(Topic::Product(args.product_id.0));
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(empty);
    };
    let Some((event, offers)) = open_offers_of_listing(ctx, product.id).await? else {
        return Ok(empty);
    };
    let can_respond = can_act_for_seller(ctx, &product, user).await?;
    if !can_respond && !has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await? {
        return Ok(empty);
    }
    Ok(StaffOffers {
        offers,
        can_respond,
    })
}

/// The viewer's latest offer for the item's current listing.
async fn get_my_offer_for_product(
    ctx: &mut Ctx,
    args: ProductArgs,
) -> AppResult<Option<OfferView>> {
    let Some(user) = ctx.user else {
        return Ok(None);
    };
    ctx.read(Topic::Product(args.product_id.0));
    ctx.read(Topic::User(user));
    let Some((_, relation)) =
        find_active_listing(ctx.conn(), args.product_id.0, Utc::now()).await?
    else {
        return Ok(None);
    };
    let latest = offers_for(ctx, relation.id)
        .await?
        .into_iter()
        .filter(|o| o.buyer_id == user)
        .max_by_key(|o| o.created_at);
    let Some(latest) = latest else {
        return Ok(None);
    };
    let mut view = views(ctx, vec![latest], false).await?;
    // The own offer: no buyer name to look up
    view[0].buyer_name = display_name(None, T(crate::i18n::Locale::De));
    Ok(view.pop())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EventProductArgs {
    event_product_id: Id,
}

/// Accepted offers of an item, for the cash desk, with the buyer's full name.
async fn get_accepted_offers_for_event_product(
    ctx: &mut Ctx,
    args: EventProductArgs,
) -> AppResult<Vec<OfferView>> {
    let Some(user) = ctx.user else {
        return Ok(Vec::new());
    };
    let Some(relation) = relation_by_id(ctx.conn(), args.event_product_id.0).await? else {
        return Ok(Vec::new());
    };
    if !has_any_role_or_admin(ctx.conn(), relation.event_id, user, &TEAM).await? {
        return Ok(Vec::new());
    }
    ctx.read(Topic::Event(relation.event_id));
    ctx.read(Topic::Product(relation.product_id));
    let accepted = offers_for(ctx, relation.id)
        .await?
        .into_iter()
        .filter(|o| o.status == "accepted")
        .collect();
    views(ctx, accepted, true).await
}

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
struct ExpireArgs {}

#[derive(Serialize)]
struct Expired {
    expired: i64,
    more: bool,
}

/// Offers still open or accepted when their event is over cannot be answered or redeemed
/// any more: one batch is closed and the buyers are told. `more`: run again.
async fn expire_offers_of_ended_events(ctx: &mut Ctx, _: ExpireArgs) -> AppResult<Expired> {
    let offers: Vec<OfferRow> = sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "SELECT o.{} FROM product_offers o JOIN events e ON e.id = o.event_id
         WHERE o.status IN ('pending', 'accepted') AND e.end_date < now()
         ORDER BY o.created_at LIMIT $1",
        OFFER_COLUMNS.replace(", ", ", o.")
    )))
    .bind(EXPIRE_BATCH_SIZE)
    .fetch_all(ctx.conn())
    .await?;
    for offer in &offers {
        sqlx::query(
            "UPDATE product_offers SET status = 'rejected', responded_at = now(), closed_by = 'expired',
               closed_from_status = status
             WHERE id = $1",
        )
        .bind(offer.id)
        .execute(ctx.conn())
        .await?;
        ctx.touch(Topic::Product(offer.product_id));
        ctx.touch(Topic::User(offer.buyer_id));
        let product = docs::product(ctx.conn(), offer.product_id).await?;
        let event = docs::event(ctx.conn(), offer.event_id).await?;
        let (product_title, event_title) = (product.map(|p| p.title), event.map(|e| e.title));
        let (amount, accepted) = (format_euro(offer.amount), offer.status == "accepted");
        notifications::notify_user(
            ctx,
            offer.buyer_id,
            |t: T| {
                let title = product_title
                    .clone()
                    .unwrap_or_else(|| t.t("offer.expired.item", &[]));
                let event = event_title
                    .clone()
                    .unwrap_or_else(|| t.t("offer.expired.bazaar", &[]));
                let values = [
                    ("event", event.as_str()),
                    ("amount", amount.as_str()),
                    ("title", title.as_str()),
                ];
                Content {
                    category: Some(Category::Buyer),
                    subject: t.t("offer.expired.subject", &[("title", &title)]),
                    heading: t.t("offer.expired.heading", &[]),
                    paragraphs: vec![t.t(
                        if accepted {
                            "offer.expired.accepted"
                        } else {
                            "offer.expired.pending"
                        },
                        &values,
                    )],
                    ..Content::default()
                }
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(Expired {
        expired: offers.len() as i64,
        more: offers.len() as i64 == EXPIRE_BATCH_SIZE,
    })
}

/// Hourly cron: runs the expiry batch by batch, each in its own transaction.
pub fn expire_job(state: AppState, _: Value) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        loop {
            let result =
                crate::rpc::call(&state, None, "offers.expireOffersOfEndedEvents", json!({}))
                    .await
                    .map_err(|err| anyhow::anyhow!("{err}"))?;
            if result["more"] != Value::Bool(true) {
                return Ok(());
            }
        }
    }
    .boxed()
}

#[derive(sqlx::FromRow)]
struct OpenOffer {
    id: Uuid,
    buyer_id: Uuid,
    product_id: Uuid,
    amount: rust_decimal::Decimal,
    status: String,
    closed_by: Option<String>,
    closed_from_status: Option<String>,
}

async fn offers_of(ctx: &mut Ctx, event_product: Uuid) -> sqlx::Result<Vec<OpenOffer>> {
    sqlx::query_as(
        "SELECT id, buyer_id, product_id, amount, status::text AS status, closed_by::text AS closed_by,
                closed_from_status::text AS closed_from_status
         FROM product_offers WHERE event_product_id = $1 ORDER BY created_at",
    )
    .bind(event_product)
    .fetch_all(ctx.conn())
    .await
}

/// The item was sold, returned or taken out (`reason`): its open and accepted offers end
/// and the buyers are told.
pub async fn close_offers_for_event_product(
    ctx: &mut Ctx,
    event_product: Uuid,
    title: &str,
    reason: &str,
) -> AppResult<()> {
    for offer in offers_of(ctx, event_product).await? {
        if offer.status != "pending" && offer.status != "accepted" {
            continue;
        }
        sqlx::query(
            "UPDATE product_offers SET status = 'rejected', responded_at = now(),
               closed_by = $2::offer_close_reason, closed_from_status = status
             WHERE id = $1",
        )
        .bind(offer.id)
        .bind(reason)
        .execute(ctx.conn())
        .await?;
        ctx.touch(Topic::Product(offer.product_id));
        ctx.touch(Topic::User(offer.buyer_id));
        let amount = format_euro(offer.amount);
        notifications::notify_user(
            ctx,
            offer.buyer_id,
            |t: T| Content {
                category: Some(Category::Buyer),
                subject: t.t("offer.closed.subject", &[("title", title)]),
                heading: t.t("offer.closed.heading", &[]),
                paragraphs: vec![t.t(
                    "offer.closed.text",
                    &[("title", title), ("amount", &amount)],
                )],
                ..Content::default()
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(())
}

/// Undoing a sale or return: the offers it closed are valid again, as they were before.
/// At most one offer per item can be accepted; should another one be accepted by now, the
/// restored offer comes back as pending.
pub async fn reopen_closed_offers(
    ctx: &mut Ctx,
    event_product: Uuid,
    title: &str,
    reason: &str,
) -> AppResult<()> {
    let offers = offers_of(ctx, event_product).await?;
    let mut has_accepted = offers.iter().any(|offer| offer.status == "accepted");
    for offer in offers {
        if offer.status != "rejected" || offer.closed_by.as_deref() != Some(reason) {
            continue;
        }
        let Some(from) = offer.closed_from_status.as_deref() else {
            continue;
        };
        let status = if from == "accepted" && !has_accepted {
            "accepted"
        } else {
            "pending"
        };
        if status == "accepted" {
            has_accepted = true;
        }
        sqlx::query(
            "UPDATE product_offers SET status = $2::offer_status,
               responded_at = CASE WHEN $2 = 'accepted' THEN responded_at END,
               closed_by = NULL, closed_from_status = NULL
             WHERE id = $1",
        )
        .bind(offer.id)
        .bind(status)
        .execute(ctx.conn())
        .await?;
        ctx.touch(Topic::Product(offer.product_id));
        ctx.touch(Topic::User(offer.buyer_id));
        let amount = format_euro(offer.amount);
        let path = format!("/products/view/{}", offer.product_id);
        notifications::notify_user(
            ctx,
            offer.buyer_id,
            |t: T| Content {
                category: Some(Category::Buyer),
                subject: t.t("offer.reopened.subject", &[("title", title)]),
                heading: t.t("offer.reopened.heading", &[]),
                paragraphs: vec![
                    t.t("offer.reopened.text", &[("title", title)]),
                    if status == "accepted" {
                        t.t("offer.reopened.accepted", &[("amount", &amount)])
                    } else {
                        t.t("offer.reopened.pending", &[("amount", &amount)])
                    },
                ],
                link: t.link("moderation.viewProduct", path.clone()),
                ..Content::default()
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(())
}
