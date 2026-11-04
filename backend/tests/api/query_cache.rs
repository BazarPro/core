//! Shared answers for visitors, and for signed-in users who see the same: kept until a
//! mutation touches what they read, compressed.

use crate::common;

use std::io::Read;
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, header};
use common::fixtures::{self, EventSpec};
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

/// The app with the hub listening to Postgres, as in production.
async fn live_app(db: &PgPool) -> TestApp {
    disable_starter_products(db).await;
    let app = TestApp::new(db.clone());
    tokio::spawn(app.state.hub.clone().listen(db.clone()));
    for _ in 0..100 {
        if app.state.hub.cache.is_live() {
            return app;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("hub does not listen");
}

fn labels(body: &Value) -> Vec<String> {
    let mut labels: Vec<String> = body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| c["label"].as_str().unwrap().to_owned())
        .collect();
    labels.sort();
    labels
}

async fn insert_category_unnoticed(db: &PgPool, label: &str) {
    sqlx::query("INSERT INTO categories (label) VALUES ($1)")
        .bind(label)
        .execute(db)
        .await
        .unwrap();
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn visitors_share_answers_until_a_mutation_touches_them(db: PgPool) {
    let app = live_app(&db).await;
    let admin = app.user_session("admin@example.org", true).await;
    let before = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(before.body["topics"], json!(["table:categories"]));

    // A change nobody announces: everybody keeps the cached answer, the categories are the
    // same for all
    insert_category_unnoticed(&db, "Unbemerkt").await;
    let cached = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(labels(&cached.body), labels(&before.body));
    let signed_in = app
        .query("categories.getAllCategories", json!({}), Some(&admin))
        .await;
    assert_eq!(labels(&signed_in.body), labels(&before.body));

    app.mutation(
        "categories.createCategory",
        json!({ "label": "Ski" }),
        Some(&admin),
    )
    .await;
    // The notification arrives a moment after the commit
    for _ in 0..100 {
        let after = app
            .query("categories.getAllCategories", json!({}), None)
            .await;
        let after = labels(&after.body);
        if after.contains(&"Ski".to_owned()) {
            assert!(after.contains(&"Unbemerkt".to_owned()));
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    panic!("visitors still see the old categories");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn without_live_updates_nothing_is_cached(db: PgPool) {
    disable_starter_products(&db).await;
    let app = TestApp::new(db.clone());
    app.query("categories.getAllCategories", json!({}), None)
        .await;
    insert_category_unnoticed(&db, "Sofort").await;
    let reply = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert!(labels(&reply.body).contains(&"Sofort".to_owned()));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn answers_are_gzipped_when_the_client_accepts_it(db: PgPool) {
    let app = live_app(&db).await;
    for label in ["Ski", "Fahrrad", "Kinderkleidung", "Bücher", "Spielzeug"] {
        insert_category_unnoticed(&db, label).await;
    }
    let reply = app
        .request(
            Request::post("/api/query/categories.getAllCategories")
                .header(header::CONTENT_TYPE, "application/json")
                .header(header::ACCEPT_ENCODING, "gzip")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;
    assert_eq!(reply.headers[header::CONTENT_ENCODING], "gzip");
    assert_eq!(reply.headers[header::CONTENT_TYPE], "application/json");

    // Visitors get the gzip made once with the cached answer: the same JSON
    let mut unpacked = String::new();
    flate2::read::GzDecoder::new(&reply.bytes[..])
        .read_to_string(&mut unpacked)
        .unwrap();
    let plain = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(
        serde_json::from_str::<Value>(&unpacked).unwrap(),
        plain.body
    );
    assert_eq!(labels(&plain.body).len(), 5);
}

fn titles(body: &Value) -> Vec<String> {
    let mut titles: Vec<String> = body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|item| item["title"].as_str().unwrap().to_owned())
        .collect();
    titles.sort();
    titles
}

async fn rename_event_unnoticed(db: &PgPool, event: Uuid, title: &str) {
    sqlx::query("UPDATE events SET title = $2 WHERE id = $1")
        .bind(event)
        .bind(title)
        .execute(db)
        .await
        .unwrap();
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn signed_in_users_without_a_part_in_the_event_share_what_visitors_see(db: PgPool) {
    let app = live_app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let erika = fixtures::user(&db, "Erika").await;
    let skates = fixtures::product(&db, erika, "Inliner", 20.0).await;
    fixtures::event_product(&db, event, skates, "available").await;
    let buyer = fixtures::user(&db, "Bob").await;
    let sessions = [
        fixtures::session(&db, organizer).await,
        fixtures::session(&db, erika).await,
        fixtures::session(&db, fixtures::admin(&db, "Admin").await).await,
    ];
    let buyer = fixtures::session(&db, buyer).await;
    let items = json!({ "eventId": event });
    let page = json!({ "id": event });
    let visitor = app
        .query("eventProducts.getProductsForEvent", items.clone(), None)
        .await;
    assert_eq!(titles(&visitor.body), ["Inliner"]);
    app.query("events.getPublicEventForViewer", page.clone(), None)
        .await;

    // Changes nobody announces: the buyer gets the cached answers of the visitors, the
    // team, the seller and administrators see more than visitors and ask the database
    let carl = fixtures::user(&db, "Carl").await;
    let bike = fixtures::product(&db, carl, "Fahrrad", 80.0).await;
    fixtures::event_product(&db, event, bike, "available").await;
    rename_event_unnoticed(&db, event, "Neuer Name").await;
    let shared = app
        .query(
            "eventProducts.getProductsForEvent",
            items.clone(),
            Some(&buyer),
        )
        .await;
    assert_eq!(shared.body, visitor.body);
    let shared = app
        .query("events.getPublicEventForViewer", page.clone(), Some(&buyer))
        .await;
    assert_eq!(shared.body["value"]["title"], "Basar");
    for session in &sessions {
        let own = app
            .query(
                "eventProducts.getProductsForEvent",
                items.clone(),
                Some(session),
            )
            .await;
        assert_eq!(titles(&own.body), ["Fahrrad", "Inliner"]);
        let own = app
            .query(
                "events.getPublicEventForViewer",
                page.clone(),
                Some(session),
            )
            .await;
        assert_eq!(own.body["value"]["title"], "Neuer Name");
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn signed_in_users_share_the_event_list_administrators_not(db: PgPool) {
    let app = live_app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let anna = fixtures::session(&db, fixtures::user(&db, "Anna").await).await;
    let bob = fixtures::session(&db, fixtures::user(&db, "Bob").await).await;
    let admin = fixtures::session(&db, fixtures::admin(&db, "Admin").await).await;
    let list = json!({ "includePast": false });
    let title = |reply: common::Reply| reply.body["value"][0]["title"].clone();

    let visitors = title(app.query("events.get", list.clone(), None).await);
    rename_event_unnoticed(&db, event, "Zweiter Name").await;
    // Signed-in users see other events than visitors: an answer of their own, shared
    let anna_sees = title(app.query("events.get", list.clone(), Some(&anna)).await);
    rename_event_unnoticed(&db, event, "Dritter Name").await;
    let bob_sees = title(app.query("events.get", list.clone(), Some(&bob)).await);
    let admin_sees = title(app.query("events.get", list.clone(), Some(&admin)).await);
    assert_eq!(
        [visitors, anna_sees, bob_sees, admin_sees],
        ["Basar", "Zweiter Name", "Zweiter Name", "Dritter Name"].map(Value::from)
    );
}
