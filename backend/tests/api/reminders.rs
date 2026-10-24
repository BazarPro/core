//! Seller reminders and label data.

use crate::common;

use bazarpro_backend::rpc;
use chrono::Utc;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    anna: Uuid,
}

/// Fahrradbörse starting in `start_hours` (6 hours long): Anna (number 7, two items,
/// one handed in), Ben (no items), Dora (one announced item).
async fn setup(db: PgPool, start_hours: i32) -> Setup {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            start_hours,
            end_hours: start_hours + 6,
            commission: 10,
            ..EventSpec::new("Fahrradbörse", organizer)
        },
    )
    .await;
    sqlx::query(
        "UPDATE events SET logistics_note = 'Bitte Räder mit Schloss abgeben.' WHERE id = $1",
    )
    .bind(event)
    .execute(&db)
    .await
    .unwrap();
    let anna = fixtures::user(&db, "Anna").await;
    let ben = fixtures::user(&db, "Ben").await;
    let dora = fixtures::user(&db, "Dora").await;
    for seller in [anna, ben, dora] {
        fixtures::role(&db, event, seller, "seller").await;
    }
    fixtures::event_seller(&db, event, anna, 7, false).await;
    for (seller, title, status) in [
        (anna, "Kinderrad", "available"),
        (anna, "Helm", "announced"),
        (dora, "Roller", "announced"),
    ] {
        let product = fixtures::product(&db, seller, title, 50.0).await;
        fixtures::event_product(&db, event, product, status).await;
    }
    Setup {
        app,
        db,
        event,
        anna,
    }
}

impl Setup {
    async fn run(&self, name: &str) -> Value {
        rpc::call(
            &self.app.state,
            None,
            name,
            json!({ "eventId": self.event }),
        )
        .await
        .unwrap()
    }

    async fn mails(&self) -> Vec<Value> {
        let mails: Vec<Value> = sqlx::query_scalar(
            "SELECT payload FROM jobs WHERE kind = 'mail.notification' ORDER BY run_at",
        )
        .fetch_all(&self.db)
        .await
        .unwrap();
        sqlx::query("DELETE FROM jobs WHERE kind = 'mail.notification'")
            .execute(&self.db)
            .await
            .unwrap();
        mails
    }

    async fn due(&self) -> Value {
        rpc::call(
            &self.app.state,
            None,
            "reminders.findDueReminders",
            json!({}),
        )
        .await
        .unwrap()
    }
}

