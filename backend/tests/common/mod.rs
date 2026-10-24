//! Test app with an in-memory mailer and file store; requests go through the router.
#![allow(dead_code)]

pub mod desk;
pub mod fixtures;

use std::sync::{Arc, Mutex};

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use bazarpro_backend::mail::{Mail, Mailer};
use bazarpro_backend::{AppState, Config, app, flags, job_registry, jobs, storage};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;
use uuid::Uuid;

pub struct TestApp {
    pub state: AppState,
    pub router: Router,
    pub sent: Arc<Mutex<Vec<Mail>>>,
}

pub struct Reply {
    pub status: StatusCode,
    pub body: Value,
    /// Value of the session cookie, if the response set one
    pub session: Option<String>,
    pub location: Option<String>,
    pub headers: axum::http::HeaderMap,
    pub bytes: Vec<u8>,
}

impl TestApp {
    pub fn new(db: PgPool) -> Self {
        Self::with_config(db, Config::for_tests(""))
    }

    pub fn with_config(db: PgPool, config: Config) -> Self {
        // Errors behind a 500 show up in the output of a failing test
        let _ = tracing_subscriber::fmt()
            .with_test_writer()
            .with_env_filter("bazarpro_backend=warn")
            .try_init();
        let (mailer, sent) = Mailer::memory();
        let state = AppState::new(db, config, mailer, storage::in_memory());
        Self {
            router: app(state.clone()),
            state,
            sent,
        }
    }

    pub async fn request(&self, request: Request<Body>) -> Reply {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let status = response.status();
        let session = response
            .headers()
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok())
            .find_map(|value| value.strip_prefix("bazarpro_session="))
            .map(|value| value.split(';').next().unwrap().to_owned());
        let location = response
            .headers()
            .get(header::LOCATION)
            .map(|value| value.to_str().unwrap().to_owned());
        let headers = response.headers().clone();
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        Reply {
            status,
            body,
            session,
            location,
            headers,
            bytes: bytes.to_vec(),
        }
    }

    pub async fn post(&self, path: &str, body: Value, session: Option<&str>) -> Reply {
        let mut request = Request::post(path).header(header::CONTENT_TYPE, "application/json");
        if let Some(token) = session {
            request = request.header(header::COOKIE, format!("bazarpro_session={token}"));
        }
        self.request(request.body(Body::from(body.to_string())).unwrap())
            .await
    }

    /// A file upload as the app sends it: the raw bytes with the browser's content type.
    pub async fn upload(&self, bytes: Vec<u8>, content_type: &str, session: Option<&str>) -> Reply {
        let mut request = Request::post("/api/files").header(header::CONTENT_TYPE, content_type);
        if let Some(token) = session {
            request = request.header(header::COOKIE, format!("bazarpro_session={token}"));
        }
        self.request(request.body(Body::from(bytes)).unwrap()).await
    }

    pub async fn get(&self, path: &str, session: Option<&str>) -> Reply {
        let mut request = Request::get(path);
        if let Some(token) = session {
            request = request.header(header::COOKIE, format!("bazarpro_session={token}"));
        }
        self.request(request.body(Body::empty()).unwrap()).await
    }

    /// `useQuery(api.<name>, args)`
    pub async fn query(&self, name: &str, args: Value, session: Option<&str>) -> Reply {
        self.post(&format!("/api/query/{name}"), args, session)
            .await
    }

    /// `useMutation(api.<name>)(args)`
    pub async fn mutation(&self, name: &str, args: Value, session: Option<&str>) -> Reply {
        self.post(&format!("/api/mutation/{name}"), args, session)
            .await
    }

    /// Signs up and confirms a user; with `admin` it becomes platform administrator.
    pub async fn user_session(&self, email: &str, admin: bool) -> String {
        let session = self.sign_up(email).await;
        if admin {
            sqlx::query("UPDATE users SET system_role = 'admin' WHERE email = $1")
                .bind(email)
                .execute(&self.state.db)
                .await
                .unwrap();
        }
        session
    }

    pub async fn password(&self, body: Value) -> Reply {
        self.post("/api/auth/password", body, None).await
    }

    /// Runs the queued jobs (mails) like the worker would.
    pub async fn run_jobs(&self) {
        let registry = job_registry();
        while jobs::run_next(&self.state, &registry).await.unwrap() {}
    }

    /// Sends the queued mails and returns the code of the last one.
    pub async fn last_code(&self) -> String {
        self.run_jobs().await;
        let sent = self.sent.lock().unwrap();
        let html = &sent.last().expect("no mail sent").html;
        let start = html.find(r#"class="code-container">"#).unwrap() + 23;
        html[start..start + 6].to_owned()
    }

    pub async fn sign_up(&self, email: &str) -> String {
        let reply = self
            .password(json!({
                "flow": "signUp", "email": email, "password": "geheim123",
                "name": "Erika", "locale": "en", "redirectTo": "/register"
            }))
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        assert_eq!(reply.body, json!({ "signingIn": false }));
        let code = self.last_code().await;
        let verified = self
            .password(json!({ "flow": "email-verification", "email": email, "code": code }))
            .await;
        assert_eq!(verified.body, json!({ "signingIn": true }));
        verified.session.expect("session cookie")
    }

    pub async fn user(&self, email: &str) -> (Uuid, Option<bool>, Option<String>, Option<String>) {
        sqlx::query_as(
            "SELECT id, is_mail_confirmed, system_role::text, locale::text FROM users WHERE email = $1",
        )
        .bind(email)
        .fetch_one(&self.state.db)
        .await
        .unwrap()
    }
}

/// Excludes the jobs a sign-up schedules besides mails (starter products, not ported yet).
pub async fn disable_starter_products(db: &PgPool) {
    let mut conn = db.acquire().await.unwrap();
    flags::set(&mut conn, flags::CREATE_PRODUCTS_ON_SIGNUP, false)
        .await
        .unwrap();
}
