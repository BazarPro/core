//! Tests of the building blocks that replace Convex: live updates, jobs and crons.
//! Each test gets its own database (needs DATABASE_URL, see backend/README.md).

use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use bazarpro_backend::realtime::{CHANNEL, Hub, Topic, touch};
use bazarpro_backend::{AppState, app, jobs};
use chrono::{TimeZone, Utc};
use futures::FutureExt;
use sqlx::PgPool;
use sqlx::postgres::PgListener;
use tower::ServiceExt;
use uuid::Uuid;

fn state(db: PgPool) -> AppState {
    AppState {
        db,
        hub: Hub::new(),
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn healthz_answers_when_the_database_is_up(db: PgPool) {
    let response = app(state(db))
        .oneshot(Request::get("/healthz").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn touched_topics_arrive_only_after_commit(db: PgPool) {
    let mut listener = PgListener::connect_with(&db).await.unwrap();
    listener.listen(CHANNEL).await.unwrap();
    let event = Uuid::new_v4();

    let mut rolled_back = db.begin().await.unwrap();
    touch(&mut rolled_back, &[Topic::Admin]).await.unwrap();
    rolled_back.rollback().await.unwrap();

    let mut tx = db.begin().await.unwrap();
    touch(&mut tx, &[Topic::Event(event), Topic::Events])
        .await
        .unwrap();
    let before_commit = tokio::time::timeout(Duration::from_millis(200), listener.recv()).await;
    assert!(before_commit.is_err(), "notification before commit");
    tx.commit().await.unwrap();

    let notification = tokio::time::timeout(Duration::from_secs(5), listener.recv())
        .await
        .expect("no notification")
        .unwrap();
    assert_eq!(notification.payload(), format!("event:{event},events"));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn hub_forwards_notifications_to_subscribers(db: PgPool) {
    let hub = Hub::new();
    let mut changes = hub.subscribe();
    tokio::spawn(hub.clone().listen(db.clone()));
    // Give the listener time to LISTEN before notifying
    tokio::time::sleep(Duration::from_millis(300)).await;

    let user = Uuid::new_v4();
    let mut conn = db.acquire().await.unwrap();
    touch(&mut conn, &[Topic::User(user)]).await.unwrap();

    let key = tokio::time::timeout(Duration::from_secs(5), changes.recv())
        .await
        .expect("no change")
        .unwrap();
    assert_eq!(key, format!("user:{user}"));
}

static RUNS: AtomicUsize = AtomicUsize::new(0);

fn count_run(
    _: AppState,
    payload: serde_json::Value,
) -> futures::future::BoxFuture<'static, anyhow::Result<()>> {
    async move {
        RUNS.fetch_add(payload["add"].as_u64().unwrap() as usize, Ordering::SeqCst);
        Ok(())
    }
    .boxed()
}

fn always_fail(
    _: AppState,
    _: serde_json::Value,
) -> futures::future::BoxFuture<'static, anyhow::Result<()>> {
    async { anyhow::bail!("SMTP nicht erreichbar") }.boxed()
}

async fn job_count(db: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM jobs")
        .fetch_one(db)
        .await
        .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn due_jobs_run_once_and_future_jobs_wait(db: PgPool) {
    let registry = jobs::Registry::default().register("test.count", count_run);
    let state = state(db.clone());
    let mut conn = db.acquire().await.unwrap();
    jobs::enqueue(
        &mut conn,
        "test.count",
        &serde_json::json!({ "add": 1000 }),
        Utc::now(),
    )
    .await
    .unwrap();
    jobs::enqueue(
        &mut conn,
        "test.count",
        &serde_json::json!({ "add": 1 }),
        Utc::now() + chrono::Duration::hours(1),
    )
    .await
    .unwrap();
    let before = RUNS.load(Ordering::SeqCst);

    assert!(jobs::run_next(&state, &registry).await.unwrap());
    assert!(!jobs::run_next(&state, &registry).await.unwrap());

    assert_eq!(RUNS.load(Ordering::SeqCst) - before, 1000);
    assert_eq!(job_count(&db).await, 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn failed_jobs_are_retried_later_and_given_up_after_max_attempts(db: PgPool) {
    let registry = jobs::Registry::default().register("test.fail", always_fail);
    let state = state(db.clone());
    let mut conn = db.acquire().await.unwrap();
    let id = jobs::enqueue(&mut conn, "test.fail", &(), Utc::now())
        .await
        .unwrap();

    assert!(jobs::run_next(&state, &registry).await.unwrap());
    let (attempts, error, retry_later): (i32, String, bool) =
        sqlx::query_as("SELECT attempts, last_error, run_at > now() FROM jobs WHERE id = $1")
            .bind(id)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(
        (attempts, error.as_str(), retry_later),
        (1, "SMTP nicht erreichbar", true)
    );

    sqlx::query("UPDATE jobs SET run_at = now(), attempts = max_attempts - 1 WHERE id = $1")
        .bind(id)
        .execute(&db)
        .await
        .unwrap();
    assert!(jobs::run_next(&state, &registry).await.unwrap());
    let gave_up: bool = sqlx::query_scalar("SELECT run_at = 'infinity' FROM jobs WHERE id = $1")
        .bind(id)
        .fetch_one(&db)
        .await
        .unwrap();
    assert!(gave_up);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn cancelled_jobs_do_not_run(db: PgPool) {
    let mut tx = db.begin().await.unwrap();
    let id = jobs::enqueue(
        &mut tx,
        "test.count",
        &serde_json::json!({ "add": 1 }),
        Utc::now(),
    )
    .await
    .unwrap();
    assert!(jobs::cancel(&mut tx, id).await.unwrap());
    tx.commit().await.unwrap();
    assert_eq!(job_count(&db).await, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn jobs_of_a_rolled_back_mutation_are_not_scheduled(db: PgPool) {
    let mut tx = db.begin().await.unwrap();
    jobs::enqueue(
        &mut tx,
        "test.count",
        &serde_json::json!({ "add": 1 }),
        Utc::now(),
    )
    .await
    .unwrap();
    tx.rollback().await.unwrap();
    assert_eq!(job_count(&db).await, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_cron_slot_is_enqueued_once_across_instances(db: PgPool) {
    let cron = jobs::CRONS
        .iter()
        .find(|cron| cron.name == "platform stats")
        .unwrap();
    let at = |hour, minute| Utc.with_ymd_and_hms(2026, 10, 20, hour, minute, 0).unwrap();

    // Two instances tick at the same moment
    let (a, b) = tokio::join!(
        jobs::schedule_cron(&db, cron, at(10, 41)),
        jobs::schedule_cron(&db, cron, at(10, 41)),
    );
    assert!(
        a.unwrap() ^ b.unwrap(),
        "exactly one instance enqueues the slot"
    );
    // Same slot (10:40) on the next tick
    assert!(!jobs::schedule_cron(&db, cron, at(10, 59)).await.unwrap());
    // Next slot (11:40)
    assert!(jobs::schedule_cron(&db, cron, at(11, 40)).await.unwrap());

    let kinds: Vec<String> = sqlx::query_scalar("SELECT kind FROM jobs")
        .fetch_all(&db)
        .await
        .unwrap();
    assert_eq!(kinds, vec!["moderation.refreshPlatformStats"; 2]);
}
