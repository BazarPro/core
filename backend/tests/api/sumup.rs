//! SumUp connected with OAuth (#155): the organizer connects once, the desks of the team
//! get access tokens from the backend. SumUp itself is a local stand-in.

use crate::common;

use std::sync::{Arc, Mutex};

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode, header};
use axum::routing::{get, post};
use axum::{Form, Json, Router};
use bazarpro_backend::Config;
use bazarpro_backend::config::OAuthCredentials;
use common::fixtures::{self, EventSpec};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

#[derive(Default)]
struct SumUp {
    /// Refresh tokens the backend sent, in order
    refreshed_with: Vec<String>,
    /// Answers refreshes with invalid_grant, as after the merchant revoked the access
    refuse: bool,
    /// Lifetime of the access tokens it hands out
    expires_in: i64,
}

type Shared = Arc<Mutex<SumUp>>;

async fn token(
    State(sumup): State<Shared>,
    Form(form): Form<HashMap<String, String>>,
) -> axum::response::Response {
    use axum::response::IntoResponse;
    let mut sumup = sumup.lock().unwrap();
    assert_eq!(form["client_id"], "client");
    assert_eq!(form["client_secret"], "secret");
    match form["grant_type"].as_str() {
        "authorization_code" if form["code"] == "good" => {
            assert_eq!(
                form["redirect_uri"],
                "https://bazarpro.test/api/sumup/callback"
            );
            Json(json!({
                "access_token": "at_0", "refresh_token": "rt_0",
                "expires_in": sumup.expires_in, "token_type": "Bearer"
            }))
            .into_response()
        }
        "refresh_token" if !sumup.refuse => {
            sumup.refreshed_with.push(form["refresh_token"].clone());
            let n = sumup.refreshed_with.len();
            Json(json!({
                "access_token": format!("at_{n}"), "refresh_token": format!("rt_{n}"),
                "expires_in": 3600, "token_type": "Bearer"
            }))
            .into_response()
        }
        _ => (
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "invalid_grant" })),
        )
            .into_response(),
    }
}

async fn me() -> Json<Value> {
    Json(json!({ "merchant_profile": { "merchant_code": "MCODE42" } }))
}

/// An event that takes cards, its organizer, a helper at the desk and SumUp.
struct Setup {
    app: TestApp,
    db: PgPool,
    sumup: Shared,
    event: Uuid,
    organizer: Uuid,
    helper: Uuid,
    as_organizer: String,
    as_helper: String,
}

