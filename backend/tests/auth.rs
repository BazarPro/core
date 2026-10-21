//! Sign-in flows over HTTP, as the login pages call them.

mod common;

use axum::http::StatusCode;
use bazarpro_backend::auth::oauth::{self, Identity, Provider};
use bazarpro_backend::auth::users::Profile;
use bazarpro_backend::{Config, flags};
use common::{TestApp, disable_starter_products};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

/// Imported from Convex: `new Scrypt().hash('geheim123')` of lucia 3.2.2
const LUCIA_HASH: &str = "8e37740c04727d44b9206c793d4cc130:75e852290a02857e3218cd8f9ec4bea387bf1e15eacedbe052179c0daa49eb930584b7568bba1be4beaaeca7b6c1b211a2d4e1fc850da7d9e27cfb42c4534a75";

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sign_up_sends_a_code_and_the_code_signs_in(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;

    let session = app.sign_up("erika@example.org").await;

    let mail = app.sent.lock().unwrap()[0].clone();
    assert_eq!(mail.to, "erika@example.org");
    // Sign-up stored the app language, so the mail is in English
    assert!(mail.subject.contains("BazarPro") && !mail.subject.contains("Bestätige"));
    assert!(
        mail.html
            .contains("https://bazarpro.test/register?mode=verify&amp;verifyCode=")
    );

    let (user_id, confirmed, role, locale) = app.user("erika@example.org").await;
    assert_eq!(
        (confirmed, role.as_deref(), locale.as_deref()),
        (Some(true), Some("user"), Some("en"))
    );
    let me = app.get("/api/auth/session", Some(&session)).await;
    assert_eq!(me.body, json!({ "userId": user_id }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn new_accounts_get_starter_products_unless_switched_off(db: PgPool) {
    let app = TestApp::new(db.clone());
    app.password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    let kinds: Vec<String> = sqlx::query_scalar("SELECT kind FROM jobs ORDER BY kind")
        .fetch_all(&db)
        .await
        .unwrap();
    assert_eq!(
        kinds,
        vec!["mail.verification", "seed.createStarterProducts"]
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_second_sign_up_with_the_same_address_fails(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    let again = app
        .password(
            json!({ "flow": "signUp", "email": "erika@example.org", "password": "anderes123" }),
        )
        .await;
    assert_eq!(again.status, StatusCode::CONFLICT);
    assert_eq!(again.body["code"], "ACCOUNT_ALREADY_EXISTS");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn short_passwords_are_rejected(db: PgPool) {
    let app = TestApp::new(db);
    let reply = app
        .password(json!({ "flow": "signUp", "email": "a@example.org", "password": "1234567" }))
        .await;
    assert_eq!(reply.body["code"], "INVALID_PASSWORD");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sign_in_with_password(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;

    let ok = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(ok.body, json!({ "signingIn": true }));
    assert!(ok.session.is_some());
    let last_login: Option<chrono::DateTime<chrono::Utc>> =
        sqlx::query_scalar("SELECT last_login_at FROM users WHERE email = 'erika@example.org'")
            .fetch_one(&db)
            .await
            .unwrap();
    assert!(last_login.is_some());

    let wrong = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "falsch123" }),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::UNAUTHORIZED);
    assert_eq!(wrong.body["code"], "INVALID_CREDENTIALS");
    let unknown = app
        .password(
            json!({ "flow": "signIn", "email": "nobody@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(unknown.body["code"], "INVALID_CREDENTIALS");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn unconfirmed_accounts_get_a_new_code_instead_of_a_session(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    let first = app.last_code().await;

    let reply = app
        .password(json!({ "flow": "signIn", "email": "a@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(reply.body, json!({ "signingIn": false }));
    assert!(reply.session.is_none());
    let second = app.last_code().await;
    assert_eq!(app.sent.lock().unwrap().len(), 2);

    // The new code replaced the old one
    if first != second {
        let old = app
            .password(
                json!({ "flow": "email-verification", "email": "a@example.org", "code": first }),
            )
            .await;
        assert_eq!(old.body["code"], "INVALID_CODE");
    }
    let new = app
        .password(json!({ "flow": "email-verification", "email": "a@example.org", "code": second }))
        .await;
    assert_eq!(new.body, json!({ "signingIn": true }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn codes_expire_and_are_used_once(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    let code = app.last_code().await;
    sqlx::query("UPDATE verification_codes SET expires_at = now() - interval '1 second'")
        .execute(&db)
        .await
        .unwrap();
    let expired = app
        .password(json!({ "flow": "email-verification", "email": "a@example.org", "code": code }))
        .await;
    assert_eq!(expired.body["code"], "INVALID_CODE");

    // Resend without code
    let resent = app
        .password(json!({ "flow": "email-verification", "email": "a@example.org" }))
        .await;
    assert_eq!(resent.body, json!({ "signingIn": false }));
    let code = app.last_code().await;
    let used = app
        .password(json!({ "flow": "email-verification", "email": "a@example.org", "code": code }))
        .await;
    assert_eq!(used.body, json!({ "signingIn": true }));
    let again = app
        .password(json!({ "flow": "email-verification", "email": "a@example.org", "code": code }))
        .await;
    assert_eq!(again.body["code"], "INVALID_CODE");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn repeated_wrong_passwords_are_rate_limited(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    for _ in 0..10 {
        let reply = app
            .password(
                json!({ "flow": "signIn", "email": "erika@example.org", "password": "falsch123" }),
            )
            .await;
        assert_eq!(reply.body["code"], "INVALID_CREDENTIALS");
    }
    // Even the right password is refused now
    let blocked = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(blocked.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(blocked.body["code"], "TOO_MANY_FAILED_ATTEMPTS");

    // An hour later the attempts are back
    sqlx::query("UPDATE auth_rate_limits SET last_attempt_at = now() - interval '1 hour'")
        .execute(&db)
        .await
        .unwrap();
    let ok = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(ok.body, json!({ "signingIn": true }));
}

/// A user and password account as the import creates them from Convex.
async fn imported_account(db: &PgPool, email: &str, status: &str) -> Uuid {
    let user_id: Uuid = sqlx::query_scalar(
        "INSERT INTO users (email, status, system_role, is_mail_confirmed)
         VALUES ($1, $2::user_status, 'user', true) RETURNING id",
    )
    .bind(email)
    .bind(status)
    .fetch_one(db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO auth_accounts (user_id, provider, provider_account_id, secret, email_verified)
         VALUES ($1, 'password', $2, $3, $2)",
    )
    .bind(user_id)
    .bind(email)
    .bind(LUCIA_HASH)
    .execute(db)
    .await
    .unwrap();
    user_id
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn passwords_imported_from_convex_work_and_are_rehashed(db: PgPool) {
    let app = TestApp::new(db.clone());
    imported_account(&db, "alt@example.org", "active").await;
    let reply = app
        .password(json!({ "flow": "signIn", "email": "alt@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(reply.body, json!({ "signingIn": true }));
    let secret: String = sqlx::query_scalar("SELECT secret FROM auth_accounts")
        .fetch_one(&db)
        .await
        .unwrap();
    assert!(secret.starts_with("$argon2id$"));
    let again = app
        .password(json!({ "flow": "signIn", "email": "alt@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(again.body, json!({ "signingIn": true }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn banned_and_deleted_accounts_cannot_sign_in(db: PgPool) {
    let app = TestApp::new(db.clone());
    imported_account(&db, "banned@example.org", "banned").await;
    imported_account(&db, "deleted@example.org", "deleted").await;
    for (email, code) in [
        ("banned@example.org", "ACCOUNT_BANNED"),
        ("deleted@example.org", "ACCOUNT_DELETED"),
    ] {
        let reply = app
            .password(json!({ "flow": "signIn", "email": email, "password": "geheim123" }))
            .await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN);
        assert_eq!(reply.body["code"], code);
        let reset = app
            .password(json!({ "flow": "reset", "email": email }))
            .await;
        assert_eq!(reset.body["code"], code);
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn flags_switch_off_registration_and_login(db: PgPool) {
    let app = TestApp::new(db.clone());
    let mut conn = db.acquire().await.unwrap();
    flags::set(&mut conn, flags::REGISTRATION_ENABLED, false)
        .await
        .unwrap();
    let reply = app
        .password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(reply.body["code"], "REGISTRATION_DISABLED");

    flags::set(&mut conn, flags::LOGIN_ENABLED, false)
        .await
        .unwrap();
    let reply = app
        .password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(reply.body["code"], "LOGIN_DISABLED");
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(count, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn password_reset(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let old_session = app.sign_up("erika@example.org").await;
    app.sent.lock().unwrap().clear();

    // Unknown addresses look the same, but get no mail
    let unknown = app
        .password(json!({ "flow": "reset", "email": "nobody@example.org", "redirectTo": "/login?mode=reset" }))
        .await;
    assert_eq!(unknown.body, json!({ "signingIn": false }));
    app.run_jobs().await;
    assert!(app.sent.lock().unwrap().is_empty());

    let reply = app
        .password(json!({ "flow": "reset", "email": "erika@example.org", "redirectTo": "/login?mode=reset" }))
        .await;
    assert_eq!(reply.body, json!({ "signingIn": false }));
    let code = app.last_code().await;
    let html = app.sent.lock().unwrap()[0].html.clone();
    assert!(html.contains("https://bazarpro.test/login?mode=reset&amp;resetCode="));

    let short = app
        .password(json!({ "flow": "reset-verification", "email": "erika@example.org", "code": code, "newPassword": "kurz" }))
        .await;
    assert_eq!(short.body["code"], "INVALID_PASSWORD");
    let done = app
        .password(json!({ "flow": "reset-verification", "email": "erika@example.org", "code": code, "newPassword": "neuesPasswort" }))
        .await;
    assert_eq!(done.body, json!({ "signingIn": true }));
    assert!(done.session.is_some());

    // Signed out elsewhere, old password gone
    let me = app.get("/api/auth/session", Some(&old_session)).await;
    assert_eq!(me.body, json!({ "userId": null }));
    let old = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(old.body["code"], "INVALID_CREDENTIALS");
    let new = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "neuesPasswort" }),
        )
        .await;
    assert_eq!(new.body, json!({ "signingIn": true }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn code_mails_are_limited_and_do_not_reveal_addresses(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.password(json!({ "flow": "signUp", "email": "a@example.org", "password": "geheim123" }))
        .await;
    app.run_jobs().await;
    app.sent.lock().unwrap().clear();
    let resend =
        |email: &'static str| app.password(json!({ "flow": "email-verification", "email": email }));

    // Unknown addresses answer like known ones, without a mail
    let unknown = resend("nobody@example.org").await;
    assert_eq!(unknown.status, StatusCode::OK);
    assert_eq!(unknown.body, json!({ "signingIn": false }));
    app.run_jobs().await;
    assert!(app.sent.lock().unwrap().is_empty());

    // 10 mails per address and hour, resends and resets together
    for _ in 0..9 {
        assert_eq!(
            resend("a@example.org").await.body,
            json!({ "signingIn": false })
        );
    }
    app.password(json!({ "flow": "reset", "email": "a@example.org" }))
        .await;
    let limited = resend("a@example.org").await;
    assert_eq!(limited.body, json!({ "signingIn": false }));
    app.run_jobs().await;
    assert_eq!(app.sent.lock().unwrap().len(), 10);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_configured_admin_is_promoted_after_verification(db: PgPool) {
    let mut config = Config::for_tests("");
    config.admin_email = Some("Admin@Example.org".to_owned());
    let app = TestApp::with_config(db.clone(), config);
    disable_starter_products(&db).await;

    app.password(
        json!({ "flow": "signUp", "email": "admin@example.org", "password": "geheim123" }),
    )
    .await;
    assert_eq!(
        app.user("admin@example.org").await.2.as_deref(),
        Some("user")
    );
    let code = app.last_code().await;
    app.password(
        json!({ "flow": "email-verification", "email": "admin@example.org", "code": code }),
    )
    .await;
    assert_eq!(
        app.user("admin@example.org").await.2.as_deref(),
        Some("admin")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sign_up_while_signed_in_cannot_claim_another_address(db: PgPool) {
    let mut config = Config::for_tests("");
    config.admin_email = Some("admin@example.org".to_owned());
    let app = TestApp::with_config(db.clone(), config);
    disable_starter_products(&db).await;
    let attacker_session = app.sign_up("attacker@example.org").await;
    let (attacker, ..) = app.user("attacker@example.org").await;

    // Signed in, the attacker registers the admin address; the code goes to its owner
    let reply = app
        .post(
            "/api/auth/password",
            json!({ "flow": "signUp", "email": "admin@example.org", "password": "geheim123" }),
            Some(&attacker_session),
        )
        .await;
    assert_eq!(reply.body, json!({ "signingIn": false }));
    let owner: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM auth_accounts WHERE provider = 'password' AND provider_account_id = $1",
    )
    .bind("admin@example.org")
    .fetch_one(&db)
    .await
    .unwrap();
    assert_ne!(owner, attacker);

    // The owner resets the password with the code: they become admin, not the attacker
    app.password(json!({ "flow": "reset", "email": "admin@example.org" }))
        .await;
    let code = app.last_code().await;
    let done = app
        .password(json!({ "flow": "reset-verification", "email": "admin@example.org", "code": code, "newPassword": "neuesPasswort" }))
        .await;
    assert_eq!(done.body, json!({ "signingIn": true }));
    let me = app.get("/api/auth/session", done.session.as_deref()).await;
    assert_eq!(me.body, json!({ "userId": owner }));
    assert_eq!(
        app.user("admin@example.org").await.2.as_deref(),
        Some("admin")
    );
    assert_eq!(
        app.user("attacker@example.org").await.2.as_deref(),
        Some("user")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn e2e_mode_stores_codes_instead_of_mailing_them(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let disabled = app
        .get("/api/auth/e2e-code?email=e2e@example.org", None)
        .await;
    assert_eq!(disabled.status, StatusCode::FORBIDDEN);

    let mut conn = db.acquire().await.unwrap();
    flags::set(&mut conn, flags::E2E_AUTH_SKIP_EMAIL, true)
        .await
        .unwrap();
    app.password(json!({ "flow": "signUp", "email": "e2e@example.org", "password": "geheim123" }))
        .await;
    app.run_jobs().await;
    assert!(app.sent.lock().unwrap().is_empty());

    let code = app
        .get("/api/auth/e2e-code?email=e2e@example.org", None)
        .await;
    let reply = app
        .password(json!({ "flow": "email-verification", "email": "e2e@example.org", "code": code.body["code"] }))
        .await;
    assert_eq!(reply.body, json!({ "signingIn": true }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_session_check_renews_the_cookie(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let session = app.sign_up("erika@example.org").await;
    // The browser counts the 30 days from the last renewal, like the server
    let me = app.get("/api/auth/session", Some(&session)).await;
    assert_eq!(me.session.as_deref(), Some(session.as_str()));
    let anonymous = app.get("/api/auth/session", None).await;
    assert_eq!(anonymous.session, None);
    let unknown = app.get("/api/auth/session", Some("unbekannt")).await;
    assert_eq!(unknown.session, None);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sign_out_ends_the_session(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let session = app.sign_up("erika@example.org").await;
    let reply = app
        .post("/api/auth/signout", json!({}), Some(&session))
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    let me = app.get("/api/auth/session", Some(&session)).await;
    assert_eq!(me.body, json!({ "userId": null }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn providers_lists_configured_oauth_only(db: PgPool) {
    let mut config = Config::for_tests("");
    config.github = Some(bazarpro_backend::config::OAuthCredentials {
        client_id: "id".into(),
        client_secret: "secret".into(),
    });
    let app = TestApp::with_config(db, config);
    let query = app.query("authProviders.configured", json!({}), None).await;
    assert_eq!(
        query.body["value"],
        json!({ "google": false, "github": true })
    );
    let reply = app.get("/api/auth/providers", None).await;
    assert_eq!(reply.body, json!({ "google": false, "github": true }));

    let start = app
        .get("/api/auth/oauth/github?redirectTo=/events", None)
        .await;
    assert_eq!(start.status, StatusCode::SEE_OTHER);
    let location = start.location.unwrap();
    assert!(location.starts_with("https://github.com/login/oauth/authorize?"));
    assert!(location.contains(
        "redirect_uri=https%3A%2F%2Fbazarpro.test%2Fapi%2Fauth%2Foauth%2Fgithub%2Fcallback"
    ));
    assert_eq!(
        app.get("/api/auth/oauth/google", None).await.status,
        StatusCode::NOT_FOUND
    );

    // Without the state cookie of the start the callback is refused
    let forged = app
        .get("/api/auth/oauth/github/callback?code=x&state=y", None)
        .await;
    assert_eq!(
        forged.location.as_deref(),
        Some("https://bazarpro.test/login?error=OAUTH_FAILED")
    );
}

fn identity(account_id: &str, email: &str, email_verified: bool) -> Identity {
    Identity {
        account_id: account_id.to_owned(),
        profile: Profile {
            email: Some(email.to_owned()),
            name: Some("Erika".to_owned()),
            image: None,
            locale: None,
            email_verified,
        },
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn oauth_links_to_the_user_with_the_verified_address(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    let (user_id, ..) = app.user("erika@example.org").await;

    oauth::sign_in(
        &app.state,
        Provider::GitHub,
        &identity("42", "erika@example.org", true),
    )
    .await
    .unwrap();
    let linked: Uuid = sqlx::query_scalar(
        "SELECT user_id FROM auth_accounts WHERE provider = 'github' AND provider_account_id = '42'",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(linked, user_id);

    // Signs in again through the link, even with another address at GitHub now
    let token = oauth::sign_in(
        &app.state,
        Provider::GitHub,
        &identity("42", "neu@example.org", false),
    )
    .await
    .unwrap();
    let me = app.get("/api/auth/session", Some(&token)).await;
    assert_eq!(me.body, json!({ "userId": user_id }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn oauth_with_unverified_address_cannot_take_over_an_account(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    let err = oauth::sign_in(
        &app.state,
        Provider::Google,
        &identity("g-1", "erika@example.org", false),
    )
    .await
    .unwrap_err();
    assert_eq!(err.code(), Some("EMAIL_NOT_VERIFIED"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn oauth_creates_confirmed_users(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    oauth::sign_in(
        &app.state,
        Provider::Google,
        &identity("g-1", "neu@example.org", true),
    )
    .await
    .unwrap();
    let (_, confirmed, role, _) = app.user("neu@example.org").await;
    assert_eq!((confirmed, role.as_deref()), (Some(true), Some("user")));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn with_login_disabled_nobody_can_sign_in(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let session = app.sign_up("erika@example.org").await;
    let mut conn = db.acquire().await.unwrap();
    flags::set(&mut conn, flags::LOGIN_ENABLED, false)
        .await
        .unwrap();

    let password = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(password.status, StatusCode::FORBIDDEN);
    assert_eq!(password.body["code"], "LOGIN_DISABLED");
    assert!(password.session.is_none());
    // Wrong passwords are refused the same way and do not count as attempts
    let wrong = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "falsch123" }),
        )
        .await;
    assert_eq!(wrong.body["code"], "LOGIN_DISABLED");
    let limits: i64 = sqlx::query_scalar("SELECT count(*) FROM auth_rate_limits")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(limits, 0);

    let reset = app
        .password(json!({ "flow": "reset", "email": "erika@example.org" }))
        .await;
    assert_eq!(reset.body["code"], "LOGIN_DISABLED");
    let oauth = oauth::sign_in(
        &app.state,
        Provider::GitHub,
        &identity("42", "erika@example.org", true),
    )
    .await
    .unwrap_err();
    assert_eq!(oauth.code(), Some("LOGIN_DISABLED"));

    // Sessions from before stay valid; switched on again, sign-in works
    let me = app.get("/api/auth/session", Some(&session)).await;
    assert_ne!(me.body, json!({ "userId": null }));
    flags::set(&mut conn, flags::LOGIN_ENABLED, true)
        .await
        .unwrap();
    let ok = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(ok.body, json!({ "signingIn": true }));
}
