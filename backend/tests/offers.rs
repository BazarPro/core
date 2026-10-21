//! Online price offers.

mod common;

use axum::http::StatusCode;
use bazarpro_backend::{job_registry, jobs};
use chrono::Utc;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Market {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    product: Uuid,
    relation: Uuid,
    seller: String,
    team: String,
}

impl Market {
    /// A running event with offers, an item handed in that takes offers (50 €).
    async fn new(db: PgPool) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                features: json!({ "priceOffers": true }),
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        let seller = fixtures::user(&db, "Seller").await;
        let product = fixtures::product(&db, seller, "Ski", 50.0).await;
        sqlx::query("UPDATE products SET accepts_offers = true WHERE id = $1")
            .bind(product)
            .execute(&db)
            .await
            .unwrap();
        let relation = fixtures::event_product(&db, event, product, "available").await;
        Self {
            seller: fixtures::session(&db, seller).await,
            team: fixtures::session(&db, organizer).await,
            app,
            db,
            event,
            product,
            relation,
        }
    }

    async fn buyer(&self, name: &str) -> String {
        fixtures::session(&self.db, fixtures::user(&self.db, name).await).await
    }

    async fn offer(&self, buyer: &str, amount: f64) -> common::Reply {
        self.app
            .mutation(
                "offers.makeOffer",
                json!({ "productId": self.product, "amount": amount, "message": " Ginge das? " }),
                Some(buyer),
            )
            .await
    }

    async fn respond(&self, offer: &Value, accept: bool) -> common::Reply {
        self.app
            .mutation(
                "offers.respondToOffer",
                json!({ "offerId": offer, "accept": accept }),
                Some(&self.seller),
            )
            .await
    }

    async fn status(&self, offer: &Value) -> String {
        let id: Uuid = serde_json::from_value(offer.clone()).unwrap();
        sqlx::query_scalar("SELECT status::text FROM product_offers WHERE id = $1")
            .bind(id)
            .fetch_one(&self.db)
            .await
            .unwrap()
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offers_need_the_feature_the_seller_opt_in_and_a_lower_price(db: PgPool) {
    let market = Market::new(db.clone()).await;
    let buyer = market.buyer("Buyer").await;
    assert_eq!(
        market
            .app
            .mutation(
                "offers.makeOffer",
                json!({ "productId": market.product, "amount": 30 }),
                None
            )
            .await
            .body["code"],
        "auth.loginToOffer"
    );
    assert_eq!(
        market.offer(&market.seller, 30.0).await.body["code"],
        "offer.ownItem"
    );
    assert_eq!(
        market.offer(&buyer, 50.0).await.body["code"],
        "offer.belowPrice"
    );
    assert_eq!(
        market.offer(&buyer, 0.0).await.body["code"],
        "offer.invalidAmount"
    );

    sqlx::query("UPDATE products SET accepts_offers = false WHERE id = $1")
        .bind(market.product)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        market.offer(&buyer, 30.0).await.body["code"],
        "offer.notAllowed"
    );
    sqlx::query("UPDATE products SET accepts_offers = true WHERE id = $1")
        .bind(market.product)
        .execute(&db)
        .await
        .unwrap();
    // Announced only, not yet handed in
    sqlx::query("UPDATE event_products SET status = 'announced' WHERE id = $1")
        .bind(market.relation)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        market.offer(&buyer, 30.0).await.body["code"],
        "offer.notOpenYet"
    );
    sqlx::query("UPDATE event_products SET status = 'available' WHERE id = $1")
        .bind(market.relation)
        .execute(&db)
        .await
        .unwrap();

    let first = market.offer(&buyer, 30.0).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    // A second offer changes the open one
    let second = market.offer(&buyer, 35.0).await;
    assert_eq!(second.body["value"], first.body["value"]);
    let mine = market
        .app
        .query(
            "offers.getMyOfferForProduct",
            json!({ "productId": market.product }),
            Some(&buyer),
        )
        .await;
    assert_eq!(
        (
            mine.body["value"]["amount"].clone(),
            mine.body["value"]["message"].clone()
        ),
        (json!(35.0), json!("Ginge das?"))
    );

    market.app.run_jobs().await;
    let sent = market.app.sent.lock().unwrap();
    assert_eq!(sent.len(), 2);
    assert!(sent[1].subject.contains("Neuer Preisvorschlag"));
    assert!(sent[1].html.contains("35,00 €") && sent[1].html.contains("Buyer"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn accepting_one_offer_rejects_the_others(db: PgPool) {
    let market = Market::new(db.clone()).await;
    let (a, b) = (market.buyer("Anna").await, market.buyer("Bernd").await);
    let offer_a = market.offer(&a, 40.0).await.body["value"].clone();
    let offer_b = market.offer(&b, 30.0).await.body["value"].clone();

    let listed = market
        .app
        .query(
            "offers.getOffersForProduct",
            json!({ "productId": market.product }),
            Some(&market.seller),
        )
        .await;
    let amounts: Vec<Value> = listed.body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|o| o["amount"].clone())
        .collect();
    assert_eq!(amounts, vec![json!(40.0), json!(30.0)]);
    assert_eq!(listed.body["value"][0]["buyerName"], "Anna");
    assert_eq!(
        market
            .app
            .query(
                "offers.getOffersForProduct",
                json!({ "productId": market.product }),
                Some(&a)
            )
            .await
            .body["value"],
        json!([])
    );
    let staff = market
        .app
        .query(
            "offers.getOffersForStaff",
            json!({ "productId": market.product }),
            Some(&market.team),
        )
        .await;
    assert_eq!(
        (
            staff.body["value"]["canRespond"].clone(),
            staff.body["value"]["offers"].as_array().unwrap().len()
        ),
        (json!(false), 2)
    );

    assert_eq!(
        market
            .app
            .mutation(
                "offers.respondToOffer",
                json!({ "offerId": offer_a, "accept": true }),
                Some(&b)
            )
            .await
            .body["code"],
        "auth.forbidden"
    );
    assert_eq!(market.respond(&offer_a, true).await.status, StatusCode::OK);
    assert_eq!(market.status(&offer_a).await, "accepted");
    assert_eq!(market.status(&offer_b).await, "rejected");
    assert_eq!(
        market.respond(&offer_b, true).await.body["code"],
        "offer.notOpen"
    );
    // After an accepted offer nobody sends another one
    assert_eq!(
        market.offer(&a, 41.0).await.body["code"],
        "offer.alreadyAcceptedYours"
    );
    assert_eq!(
        market.offer(&b, 42.0).await.body["code"],
        "offer.alreadyAcceptedOther"
    );

    let accepted = market
        .app
        .query(
            "offers.getAcceptedOffersForEventProduct",
            json!({ "eventProductId": market.relation }),
            Some(&market.team),
        )
        .await;
    assert_eq!(accepted.body["value"][0]["buyerName"], "Anna");

    market.app.run_jobs().await;
    let sent = market.app.sent.lock().unwrap();
    let to_bernd = sent.iter().rfind(|m| m.to == "bernd@test.example").unwrap();
    assert!(to_bernd.html.contains("einen anderen Vorschlag angenommen"));
    let to_anna = sent.iter().rfind(|m| m.to == "anna@test.example").unwrap();
    assert!(to_anna.subject.contains("angenommen") && to_anna.html.contains("Basar"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_withdrawn_offer_disappears_and_cannot_be_redeemed(db: PgPool) {
    let market = Market::new(db.clone()).await;
    let buyer = market.buyer("Buyer").await;
    let offer = market.offer(&buyer, 40.0).await.body["value"].clone();
    let stranger = market.buyer("Other").await;
    assert_eq!(
        market
            .app
            .mutation(
                "offers.withdrawOffer",
                json!({ "offerId": offer }),
                Some(&stranger)
            )
            .await
            .body["code"],
        "notFound.offer"
    );
    market
        .app
        .mutation(
            "offers.withdrawOffer",
            json!({ "offerId": offer }),
            Some(&buyer),
        )
        .await;
    assert_eq!(market.status(&offer).await, "withdrawn");
    assert_eq!(
        market
            .app
            .mutation(
                "offers.withdrawOffer",
                json!({ "offerId": offer }),
                Some(&buyer)
            )
            .await
            .body["code"],
        "offer.closed"
    );
    let listed = market
        .app
        .query(
            "offers.getOffersForProduct",
            json!({ "productId": market.product }),
            Some(&market.seller),
        )
        .await;
    assert_eq!(listed.body["value"], json!([]));
    let sale = market
        .app
        .mutation(
            "purchases.sellProduct",
            json!({ "eventProductId": market.relation, "offerId": offer }),
            Some(&market.team),
        )
        .await;
    assert_eq!(sale.body["code"], "checkout.offerNotAccepted");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offers_of_ended_events_expire_hourly(db: PgPool) {
    let market = Market::new(db.clone()).await;
    let (a, b) = (market.buyer("Anna").await, market.buyer("Bernd").await);
    let pending = market.offer(&a, 30.0).await.body["value"].clone();
    let accepted = market.offer(&b, 40.0).await.body["value"].clone();
    market.respond(&accepted, true).await;
    // The pending one was rejected by the acceptance; put it back to test both kinds
    sqlx::query("UPDATE product_offers SET status = 'pending' WHERE id = $1")
        .bind(serde_json::from_value::<Uuid>(pending.clone()).unwrap())
        .execute(&db)
        .await
        .unwrap();
    market.app.run_jobs().await;
    market.app.sent.lock().unwrap().clear();

    sqlx::query("UPDATE events SET end_date = now() - interval '1 minute' WHERE id = $1")
        .bind(market.event)
        .execute(&db)
        .await
        .unwrap();
    let mut conn = db.acquire().await.unwrap();
    jobs::enqueue(
        &mut conn,
        "offers.expireOffersOfEndedEvents",
        &json!({}),
        Utc::now(),
    )
    .await
    .unwrap();
    market.app.run_jobs().await;
    for offer in [&pending, &accepted] {
        assert_eq!(market.status(offer).await, "rejected");
    }
    let closed: Vec<(Option<String>, Option<String>)> = sqlx::query_as(
        "SELECT closed_by::text, closed_from_status::text FROM product_offers ORDER BY amount",
    )
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(
        closed,
        vec![
            (Some("expired".into()), Some("pending".into())),
            (Some("expired".into()), Some("accepted".into()))
        ]
    );
    assert_eq!(market.app.sent.lock().unwrap().len(), 2);
    assert!(job_registry().contains("offers.expireOffersOfEndedEvents"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn hidden_and_sold_items_take_no_offers(db: PgPool) {
    let market = Market::new(db.clone()).await;
    let buyer = market.buyer("Buyer").await;
    sqlx::query("UPDATE products SET sold = true WHERE id = $1")
        .bind(market.product)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        market.offer(&buyer, 30.0).await.body["code"],
        "product.alreadySold"
    );
    sqlx::query("UPDATE products SET sold = false, hidden_at = now(), hidden_by = vendor_id, hidden_reason = 'x' WHERE id = $1")
        .bind(market.product)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        market.offer(&buyer, 30.0).await.body["code"],
        "notFound.product"
    );
}
