//! File uploads and downloads (generateUploadUrl, getUrl) and the cleanup cron.

use crate::common;

use axum::http::{StatusCode, header};
use bazarpro_backend::storage;
use common::{TestApp, disable_starter_products};
use serde_json::json;
use sqlx::PgPool;
use uuid::Uuid;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR-test-image";

async fn signed_in(db: &PgPool) -> (TestApp, String) {
    let app = TestApp::new(db.clone());
    disable_starter_products(db).await;
    let session = app.sign_up("erika@example.org").await;
    (app, session)
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn uploads_need_a_sign_in(db: PgPool) {
    let app = TestApp::new(db);
    let reply = app.upload(PNG.to_vec(), "image/png", None).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
    assert_eq!(reply.body["code"], "auth.loginToUpload");
    assert_eq!(
        reply.body["message"],
        "Bitte melde dich an, um Bilder hochzuladen."
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn uploaded_images_can_be_downloaded(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let reply = app.upload(PNG.to_vec(), "image/png", Some(&session)).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let id = reply.body["storageId"].as_str().unwrap().to_owned();

    let file = app.get(&format!("/api/files/{id}"), None).await;
    assert_eq!(file.status, StatusCode::OK);
    assert_eq!(file.bytes, PNG);
    assert_eq!(file.headers[header::CONTENT_TYPE], "image/png");
    assert_eq!(file.headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert!(
        file.headers[header::CACHE_CONTROL]
            .to_str()
            .unwrap()
            .contains("immutable")
    );

    let uploader: Option<Uuid> = sqlx::query_scalar("SELECT uploaded_by FROM files")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(uploader, Some(app.user("erika@example.org").await.0));
    assert_eq!(
        storage::url(&app.state.config, id.parse().unwrap()),
        format!("https://bazarpro.test/api/files/{id}")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_type_comes_from_the_content_not_the_browser(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let html = app
        .upload(
            b"<html><script>alert(1)</script>".to_vec(),
            "image/png",
            Some(&session),
        )
        .await;
    assert_eq!(html.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(html.body["code"], "UNSUPPORTED_FILE_TYPE");

    let png_as_jpeg = app.upload(PNG.to_vec(), "image/jpeg", Some(&session)).await;
    let id = png_as_jpeg.body["storageId"].as_str().unwrap();
    let file = app.get(&format!("/api/files/{id}"), None).await;
    assert_eq!(file.headers[header::CONTENT_TYPE], "image/png");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn uploads_are_limited_in_size(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let mut big = PNG.to_vec();
    big.resize(storage::MAX_UPLOAD_BYTES + 1, 0);
    let reply = app.upload(big, "image/png", Some(&session)).await;
    assert_eq!(reply.status, StatusCode::PAYLOAD_TOO_LARGE);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn unsaved_uploads_of_a_user_are_limited_in_bytes(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let other = app.sign_up("max@example.org").await;
    let (user_id, ..) = app.user("erika@example.org").await;
    let saved = upload(&app, &session, 0).await;
    let unsaved = upload(&app, &session, 0).await;
    let set_size = |id: Uuid, size: i64| {
        sqlx::query("UPDATE files SET size_bytes = $2 WHERE id = $1")
            .bind(id)
            .bind(size)
            .execute(&db)
    };
    // What a saved form references does not count, however large
    set_size(saved, 10 * storage::MAX_UNREFERENCED_BYTES)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO site_settings (logo_id, updated_at, updated_by) VALUES ($1, now(), $2)",
    )
    .bind(saved)
    .bind(user_id)
    .execute(&db)
    .await
    .unwrap();
    set_size(unsaved, storage::MAX_UNREFERENCED_BYTES - PNG.len() as i64)
        .await
        .unwrap();
    let fits = app.upload(PNG.to_vec(), "image/png", Some(&session)).await;
    assert_eq!(fits.status, StatusCode::OK, "{}", fits.body);

    let refused = app.upload(PNG.to_vec(), "image/png", Some(&session)).await;
    assert_eq!(refused.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(refused.body["code"], "upload.quotaExceeded");
    assert!(
        refused.body["message"]
            .as_str()
            .unwrap()
            .starts_with("Du hast zu viele Bilder hochgeladen")
    );
    let files: i64 = sqlx::query_scalar("SELECT count(*) FROM files")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(files, 3);

    // Other users go on, and so does this one once the files are gone
    let others = app.upload(PNG.to_vec(), "image/png", Some(&other)).await;
    assert_eq!(others.status, StatusCode::OK, "{}", others.body);
    let mut conn = db.acquire().await.unwrap();
    storage::delete(&app.state, &mut conn, unsaved)
        .await
        .unwrap();
    let again = app.upload(PNG.to_vec(), "image/png", Some(&session)).await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn parallel_uploads_do_not_get_past_the_quota(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let first = upload(&app, &session, 0).await;
    // Room for exactly two more
    sqlx::query("UPDATE files SET size_bytes = $2 WHERE id = $1")
        .bind(first)
        .bind(storage::MAX_UNREFERENCED_BYTES - 2 * PNG.len() as i64)
        .execute(&db)
        .await
        .unwrap();
    let uploads = (0..8).map(|_| app.upload(PNG.to_vec(), "image/png", Some(&session)));
    let replies = futures::future::join_all(uploads).await;
    let stored = replies
        .iter()
        .filter(|reply| reply.status == StatusCode::OK)
        .count();
    assert_eq!(stored, 2);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn uploads_of_a_user_are_limited_per_hour(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let other = app.sign_up("max@example.org").await;
    let (user_id, ..) = app.user("erika@example.org").await;
    assert_eq!(
        app.upload(PNG.to_vec(), "image/png", Some(&session))
            .await
            .status,
        StatusCode::OK
    );
    // 300 per hour: the first one is counted, the rest is used up
    let left: f64 = sqlx::query_scalar(
        "UPDATE auth_rate_limits SET attempts_left = 0 WHERE identifier = $1
         RETURNING (SELECT attempts_left FROM auth_rate_limits WHERE identifier = $1)",
    )
    .bind(format!("upload:{user_id}"))
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(left, 299.0);

    let refused = app.upload(PNG.to_vec(), "image/png", Some(&session)).await;
    assert_eq!(refused.status, StatusCode::TOO_MANY_REQUESTS);
    assert_eq!(refused.body["code"], "upload.tooMany");
    let others = app.upload(PNG.to_vec(), "image/png", Some(&other)).await;
    assert_eq!(others.status, StatusCode::OK, "{}", others.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn unknown_files_are_not_found(db: PgPool) {
    let app = TestApp::new(db);
    let missing = app
        .get(&format!("/api/files/{}", Uuid::new_v4()), None)
        .await;
    assert_eq!(missing.status, StatusCode::NOT_FOUND);
    let invalid = app.get("/api/files/kein-uuid", None).await;
    assert_eq!(invalid.status, StatusCode::NOT_FOUND);
}

async fn upload(app: &TestApp, session: &str, days_old: i32) -> Uuid {
    let reply = app.upload(PNG.to_vec(), "image/png", Some(session)).await;
    let id: Uuid = reply.body["storageId"].as_str().unwrap().parse().unwrap();
    sqlx::query("UPDATE files SET created_at = now() - make_interval(days => $2) WHERE id = $1")
        .bind(id)
        .bind(days_old)
        .execute(&app.state.db)
        .await
        .unwrap();
    id
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn cleanup_deletes_old_files_nothing_references(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let (user_id, ..) = app.user("erika@example.org").await;
    let orphan = upload(&app, &session, 3).await;
    let fresh = upload(&app, &session, 0).await;
    let product_image = upload(&app, &session, 3).await;
    let logo = upload(&app, &session, 3).await;

    let category: Uuid =
        sqlx::query_scalar("INSERT INTO categories (label) VALUES ('Ski') RETURNING id")
            .fetch_one(&db)
            .await
            .unwrap();
    let product: Uuid = sqlx::query_scalar(
        "INSERT INTO products (title, vendor_id, description, condition, category_id, price,
                               ready_for_sale, sold)
         VALUES ('Ski', $1, '', 'good', $2, 50, true, false) RETURNING id",
    )
    .bind(user_id)
    .bind(category)
    .fetch_one(&db)
    .await
    .unwrap();
    sqlx::query("INSERT INTO product_images (product_id, position, file_id) VALUES ($1, 0, $2)")
        .bind(product)
        .bind(product_image)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO site_settings (logo_id, updated_at, updated_by) VALUES ($1, now(), $2)",
    )
    .bind(logo)
    .bind(user_id)
    .execute(&db)
    .await
    .unwrap();

    storage::cleanup_orphaned_uploads(app.state.clone(), json!({ "batchSize": 500 }))
        .await
        .unwrap();

    let left: Vec<Uuid> = sqlx::query_scalar("SELECT id FROM files ORDER BY created_at")
        .fetch_all(&db)
        .await
        .unwrap();
    assert!(!left.contains(&orphan));
    for kept in [fresh, product_image, logo] {
        assert!(left.contains(&kept));
    }
    // The bytes are gone too
    let gone = app.get(&format!("/api/files/{orphan}"), None).await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_referenced_file_cannot_be_deleted(db: PgPool) {
    let (app, session) = signed_in(&db).await;
    let (user_id, ..) = app.user("erika@example.org").await;
    let logo = upload(&app, &session, 0).await;
    sqlx::query(
        "INSERT INTO site_settings (logo_id, updated_at, updated_by) VALUES ($1, now(), $2)",
    )
    .bind(logo)
    .bind(user_id)
    .execute(&db)
    .await
    .unwrap();
    let mut conn = db.acquire().await.unwrap();
    assert!(storage::delete(&app.state, &mut conn, logo).await.is_err());
    let file = app.get(&format!("/api/files/{logo}"), None).await;
    assert_eq!(file.status, StatusCode::OK);
}
