//! Legal pages and the contact form.

use crate::common;

use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn setup(db: &PgPool) -> (TestApp, String, String) {
    disable_starter_products(db).await;
    let app = TestApp::new(db.clone());
    let admin = app.user_session("admin@example.org", true).await;
    let user = app.user_session("user@example.org", false).await;
    (app, admin, user)
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn nothing_saved_yet_returns_null(db: PgPool) {
    let (app, ..) = setup(&db).await;
    let reply = app
        .query("sitePages.get", json!({ "slug": "imprint" }), None)
        .await;
    assert_eq!(reply.body["value"], Value::Null);
    let unknown = app
        .query("sitePages.get", json!({ "slug": "faq" }), None)
        .await;
    assert_eq!(unknown.body["code"], "INVALID_ARGUMENTS");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_admins_save_and_every_change_is_a_new_version(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    let page =
        json!({ "slug": "imprint", "title": "Impressum", "markdown": "## Angaben\n\nVerein" });
    assert_eq!(
        app.mutation("sitePages.save", page.clone(), Some(&user))
            .await
            .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.mutation("sitePages.save", page.clone(), None)
            .await
            .body["code"],
        "auth.required"
    );

    assert_eq!(
        app.mutation("sitePages.save", page.clone(), Some(&admin))
            .await
            .body["value"],
        1
    );
    assert_eq!(
        app.mutation("sitePages.save", page.clone(), Some(&admin))
            .await
            .body["value"],
        1
    );
    let changed =
        json!({ "slug": "imprint", "title": "Impressum", "markdown": "## Angaben\n\nNeu" });
    assert_eq!(
        app.mutation("sitePages.save", changed, Some(&admin))
            .await
            .body["value"],
        2
    );

    let current = app
        .query("sitePages.get", json!({ "slug": "imprint" }), None)
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (
            current["title"].clone(),
            current["markdown"].clone(),
            current["version"].clone()
        ),
        (json!("Impressum"), json!("## Angaben\n\nNeu"), json!(2))
    );
    assert!(current["updatedAt"].is_f64());
    let versions: Vec<(String, i32, String)> = sqlx::query_as(
        "SELECT slug::text, version, markdown FROM site_page_versions ORDER BY version",
    )
    .fetch_all(&db)
    .await
    .unwrap();
    assert_eq!(
        versions,
        vec![
            ("imprint".to_owned(), 1, "## Angaben\n\nVerein".to_owned()),
            ("imprint".to_owned(), 2, "## Angaben\n\nNeu".to_owned()),
        ]
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn rejects_empty_text_and_too_short_titles(db: PgPool) {
    let (app, admin, _) = setup(&db).await;
    let empty = app
        .mutation(
            "sitePages.save",
            json!({ "slug": "terms", "title": "AGB", "markdown": "   " }),
            Some(&admin),
        )
        .await;
    assert!(
        empty.body["message"]
            .as_str()
            .unwrap()
            .contains("nicht leer")
    );
    let short = app
        .mutation(
            "sitePages.save",
            json!({ "slug": "terms", "title": "A", "markdown": "Text" }),
            Some(&admin),
        )
        .await;
    assert!(short.body["message"].as_str().unwrap().contains("Titel"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_admin_list_flags_missing_pages_and_placeholders(db: PgPool) {
    let (app, admin, user) = setup(&db).await;
    app.mutation("sitePages.save", json!({ "slug": "imprint", "title": "Impressum", "markdown": "Verein: [[Name des Vereins]]" }), Some(&admin)).await;
    app.mutation("sitePages.save", json!({ "slug": "terms", "title": "AGB", "markdown": "Fertig, mit [Link](https://example.org)" }), Some(&admin)).await;
    let list = app
        .query("sitePages.listForAdmin", json!({}), Some(&admin))
        .await
        .body["value"]
        .clone();
    let summary: Vec<Value> = list
        .as_array()
        .unwrap()
        .iter()
        .map(|page| {
            json!([
                page["slug"],
                page.get("version").cloned().unwrap_or(Value::Null),
                page["hasPlaceholders"]
            ])
        })
        .collect();
    assert_eq!(
        summary,
        vec![
            json!(["imprint", 1, true]),
            json!(["privacy", null, false]),
            json!(["terms", 1, false])
        ]
    );
    assert_eq!(list[0]["updatedByName"], "Erika");
    assert_eq!(
        app.query("sitePages.listForAdmin", json!({}), Some(&user))
            .await
            .body["code"],
        "auth.forbidden"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn contact_messages_need_the_privacy_consent(db: PgPool) {
    let (app, ..) = setup(&db).await;
    let message = |accepted: bool| json!({ "name": "Max", "email": "max@example.org", "message": "Hallo", "acceptedPrivacyPolicy": accepted });
    let refused = app
        .mutation("messages.sendMessage", message(false), None)
        .await;
    assert_eq!(refused.body["code"], "account.privacyRequired");
    let sent = app
        .mutation("messages.sendMessage", message(true), None)
        .await;
    assert!(sent.body["value"].is_string());
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM contact_messages")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(count, 1);
}
