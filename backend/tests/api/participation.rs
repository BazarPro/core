//! Organizers control who and what takes part (#252): registration closed or within a
//! window, sellers excluded from the bazaar, items rejected.

use crate::common;

use axum::http::StatusCode;
use common::fixtures::{self, EventSpec};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const HOUR_MS: i64 = 3_600_000;

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

/// An upcoming bazaar with organizer, a seller and a helper.
struct Bazaar {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    organizer: Uuid,
    seller: Uuid,
    helper: Uuid,
    as_organizer: String,
    as_seller: String,
    as_helper: String,
}

impl Bazaar {
    async fn new(db: PgPool, features: Value) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let seller = fixtures::user(&db, "Sina").await;
        let helper = fixtures::user(&db, "Helfer").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                features,
                ..EventSpec::new("Kinderbasar", organizer)
            },
        )
        .await;
        for user in [seller, helper] {
            fixtures::role(&db, event, user, "seller").await;
            fixtures::event_seller(&db, event, user, if user == seller { 1 } else { 2 }, false)
                .await;
        }
        fixtures::role(&db, event, helper, "coorganizer").await;
        Self {
            as_organizer: fixtures::session(&db, organizer).await,
            as_seller: fixtures::session(&db, seller).await,
            as_helper: fixtures::session(&db, helper).await,
            app,
            db,
            event,
            organizer,
            seller,
            helper,
        }
    }

    async fn join(&self, user: Uuid, args: Value) -> Reply {
        let mut args = args;
        args["eventId"] = json!(self.event);
        self.app
            .mutation(
                "eventSeller.joinEvent",
                args,
                Some(&fixtures::session(&self.db, user).await),
            )
            .await
    }

    async fn set_features(&self, features: Value) {
        sqlx::query("UPDATE events SET features = $2 WHERE id = $1")
            .bind(self.event)
            .bind(features)
            .execute(&self.db)
            .await
            .unwrap();
    }

    async fn roles(&self, user: Uuid) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT role::text FROM event_roles WHERE event_id = $1 AND user_id = $2 ORDER BY role",
        )
        .bind(self.event)
        .bind(user)
        .fetch_all(&self.db)
        .await
        .unwrap()
    }

    async fn exclude(&self, user: Uuid, reason: Option<&str>, session: &str) -> Reply {
        self.app
            .mutation(
                "eventExclusions.exclude",
                json!({ "eventId": self.event, "userId": user, "reason": reason }),
                Some(session),
            )
            .await
    }

    async fn item(&self, title: &str, status: &str) -> (Uuid, Uuid) {
        let product = fixtures::product(&self.db, self.seller, title, 10.0).await;
        let relation = fixtures::event_product(&self.db, self.event, product, status).await;
        (product, relation)
    }

    async fn status(&self, relation: Uuid) -> String {
        sqlx::query_scalar("SELECT status::text FROM event_products WHERE id = $1")
            .bind(relation)
            .fetch_one(&self.db)
            .await
            .unwrap()
    }

    async fn reject(&self, relation: Uuid, reason: Option<&str>, session: &str) -> Reply {
        self.app
            .mutation(
                "eventProducts.rejectProduct",
                json!({ "eventProductId": relation, "reason": reason }),
                Some(session),
            )
            .await
    }

    async fn mails(&self) -> Vec<(String, String, String)> {
        self.app.run_jobs().await;
        self.app
            .sent
            .lock()
            .unwrap()
            .iter()
            .map(|mail| (mail.to.clone(), mail.subject.clone(), mail.html.clone()))
            .collect()
    }
}

