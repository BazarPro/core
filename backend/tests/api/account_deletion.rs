//! Deleting an account anonymizes it after the grace period or right away (#168).

use crate::common;

use axum::http::StatusCode;
use bazarpro_backend::auth::oauth::{self, Identity, Provider};
use bazarpro_backend::auth::users::Profile;
use bazarpro_backend::rpc;
use common::fixtures::{self, EventSpec};
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn app(db: &PgPool) -> TestApp {
    disable_starter_products(db).await;
    TestApp::new(db.clone())
}

async fn count(db: &PgPool, sql: &str, user: Uuid) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(user)
        .fetch_one(db)
        .await
        .unwrap()
}

async fn status(db: &PgPool, user: Uuid) -> Option<String> {
    sqlx::query_scalar("SELECT status::text FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(db)
        .await
        .unwrap()
}

/// Name, address and anonymization of the user
async fn profile(db: &PgPool, user: Uuid) -> (Option<String>, Option<String>, bool) {
    sqlx::query_as("SELECT name, email, anonymized_at IS NOT NULL FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(db)
        .await
        .unwrap()
}

async fn grace_over(db: &PgPool, user: Uuid) {
    sqlx::query(
        "UPDATE users SET deletion_requested_at = now() - interval '31 days' WHERE id = $1",
    )
    .bind(user)
    .execute(db)
    .await
    .unwrap();
}

async fn anonymize_due(app: &TestApp) -> Value {
    rpc::call(&app.state, None, "users.anonymizeDueAccounts", json!({}))
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_deleted_account_can_come_back_until_the_grace_period_is_over(db: PgPool) {
    let app = app(&db).await;
    let email = "erika@example.org";
    let session = app.user_session(email, false).await;
    let (user, ..) = app.user(email).await;
    let reactivate =
        || app.password(json!({ "flow": "reactivate", "email": email, "password": "geheim123" }));

    let reply = app
        .mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    // Within the grace period nothing is anonymized, and the account comes back
    assert_eq!(anonymize_due(&app).await["anonymized"], 0);
    assert_eq!(reactivate().await.body, json!({ "signingIn": false }));
    assert_eq!(status(&db, user).await.as_deref(), Some("active"));
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM users WHERE id = $1 AND deletion_requested_at IS NULL",
            user
        )
        .await,
        1
    );

    // Deleted again and the grace period is over
    let session = fixtures::session(&db, user).await;
    app.mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    sqlx::query(
        "INSERT INTO auth_rate_limits (identifier, attempts_left, last_attempt_at)
         VALUES ($1, 9, now()), ('codeMail:' || $1, 9, now())",
    )
    .bind(email)
    .execute(&db)
    .await
    .unwrap();
    grace_over(&db, user).await;
    assert_eq!(
        anonymize_due(&app).await,
        json!({ "anonymized": 1, "more": false })
    );
    assert_eq!(profile(&db, user).await, (None, None, true));
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM auth_accounts WHERE user_id = $1",
            user
        )
        .await,
        0
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM sessions WHERE user_id = $1",
            user
        )
        .await,
        0
    );
    let limits: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_rate_limits")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(limits, 0);
    assert_eq!(reactivate().await.body["code"], "INVALID_CREDENTIALS");

    // The address signs up as a new account without history
    app.sign_up(email).await;
    let (again, ..) = app.user(email).await;
    assert_ne!(again, user);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn anonymizing_keeps_the_settlement_and_sold_items(db: PgPool) {
    let app = app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Erika Muster").await;
    let other = fixtures::user(&db, "Other").await;
    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -50,
            end_hours: -48,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    fixtures::role(&db, past, seller, "seller").await;
    fixtures::event_seller(&db, past, seller, 3, true).await;
    let sold = fixtures::product(&db, seller, "Ski", 50.0).await;
    fixtures::event_product(&db, past, sold, "sold").await;
    fixtures::purchase(&db, past, sold, seller, (50.0, 5.0, 45.0)).await;
    let unsold = fixtures::product(&db, seller, "Helm", 20.0).await;
    // A bazaar that keeps a record of who offered what keeps its record of the item
    let record = fixtures::event(
        &db,
        EventSpec {
            start_hours: -50,
            end_hours: -48,
            features: json!({ "fixedSellerData": true }),
            ..EventSpec::new("Radmarkt", organizer)
        },
    )
    .await;
    let recorded = fixtures::product(&db, seller, "Rahmen", 30.0).await;
    fixtures::event_product(&db, record, recorded, "returned").await;
    sqlx::query(
        "INSERT INTO offer_records (event_id, product_id, seller_id, title, price)
         VALUES ($1, $2, $3, 'Rahmen', 30)",
    )
    .bind(record)
    .bind(recorded)
    .bind(seller)
    .execute(&db)
    .await
    .unwrap();

    // The seller offered on an item of someone else at an upcoming bazaar
    let upcoming = fixtures::event(&db, EventSpec::new("Bald", organizer)).await;
    let wanted = fixtures::product(&db, other, "Rad", 100.0).await;
    let relation = fixtures::event_product(&db, upcoming, wanted, "announced").await;
    sqlx::query(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, message, status)
         VALUES ($1, $2, $3, $4, 80, 'Ginge das?', 'accepted')",
    )
    .bind(upcoming)
    .bind(wanted)
    .bind(relation)
    .bind(seller)
    .execute(&db)
    .await
    .unwrap();

    let organizer_session = fixtures::session(&db, organizer).await;
    let vendors = || {
        app.query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": past }),
            Some(&organizer_session),
        )
    };
    let before = vendors().await.body["value"].clone();
    assert_eq!(before[0]["name"], "Erika Muster");

    let reply = app
        .mutation(
            "users.setDeleted",
            json!({ "immediately": true }),
            Some(&fixtures::session(&db, seller).await),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(profile(&db, seller).await, (None, None, true));

    // The organizer's settlement is unchanged, from the snapshot
    let after = vendors().await.body["value"].clone();
    for field in ["name", "totalRevenue", "sellerNumber", "paid"] {
        assert_eq!(after[0][field], before[0][field], "{field}");
    }
    // Sold items stay, the others go
    let products: Vec<Uuid> =
        sqlx::query_scalar("SELECT id FROM products WHERE vendor_id = $1 ORDER BY title")
            .bind(seller)
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(products, vec![sold]);
    assert!(!products.contains(&unsold));
    let kept: (Option<Uuid>, String) =
        sqlx::query_as("SELECT product_id, title FROM offer_records WHERE event_id = $1")
            .bind(record)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(kept, (None, "Rahmen".to_owned()));
    // The offer is withdrawn without its message, and its seller is told
    let offer: (String, Option<String>) =
        sqlx::query_as("SELECT status::text, message FROM product_offers")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(offer, ("withdrawn".into(), None));
    let mails: Vec<Value> =
        sqlx::query_scalar("SELECT payload FROM jobs WHERE kind = 'mail.notification'")
            .fetch_all(&db)
            .await
            .unwrap();
    assert!(
        mails.iter().any(|mail| mail["to"] == "other@test.example"
            && mail["subject"].as_str().unwrap().contains("Rad")),
        "{mails:?}"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_anonymized_banned_user_cannot_sign_up_again(db: PgPool) {
    let app = app(&db).await;
    let admin = fixtures::admin(&db, "Admin").await;
    let admin_session = fixtures::session(&db, admin).await;
    app.user_session("spam@example.org", false).await;
    let (user, ..) = app.user("spam@example.org").await;
    sqlx::query("UPDATE users SET status = 'banned' WHERE id = $1")
        .bind(user)
        .execute(&db)
        .await
        .unwrap();

    let reply = app
        .mutation(
            "users.deleteUserForAdmin",
            json!({ "userId": user }),
            Some(&admin_session),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(profile(&db, user).await, (None, None, true));
    // Neither listed nor counted any more
    let listed = app
        .query("users.listUsersForAdmin", json!({}), Some(&admin_session))
        .await
        .body["value"]
        .clone();
    assert!(
        listed
            .as_array()
            .unwrap()
            .iter()
            .all(|u| u["_id"] != json!(user))
    );

    let again = app
        .password(json!({
            "flow": "signUp", "email": "Spam@Example.org", "password": "geheim123"
        }))
        .await;
    assert_eq!(again.status, StatusCode::FORBIDDEN);
    assert_eq!(again.body["code"], "ACCOUNT_BANNED");
    // Only an HMAC of the address is kept
    let stored: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM banned_identities WHERE expires_at > now() + interval '700 days'",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(stored, 1);
    app.sign_up("other@example.org").await;

    // Admins delete others, not themselves
    let own = app
        .mutation(
            "users.deleteUserForAdmin",
            json!({ "userId": admin }),
            Some(&admin_session),
        )
        .await;
    assert_eq!(own.body["code"], "moderation.noDeleteSelf");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_last_admin_cannot_delete_their_account(db: PgPool) {
    let app = app(&db).await;
    let admin = fixtures::admin(&db, "Admin").await;
    let session = fixtures::session(&db, admin).await;
    let reply = app
        .mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body["code"], "ACCOUNT_IS_LAST_ADMIN");

    fixtures::admin(&db, "Second").await;
    let reply = app
        .mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizers_hand_past_events_over_before_deleting(db: PgPool) {
    let app = app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let helper = fixtures::user(&db, "Helper").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, helper, "coorganizer").await;
    let session = fixtures::session(&db, organizer).await;

    let info = app
        .query("users.getAccountDeletionInfo", json!({}), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(info["graceDays"], 30);
    assert_eq!(info["pastOrganizedEvents"][0]["title"], "Vorbei");
    assert_eq!(
        info["pastOrganizedEvents"][0]["coOrganizers"],
        json!([{ "_id": helper, "name": "Helper" }])
    );
    assert_eq!(
        app.mutation("users.setDeleted", json!({}), Some(&session))
            .await
            .body["code"],
        "ACCOUNT_ORGANIZES_PAST_EVENTS"
    );

    // Only to a helper of the event
    let stranger = fixtures::user(&db, "Stranger").await;
    let transfer = |user: Uuid| {
        app.mutation(
            "eventRoles.transferOrganizer",
            json!({ "eventId": event, "userId": user }),
            Some(&session),
        )
    };
    assert_eq!(transfer(stranger).await.body["code"], "seller.notHelper");
    let reply = transfer(helper).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let roles: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT user_id, role::text FROM event_roles WHERE event_id = $1 ORDER BY role",
    )
    .bind(event)
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(
        roles,
        vec![
            (organizer, "coorganizer".into()),
            (helper, "organizer".into())
        ]
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM events WHERE organizer_id = $1",
            helper
        )
        .await,
        1
    );

    // Now the account goes; the helper role with it
    let reply = app
        .mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM event_roles WHERE user_id = $1",
            organizer
        )
        .await,
        0
    );
}

