//! Messages of organizers to their sellers.

use crate::common;

use chrono::{DateTime, Utc};
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    organizer: String,
    anna: Uuid,
    ben: Uuid,
}

/// Fahrradbörse with Anna (an item handed in), Ben (an announced item) and a walk-in
/// seller with a contact address (an item sold).
async fn setup(db: PgPool) -> Setup {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Fahrradbörse", organizer)).await;
    let anna = fixtures::user(&db, "Anna").await;
    let ben = fixtures::user(&db, "Ben").await;
    let walk_in: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, contact_email, managed_by_event_id, status) VALUES ('Walk-in', 'walkin@example.org', $1, 'active') RETURNING id",
    )
    .bind(event)
    .fetch_one(&db)
    .await
    .unwrap();
    for (seller, status) in [(anna, "available"), (ben, "announced"), (walk_in, "sold")] {
        fixtures::role(&db, event, seller, "seller").await;
        let product = fixtures::product(&db, seller, "Rad", 50.0).await;
        fixtures::event_product(&db, event, product, status).await;
    }
    Setup {
        organizer: fixtures::session(&db, organizer).await,
        app,
        db,
        event,
        anna,
        ben,
    }
}

impl Setup {
    async fn send(&self, changes: Value) -> common::Reply {
        let mut args = json!({
            "eventId": self.event,
            "subject": "Abgabe erst ab 9 Uhr",
            "body": "Liebe Verkäufer,\n\nbitte erst ab 9 Uhr kommen.\n\nDanke!",
            "audience": "all",
            "important": false,
        });
        for (key, value) in changes.as_object().unwrap() {
            args[key] = value.clone();
        }
        self.app
            .mutation(
                "broadcasts.sendSellerBroadcast",
                args,
                Some(&self.organizer),
            )
            .await
    }