// Registration --------------------------------------------------------------------------

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn closed_registration_lets_only_invited_people_in(db: PgPool) {
    let b = Bazaar::new(db, json!({ "registrationOpen": false })).await;
    let newcomer = fixtures::user(&b.db, "Neu").await;
    assert_eq!(
        b.join(newcomer, json!({})).await.body["code"],
        "join.closed"
    );
    // Who sells there already may call it again
    assert_eq!(b.join(b.seller, json!({})).await.status, StatusCode::OK);

    // An invitation still works, so the organizer can take latecomers in
    let reply = b
        .app
        .mutation(
            "eventInvitations.send",
            json!({ "eventId": b.event, "email": "neu@test.example", "helper": false }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let mails = b.mails().await;
    let html = &mails.last().unwrap().2;
    let start = html.find("/invite/").unwrap() + 8;
    let token = &html[start..start + html[start..].find('"').unwrap()];
    let reply = b.join(newcomer, json!({ "invitation": token })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(b.roles(newcomer).await, ["seller"]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn registration_opens_and_closes_with_its_window(db: PgPool) {
    let b = Bazaar::new(db, json!({ "registrationStartsAt": now_ms() + HOUR_MS })).await;
    let newcomer = fixtures::user(&b.db, "Neu").await;
    assert_eq!(
        b.join(newcomer, json!({})).await.body["code"],
        "join.notYet"
    );

    b.set_features(json!({ "registrationEndsAt": now_ms() - HOUR_MS }))
        .await;
    assert_eq!(
        b.join(newcomer, json!({})).await.body["code"],
        "join.closed"
    );

    b.set_features(json!({
        "registrationStartsAt": now_ms() - HOUR_MS,
        "registrationEndsAt": now_ms() + HOUR_MS
    }))
    .await;
    let reply = b.join(newcomer, json!({})).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_sets_the_registration_in_the_settings(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let event = b
        .app
        .query(
            "events.getEvent",
            json!({ "id": b.event }),
            Some(&b.as_organizer),
        )
        .await
        .body["value"]
        .clone();
    let edit = |features: Value| {
        json!({
            "id": b.event,
            "title": event["title"],
            "description": event["description"],
            "location": event["location"],
            "startDate": event["startDate"],
            "endDate": event["endDate"],
            "categories": [],
            "contactInfo": event["contactInfo"],
            "commission": event["commission"],
            "services": [],
            "visibility": event["visibility"],
            "features": features,
        })
    };
    let features = || async {
        sqlx::query_scalar::<_, Value>("SELECT features FROM events WHERE id = $1")
            .bind(b.event)
            .fetch_one(&b.db)
            .await
            .unwrap()
    };
    let (start, end) = (now_ms() + HOUR_MS, now_ms() + 2 * HOUR_MS);

    let reply = b
        .app
        .mutation(
            "events.editEvent",
            edit(json!({ "registrationOpen": true, "registrationStartsAt": end, "registrationEndsAt": start })),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(reply.body["code"], "event.registrationWindow");

    let reply = b
        .app
        .mutation(
            "events.editEvent",
            edit(json!({ "registrationOpen": true, "registrationStartsAt": start, "registrationEndsAt": end })),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let stored = features().await;
    assert_eq!(stored["registrationOpen"], json!(true));
    // Times in `features` are kept as numbers of milliseconds, like the discount start
    assert_eq!(stored["registrationStartsAt"].as_f64(), Some(start as f64));

    // An older app does not send the window: it stays
    b.app
        .mutation("events.editEvent", edit(json!({})), Some(&b.as_organizer))
        .await;
    assert_eq!(
        features().await["registrationEndsAt"].as_f64(),
        Some(end as f64)
    );

    // A new app sends the whole choice: without times the window is gone
    b.app
        .mutation(
            "events.editEvent",
            edit(json!({ "registrationOpen": true })),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(features().await.get("registrationEndsAt"), None);
    b.app
        .mutation(
            "events.editEvent",
            edit(json!({ "registrationOpen": true, "registrationStartsAt": start })),
            Some(&b.as_organizer),
        )
        .await;

    // Closed: the window goes with it
    b.app
        .mutation(
            "events.editEvent",
            edit(json!({ "registrationOpen": false })),
            Some(&b.as_organizer),
        )
        .await;
    let stored = features().await;
    assert_eq!(stored["registrationOpen"], json!(false));
    assert_eq!(stored.get("registrationStartsAt"), None);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn opening_and_closing_registration_reaches_open_pages(db: PgPool) {
    let b = Bazaar::new(db, json!({ "registrationEndsAt": now_ms() - 30_000 })).await;
    let mut conn = b.db.acquire().await.unwrap();
    let now = chrono::Utc::now();
    let crossing = bazarpro_backend::modules::events::events_crossing_time_boundaries(
        &mut conn,
        now - chrono::Duration::minutes(2),
        now,
    )
    .await
    .unwrap();
    assert_eq!(crossing, [b.event]);
}

// Exclusion -----------------------------------------------------------------------------

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_excluded_seller_leaves_with_announced_items_only(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let (_, announced) = b.item("Jacke", "announced").await;
    let (_, handed_in) = b.item("Stiefel", "available").await;

    let reply = b
        .exclude(
            b.seller,
            Some("  Beim letzten Mal nichts abgeholt  "),
            &b.as_organizer,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert!(b.roles(b.seller).await.is_empty());
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM event_products WHERE id = $1")
        .bind(announced)
        .fetch_one(&b.db)
        .await
        .unwrap();
    assert_eq!(left, 0);
    // Handed in: goes back in the normal return
    assert_eq!(b.status(handed_in).await, "available");

    // The team still finds them, with number and reason
    let vendors = b
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": b.event }),
            Some(&b.as_helper),
        )
        .await
        .body["value"]
        .clone();
    let vendor = vendors
        .as_array()
        .unwrap()
        .iter()
        .find(|v| v["_id"] == json!(b.seller))
        .unwrap();
    assert_eq!(vendor["sellerNumber"], 1);
    assert_eq!(
        vendor["excluded"]["reason"],
        "Beim letzten Mal nichts abgeholt"
    );

    // The seller sees it on the bazaar's page and got a mail
    let mine = b
        .app
        .query(
            "eventExclusions.getMine",
            json!({ "eventId": b.event }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(
        mine.body["value"]["reason"],
        "Beim letzten Mal nichts abgeholt"
    );
    let mails = b.mails().await;
    let (to, subject, html) = mails.last().unwrap();
    assert_eq!(to, "sina@test.example");
    assert!(subject.contains("Kinderbasar"), "{subject}");
    assert!(html.contains("Beim letzten Mal nichts abgeholt"), "{html}");
    assert!(
        html.contains("Rückgabe"),
        "handed-in items are mentioned: {html}"
    );

    // Excluding twice changes nothing and sends no second mail
    b.exclude(b.seller, None, &b.as_organizer).await;
    assert_eq!(b.mails().await.len(), mails.len());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn excluded_sellers_cannot_join_again_nor_announce(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    sqlx::query("UPDATE events SET access_code = 'GEHEIM' WHERE id = $1")
        .bind(b.event)
        .execute(&b.db)
        .await
        .unwrap();
    b.exclude(b.seller, None, &b.as_organizer).await;

    let reply = b.join(b.seller, json!({ "accessCode": "GEHEIM" })).await;
    assert_eq!(reply.body["code"], "join.excluded");
    let product = fixtures::product(&b.db, b.seller, "Hose", 5.0).await;
    let reply = b
        .app
        .mutation(
            "eventProducts.addProductToEvent",
            json!({ "eventId": b.event, "productId": product }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(reply.body["code"], "join.excluded");

    // Not with an invitation either
    b.app
        .mutation(
            "eventInvitations.send",
            json!({ "eventId": b.event, "email": "sina@test.example", "helper": false }),
            Some(&b.as_organizer),
        )
        .await;
    let mails = b.mails().await;
    let html = &mails.last().unwrap().2;
    let start = html.find("/invite/").unwrap() + 8;
    let token = &html[start..start + html[start..].find('"').unwrap()];
    let reply = b.join(b.seller, json!({ "invitation": token })).await;
    assert_eq!(reply.body["code"], "join.excluded");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_takes_an_exclusion_back(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    b.exclude(b.seller, None, &b.as_organizer).await;
    let reply = b
        .app
        .mutation(
            "eventExclusions.readmit",
            json!({ "eventId": b.event, "userId": b.seller }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // A seller again, with the same number
    assert_eq!(b.roles(b.seller).await, ["seller"]);
    assert_eq!(
        b.app
            .query(
                "sellerNumbers.getMySellerNumber",
                json!({ "eventId": b.event }),
                Some(&b.as_seller)
            )
            .await
            .body["value"],
        1
    );
    let mine = b
        .app
        .query(
            "eventExclusions.getMine",
            json!({ "eventId": b.event }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(mine.body["value"], Value::Null);
    let (_, subject, _) = b.mails().await.pop().unwrap();
    assert!(subject.contains("wieder"), "{subject}");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_the_organizer_excludes_and_only_sellers_with_an_account(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let stranger = fixtures::user(&b.db, "Fremd").await;
    let as_stranger = fixtures::session(&b.db, stranger).await;
    // Helpers reject items, but do not exclude people
    assert_eq!(
        b.exclude(b.seller, None, &b.as_helper).await.body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        b.exclude(b.seller, None, &as_stranger).await.body["code"],
        "auth.forbidden"
    );
    let readmit = b
        .app
        .mutation(
            "eventExclusions.readmit",
            json!({ "eventId": b.event, "userId": b.seller }),
            Some(&b.as_helper),
        )
        .await;
    assert_eq!(readmit.body["code"], "auth.forbidden");
    assert_eq!(
        b.exclude(b.organizer, None, &b.as_organizer).await.body["code"],
        "exclusion.organizer"
    );
    assert_eq!(
        b.exclude(stranger, None, &b.as_organizer).await.body["code"],
        "seller.notParticipant"
    );
    let walk_in = fixtures::user(&b.db, "Vor Ort").await;
    sqlx::query("UPDATE users SET managed_by_event_id = $2 WHERE id = $1")
        .bind(walk_in)
        .bind(b.event)
        .execute(&b.db)
        .await
        .unwrap();
    fixtures::role(&b.db, b.event, walk_in, "seller").await;
    assert_eq!(
        b.exclude(walk_in, None, &b.as_organizer).await.body["code"],
        "exclusion.walkIn"
    );
    assert_eq!(
        b.exclude(b.seller, Some(&"x".repeat(501)), &b.as_organizer)
            .await
            .body["code"],
        "exclusion.reasonTooLong"
    );
    assert_eq!(b.roles(b.seller).await, ["seller"]);

    // Excluding a helper takes the helper role too
    let reply = b.exclude(b.helper, None, &b.as_organizer).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert!(b.roles(b.helper).await.is_empty());
}

// Rejection -----------------------------------------------------------------------------

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_rejected_item_is_neither_listed_nor_sold(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let (product, relation) = b.item("Kaputter Roller", "announced").await;
    let (_, other) = b.item("Puppe", "announced").await;

    let reply = b.reject(relation, Some("Defekt"), &b.as_helper).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(b.status(relation).await, "rejected");

    // Visitors do not see it, nor its page
    let listed = b
        .app
        .query(
            "eventProducts.getProductsForEvent",
            json!({ "eventId": b.event }),
            None,
        )
        .await
        .body["value"]
        .clone();
    let ids: Vec<&Value> = listed
        .as_array()
        .unwrap()
        .iter()
        .map(|item| &item["eventProductId"])
        .collect();
    assert_eq!(ids, [&json!(other)]);
    let page = b
        .app
        .query("products.getProduct", json!({ "productId": product }), None)
        .await;
    assert_eq!(page.body["value"], Value::Null);

    // The intake cannot take it in, so the cash desk never sells it
    let intake = b
        .app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "available" }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(intake.body["code"], "product.rejected");
    let accepted = b
        .app
        .mutation(
            "eventProducts.markAllVendorProductsAvailable",
            json!({ "eventId": b.event, "vendorId": b.seller }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(accepted.body["value"]["updatedCount"], 1);
    assert_eq!(b.status(relation).await, "rejected");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_seller_sees_the_rejection_and_cannot_announce_it_again(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let (product, relation) = b.item("Roller", "announced").await;
    b.reject(relation, Some("Passt nicht zum Basar"), &b.as_organizer)
        .await;

    let statuses = b
        .app
        .query(
            "eventProducts.getMyEventProductStatuses",
            json!({ "eventId": b.event }),
            Some(&b.as_seller),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(statuses[0]["status"], "rejected");
    assert_eq!(statuses[0]["rejectionReason"], "Passt nicht zum Basar");
    let mine = b
        .app
        .query("products.getMyProducts", json!({}), Some(&b.as_seller))
        .await
        .body["value"]
        .clone();
    assert_eq!(
        mine[0]["rejections"],
        json!([{ "eventId": b.event, "eventTitle": "Kinderbasar", "reason": "Passt nicht zum Basar" }])
    );

    // Announcing again returns the rejected entry; removing it is refused
    let again = b
        .app
        .mutation(
            "eventProducts.addProductToEvent",
            json!({ "eventId": b.event, "productId": product }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(again.body["value"], json!(relation));
    assert_eq!(b.status(relation).await, "rejected");
    let removed = b
        .app
        .mutation(
            "eventProducts.removeProductFromEvent",
            json!({ "eventId": b.event, "productId": product }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(removed.body["code"], "product.rejectedNoRemove");
    b.app
        .mutation(
            "eventProducts.setProductEvents",
            json!({ "productId": product, "eventIds": [] }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(b.status(relation).await, "rejected");

    let (to, subject, html) = b.mails().await.pop().unwrap();
    assert_eq!(to, "sina@test.example");
    assert!(subject.contains("Roller"), "{subject}");
    assert!(html.contains("Passt nicht zum Basar"), "{html}");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn rejecting_needs_the_intake_right_and_an_announced_item(db: PgPool) {
    let b = Bazaar::new(db, json!({})).await;
    let (_, relation) = b.item("Ball", "announced").await;
    let (_, handed_in) = b.item("Rad", "available").await;
    let stranger = fixtures::session(&b.db, fixtures::user(&b.db, "Fremd").await).await;

    assert_eq!(
        b.reject(relation, None, &stranger).await.body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        b.reject(relation, None, &b.as_seller).await.body["code"],
        "auth.forbidden"
    );
    b.app
        .mutation(
            "eventRoles.setHelperPermissions",
            json!({ "eventId": b.event, "userId": b.helper, "permissions": ["sale"] }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(
        b.reject(relation, None, &b.as_helper).await.body["code"],
        "helper.intake"
    );
    assert_eq!(
        b.reject(handed_in, None, &b.as_organizer).await.body["code"],
        "rejection.onlyAnnounced"
    );
    assert_eq!(b.status(relation).await, "announced");

    // Taken back: announced again, as before
    b.reject(relation, None, &b.as_organizer).await;
    let undo = b
        .app
        .mutation(
            "eventProducts.undoRejection",
            json!({ "eventProductId": relation }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(undo.status, StatusCode::OK, "{}", undo.body);
    assert_eq!(b.status(relation).await, "announced");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_rejected_item_takes_no_place_in_the_item_limit(db: PgPool) {
    let b = Bazaar::new(
        db,
        json!({ "maxItemsPerSeller": 1, "photosOptional": true }),
    )
    .await;
    let (_, relation) = b.item("Ball", "announced").await;
    b.reject(relation, None, &b.as_organizer).await;
    let product = fixtures::product(&b.db, b.seller, "Kreisel", 3.0).await;
    let reply = b
        .app
        .mutation(
            "eventProducts.addProductToEvent",
            json!({ "eventId": b.event, "productId": product }),
            Some(&b.as_seller),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // Taking the rejection back would go beyond the limit
    let undo = b
        .app
        .mutation(
            "eventProducts.undoRejection",
            json!({ "eventProductId": relation }),
            Some(&b.as_organizer),
        )
        .await;
    assert_eq!(undo.body["code"], "seller.itemLimit");
}
