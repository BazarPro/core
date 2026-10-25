//! The event team without internet: replaying intake actions, the ID QR code, the batch
//! of queries for the offline copy.

use crate::common;

use axum::http::StatusCode;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bazarpro_backend::modules::offline::{TOTP_STEP_SECONDS, totp};
use common::desk::Desk;
use common::fixtures;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

fn accept(id: Uuid, relation: Uuid) -> Value {
    json!({
        "id": id,
        "name": "eventProducts.updateProductStatus",
        "args": { "eventProductId": relation, "status": "available" },
        "label": "Ski",
        "doneAt": 1_700_000_000_000_i64,
    })
}

async fn status(db: &PgPool, relation: Uuid) -> String {
    sqlx::query_scalar("SELECT status::text FROM event_products WHERE id = $1")
        .bind(relation)
        .fetch_one(db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offline_intake_is_replayed_once(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "announced").await;
    let action = Uuid::new_v4();
    let replay = |actions: Value| {
        let (app, team, event) = (&desk.app, desk.team.clone(), desk.event);
        async move {
            app.mutation(
                "offline.replay",
                json!({ "eventId": event, "actions": actions }),
                Some(&team),
            )
            .await
        }
    };

    let first = replay(json!([accept(action, relation)])).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    assert_eq!(
        first.body["value"],
        json!([{ "id": action, "doneNow": true }])
    );
    assert_eq!(status(&db, relation).await, "available");

    // Sent again after a lost reply: not done twice
    let again = replay(json!([accept(action, relation)])).await;
    assert_eq!(again.body["value"][0]["doneNow"], false);

    // Only intake actions, and only for the team
    let other = replay(json!([{
        "id": Uuid::new_v4(),
        "name": "purchases.sellProduct",
        "args": { "eventProductId": relation },
        "label": "Ski",
        "doneAt": 1_700_000_000_000_i64,
    }]))
    .await;
    assert_eq!(other.body["value"][0]["error"], "offline.notReplayable");
    assert_eq!(status(&db, relation).await, "available");
    let seller = fixtures::session(&db, desk.seller).await;
    let foreign = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [] }),
            Some(&seller),
        )
        .await;
    assert_eq!(foreign.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_refused_offline_action_is_recorded_and_leaves_nothing(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "announced").await;
    // Accepted offline, but the seller was paid out before the desk came back online
    fixtures::event_seller(&db, desk.event, desk.seller, 1, true).await;
    let note = json!({
        "id": Uuid::new_v4(),
        "name": "eventProducts.setEventProductNote",
        "args": { "eventProductId": relation, "note": "Haken 3" },
        "label": "Ski",
        "doneAt": 1_700_000_000_000_i64,
    });
    let reply = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [accept(Uuid::new_v4(), relation), note] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["error"], "seller.paidOutUndoFirst");
    // The note does not depend on the payout
    assert!(reply.body["value"][1].get("error").is_none());
    assert_eq!(status(&db, relation).await, "announced");

    let failed = desk
        .app
        .query(
            "offline.getFailedActions",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(failed.as_array().unwrap().len(), 1);
    assert_eq!(failed[0]["label"], "Ski");
    assert_eq!(failed[0]["userName"], "Orga");
    assert!(failed[0]["errorMessage"].as_str().unwrap().len() > 5);

    let resolved = desk
        .app
        .mutation(
            "offline.resolveFailedAction",
            json!({ "actionId": failed[0]["_id"] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(resolved.status, StatusCode::OK, "{}", resolved.body);
    let after = desk
        .app
        .query(
            "offline.getFailedActions",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert!(after.body["value"][0]["resolvedAt"].is_number());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_id_qr_code_works_with_a_time_based_code(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let seller = fixtures::session(&db, desk.seller).await;

    // The team's devices get the keys of the event's sellers first
    let keys = desk
        .app
        .mutation(
            "offline.getCheckInSecretsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(keys.status, StatusCode::OK, "{}", keys.body);
    assert_eq!(keys.body["value"][0]["userId"], json!(desk.seller));
    // The phone gets the same key
    let mine = desk
        .app
        .mutation("offline.ensureCheckInSecret", json!({}), Some(&seller))
        .await;
    assert_eq!(mine.body["value"], keys.body["value"][0]);
    let forbidden = desk
        .app
        .mutation(
            "offline.getCheckInSecretsForEvent",
            json!({ "eventId": desk.event }),
            Some(&seller),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");

    let secret = URL_SAFE_NO_PAD
        .decode(mine.body["value"]["secret"].as_str().unwrap())
        .unwrap();
    let step = chrono::Utc::now().timestamp() / TOTP_STEP_SECONDS;
    let lookup = |token: String| {
        let (app, team, event) = (&desk.app, desk.team.clone(), desk.event);
        async move {
            app.query(
                "users.getUserByCheckInToken",
                json!({ "token": token, "eventId": event }),
                Some(&team),
            )
            .await
        }
    };
    let found = lookup(format!("{}.{}", desk.seller, totp(&secret, step as u64))).await;
    assert_eq!(found.body["value"]["_id"], json!(desk.seller));
    // An old code, a wrong code
    let old = lookup(format!(
        "{}.{}",
        desk.seller,
        totp(&secret, (step - 10) as u64)
    ))
    .await;
    assert_eq!(old.body["value"], Value::Null);
    let wrong = lookup(format!("{}.12345678", desk.seller)).await;
    assert_eq!(wrong.body["value"], Value::Null);
    let garbage = lookup("kein-nutzer.123".into()).await;
    assert_eq!(garbage.body["value"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_batch_answers_each_query_like_one_by_one(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (product, _) = desk.item("Ski", 20.0).await;
    let single = desk
        .app
        .query(
            "products.getProduct",
            json!({ "productId": product }),
            Some(&desk.team),
        )
        .await;
    let batch = desk
        .app
        .post(
            "/api/batch-query",
            json!({ "calls": [
                { "name": "products.getProduct", "args": { "productId": product } },
                { "name": "purchases.sellProduct", "args": {} },
                { "name": "gibt.esNicht", "args": {} },
                { "name": "purchases.getCheckoutSnapshot", "args": { "eventId": desk.event } },
            ] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(batch.status, StatusCode::OK, "{}", batch.body);
    let results = &batch.body["results"];
    assert_eq!(results[0], single.body);
    // Mutations and unknown functions are not run
    assert_eq!(results[1], Value::Null);
    assert_eq!(results[2], Value::Null);
    assert!(results[3]["value"]["items"].is_array());

    // Without the right: null, like the error of the single query
    let seller = fixtures::session(&db, desk.seller).await;
    let denied = desk
        .app
        .post(
            "/api/batch-query",
            json!({ "calls": [
                { "name": "purchases.getCheckoutSnapshot", "args": { "eventId": desk.event } },
            ] }),
            Some(&seller),
        )
        .await;
    assert_eq!(denied.body["results"], json!([null]));
}
