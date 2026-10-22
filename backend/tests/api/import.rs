//! Import of a Convex export, with the problems real exports have: references to
//! deleted documents, files missing from the export, old password hashes.

use crate::common;

use std::io::Write;

use axum::http::StatusCode;
use bazarpro_backend::import::{self, uuid_for};
use common::TestApp;
use rust_decimal::Decimal;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;
use zip::write::SimpleFileOptions;

/// `new Scrypt().hash('geheim123')` of lucia 3.2.2
const LUCIA_HASH: &str = "8e37740c04727d44b9206c793d4cc130:75e852290a02857e3218cd8f9ec4bea387bf1e15eacedbe052179c0daa49eb930584b7568bba1be4beaaeca7b6c1b211a2d4e1fc850da7d9e27cfb42c4534a75";
type Time = chrono::DateTime<chrono::Utc>;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-image-bytes";
/// 2026-10-24 09:00 UTC
const START_MS: f64 = 1_792_832_400_000.0;

fn write_export(tables: &[(&str, Vec<Value>)], files: &[(&str, &[u8])]) -> tempfile::NamedTempFile {
    let file = tempfile::NamedTempFile::new().unwrap();
    let mut zip = zip::ZipWriter::new(file.reopen().unwrap());
    let options = SimpleFileOptions::default();
    for (table, docs) in tables {
        zip.start_file(format!("{table}/documents.jsonl"), options)
            .unwrap();
        for doc in docs {
            writeln!(zip, "{doc}").unwrap();
        }
    }
    for (name, bytes) in files {
        zip.start_file(format!("_storage/{name}"), options).unwrap();
        zip.write_all(bytes).unwrap();
    }
    zip.finish().unwrap();
    file
}

fn sample_export() -> tempfile::NamedTempFile {
    let created = json!(1_760_000_000_000.5_f64);
    write_export(
        &[
            (
                "_storage",
                vec![
                    json!({ "_id": "storage-img", "_creationTime": created, "contentType": "image/png", "size": PNG.len(), "sha256": "abc" }),
                    // Listed, but its bytes are not in the export
                    json!({ "_id": "storage-lost", "_creationTime": created, "contentType": "image/webp", "size": 1 }),
                ],
            ),
            (
                "users",
                vec![
                    json!({ "_id": "user-erika", "_creationTime": created, "email": "erika@example.org", "firstName": "Erika",
                            "status": "active", "systemRole": "admin", "isMailConfirmed": true, "locale": "de",
                            "notificationPrefs": { "sales": false } }),
                    json!({ "_id": "user-walkin", "_creationTime": created, "name": "Laufkundschaft", "managedByEventId": "event-1" }),
                ],
            ),
            (
                "authAccounts",
                vec![
                    json!({ "_id": "acc-erika", "_creationTime": created, "userId": "user-erika", "provider": "password",
                             "providerAccountId": "erika@example.org", "secret": LUCIA_HASH, "emailVerified": "erika@example.org" }),
                ],
            ),
            // Never imported
            (
                "authSessions",
                vec![
                    json!({ "_id": "s1", "_creationTime": created, "userId": "user-erika", "expirationTime": START_MS }),
                ],
            ),
            (
                "categories",
                vec![
                    json!({ "_id": "cat-ski", "_creationTime": created, "label": "Ski", "updatedAt": created }),
                    json!({ "_id": "cat-kids", "_creationTime": created, "label": "Kinderski", "updatedAt": created, "parentCategory": "cat-ski" }),
                ],
            ),
            (
                "events",
                vec![
                    json!({ "_id": "event-1", "_creationTime": created, "title": "Skibasar", "description": "", "location": "Halle",
                             "startDate": START_MS, "endDate": START_MS + 3_600_000.0, "contactInfo": "", "organizerId": "user-erika",
                             "categories": ["cat-ski", "cat-deleted"], "services": ["Parkplatz", "Getränke"], "visibility": "public",
                             "commission": 10.0, "coverImage": "storage-lost",
                             "features": { "discounts": true, "maxItemsPerSeller": 30 },
                             "sellerLogistics": { "dropoffStart": START_MS - 86_400_000.0, "note": "Ski mit Schloss" } }),
                ],
            ),
            (
                "products",
                vec![
                    json!({ "_id": "prod-ski", "_creationTime": created, "title": "Carving-Ski", "vendorId": "user-erika",
                            "description": "", "condition": "very-good", "images": ["storage-img", "storage-lost"],
                            "productCategory": "cat-ski", "updatedAt": created, "price": 119.9, "readyForSale": true, "sold": true,
                            "attributes": { "length": "170" },
                            "moderation": { "hiddenAt": created, "hiddenBy": "user-erika", "reason": "Test" } }),
                    // Its category was deleted: the product and everything about it is skipped
                    json!({ "_id": "prod-orphan", "_creationTime": created, "title": "Helm", "vendorId": "user-erika",
                            "description": "", "condition": "good", "images": [], "productCategory": "cat-deleted",
                            "updatedAt": created, "price": 10.0, "readyForSale": false, "sold": false }),
                ],
            ),
            (
                "eventProducts",
                vec![
                    json!({ "_id": "ep-ski", "_creationTime": created, "eventId": "event-1", "productId": "prod-ski", "status": "sold", "discountPercent": 10.0 }),
                    json!({ "_id": "ep-orphan", "_creationTime": created, "eventId": "event-1", "productId": "prod-orphan", "status": "announced" }),
                ],
            ),
            (
                "eventSeller",
                vec![
                    json!({ "_id": "seller-1", "_creationTime": created, "event": "event-1", "user": "user-erika", "totalFee": 107.91,
                             "comissionFee": 10.79, "numberpayoutAmount": 97.12, "payoutReceived": false, "number": 1 }),
                ],
            ),
            (
                "eventRole",
                vec![
                    json!({ "_id": "role-1", "_creationTime": created, "event": "event-1", "user": "user-erika", "roles": "organizer" }),
                    json!({ "_id": "role-2", "_creationTime": created, "event": "event-deleted", "user": "user-erika", "roles": "seller" }),
                ],
            ),
            (
                "purchase",
                vec![
                    json!({ "_id": "purchase-1", "_creationTime": created, "product": "prod-ski", "event": "event-1",
                             "seller": "user-erika", "totalAmount": 107.91, "comissionAmount": 10.79, "payoutAmount": 97.12,
                             "payoutStatus": false, "payoutDate": START_MS, "discountPercent": 10.0 }),
                ],
            ),
            (
                "featureFlags",
                vec![
                    json!({ "_id": "flag-1", "_creationTime": created, "key": "is_registration_enabled", "value": false }),
                ],
            ),
        ],
        &[("storage-img.png", PNG)],
    )
}

