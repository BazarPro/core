//! The demo data (seed:runSeed of convex/seed.ts): the users and events the end-to-end
//! tests rely on, and bazaars in every state played through with the real functions.

mod common;

use bazarpro_backend::demo::{self, Options};
use bazarpro_backend::i18n::Locale;
use bazarpro_backend::rpc::Ctx;
use common::TestApp;
use serde_json::{Value, json};
use sqlx::PgPool;

fn options(locale: Locale) -> Options {
    Options {
        force: false,
        locale,
        images: false,
    }
}

async fn sign_in(app: &TestApp, email: &str) -> String {
    let reply = app
        .password(json!({ "flow": "signIn", "email": email, "password": "123456" }))
        .await;
    assert_eq!(reply.body, json!({ "signingIn": true }), "{email}");
    reply.session.expect("session cookie")
}

async fn count(db: &PgPool, sql: &str) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .fetch_one(db)
        .await
        .unwrap()
}

async fn event_id(db: &PgPool, title: &str) -> String {
    sqlx::query_scalar::<_, uuid::Uuid>("SELECT id FROM events WHERE title = $1")
        .bind(title)
        .fetch_one(db)
        .await
        .unwrap()
        .to_string()
}

async fn ok(app: &TestApp, name: &str, args: Value, session: Option<&str>) -> Value {
    let reply = app.query(name, args, session).await;
    assert_eq!(reply.status, 200, "{name}: {}", reply.body);
    reply.body["value"].clone()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn bazaars_in_every_state(db: PgPool) {
    let app = TestApp::new(db.clone());
    demo::run(&app.state, options(Locale::De)).await.unwrap();

    // The accounts of the end-to-end tests and of the demo people sign in with 123456
    sign_in(&app, "user1@bazarpro.de").await;
    let admin = sign_in(&app, "admin@bazarpro.de").await;
    let organizer = sign_in(&app, "sabine.krause@example.org").await;
    let seller = sign_in(&app, "anna.schmidt@example.org").await;

    assert_eq!(count(&db, "SELECT count(*) FROM events").await, 14);
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE approval_status = 'pending'"
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE approval_status = 'rejected'"
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE hidden_at IS NOT NULL"
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE start_date <= now() AND end_date > now()"
        )
        .await,
        3,
        "showcase, test bazaar and kids' bazaar run now"
    );
    // Offers in every state, the ones of the ended flea market expired
    let states: Vec<String> =
        sqlx::query_scalar("SELECT DISTINCT status::text FROM product_offers ORDER BY 1")
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(
        states,
        ["accepted", "pending", "redeemed", "rejected", "withdrawn"]
    );
    assert!(
        count(
            &db,
            "SELECT count(*) FROM product_offers WHERE closed_by = 'expired'"
        )
        .await
            >= 1
    );
    assert!(count(&db, "SELECT count(*) FROM purchases").await > 40);
    assert!(
        count(
            &db,
            "SELECT count(*) FROM event_sellers WHERE payout_received"
        )
        .await
            > 10
    );
    assert!(
        count(
            &db,
            "SELECT count(*) FROM purchases WHERE price_source = 'negotiated'"
        )
        .await
            >= 2
    );
    assert_eq!(
        count(&db, "SELECT count(*) FROM reports WHERE status = 'open'").await,
        1
    );
    assert_eq!(
        count(&db, "SELECT count(*) FROM users WHERE status = 'banned'").await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM users WHERE managed_by_event_id IS NOT NULL"
        )
        .await,
        2
    );
    assert!(count(&db, "SELECT count(*) FROM unread_notices").await > 0);
    // No mails to the demo accounts, no reminders for the demo bazaars
    assert_eq!(
        count(&db, "SELECT count(*) FROM jobs WHERE kind LIKE 'mail.%'").await,
        0
    );
    assert_eq!(
        count(&db, "SELECT count(*) FROM events WHERE reminder_day_before_sent_for IS DISTINCT FROM start_date").await,
        0
    );

    // The views of organizers, sellers and admins work on the data
    let kids = event_id(&db, "Kinderbasar Kita Sonnenschein").await;
    let event = json!({ "eventId": kids });
    let summary = ok(
        &app,
        "events.getEventFinancialSummary",
        event.clone(),
        Some(&organizer),
    )
    .await;
    assert!(summary.to_string().len() > 10, "{summary}");
    let products = ok(
        &app,
        "eventProducts.getProductsForEventManagement",
        event.clone(),
        Some(&organizer),
    )
    .await;
    assert!(
        products.as_array().is_some_and(|p| p.len() > 60),
        "{products}"
    );
    ok(
        &app,
        "eventRoles.getVendorsForEvent",
        event.clone(),
        Some(&organizer),
    )
    .await;
    ok(
        &app,
        "purchases.getPurchasesForEvent",
        event.clone(),
        Some(&organizer),
    )
    .await;
    ok(
        &app,
        "broadcasts.listEventBroadcasts",
        event.clone(),
        Some(&seller),
    )
    .await;
    ok(&app, "purchases.getMySales", json!({}), Some(&seller)).await;
    ok(
        &app,
        "events.getMyRegisteredEvents",
        json!({}),
        Some(&seller),
    )
    .await;
    let public = ok(&app, "events.get", json!({}), None).await;
    assert!(public.as_array().is_some_and(|e| e.len() >= 6), "{public}");
    let overview = ok(&app, "moderation.getOverview", json!({}), Some(&admin)).await;
    assert!(overview.to_string().len() > 10);
    let open = ok(
        &app,
        "moderation.listReports",
        json!({ "status": "open" }),
        Some(&admin),
    )
    .await;
    assert_eq!(open.as_array().map(Vec::len), Some(1), "{open}");
    let messages = ok(
        &app,
        "moderation.listMessages",
        json!({ "handled": false }),
        Some(&admin),
    )
    .await;
    assert_eq!(messages.as_array().map(Vec::len), Some(2), "{messages}");
    ok(&app, "moderation.listLog", json!({}), Some(&admin)).await;

    // The next deploy of a review app only moves the running bazaars to today
    sqlx::query("UPDATE events SET start_date = now() - interval '9 days', end_date = now() - interval '2 days' WHERE title = 'Kinderbasar Kita Sonnenschein'")
        .execute(&db)
        .await
        .unwrap();
    let skipped = demo::run(&app.state, options(Locale::De)).await.unwrap();
    assert!(skipped.contains("übersprungen"), "{skipped}");
    assert_eq!(count(&db, "SELECT count(*) FROM events").await, 14);
    assert_eq!(
        count(&db, "SELECT count(*) FROM events WHERE title = 'Kinderbasar Kita Sonnenschein' AND start_date <= now() AND end_date > now()").await,
        1
    );

    // The end-to-end tests create a showcase of their own per test
    let mut ctx = Ctx::begin(&app.state).await.unwrap();
    let showcase = demo::create_feature_showcase(&mut ctx, "E2E Angebote", Locale::De)
        .await
        .unwrap();
    ctx.commit().await.unwrap();
    let showcase = serde_json::to_value(showcase).unwrap();
    assert!(showcase["products"]["trekking"].is_string(), "{showcase}");
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE title = 'E2E Angebote'"
        )
        .await,
        1
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn english_demo_for_screenshots(db: PgPool) {
    let app = TestApp::new(db.clone());
    demo::run(&app.state, options(Locale::En)).await.unwrap();
    sign_in(&app, "sarah.miller@example.org").await;
    let titles: Vec<String> = sqlx::query_scalar("SELECT title FROM events ORDER BY title")
        .fetch_all(&db)
        .await
        .unwrap();
    assert!(
        titles.contains(&"Sunshine Nursery Kids' Bazaar".to_owned()),
        "{titles:?}"
    );
    assert!(titles.contains(&"Bike bazaar community hall (all features)".to_owned()));
    let labels: Vec<String> = sqlx::query_scalar(
        "SELECT DISTINCT c.label FROM products p JOIN categories c ON c.id = p.category_id ORDER BY 1",
    )
    .fetch_all(&db)
    .await
    .unwrap();
    assert!(
        labels.contains(&"Toys".to_owned()) && !labels.contains(&"Spielzeug".to_owned()),
        "{labels:?}"
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM users WHERE email LIKE '%@example.org' AND locale = 'en'"
        )
        .await,
        count(
            &db,
            "SELECT count(*) FROM users WHERE email LIKE '%@example.org'"
        )
        .await
    );
}
