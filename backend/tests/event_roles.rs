//! Roles in events.

mod common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn is_organizer_of_any_product_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let vendor = fixtures::user(&db, "Vendor").await;
    let admin = fixtures::admin(&db, "Admin").await;
    let older = fixtures::event(
        &db,
        EventSpec {
            start_hours: -100,
            end_hours: -90,
            ..EventSpec::new("Alt", organizer)
        },
    )
    .await;
    let newer = fixtures::event(&db, EventSpec::new("Neu", vendor)).await;
    let product = fixtures::product(&db, vendor, "Ski", 50.0).await;
    fixtures::event_product(&db, older, product, "available").await;
    fixtures::event_product(&db, newer, product, "available").await;

    let ask = |user: Option<uuid::Uuid>| {
        let app = &app;
        async move {
            let mut args = json!({ "productId": product });
            if let Some(user) = user {
                args["userId"] = json!(user);
            }
            app.query("eventRoles.isOrganizerOfAnyProductEvent", args, None)
                .await
                .body["value"]
                .clone()
        }
    };
    assert_eq!(ask(Some(organizer)).await, json!(older));
    assert_eq!(ask(None).await, Value::Null);
    assert_eq!(
        ask(Some(fixtures::user(&db, "Fremd").await)).await,
        Value::Null
    );
    // Administrators act as organizer of the item's latest event
    assert_eq!(ask(Some(admin)).await, json!(newer));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn vendors_with_their_sales_and_payout(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let vendor = fixtures::user(&db, "Vendor 1").await;
    let helper = fixtures::user(&db, "Helfer").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "intakeFee": 0.5 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, vendor, "seller").await;
    fixtures::role(&db, event, helper, "seller").await;
    fixtures::role(&db, event, helper, "coorganizer").await;
    let sold = fixtures::product(&db, vendor, "Verkauft", 100.0).await;
    fixtures::event_product(&db, event, sold, "sold").await;
    let returned = fixtures::product(&db, vendor, "Zurück", 20.0).await;
    fixtures::event_product(&db, event, returned, "returned").await;
    let announced = fixtures::product(&db, vendor, "Angemeldet", 5.0).await;
    fixtures::event_product(&db, event, announced, "announced").await;
    let purchase = fixtures::purchase(&db, event, sold, vendor, (80.0, 8.0, 72.0)).await;
    sqlx::query("UPDATE purchases SET discount_percent = 20 WHERE id = $1")
        .bind(purchase)
        .execute(&db)
        .await
        .unwrap();
    fixtures::event_seller(&db, event, vendor, 7, false).await;

    let session = fixtures::session(&db, organizer).await;
    let reply = app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    let vendors = reply.body["value"].as_array().unwrap().clone();
    assert_eq!(vendors.len(), 2);
    let erika = vendors.iter().find(|v| v["_id"] == json!(vendor)).unwrap();
    assert_eq!(erika["name"], "Vendor 1");
    assert_eq!(erika["totalRevenue"], 80.0);
    assert_eq!(erika["commission"], 8.0);
    assert_eq!(erika["grossRevenue"], 100.0);
    assert_eq!(erika["totalDiscount"], 20.0);
    // Two accepted items (sold, returned) at 0.50 €
    assert_eq!(
        erika["intakeFee"],
        json!({ "perItem": 0.5, "items": 2, "total": 1.0 })
    );
    assert_eq!(erika["payout"], 71.0);
    assert_eq!(erika["paid"], false);
    assert_eq!(erika["sellerNumber"], 7);
    assert_eq!(erika["isHelper"], false);
    // No secrets in the user documents
    assert!(erika.get("checkInToken").is_none() && erika.get("verificationToken").is_none());
    let helper = vendors.iter().find(|v| v["_id"] == json!(helper)).unwrap();
    assert_eq!(
        (
            helper["isHelper"].clone(),
            helper.get("sellerNumber").cloned()
        ),
        (json!(true), None)
    );
    assert!(
        reply.body["topics"]
            .as_array()
            .unwrap()
            .contains(&json!(format!("event:{event}")))
    );

    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    let forbidden = app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            Some(&stranger),
        )
        .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
    let anonymous = app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            None,
        )
        .await;
    assert_eq!(anonymous.body["code"], "auth.required");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_paid_out_seller_keeps_the_stored_intake_fee(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let vendor = fixtures::user(&db, "Vendor").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "intakeFee": 1 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, vendor, "seller").await;
    let seller = fixtures::event_seller(&db, event, vendor, 1, true).await;
    // Paid out with 3 items at 0.50 € before the fee changed
    sqlx::query("UPDATE event_sellers SET intake_fee = 1.5, intake_fee_items = 3 WHERE id = $1")
        .bind(seller)
        .execute(&db)
        .await
        .unwrap();
    let session = fixtures::session(&db, organizer).await;
    let vendors = app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            Some(&session),
        )
        .await;
    let vendor = &vendors.body["value"][0];
    assert_eq!(vendor["paid"], true);
    assert_eq!(
        vendor["intakeFee"],
        json!({ "perItem": 0.5, "items": 3, "total": 1.5 })
    );
    assert_eq!(vendor["payout"], -1.5);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn is_seller(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let seller = fixtures::user(&db, "Seller").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    fixtures::role(&db, event, seller, "seller").await;
    let ask = |user: uuid::Uuid| {
        let app = &app;
        async move {
            app.query("eventRoles.isSeller", json!({ "userId": user }), None)
                .await
                .body["value"]
                .clone()
        }
    };
    assert_eq!(ask(seller).await, true);
    assert_eq!(ask(organizer).await, false);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn helpers_are_added_and_removed_by_the_organizer(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let seller = fixtures::user(&db, "Seller").await;
    let other = fixtures::user(&db, "Other").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    fixtures::role(&db, event, seller, "seller").await;
    let as_organizer = fixtures::session(&db, organizer).await;
    let as_other = fixtures::session(&db, other).await;

    let call = |name: &'static str, user: uuid::Uuid, session: String| {
        let app = &app;
        async move {
            app.mutation(
                name,
                json!({ "eventId": event, "userId": user }),
                Some(&session),
            )
            .await
            .body
        }
    };
    assert_eq!(
        call(
            "eventRoles.addCoOrganizerForEvent",
            seller,
            as_other.clone()
        )
        .await["code"],
        "auth.forbidden"
    );
    assert_eq!(
        call(
            "eventRoles.addCoOrganizerForEvent",
            organizer,
            as_organizer.clone()
        )
        .await["code"],
        "seller.organizerHasAll"
    );
    assert_eq!(
        call(
            "eventRoles.removeCoOrganizerForEvent",
            organizer,
            as_organizer.clone()
        )
        .await["code"],
        "seller.organizerRoleFixed"
    );
    assert_eq!(
        call(
            "eventRoles.addCoOrganizerForEvent",
            other,
            as_organizer.clone()
        )
        .await["code"],
        "seller.notParticipant"
    );

    assert_eq!(
        call(
            "eventRoles.addCoOrganizerForEvent",
            seller,
            as_organizer.clone()
        )
        .await["value"],
        json!({ "success": true })
    );
    // Adding twice keeps one role
    call(
        "eventRoles.addCoOrganizerForEvent",
        seller,
        as_organizer.clone(),
    )
    .await;
    let helpers = app
        .query(
            "eventRoles.getCoOrganizerIdsForEvent",
            json!({ "eventId": event }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(helpers.body["value"], json!([seller]));
    // The helper may see the team, others not
    let as_seller = fixtures::session(&db, seller).await;
    assert_eq!(
        app.query(
            "eventRoles.getCoOrganizerIdsForEvent",
            json!({ "eventId": event }),
            Some(&as_seller)
        )
        .await
        .status,
        StatusCode::OK
    );
    assert_eq!(
        app.query(
            "eventRoles.getCoOrganizerIdsForEvent",
            json!({ "eventId": event }),
            Some(&as_other)
        )
        .await
        .status,
        StatusCode::FORBIDDEN
    );

    call(
        "eventRoles.removeCoOrganizerForEvent",
        seller,
        as_organizer.clone(),
    )
    .await;
    let helpers = app
        .query(
            "eventRoles.getCoOrganizerIdsForEvent",
            json!({ "eventId": event }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(helpers.body["value"], json!([]));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn my_roles_by_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Organizer").await;
    let user = fixtures::user(&db, "User").await;
    let a = fixtures::event(&db, EventSpec::new("A", organizer)).await;
    let b = fixtures::event(&db, EventSpec::new("B", organizer)).await;
    let c = fixtures::event(&db, EventSpec::new("C", organizer)).await;
    fixtures::role(&db, a, user, "seller").await;
    fixtures::role(&db, a, user, "coorganizer").await;
    fixtures::role(&db, b, user, "seller").await;
    let session = fixtures::session(&db, user).await;

    let roles = app
        .query(
            "eventRoles.getMyRolesForEvent",
            json!({ "eventId": a }),
            Some(&session),
        )
        .await;
    assert_eq!(roles.body["value"], json!(["seller", "coorganizer"]));
    let anonymous = app
        .query(
            "eventRoles.getMyRolesForEvent",
            json!({ "eventId": a }),
            None,
        )
        .await;
    assert_eq!(anonymous.body["value"], json!([]));
    let all = app
        .query(
            "eventRoles.getMyRolesForEvents",
            json!({ "eventIds": [a, b, c] }),
            Some(&session),
        )
        .await;
    assert_eq!(
        all.body["value"],
        json!([
            { "eventId": a, "roles": ["seller", "coorganizer"] },
            { "eventId": b, "roles": ["seller"] },
        ])
    );

    let admin = fixtures::session(&db, fixtures::admin(&db, "Admin").await).await;
    let roles = app
        .query(
            "eventRoles.getMyRolesForEvent",
            json!({ "eventId": c }),
            Some(&admin),
        )
        .await;
    assert_eq!(roles.body["value"], json!(["organizer"]));
}
