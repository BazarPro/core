//! Background jobs and cron jobs.
//!
//! `enqueue` writes the job in the caller's transaction, like `ctx.scheduler.runAfter`:
//! a mutation that rolls back schedules nothing. Every instance with `RUN_WORKERS` runs a
//! worker; Postgres row locks make sure each job and each cron slot runs only once.

use std::collections::HashMap;
use std::str::FromStr;
use std::time::Duration;

use chrono::{DateTime, Utc};
use croner::Cron;
use futures::future::BoxFuture;
use serde::Serialize;
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

use crate::AppState;

/// How long a worker may run a job before another instance takes it over.
const LOCK_TIMEOUT: Duration = Duration::from_secs(300);
const IDLE_POLL: Duration = Duration::from_secs(1);
const CRON_TICK: Duration = Duration::from_secs(20);

pub type Handler = fn(AppState, serde_json::Value) -> BoxFuture<'static, anyhow::Result<()>>;

/// Job kinds this instance can run.
#[derive(Clone, Default)]
pub struct Registry {
    handlers: HashMap<&'static str, Handler>,
}

impl Registry {
    pub fn register(mut self, kind: &'static str, handler: Handler) -> Self {
        self.handlers.insert(kind, handler);
        self
    }

    pub fn contains(&self, kind: &str) -> bool {
        self.handlers.contains_key(kind)
    }
}

/// Schedules a job, like `ctx.scheduler.runAfter(delay, …)`. Returns its ID for `cancel`.
pub async fn enqueue(
    conn: &mut PgConnection,
    kind: &str,
    payload: &impl Serialize,
    run_at: DateTime<Utc>,
) -> sqlx::Result<Uuid> {
    let payload = serde_json::to_value(payload).map_err(|err| sqlx::Error::Encode(err.into()))?;
    sqlx::query_scalar("INSERT INTO jobs (kind, payload, run_at) VALUES ($1, $2, $3) RETURNING id")
        .bind(kind)
        .bind(payload)
        .bind(run_at)
        .fetch_one(conn)
        .await
}

/// Removes a job that has not started yet, like `ctx.scheduler.cancel`.
pub async fn cancel(conn: &mut PgConnection, id: Uuid) -> sqlx::Result<bool> {
    let result = sqlx::query("DELETE FROM jobs WHERE id = $1 AND locked_until IS NULL")
        .bind(id)
        .execute(conn)
        .await?;
    Ok(result.rows_affected() > 0)
}

struct ClaimedJob {
    id: Uuid,
    kind: String,
    payload: serde_json::Value,
    attempts: i32,
    max_attempts: i32,
}

