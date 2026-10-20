//! File storage (replaces Convex `_storage` and `ctx.storage`).
//!
//! The bytes live in an object store: a local directory for a single server, or an
//! S3-compatible bucket (e.g. Garage, SeaweedFS) when several instances run. The `files`
//! table holds what Convex kept in `_storage`; tables reference it with foreign keys, so a
//! referenced file cannot be deleted.

use std::sync::Arc;

use axum::body::{Body, Bytes};
use axum::extract::{DefaultBodyLimit, Path, State};
use axum::http::{HeaderMap, HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use futures::FutureExt;
use futures::future::BoxFuture;
use object_store::aws::AmazonS3Builder;
use object_store::local::LocalFileSystem;
use object_store::memory::InMemory;
use object_store::path::Path as ObjectPath;
use object_store::{ObjectStore, ObjectStoreExt, PutPayload};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgConnection;
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::config::{Config, StorageConfig};
use crate::error::{AppError, AppResult};

/// Uploads are images the app already scaled down and converted to WebP
pub const MAX_UPLOAD_BYTES: usize = 10 * 1024 * 1024;

pub const CLEANUP_JOB: &str = "storage.cleanupOrphanedUploads";
pub const DELETE_JOB: &str = "storage.deleteIfUnreferenced";

pub type Store = Arc<dyn ObjectStore>;

pub fn open(config: &Config) -> anyhow::Result<Store> {
    Ok(match &config.storage {
        StorageConfig::Local { dir } => {
            std::fs::create_dir_all(dir)?;
            Arc::new(LocalFileSystem::new_with_prefix(dir)?)
        }
        StorageConfig::S3 {
            bucket,
            endpoint,
            region,
            access_key_id,
            secret_access_key,
        } => {
            let mut builder = AmazonS3Builder::new()
                .with_bucket_name(bucket)
                .with_region(region)
                .with_access_key_id(access_key_id)
                .with_secret_access_key(secret_access_key);
            if let Some(endpoint) = endpoint {
                // Self-hosted stores: path-style URLs, often plain http inside the network
                builder = builder
                    .with_endpoint(endpoint)
                    .with_allow_http(endpoint.starts_with("http://"))
                    .with_virtual_hosted_style_request(false);
            }
            Arc::new(builder.build()?)
        }
    })
}

/// Tests: files only in memory.
pub fn in_memory() -> Store {
    Arc::new(InMemory::new())
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            post(upload).layer(DefaultBodyLimit::max(MAX_UPLOAD_BYTES)),
        )
        .route("/{id}", get(download))
}

/// Address of a file for the app, like `ctx.storage.getUrl`.
pub fn url(config: &Config, id: Uuid) -> String {
    format!("{}/api/files/{id}", config.site_url)
}

/// The type by content: only the formats the upload field accepts, whatever the browser
/// claims, so nobody can store HTML or scripts under our domain.
fn sniff_image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn object_path(storage_key: &str) -> ObjectPath {
    ObjectPath::from(storage_key)
}

/// Stores the bytes and returns the file's ID. The object is written before the row, so
/// a row always has its bytes; a crash in between leaves an object the cleanup misses
/// but nothing points to.
pub async fn store(
    state: &AppState,
    conn: &mut PgConnection,
    bytes: Bytes,
    content_type: &str,
    uploaded_by: Option<Uuid>,
) -> anyhow::Result<Uuid> {
    let id = Uuid::new_v4();
    let storage_key = format!("files/{id}");
    let sha256 = hex::encode(Sha256::digest(&bytes));
    let size = bytes.len() as i64;
    state
        .storage
        .put(&object_path(&storage_key), PutPayload::from_bytes(bytes))
        .await?;
    sqlx::query(
        "INSERT INTO files (id, storage_key, content_type, size_bytes, sha256, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(&storage_key)
    .bind(content_type)
    .bind(size)
    .bind(sha256)
    .bind(uploaded_by)
    .execute(conn)
    .await?;
    Ok(id)
}

/// Deletes a file that nothing references any more, like `ctx.storage.delete`. The row
/// goes first: if the object deletion fails, only unreachable bytes remain.
pub async fn delete(state: &AppState, conn: &mut PgConnection, id: Uuid) -> anyhow::Result<()> {
    let key: Option<String> =
        sqlx::query_scalar("DELETE FROM files WHERE id = $1 RETURNING storage_key")
            .bind(id)
            .fetch_optional(conn)
            .await?;
    if let Some(key) = key {
        match state.storage.delete(&object_path(&key)).await {
            Ok(()) | Err(object_store::Error::NotFound { .. }) => {}
            Err(err) => return Err(err.into()),
        }
    }
    Ok(())
}

/// `generateUploadUrl` + upload in one: signed-in users only, so the storage cannot be
/// filled anonymously. Answers `{storageId}` like the Convex upload URL.
async fn upload(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    body: Bytes,
) -> AppResult<Json<Value>> {
    let current = current.ok_or_else(|| AppError::unauthorized("auth.loginToUpload"))?;
    let content_type = sniff_image_type(&body).ok_or_else(|| {
        AppError::coded(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            "UNSUPPORTED_FILE_TYPE",
            &[],
        )
    })?;
    let mut conn = state.db.acquire().await?;
    let id = store(&state, &mut conn, body, content_type, Some(current.user_id)).await?;
    Ok(Json(json!({ "storageId": id })))
}

async fn download(State(state): State<AppState>, Path(id): Path<String>) -> AppResult<Response> {
    let not_found = || AppError::not_found("notFound.page");
    let id = Uuid::parse_str(&id).map_err(|_| not_found())?;
    let row: Option<(String, Option<String>, Option<i64>)> =
        sqlx::query_as("SELECT storage_key, content_type, size_bytes FROM files WHERE id = $1")
            .bind(id)
            .fetch_optional(&state.db)
            .await?;
    let (key, content_type, size) = row.ok_or_else(not_found)?;
    let object = match state.storage.get(&object_path(&key)).await {
        Ok(object) => object,
        Err(object_store::Error::NotFound { .. }) => return Err(not_found()),
        Err(err) => return Err(anyhow::Error::from(err).into()),
    };

    let mut headers = HeaderMap::new();
    let content_type = content_type.unwrap_or_else(|| "application/octet-stream".to_owned());
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(&content_type)
            .unwrap_or(HeaderValue::from_static("application/octet-stream")),
    );
    if let Some(size) = size {
        headers.insert(header::CONTENT_LENGTH, HeaderValue::from(size));
    }
    // A file never changes under its ID
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    // Imported files may be of any type: never run them as a page of our domain
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; sandbox"),
    );
    Ok((
        StatusCode::OK,
        headers,
        Body::from_stream(object.into_stream()),
    )
        .into_response())
}

