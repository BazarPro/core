//! Sellers of an event: joining, leaving, payout (convex/eventSeller.ts).

use serde::Deserialize;
use uuid::Uuid;

use super::docs;
use super::seller_records::keeps_seller_record;
use crate::error::AppResult;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "eventSeller.removeSellerAndCoorganizerRoles" => remove_seller_and_coorganizer_roles);
}

/// The user leaves every event as seller and helper; their items are taken out of the
/// events. A bazaar that keeps a record of who offered what keeps the user's items.
pub async fn remove_seller_and_coorganizer_roles_for_user(
    ctx: &mut Ctx,
    user: Uuid,
) -> AppResult<()> {
    let events: Vec<Uuid> = sqlx::query_scalar(
        "SELECT DISTINCT event_id FROM event_roles WHERE user_id = $1 AND role IN ('seller', 'coorganizer')",
    )
    .bind(user)
    .fetch_all(ctx.conn())
    .await?;
    for event_id in events {
        let seller: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM event_roles WHERE event_id = $1 AND user_id = $2 AND role = 'seller')",
        )
        .bind(event_id)
        .bind(user)
        .fetch_one(ctx.conn())
        .await?;
        let keeps_record = match docs::event(ctx.conn(), event_id).await? {
            Some(event) => keeps_seller_record(&event),
            None => false,
        };
        if seller && !keeps_record {
            sqlx::query(
                "DELETE FROM event_products ep USING products p
                 WHERE ep.product_id = p.id AND ep.event_id = $1 AND p.vendor_id = $2",
            )
            .bind(event_id)
            .bind(user)
            .execute(ctx.conn())
            .await?;
        }
        sqlx::query("DELETE FROM event_roles WHERE event_id = $1 AND user_id = $2 AND role IN ('seller', 'coorganizer')")
            .bind(event_id)
            .bind(user)
            .execute(ctx.conn())
            .await?;
        ctx.touch(Topic::Event(event_id));
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
