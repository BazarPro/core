//! Online price offers (convex/offers.ts). So far the helpers that close and reopen
//! offers when an item is sold, returned or taken out; the rest follows with the port.

use chrono::Duration;
use uuid::Uuid;

use super::notifications::{self, Category, Content, T, format_euro};
use crate::error::AppResult;
use crate::realtime::Topic;
use crate::rpc::Ctx;

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