/// Takes the next due job of a kind this instance can run. Other kinds wait, e.g. for the
/// newer instances during a rolling update.
async fn claim(pool: &PgPool, kinds: &[&str]) -> sqlx::Result<Option<ClaimedJob>> {
    let row: Option<(Uuid, String, serde_json::Value, i32, i32)> = sqlx::query_as(
        "UPDATE jobs SET locked_until = now() + $1, attempts = attempts + 1
         WHERE id = (
           SELECT id FROM jobs
           WHERE run_at <= now() AND (locked_until IS NULL OR locked_until < now())
             AND kind = ANY($2)
           ORDER BY run_at
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         RETURNING id, kind, payload, attempts, max_attempts",
    )
    .bind(LOCK_TIMEOUT)
    .bind(kinds)
    .fetch_optional(pool)
    .await?;
    Ok(
        row.map(|(id, kind, payload, attempts, max_attempts)| ClaimedJob {
            id,
            kind,
            payload,
            attempts,
            max_attempts,
        }),
    )
}

/// Runs one due job. Returns false when there was none.
pub async fn run_next(state: &AppState, registry: &Registry) -> anyhow::Result<bool> {
    let kinds: Vec<&str> = registry.handlers.keys().copied().collect();
    let Some(job) = claim(&state.db, &kinds).await? else {
        return Ok(false);
    };
    let result = match registry.handlers.get(job.kind.as_str()) {
        Some(handler) => handler(state.clone(), job.payload).await,
        None => Err(anyhow::anyhow!("no handler for job kind {}", job.kind)),
    };
    match result {
        Ok(()) => {
            sqlx::query("DELETE FROM jobs WHERE id = $1")
                .bind(job.id)
                .execute(&state.db)
                .await?;
        }
        Err(err) => {
            tracing::error!(job = %job.id, kind = job.kind, attempt = job.attempts, error = ?err, "job failed");
            // Failed jobs stay in the table for inspection; 'infinity' means given up
            let retry_in = Duration::from_secs(30 * 2u64.pow(job.attempts.clamp(0, 10) as u32));
            sqlx::query(
                "UPDATE jobs SET locked_until = NULL, last_error = $2,
                   run_at = CASE WHEN attempts >= max_attempts THEN 'infinity' ELSE now() + $3 END
                 WHERE id = $1",
            )
            .bind(job.id)
            .bind(format!("{err:#}"))
            .bind(retry_in)
            .execute(&state.db)
            .await?;
            if job.attempts >= job.max_attempts {
                tracing::error!(job = %job.id, kind = job.kind, "job gave up");
            }
        }
    }
    Ok(true)
}

pub async fn run_worker(state: AppState, registry: Registry) {
    loop {
        match run_next(&state, &registry).await {
            Ok(true) => {}
            Ok(false) => tokio::time::sleep(IDLE_POLL).await,
            Err(err) => {
                tracing::error!(error = ?err, "job worker");
                tokio::time::sleep(IDLE_POLL).await;
            }
        }
    }
}

/// A recurring job; `schedule` is a cron pattern in UTC.
pub struct CronJob {
    pub name: &'static str,
    pub schedule: &'static str,
    pub kind: &'static str,
    pub payload: fn() -> serde_json::Value,
}

/// The recurring jobs. `run_crons` skips one whose handler is not registered.
pub const CRONS: &[CronJob] = &[
    CronJob {
        name: "cleanup orphaned uploads",
        schedule: "30 2 * * *",
        kind: "storage.cleanupOrphanedUploads",
        payload: || serde_json::json!({ "batchSize": 500 }),
    },
    // Offers of ended events can no longer be answered or redeemed
    CronJob {
        name: "expire offers of ended events",
        schedule: "5 * * * *",
        kind: "offers.expireOffersOfEndedEvents",
        payload: || serde_json::json!({}),
    },
    // Totals of users and items for the admin overview
    CronJob {
        name: "platform stats",
        schedule: "40 * * * *",
        kind: "moderation.refreshPlatformStats",
        payload: || serde_json::json!({}),
    },
    // Deleted accounts whose grace period is over lose their personal data
    CronJob {
        name: "anonymize deleted accounts",
        schedule: "15 3 * * *",
        kind: "users.anonymizeDueAccounts",
        payload: || serde_json::json!({}),
    },
    // Info mail the evening before a bazaar and pickup reminder after it
    CronJob {
        name: "seller reminders",
        schedule: "0 * * * *",
        kind: "reminders.sendDueReminders",
        payload: || serde_json::json!({}),
    },
];

/// Enqueues the cron job if its latest slot up to `now` has not been enqueued yet, by
/// this or another instance. A slot missed while no instance ran is caught up.
pub async fn schedule_cron(
    pool: &PgPool,
    cron: &CronJob,
    now: DateTime<Utc>,
) -> anyhow::Result<bool> {
    let pattern = Cron::from_str(cron.schedule)?;
    let slot = pattern.find_previous_occurrence(&now, true)?;
    let mut tx = pool.begin().await?;
    let advanced: Option<String> = sqlx::query_scalar(
        "INSERT INTO cron_runs (name, last_slot) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET last_slot = EXCLUDED.last_slot
           WHERE cron_runs.last_slot < EXCLUDED.last_slot
         RETURNING name",
    )
    .bind(cron.name)
    .bind(slot)
    .fetch_optional(&mut *tx)
    .await?;
    if advanced.is_some() {
        enqueue(&mut tx, cron.kind, &(cron.payload)(), now).await?;
    }
    tx.commit().await?;
    Ok(advanced.is_some())
}

pub async fn run_crons(pool: PgPool, registry: Registry) {
    let crons: Vec<&CronJob> = CRONS
        .iter()
        .filter(|cron| {
            let known = registry.contains(cron.kind);
            if !known {
                tracing::warn!(cron = cron.name, "cron job without handler, skipped");
            }
            known
        })
        .collect();
    loop {
        for cron in &crons {
            if let Err(err) = schedule_cron(&pool, cron, Utc::now()).await {
                tracing::error!(cron = cron.name, error = ?err, "scheduling cron job");
            }
        }
        tokio::time::sleep(CRON_TICK).await;
    }
}
