//! Sign-in of the mobile app: bearer token instead of cookie, CORS, OAuth via deep link.

mod common;

use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use bazarpro_backend::auth::oauth::{self, Identity, Provider};
use bazarpro_backend::auth::users::Profile;
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

fn with_bearer(path: &str, token: &str) -> Request<Body> {
    Request::get(path)
        .header(header::AUTHORIZATION, format!("Bearer {token}"))
        .body(Body::empty())
        .unwrap()
}

async fn app_sign_in(app: &TestApp, email: &str, password: &str) -> common::Reply {
    app.request(
        Request::post("/api/auth/password")
            .header(header::CONTENT_TYPE, "application/json")
            .header("x-bazarpro-client", "app")
            .body(Body::from(
                json!({ "flow": "signIn", "email": email, "password": password }).to_string(),
            ))
            .unwrap(),
    )
    .await
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_app_gets_the_token_in_the_body_and_signs_in_with_it(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    let (user_id, ..) = app.user("erika@example.org").await;

    let reply = app_sign_in(&app, "erika@example.org", "geheim123").await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body["signingIn"], true);
    assert!(reply.session.is_none(), "no cookie for the app");
    let token = reply.body["token"].as_str().unwrap().to_owned();

    let me = app.request(with_bearer("/api/auth/session", &token)).await;
    assert_eq!(me.body, json!({ "userId": user_id }));

    let signed_out = app
        .request(
            Request::post("/api/auth/signout")
                .header(header::AUTHORIZATION, format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await;
    assert_eq!(signed_out.status, StatusCode::NO_CONTENT);
    let me = app.request(with_bearer("/api/auth/session", &token)).await;
    assert_eq!(me.body, json!({ "userId": Value::Null }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_web_sign_in_keeps_the_token_out_of_the_body(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    app.sign_up("erika@example.org").await;
    let reply = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(reply.body, json!({ "signingIn": true }));
    assert!(reply.session.is_some());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn cors_allows_only_the_app_origins(db: PgPool) {
    let app = TestApp::new(db);
    let preflight = |origin: &'static str| {
        Request::options("/api/query/events.get")
            .header(header::ORIGIN, origin)
            .header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
            .header(
                header::ACCESS_CONTROL_REQUEST_HEADERS,
                "authorization,content-type",
            )
            .body(Body::empty())
            .unwrap()
    };
    for origin in ["capacitor://localhost", "https://localhost"] {
        let reply = app.request(preflight(origin)).await;
        assert_eq!(
            reply.headers[header::ACCESS_CONTROL_ALLOW_ORIGIN],
            origin,
            "{origin}"
        );
        assert!(
            !reply
                .headers
                .contains_key(header::ACCESS_CONTROL_ALLOW_CREDENTIALS)
        );
    }
    let other = app.request(preflight("https://evil.example")).await;
    assert!(
        !other
            .headers
            .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN)
    );
}

fn identity(email: &str) -> Identity {
    Identity {
        account_id: "g-1".to_owned(),
        profile: Profile {
            email: Some(email.to_owned()),
            name: Some("Erika".to_owned()),
            image: None,
            locale: None,
            email_verified: true,
        },
    }
}

fn challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

async fn exchange(app: &TestApp, code: &str, verifier: &str) -> common::Reply {
    app.post(
        "/api/auth/app-exchange",
        json!({ "code": code, "verifier": verifier }),
        None,
    )
    .await
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_oauth_code_of_the_app_needs_the_verifier_and_works_once(db: PgPool) {
    let app = TestApp::new(db.clone());
    disable_starter_products(&db).await;
    let verifier = "ein-geheimer-verifier-der-app-mit-genug-zeichen";
    let code = oauth::app_sign_in(
        &app.state,
        Provider::Google,
        &identity("neu@example.org"),
        &challenge(verifier),
    )
    .await
    .unwrap();
    let (user_id, ..) = app.user("neu@example.org").await;

    let wrong = exchange(&app, &code, "falscher-verifier").await;
    assert_eq!(wrong.body["code"], "OAUTH_FAILED");
    // A wrong verifier used the code up, so a stolen code cannot be retried
    let again = exchange(&app, &code, verifier).await;
    assert_eq!(again.body["code"], "OAUTH_FAILED");

    let code = oauth::app_sign_in(
        &app.state,
        Provider::Google,
        &identity("neu@example.org"),
        &challenge(verifier),
    )
    .await
    .unwrap();
    let reply = exchange(&app, &code, verifier).await;
    assert_eq!(reply.status, StatusCode::OK);
    let token = reply.body["token"].as_str().unwrap();
    let me = app.request(with_bearer("/api/auth/session", token)).await;
    assert_eq!(me.body, json!({ "userId": user_id }));
    assert_eq!(
        exchange(&app, &code, verifier).await.body["code"],
        "OAUTH_FAILED"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_oauth_start_rejects_malformed_challenges(db: PgPool) {
    let mut config = bazarpro_backend::Config::for_tests("");
    config.google = Some(bazarpro_backend::config::OAuthCredentials {
        client_id: "id".to_owned(),
        client_secret: "secret".to_owned(),
    });
    let app = TestApp::with_config(db, config);
    let bad = app.get("/api/auth/oauth/google?challenge=kurz", None).await;
    assert_eq!(bad.status, StatusCode::BAD_REQUEST);
    let good = app
        .get(
            &format!("/api/auth/oauth/google?challenge={}", challenge("v")),
            None,
        )
        .await;
    assert_eq!(good.status, StatusCode::SEE_OTHER);
    assert!(
        good.location
            .unwrap()
            .starts_with("https://accounts.google.com/")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_instance_tells_the_app_its_api_version(db: PgPool) {
    let app = TestApp::new(db);
    let config = app.query("instance.getConfig", json!({}), None).await;
    assert_eq!(config.body["value"]["appApi"], 1);
}