fn detail(mail: &Value, label: &str) -> Value {
    mail["details"]
        .as_array()
        .unwrap()
        .iter()
        .find(|d| d["label"] == label)
        .map(|d| d["value"].clone())
        .unwrap_or(Value::Null)
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_evening_before_only_sellers_with_items_once(db: PgPool) {
    let s = setup(db.clone(), 1).await;
    assert_eq!(s.run("reminders.sendDayBeforeInfo").await, 2);
    let mails = s.mails().await;
    let mut to: Vec<&str> = mails.iter().map(|m| m["to"].as_str().unwrap()).collect();
    to.sort();
    assert_eq!(to, vec!["anna@test.example", "dora@test.example"]);
    let anna = mails
        .iter()
        .find(|m| m["to"] == "anna@test.example")
        .unwrap();
    assert_eq!(anna["subject"], "Bald ist es so weit: Fahrradbörse");
    assert_eq!(
        (detail(anna, "Deine Nummer"), detail(anna, "Deine Artikel")),
        (json!("7"), json!("2"))
    );
    assert!(
        anna["paragraphs"]
            .as_array()
            .unwrap()
            .contains(&json!("Bitte Räder mit Schloss abgeben."))
    );

    // Not twice, but again when the bazaar is moved
    assert_eq!(s.run("reminders.sendDayBeforeInfo").await, 0);
    sqlx::query("UPDATE events SET start_date = now() + interval '2 hours' WHERE id = $1")
        .bind(s.event)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(s.run("reminders.sendDayBeforeInfo").await, 2);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_the_end_sellers_not_paid_out_who_handed_in(db: PgPool) {
    let s = setup(db.clone(), -7).await;
    let sold = fixtures::product(&db, s.anna, "Fahrradanhänger", 50.0).await;
    fixtures::event_product(&db, s.event, sold, "sold").await;
    fixtures::purchase(&db, s.event, sold, s.anna, (50.0, 5.0, 45.0)).await;
    assert_eq!(s.run("reminders.sendPickupReminder").await, 1);
    let mails = s.mails().await;
    assert_eq!(mails[0]["to"], "anna@test.example");
    assert!(
        mails[0]["paragraphs"]
            .as_array()
            .unwrap()
            .contains(&json!("Abzuholen: Kinderrad."))
    );
    assert_eq!(
        mails[0]["details"],
        json!([
            { "label": "Verkauft", "value": "1 Artikel" },
            { "label": "Auszahlung", "value": "45,00 €" },
            { "label": "Abzuholen", "value": "1 Artikel" },
        ])
    );
    assert_eq!(s.run("reminders.sendPickupReminder").await, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_hourly_job_picks_due_bazaars_only(db: PgPool) {
    let soon = setup(db.clone(), 1).await;
    assert_eq!(soon.due().await["dayBefore"], json!([soon.event]));

    // Starts in two days: the evening before has not come yet
    sqlx::query("UPDATE events SET start_date = now() + interval '47 hours', end_date = now() + interval '53 hours'")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(soon.due().await, json!({ "dayBefore": [], "pickup": [] }));

    // Ended an hour ago: pickup reminder; once sent: nothing
    sqlx::query("UPDATE events SET start_date = now() - interval '7 hours', end_date = now() - interval '1 hour'")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(soon.due().await["pickup"], json!([soon.event]));
    let mut conn = db.acquire().await.unwrap();
    bazarpro_backend::jobs::enqueue(
        &mut conn,
        "reminders.sendDueReminders",
        &json!({}),
        Utc::now(),
    )
    .await
    .unwrap();
    soon.app.run_jobs().await;
    assert_eq!(soon.due().await["pickup"], json!([]));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn nothing_for_bazaars_that_are_not_approved(db: PgPool) {
    let s = setup(db.clone(), 1).await;
    for status in ["pending", "rejected"] {
        sqlx::query("UPDATE events SET approval_status = $1::approval_status")
            .bind(status)
            .execute(&db)
            .await
            .unwrap();
        assert_eq!(s.due().await, json!({ "dayBefore": [], "pickup": [] }));
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_later_pickup_gets_its_reminder_two_hours_before(db: PgPool) {
    let s = setup(db.clone(), -7).await;
    sqlx::query("UPDATE events SET pickup_start = now() + interval '20 hours', pickup_end = now() + interval '22 hours'").execute(&db).await.unwrap();
    assert_eq!(s.due().await["pickup"], json!([]));
    sqlx::query("UPDATE events SET end_date = now() - interval '24 hours', pickup_start = now() + interval '90 minutes', pickup_end = now() + interval '4 hours'")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(s.due().await["pickup"], json!([s.event]));
    // Pickup over: nothing
    sqlx::query("UPDATE events SET end_date = now() - interval '5 hours', pickup_start = now() - interval '3 hours', pickup_end = now() - interval '1 hour'")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(s.due().await["pickup"], json!([]));
}

#[test]
fn pickup_text_with_a_fee_to_pay_and_a_long_item_list() {
    use bazarpro_backend::i18n::Locale;
    use bazarpro_backend::modules::{docs::Event, notifications::T, reminders::pickup_reminder};
    let time = |s: &str| s.parse::<chrono::DateTime<Utc>>().unwrap();
    let event = Event {
        id: Uuid::nil(),
        created_at: time("2026-10-01T00:00:00Z"),
        title: "Kinderbasar".into(),
        description: String::new(),
        cover_image: None,
        event_map_image: None,
        location: "Halle".into(),
        start_date: time("2026-10-17T08:00:00Z"),
        end_date: time("2026-10-17T12:00:00Z"),
        contact_info: String::new(),
        categories: vec![],
        services: vec![],
        visibility: "public".into(),
        is_approved: None,
        approval_status: None,
        approved_at: None,
        approved_by: None,
        rejected_at: None,
        rejected_by: None,
        rejection_reason: None,
        access_code: None,
        vendor_limit: None,
        last_seller_number: None,
        commission: Default::default(),
        sale_fee_fixed: None,
        sale_fee_percentage: None,
        features: None,
        seller_logistics: Some(bazarpro_backend::modules::docs::SellerLogistics {
            pickup_start: Some(time("2026-10-17T14:00:00Z")),
            pickup_end: Some(time("2026-10-17T15:00:00Z")),
            ..Default::default()
        }),
        reminders_sent: None,
        moderation: None,
        organizer_id: Uuid::nil(),
    };
    let unsold: Vec<String> = (1..=12).map(|i| format!("Teil {i}")).collect();
    let content = pickup_reminder(
        &event,
        0,
        rust_decimal::Decimal::new(-6, 0),
        &unsold,
        T(Locale::De),
    );
    assert!(
        content
            .details
            .iter()
            .any(|d| d.label == "Annahmegebühr zu zahlen" && d.value == "6,00 €")
    );
    assert!(content.paragraphs.contains(&"Abzuholen: Teil 1, Teil 2, Teil 3, Teil 4, Teil 5, Teil 6, Teil 7, Teil 8, Teil 9, Teil 10 und 2 weitere.".to_owned()));
    assert!(
        content
            .paragraphs
            .contains(&"Abholung: Samstag, 17. Oktober 2026, 16:00–17:00 Uhr, Halle.".to_owned())
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn label_data_for_sellers_and_the_team(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Seller").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "labelFormat": "small", "priceOnLabel": true, "discounts": false }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, seller, "seller").await;
    fixtures::event_seller(&db, event, seller, 12, false).await;
    let jacket = fixtures::product(&db, seller, "Jacke", 15.0).await;
    sqlx::query("UPDATE products SET attributes = '{\"size\": \"128\"}' WHERE id = $1")
        .bind(jacket)
        .execute(&db)
        .await
        .unwrap();
    fixtures::event_product(&db, event, jacket, "announced").await;
    let loose = fixtures::product(&db, seller, "Ohne Basar", 5.0).await;

    let as_seller = fixtures::session(&db, seller).await;
    let data = app
        .query(
            "labels.getLabelData",
            json!({ "productIds": [jacket, loose] }),
            Some(&as_seller),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(data["format"], "small");
    assert_eq!(
        data["labels"][0],
        json!({ "productId": jacket, "title": "Jacke", "sellerNumber": 12, "size": "128", "price": 15.0 })
    );
    assert_eq!(
        data["labels"][1],
        json!({ "productId": loose, "title": "Ohne Basar" })
    );

    let team = fixtures::session(&db, organizer).await;
    let for_event = app
        .query(
            "labels.getLabelData",
            json!({ "productIds": [jacket], "eventId": event }),
            Some(&team),
        )
        .await;
    assert_eq!(for_event.body["value"]["labels"][0]["sellerNumber"], 12);
    assert_eq!(
        app.query(
            "labels.getLabelData",
            json!({ "productIds": [loose], "eventId": event }),
            Some(&team)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    assert_eq!(
        app.query(
            "labels.getLabelData",
            json!({ "productIds": [jacket] }),
            Some(&stranger)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
}
