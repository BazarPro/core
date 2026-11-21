//! Items left over at the end of a bazaar (#305): the team returns them at once, or the
//! nightly cron does the night after the bazaar and settles sellers without money.

use crate::common;

use axum::http::StatusCode;
use bazarpro_backend::jobs;
use common::Reply;
use common::desk::Desk;
use common::fixtures;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

/// Ends the bazaar `ago` (an interval) before now.
async fn end(desk: &Desk, ago: &str) {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE events SET start_date = now() - interval '{ago}' - interval '5 hours',
           end_date = now() - interval '{ago}' WHERE id = $1"
    )))
    .bind(desk.event)
    .execute(&desk.db)
    .await
    .unwrap();
}

/// Runs the nightly cron and what it schedules.
async fn run_cron(desk: &Desk) {
    let mut conn = desk.db.acquire().await.unwrap();
    jobs::enqueue(&mut conn, "retention.run", &json!({}), chrono::Utc::now())
        .await
        .unwrap();
    desk.app.run_jobs().await;
}

async fn status(desk: &Desk, relation: Uuid) -> (String, bool) {
    sqlx::query_as(
        "SELECT status::text, auto_returned_at IS NOT NULL FROM event_products WHERE id = $1",
    )
    .bind(relation)
    .fetch_one(&desk.db)
    .await
    .unwrap()
}

async fn settled(desk: &Desk, seller: Uuid) -> Option<(bool, f64)> {
    sqlx::query_as(
        "SELECT payout_received, payout_amount::float8 FROM event_sellers
         WHERE event_id = $1 AND user_id = $2",
    )
    .bind(desk.event)
    .bind(seller)
    .fetch_optional(&desk.db)
    .await
    .unwrap()
}

async fn return_leftovers(desk: &Desk, products: &[Uuid], session: &str) -> Reply {
    desk.app
        .mutation(
            "eventProducts.returnLeftovers",
            json!({ "eventId": desk.event, "productIds": products }),
            Some(session),
        )
        .await
}

/// A second seller of the bazaar.
async fn seller(desk: &Desk, name: &str) -> Uuid {
    let seller = fixtures::user(&desk.db, name).await;
    fixtures::role(&desk.db, desk.event, seller, "seller").await;
    seller
}

async fn set_features(desk: &Desk, features: Value) {
    sqlx::query("UPDATE events SET features = $2 WHERE id = $1")
        .bind(desk.event)
        .bind(features)
        .execute(&desk.db)
        .await
        .unwrap();
}

// The team, at once ---------------------------------------------------------------------

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_team_returns_what_is_left_after_the_bazaar(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (left, left_rel) = desk.item("Jacke", 20.0).await;
    let (sold, sold_rel) = desk.item("Ski", 50.0).await;
    let reply = desk.sell(json!({ "eventProductId": sold_rel })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let announced = fixtures::product(&db, desk.seller, "Helm", 10.0).await;
    let announced_rel = fixtures::event_product(&db, desk.event, announced, "announced").await;
    // A seller paid out already: their settlement is done
    let paid = seller(&desk, "Paula").await;
    fixtures::event_seller(&db, desk.event, paid, 2, true).await;
    let (paid_item, paid_rel) = desk.item_of(paid, "Rad", 80.0).await;
    let all = [left, sold, announced, paid_item];

    // Not while the bazaar runs
    let reply = return_leftovers(&desk, &all, &desk.team).await;
    assert_eq!(reply.body["code"], "leftovers.notOver", "{}", reply.body);

    end(&desk, "1 hour").await;
    // Taken in after the team looked: not part of what they confirmed
    let (_, late_rel) = desk.item("Mütze", 5.0).await;
    // Only the team with the return right
    let as_seller = fixtures::session(&db, desk.seller).await;
    let reply = return_leftovers(&desk, &all, &as_seller).await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN, "{}", reply.body);

    let reply = return_leftovers(&desk, &all, &desk.team).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        reply.body["value"],
        json!({ "returnedCount": 1, "sellerCount": 1 })
    );
    assert_eq!(status(&desk, left_rel).await, ("returned".into(), false));
    assert_eq!(status(&desk, sold_rel).await, ("sold".into(), false));
    assert_eq!(
        status(&desk, announced_rel).await,
        ("announced".into(), false)
    );
    assert_eq!(status(&desk, paid_rel).await, ("available".into(), false));
    assert_eq!(status(&desk, late_rel).await, ("available".into(), false));

    // A second click changes nothing
    let reply = return_leftovers(&desk, &all, &desk.team).await;
    assert_eq!(reply.body["value"]["returnedCount"], 0);
}

