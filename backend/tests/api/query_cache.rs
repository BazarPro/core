//! Shared answers for visitors: kept until a mutation touches what they read, compressed.

use crate::common;

use std::io::Read;
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, header};
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;

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

    // A change nobody announces: visitors keep the cached answer, signed-in users not
    insert_category_unnoticed(&db, "Unbemerkt").await;
    let cached = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(labels(&cached.body), labels(&before.body));
    let signed_in = app
        .query("categories.getAllCategories", json!({}), Some(&admin))
        .await;
    assert!(labels(&signed_in.body).contains(&"Unbemerkt".to_owned()));

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
