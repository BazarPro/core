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
