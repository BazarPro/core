//! Texts of the promo page, shared by the organizers of a bazaar.

use crate::common;

use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizers_share_the_texts_others_do_not_see_them(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let co = fixtures::user(&db, "Co").await;
    let seller = fixtures::user(&db, "Sella").await;
    let event = fixtures::event(&db, EventSpec::new("Kinderbasar", organizer)).await;
    fixtures::role(&db, event, co, "coorganizer").await;
    fixtures::role(&db, event, seller, "seller").await;
    let organizer = fixtures::session(&db, organizer).await;
    let co = fixtures::session(&db, co).await;
    let seller = fixtures::session(&db, seller).await;

    let empty = app
        .query(
            "promos.getPromo",
            json!({ "eventId": event }),
            Some(&organizer),
        )
        .await;
    assert_eq!(empty.body["value"], json!(null));

    let promo = json!({ "format": "flyer", "content": { "title": "Großer Kinderbasar" } });
    let saved = app
        .mutation(
            "promos.savePromo",
            json!({ "eventId": event, "promo": promo }),
            Some(&organizer),
        )
        .await;
    assert!(saved.status.is_success(), "{:?}", saved.body);

    let read = app
        .query("promos.getPromo", json!({ "eventId": event }), Some(&co))
        .await;
    assert_eq!(read.body["value"]["promo"], promo);

    for session in [Some(seller.as_str()), None] {
        let denied = app
            .query("promos.getPromo", json!({ "eventId": event }), session)
            .await;
        assert!(denied.status.is_client_error());
        let denied = app
            .mutation(
                "promos.savePromo",
                json!({ "eventId": event, "promo": {} }),
                session,
            )
            .await;
        assert!(denied.status.is_client_error());
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn refuses_huge_or_odd_texts(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Kinderbasar", organizer)).await;
    let organizer = fixtures::session(&db, organizer).await;
    for promo in [json!("text"), json!({ "title": "x".repeat(70_000) })] {
        let reply = app
            .mutation(
                "promos.savePromo",
                json!({ "eventId": event, "promo": promo }),
                Some(&organizer),
            )
            .await;
        assert_eq!(reply.status.as_u16(), 400);
    }
}