// The cron, the night after -------------------------------------------------------------

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_night_after_the_bazaar_the_rest_goes_back_and_sellers_without_money_are_settled(
    db: PgPool,
) {
    let desk = Desk::new(db.clone(), json!({})).await;
    // The seller sold one item, one is left
    let (_, sold_rel) = desk.item("Ski", 50.0).await;
    let reply = desk.sell(json!({ "eventProductId": sold_rel })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let (_, left_rel) = desk.item("Jacke", 20.0).await;
    // Another sold nothing: settled with 0 €; their announced item stays as it is
    let nothing = seller(&desk, "Nora").await;
    let (_, nothing_rel) = desk.item_of(nothing, "Rad", 80.0).await;
    let announced = fixtures::product(&db, nothing, "Helm", 10.0).await;
    let announced_rel = fixtures::event_product(&db, desk.event, announced, "announced").await;
    // One who never handed anything in has nothing to settle
    let absent = seller(&desk, "Abwesend").await;
    let never = fixtures::product(&db, absent, "Schlitten", 10.0).await;
    fixtures::event_product(&db, desk.event, never, "announced").await;

    // Not while the bazaar runs
    run_cron(&desk).await;
    assert_eq!(status(&desk, left_rel).await, ("available".into(), false));

    end(&desk, "2 hours").await;
    run_cron(&desk).await;
    assert_eq!(status(&desk, left_rel).await, ("returned".into(), true));
    assert_eq!(status(&desk, nothing_rel).await, ("returned".into(), true));
    assert_eq!(status(&desk, sold_rel).await, ("sold".into(), false));
    assert_eq!(
        status(&desk, announced_rel).await,
        ("announced".into(), false)
    );
    // Money changed hands: the team settles
    assert_eq!(settled(&desk, desk.seller).await, None);
    assert_eq!(settled(&desk, nothing).await, Some((true, 0.0)));
    assert_eq!(settled(&desk, absent).await, None);

    // The team sees which ones the cron returned
    let reply = desk
        .app
        .query(
            "eventProducts.getProductsForEventManagement",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    let products = reply.body["value"].as_array().unwrap();
    let auto: Vec<&str> = products
        .iter()
        .filter(|p| p["autoReturnedAt"].is_number())
        .map(|p| p["title"].as_str().unwrap())
        .collect();
    assert_eq!(auto.len(), 2, "{auto:?}");
    // Nobody saw them picked up: "noch abzuholen" still reaches their sellers
    let reply = desk
        .app
        .query(
            "broadcasts.getBroadcastPreview",
            json!({ "eventId": desk.event, "audience": "pickup" }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.body["value"]["recipients"], 2, "{}", reply.body);

    // Once per bazaar: what the team takes back in stays, a second run changes nothing
    let reply = desk
        .app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": left_rel, "status": "available" }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(status(&desk, left_rel).await, ("available".into(), false));
    run_cron(&desk).await;
    assert_eq!(status(&desk, left_rel).await, ("available".into(), false));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_intake_fee_keeps_the_seller_open(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "intakeFee": 1 })).await;
    let (_, rel) = desk.item("Jacke", 20.0).await;
    end(&desk, "2 hours").await;
    run_cron(&desk).await;
    assert_eq!(status(&desk, rel).await, ("returned".into(), true));
    // The fee is still to be collected
    assert_eq!(settled(&desk, desk.seller).await, None);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_cron_waits_for_the_pickup_and_for_bazaars_that_turned_it_off(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "autoReturn": false })).await;
    let (_, rel) = desk.item("Jacke", 20.0).await;
    end(&desk, "2 hours").await;
    run_cron(&desk).await;
    assert_eq!(status(&desk, rel).await, ("available".into(), false));
    assert_eq!(settled(&desk, desk.seller).await, None);

    // Turned on again, but the pickup is still on
    set_features(&desk, json!({ "autoReturn": true })).await;
    sqlx::query("UPDATE events SET pickup_end = now() + interval '1 hour' WHERE id = $1")
        .bind(desk.event)
        .execute(&db)
        .await
        .unwrap();
    run_cron(&desk).await;
    assert_eq!(status(&desk, rel).await, ("available".into(), false));

    sqlx::query("UPDATE events SET pickup_end = now() - interval '1 minute' WHERE id = $1")
        .bind(desk.event)
        .execute(&db)
        .await
        .unwrap();
    run_cron(&desk).await;
    assert_eq!(status(&desk, rel).await, ("returned".into(), true));
    assert_eq!(settled(&desk, desk.seller).await, Some((true, 0.0)));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn bazaars_long_over_are_left_alone(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, rel) = desk.item("Jacke", 20.0).await;
    // The settlement is over: nothing may change any more
    end(&desk, "4 months").await;
    run_cron(&desk).await;
    assert_eq!(status(&desk, rel).await, ("available".into(), false));
}
