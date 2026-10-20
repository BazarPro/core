//! Instance settings, start page and organizer access (convex/tests/instance.test.ts,
//! singleMode.test.ts).

mod common;

use axum::http::StatusCode;
use bazarpro_backend::Config;
use bazarpro_backend::config::InstanceMode;
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-logo";

async fn setup(db: &PgPool, mode: InstanceMode) -> (TestApp, String, String) {
    disable_starter_products(db).await;
    let mut config = Config::for_tests("");
    config.mode = mode;
    let app = TestApp::with_config(db.clone(), config);
    let admin = app.user_session("admin@example.org", true).await;
    let user = app.user_session("user@example.org", false).await;
    (app, admin, user)
}

async fn upload(app: &TestApp, session: &str) -> String {
    let reply = app.upload(PNG.to_vec(), "image/png", Some(session)).await;
    reply.body["storageId"].as_str().unwrap().to_owned()
}

async fn config(app: &TestApp) -> Value {
    app.query("instance.getConfig", json!({}), None).await.body["value"].clone()
}

async fn file_exists(app: &TestApp, id: &str) -> bool {
    app.run_jobs().await;
    app.get(&format!("/api/files/{id}"), None).await.status == StatusCode::OK
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_admins_change_name_contact_and_logo(db: PgPool) {
    let (app, admin, user) = setup(&db, InstanceMode::Single).await;
    let forbidden = app
        .mutation(
            "instance.updateSettings",
            json!({ "name": "X" }),
            Some(&user),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
    let bad_mail = app
        .mutation(
            "instance.updateSettings",
            json!({ "contactEmail": "keine-adresse" }),
            Some(&admin),
        )
        .await;
    assert!(
        bad_mail.body["message"]
            .as_str()
            .unwrap()
            .contains("gültige E-Mail")
    );

    let logo = upload(&app, &admin).await;
    let saved = app
        .mutation(
            "instance.updateSettings",
            json!({ "name": "  Kinderbasar Ulm ", "contactEmail": "basar@ulm.de", "logo": logo }),
            Some(&admin),
        )
        .await;
    assert_eq!(saved.status, StatusCode::OK, "{}", saved.body);
    let config = config(&app).await;
    assert_eq!(config["name"], "Kinderbasar Ulm");
    assert_eq!(config["brand"], "Kinderbasar Ulm");
    assert_eq!(config["mode"], "single");
    assert_eq!(config["contactEmail"], "basar@ulm.de");
    assert_eq!(
        config["logoUrl"],
        format!("https://bazarpro.test/api/files/{logo}")
    );

    let unknown = app
        .mutation(
            "instance.updateSettings",
            json!({ "logo": Uuid::new_v4() }),
            Some(&admin),
        )
        .await;
    assert_eq!(unknown.body["code"], "FILE_NOT_FOUND");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn replacing_or_removing_the_logo_deletes_the_old_file(db: PgPool) {
    let (app, admin, _) = setup(&db, InstanceMode::Single).await;
    let first = upload(&app, &admin).await;
    let second = upload(&app, &admin).await;
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar", "logo": first }),
        Some(&admin),
    )
    .await;
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar", "logo": second }),
        Some(&admin),
    )
    .await;
    assert!(!file_exists(&app, &first).await);

    // Saving without logo keeps it
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar 2" }),
        Some(&admin),
    )
    .await;
    assert!(config(&app).await["logoUrl"].is_string());
    assert!(file_exists(&app, &second).await);

    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar 2", "logo": null }),
        Some(&admin),
    )
    .await;
    assert!(!file_exists(&app, &second).await);
    let config = config(&app).await;
    assert_eq!(
        (config["name"].clone(), config["logoUrl"].clone()),
        (json!("Basar 2"), Value::Null)
    );
    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM site_settings")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(rows, 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn analytics_settings_are_validated_and_kept(db: PgPool) {
    let (app, admin, _) = setup(&db, InstanceMode::Single).await;
    let with_scheme = app
        .mutation(
            "instance.updateSettings",
            json!({ "plausible": { "enabled": true, "domain": "https://basar.de", "apiHost": "https://p.example.org" } }),
            Some(&admin),
        )
        .await;
    assert!(
        with_scheme.body["message"]
            .as_str()
            .unwrap()
            .contains("ohne https://")
    );
    let plain_http = app
        .mutation(
            "instance.updateSettings",
            json!({ "plausible": { "enabled": true, "domain": "basar.de", "apiHost": "http://p.example.org" } }),
            Some(&admin),
        )
        .await;
    assert_eq!(plain_http.body["code"], "settings.plausibleHttps");

    app.mutation(
        "instance.updateSettings",
        json!({ "plausible": { "enabled": true, "domain": "Basar.DE", "apiHost": "https://p.example.org/" } }),
        Some(&admin),
    )
    .await;
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar" }),
        Some(&admin),
    )
    .await;
    assert_eq!(
        config(&app).await["plausible"],
        json!({ "enabled": true, "domain": "basar.de", "apiHost": "https://p.example.org" })
    );

    // Empty fields fall back to the server values
    app.mutation(
        "instance.updateSettings",
        json!({ "plausible": { "enabled": false, "domain": "", "apiHost": "" } }),
        Some(&admin),
    )
    .await;
    assert_eq!(config(&app).await["plausible"], json!({ "enabled": false }));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn start_page_defaults_to_overview_and_is_kept(db: PgPool) {
    let (app, admin, _) = setup(&db, InstanceMode::Single).await;
    assert_eq!(config(&app).await["startPage"], "overview");
    app.mutation(
        "instance.updateSettings",
        json!({ "startPage": "currentEvent" }),
        Some(&admin),
    )
    .await;
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Basar" }),
        Some(&admin),
    )
    .await;
    assert_eq!(config(&app).await["startPage"], "currentEvent");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_platform_is_called_bazarpro(db: PgPool) {
    let (app, admin, _) = setup(&db, InstanceMode::Platform).await;
    app.mutation(
        "instance.updateSettings",
        json!({ "name": "Verein" }),
        Some(&admin),
    )
    .await;
    let config = config(&app).await;
    assert_eq!(
        (config["mode"].clone(), config["brand"].clone()),
        (json!("platform"), json!("BazarPro"))
    );
}

