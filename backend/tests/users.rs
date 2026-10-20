//! Accounts and profiles (convex/tests/users.test.ts, parts of sellerRecords.test.ts).

mod common;

use axum::http::StatusCode;
use bazarpro_backend::{flags, rpc};
use common::fixtures::{self, EventSpec};
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn app(db: &PgPool) -> TestApp {
    disable_starter_products(db).await;
    TestApp::new(db.clone())
}

async fn status(db: &PgPool, user: Uuid) -> Option<String> {
    sqlx::query_scalar("SELECT status::text FROM users WHERE id = $1")
        .bind(user)
        .fetch_one(db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn viewer_and_system_role(db: PgPool) {
    let app = app(&db).await;
    assert_eq!(
        app.query("users.viewer", json!({}), None).await.body["value"],
        Value::Null
    );
    let user = fixtures::user(&db, "Erika").await;
    let session = fixtures::session(&db, user).await;
    let viewer = app
        .query("users.viewer", json!({}), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (viewer["_id"].clone(), viewer["name"].clone()),
        (json!(user), json!("Erika"))
    );
    let role = app
        .query("users.getUserSystemRole", json!({ "userId": user }), None)
        .await;
    assert_eq!(role.body["value"], "user");
    let missing = app
        .query(
            "users.getUserSystemRole",
            json!({ "userId": Uuid::new_v4() }),
            None,
        )
        .await;
    assert_eq!(missing.body["value"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn update_profile(db: PgPool) {
    let app = app(&db).await;
    let user = fixtures::user(&db, "Alt").await;
    let session = fixtures::session(&db, user).await;
    let reply = app
        .mutation(
            "users.update",
            json!({ "firstName": "Erika", "lastName": "Muster", "city": "Ulm" }),
            Some(&session),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let viewer = app
        .query("users.viewer", json!({}), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(viewer["name"], "Erika Muster");
    assert_eq!(viewer["city"], "Ulm");
    assert_eq!(
        app.mutation("users.update", json!({ "city": "X" }), None)
            .await
            .body["code"],
        "auth.required"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn users_cannot_change_their_own_status(db: PgPool) {
    let app = app(&db).await;
    let user = fixtures::user(&db, "Gesperrt").await;
    sqlx::query("UPDATE users SET status = 'banned' WHERE id = $1")
        .bind(user)
        .execute(&db)
        .await
        .unwrap();
    let session = fixtures::session(&db, user).await;
    let reply = app
        .mutation(
            "users.update",
            json!({ "status": "active" }),
            Some(&session),
        )
        .await;
    assert_eq!(reply.body["code"], "INVALID_ARGUMENTS");
    assert_eq!(status(&db, user).await.as_deref(), Some("banned"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn deleting_the_account_ends_sessions_and_clears_the_verification(db: PgPool) {
    let app = app(&db).await;
    let session = app.user_session("erika@example.org", false).await;
    let (user, ..) = app.user("erika@example.org").await;
    let reply = app
        .mutation("users.setDeleted", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(status(&db, user).await.as_deref(), Some("deleted"));
    let verified: Option<String> =
        sqlx::query_scalar("SELECT email_verified FROM auth_accounts WHERE user_id = $1")
            .bind(user)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(verified, None);
    assert_eq!(
        app.get("/api/auth/session", Some(&session)).await.body,
        json!({ "userId": null })
    );
    assert_eq!(
        app.mutation("users.setDeleted", json!({}), None).await.body["code"],
        "auth.required"
    );

    // Deleted accounts come back with the password
    let wrong = app
        .mutation(
            "users.reactivateAccount",
            json!({ "email": "erika@example.org", "password": "falsch123" }),
            None,
        )
        .await;
    assert_eq!(wrong.body["code"], "INVALID_CREDENTIALS");
    app.mutation(
        "users.reactivateAccount",
        json!({ "email": "erika@example.org", "password": "geheim123" }),
        None,
    )
    .await;
    assert_eq!(status(&db, user).await.as_deref(), Some("active"));
    let again = app
        .mutation(
            "users.reactivateAccount",
            json!({ "email": "erika@example.org", "password": "geheim123" }),
            None,
        )
        .await;
    assert_eq!(again.body["code"], "account.cannotReactivate");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizers_of_upcoming_events_cannot_delete_their_account(db: PgPool) {
    let app = app(&db).await;
    let upcoming = fixtures::user(&db, "Upcoming").await;
    fixtures::event(&db, EventSpec::new("Bald", upcoming)).await;
    let reply = app
        .mutation(
            "users.setDeleted",
            json!({}),
            Some(&fixtures::session(&db, upcoming).await),
        )
        .await;
    assert_eq!(reply.body["code"], "ACCOUNT_IS_ORGANIZER");
    assert_eq!(status(&db, upcoming).await.as_deref(), Some("active"));

    let past = fixtures::user(&db, "Past").await;
    fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", past)
        },
    )
    .await;
    app.mutation(
        "users.setDeleted",
        json!({}),
        Some(&fixtures::session(&db, past).await),
    )
    .await;
    assert_eq!(status(&db, past).await.as_deref(), Some("deleted"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn deleting_removes_seller_and_helper_roles_and_items(db: PgPool) {
    let app = app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Seller").await;
    let normal = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let record = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "fixedSellerData": true }),
            ..EventSpec::new("Radmarkt", organizer)
        },
    )
    .await;
    for event in [normal, record] {
        fixtures::role(&db, event, seller, "seller").await;
        let product = fixtures::product(&db, seller, "Rad", 100.0).await;
        fixtures::event_product(&db, event, product, "announced").await;
    }
    fixtures::role(&db, normal, seller, "coorganizer").await;

    app.mutation(
        "users.setDeleted",
        json!({}),
        Some(&fixtures::session(&db, seller).await),
    )
    .await;
    let roles: i64 = sqlx::query_scalar("SELECT count(*) FROM event_roles WHERE user_id = $1")
        .bind(seller)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(roles, 0);
    // The bazaar keeping a record keeps the item
    let items: Vec<Uuid> = sqlx::query_scalar("SELECT event_id FROM event_products")
        .fetch_all(&db)
        .await
        .unwrap();
    assert_eq!(items, vec![record]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn check_in_tokens(db: PgPool) {
    let app = app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Seller").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let token = app
        .mutation(
            "users.generateCheckInToken",
            json!({}),
            Some(&fixtures::session(&db, seller).await),
        )
        .await
        .body["value"]
        .clone();
    assert!(token["token"].as_str().unwrap().len() >= 20);
    assert!(token["expires"].is_f64());

    let scan = |session: String, token: Value| {
        let app = &app;
        async move {
            app.query(
                "users.getUserByCheckInToken",
                json!({ "token": token, "eventId": event }),
                Some(&session),
            )
            .await
        }
    };
    let as_organizer = fixtures::session(&db, organizer).await;
    assert_eq!(
        scan(as_organizer.clone(), token["token"].clone())
            .await
            .body["value"]["_id"],
        json!(seller)
    );
    assert_eq!(
        scan(fixtures::session(&db, seller).await, token["token"].clone())
            .await
            .status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        scan(as_organizer.clone(), json!("unbekannt")).await.body["value"],
        Value::Null
    );
    sqlx::query(
        "UPDATE users SET check_in_token_expires_at = now() - interval '1 second' WHERE id = $1",
    )
    .bind(seller)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        scan(as_organizer, token["token"].clone()).await.body["value"],
        Value::Null
    );
    assert_eq!(
        app.mutation("users.generateCheckInToken", json!({}), None)
            .await
            .body["code"],
        "auth.required"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn export_providers_and_onboarding(db: PgPool) {
    let app = app(&db).await;
    let session = app.user_session("erika@example.org", false).await;
    let (user, ..) = app.user("erika@example.org").await;
    fixtures::product(&db, user, "Ski", 50.0).await;
    let export = app
        .query("users.getExportData", json!({}), Some(&session))
        .await
        .body["value"]
        .clone();
    assert_eq!(export["profile"]["email"], "erika@example.org");
    assert_eq!(export["products"][0]["title"], "Ski");
    assert_eq!(export["products"][0]["price"], 50.0);
    assert!(export["exportDate"].as_str().unwrap().ends_with('Z'));
    assert_eq!(
        app.query("users.getExportData", json!({}), None).await.body["code"],
        "auth.required"
    );

    let providers = app
        .query("users.getUserProviders", json!({}), Some(&session))
        .await;
    assert_eq!(providers.body["value"], json!(["password"]));
    assert_eq!(
        app.query("users.getUserProviders", json!({}), None)
            .await
            .body["value"],
        json!([])
    );

    assert_eq!(
        app.query("users.viewer", json!({}), Some(&session))
            .await
            .body["value"]["needsOnboarding"],
        true
    );
    app.mutation("users.markOnboardingSeen", json!({}), Some(&session))
        .await;
    assert_eq!(
        app.query("users.viewer", json!({}), Some(&session))
            .await
            .body["value"]["needsOnboarding"],
        false
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn change_password(db: PgPool) {
    let app = app(&db).await;
    let session = app.user_session("erika@example.org", false).await;
    let change = |old: &str, new: &str| {
        let (app, session, args) = (
            &app,
            session.clone(),
            json!({ "oldPassword": old, "newPassword": new }),
        );
        async move {
            app.mutation("users.changePassword", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(
        change("falsch123", "neuesPasswort").await["code"],
        "account.wrongPassword"
    );
    assert_eq!(
        change("geheim123", "kurz").await["code"],
        "INVALID_PASSWORD"
    );
    assert_eq!(
        change("geheim123", "neuesPasswort").await["value"],
        Value::Null
    );
    let signed_in = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "neuesPasswort" }),
        )
        .await;
    assert_eq!(signed_in.body, json!({ "signingIn": true }));

    let oauth_only = fixtures::session(&db, fixtures::user(&db, "OAuth").await).await;
    let reply = app
        .mutation(
            "users.changePassword",
            json!({ "oldPassword": "a", "newPassword": "b" }),
            Some(&oauth_only),
        )
        .await;
    assert_eq!(reply.body["code"], "PASSWORD_ACCOUNT_NOT_FOUND");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn missing_profile_fields_and_user_by_id(db: PgPool) {
    let app = app(&db).await;
    let user = fixtures::user(&db, "Erika").await;
    sqlx::query(
        "UPDATE users SET first_name = 'Erika', last_name = '  ', city = 'Ulm' WHERE id = $1",
    )
    .bind(user)
    .execute(&db)
    .await
    .unwrap();
    let missing = app
        .query(
            "users.getMissinfProfileData",
            json!({ "userId": user }),
            None,
        )
        .await;
    assert_eq!(
        missing.body["value"],
        json!(["lastName", "phone", "street", "zipCode", "country"])
    );

    let organizer = fixtures::user(&db, "Orga").await;
    let other = fixtures::user(&db, "Other").await;
    let event = fixtures::event(&db, EventSpec::new("Basar", organizer)).await;
    let by_id = |session: String, args: Value| {
        let app = &app;
        async move { app.query("users.getUserById", args, Some(&session)).await }
    };
    let own = by_id(
        fixtures::session(&db, user).await,
        json!({ "userId": user }),
    )
    .await;
    assert_eq!(own.body["value"]["_id"], json!(user));
    let foreign = by_id(
        fixtures::session(&db, other).await,
        json!({ "userId": user }),
    )
    .await;
    assert_eq!(foreign.body["code"], "auth.forbidden");
    let as_organizer = by_id(
        fixtures::session(&db, organizer).await,
        json!({ "userId": user, "eventId": event }),
    )
    .await;
    assert_eq!(as_organizer.body["value"]["firstName"], "Erika");
    let not_team = by_id(
        fixtures::session(&db, other).await,
        json!({ "userId": user, "eventId": event }),
    )
    .await;
    assert_eq!(not_team.body["code"], "auth.forbidden");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn name_and_address_are_fixed_while_a_bazaar_keeps_a_record(db: PgPool) {
    let app = app(&db).await;
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Anna").await;
    sqlx::query("UPDATE users SET street = 'Münsterplatz 1', phone = '0731 123' WHERE id = $1")
        .bind(seller)
        .execute(&db)
        .await
        .unwrap();
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "fixedSellerData": true }),
            ..EventSpec::new("Radmarkt", organizer)
        },
    )
    .await;
    let row = fixtures::event_seller(&db, event, seller, 1, false).await;
    let session = fixtures::session(&db, seller).await;
    assert_eq!(
        app.query("users.isMyProfileFixed", json!({}), Some(&session))
            .await
            .body["value"],
        false
    );
    sqlx::query(
        "UPDATE event_sellers SET seller_snapshot = '{\"lastName\": \"Rad\"}' WHERE id = $1",
    )
    .bind(row)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        app.query("users.isMyProfileFixed", json!({}), Some(&session))
            .await
            .body["value"],
        true
    );

    let street = app
        .mutation(
            "users.update",
            json!({ "street": "Neue Str. 2" }),
            Some(&session),
        )
        .await;
    assert_eq!(street.body["code"], "profile.fixed");
    // Sending the unchanged values (the whole form) is fine, the phone may change
    let phone = app
        .mutation(
            "users.update",
            json!({ "street": "Münsterplatz 1", "phone": "0731 999" }),
            Some(&session),
        )
        .await;
    assert_eq!(phone.status, StatusCode::OK);

    sqlx::query("UPDATE events SET start_date = now() - interval '3 hours', end_date = now() - interval '1 hour'")
        .execute(&db)
        .await
        .unwrap();
    let after = app
        .mutation(
            "users.update",
            json!({ "street": "Neue Str. 2" }),
            Some(&session),
        )
        .await;
    assert_eq!(after.status, StatusCode::OK);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_set_the_status_and_a_ban_ends_the_sessions(db: PgPool) {
    let app = app(&db).await;
    let admin = fixtures::admin(&db, "Admin").await;
    let user = fixtures::user(&db, "User").await;
    let as_admin = fixtures::session(&db, admin).await;
    let user_session = fixtures::session(&db, user).await;
    let set = |target: Uuid, status: &str| {
        let (app, session, args) = (
            &app,
            as_admin.clone(),
            json!({ "userId": target, "status": status }),
        );
        async move {
            app.mutation("users.setUserStatusForAdmin", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(set(admin, "banned").await["code"], "moderation.noBanSelf");
    assert_eq!(set(user, "banned").await["value"], json!({ "ok": true }));
    assert_eq!(status(&db, user).await.as_deref(), Some("banned"));
    assert_eq!(
        app.get("/api/auth/session", Some(&user_session)).await.body,
        json!({ "userId": null })
    );

    let list = app
        .query("users.listUsersForAdmin", json!({}), Some(&as_admin))
        .await
        .body["value"]
        .clone();
    let entry = list
        .as_array()
        .unwrap()
        .iter()
        .find(|u| u["_id"] == json!(user))
        .unwrap()
        .clone();
    assert_eq!(
        (entry["status"].clone(), entry["isWalkIn"].clone()),
        (json!("banned"), json!(false))
    );
    let as_user = fixtures::session(&db, fixtures::user(&db, "Other").await).await;
    assert_eq!(
        app.query("users.listUsersForAdmin", json!({}), Some(&as_user))
            .await
            .body["code"],
        "auth.forbidden"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn e2e_helpers_need_the_flag(db: PgPool) {
    let app = app(&db).await;
    fixtures::user(&db, "E2E").await;
    let email = "e2e@test.example";
    assert_eq!(
        app.query(
            "users.getE2eVerificationCode",
            json!({ "email": email }),
            None
        )
        .await
        .body["code"],
        "E2E_AUTH_DISABLED"
    );
    let mut conn = db.acquire().await.unwrap();
    flags::set(&mut conn, flags::E2E_AUTH_SKIP_EMAIL, true)
        .await
        .unwrap();
    assert_eq!(
        app.query(
            "users.getE2eVerificationCode",
            json!({ "email": email }),
            None
        )
        .await
        .body["code"],
        "E2E_CODE_NOT_FOUND"
    );
    app.mutation("users.confirmEmailForE2E", json!({ "email": email }), None)
        .await;
    app.mutation(
        "users.setProfileForE2E",
        json!({ "email": email, "city": "Ulm" }),
        None,
    )
    .await;
    let (confirmed, city, street): (Option<bool>, Option<String>, Option<String>) =
        sqlx::query_as("SELECT is_mail_confirmed, city, street FROM users WHERE email = $1")
            .bind(email)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(
        (confirmed, city.as_deref(), street.as_deref()),
        (Some(true), Some("Ulm"), Some("Musterstraße 1"))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_from_the_command_line(db: PgPool) {
    let mut config = bazarpro_backend::Config::for_tests("");
    config.admin_email = Some("Chef@Verein.de".into());
    disable_starter_products(&db).await;
    let app = TestApp::with_config(db.clone(), config);
    let message = rpc::call(&app.state, None, "users.promoteConfiguredAdmin", json!({}))
        .await
        .unwrap();
    assert!(message.as_str().unwrap().contains("sobald"));
    let chef: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, email, is_mail_confirmed) VALUES ('Chef', 'chef@verein.de', true) RETURNING id",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    rpc::call(&app.state, None, "users.promoteConfiguredAdmin", json!({}))
        .await
        .unwrap();
    let role: Option<String> =
        sqlx::query_scalar("SELECT system_role::text FROM users WHERE id = $1")
            .bind(chef)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(role.as_deref(), Some("admin"));

    let unknown = rpc::call(
        &app.state,
        None,
        "users.makeAdmin",
        json!({ "email": "nobody@x.de" }),
    )
    .await
    .unwrap_err();
    assert_eq!(unknown.code(), Some("notFound.accountByEmail"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_chosen_language_is_kept(db: PgPool) {
    let app = app(&db).await;
    let user = fixtures::user(&db, "Erika").await;
    let session = fixtures::session(&db, user).await;
    app.mutation(
        "users.setMyLocale",
        json!({ "locale": "en" }),
        Some(&session),
    )
    .await;
    assert_eq!(
        app.query("users.viewer", json!({}), Some(&session))
            .await
            .body["value"]["locale"],
        "en"
    );
    assert_eq!(
        app.mutation(
            "users.setMyLocale",
            json!({ "locale": "fr" }),
            Some(&session)
        )
        .await
        .body["code"],
        "INVALID_ARGUMENTS"
    );
}
