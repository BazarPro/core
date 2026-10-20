//! Moderation by administrators (convex/tests/moderation.test.ts).

mod common;

use axum::http::StatusCode;
use bazarpro_backend::rpc;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    app: TestApp,
    db: PgPool,
    admin: String,
    seller: Uuid,
    seller_session: String,
    event: Uuid,
    product: Uuid,
}

async fn setup(db: PgPool) -> Setup {
    let app = TestApp::new(db.clone());
    let admin = fixtures::admin(&db, "Admin").await;
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let seller = fixtures::user(&db, "Seller").await;
    let product = fixtures::product(&db, seller, "Ski", 50.0).await;
    fixtures::event_product(&db, event, product, "announced").await;
    Setup {
        admin: fixtures::session(&db, admin).await,
        seller_session: fixtures::session(&db, seller).await,
        app,
        db,
        seller,
        event,
        product,
    }
}

impl Setup {
    async fn report(
        &self,
        session: Option<&str>,
        target_type: &str,
        target: Uuid,
        email: Option<&str>,
    ) -> common::Reply {
        let mut args = json!({ "targetType": target_type, "targetId": target, "reason": "fraud", "details": "Das ist eine Fälschung." });
        if let Some(email) = email {
            args["email"] = json!(email);
        }
        self.app
            .mutation("moderation.reportContent", args, session)
            .await
    }

