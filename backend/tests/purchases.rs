//! The cash desk.

mod common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Desk {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    team: String,
    seller: Uuid,
}

impl Desk {
    async fn new(db: PgPool, features: Value) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                commission: 10,
                features,
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        let seller = fixtures::user(&db, "Seller").await;
        fixtures::role(&db, event, seller, "seller").await;
        Self {
            team: fixtures::session(&db, organizer).await,
            app,
            db,
            event,
            seller,
        }
    }

    /// An item of the seller handed in at the event; returns (product, event product).
    async fn item(&self, title: &str, price: f64) -> (Uuid, Uuid) {
        self.item_of(self.seller, title, price).await
    }

    async fn item_of(&self, seller: Uuid, title: &str, price: f64) -> (Uuid, Uuid) {
        let product = fixtures::product(&self.db, seller, title, price).await;
        let relation = fixtures::event_product(&self.db, self.event, product, "available").await;
        (product, relation)
    }

    async fn sell(&self, args: Value) -> common::Reply {
        self.app
            .mutation("purchases.sellProduct", args, Some(&self.team))
            .await
    }

    async fn cart(&self, items: Value, buyer: Option<&str>) -> common::Reply {
        let mut args = json!({ "items": items });
        if let Some(buyer) = buyer {
            args["buyerEmail"] = json!(buyer);
        }
        self.app
            .mutation("purchases.sellProducts", args, Some(&self.team))
            .await
    }

    async fn purchase(
        &self,
        product: Uuid,
    ) -> Option<(f64, f64, f64, Option<String>, Option<f64>)> {
        sqlx::query_as(
            "SELECT total_amount::float8, commission_amount::float8, payout_amount::float8, price_source::text,
                    discount_percent::float8
             FROM purchases WHERE product_id = $1",
        )
        .bind(product)
        .fetch_optional(&self.db)
        .await
        .unwrap()
    }

    async fn mails(&self) -> Vec<(String, String)> {
        self.app.run_jobs().await;
        let mut mails: Vec<(String, String)> = self
            .app
            .sent
            .lock()
            .unwrap()
            .iter()
            .map(|m| (m.to.clone(), m.subject.clone()))
            .collect();
        mails.sort();
        mails
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn half_cents_round_up_like_in_the_app(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Mütze", 1.25).await;
    let reply = desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // 10 % of 1.25 is 0.125: 0.13 commission, not 0.12 as rounding to even would give
    assert_eq!(
        desk.purchase(product).await,
        Some((1.25, 0.13, 1.12, Some("list".into()), None))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sale_records_the_price_and_mails_seller_and_buyer(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 19.99).await;
    let bad = desk
        .sell(json!({ "eventProductId": relation, "buyerEmail": "kein-mail" }))
        .await;
    assert!(
        bad.body["message"]
            .as_str()
            .unwrap()
            .contains("gültige E-Mail")
    );
    let reply = desk
        .sell(json!({ "eventProductId": relation, "buyerEmail": "kaeufer@example.com" }))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);

    // 10 % of 19.99 is 2.00 after rounding; commission and payout add up to the price
    assert_eq!(
        desk.purchase(product).await,
        Some((19.99, 2.0, 17.99, Some("list".into()), None))
    );
    let sold: (bool, String) = sqlx::query_as(
        "SELECT p.sold, ep.status::text FROM products p JOIN event_products ep ON ep.product_id = p.id WHERE p.id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(sold, (true, "sold".to_owned()));
    let mails = desk.mails().await;
    assert_eq!(
        mails,
        vec![
            ("kaeufer@example.com".into(), "Dein Kaufbeleg: Ski".into()),
            ("seller@test.example".into(), "Verkauft: Ski".into()),
        ]
    );
    let receipt = desk
        .app
        .sent
        .lock()
        .unwrap()
        .iter()
        .find(|m| m.to == "kaeufer@example.com")
        .unwrap()
        .html
        .clone();
    assert!(receipt.contains("19,99 €"));

    // Not twice
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation })).await.body["code"],
        "product.notForSale"
    );
    let marker = desk
        .app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&fixtures::session(&db, desk.seller).await),
        )
        .await;
    assert_eq!(marker.body["value"]["sales"], 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn discounts_offers_and_negotiated_prices(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "minimumPrice": true })).await;
    let (discounted, relation) = desk.item("Rabatt", 50.0).await;
    sqlx::query("UPDATE event_products SET discount_percent = 20 WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(
        desk.purchase(discounted).await,
        Some((40.0, 4.0, 36.0, Some("list".into()), Some(20.0)))
    );

    let (negotiable, relation) = desk.item("VB", 50.0).await;
    sqlx::query("UPDATE products SET minimum_price = 30 WHERE id = $1")
        .bind(negotiable)
        .execute(&db)
        .await
        .unwrap();
    let below = desk
        .sell(json!({ "eventProductId": relation, "negotiatedPrice": 25 }))
        .await;
    assert_eq!(below.body["code"], "checkout.priceRange");
    assert_eq!(
        below.body["params"],
        json!({ "min": "30,00 €", "max": "50,00 €" })
    );
    desk.sell(json!({ "eventProductId": relation, "negotiatedPrice": 35.004 }))
        .await;
    assert_eq!(
        desk.purchase(negotiable).await,
        Some((35.0, 3.5, 31.5, Some("negotiated".into()), None))
    );

    let (fixed, relation) = desk.item("Fest", 50.0).await;
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "negotiatedPrice": 40 }))
            .await
            .body["code"],
        "checkout.noNegotiation"
    );
    let buyer = fixtures::user(&db, "Buyer").await;
    let offer: Uuid = sqlx::query_scalar(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 42, 'pending') RETURNING id",
    )
    .bind(desk.event)
    .bind(fixed)
    .bind(relation)
    .bind(buyer)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
            .await
            .body["code"],
        "checkout.offerNotAccepted"
    );
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation, "offerId": offer, "negotiatedPrice": 40 }))
            .await
            .body["code"],
        "checkout.offerOrNegotiated"
    );
    sqlx::query("UPDATE product_offers SET status = 'accepted' WHERE id = $1")
        .bind(offer)
        .execute(&db)
        .await
        .unwrap();
    desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
        .await;
    assert_eq!(
        desk.purchase(fixed).await,
        Some((42.0, 4.2, 37.8, Some("offer".into()), None))
    );
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM product_offers WHERE id = $1")
            .bind(offer)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(status, "redeemed");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_cart_sells_everything_or_nothing(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let other = fixtures::user(&db, "Other").await;
    fixtures::role(&db, desk.event, other, "seller").await;
    let (a, ra) = desk.item("A", 10.0).await;
    let (b, rb) = desk.item("B", 20.0).await;
    let (c, rc) = desk.item_of(other, "C", 5.0).await;

    let reply = desk
        .cart(
            json!([{ "eventProductId": ra }, { "eventProductId": rb }, { "eventProductId": rc }]),
            Some("k@example.com"),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"]["total"], 35.0);
    assert_eq!(
        reply.body["value"]["purchaseIds"].as_array().unwrap().len(),
        3
    );
    for product in [a, b, c] {
        assert!(desk.purchase(product).await.is_some());
    }
    // One mail per seller and one receipt
    let mails = desk.mails().await;
    assert_eq!(
        mails,
        vec![
            (
                "k@example.com".into(),
                "Dein Kaufbeleg: 3 Artikel bei Basar".into()
            ),
            ("other@test.example".into(), "Verkauft: C".into()),
            (
                "seller@test.example".into(),
                "Verkauft: 2 Artikel bei Basar".into()
            ),
        ]
    );

    // One item already sold: nothing is sold, the error names it
    let (d, rd) = desk.item("D", 1.0).await;
    let failed = desk
        .cart(
            json!([{ "eventProductId": rd }, { "eventProductId": ra }]),
            None,
        )
        .await;
    assert_eq!(failed.body["code"], "checkout.itemFailed");
    assert_eq!(failed.body["cause"]["code"], "product.notForSale");
    assert_eq!(
        failed.body["message"],
        "„A“: Der Artikel ist nicht verkäuflich."
    );
    assert!(desk.purchase(d).await.is_none());

    assert_eq!(
        desk.cart(json!([]), None).await.body["code"],
        "checkout.empty"
    );
    assert_eq!(
        desk.cart(
            json!([{ "eventProductId": rd }, { "eventProductId": rd }]),
            None
        )
        .await
        .body["code"],
        "checkout.duplicate"
    );
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    let foreign = desk
        .app
        .mutation(
            "purchases.sellProducts",
            json!({ "items": [{ "eventProductId": rd }] }),
            Some(&stranger),
        )
        .await;
    assert_eq!(foreign.body["cause"]["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn items_of_two_events_cannot_be_sold_together(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, here) = desk.item("Hier", 10.0).await;
    let organizer: Uuid = sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(desk.event)
        .fetch_one(&db)
        .await
        .unwrap();
    let second = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            ..EventSpec::new("Zweiter", organizer)
        },
    )
    .await;
    let product = fixtures::product(&db, desk.seller, "Dort", 5.0).await;
    let there = fixtures::event_product(&db, second, product, "available").await;
    let reply = desk
        .cart(
            json!([{ "eventProductId": here }, { "eventProductId": there }]),
            None,
        )
        .await;
    assert_eq!(reply.body["cause"]["code"], "checkout.mixedEvents");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_paid_out_seller_sells_nothing_more(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, relation) = desk.item("Ski", 10.0).await;
    fixtures::event_seller(&db, desk.event, desk.seller, 1, true).await;
    assert_eq!(
        desk.sell(json!({ "eventProductId": relation })).await.body["code"],
        "seller.paidOutNoSales"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sold_item_leaves_its_other_events_and_offers(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 10.0).await;
    let organizer: Uuid = sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(desk.event)
        .fetch_one(&db)
        .await
        .unwrap();
    let later = fixtures::event(&db, EventSpec::new("Später", organizer)).await;
    fixtures::event_product(&db, later, product, "announced").await;
    let buyer = fixtures::user(&db, "Buyer").await;
    sqlx::query("INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, 8, 'pending')")
        .bind(desk.event).bind(product).bind(relation).bind(buyer).execute(&db).await.unwrap();
    desk.sell(json!({ "eventProductId": relation })).await;
    let events: Vec<Uuid> =
        sqlx::query_scalar("SELECT event_id FROM event_products WHERE product_id = $1")
            .bind(product)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(events, vec![desk.event]);
    let offer: (String, Option<String>) =
        sqlx::query_as("SELECT status::text, closed_by::text FROM product_offers")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(offer, ("rejected".into(), Some("sale".into())));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn undoing_a_sale_restores_item_and_offers(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    let buyer = fixtures::user(&db, "Buyer").await;
    let other_buyer = fixtures::user(&db, "Other Buyer").await;
    let offer: Uuid = sqlx::query_scalar(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 40, 'accepted') RETURNING id",
    )
    .bind(desk.event).bind(product).bind(relation).bind(buyer).fetch_one(&db).await.unwrap();
    sqlx::query("INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, 30, 'pending')")
        .bind(desk.event).bind(product).bind(relation).bind(other_buyer).execute(&db).await.unwrap();
    desk.sell(json!({ "eventProductId": relation, "offerId": offer }))
        .await;

    let undo = || {
        desk.app.mutation(
            "purchases.undoSale",
            json!({ "eventProductId": relation }),
            Some(&desk.team),
        )
    };
    assert_eq!(undo().await.body["code"], "feature.disabled");
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('allow_undo_inventory_actions', true)",
    )
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(undo().await.body["value"], json!({ "success": true }));
    assert!(desk.purchase(product).await.is_none());
    let statuses: Vec<String> =
        sqlx::query_scalar("SELECT status::text FROM product_offers ORDER BY amount DESC")
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(statuses, vec!["accepted", "pending"]);
    let (sold, status): (bool, String) = sqlx::query_as(
        "SELECT p.sold, ep.status::text FROM products p JOIN event_products ep ON ep.product_id = p.id WHERE p.id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!((sold, status.as_str()), (false, "available"));
    assert_eq!(undo().await.body["code"], "product.notSold");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_checkout_item_for_the_scanner(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "minimumPrice": true })).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    sqlx::query("UPDATE products SET minimum_price = 30 WHERE id = $1")
        .bind(product)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("UPDATE event_products SET discount_percent = 10 WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    let item = |id: String| {
        let (app, args, team) = (
            &desk.app,
            json!({ "eventId": desk.event, "productId": id }),
            desk.team.clone(),
        );
        async move {
            app.query("purchases.getCheckoutItem", args, Some(&team))
                .await
        }
    };
    let reply = item(product.to_string()).await.body["value"].clone();
    assert_eq!(
        (
            reply["listPrice"].clone(),
            reply["minimumPrice"].clone(),
            reply["sellerPaidOut"].clone()
        ),
        (json!(45.0), json!(30.0), json!(false))
    );
    assert_eq!(reply["eventProductId"], json!(relation));
    assert_eq!(reply["image"], Value::Null);
    // Whatever the scanner reads: no error, just nothing
    assert_eq!(item("kaputt-123".into()).await.body["value"], Value::Null);
    assert_eq!(
        item(Uuid::new_v4().to_string()).await.body["value"],
        Value::Null
    );
    let seller = fixtures::session(&db, desk.seller).await;
    let forbidden = desk
        .app
        .query(
            "purchases.getCheckoutItem",
            json!({ "eventId": desk.event, "productId": product }),
            Some(&seller),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn my_sales_per_event_with_the_intake_fee(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "intakeFee": 0.5 })).await;
    let (product, relation) = desk.item("Ski", 30.0).await;
    desk.item("Helm", 5.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    let seller = fixtures::session(&db, desk.seller).await;
    let sales = desk
        .app
        .query("purchases.getMySales", json!({}), Some(&seller))
        .await
        .body["value"]
        .clone();
    assert_eq!(sales.as_array().unwrap().len(), 1);
    let group = &sales[0];
    assert_eq!(group["event"]["title"], "Basar");
    assert_eq!(group["event"]["commissionPercent"], 10.0);
    assert_eq!(group["items"][0]["productId"], json!(product));
    assert_eq!(group["items"][0]["sale"]["totalAmount"], 30.0);
    assert_eq!(
        group["totals"],
        json!({ "revenue": 30.0, "commission": 3.0, "intakeFee": { "perItem": 0.5, "items": 2, "total": 1.0 }, "payout": 26.0 })
    );
    assert_eq!(group["paid"], false);
    assert_eq!(
        desk.app
            .query("purchases.getMySales", json!({}), None)
            .await
            .body["value"],
        json!([])
    );

    let purchases = desk
        .app
        .query(
            "purchases.getPurchasesForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(purchases.body["value"][0]["comissionAmount"], 3.0);
    assert_eq!(
        desk.app
            .query(
                "purchases.getPurchasesForEvent",
                json!({ "eventId": desk.event }),
                Some(&seller)
            )
            .await
            .body["code"],
        "auth.forbidden"
    );
}

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
