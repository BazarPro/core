//! The RPC layer with the first modules: categories and feature flags.

use crate::common;

use axum::http::StatusCode;
use bazarpro_backend::import::uuid_for;
use bazarpro_backend::rpc;
use common::{TestApp, disable_starter_products};
use serde_json::{Value, json};
use sqlx::PgPool;

async fn app(db: &PgPool) -> TestApp {
    disable_starter_products(db).await;
    TestApp::new(db.clone())
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_admins_create_categories_and_labels_are_unique(db: PgPool) {
    let app = app(&db).await;
    let user = app.user_session("user@example.org", false).await;
    let admin = app.user_session("admin@example.org", true).await;

    let anonymous = app
        .mutation("categories.createCategory", json!({ "label": "Ski" }), None)
        .await;
    assert_eq!(anonymous.body["code"], "auth.required");
    let forbidden = app
        .mutation(
            "categories.createCategory",
            json!({ "label": "Ski" }),
            Some(&user),
        )
        .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
    assert_eq!(
        forbidden.body["message"],
        "Dafür fehlt dir die Berechtigung."
    );

    let ski = app
        .mutation(
            "categories.createCategory",
            json!({ "label": "Ski" }),
            Some(&admin),
        )
        .await;
    let ski_id = ski.body["value"].as_str().unwrap().to_owned();
    let again = app
        .mutation(
            "categories.createCategory",
            json!({ "label": "Ski" }),
            Some(&admin),
        )
        .await;
    assert_eq!(again.body["value"], ski_id);
    let child = app
        .mutation(
            "categories.createCategory",
            json!({ "label": "Tourenski", "parentCategory": ski_id }),
            Some(&admin),
        )
        .await;
    assert_eq!(child.status, StatusCode::OK);

    let all = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(all.body["topics"], json!(["table:categories"]));
    let list = all.body["value"].as_array().unwrap();
    assert_eq!(list.len(), 2);
    // Document shape: _id, _creationTime in ms, absent fields left out
    assert!(list[0]["_creationTime"].is_f64());
    assert_eq!(list[0]["label"], "Ski");
    assert!(list[0].get("parentCategory").is_none());
    assert_eq!(list[1]["parentCategory"], ski_id);

    let label = app
        .query(
            "categories.getCategoryLabel",
            json!({ "categoryId": ski_id }),
            None,
        )
        .await;
    assert_eq!(label.body["value"], "Ski");
    let id = app
        .query(
            "categories.getCategoryId",
            json!({ "categoryLabel": "Tourenski" }),
            None,
        )
        .await;
    assert_eq!(id.body["value"], child.body["value"]);
    let missing = app
        .query(
            "categories.getCategoryId",
            json!({ "categoryLabel": "Gibt es nicht" }),
            None,
        )
        .await;
    assert_eq!(missing.body["value"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn convex_ids_of_imported_rows_are_accepted(db: PgPool) {
    let app = app(&db).await;
    sqlx::query("INSERT INTO categories (id, legacy_id, label) VALUES ($1, 'kd7abc', 'Fahrräder')")
        .bind(uuid_for("kd7abc"))
        .execute(&db)
        .await
        .unwrap();
    let label = app
        .query(
            "categories.getCategoryLabel",
            json!({ "categoryId": "kd7abc" }),
            None,
        )
        .await;
    assert_eq!(label.body["value"], "Fahrräder");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn arguments_are_checked_against_their_types(db: PgPool) {
    let app = app(&db).await;
    let unknown = app
        .query(
            "categories.getCategoryLabel",
            json!({ "categoryId": "x", "extra": 1 }),
            None,
        )
        .await;
    assert_eq!(unknown.status, StatusCode::BAD_REQUEST);
    assert_eq!(unknown.body["code"], "INVALID_ARGUMENTS");
    let missing = app.query("categories.getCategoryId", json!({}), None).await;
    assert_eq!(missing.body["code"], "INVALID_ARGUMENTS");
    let no_function = app.query("categories.nope", json!({}), None).await;
    assert_eq!(no_function.status, StatusCode::NOT_FOUND);
    // A mutation is not a query
    let wrong_kind = app
        .query("categories.createCategory", json!({ "label": "x" }), None)
        .await;
    assert_eq!(wrong_kind.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn internal_functions_only_run_from_the_cli(db: PgPool) {
    let app = app(&db).await;
    let http = app
        .mutation("categories.seedCategories", json!({}), None)
        .await;
    assert_eq!(http.status, StatusCode::NOT_FOUND);
    let value = rpc::call(&app.state, None, "categories.seedCategories", json!({}))
        .await
        .unwrap();
    assert_eq!(value, "Categories seeded successfully");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn parallel_mutations_are_serialized_and_retried(db: PgPool) {
    let app = app(&db).await;
    // Each run checks for missing labels and inserts them. Without serializable
    // transactions and retries the parallel runs would insert duplicates.
    let runs = (0..5).map(|_| rpc::call(&app.state, None, "categories.seedCategories", json!({})));
    for result in futures::future::join_all(runs).await {
        result.unwrap();
    }
    let (count, distinct): (i64, i64) =
        sqlx::query_as("SELECT count(*), count(DISTINCT label) FROM categories")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!((count, distinct), (11, 11));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_start_of_the_server_only_fills_an_empty_table(db: PgPool) {
    let app = app(&db).await;
    let http = app
        .mutation("categories.seedIfEmpty", json!({}), None)
        .await;
    assert_eq!(http.status, StatusCode::NOT_FOUND);

    let labels = || async {
        sqlx::query_scalar::<_, String>("SELECT label FROM categories")
            .fetch_all(&db)
            .await
            .unwrap()
    };
    let start = || rpc::call(&app.state, None, "categories.seedIfEmpty", json!({}));

    // A new instance gets the defaults, and a second start adds nothing
    start().await.unwrap();
    assert_eq!(labels().await.len(), 11);
    start().await.unwrap();
    assert_eq!(labels().await.len(), 11);

    // An instance with categories of its own does not get the defaults back
    sqlx::query("DELETE FROM categories WHERE label <> 'Kleidung'")
        .execute(&db)
        .await
        .unwrap();
    start().await.unwrap();
    assert_eq!(labels().await, ["Kleidung"]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn admins_rename_and_translate_categories(db: PgPool) {
    let app = app(&db).await;
    let user = app.user_session("user@example.org", false).await;
    let admin = app.user_session("admin@example.org", true).await;
    let create = |label: &'static str| {
        let (app, admin) = (&app, &admin);
        async move {
            let created = app
                .mutation(
                    "categories.createCategory",
                    json!({ "label": format!("  {label} "), "translations": { "en": " Ski gear " } }),
                    Some(admin),
                )
                .await;
            created.body["value"].as_str().unwrap().to_owned()
        }
    };
    let ski = create("Ski").await;
    let bike = create("Räder").await;
    let update = |id: &str, label: &str, en: Value| {
        let (app, admin) = (&app, &admin);
        let args = json!({ "categoryId": id, "label": label, "translations": { "en": en } });
        async move {
            app.mutation("categories.updateCategory", args, Some(admin))
                .await
        }
    };

    let forbidden = app
        .mutation(
            "categories.updateCategory",
            json!({ "categoryId": ski, "label": "x", "translations": {} }),
            Some(&user),
        )
        .await;
    assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
    assert_eq!(
        update(&ski, "  ", Value::Null).await.body["code"],
        "category.labelEmpty"
    );
    assert_eq!(
        update(&ski, "räder", Value::Null).await.body["code"],
        "category.labelTaken"
    );
    let unknown_language = app
        .mutation(
            "categories.updateCategory",
            json!({ "categoryId": ski, "label": "Ski", "translations": { "fr": "Ski" } }),
            Some(&admin),
        )
        .await;
    assert_eq!(unknown_language.status, StatusCode::BAD_REQUEST);

    // Everybody reads the names; the other category stays as it was
    let list = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(list.body["value"][0]["label"], "Ski");
    assert_eq!(list.body["value"][0]["translations"]["en"], "Ski gear");

    let renamed = update(&ski, " Wintersport ", json!("Winter sports")).await;
    assert_eq!(renamed.status, StatusCode::OK, "{:?}", renamed.body);
    // Only the case of its own name may change
    assert_eq!(
        update(&bike, "RÄDER", json!(" ")).await.status,
        StatusCode::OK
    );
    let list = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    assert_eq!(list.body["value"][0]["label"], "Wintersport");
    assert_eq!(list.body["value"][0]["translations"]["en"], "Winter sports");
    assert_eq!(list.body["value"][1]["label"], "RÄDER");
    assert_eq!(list.body["value"][1]["translations"], json!({}));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_unused_categories_can_be_deleted(db: PgPool) {
    let app = app(&db).await;
    let user = app.user_session("user@example.org", false).await;
    let admin = app.user_session("admin@example.org", true).await;
    let create = |args: Value| {
        let (app, admin) = (&app, &admin);
        async move {
            app.mutation("categories.createCategory", args, Some(admin))
                .await
                .body["value"]
                .as_str()
                .unwrap()
                .to_owned()
        }
    };
    let parent = create(json!({ "label": "Ski" })).await;
    let child = create(json!({ "label": "Tourenski", "parentCategory": parent })).await;
    let delete = |id: String, session| {
        let app = &app;
        async move {
            app.mutation(
                "categories.deleteCategory",
                json!({ "categoryId": id }),
                session,
            )
            .await
        }
    };

    let listed = app
        .query("categories.listForAdmin", json!({}), Some(&user))
        .await;
    assert_eq!(listed.status, StatusCode::FORBIDDEN);
    assert_eq!(
        delete(child.clone(), Some(&user)).await.status,
        StatusCode::FORBIDDEN
    );

    // The parent has a sub-category
    assert_eq!(
        delete(parent.clone(), Some(&admin)).await.body["code"],
        "category.inUse"
    );

    // An item uses it: the count shows why, and the category stays
    let used = create(json!({ "label": "Bücher" })).await;
    let seller: uuid::Uuid = sqlx::query_scalar("SELECT id FROM users LIMIT 1")
        .fetch_one(&db)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO products (title, vendor_id, description, condition, category_id, price,
           ready_for_sale, sold)
         VALUES ('Atlas', $1, 'Alt', 'good', $2, 5, true, false)",
    )
    .bind(seller)
    .bind(uuid::Uuid::parse_str(&used).unwrap())
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        delete(used.clone(), Some(&admin)).await.body["code"],
        "category.inUse"
    );
    let listed = app
        .query("categories.listForAdmin", json!({}), Some(&admin))
        .await;
    let rows = listed.body["value"].as_array().unwrap();
    let row = |id: &str| rows.iter().find(|row| row["_id"] == id).unwrap().clone();
    assert_eq!(row(&used)["productCount"], 1);
    assert_eq!(row(&parent)["childCount"], 1);
    assert_eq!(row(&child)["productCount"], 0);

    assert_eq!(
        delete(child.clone(), Some(&admin)).await.status,
        StatusCode::OK
    );
    assert_eq!(
        delete(child, Some(&admin)).await.status,
        StatusCode::NOT_FOUND
    );

    // The last category stays: no bazaar can be created without one
    sqlx::query("DELETE FROM products")
        .execute(&db)
        .await
        .unwrap();
    assert_eq!(delete(used, Some(&admin)).await.status, StatusCode::OK);
    assert_eq!(
        delete(parent, Some(&admin)).await.body["code"],
        "category.lastOne"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_default_categories_come_with_their_english_names(db: PgPool) {
    let app = app(&db).await;
    rpc::call(&app.state, None, "categories.seedIfEmpty", json!({}))
        .await
        .unwrap();
    let list = app
        .query("categories.getAllCategories", json!({}), None)
        .await;
    let bikes = list.body["value"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["label"] == "Fahrräder")
        .unwrap();
    assert_eq!(bikes["translations"]["en"], "Bikes");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn feature_flags(db: PgPool) {
    let app = app(&db).await;
    rpc::call(
        &app.state,
        None,
        "featureFlags.set",
        json!({ "key": "is_login_enabled", "value": true }),
    )
    .await
    .unwrap();
    let one = app
        .query(
            "featureFlags.get",
            json!({ "key": "is_login_enabled" }),
            None,
        )
        .await;
    assert_eq!(one.body["value"], json!({ "is_login_enabled": true }));
    let unset = app
        .query("featureFlags.get", json!({ "key": "unknown" }), None)
        .await;
    assert_eq!(unset.body["value"], json!({}));
    let all = app.query("featureFlags.get", json!({}), None).await;
    // disable_starter_products set one flag already
    assert_eq!(
        all.body["value"]["is_create_products_on_signup_enabled"],
        false
    );
}
