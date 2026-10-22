//! Sellers without account.

use crate::common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-walkin";

struct Desk {
    app: TestApp,
    event: Uuid,
    category: Uuid,
    team: String,
}

impl Desk {
    async fn new(db: PgPool) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                features: json!({ "questions": true, "priceOffers": true }),
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        Self {
            category: fixtures::category(&db, "Fahrräder").await,
            team: fixtures::session(&db, organizer).await,
            app,
            event,
        }
    }

    async fn walk_in(&self) -> Uuid {
        let reply = self
            .app
            .mutation(
                "walkInSellers.createWalkInSeller",
                json!({ "eventId": self.event, "firstName": " Erika ", "lastName": "Muster", "contactEmail": "erika@example.com" }),
                Some(&self.team),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        reply.body["value"].as_str().unwrap().parse().unwrap()
    }

    async fn save(&self, seller: Uuid, changes: Value, session: &str) -> common::Reply {
        let mut args = json!({
            "eventId": self.event, "sellerId": seller, "title": "Kinderrad", "description": "",
            "condition": "ok", "productCategory": self.category, "price": 40, "acceptsOffers": true,
        });
        for (key, value) in changes.as_object().unwrap() {
            args[key] = value.clone();
        }
        self.app
            .mutation("walkInSellers.saveWalkInProduct", args, Some(session))
            .await
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_creates_a_seller_without_login_and_lists_items(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let seller = desk.walk_in().await;
    let vendors = desk
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    let entry = vendors
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["_id"] == json!(seller))
        .unwrap()
        .clone();
    assert_eq!(
        (
            entry["managedByEventId"].clone(),
            entry["name"].clone(),
            entry["sellerNumber"].clone()
        ),
        (json!(desk.event), json!("Erika Muster"), json!(1))
    );

    let product: Uuid = serde_json::from_value(
        desk.save(seller, json!({}), &desk.team).await.body["value"].clone(),
    )
    .unwrap();
    let (status, accepts): (String, Option<bool>) = sqlx::query_as(
        "SELECT ep.status::text, p.accepts_offers FROM event_products ep JOIN products p ON p.id = ep.product_id WHERE p.id = $1",
    )
    .bind(product)
    .fetch_one(&db)
    .await
    .unwrap();
    // Announced like any item; never online offers, nobody could answer them
    assert_eq!((status.as_str(), accepts), ("announced", Some(false)));

    // Walk-ins cannot sign in: no account, no password
    let accounts: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_accounts WHERE user_id = $1")
        .bind(seller)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(accounts, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn others_cannot_create_walk_ins_or_edit_regular_sellers(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    let reply = desk
        .app
        .mutation(
            "walkInSellers.createWalkInSeller",
            json!({ "eventId": desk.event, "firstName": "A", "lastName": "B" }),
            Some(&stranger),
        )
        .await;
    assert_eq!(reply.body["code"], "auth.forbidden");
    let regular = fixtures::user(&db, "Regular").await;
    fixtures::role(&db, desk.event, regular, "seller").await;
    assert_eq!(
        desk.save(regular, json!({}), &desk.team).await.body["code"],
        "product.walkInOnly"
    );
    let walk_in = desk.walk_in().await;
    assert_eq!(
        desk.save(walk_in, json!({}), &stranger).await.body["code"],
        "auth.forbidden"
    );
    let no_name = desk
        .app
        .mutation(
            "walkInSellers.createWalkInSeller",
            json!({ "eventId": desk.event, "firstName": " ", "lastName": "B" }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(no_name.body["code"], "profile.nameRequired");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn no_new_or_changed_items_once_settled(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let seller = desk.walk_in().await;
    let product = desk.save(seller, json!({}), &desk.team).await.body["value"].clone();
    sqlx::query("UPDATE event_sellers SET payout_received = true WHERE user_id = $1")
        .bind(seller)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        desk.save(seller, json!({}), &desk.team).await.body["code"],
        "seller.paidOut"
    );
    assert_eq!(
        desk.save(
            seller,
            json!({ "productId": product, "price": 30 }),
            &desk.team
        )
        .await
        .body["code"],
        "seller.paidOut"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn up_to_three_photos_replaced_on_update(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let seller = desk.walk_in().await;
    let mut photos = Vec::new();
    for _ in 0..4 {
        photos.push(
            desk.app
                .upload(PNG.to_vec(), "image/png", Some(&desk.team))
                .await
                .body["storageId"]
                .clone(),
        );
    }
    let too_many = desk
        .save(seller, json!({ "images": photos }), &desk.team)
        .await;
    assert_eq!(too_many.body["code"], "product.tooManyImages");
    let product = desk
        .save(
            seller,
            json!({ "images": [photos[0], photos[1]] }),
            &desk.team,
        )
        .await
        .body["value"]
        .clone();
    desk.save(
        seller,
        json!({ "productId": product, "images": [photos[2]], "title": "Laufrad" }),
        &desk.team,
    )
    .await;
    let item = desk
        .app
        .query("products.getProduct", json!({ "productId": product }), None)
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (item["images"].clone(), item["title"].clone()),
        (json!([photos[2]]), json!("Laufrad"))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn deleting_a_walk_in_item_with_its_photos(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let seller = desk.walk_in().await;
    let photo = desk
        .app
        .upload(PNG.to_vec(), "image/png", Some(&desk.team))
        .await
        .body["storageId"]
        .clone();
    let product = desk
        .save(seller, json!({ "images": [photo] }), &desk.team)
        .await
        .body["value"]
        .clone();
    let sold = desk
        .save(seller, json!({ "title": "Verkauft" }), &desk.team)
        .await
        .body["value"]
        .clone();
    sqlx::query("UPDATE products SET sold = true WHERE id = $1")
        .bind(serde_json::from_value::<Uuid>(sold.clone()).unwrap())
        .execute(&db)
        .await
        .unwrap();
    let delete = |product: &Value| {
        let (app, args, team) = (
            &desk.app,
            json!({ "eventId": desk.event, "productId": product }),
            desk.team.clone(),
        );
        async move {
            app.mutation("walkInSellers.deleteWalkInProduct", args, Some(&team))
                .await
        }
    };
    assert_eq!(delete(&sold).await.body["code"], "product.soldNoDelete");
    let regular = fixtures::user(&db, "Regular").await;
    let other = fixtures::product(&db, regular, "Fremd", 10.0).await;
    assert_eq!(
        delete(&json!(other)).await.body["code"],
        "product.walkInOnly"
    );

    assert_eq!(delete(&product).await.status, StatusCode::OK);
    assert_eq!(
        desk.app
            .query("products.getProduct", json!({ "productId": product }), None)
            .await
            .body["value"],
        Value::Null
    );
    desk.app.run_jobs().await;
    let file = desk
        .app
        .get(&format!("/api/files/{}", photo.as_str().unwrap()), None)
        .await;
    assert_eq!(file.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizers_answer_for_walk_ins_and_sale_mail_goes_to_the_contact(db: PgPool) {
    let desk = Desk::new(db.clone()).await;
    let seller = desk.walk_in().await;
    let product = desk.save(seller, json!({}), &desk.team).await.body["value"].clone();
    let relation: Uuid = sqlx::query_scalar("SELECT id FROM event_products WHERE product_id = $1")
        .bind(serde_json::from_value::<Uuid>(product.clone()).unwrap())
        .fetch_one(&db)
        .await
        .unwrap();
    let buyer = fixtures::session(&db, fixtures::user(&db, "Buyer").await).await;
    let question = desk
        .app
        .mutation(
            "productQuestions.ask",
            json!({ "productId": product, "question": "Wie groß ist es?" }),
            Some(&buyer),
        )
        .await
        .body["value"]
        .clone();
    let answer = desk
        .app
        .mutation(
            "productQuestions.answer",
            json!({ "questionId": question, "answer": "20 Zoll" }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(answer.status, StatusCode::OK);

    sqlx::query("UPDATE event_products SET status = 'available' WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    desk.app
        .mutation(
            "purchases.sellProduct",
            json!({ "eventProductId": relation }),
            Some(&desk.team),
        )
        .await;
    desk.app.run_jobs().await;
    let to: Vec<String> = desk
        .app
        .sent
        .lock()
        .unwrap()
        .iter()
        .map(|m| m.to.clone())
        .collect();
    assert!(to.contains(&"erika@example.com".to_owned()));
    // No marker: walk-ins cannot sign in
    let markers: i64 = sqlx::query_scalar("SELECT count(*) FROM unread_notices WHERE user_id = $1")
        .bind(seller)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(markers, 0);
}
