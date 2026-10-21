//! Parallel requests against a small connection pool. In its own test binary: the
//! binaries run one after the other, so the password hashing of the other auth tests
//! does not slow it down into the pool timeout.

mod common;

use axum::http::StatusCode;
use common::{TestApp, disable_starter_products};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn parallel_sign_ins_do_not_exhaust_the_pool(db: PgPool) {
    disable_starter_products(&db).await;
    TestApp::new(db.clone()).sign_up("erika@example.org").await;

    // As many parallel requests as connections, and more
    let small = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .acquire_timeout(std::time::Duration::from_secs(20))
        .connect_with((*db.connect_options()).clone())
        .await
        .unwrap();
    let app = TestApp::new(small);
    let attempts = (0..6).map(|i| {
        let password = if i % 2 == 0 { "geheim123" } else { "falsch123" };
        app.password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": password }),
        )
    });
    for reply in futures::future::join_all(attempts).await {
        assert_ne!(
            reply.status,
            StatusCode::INTERNAL_SERVER_ERROR,
            "{}",
            reply.body
        );
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn requests_cut_off_by_the_client_leave_clean_connections(db: PgPool) {
    let small = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect_with((*db.connect_options()).clone())
        .await
        .unwrap();
    let app = TestApp::new(small);
    // A reload in the browser drops requests at any point of their work
    for round in 0..3000u64 {
        let cut = std::time::Duration::from_micros(round % 1500);
        let _ = tokio::time::timeout(cut, app.query("events.get", json!({}), None)).await;
        let _ = tokio::time::timeout(
            cut,
            app.mutation(
                "notifications.markNoticesSeen",
                json!({ "area": "events" }),
                None,
            ),
        )
        .await;
    }
    for _ in 0..20 {
        let reply = app.query("events.get", json!({}), None).await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn failing_functions_leave_clean_connections(db: PgPool) {
    let small = sqlx::postgres::PgPoolOptions::new()
        .max_connections(2)
        .connect_with((*db.connect_options()).clone())
        .await
        .unwrap();
    let app = TestApp::new(small);
    let missing = json!({ "eventId": uuid::Uuid::new_v4() });
    for _ in 0..20 {
        let (app, missing) = (&app, &missing);
        let failing = (0..6).map(|i| async move {
            if i % 2 == 0 {
                app.query("events.getEventFinancialSummary", missing.clone(), None)
                    .await
            } else {
                app.mutation("eventSeller.joinEvent", missing.clone(), None)
                    .await
            }
        });
        let ok = (0..4).map(|_| app.query("events.get", json!({}), None));
        let (failed, ok) = futures::future::join(
            futures::future::join_all(failing),
            futures::future::join_all(ok),
        )
        .await;
        for reply in failed.iter().chain(&ok) {
            assert_ne!(
                reply.status,
                StatusCode::INTERNAL_SERVER_ERROR,
                "{}",
                reply.body
            );
        }
    }
}