    async fn queued(&self) -> Vec<(String, DateTime<Utc>, Value)> {
        sqlx::query_as("SELECT payload->>'to', run_at, payload FROM jobs WHERE kind = 'mail.notification' ORDER BY run_at")
            .fetch_all(&self.db)
            .await
            .unwrap()
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn goes_to_all_sellers_incl_walk_ins_one_after_the_other(db: PgPool) {
    let s = setup(db).await;
    assert_eq!(s.send(json!({})).await.body["value"], 3);
    let queued = s.queued().await;
    let mut to: Vec<&str> = queued.iter().map(|(to, ..)| to.as_str()).collect();
    to.sort();
    assert_eq!(
        to,
        vec![
            "anna@test.example",
            "ben@test.example",
            "walkin@example.org"
        ]
    );
    // Spread over time, so the SMTP server does not throttle
    let times: std::collections::HashSet<_> = queued.iter().map(|(_, at, _)| *at).collect();
    assert_eq!(times.len(), 3);
    let mail = &queued[0].2;
    assert_eq!(mail["subject"], "Abgabe erst ab 9 Uhr – Fahrradbörse");
    assert_eq!(
        mail["paragraphs"],
        json!([
            "Nachricht vom Veranstalter von „Fahrradbörse“:",
            "Liebe Verkäufer,",
            "bitte erst ab 9 Uhr kommen.",
            "Danke!"
        ])
    );
    assert!(mail["unsubscribe"].is_object());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn audiences_accepted_items_or_items_to_pick_up(db: PgPool) {
    let s = setup(db).await;
    let preview = |audience: &str| {
        let (app, args, session) = (
            &s.app,
            json!({ "eventId": s.event, "audience": audience }),
            s.organizer.clone(),
        );
        async move {
            app.query("broadcasts.getBroadcastPreview", args, Some(&session))
                .await
                .body["value"]
                .clone()
        }
    };
    assert_eq!(
        preview("accepted").await,
        json!({ "recipients": 2, "left": 5, "importantLeft": 1 })
    );
    assert_eq!(preview("pickup").await["recipients"], 1);
    s.send(json!({ "audience": "pickup" })).await;
    let queued = s.queued().await;
    assert_eq!(
        queued
            .iter()
            .map(|(to, ..)| to.as_str())
            .collect::<Vec<_>>(),
        vec!["anna@test.example"]
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sellers_get_a_marker_per_bazaar_also_with_emails_off(db: PgPool) {
    let s = setup(db.clone()).await;
    sqlx::query("UPDATE users SET notification_prefs = '{\"organizer\": false}' WHERE id = $1")
        .bind(s.anna)
        .execute(&db)
        .await
        .unwrap();
    s.send(json!({})).await;
    let anna = fixtures::session(&db, s.anna).await;
    let counts = s
        .app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&anna),
        )
        .await;
    assert_eq!(counts.body["value"]["messages"], 1);
    let unread = s
        .app
        .query("broadcasts.getMyUnreadMessages", json!({}), Some(&anna))
        .await
        .body["value"]
        .clone();
    assert_eq!(unread[s.event.to_string()]["count"], 1);
    assert!(unread[s.event.to_string()]["since"].is_f64());
    // Emails off: none for Anna; walk-ins get no marker
    assert!(
        !s.queued()
            .await
            .iter()
            .any(|(to, ..)| to == "anna@test.example")
    );
    let walk_in_markers: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM unread_notices n JOIN users u ON u.id = n.user_id WHERE u.managed_by_event_id IS NOT NULL",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(walk_in_markers, 0);

    // Opening the bazaar page clears its markers
    s.app
        .mutation(
            "notifications.markNoticesSeen",
            json!({ "area": "messages", "eventId": s.event }),
            Some(&anna),
        )
        .await;
    assert_eq!(
        s.app
            .query("broadcasts.getMyUnreadMessages", json!({}), Some(&anna))
            .await
            .body["value"],
        json!({})
    );

    // Important messages ignore the setting and have no unsubscribe link
    s.send(json!({ "important": true, "subject": "Basar fällt aus" }))
        .await;
    let important: Vec<Value> = s
        .queued()
        .await
        .into_iter()
        .filter(|(to, ..)| to == "anna@test.example")
        .map(|(_, _, mail)| mail)
        .collect();
    assert_eq!(important.len(), 1);
    assert!(important[0]["unsubscribe"].is_null());
    assert_eq!(
        important[0]["subject"],
        "Wichtig: Basar fällt aus – Fahrradbörse"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn limits_per_day_and_text_length(db: PgPool) {
    let s = setup(db).await;
    assert!(
        s.send(json!({ "subject": "Hi" })).await.body["message"]
            .as_str()
            .unwrap()
            .contains("Betreff")
    );
    assert!(
        s.send(json!({ "body": "kurz" })).await.body["message"]
            .as_str()
            .unwrap()
            .contains("Nachricht braucht")
    );
    s.send(json!({ "important": true })).await;
    assert!(
        s.send(json!({ "important": true })).await.body["message"]
            .as_str()
            .unwrap()
            .contains("schon eine wichtige")
    );
    for _ in 0..4 {
        s.send(json!({})).await;
    }
    assert!(
        s.send(json!({})).await.body["message"]
            .as_str()
            .unwrap()
            .contains("Höchstens 5 Nachrichten pro Tag")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_the_organizer_sends_helpers_see_the_log_sellers_their_messages(db: PgPool) {
    let s = setup(db.clone()).await;
    let helper = fixtures::user(&db, "Helfer").await;
    fixtures::role(&db, s.event, helper, "coorganizer").await;
    let as_helper = fixtures::session(&db, helper).await;
    let reply = s.app
        .mutation("broadcasts.sendSellerBroadcast", json!({ "eventId": s.event, "subject": "Hallo", "body": "Eine Nachricht von mir", "audience": "all", "important": false }), Some(&as_helper))
        .await;
    assert_eq!(reply.body["code"], "auth.forbidden");

    s.send(json!({ "subject": "Für alle" })).await;
    s.send(json!({ "subject": "Abholen", "audience": "pickup" }))
        .await;
    let log = s
        .app
        .query(
            "broadcasts.listEventBroadcasts",
            json!({ "eventId": s.event }),
            Some(&as_helper),
        )
        .await
        .body["value"]
        .clone();
    let summary: Vec<Value> = log
        .as_array()
        .unwrap()
        .iter()
        .map(|b| json!([b["subject"], b["recipientCount"], b["audience"]]))
        .collect();
    assert_eq!(
        summary,
        vec![
            json!(["Abholen", 1, "pickup"]),
            json!(["Für alle", 3, "all"])
        ]
    );
    let ben = fixtures::session(&db, s.ben).await;
    let for_ben = s
        .app
        .query(
            "broadcasts.listEventBroadcasts",
            json!({ "eventId": s.event }),
            Some(&ben),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(for_ben.as_array().unwrap().len(), 1);
    assert_eq!(for_ben[0]["subject"], "Für alle");
    assert!(for_ben[0].get("recipientCount").is_none());
    assert_eq!(
        s.app
            .query(
                "broadcasts.listEventBroadcasts",
                json!({ "eventId": s.event }),
                None
            )
            .await
            .body["value"],
        json!([])
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn nothing_to_send_without_recipients(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Leer", organizer)).await;
    let reply = app
        .mutation("broadcasts.sendSellerBroadcast", json!({ "eventId": event, "subject": "Hallo", "body": "Eine Nachricht für alle", "audience": "accepted", "important": false }), Some(&fixtures::session(&db, organizer).await))
        .await;
    assert!(
        reply.body["message"]
            .as_str()
            .unwrap()
            .contains("Keine Verkäufer")
    );
}