/// For arguments that name a file: a clean error instead of a foreign key violation.
pub async fn ensure_exists(conn: &mut PgConnection, id: Uuid) -> AppResult<()> {
    let exists: bool = sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM files WHERE id = $1)")
        .bind(id)
        .fetch_one(conn)
        .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::not_found("FILE_NOT_FOUND"))
    }
}

/// Schedules the deletion of a file a mutation stopped referencing, like
/// `ctx.storage.delete`. The job runs after the commit; deleting right away could lose
/// the bytes of a mutation that is retried or rolls back.
pub async fn delete_later(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<()> {
    crate::jobs::enqueue(conn, DELETE_JOB, &json!({ "id": id }), chrono::Utc::now()).await?;
    Ok(())
}

const UNREFERENCED: &str = "NOT EXISTS (SELECT 1 FROM product_images WHERE file_id = f.id)
   AND NOT EXISTS (SELECT 1 FROM events WHERE cover_image_id = f.id OR map_image_id = f.id)
   AND NOT EXISTS (SELECT 1 FROM site_settings WHERE logo_id = f.id)";

pub fn delete_if_unreferenced(
    state: AppState,
    payload: serde_json::Value,
) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let id: Uuid = serde_json::from_value(payload["id"].clone())?;
        let mut conn = state.db.acquire().await?;
        let unreferenced: Option<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT id FROM files f WHERE id = $1 AND {UNREFERENCED}"
        )))
        .bind(id)
        .fetch_optional(&mut *conn)
        .await?;
        if unreferenced.is_some() {
            delete(&state, &mut conn, id).await?;
        }
        Ok(())
    }
    .boxed()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CleanupArgs {
    batch_size: Option<i64>,
}

/// Daily cron: deletes files no product, event or the instance logo references. Files of
/// the last day are kept: they may have been uploaded for a form not saved yet (Convex
/// deleted those too).
pub fn cleanup_orphaned_uploads(
    state: AppState,
    payload: serde_json::Value,
) -> BoxFuture<'static, anyhow::Result<()>> {
    async move {
        let args: CleanupArgs = serde_json::from_value(payload)?;
        let batch_size = args.batch_size.unwrap_or(500).clamp(1, 5000);
        let mut conn = state.db.acquire().await?;
        let orphans: Vec<Uuid> = sqlx::query_scalar(sqlx::AssertSqlSafe(format!(
            "SELECT id FROM files f
             WHERE f.created_at < now() - interval '1 day' AND {UNREFERENCED}
             ORDER BY created_at
             LIMIT $1"
        )))
        .bind(batch_size)
        .fetch_all(&mut *conn)
        .await?;
        for id in &orphans {
            delete(&state, &mut conn, *id).await?;
        }
        tracing::info!(deleted = orphans.len(), "cleaned up orphaned uploads");
        Ok(())
    }
    .boxed()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_images_of_the_upload_formats_are_accepted() {
        assert_eq!(
            sniff_image_type(&[0xFF, 0xD8, 0xFF, 0xE0]),
            Some("image/jpeg")
        );
        assert_eq!(
            sniff_image_type(b"\x89PNG\r\n\x1a\n...."),
            Some("image/png")
        );
        assert_eq!(
            sniff_image_type(b"RIFF\x10\0\0\0WEBPVP8 "),
            Some("image/webp")
        );
        assert_eq!(sniff_image_type(b"<html><script>"), None);
        assert_eq!(sniff_image_type(b"<svg xmlns="), None);
    }
}