fn identity(email: &str) -> Identity {
    Identity {
        account_id: "42".to_owned(),
        profile: Profile {
            email: Some(email.to_owned()),
            name: Some("Erika".to_owned()),
            image: None,
            locale: None,
            email_verified: true,
        },
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn oauth_accounts_come_back_by_signing_in_within_the_grace_period(db: PgPool) {
    let app = app(&db).await;
    let email = "erika@example.org";
    let token = oauth::sign_in(&app.state, Provider::GitHub, &identity(email))
        .await
        .unwrap();
    let (user, ..) = app.user(email).await;
    app.mutation("users.setDeleted", json!({}), Some(&token))
        .await;
    assert_eq!(status(&db, user).await.as_deref(), Some("deleted"));

    oauth::sign_in(&app.state, Provider::GitHub, &identity(email))
        .await
        .unwrap();
    assert_eq!(status(&db, user).await.as_deref(), Some("active"));

    // Anonymized, the same GitHub account becomes a new user
    let token = fixtures::session(&db, user).await;
    app.mutation(
        "users.setDeleted",
        json!({ "immediately": true }),
        Some(&token),
    )
    .await;
    oauth::sign_in(&app.state, Provider::GitHub, &identity(email))
        .await
        .unwrap();
    let (again, ..) = app.user(email).await;
    assert_ne!(again, user);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn mails_waiting_for_a_deleted_user_are_not_sent(db: PgPool) {
    let app = app(&db).await;
    let user = fixtures::user(&db, "Erika").await;
    let mail = |subject: &str| {
        json!({
            "userId": user, "to": "erika@test.example", "subject": subject, "heading": "H",
            "paragraphs": [], "link": null, "footnote": null, "locale": "de", "unsubscribe": null
        })
    };
    for subject in ["Vorher", "Später"] {
        sqlx::query("INSERT INTO jobs (kind, payload) VALUES ('mail.notification', $1)")
            .bind(mail(subject))
            .execute(&db)
            .await
            .unwrap();
    }
    sqlx::query("UPDATE users SET status = 'deleted' WHERE id = $1")
        .bind(user)
        .execute(&db)
        .await
        .unwrap();
    app.run_jobs().await;
    assert!(app.sent.lock().unwrap().is_empty());

    // Anonymizing removes what is still queued
    sqlx::query("INSERT INTO jobs (kind, payload, run_at) VALUES ('mail.notification', $1, now() + interval '1 hour')")
        .bind(mail("Viel später"))
        .execute(&db)
        .await
        .unwrap();
    let admin = fixtures::admin(&db, "Admin").await;
    let reply = app
        .mutation(
            "users.deleteUserForAdmin",
            json!({ "userId": user }),
            Some(&fixtures::session(&db, admin).await),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM jobs WHERE payload->>'userId' = $1::uuid::text",
            user
        )
        .await,
        0
    );
}
