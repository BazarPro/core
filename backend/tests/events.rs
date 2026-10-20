//! Bazaars (convex/tests/events.test.ts, singleMode.test.ts).

mod common;

use axum::http::StatusCode;
use bazarpro_backend::Config;
use bazarpro_backend::config::InstanceMode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const HOUR: f64 = 3_600_000.0;

fn now_ms() -> f64 {
    chrono::Utc::now().timestamp_millis() as f64
}

fn event_args(title: &str, visibility: &str) -> Value {
    json!({
        "title": title,
        "description": "Kinderkleider und Spielzeug",
        "location": "Halle",
        "startDate": now_ms() + 24.0 * HOUR,
        "endDate": now_ms() + 30.0 * HOUR,
        "contactInfo": "orga@test.de",
        "categories": [],
        "services": ["Parkplatz"],
        "visibility": visibility,
        "commission": 10,
    })
}

async fn create(app: &TestApp, session: &str, args: Value) -> Uuid {
    let reply = app
        .mutation("events.createEvent", args, Some(session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].as_str().unwrap().parse().unwrap()
}

/// The arguments of editEvent from the current state of the event.
async fn edit_args(app: &TestApp, session: &str, id: Uuid) -> Value {
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(session))
        .await
        .body["value"]
        .clone();
    json!({
        "id": id,
        "title": event["title"],
        "description": event["description"],
        "location": event["location"],
        "startDate": event["startDate"],
        "endDate": event["endDate"],
        "categories": event["categories"],
        "contactInfo": event["contactInfo"],
        "commission": event["commission"],
        "services": event["services"],
        "visibility": event["visibility"],
    })
}