    async fn mails(&self) -> Vec<Value> {
        let mails: Vec<Value> = sqlx::query_scalar(
            "SELECT payload FROM jobs WHERE kind = 'mail.notification' ORDER BY created_at",
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
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn reports_from_users_and_anonymous_reporters(db: PgPool) {
    let s = setup(db.clone()).await;
    assert_eq!(
        s.report(None, "product", s.product, None).await.body["code"],
        "report.emailRequired"
    );
    assert_eq!(
        s.report(None, "product", Uuid::new_v4(), Some("a@example.org"))
            .await
            .body["code"],
        "notFound.content"
    );
    assert_eq!(
        s.report(None, "product", s.product, Some("a@example.org"))
            .await
            .status,
        StatusCode::OK
    );
    // One mail to the admin with the content and the reason
    let mails = s.mails().await;
    assert_eq!(mails.len(), 1);
    assert_eq!(mails[0]["to"], "admin@test.example");
    assert_eq!(mails[0]["subject"], "Neue Meldung: Ski");
    assert!(
        mails[0]["details"]
            .as_array()
            .unwrap()
            .contains(&json!({ "label": "Grund", "value": "Betrug oder Fälschung" }))
    );

    let user = fixtures::session(&db, fixtures::user(&db, "Melder").await).await;
    s.report(Some(&user), "product", s.product, None).await;
    assert_eq!(
        s.report(Some(&user), "product", s.product, None).await.body["code"],
        "report.youReported"
    );
    // Further reports about the same content only raise the badge
    assert!(s.mails().await.is_empty());
    let short = s.app.mutation("moderation.reportContent", json!({ "targetType": "event", "targetId": s.event, "reason": "spam", "details": "kurz" }), Some(&user)).await;
    assert_eq!(short.body["code"], "report.detailsRequired");

    let counts = s
        .app
        .query("moderation.getMenuCounts", json!({}), Some(&s.admin))
        .await;
    assert_eq!(
        counts.body["value"],
        json!({ "openReports": 2, "unhandledMessages": 0 })
    );
    assert_eq!(
        s.app
            .query("moderation.getMenuCounts", json!({}), Some(&user))
            .await
            .body["value"],
        Value::Null
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_flood_of_anonymous_reports_is_stopped(db: PgPool) {
    let s = setup(db.clone()).await;
    for i in 0..30 {
        let target = fixtures::product(&db, s.seller, &format!("Teil {i}"), 1.0).await;
        assert_eq!(
            s.report(None, "product", target, Some(&format!("a{i}@example.org")))
                .await
                .status,
            StatusCode::OK
        );
    }
    assert_eq!(
        s.report(None, "product", s.product, Some("b@example.org"))
            .await
            .body["code"],
        "report.rateLimited"
    );
    let user = fixtures::session(&db, fixtures::user(&db, "Melder").await).await;
    assert_eq!(
        s.report(Some(&user), "product", s.product, None)
            .await
            .status,
        StatusCode::OK
    );
    // Admins got ten mails, not thirty-one
    assert_eq!(s.mails().await.len(), 10);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn hiding_an_item_closes_its_reports_and_tells_everybody(db: PgPool) {
    let s = setup(db.clone()).await;
    s.report(None, "product", s.product, Some("melder@example.org"))
        .await;
    s.mails().await;
    let hide = |reason: &str, session: &str| {
        let (app, args, session) = (
            &s.app,
            json!({ "productId": s.product, "reason": reason }),
            session.to_owned(),
        );
        async move {
            app.mutation("moderation.hideProduct", args, Some(&session))
                .await
        }
    };
    assert_eq!(
        hide("Gefälscht", &s.seller_session).await.body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        hide("kurz", &s.admin).await.body["code"],
        "moderation.reasonRequired"
    );
    assert_eq!(
        hide("Gefälschte Markenware", &s.admin).await.status,
        StatusCode::OK
    );

    assert_eq!(
        s.app
            .query(
                "products.getProduct",
                json!({ "productId": s.product }),
                None
            )
            .await
            .body["value"],
        Value::Null
    );
    let own = s
        .app
        .query(
            "products.getProduct",
            json!({ "productId": s.product }),
            Some(&s.seller_session),
        )
        .await;
    assert_eq!(
        own.body["value"]["moderation"]["reason"],
        "Gefälschte Markenware"
    );
    let mails = s.mails().await;
    let mut to: Vec<&str> = mails.iter().map(|m| m["to"].as_str().unwrap()).collect();
    to.sort();
    assert_eq!(to, vec!["melder@example.org", "seller@test.example"]);
    let report = s
        .app
        .query(
            "moderation.listReports",
            json!({ "status": "resolved" }),
            Some(&s.admin),
        )
        .await
        .body["value"][0]
        .clone();
    assert_eq!(
        (
            report["resolutionNote"].clone(),
            report["target"]["label"].clone(),
            report["reporterLabel"].clone()
        ),
        (
            json!("Gefälschte Markenware"),
            json!("Ski"),
            json!("melder@example.org")
        )
    );
    assert_eq!(report["target"]["isRestricted"], true);

    s.app
        .mutation(
            "moderation.restoreProduct",
            json!({ "productId": s.product }),
            Some(&s.admin),
        )
        .await;
    assert_eq!(
        s.app
            .query(
                "products.getProduct",
                json!({ "productId": s.product }),
                None
            )
            .await
            .body["value"]["title"],
        "Ski"
    );
    let log: Vec<String> = s
        .app
        .query("moderation.listLog", json!({}), Some(&s.admin))
        .await
        .body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["action"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(log, vec!["restoreProduct", "hideProduct"]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_blocked_event_is_gone_and_sellers_cannot_join(db: PgPool) {
    let s = setup(db.clone()).await;
    s.app
        .mutation(
            "moderation.hideEvent",
            json!({ "eventId": s.event, "reason": "Verstoß gegen Regeln" }),
            Some(&s.admin),
        )
        .await;
    assert!(
        s.app.query("events.get", json!({}), None).await.body["value"]
            .as_array()
            .unwrap()
            .is_empty()
    );
    let joiner = fixtures::session(&db, fixtures::user(&db, "Neu").await).await;
    assert_eq!(
        s.app
            .mutation(
                "eventSeller.joinEvent",
                json!({ "eventId": s.event }),
                Some(&joiner)
            )
            .await
            .body["code"],
        "event.blocked"
    );
    s.app
        .mutation(
            "moderation.restoreEvent",
            json!({ "eventId": s.event }),
            Some(&s.admin),
        )
        .await;
    assert_eq!(
        s.app.query("events.get", json!({}), None).await.body["value"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn deleting_a_question_keeps_both_texts_in_the_log(db: PgPool) {
    let s = setup(db.clone()).await;
    let asker = fixtures::user(&db, "Asker").await;
    let question: Uuid = sqlx::query_scalar(
        "INSERT INTO product_questions (event_id, product_id, asker_id, question, answer) VALUES ($1, $2, $3, 'Echt?', 'Ja') RETURNING id",
    )
    .bind(s.event)
    .bind(s.product)
    .bind(asker)
    .fetch_one(&db)
    .await
    .unwrap();
    s.app
        .mutation(
            "moderation.deleteQuestion",
            json!({ "questionId": question, "reason": "Beleidigend formuliert" }),
            Some(&s.admin),
        )
        .await;
    let label: String = sqlx::query_scalar("SELECT target_label FROM moderation_log")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(label, "„Echt?“ / Antwort: „Ja“");
    let mails = s.mails().await;
    assert_eq!(mails[0]["to"], "asker@test.example");
    assert!(
        mails[0]["paragraphs"][0]
            .as_str()
            .unwrap()
            .contains("„Ski“")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn banning_needs_a_reason_spares_admins_and_ends_sessions(db: PgPool) {
    let s = setup(db.clone()).await;
    let other_admin = fixtures::admin(&db, "Admin 2").await;
    let ban = |user: Uuid, reason: &str| {
        let (app, args, admin) = (
            &s.app,
            json!({ "userId": user, "reason": reason }),
            s.admin.clone(),
        );
        async move {
            app.mutation("moderation.banUser", args, Some(&admin))
                .await
                .body
        }
    };
    assert_eq!(
        ban(other_admin, "Grundlos gesperrt").await["code"],
        "moderation.noBanAdmin"
    );
    assert_eq!(
        ban(s.seller, "kurz").await["code"],
        "moderation.reasonRequired"
    );
    s.report(None, "user", s.seller, Some("m@example.org"))
        .await;
    s.mails().await;
    assert_eq!(
        ban(s.seller, "Betrug beim Verkauf").await["value"],
        Value::Null
    );
    assert_eq!(
        s.app
            .get("/api/auth/session", Some(&s.seller_session))
            .await
            .body,
        json!({ "userId": null })
    );
    // The user was told before the ban, the reporter after it
    let mails = s.mails().await;
    assert_eq!(mails[0]["to"], "seller@test.example");
    assert!(mails[0]["subject"].as_str().unwrap().contains("gesperrt"));
    assert_eq!(mails[1]["to"], "m@example.org");
    let summary = s
        .app
        .query(
            "moderation.getUserSummary",
            json!({ "userId": s.seller }),
            Some(&s.admin),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (
            summary["status"].clone(),
            summary["productCount"].clone(),
            summary["reportCount"].clone()
        ),
        (json!("banned"), json!(1), json!(1))
    );
    assert_eq!(summary["history"][0]["action"], "banUser");

    s.app
        .mutation(
            "moderation.unbanUser",
            json!({ "userId": s.seller }),
            Some(&s.admin),
        )
        .await;
    let status: Option<String> = sqlx::query_scalar("SELECT status::text FROM users WHERE id = $1")
        .bind(s.seller)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(status.as_deref(), Some("active"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn resolving_a_report_without_touching_the_content(db: PgPool) {
    let s = setup(db.clone()).await;
    s.report(None, "product", s.product, Some("m@example.org"))
        .await;
    let report = s
        .app
        .query(
            "moderation.listReports",
            json!({ "status": "open" }),
            Some(&s.admin),
        )
        .await
        .body["value"][0]["_id"]
        .clone();
    assert_eq!(
        s.app
            .query(
                "moderation.listReports",
                json!({ "status": "open" }),
                Some(&s.seller_session)
            )
            .await
            .body["code"],
        "auth.forbidden"
    );
    s.app
        .mutation(
            "moderation.resolveReport",
            json!({ "reportId": report, "status": "dismissed" }),
            Some(&s.admin),
        )
        .await;
    let again = s
        .app
        .mutation(
            "moderation.resolveReport",
            json!({ "reportId": report, "status": "resolved" }),
            Some(&s.admin),
        )
        .await;
    assert_eq!(again.body["code"], "report.closed");
    let mails = s.mails().await;
    assert!(
        mails.last().unwrap()["paragraphs"][0]
            .as_str()
            .unwrap()
            .contains("bleibt deshalb sichtbar")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn overview_browsing_messages_and_stats(db: PgPool) {
    let s = setup(db.clone()).await;
    fixtures::product(&db, s.seller, "Verborgen", 5.0).await;
    sqlx::query("UPDATE products SET hidden_at = now(), hidden_by = vendor_id, hidden_reason = 'x' WHERE title = 'Verborgen'").execute(&db).await.unwrap();
    sqlx::query(
        "INSERT INTO users (name, managed_by_event_id, status) SELECT 'Walk-in', id, 'active' FROM events LIMIT 1",
    )
    .execute(&db)
    .await
    .unwrap();
    s.app.mutation("messages.sendMessage", json!({ "name": "Max", "email": "max@example.org", "message": "Hallo", "acceptedPrivacyPolicy": true }), None).await;

    rpc::call(
        &s.app.state,
        None,
        "moderation.refreshPlatformStats",
        json!({}),
    )
    .await
    .unwrap();
    let overview = s
        .app
        .query("moderation.getOverview", json!({}), Some(&s.admin))
        .await
        .body["value"]
        .clone();
    // Admin, organizer, seller; not the walk-in
    assert_eq!(
        (overview["users"].clone(), overview["products"].clone()),
        (json!(3), json!(2))
    );
    assert_eq!(
        (
            overview["hiddenProducts"].clone(),
            overview["unhandledMessages"].clone(),
            overview["upcomingEvents"].clone()
        ),
        (json!(1), json!(1), json!(1))
    );

    let hidden = s
        .app
        .query(
            "moderation.listProducts",
            json!({ "onlyHidden": true }),
            Some(&s.admin),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(hidden.as_array().unwrap().len(), 1);
    let found = s
        .app
        .query(
            "moderation.listProducts",
            json!({ "search": "SK" }),
            Some(&s.admin),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(found[0]["title"], "Ski");
    assert_eq!(found[0]["vendorName"], "Seller");
    // Wildcards in the search are plain text
    assert!(
        s.app
            .query(
                "moderation.listProducts",
                json!({ "search": "%" }),
                Some(&s.admin)
            )
            .await
            .body["value"]
            .as_array()
            .unwrap()
            .is_empty()
    );

    let open = s
        .app
        .query(
            "moderation.listMessages",
            json!({ "handled": false }),
            Some(&s.admin),
        )
        .await
        .body["value"]
        .clone();
    let message = open[0]["_id"].clone();
    s.app
        .mutation(
            "moderation.setMessageHandled",
            json!({ "messageId": message, "handled": true }),
            Some(&s.admin),
        )
        .await;
    assert_eq!(
        s.app
            .query(
                "moderation.listMessages",
                json!({ "handled": true }),
                Some(&s.admin)
            )
            .await
            .body["value"][0]["_id"],
        message
    );
    assert_eq!(
        s.app
            .query(
                "moderation.listMessages",
                json!({ "handled": false }),
                Some(&s.admin)
            )
            .await
            .body["value"],
        json!([])
    );
    assert_eq!(
        s.app
            .query("moderation.isViewerAdmin", json!({}), Some(&s.admin))
            .await
            .body["value"],
        true
    );
    assert_eq!(
        s.app
            .query("moderation.isViewerAdmin", json!({}), None)
            .await
            .body["value"],
        false
    );
}
