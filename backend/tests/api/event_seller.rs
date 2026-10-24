//! Joining as seller, seller numbers, payout and location categories.

use crate::common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn seller_row(
    db: &PgPool,
    event: Uuid,
    user: Uuid,
) -> Option<(Option<i32>, bool, f64, f64, Option<f64>, Option<i32>)> {
    sqlx::query_as(
        "SELECT number, payout_received, commission_fee::float8, payout_amount::float8, intake_fee::float8, intake_fee_items
         FROM event_sellers WHERE event_id = $1 AND user_id = $2",
    )
    .bind(event)
    .bind(user)
    .fetch_optional(db)
    .await
    .unwrap()
}

async fn join(app: &TestApp, db: &PgPool, event: Uuid, user: Uuid, args: Value) -> common::Reply {
    let mut args = args;
    args["eventId"] = json!(event);
    app.mutation(
        "eventSeller.joinEvent",
        args,
        Some(&fixtures::session(db, user).await),
    )
    .await
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn joining_creates_the_seller_with_a_running_number(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let (a, b, c) = (
        fixtures::user(&db, "A").await,
        fixtures::user(&db, "B").await,
        fixtures::user(&db, "C").await,
    );

    let reply = join(&app, &db, event, a, json!({})).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // Joining again returns the same row
    assert_eq!(
        join(&app, &db, event, a, json!({})).await.body["value"],
        reply.body["value"]
    );
    join(&app, &db, event, b, json!({})).await;
    assert_eq!(seller_row(&db, event, a).await.unwrap().0, Some(1));
    assert_eq!(seller_row(&db, event, b).await.unwrap().0, Some(2));

    // B leaves; the next seller gets 3, not 2 again
    app.mutation(
        "events.leaveEvent",
        json!({ "eventId": event }),
        Some(&fixtures::session(&db, b).await),
    )
    .await;
    join(&app, &db, event, c, json!({})).await;
    assert_eq!(seller_row(&db, event, c).await.unwrap().0, Some(3));

    let as_a = fixtures::session(&db, a).await;
    assert_eq!(
        app.query(
            "eventSeller.isEventSellerForEvent",
            json!({ "eventId": event }),
            Some(&as_a)
        )
        .await
        .body["value"],
        true
    );
    assert_eq!(
        app.query(
            "eventSeller.isEventSellerForEvent",
            json!({ "eventId": event }),
            None
        )
        .await
        .body["value"],
        false
    );
    assert_eq!(
        app.query(
            "sellerNumbers.getMySellerNumber",
            json!({ "eventId": event }),
            Some(&as_a)
        )
        .await
        .body["value"],
        1
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn joining_is_refused_when_it_should_be(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let user = fixtures::user(&db, "User").await;
    assert_eq!(
        app.mutation(
            "eventSeller.joinEvent",
            json!({ "eventId": Uuid::new_v4() }),
            None
        )
        .await
        .body["code"],
        "auth.required"
    );
    assert_eq!(
        join(&app, &db, Uuid::new_v4(), user, json!({})).await.body["code"],
        "notFound.event"
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
        join(&app, &db, past, user, json!({})).await.body["code"],
        "join.past"
    );

    let limited = fixtures::event(&db, EventSpec::new("Voll", organizer)).await;
    sqlx::query("UPDATE events SET vendor_limit = 1 WHERE id = $1")
        .bind(limited)
        .execute(&db)
        .await
        .unwrap();
    join(
        &app,
        &db,
        limited,
        fixtures::user(&db, "Erster").await,
        json!({}),
    )
    .await;
    assert_eq!(
        join(&app, &db, limited, user, json!({})).await.body["code"],
        "join.vendorLimit"
    );

    let private = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "privateSellersOnly": true }),
            ..EventSpec::new("Privat", organizer)
        },
    )
    .await;
    assert_eq!(
        join(&app, &db, private, user, json!({})).await.body["code"],
        "join.privateRequired"
    );
    join(&app, &db, private, user, json!({ "privateSeller": true })).await;
    let confirmed: Option<chrono::DateTime<chrono::Utc>> = sqlx::query_scalar(
        "SELECT private_seller_confirmed_at FROM event_sellers WHERE event_id = $1",
    )
    .bind(private)
    .fetch_one(&db)
    .await
    .unwrap();
    assert!(confirmed.is_some());

    let record = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "fixedSellerData": true }),
            ..EventSpec::new("Radmarkt", organizer)
        },
    )
    .await;
    assert_eq!(
        join(&app, &db, record, user, json!({})).await.body["code"],
        "join.profileIncomplete"
    );

    let blocked = fixtures::event(&db, EventSpec::new("Gesperrt", organizer)).await;
    sqlx::query(
        "UPDATE events SET hidden_at = now(), hidden_by = $2, hidden_reason = 'x' WHERE id = $1",
    )
    .bind(blocked)
    .bind(organizer)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        join(&app, &db, blocked, user, json!({})).await.body["code"],
        "event.blocked"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn access_codes_and_the_demo_code(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let user = fixtures::user(&db, "User").await;
    let event = fixtures::event(&db, EventSpec::new("Geschlossen", organizer)).await;
    sqlx::query("UPDATE events SET access_code = 'geheim' WHERE id = $1")
        .bind(event)
        .execute(&db)
        .await
        .unwrap();
    let session = fixtures::session(&db, user).await;
    let check = |code: &str| {
        let (app, session) = (&app, &session);
        let args = json!({ "eventId": event, "accessCode": code });
        async move {
            app.mutation("eventSeller.checkAccessCode", args, Some(session))
                .await
                .body["value"]
                .clone()
        }
    };
    assert_eq!(check("falsch").await, false);
    assert_eq!(check("geheim").await, true);
    assert_eq!(check("DEMO").await, false);
    assert_eq!(
        join(&app, &db, event, user, json!({ "accessCode": "DEMO" }))
            .await
            .body["code"],
        "join.invalidCode"
    );

    sqlx::query("INSERT INTO feature_flags (key, value) VALUES ('is_demo_mode', true)")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(check("DEMO").await, true);
    assert_eq!(check("falsch").await, false);
    assert_eq!(
        join(&app, &db, event, user, json!({ "accessCode": "DEMO" }))
            .await
            .status,
        StatusCode::OK
    );

    let open = fixtures::event(&db, EventSpec::new("Offen", organizer)).await;
    assert_eq!(
        app.mutation(
            "eventSeller.checkAccessCode",
            json!({ "eventId": open }),
            Some(&session)
        )
        .await
        .body["value"],
        true
    );
    assert_eq!(
        app.mutation(
            "eventSeller.checkAccessCode",
            json!({ "eventId": Uuid::new_v4() }),
            Some(&session)
        )
        .await
        .body["code"],
        "notFound.event"
    );
    assert_eq!(
        app.mutation(
            "eventSeller.checkAccessCode",
            json!({ "eventId": event, "accessCode": "geheim" }),
            None
        )
        .await
        .body["code"],
        "auth.required"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn wrong_access_codes_are_limited_per_user(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let guesser = fixtures::user(&db, "Guesser").await;
    let other = fixtures::user(&db, "Other").await;
    let event = fixtures::event(&db, EventSpec::new("Geschlossen", organizer)).await;
    sqlx::query("UPDATE events SET access_code = 'geheim' WHERE id = $1")
        .bind(event)
        .execute(&db)
        .await
        .unwrap();
    let session = fixtures::session(&db, guesser).await;
    let check = |code: &'static str| {
        let (app, session) = (&app, &session);
        async move {
            app.mutation(
                "eventSeller.checkAccessCode",
                json!({ "eventId": event, "accessCode": code }),
                Some(session),
            )
            .await
        }
    };

    // Wrong codes when joining count as well, although the mutation rolls back
    for _ in 0..5 {
        assert_eq!(
            join(&app, &db, event, guesser, json!({ "accessCode": "falsch" }))
                .await
                .body["code"],
            "join.invalidCode"
        );
    }
    for _ in 0..4 {
        assert_eq!(check("falsch").await.body["value"], false);
    }
    // The correct code does not refill the attempts
    assert_eq!(check("geheim").await.body["value"], true);
    assert_eq!(check("falsch").await.body["value"], false);

    let limited = check("geheim").await;
    assert_eq!(limited.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(limited.body["code"], "join.tooManyAttempts");
    assert_eq!(
        join(&app, &db, event, guesser, json!({ "accessCode": "geheim" }))
            .await
            .body["code"],
        "join.tooManyAttempts"
    );
    assert!(seller_row(&db, event, guesser).await.is_none());

    // Other users are not affected
    assert_eq!(
        join(&app, &db, event, other, json!({ "accessCode": "geheim" }))
            .await
            .status,
        StatusCode::OK
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn payout_stores_the_totals_and_the_intake_fee(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let vendor = fixtures::user(&db, "Vendor").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "intakeFee": 0.5 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, vendor, "seller").await;
    let sold = fixtures::product(&db, vendor, "Ski", 100.0).await;
    fixtures::event_product(&db, event, sold, "sold").await;
    fixtures::purchase(&db, event, sold, vendor, (100.0, 10.0, 90.0)).await;
    let unsold = fixtures::product(&db, vendor, "Helm", 20.0).await;
    let unsold_relation = fixtures::event_product(&db, event, unsold, "available").await;

    let as_organizer = fixtures::session(&db, organizer).await;
    let args = json!({ "eventId": event, "vendorUserId": vendor });
    let as_vendor = fixtures::session(&db, vendor).await;
    assert_eq!(
        app.mutation(
            "eventSeller.markVendorPayoutReceived",
            args.clone(),
            Some(&as_vendor)
        )
        .await
        .body["code"],
        "seller.payoutStaffOnly"
    );
    let not_seller = json!({ "eventId": event, "vendorUserId": organizer });
    assert_eq!(
        app.mutation(
            "eventSeller.markVendorPayoutReceived",
            not_seller,
            Some(&as_organizer)
        )
        .await
        .body["code"],
        "seller.notSeller"
    );

    // Settling returns the unsold item and pays out 90 € − 2 × 0.50 €
    let settled = app
        .mutation(
            "eventSeller.settleVendor",
            args.clone(),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(settled.body["value"], json!({ "returned": 1 }));
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM event_products WHERE id = $1")
            .bind(unsold_relation)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(status, "returned");
    assert_eq!(
        seller_row(&db, event, vendor).await,
        Some((Some(1), true, 10.0, 89.0, Some(1.0), Some(2)))
    );

    // A later change of the fee does not alter the settlement
    sqlx::query("UPDATE events SET features = '{\"intakeFee\": 5}' WHERE id = $1")
        .bind(event)
        .execute(&db)
        .await
        .unwrap();
    app.mutation(
        "eventSeller.markVendorPayoutReceived",
        args.clone(),
        Some(&as_organizer),
    )
    .await;
    assert_eq!(seller_row(&db, event, vendor).await.unwrap().3, 89.0);
    let vendors = app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(
        vendors.body["value"][0]["intakeFee"],
        json!({ "perItem": 0.5, "items": 2, "total": 1.0 })
    );

    // Taking it back clears the settlement
    assert_eq!(
        app.mutation(
            "eventSeller.unmarkVendorPayoutReceived",
            args.clone(),
            Some(&as_vendor)
        )
        .await
        .body["code"],
        "seller.undoPayoutStaffOnly"
    );
    app.mutation(
        "eventSeller.unmarkVendorPayoutReceived",
        args,
        Some(&as_organizer),
    )
    .await;
    assert_eq!(
        seller_row(&db, event, vendor).await,
        Some((Some(1), false, 0.0, 0.0, None, None))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn settling_closes_the_open_offers_of_returned_items(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let vendor = fixtures::user(&db, "Vendor").await;
    let buyer = fixtures::user(&db, "Buyer").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    fixtures::role(&db, event, vendor, "seller").await;
    let product = fixtures::product(&db, vendor, "Ski", 100.0).await;
    let relation = fixtures::event_product(&db, event, product, "available").await;
    sqlx::query(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status)
         VALUES ($1, $2, $3, $4, 80, 'pending')",
    )
    .bind(event)
    .bind(product)
    .bind(relation)
    .bind(buyer)
    .execute(&db)
    .await
    .unwrap();
    let args = json!({ "eventId": event, "vendorUserId": vendor });
    app.mutation(
        "eventSeller.settleVendor",
        args,
        Some(&fixtures::session(&db, organizer).await),
    )
    .await;
    let offer: (String, Option<String>, Option<String>) = sqlx::query_as(
        "SELECT status::text, closed_by::text, closed_from_status::text FROM product_offers",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(
        offer,
        (
            "rejected".into(),
            Some("return".into()),
            Some("pending".into())
        )
    );
    app.run_jobs().await;
    let sent = app.sent.lock().unwrap();
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].to, "buyer@test.example");
    assert!(sent[0].html.contains("80,00 €"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sellers_from_before_numbers_get_theirs_in_order(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let first = fixtures::user(&db, "First").await;
    let second = fixtures::user(&db, "Second").await;
    fixtures::role(&db, event, first, "seller").await;
    fixtures::role(&db, event, second, "seller").await;
    // The first one has a row without number, the second none at all
    sqlx::query(
        "INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount, payout_received)
         VALUES ($1, $2, 0, 0, 0, false)",
    )
    .bind(event)
    .bind(first)
    .execute(&db)
    .await
    .unwrap();
    let session = fixtures::session(&db, organizer).await;
    let assigned = app
        .mutation(
            "sellerNumbers.assignMissingSellerNumbers",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    assert_eq!(assigned.body["value"], 2);
    assert_eq!(seller_row(&db, event, first).await.unwrap().0, Some(1));
    assert_eq!(seller_row(&db, event, second).await.unwrap().0, Some(2));
    let again = app
        .mutation(
            "sellerNumbers.assignMissingSellerNumbers",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    assert_eq!(again.body["value"], 0);
    let stranger = fixtures::session(&db, first).await;
    assert_eq!(
        app.mutation(
            "sellerNumbers.assignMissingSellerNumbers",
            json!({ "eventId": event }),
            Some(&stranger)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn parallel_joins_get_distinct_numbers(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let mut sessions = Vec::new();
    for i in 0..6 {
        sessions.push(fixtures::session(&db, fixtures::user(&db, &format!("S{i}")).await).await);
    }
    let joins = sessions.iter().map(|session| {
        app.mutation(
            "eventSeller.joinEvent",
            json!({ "eventId": event }),
            Some(session),
        )
    });
    for reply in futures::future::join_all(joins).await {
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    }
    let numbers: Vec<i32> =
        sqlx::query_scalar("SELECT number FROM event_sellers WHERE event_id = $1 ORDER BY number")
            .bind(event)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(numbers, vec![1, 2, 3, 4, 5, 6]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn location_categories(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let session = fixtures::session(&db, organizer).await;
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;

    let created = app
        .mutation(
            "eventLocationCategories.createCategory",
            json!({ "eventId": event, "label": "  Halle A " }),
            Some(&session),
        )
        .await;
    let id = created.body["value"].clone();
    let empty = app
        .mutation(
            "eventLocationCategories.createCategory",
            json!({ "eventId": event, "label": "  " }),
            Some(&session),
        )
        .await;
    assert_eq!(empty.body["code"], "event.labelEmpty");
    assert_eq!(
        app.mutation(
            "eventLocationCategories.createCategory",
            json!({ "eventId": event, "label": "X" }),
            Some(&stranger)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.query(
            "eventLocationCategories.listForEvent",
            json!({ "eventId": event }),
            None
        )
        .await
        .body["code"],
        "auth.required"
    );

    let list = app
        .query(
            "eventLocationCategories.listForEvent",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    assert_eq!(list.body["value"][0]["label"], "Halle A");
    assert_eq!(list.body["value"][0]["eventId"], json!(event));

    assert_eq!(
        app.mutation(
            "eventLocationCategories.updateCategoryLabel",
            json!({ "categoryId": id, "label": "Neu" }),
            Some(&stranger)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.mutation(
            "eventLocationCategories.updateCategoryLabel",
            json!({ "categoryId": id, "label": "" }),
            Some(&session)
        )
        .await
        .body["code"],
        "event.labelEmpty"
    );
    app.mutation(
        "eventLocationCategories.updateCategoryLabel",
        json!({ "categoryId": id, "label": "Halle B" }),
        Some(&session),
    )
    .await;

    let product = fixtures::product(&db, organizer, "Ski", 10.0).await;
    let relation = fixtures::event_product(&db, event, product, "available").await;
    sqlx::query("UPDATE event_products SET location_category_id = $2 WHERE id = $1")
        .bind(relation)
        .bind(uuid::Uuid::parse_str(id.as_str().unwrap()).unwrap())
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(
        app.mutation(
            "eventLocationCategories.deleteCategory",
            json!({ "categoryId": id }),
            Some(&stranger)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    app.mutation(
        "eventLocationCategories.deleteCategory",
        json!({ "categoryId": id }),
        Some(&session),
    )
    .await;
    let location: Option<Uuid> =
        sqlx::query_scalar("SELECT location_category_id FROM event_products WHERE id = $1")
            .bind(relation)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(location, None);
    assert_eq!(
        app.mutation(
            "eventLocationCategories.deleteCategory",
            json!({ "categoryId": id }),
            Some(&session)
        )
        .await
        .body["code"],
        "notFound.category"
    );
}