async fn insert_event(
    db: &PgPool,
    title: &str,
    start_hours: i64,
    end_hours: i64,
    hidden: bool,
) -> Uuid {
    let organizer: Uuid =
        sqlx::query_scalar("SELECT id FROM users WHERE email = 'admin@example.org'")
            .fetch_one(db)
            .await
            .unwrap();
    sqlx::query_scalar(
        "INSERT INTO events (title, description, location, start_date, end_date, contact_info, visibility,
           commission, organizer_id, hidden_at, hidden_by, hidden_reason)
         VALUES ($1, '', '', now() + make_interval(hours => $2), now() + make_interval(hours => $3), '',
           'public', 10, $4, CASE WHEN $5 THEN now() END, CASE WHEN $5 THEN $4 END, CASE WHEN $5 THEN 'x' END)
         RETURNING id",
    )
    .bind(title)
    .bind(start_hours as i32)
    .bind(end_hours as i32)
    .bind(organizer)
    .bind(hidden)
    .fetch_one(db)
    .await
    .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_start_page_leads_to_the_running_else_the_next_bazaar(db: PgPool) {
    let (app, _, _) = setup(&db, InstanceMode::Single).await;
    let current = || app.query("instance.getCurrentEvent", json!({}), None);
    assert_eq!(current().await.body["value"], Value::Null);

    insert_event(&db, "Vorbei", -48, -24, false).await;
    insert_event(&db, "Übernächster", 72, 80, false).await;
    let next = insert_event(&db, "Nächster", 24, 30, false).await;
    assert_eq!(current().await.body["value"]["_id"], next.to_string());
    assert_eq!(current().await.body["value"]["title"], "Nächster");

    insert_event(&db, "Versteckt läuft", -1, 5, true).await;
    let running = insert_event(&db, "Läuft", -2, 3, false).await;
    let reply = current().await;
    assert_eq!(reply.body["value"]["_id"], running.to_string());
    assert!(reply.body["value"]["startDate"].is_f64());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizer_area_for_admins_and_event_teams_only(db: PgPool) {
    let (app, admin, user) = setup(&db, InstanceMode::Single).await;
    let access = |session: Option<String>| {
        let app = &app;
        async move {
            app.query("instance.getMyAccess", json!({}), session.as_deref())
                .await
                .body["value"]
                .clone()
        }
    };
    let none = json!({ "canOrganize": false, "canCreateEvents": false });
    assert_eq!(access(None).await, none);
    assert_eq!(access(Some(user.clone())).await, none);
    assert_eq!(
        access(Some(admin)).await,
        json!({ "canOrganize": true, "canCreateEvents": true })
    );

    let event = insert_event(&db, "Basar", 24, 30, false).await;
    sqlx::query(
        "INSERT INTO event_roles (event_id, user_id, role)
         SELECT $1, id, 'coorganizer' FROM users WHERE email = 'user@example.org'",
    )
    .bind(event)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        access(Some(user)).await,
        json!({ "canOrganize": true, "canCreateEvents": false })
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn on_the_platform_everybody_signed_in_organizes(db: PgPool) {
    let (app, _, user) = setup(&db, InstanceMode::Platform).await;
    let reply = app
        .query("instance.getMyAccess", json!({}), Some(&user))
        .await;
    assert_eq!(
        reply.body["value"],
        json!({ "canOrganize": true, "canCreateEvents": true })
    );
}