impl Setup {
    async fn new(db: PgPool) -> Self {
        let sumup: Shared = Arc::new(Mutex::new(SumUp {
            expires_in: 3600,
            ..SumUp::default()
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = Router::new()
            .route("/token", post(token))
            .route("/v0.1/me", get(me))
            .with_state(sumup.clone());
        tokio::spawn(async move { axum::serve(listener, server).await.unwrap() });

        let mut config = Config::for_tests("");
        config.sumup = Some(OAuthCredentials {
            client_id: "client".to_owned(),
            client_secret: "secret".to_owned(),
        });
        config.sumup_api_url = format!("http://{address}");
        let app = TestApp::with_config(db.clone(), config);

        let organizer = fixtures::user(&db, "Orga").await;
        let helper = fixtures::user(&db, "Helfer").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                features: json!({ "cardPayments": true }),
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        fixtures::role(&db, event, helper, "coorganizer").await;
        Self {
            as_organizer: fixtures::session(&db, organizer).await,
            as_helper: fixtures::session(&db, helper).await,
            app,
            db,
            sumup,
            event,
            organizer,
            helper,
        }
    }

    /// The organizer's way through SumUp: link, start, SumUp's answer. Returns the redirect.
    async fn connect(&self, args: Value, code: &str) -> Reply {
        let link = self
            .app
            .mutation("sumup.startConnect", args, Some(&self.as_organizer))
            .await;
        assert_eq!(link.status, StatusCode::OK, "{}", link.body);
        let url = link.body["value"]["url"].as_str().unwrap();
        let path = url.strip_prefix("https://bazarpro.test").unwrap();
        let start = self.app.get(path, None).await;
        assert_eq!(start.status, StatusCode::SEE_OTHER);
        let to_sumup = start.location.clone().unwrap();
        assert!(to_sumup.contains("/authorize?response_type=code&client_id=client"));
        assert!(to_sumup.contains("scope=payments%20user.profile_readonly"));
        let state = to_sumup.split("state=").nth(1).unwrap();
        let cookie = start
            .headers
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .find(|value| value.starts_with("bazarpro_sumup="))
            .map(|value| value.split(';').next().unwrap().to_owned())
            .unwrap();
        self.app
            .request(
                Request::get(format!("/api/sumup/callback?code={code}&state={state}"))
                    .header(header::COOKIE, cookie)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
    }

    async fn token(&self, session: &str) -> Reply {
        self.app
            .post(
                "/api/sumup/token",
                json!({ "eventId": self.event }),
                Some(session),
            )
            .await
    }

    async fn connection(&self, args: Value, session: &str) -> Value {
        let reply = self
            .app
            .query("sumup.getConnection", args, Some(session))
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        reply.body["value"].clone()
    }

    async fn expire_access_token(&self) {
        sqlx::query("UPDATE sumup_connections SET access_expires_at = now() + interval '1 minute'")
            .execute(&self.db)
            .await
            .unwrap();
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_connects_sumup_and_the_helper_s_desk_gets_its_token(db: PgPool) {
    let setup = Setup::new(db.clone()).await;
    let before = setup
        .connection(json!({ "eventId": setup.event }), &setup.as_helper)
        .await;
    assert_eq!(
        before,
        json!({ "oauth": true, "connected": false, "mine": false })
    );
    let refused = setup.token(&setup.as_helper).await;
    assert_eq!(refused.status, StatusCode::NOT_FOUND);
    assert_eq!(refused.body["code"], "sumup.notConnected");

    let done = setup
        .connect(json!({ "redirectTo": "/organizer/events/x?tab=1" }), "good")
        .await;
    assert_eq!(
        done.location.as_deref(),
        Some("https://bazarpro.test/organizer/events/x?tab=1&sumup=connected")
    );
    let own = setup.connection(json!({}), &setup.as_organizer).await;
    assert_eq!(own["connected"], true);
    assert_eq!(own["merchantCode"], "MCODE42");
    assert_eq!(own["mine"], true);

    // Stored encrypted
    let (refresh, access): (Vec<u8>, Vec<u8>) = sqlx::query_as(
        "SELECT refresh_token, access_token FROM sumup_connections WHERE user_id = $1",
    )
    .bind(setup.organizer)
    .fetch_one(&db)
    .await
    .unwrap();
    for sealed in [refresh, access] {
        assert!(!String::from_utf8_lossy(&sealed).contains("t_0"));
    }

    let at_desk = setup
        .connection(json!({ "eventId": setup.event }), &setup.as_helper)
        .await;
    assert_eq!(at_desk["connected"], true);
    assert_eq!(at_desk["merchantCode"], "MCODE42");
    assert_eq!(at_desk["mine"], false);

    // The token from the connection while it lasts, no call to SumUp
    let first = setup.token(&setup.as_helper).await;
    assert_eq!(first.status, StatusCode::OK, "{}", first.body);
    assert_eq!(first.body["accessToken"], "at_0");
    assert_eq!(first.body["merchantCode"], "MCODE42");
    assert!(
        first.body["expiresAt"].as_f64().unwrap() > chrono::Utc::now().timestamp_millis() as f64
    );
    assert!(setup.sumup.lock().unwrap().refreshed_with.is_empty());

    // About to expire: refreshed once, and the next refresh uses SumUp's new refresh token
    setup.expire_access_token().await;
    assert_eq!(
        setup.token(&setup.as_helper).await.body["accessToken"],
        "at_1"
    );
    assert_eq!(
        setup.token(&setup.as_organizer).await.body["accessToken"],
        "at_1"
    );
    setup.expire_access_token().await;
    assert_eq!(
        setup.token(&setup.as_helper).await.body["accessToken"],
        "at_2"
    );
    assert_eq!(setup.sumup.lock().unwrap().refreshed_with, ["rt_0", "rt_1"]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_app_comes_back_by_deep_link(db: PgPool) {
    let setup = Setup::new(db).await;
    let done = setup.connect(json!({ "app": true }), "good").await;
    assert_eq!(
        done.location.as_deref(),
        Some("bazarpro://sumup?result=connected")
    );
    let declined = setup.connect(json!({ "app": true }), "bad").await;
    assert_eq!(
        declined.location.as_deref(),
        Some("bazarpro://sumup?error=sumup.failed")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn an_answer_needs_the_browser_and_the_flow_that_started_it(db: PgPool) {
    let setup = Setup::new(db.clone()).await;
    let link = setup
        .app
        .mutation("sumup.startConnect", json!({}), Some(&setup.as_organizer))
        .await;
    let url = link.body["value"]["url"].as_str().unwrap();
    let state = url.split("state=").nth(1).unwrap();

    // Without the cookie of the start, e.g. a link someone else sent
    let foreign = setup
        .app
        .get(
            &format!("/api/sumup/callback?code=good&state={state}"),
            None,
        )
        .await;
    assert_eq!(
        foreign.location.as_deref(),
        Some("https://bazarpro.test/?sumup=sumup.failed")
    );
    let unknown = setup.app.get("/api/sumup/start?state=unknown", None).await;
    assert_eq!(
        unknown.location.as_deref(),
        Some("https://bazarpro.test/?sumup=sumup.expired")
    );
    let connections: i64 = sqlx::query_scalar("SELECT count(*) FROM sumup_connections")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(connections, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_desks_that_may_sell_cards_get_a_token(db: PgPool) {
    let setup = Setup::new(db.clone()).await;
    setup.connect(json!({}), "good").await;

    let outsider = fixtures::user(&db, "Fremd").await;
    let as_outsider = fixtures::session(&db, outsider).await;
    assert_eq!(
        setup.token(&as_outsider).await.status,
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        setup
            .app
            .post("/api/sumup/token", json!({ "eventId": setup.event }), None)
            .await
            .status,
        StatusCode::UNAUTHORIZED
    );

    let reply = setup
        .app
        .mutation(
            "eventRoles.setHelperPermissions",
            json!({ "eventId": setup.event, "userId": setup.helper, "permissions": ["intake"] }),
            Some(&setup.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let helper = setup.token(&setup.as_helper).await;
    assert_eq!(helper.status, StatusCode::FORBIDDEN);
    assert_eq!(helper.body["code"], "helper.sale");

    sqlx::query("UPDATE events SET features = '{}' WHERE id = $1")
        .bind(setup.event)
        .execute(&db)
        .await
        .unwrap();
    let organizer = setup.token(&setup.as_organizer).await;
    assert_eq!(organizer.status, StatusCode::FORBIDDEN);
    assert_eq!(organizer.body["code"], "sumup.cardPaymentsOff");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_revoked_access_or_disconnecting_ends_the_connection(db: PgPool) {
    let setup = Setup::new(db.clone()).await;
    setup.connect(json!({}), "good").await;
    setup.expire_access_token().await;
    setup.sumup.lock().unwrap().refuse = true;
    let revoked = setup.token(&setup.as_helper).await;
    assert_eq!(revoked.status, StatusCode::NOT_FOUND);
    assert_eq!(revoked.body["code"], "sumup.notConnected");
    assert_eq!(
        setup.connection(json!({}), &setup.as_organizer).await["connected"],
        false
    );

    setup.sumup.lock().unwrap().refuse = false;
    setup.connect(json!({}), "good").await;
    let reply = setup
        .app
        .mutation("sumup.disconnect", json!({}), Some(&setup.as_organizer))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(
        setup.token(&setup.as_helper).await.body["code"],
        "sumup.notConnected"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn without_sumup_credentials_each_device_logs_in_itself(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let session = fixtures::session(&db, organizer).await;
    let connection = app
        .query("sumup.getConnection", json!({}), Some(&session))
        .await;
    assert_eq!(
        connection.body["value"],
        json!({ "oauth": false, "connected": false, "mine": true })
    );
    let start = app
        .mutation("sumup.startConnect", json!({}), Some(&session))
        .await;
    assert_eq!(start.status, StatusCode::NOT_FOUND);
    assert_eq!(start.body["code"], "sumup.notConfigured");
}
