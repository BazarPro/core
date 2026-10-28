//! The event team without internet: replaying intake actions, the ID QR code, the batch
//! of queries for the offline copy.

use crate::common;

use axum::http::StatusCode;
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bazarpro_backend::modules::offline::{TOTP_STEP_SECONDS, totp};
use common::desk::Desk;
use common::fixtures::{self, EventSpec};
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
    // The phone gets the same key for this event
    let mine = desk
        .app
        .mutation("offline.ensureCheckInSecret", json!({}), Some(&seller))
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.body);
    assert_eq!(mine.body["value"]["userId"], json!(desk.seller));
    assert_eq!(
        mine.body["value"]["keys"],
        json!([{ "eventId": desk.event, "version": 0, "secret": keys.body["value"][0]["secret"] }])
    );
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
        .decode(mine.body["value"]["keys"][0]["secret"].as_str().unwrap())
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
    // Codes of several bazaars in one QR code: one of them is this event's
    let several = lookup(format!(
        "{}.12345678.{}",
        desk.seller,
        totp(&secret, step as u64)
    ))
    .await;
    assert_eq!(several.body["value"]["_id"], json!(desk.seller));

    // The key of one bazaar makes no valid codes at another of the seller
    let organizer = fixtures::user(&db, "Andere Orga").await;
    let other = fixtures::event(&db, fixtures::EventSpec::new("Anderer Basar", organizer)).await;
    fixtures::role(&db, other, desk.seller, "seller").await;
    let other_team = fixtures::session(&db, organizer).await;
    let elsewhere = desk
        .app
        .query(
            "users.getUserByCheckInToken",
            json!({
                "token": format!("{}.{}", desk.seller, totp(&secret, step as u64)),
                "eventId": other,
            }),
            Some(&other_team),
        )
        .await;
    assert_eq!(elsewhere.status, StatusCode::OK, "{}", elsewhere.body);
    assert_eq!(elsewhere.body["value"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_offline_status_change_is_refused_when_the_item_moved_on(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "sold").await;
    let seen = |id: Uuid, status: &str| {
        let mut action = accept(id, relation);
        action["args"]["fromStatus"] = json!("announced");
        action["args"]["status"] = json!(status);
        action
    };
    // Accepted offline while another device accepted it and the desk sold it
    let reply = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [seen(Uuid::new_v4(), "available")] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["error"], "product.statusChanged");
    assert_eq!(status(&db, relation).await, "sold");

    // Already where the team wanted it: done, not a conflict
    sqlx::query("UPDATE event_products SET status = 'available' WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    let same = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [seen(Uuid::new_v4(), "available")] }),
            Some(&desk.team),
        )
        .await;
    assert!(
        same.body["value"][0].get("error").is_none(),
        "{}",
        same.body
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_offline_note_does_not_overwrite_a_newer_one(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "available").await;
    let note_action = |note: &str, from: &str| {
        json!({
            "id": Uuid::new_v4(),
            "name": "eventProducts.setEventProductNote",
            "args": { "eventProductId": relation, "note": note, "fromNote": from },
            "label": "Ski",
            "doneAt": 1_700_000_000_000_i64,
        })
    };
    let replay = |action: Value| {
        let (app, team, event) = (&desk.app, desk.team.clone(), desk.event);
        async move {
            app.mutation(
                "offline.replay",
                json!({ "eventId": event, "actions": [action] }),
                Some(&team),
            )
            .await
        }
    };
    let note = || async {
        sqlx::query_scalar::<_, Option<String>>(
            "SELECT internal_note FROM event_products WHERE id = $1",
        )
        .bind(relation)
        .fetch_one(&db)
        .await
        .unwrap()
    };

    // Written offline on an item without note: set
    let first = replay(note_action("Haken 3", "")).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    assert!(
        first.body["value"][0].get("error").is_none(),
        "{}",
        first.body
    );
    assert_eq!(note().await.as_deref(), Some("Haken 3"));

    // Meanwhile someone else wrote another one online: the older one is refused
    let stale = replay(note_action("Haken 7", "")).await;
    assert_eq!(stale.body["value"][0]["error"], "product.noteChanged");
    assert_eq!(note().await.as_deref(), Some("Haken 3"));

    // Based on the current one it passes, also removing it
    let removed = replay(note_action("", "Haken 3")).await;
    assert!(
        removed.body["value"][0].get("error").is_none(),
        "{}",
        removed.body
    );
    assert_eq!(note().await, None);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_offline_action_of_another_bazaar_is_refused(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let organizer: Uuid = sqlx::query_scalar("SELECT organizer_id FROM events WHERE id = $1")
        .bind(desk.event)
        .fetch_one(&db)
        .await
        .unwrap();
    // The same team runs a second bazaar
    let other = fixtures::event(&db, EventSpec::new("Zweiter Basar", organizer)).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, other, product, "announced").await;
    let all = json!({
        "id": Uuid::new_v4(),
        "name": "eventProducts.markAllVendorProductsAvailable",
        "args": { "eventId": other, "vendorId": desk.seller },
        "label": "Verkäufer",
        "doneAt": 1_700_000_000_000_i64,
    });

    let reply = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [accept(Uuid::new_v4(), relation), all] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["error"], "offline.wrongEvent");
    assert_eq!(reply.body["value"][1]["error"], "offline.wrongEvent");
    assert_eq!(status(&db, relation).await, "announced");
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

    // Visitors ask one by one
    let visitor = desk
        .app
        .post(
            "/api/batch-query",
            json!({ "calls": [
                { "name": "products.getProduct", "args": { "productId": product } },
            ] }),
            None,
        )
        .await;
    assert_eq!(visitor.status, StatusCode::UNAUTHORIZED);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn what_may_not_be_replayed_is_refused_and_the_rest_runs(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "announced").await;
    let payout = json!({
        "id": Uuid::new_v4(),
        "name": "eventSeller.markVendorPayoutReceived",
        "args": { "eventId": desk.event, "userId": desk.seller },
        "label": "Seller",
        "doneAt": 1_700_000_000_000_i64,
    });
    let accepted = Uuid::new_v4();
    let reply = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [payout, accept(accepted, relation)] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["error"], "offline.notReplayable");
    assert_eq!(
        reply.body["value"][1],
        json!({ "id": accepted, "doneNow": true })
    );
    assert_eq!(status(&db, relation).await, "available");

    // More than one batch of the app at once
    let many: Vec<Value> = (0..101).map(|_| accept(Uuid::new_v4(), relation)).collect();
    let too_many = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": many }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(too_many.status, StatusCode::BAD_REQUEST);
    assert_eq!(too_many.body["code"], "offline.tooMany");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_the_team_replays_and_settles_offline_actions(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 20.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "announced").await;
    let refused = Uuid::new_v4();
    let reply = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [{
                "id": refused,
                "name": "events.deleteEvent",
                "args": { "eventId": desk.event },
                "label": "Basar",
                "doneAt": 1_700_000_000_000_i64,
            }] }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.body["value"][0]["error"], "offline.notReplayable");

    let seller = fixtures::session(&db, desk.seller).await;
    let replay = desk
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": desk.event, "actions": [accept(Uuid::new_v4(), relation)] }),
            Some(&seller),
        )
        .await;
    assert_eq!(replay.body["code"], "auth.forbidden");
    assert_eq!(status(&db, relation).await, "announced");
    let failed = desk
        .app
        .query(
            "offline.getFailedActions",
            json!({ "eventId": desk.event }),
            Some(&seller),
        )
        .await;
    assert_eq!(failed.body["code"], "auth.forbidden");
    let resolve = desk
        .app
        .mutation(
            "offline.resolveFailedAction",
            json!({ "actionId": refused }),
            Some(&seller),
        )
        .await;
    assert_eq!(resolve.body["code"], "auth.forbidden");
    let resolved_at: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT resolved_at FROM offline_actions WHERE id = $1")
            .bind(refused)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(resolved_at, None);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_phone_gets_keys_for_the_next_four_bazaars(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let organizer = fixtures::user(&db, "Andere Orga").await;
    let mut coming = Vec::new();
    for days in [4, 2, 3, 5] {
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: days * 24,
                end_hours: days * 24 + 5,
                ..EventSpec::new("Später", organizer)
            },
        )
        .await;
        fixtures::role(&db, event, desk.seller, "seller").await;
        coming.push((days, event));
    }
    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -30,
            end_hours: -25,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    fixtures::role(&db, past, desk.seller, "seller").await;
    // Only as team, not as seller
    let helping = fixtures::event(&db, EventSpec::new("Als Helfer", organizer)).await;
    fixtures::role(&db, helping, desk.seller, "coorganizer").await;

    let seller = fixtures::session(&db, desk.seller).await;
    let mine = desk
        .app
        .mutation("offline.ensureCheckInSecret", json!({}), Some(&seller))
        .await;
    assert_eq!(mine.status, StatusCode::OK, "{}", mine.body);
    let events: Vec<Value> = mine.body["value"]["keys"]
        .as_array()
        .unwrap()
        .iter()
        .map(|key| key["eventId"].clone())
        .collect();
    // The running one first, then the next ones; the one in five days does not fit
    coming.sort();
    let mut expected = vec![json!(desk.event)];
    expected.extend(coming[..3].iter().map(|(_, event)| json!(event)));
    assert_eq!(events, expected);

    let versions = desk
        .app
        .query("offline.getOwnCheckInVersions", json!({}), Some(&seller))
        .await;
    assert_eq!(versions.status, StatusCode::OK, "{}", versions.body);
    let listed: Vec<Value> = versions.body["value"]
        .as_array()
        .unwrap()
        .iter()
        .map(|version| version["eventId"].clone())
        .collect();
    assert_eq!(listed, expected);
}