async fn single_mode_app(db: &PgPool) -> TestApp {
    let mut config = Config::for_tests("");
    config.mode = InstanceMode::Single;
    TestApp::with_config(db.clone(), config)
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn creating_an_event_makes_the_creator_organizer(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let category = fixtures::category(&db, "Kleidung").await;
    let mut args = event_args("Kinderbasar", "logged-in");
    args["categories"] = json!([category]);
    args["features"] = json!({ "priceOffers": true, "maxDiscountPercent": 30 });
    args["sellerLogistics"] = json!({ "dropoffStart": now_ms(), "dropoffEnd": now_ms() + HOUR, "note": "  Bitte mit Schloss  " });
    let id = create(&app, &session, args).await;

    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(event["title"], "Kinderbasar");
    assert_eq!(event["organizerId"], json!(organizer));
    // Not public: no approval needed
    assert_eq!(
        (event["isApproved"].clone(), event["approvalStatus"].clone()),
        (json!(true), json!("approved"))
    );
    assert_eq!(event["categories"], json!([category]));
    assert_eq!(event["categoryLabels"], json!(["Kleidung"]));
    assert_eq!(event["services"], json!(["Parkplatz"]));
    assert_eq!(event["features"]["priceOffers"], true);
    assert_eq!(event["features"]["maxDiscountPercent"], 30.0);
    assert_eq!(event["sellerLogistics"]["note"], "Bitte mit Schloss");
    assert_eq!(event["coverImageUrl"], Value::Null);
    let roles = app
        .query(
            "eventRoles.getMyRolesForEvent",
            json!({ "eventId": id }),
            Some(&session),
        )
        .await;
    assert_eq!(roles.body["value"], json!(["organizer"]));

    assert_eq!(
        app.mutation("events.createEvent", event_args("X", "public"), None)
            .await
            .body["code"],
        "auth.required"
    );
    let mut bad = event_args("X", "public");
    bad["services"] = json!(["Hüpfburg"]);
    assert_eq!(
        app.mutation("events.createEvent", bad, Some(&session))
            .await
            .body["code"],
        "INVALID_ARGUMENTS"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn event_creation_can_be_switched_off(db: PgPool) {
    let app = TestApp::new(db.clone());
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('is_event_creation_enabled', false)",
    )
    .execute(&db)
    .await
    .unwrap();
    let session = fixtures::session(&db, fixtures::user(&db, "Orga").await).await;
    let reply = app
        .mutation(
            "events.createEvent",
            event_args("X", "public"),
            Some(&session),
        )
        .await;
    assert_eq!(reply.body["code"], "feature.eventCreationDisabled");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn public_events_wait_for_approval_and_admins_are_mailed(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let admin = fixtures::admin(&db, "Admin").await;
    let session = fixtures::session(&db, organizer).await;
    let id = create(&app, &session, event_args("Flohmarkt", "public")).await;

    // Hidden from the public and other users until approved, visible to the organizer
    assert!(
        app.query("events.get", json!({}), None).await.body["value"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let other = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    assert!(
        app.query("events.get", json!({}), Some(&other)).await.body["value"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        app.query("events.getEvent", json!({ "id": id }), Some(&other))
            .await
            .body["value"],
        Value::Null
    );
    assert_eq!(
        app.query("events.getEvent", json!({ "id": id }), Some(&session))
            .await
            .body["value"]["approvalStatus"],
        "pending"
    );

    let as_admin = fixtures::session(&db, admin).await;
    assert_eq!(
        app.query("events.countPendingApprovals", json!({}), Some(&as_admin))
            .await
            .body["value"],
        1
    );
    assert_eq!(
        app.query("events.countPendingApprovals", json!({}), Some(&session))
            .await
            .body["value"],
        0
    );
    app.run_jobs().await;
    {
        let sent = app.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "admin@test.example");
        assert_eq!(
            sent[0].subject,
            "Neuer Basar wartet auf Freigabe: Flohmarkt"
        );
        assert!(
            sent[0].html.contains("Orga")
                && sent[0].html.contains("https://bazarpro.test/admin/events")
        );
    }

    app.mutation(
        "events.approveEventForAdmin",
        json!({ "eventId": id }),
        Some(&as_admin),
    )
    .await;
    let public = app.query("events.get", json!({}), None).await.body["value"].clone();
    assert_eq!(public[0]["_id"], json!(id));
    let log: (String, String) =
        sqlx::query_as("SELECT action::text, target_label FROM moderation_log")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(log, ("approveEvent".to_owned(), "Flohmarkt".to_owned()));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_rejection_is_mailed_to_the_organizer_who_can_resubmit(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let admin = fixtures::admin(&db, "Admin").await;
    let session = fixtures::session(&db, organizer).await;
    let as_admin = fixtures::session(&db, admin).await;
    let id = create(&app, &session, event_args("Flohmarkt", "public")).await;
    app.run_jobs().await;
    app.sent.lock().unwrap().clear();

    let empty = app
        .mutation(
            "events.rejectEventForAdmin",
            json!({ "eventId": id, "reason": " " }),
            Some(&as_admin),
        )
        .await;
    assert_eq!(empty.body["code"], "event.rejectionReasonRequired");
    app.mutation(
        "events.rejectEventForAdmin",
        json!({ "eventId": id, "reason": "Kein Impressum" }),
        Some(&as_admin),
    )
    .await;
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (
            event["approvalStatus"].clone(),
            event["rejectionReason"].clone()
        ),
        (json!("rejected"), json!("Kein Impressum"))
    );
    app.run_jobs().await;
    {
        let sent = app.sent.lock().unwrap();
        assert_eq!(sent.len(), 1);
        assert_eq!(sent[0].to, "orga@test.example");
        assert!(sent[0].subject.contains("Flohmarkt"));
        assert!(sent[0].html.contains("Begründung: Kein Impressum"));
        assert!(
            sent[0]
                .html
                .contains(&format!("https://bazarpro.test/events/view/{id}/settings"))
        );
    }
    let markers = app
        .query(
            "notifications.getUnreadNoticeCounts",
            json!({}),
            Some(&session),
        )
        .await;
    assert_eq!(markers.body["value"]["events"], 1);

    let stranger = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    let forbidden = app
        .mutation(
            "events.requestEventReviewForOrganizer",
            json!({ "eventId": id }),
            Some(&stranger),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
    app.mutation(
        "events.requestEventReviewForOrganizer",
        json!({ "eventId": id }),
        Some(&session),
    )
    .await;
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(event["approvalStatus"], "pending");
    assert!(event.get("rejectionReason").is_none());
    app.run_jobs().await;
    assert_eq!(app.sent.lock().unwrap().len(), 2, "admins are told again");

    let private = create(&app, &session, event_args("Privat", "logged-in")).await;
    let not_public = app
        .mutation(
            "events.requestEventReviewForOrganizer",
            json!({ "eventId": private }),
            Some(&session),
        )
        .await;
    assert_eq!(not_public.body["code"], "event.notPublic");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn in_single_mode_only_admins_create_events_without_approval(db: PgPool) {
    let app = single_mode_app(&db).await;
    let user = fixtures::session(&db, fixtures::user(&db, "User").await).await;
    let admin = fixtures::session(&db, fixtures::admin(&db, "Admin").await).await;
    assert_eq!(
        app.mutation("events.createEvent", event_args("X", "public"), Some(&user))
            .await
            .body["code"],
        "auth.adminOnlyEvents"
    );
    let id = create(&app, &admin, event_args("Vereinsbasar", "public")).await;
    let public = app.query("events.get", json!({}), None).await.body["value"].clone();
    assert_eq!(public[0]["_id"], json!(id));

    // Admins see every event of the instance under "my events"
    let other_admin = fixtures::session(&db, fixtures::admin(&db, "Admin 2").await).await;
    let mine = app
        .query("events.getMyEvents", json!({}), Some(&other_admin))
        .await;
    assert_eq!(mine.body["value"].as_array().unwrap().len(), 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_access_code_is_only_shown_to_the_team(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let mut args = event_args("Geschlossen", "logged-in");
    args["accessCode"] = json!("geheim");
    let id = create(&app, &session, args).await;

    let other = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    let listed = app.query("events.get", json!({}), Some(&other)).await.body["value"][0].clone();
    assert_eq!(
        (
            listed["accessCode"].clone(),
            listed["hasAccessCode"].clone()
        ),
        (json!("••••"), json!(true))
    );
    let single = app
        .query("events.getEvent", json!({ "id": id }), Some(&other))
        .await
        .body["value"]
        .clone();
    assert_eq!(single["accessCode"], "••••");
    let own = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(own["accessCode"], "geheim");
    let mine = app
        .query("events.getMyEvents", json!({}), Some(&session))
        .await
        .body["value"][0]
        .clone();
    assert_eq!(mine["accessCode"], "geheim");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn visibility_of_events(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let admin = fixtures::session(&db, fixtures::admin(&db, "Admin").await).await;
    let public = fixtures::event(&db, EventSpec::new("Öffentlich", organizer)).await;
    let members = fixtures::event(&db, EventSpec::new("Mitglieder", organizer)).await;
    sqlx::query("UPDATE events SET visibility = 'logged-in' WHERE id = $1")
        .bind(members)
        .execute(&db)
        .await
        .unwrap();
    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    let blocked = fixtures::event(&db, EventSpec::new("Gesperrt", organizer)).await;
    sqlx::query(
        "UPDATE events SET hidden_at = now(), hidden_by = $2, hidden_reason = 'x' WHERE id = $1",
    )
    .bind(blocked)
    .bind(organizer)
    .execute(&db)
    .await
    .unwrap();
    let ids = |reply: &common::Reply| -> Vec<Uuid> {
        reply.body["value"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["_id"].as_str().unwrap().parse().unwrap())
            .collect()
    };
    let user = fixtures::session(&db, fixtures::user(&db, "User").await).await;

    assert_eq!(
        ids(&app.query("events.get", json!({}), None).await),
        vec![public]
    );
    assert_eq!(
        ids(&app.query("events.get", json!({}), Some(&user)).await),
        vec![public, members]
    );
    assert_eq!(
        ids(&app
            .query("events.get", json!({ "includePast": true }), None)
            .await),
        vec![past, public]
    );
    assert_eq!(
        ids(&app.query("events.get", json!({}), Some(&admin)).await).len(),
        3
    );

    // Blocked: only the team still sees it
    assert_eq!(
        app.query("events.getEvent", json!({ "id": blocked }), Some(&user))
            .await
            .body["value"],
        Value::Null
    );
    let as_organizer = fixtures::session(&db, organizer).await;
    assert_eq!(
        app.query(
            "events.getEvent",
            json!({ "id": blocked }),
            Some(&as_organizer)
        )
        .await
        .body["value"]["moderation"]["reason"],
        "x"
    );
    assert_eq!(
        app.query("events.getEvent", json!({ "id": Uuid::new_v4() }), None)
            .await
            .body["value"],
        Value::Null
    );

    let viewer = |id: Uuid| app.query("events.getPublicEventForViewer", json!({ "id": id }), None);
    assert_eq!(viewer(public).await.body["value"]["title"], "Öffentlich");
    assert_eq!(viewer(members).await.body["value"], Value::Null);
    assert_eq!(viewer(blocked).await.body["value"], Value::Null);

    let many = app
        .query(
            "events.getEvents",
            json!({ "ids": [public, Uuid::new_v4(), past] }),
            None,
        )
        .await;
    assert_eq!(ids(&many), vec![public, past]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_the_organizer_edits_and_making_it_public_needs_approval(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let id = create(&app, &session, event_args("Basar", "logged-in")).await;
    let mut args = edit_args(&app, &session, id).await;
    args["title"] = json!("Neuer Titel");

    let other = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    assert_eq!(
        app.mutation("events.editEvent", args.clone(), Some(&other))
            .await
            .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.mutation("events.editEvent", args.clone(), None)
            .await
            .body["code"],
        "auth.required"
    );
    let mut missing = args.clone();
    missing["id"] = json!(Uuid::new_v4());
    assert_eq!(
        app.mutation("events.editEvent", missing, Some(&session))
            .await
            .body["code"],
        "notFound.event"
    );

    args["visibility"] = json!("public");
    let reply = app.mutation("events.editEvent", args, Some(&session)).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (event["title"].clone(), event["approvalStatus"].clone()),
        (json!("Neuer Titel"), json!("pending"))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn editing_keeps_and_clears_images_and_features(db: PgPool) {
    let app = TestApp::new(db.clone());
    let session = app.user_session("orga@example.org", false).await;
    let png = b"\x89PNG\r\n\x1a\n-cover".to_vec();
    let cover = app.upload(png, "image/png", Some(&session)).await.body["storageId"].clone();
    let mut args = event_args("Basar", "logged-in");
    args["coverImage"] = cover.clone();
    args["features"] = json!({ "fixedSellerData": true, "questions": true });
    let id = create(&app, &session, args).await;

    // Without features and images the stored ones stay
    let args = edit_args(&app, &session, id).await;
    app.mutation("events.editEvent", args.clone(), Some(&session))
        .await;
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(event["coverImage"], cover);
    assert_eq!(
        event["coverImageUrl"],
        format!(
            "https://bazarpro.test/api/files/{}",
            cover.as_str().unwrap()
        )
    );
    assert_eq!(event["features"]["fixedSellerData"], true);

    let mut clear = args.clone();
    clear["clearCoverImage"] = json!(true);
    clear["features"] = json!({ "questions": false });
    app.mutation("events.editEvent", clear, Some(&session))
        .await;
    let event = app
        .query("events.getEvent", json!({ "id": id }), Some(&session))
        .await
        .body["value"]
        .clone();
    assert!(event.get("coverImage").is_none());
    assert_eq!(event["features"]["questions"], false);
    // A switch an older client does not send keeps its value
    assert_eq!(event["features"]["fixedSellerData"], true);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn running_events_keep_dates_fees_and_visibility(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let id = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            ..EventSpec::new("Läuft", organizer)
        },
    )
    .await;
    let args = edit_args(&app, &session, id).await;
    let edit = |change: &dyn Fn(&mut Value)| {
        let mut args = args.clone();
        change(&mut args);
        let (app, session) = (&app, session.clone());
        async move {
            app.mutation("events.editEvent", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(
        edit(&|a| a["startDate"] = json!(a["startDate"].as_f64().unwrap() + HOUR)).await["code"],
        "event.runningNoDate"
    );
    assert_eq!(
        edit(&|a| a["visibility"] = json!("logged-in")).await["code"],
        "event.runningNoVisibility"
    );
    assert_eq!(
        edit(&|a| a["commission"] = json!(5)).await["code"],
        "event.runningNoFees"
    );
    // A date that only differs in the seconds is unchanged
    assert_eq!(
        edit(&|a| a["startDate"] = json!(a["startDate"].as_f64().unwrap() + 30_000.0)).await["value"],
        Value::Null
    );
    let lock = app
        .query(
            "events.getFeeLock",
            json!({ "eventId": id }),
            Some(&session),
        )
        .await;
    assert_eq!(lock.body["value"], json!({ "locked": true }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_the_first_seller_fees_only_go_down_and_the_limit_only_up(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let id = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "intakeFee": 1, "maxItemsPerSeller": 20 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let lock = || {
        app.query(
            "events.getFeeLock",
            json!({ "eventId": id }),
            Some(&session),
        )
    };
    assert_eq!(lock().await.body["value"], json!({ "locked": false }));
    fixtures::role(&db, id, fixtures::user(&db, "Seller").await, "seller").await;
    assert_eq!(lock().await.body["value"], json!({ "locked": true }));

    let args = edit_args(&app, &session, id).await;
    let edit = |commission: f64, features: Value| {
        let mut args = args.clone();
        args["commission"] = json!(commission);
        args["features"] = features;
        let (app, session) = (&app, session.clone());
        async move {
            app.mutation("events.editEvent", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(
        edit(15.0, json!({ "intakeFee": 1, "maxItemsPerSeller": 20 })).await["code"],
        "event.feesOnlyLower"
    );
    assert_eq!(
        edit(10.0, json!({ "intakeFee": 2, "maxItemsPerSeller": 20 })).await["code"],
        "event.feesOnlyLower"
    );
    assert_eq!(
        edit(10.0, json!({ "intakeFee": 1, "maxItemsPerSeller": 10 })).await["code"],
        "event.limitOnlyHigher"
    );
    assert_eq!(
        edit(5.0, json!({ "intakeFee": 0.5, "maxItemsPerSeller": 30 })).await["value"],
        Value::Null
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn deleting_events(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let id = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let location: Uuid = sqlx::query_scalar(
        "INSERT INTO event_location_categories (event_id, label) VALUES ($1, 'Halle') RETURNING id",
    )
    .bind(id)
    .fetch_one(&db)
    .await
    .unwrap();
    let product = fixtures::product(&db, organizer, "Ski", 10.0).await;
    let relation = fixtures::event_product(&db, id, product, "announced").await;
    sqlx::query("UPDATE event_products SET location_category_id = $2 WHERE id = $1")
        .bind(relation)
        .bind(location)
        .execute(&db)
        .await
        .unwrap();

    let other = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    assert_eq!(
        app.mutation("events.deleteEvent", json!({ "id": id }), Some(&other))
            .await
            .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.mutation("events.deleteEvent", json!({ "id": id }), None)
            .await
            .body["code"],
        "auth.required"
    );
    assert_eq!(
        app.mutation(
            "events.deleteEvent",
            json!({ "id": Uuid::new_v4() }),
            Some(&session)
        )
        .await
        .body["code"],
        "notFound.event"
    );
    app.mutation("events.deleteEvent", json!({ "id": id }), Some(&session))
        .await;
    for table in [
        "events",
        "event_location_categories",
        "event_products",
        "event_roles",
    ] {
        let count: i64 =
            sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(count, 0, "{table}");
    }
    // The item itself stays with its seller
    assert_eq!(
        app.query("users.getExportData", json!({}), Some(&session))
            .await
            .body["value"]["products"][0]["title"],
        "Ski"
    );

    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    assert_eq!(
        app.mutation("events.deleteEvent", json!({ "id": past }), Some(&session))
            .await
            .body["code"],
        "event.pastNoDelete"
    );
    let with_sales = fixtures::event(&db, EventSpec::new("Verkauft", organizer)).await;
    let sold = fixtures::product(&db, organizer, "Rad", 10.0).await;
    fixtures::purchase(&db, with_sales, sold, organizer, (10.0, 1.0, 9.0)).await;
    assert_eq!(
        app.mutation(
            "events.deleteEvent",
            json!({ "id": with_sales }),
            Some(&session)
        )
        .await
        .body["code"],
        "EVENT_HAS_SALES"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn my_events_and_registered_events(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let helper = fixtures::user(&db, "Helper").await;
    let own = fixtures::event(&db, EventSpec::new("Eigener", organizer)).await;
    let helped = fixtures::event(
        &db,
        EventSpec::new("Geholfen", fixtures::user(&db, "Andere").await),
    )
    .await;
    fixtures::role(&db, helped, organizer, "coorganizer").await;
    fixtures::event(&db, EventSpec::new("Fremd", helper)).await;
    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    let session = fixtures::session(&db, organizer).await;
    let ids = |reply: common::Reply| -> Vec<Value> {
        reply.body["value"]
            .as_array()
            .unwrap()
            .iter()
            .map(|e| e["_id"].clone())
            .collect()
    };
    assert_eq!(
        ids(app
            .query("events.getMyEvents", json!({}), Some(&session))
            .await),
        vec![json!(own), json!(helped)]
    );
    assert_eq!(
        ids(app
            .query(
                "events.getMyEvents",
                json!({ "includePast": true }),
                Some(&session)
            )
            .await)
        .len(),
        3
    );
    assert!(
        ids(app
            .query(
                "events.getMyEvents",
                json!({ "includePast": true }),
                Some(&session)
            )
            .await)
        .contains(&json!(past))
    );
    assert_eq!(
        app.query("events.getMyEvents", json!({}), None).await.body["code"],
        "auth.required"
    );

    fixtures::role(&db, own, helper, "seller").await;
    let as_helper = fixtures::session(&db, helper).await;
    assert_eq!(
        ids(app
            .query("events.getMyRegisteredEvents", json!({}), Some(&as_helper))
            .await),
        vec![json!(own)]
    );
    assert_eq!(
        app.query("events.getMyRegisteredEvents", json!({}), None)
            .await
            .body["value"],
        json!([])
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn leaving_an_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Seller").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    fixtures::role(&db, event, seller, "seller").await;
    fixtures::event_seller(&db, event, seller, 1, false).await;
    let announced = fixtures::product(&db, seller, "Angemeldet", 10.0).await;
    fixtures::event_product(&db, event, announced, "announced").await;
    let session = fixtures::session(&db, seller).await;
    assert_eq!(
        app.query(
            "events.getMyProductCountForEvent",
            json!({ "eventId": event }),
            Some(&session)
        )
        .await
        .body["value"],
        1
    );

    // Handed in items keep the seller in
    let handed_in = fixtures::product(&db, seller, "Abgegeben", 10.0).await;
    let relation = fixtures::event_product(&db, event, handed_in, "available").await;
    assert_eq!(
        app.mutation(
            "events.leaveEvent",
            json!({ "eventId": event }),
            Some(&session)
        )
        .await
        .body["code"],
        "leave.itemsHandledIn"
    );
    sqlx::query("DELETE FROM event_products WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();

    let reply = app
        .mutation(
            "events.leaveEvent",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let left: (i64, i64, i64) = sqlx::query_as(
        "SELECT (SELECT count(*) FROM event_roles WHERE user_id = $1), (SELECT count(*) FROM event_sellers),
                (SELECT count(*) FROM event_products)",
    )
    .bind(seller)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(left, (0, 0, 0));

    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    fixtures::role(&db, past, seller, "seller").await;
    assert_eq!(
        app.mutation(
            "events.leaveEvent",
            json!({ "eventId": past }),
            Some(&session)
        )
        .await
        .body["code"],
        "leave.past"
    );
    let paid = fixtures::event(&db, EventSpec::new("Abgerechnet", organizer)).await;
    fixtures::role(&db, paid, seller, "seller").await;
    fixtures::event_seller(&db, paid, seller, 1, true).await;
    assert_eq!(
        app.mutation(
            "events.leaveEvent",
            json!({ "eventId": paid }),
            Some(&session)
        )
        .await
        .body["code"],
        "leave.paidOut"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_cash_summary(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "intakeFee": 2 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let rich = fixtures::user(&db, "Rich").await;
    let poor = fixtures::user(&db, "Poor").await;
    let paid = fixtures::user(&db, "Paid").await;
    for (seller, number, is_paid) in [(rich, 1, false), (poor, 2, false), (paid, 3, true)] {
        fixtures::role(&db, event, seller, "seller").await;
        fixtures::event_seller(&db, event, seller, number, is_paid).await;
    }
    // Rich sold one item at 50 € (20 % discount on 62.50 €)
    let item = fixtures::product(&db, rich, "Ski", 62.5).await;
    fixtures::event_product(&db, event, item, "sold").await;
    let sale = fixtures::purchase(&db, event, item, rich, (50.0, 5.0, 45.0)).await;
    sqlx::query("UPDATE purchases SET discount_percent = 20 WHERE id = $1")
        .bind(sale)
        .execute(&db)
        .await
        .unwrap();
    // Poor handed in two items and sold nothing: owes 4 € intake fee
    for title in ["A", "B"] {
        let item = fixtures::product(&db, poor, title, 5.0).await;
        fixtures::event_product(&db, event, item, "returned").await;
    }
    // Paid sold one item for 20 €
    let item = fixtures::product(&db, paid, "Rad", 20.0).await;
    fixtures::event_product(&db, event, item, "sold").await;
    fixtures::purchase(&db, event, item, paid, (20.0, 2.0, 18.0)).await;

    let session = fixtures::session(&db, organizer).await;
    let summary = app
        .query(
            "events.getEventFinancialSummary",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(summary["totalGrossRevenue"], 82.5);
    assert_eq!(summary["totalNetRevenue"], 70.0);
    assert_eq!(summary["totalDiscounts"], 12.5);
    assert_eq!(summary["totalCommission"], 7.0);
    assert_eq!(summary["totalPayoutSoll"], 63.0);
    // Rich: 45 − 2 fee = 43 pending; Paid: 18 − 2 = 16 paid out
    assert_eq!(summary["totalPendingPayout"], 43.0);
    assert_eq!(summary["totalPaidOut"], 16.0);
    assert_eq!(summary["totalIntakeFees"], 8.0);
    assert_eq!(
        summary["sellersToCollect"],
        json!([{ "name": "Poor", "sellerNumber": 2, "amount": 4.0 }])
    );
    assert_eq!(summary["totalFeesToCollect"], 4.0);
    assert_eq!(summary["cashInHandSoll"], 54.0);
    assert_eq!(
        (
            summary["salesCount"].clone(),
            summary["vendorsPaidCount"].clone(),
            summary["vendorsTotalCount"].clone()
        ),
        (json!(2), json!(1), json!(3))
    );

    let seller = fixtures::session(&db, rich).await;
    assert_eq!(
        app.query(
            "events.getEventFinancialSummary",
            json!({ "eventId": event }),
            Some(&seller)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admin_lists(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let old = fixtures::event(&db, EventSpec::new("Alt", organizer)).await;
    let public = fixtures::event(&db, EventSpec::new("Öffentlich", organizer)).await;
    sqlx::query("UPDATE events SET approval_status = 'pending', is_approved = false WHERE id = $1")
        .bind(public)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("UPDATE events SET visibility = 'logged-in' WHERE id = $1")
        .bind(old)
        .execute(&db)
        .await
        .unwrap();
    let admin = fixtures::session(&db, fixtures::admin(&db, "Admin").await).await;
    let user = fixtures::session(&db, organizer).await;
    for name in ["events.getEventsForAdmin", "events.getPublicEventsForAdmin"] {
        assert_eq!(
            app.query(name, json!({}), Some(&user)).await.body["code"],
            "auth.forbidden"
        );
    }
    let all = app
        .query("events.getEventsForAdmin", json!({}), Some(&admin))
        .await
        .body["value"]
        .clone();
    // Events from before approvals count as approved
    assert_eq!(all[0]["approvalStatus"], "approved");
    assert_eq!(all[0]["isApproved"], true);
    assert_eq!(all[1]["approvalStatus"], "pending");
    assert_eq!(all[1]["organizerName"], "Orga");
    let public_only = app
        .query("events.getPublicEventsForAdmin", json!({}), Some(&admin))
        .await
        .body["value"]
        .clone();
    assert_eq!(public_only.as_array().unwrap().len(), 1);
    assert_eq!(public_only[0]["organizerEmail"], "orga@test.example");
}
