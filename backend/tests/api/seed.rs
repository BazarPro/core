//! Setup helpers of the seed module.

use crate::common;

use bazarpro_backend::rpc;
use common::TestApp;
use common::fixtures;
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn new_accounts_get_two_starter_items(db: PgPool) {
    let app = TestApp::new(db.clone());
    fixtures::category(&db, "Kleidung").await;
    fixtures::category(&db, "Sport").await;
    // The sign-up schedules the job (flag on by default)
    app.sign_up("neu@example.org").await;
    app.run_jobs().await;
    let items: Vec<(String, String)> = sqlx::query_as(
        "SELECT p.title, c.label FROM products p JOIN categories c ON c.id = p.category_id ORDER BY p.price DESC",
    )
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(
        items,
        vec![
            (
                "Mountainbike 'Rockrider' 26 Zoll".to_owned(),
                "Sport".to_owned()
            ),
            (
                "Fahrradhelm Gr. M (55-59cm) FLAIR".to_owned(),
                "Sport".to_owned()
            ),
        ]
    );
    let pending: i64 = sqlx::query_scalar("SELECT count(*) FROM jobs")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(pending, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn flags_and_wiping_a_test_database(db: PgPool) {
    let app = TestApp::new(db.clone());
    rpc::call(&app.state, None, "seed.seedFeatureFlags", json!({}))
        .await
        .unwrap();
    let flags = app.query("featureFlags.get", json!({}), None).await.body["value"].clone();
    assert_eq!(
        (
            flags["is_demo_mode"].clone(),
            flags["is_registration_enabled"].clone()
        ),
        (json!(true), json!(false))
    );
    rpc::call(
        &app.state,
        None,
        "seed.toggleFeatureFlag",
        json!({ "key": "is_demo_mode" }),
    )
    .await
    .unwrap();
    assert_eq!(
        app.query("featureFlags.get", json!({ "key": "is_demo_mode" }), None)
            .await
            .body["value"],
        json!({ "is_demo_mode": false })
    );
    assert_eq!(
        rpc::call(&app.state, None, "seed.isSeeded", json!({}))
            .await
            .unwrap(),
        false
    );

    fixtures::user(&db, "Erika").await;
    let refused = rpc::call(&app.state, None, "seed.removeAllData", json!({}))
        .await
        .unwrap_err();
    assert_eq!(refused.code(), Some("REMOVE_ALL_DATA_NOT_ALLOWED"));
    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(users, 1);
}
