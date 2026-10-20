//! Email settings, unsubscribe links and menu markers (convex/tests/notificationPrefs.test.ts).

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

/// A rejected event mails the organizer; events.rejectEventForAdmin is the first port that
/// notifies users.
async fn notify_organizer(app: &TestApp, db: &PgPool, organizer: Uuid) {
    let event = fixtures::event(db, EventSpec::new("Basar", organizer)).await;
    let admin = fixtures::session(
        db,
        fixtures::admin(db, &format!("Admin {}", Uuid::new_v4())).await,
    )
    .await;
    app.mutation(
        "events.rejectEventForAdmin",
        json!({ "eventId": event, "reason": "Grund" }),
        Some(&admin),
    )
    .await;
    app.run_jobs().await;
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn all_categories_are_on_by_default_and_can_be_switched_off(db: PgPool) {
    let app = TestApp::new(db.clone());
    let user = fixtures::user(&db, "Erika").await;
    let session = fixtures::session(&db, user).await;
    let prefs = app
        .query(
            "notifications.getMyNotificationPrefs",
            json!({}),
            Some(&session),
        )
        .await;
    assert_eq!(
        prefs.body["value"],
        json!({ "buyer": true, "offers": true, "organizer": true, "questions": true, "reminders": true, "sales": true })
    );
    assert_eq!(
        app.query("notifications.getMyNotificationPrefs", json!({}), None)
            .await
            .body["value"],
        Value::Null
    );

    app.mutation(
        "notifications.updateMyNotificationPrefs",
        json!({ "prefs": { "sales": false } }),
        Some(&session),
    )
    .await;
    app.mutation(
        "notifications.updateMyNotificationPrefs",
        json!({ "prefs": { "offers": false } }),
        Some(&session),
    )
    .await;
    let prefs = app
        .query(
            "notifications.getMyNotificationPrefs",
            json!({}),
            Some(&session),
        )
        .await;
    assert_eq!(
        (
            prefs.body["value"]["sales"].clone(),
            prefs.body["value"]["offers"].clone()
        ),
        (json!(false), json!(false))
    );
    let anonymous = app
        .mutation(
            "notifications.updateMyNotificationPrefs",
            json!({ "prefs": { "sales": false } }),
            None,
        )
        .await;
    assert_eq!(anonymous.body["code"], "auth.required");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn unsubscribing_without_login(db: PgPool) {
    let app = TestApp::new(db.clone());
    let user = fixtures::user(&db, "Erika").await;
    let token = "0123456789abcdef0123456789abcdef";
    sqlx::query("UPDATE users SET unsubscribe_token = $2 WHERE id = $1")
        .bind(user)
        .bind(token)
        .execute(&db)
        .await
        .unwrap();

    let info = app
        .query(
            "notifications.getUnsubscribeInfo",
            json!({ "token": token, "category": "sales" }),
            None,
        )
        .await;
    assert_eq!(
        info.body["value"],
        json!({ "category": "Verkäufe", "subscribed": true, "canLogIn": true })
    );
    let unknown = app
        .query(
            "notifications.getUnsubscribeInfo",
            json!({ "token": "nope", "category": "sales" }),
            None,
        )
        .await;
    assert_eq!(unknown.body["value"], Value::Null);

    app.mutation(
        "notifications.unsubscribe",
        json!({ "token": token, "category": "sales" }),
        None,
    )
    .await;
    let info = app
        .query(
            "notifications.getUnsubscribeInfo",
            json!({ "token": token, "category": "sales" }),
            None,
        )
        .await;
    assert_eq!(info.body["value"]["subscribed"], false);
    let invalid = app
        .mutation(
            "notifications.unsubscribe",
            json!({ "token": "f".repeat(32), "category": "sales" }),
            None,
        )
        .await;
    assert_eq!(invalid.body["code"], "unsubscribe.invalid");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn mail_clients_unsubscribe_with_one_post_not_with_a_get(db: PgPool) {
    let app = TestApp::new(db.clone());
    let user = fixtures::user(&db, "Erika").await;
    let token = "0123456789abcdef0123456789abcdef";
    sqlx::query("UPDATE users SET unsubscribe_token = $2 WHERE id = $1")
        .bind(user)
        .bind(token)
        .execute(&db)
        .await
        .unwrap();
    let uri = format!("/api/unsubscribe?t={token}&k=offers");

    let get = app
        .request(Request::get(&uri).body(Body::empty()).unwrap())
        .await;
    assert_eq!(get.status, StatusCode::METHOD_NOT_ALLOWED);
    let post = app
        .request(Request::post(&uri).body(Body::empty()).unwrap())
        .await;
    assert_eq!(post.status, StatusCode::OK);
    assert_eq!(post.bytes, "Abbestellt".as_bytes());
    let prefs: Value = sqlx::query_scalar("SELECT notification_prefs FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(prefs, json!({ "offers": false }));
    let bad = app
        .request(
            Request::post("/api/unsubscribe?t=x&k=offers")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(bad.status, StatusCode::BAD_REQUEST);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn markers_count_until_the_page_is_opened(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    notify_organizer(&app, &db, organizer).await;
    notify_organizer(&app, &db, organizer).await;
    let counts = app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&session),
        )
        .await;
    assert_eq!(
        counts.body["value"],
        json!({ "events": 2, "messages": 0, "products": 0, "sales": 0 })
    );
    assert!(
        counts.body["topics"]
            .as_array()
            .unwrap()
            .contains(&json!(format!("user:{organizer}")))
    );

    app.mutation(
        "notifications.markNoticesSeen",
        json!({ "area": "events" }),
        Some(&session),
    )
    .await;
    let counts = app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&session),
        )
        .await;
    assert_eq!(counts.body["value"]["events"], 0);
    assert_eq!(
        app.query("notifications.getUnreadNoticeCounts", json!({}), None)
            .await
            .body["value"]["events"],
        0
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn banned_users_get_no_mail_and_no_marker(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    sqlx::query("UPDATE users SET status = 'banned' WHERE id = $1")
        .bind(organizer)
        .execute(&db)
        .await
        .unwrap();
    notify_organizer(&app, &db, organizer).await;
    assert!(app.sent.lock().unwrap().is_empty());
    let markers: i64 = sqlx::query_scalar("SELECT count(*) FROM unread_notices")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(markers, 0);
}