/// The time-based code of the seller's key for the event, fetched like a team device.
async fn team_code(desk: &Desk) -> String {
    let keys = desk
        .app
        .mutation(
            "offline.getCheckInSecretsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    let secret = URL_SAFE_NO_PAD
        .decode(keys.body["value"][0]["secret"].as_str().unwrap())
        .unwrap();
    let step = chrono::Utc::now().timestamp() / TOTP_STEP_SECONDS;
    format!("{}.{}", desk.seller, totp(&secret, step as u64))
}

async fn seller_of(desk: &Desk, token: &str) -> Value {
    let reply = desk
        .app
        .query(
            "users.getUserByCheckInToken",
            json!({ "token": token, "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"]["_id"].clone()
}

async fn stamp(desk: &Desk) -> Value {
    let reply = desk
        .app
        .query(
            "offline.getPreparationStamp",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].clone()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn leaving_the_team_renews_the_keys_of_the_id_codes(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let helper = fixtures::user(&db, "Helferin").await;
    fixtures::role(&db, desk.event, helper, "seller").await;
    fixtures::role(&db, desk.event, helper, "coorganizer").await;
    let helper_session = fixtures::session(&db, helper).await;
    let before = stamp(&desk).await;

    // The helper's device keeps the keys
    let old = team_code(&desk).await;
    assert_eq!(seller_of(&desk, &old).await, json!(desk.seller));
    // Only the organizer renews them by hand
    let by_helper = desk
        .app
        .mutation(
            "offline.renewCheckInKeys",
            json!({ "eventId": desk.event }),
            Some(&helper_session),
        )
        .await;
    assert_eq!(by_helper.body["code"], "auth.forbidden");

    let removed = desk
        .app
        .mutation(
            "eventRoles.removeCoOrganizerForEvent",
            json!({ "eventId": desk.event, "userId": helper }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(removed.status, StatusCode::OK, "{}", removed.body);
    assert_eq!(seller_of(&desk, &old).await, Value::Null);
    let renewed = team_code(&desk).await;
    assert_eq!(seller_of(&desk, &renewed).await, json!(desk.seller));
    // The devices see that their keys are outdated, the items are the same
    let after = stamp(&desk).await;
    assert_ne!(after["keys"], before["keys"]);
    assert_eq!(after["products"], before["products"]);

    // The seller's phone gets the new key
    let seller = fixtures::session(&db, desk.seller).await;
    let versions = desk
        .app
        .query("offline.getOwnCheckInVersions", json!({}), Some(&seller))
        .await;
    assert_eq!(
        versions.body["value"],
        json!([{ "eventId": desk.event, "version": 1 }])
    );

    let by_organizer = desk
        .app
        .mutation(
            "offline.renewCheckInKeys",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(by_organizer.status, StatusCode::OK, "{}", by_organizer.body);
    assert_eq!(seller_of(&desk, &renewed).await, Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_stamp_of_the_offline_copy_changes_with_new_items_and_sellers(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let (_, relation) = desk.item("Ski", 20.0).await;
    let first = stamp(&desk).await;
    // Accepting an item changes nothing the device lacks
    fixtures::event_seller(&db, desk.event, desk.seller, 1, false).await;
    sqlx::query("UPDATE event_products SET status = 'sold' WHERE id = $1")
        .bind(relation)
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(stamp(&desk).await, first);

    desk.item("Helm", 10.0).await;
    let second = stamp(&desk).await;
    assert_ne!(second["products"], first["products"]);
    assert_eq!(second["keys"], first["keys"]);

    let newcomer = fixtures::user(&db, "Neu").await;
    fixtures::role(&db, desk.event, newcomer, "seller").await;
    let third = stamp(&desk).await;
    assert_ne!(third["keys"], second["keys"]);

    let seller = fixtures::session(&db, desk.seller).await;
    let forbidden = desk
        .app
        .query(
            "offline.getPreparationStamp",
            json!({ "eventId": desk.event }),
            Some(&seller),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_batch_takes_at_most_500_queries(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let calls: Vec<Value> = (0..501)
        .map(|_| json!({ "name": "users.viewer", "args": {} }))
        .collect();
    let reply = desk
        .app
        .post(
            "/api/batch-query",
            json!({ "calls": calls }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{}", reply.body);
    assert_eq!(reply.body["code"], "INVALID_ARGUMENTS");
}
