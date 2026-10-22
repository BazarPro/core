//! Tests that the cash desk does not wait in deadlocks: they measure time, so they run
//! as a binary of their own, after tests/api, whose parallel tests would slow them down.

mod common;

use axum::http::StatusCode;
use common::desk::Desk;
use serde_json::json;
use sqlx::PgPool;

/// Scanned twice, or "Verkaufen" clicked twice: one sale wins, the other fails right away
/// with "not for sale" instead of waiting in a deadlock until Postgres breaks it (1 s
/// each, up to 30 retries).
#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_same_item_sold_twice_at_once_fails_fast(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let start = std::time::Instant::now();
    for round in 0..5 {
        let (product, relation) = desk.item(&format!("Ski {round}"), 20.0).await;
        let args = json!({ "eventProductId": relation });
        let (a, b) = tokio::join!(desk.sell(args.clone()), desk.sell(args));
        let (won, lost) = if a.status == StatusCode::OK {
            (&a, &b)
        } else {
            (&b, &a)
        };
        assert_eq!(won.status, StatusCode::OK, "{}", won.body);
        assert_eq!(lost.body["code"], "product.notForSale", "{}", lost.body);
        let purchases: i64 =
            sqlx::query_scalar("SELECT count(*) FROM purchases WHERE product_id = $1")
                .bind(product)
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(purchases, 1);
    }
    assert!(
        start.elapsed() < std::time::Duration::from_secs(3),
        "took {:?}",
        start.elapsed()
    );
}

/// Two desks sell two items of the same seller at the same moment. The first sale used to
/// create the seller's unsubscribe token: a deadlock with the other sale's foreign keys,
/// broken by Postgres only after a second.
#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn two_items_of_one_seller_sell_at_once_without_waiting(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let start = std::time::Instant::now();
    for round in 0..5 {
        let (_, first) = desk.item(&format!("Ski {round}"), 20.0).await;
        let (_, second) = desk.item(&format!("Stöcke {round}"), 5.0).await;
        let (a, b) = tokio::join!(
            desk.sell(json!({ "eventProductId": first })),
            desk.sell(json!({ "eventProductId": second }))
        );
        assert_eq!(a.status, StatusCode::OK, "{}", a.body);
        assert_eq!(b.status, StatusCode::OK, "{}", b.body);
    }
    assert!(
        start.elapsed() < std::time::Duration::from_secs(3),
        "took {:?}",
        start.elapsed()
    );
}