async fn count(db: &PgPool, table: &str) -> i64 {
    // Table names from the test itself
    sqlx::query_scalar(sqlx::AssertSqlSafe(format!("SELECT count(*) FROM {table}")))
        .fetch_one(db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn imports_an_export_and_skips_what_points_nowhere(db: PgPool) {
    let app = TestApp::new(db.clone());
    let export = sample_export();
    let report = import::run(&app.state, export.path().to_str().unwrap())
        .await
        .unwrap();

    for (table, expected) in [
        ("users", 2),
        ("auth_accounts", 1),
        ("sessions", 0),
        ("categories", 2),
        ("events", 1),
        ("event_categories", 1),
        ("products", 1),
        ("product_images", 1),
        ("event_products", 1),
        ("event_sellers", 1),
        ("event_roles", 1),
        ("purchases", 1),
        ("files", 1),
    ] {
        assert_eq!(count(&db, table).await, expected, "{table}");
    }
    assert_eq!(
        report.problems["products.productCategory → Zeile übersprungen"],
        1
    );
    assert_eq!(
        report.problems["eventProducts.productId → Zeile übersprungen"],
        1
    );
    assert_eq!(report.problems["eventRole.event → Zeile übersprungen"], 1);
    assert_eq!(report.problems["events.categories → Eintrag entfernt"], 1);
    assert_eq!(report.problems["products.images → Eintrag entfernt"], 1);
    assert_eq!(report.problems["events.coverImage → leer gelassen"], 1);
    assert_eq!(
        report.problems["_storage: Datei fehlt im Export → übersprungen"],
        1
    );

    // IDs come from the Convex IDs, references point to the same rows
    let (vendor, category, price, hidden_reason): (Uuid, Uuid, Decimal, Option<String>) =
        sqlx::query_as(
            "SELECT vendor_id, category_id, price, hidden_reason FROM products WHERE id = $1",
        )
        .bind(uuid_for("prod-ski"))
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(
        (vendor, category),
        (uuid_for("user-erika"), uuid_for("cat-ski"))
    );
    assert_eq!(price, Decimal::new(11990, 2));
    assert_eq!(hidden_reason.as_deref(), Some("Test"));

    type EventRow = (Time, Vec<String>, Value, Option<String>, Option<Time>);
    let (start, services, features, note, dropoff): EventRow = sqlx::query_as(
        "SELECT start_date, services::text[], features, logistics_note, dropoff_start FROM events",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(start.to_rfc3339(), "2026-10-24T09:00:00+00:00");
    assert_eq!(services, vec!["Parkplatz", "Getränke"]);
    assert_eq!(
        features,
        json!({ "discounts": true, "maxItemsPerSeller": 30 })
    );
    assert_eq!(note.as_deref(), Some("Ski mit Schloss"));
    assert_eq!(dropoff.unwrap().to_rfc3339(), "2026-10-23T09:00:00+00:00");

    let parent: Option<Uuid> =
        sqlx::query_scalar("SELECT parent_id FROM categories WHERE label = 'Kinderski'")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(parent, Some(uuid_for("cat-ski")));
    let managed: Option<Uuid> =
        sqlx::query_scalar("SELECT managed_by_event_id FROM users WHERE name = 'Laufkundschaft'")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(managed, Some(uuid_for("event-1")));
    let (prefs, role): (Value, Option<String>) = sqlx::query_as(
        "SELECT notification_prefs, system_role::text FROM users WHERE email = 'erika@example.org'",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(
        (prefs, role.as_deref()),
        (json!({ "sales": false }), Some("admin"))
    );

    // The image is served, under the ID derived from the storage ID
    let file = app
        .get(&format!("/api/files/{}", uuid_for("storage-img")), None)
        .await;
    assert_eq!(file.status, StatusCode::OK);
    assert_eq!(file.bytes, PNG);

    // Flags came along: registration is off, sign-in with the old password works
    let signed_in = app
        .password(
            json!({ "flow": "signIn", "email": "erika@example.org", "password": "geheim123" }),
        )
        .await;
    assert_eq!(signed_in.body, json!({ "signingIn": true }));
    let sign_up = app
        .password(json!({ "flow": "signUp", "email": "neu@example.org", "password": "geheim123" }))
        .await;
    assert_eq!(sign_up.body["code"], "REGISTRATION_DISABLED");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn imports_after_the_platform_stats_cron_ran(db: PgPool) {
    let app = TestApp::new(db.clone());
    // The backend ran before the import: the hourly cron counted the empty database
    bazarpro_backend::rpc::call(
        &app.state,
        None,
        "moderation.refreshPlatformStats",
        json!({}),
    )
    .await
    .unwrap();
    let created = json!(1_760_000_000_000.5_f64);
    let export = write_export(
        &[
            (
                "users",
                vec![
                    json!({ "_id": "user-a", "_creationTime": created, "email": "a@example.org", "status": "active" }),
                ],
            ),
            (
                "platformStats",
                vec![
                    json!({ "_id": "stats", "_creationTime": created, "users": 82, "products": 340, "updatedAt": created }),
                ],
            ),
        ],
        &[],
    );
    import::run(&app.state, export.path().to_str().unwrap())
        .await
        .unwrap();
    let users: i64 = sqlx::query_scalar("SELECT users FROM platform_stats")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(users, 82);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn refuses_to_import_into_a_database_with_users(db: PgPool) {
    let app = TestApp::new(db.clone());
    let export = sample_export();
    import::run(&app.state, export.path().to_str().unwrap())
        .await
        .unwrap();
    let err = import::run(&app.state, export.path().to_str().unwrap())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("already has users"));
    assert_eq!(count(&db, "users").await, 2);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn refuses_files_that_are_no_convex_export(db: PgPool) {
    let app = TestApp::new(db);
    let other = write_export(&[("something", vec![json!({ "_id": "x" })])], &[]);
    let err = import::run(&app.state, other.path().to_str().unwrap())
        .await
        .unwrap_err();
    assert!(err.to_string().contains("Convex export"));
}
