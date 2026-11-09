//! Background jobs and cron jobs.
//!
//! `enqueue` writes the job in the caller's transaction, like `ctx.scheduler.runAfter`:
//! a mutation that rolls back schedules nothing. Every instance with `RUN_WORKERS` runs a
//! worker; Postgres row locks make sure each job and each cron slot runs only once.
//!
//! A running job holds a lease: its worker renews `locked_until` while the handler runs.
//! Only a job whose worker stopped renewing (crashed instance) is taken over by another
//! worker, so a long job does not run twice (#142).

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

const IDLE_POLL: Duration = Duration::from_secs(1);
const CRON_TICK: Duration = Duration::from_secs(20);

/// How long a job stays locked without renewal, and how often its worker renews the lock.
#[derive(Clone, Copy, Debug)]
pub struct Lease {
    /// After this time without renewal another instance takes the job over.
    pub timeout: Duration,
    pub renew_every: Duration,
}

impl Lease {
    pub const DEFAULT: Lease = Lease {
        timeout: Duration::from_secs(300),
        renew_every: Duration::from_secs(60),
    };
}

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
    /// This worker's claim; a worker that took the job over has another one
    owner: Uuid,
    kind: String,
    payload: serde_json::Value,
    attempts: i32,
    max_attempts: i32,
}

/// Takes the next due job of a kind this instance can run. Other kinds wait, e.g. for the
/// newer instances during a rolling update.
async fn claim(pool: &PgPool, kinds: &[&str], lease: Lease) -> sqlx::Result<Option<ClaimedJob>> {
    let owner = Uuid::new_v4();
    let row: Option<(Uuid, String, serde_json::Value, i32, i32)> = sqlx::query_as(
        "UPDATE jobs SET locked_until = now() + $1, locked_by = $3, attempts = attempts + 1
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
    .bind(lease.timeout)
    .bind(kinds)
    .bind(owner)
    .fetch_optional(pool)
    .await?;
    Ok(
        row.map(|(id, kind, payload, attempts, max_attempts)| ClaimedJob {
            id,
            owner,
            kind,
            payload,
            attempts,
            max_attempts,
        }),
    )
}

/// Extends the lock of a running job. False when another worker has taken it over.
async fn renew(pool: &PgPool, job: &ClaimedJob, lease: Lease) -> sqlx::Result<bool> {
    let result =
        sqlx::query("UPDATE jobs SET locked_until = now() + $3 WHERE id = $1 AND locked_by = $2")
            .bind(job.id)
            .bind(job.owner)
            .bind(lease.timeout)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

enum Outcome {
    Done(anyhow::Result<()>),
    /// Another worker took the job over; it finishes the job
    Lost,
}

/// Runs the handler and renews the lock until it is done. Stops the handler when the lock
/// was lost, so the job does not run twice at the same time.
async fn run_leased(
    state: &AppState,
    registry: &Registry,
    job: &ClaimedJob,
    lease: Lease,
) -> Outcome {
    let Some(handler) = registry.handlers.get(job.kind.as_str()) else {
        return Outcome::Done(Err(anyhow::anyhow!("no handler for job kind {}", job.kind)));
    };
    let mut running = handler(state.clone(), job.payload.clone());
    let mut renewal = tokio::time::interval_at(
        tokio::time::Instant::now() + lease.renew_every,
        lease.renew_every,
    );
    renewal.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            result = &mut running => return Outcome::Done(result),
            _ = renewal.tick() => match renew(&state.db, job, lease).await {
                Ok(true) => {}
                Ok(false) => return Outcome::Lost,
                // Try again on the next tick; the lock lasts several renewals
                Err(err) => tracing::warn!(job = %job.id, kind = job.kind, error = ?err, "renewing job lock"),
            },
        }
    }
}

/// Runs one due job. Returns false when there was none.
pub async fn run_next(state: &AppState, registry: &Registry) -> anyhow::Result<bool> {
    run_next_with(state, registry, Lease::DEFAULT).await
}

/// `run_next` with another lease, for tests.
pub async fn run_next_with(
    state: &AppState,
    registry: &Registry,
    lease: Lease,
) -> anyhow::Result<bool> {
    let kinds: Vec<&str> = registry.handlers.keys().copied().collect();
    let Some(job) = claim(&state.db, &kinds, lease).await? else {
        return Ok(false);
    };
    match run_leased(state, registry, &job, lease).await {
        Outcome::Lost => {
            tracing::error!(job = %job.id, kind = job.kind, "job lock lost, stopped; another worker runs it");
        }
        Outcome::Done(Ok(())) => {
            sqlx::query("DELETE FROM jobs WHERE id = $1 AND locked_by = $2")
                .bind(job.id)
                .bind(job.owner)
                .execute(&state.db)
                .await?;
        }
        Outcome::Done(Err(err)) => {
            tracing::error!(job = %job.id, kind = job.kind, attempt = job.attempts, error = ?err, "job failed");
            // Failed jobs stay in the table for inspection; 'infinity' means given up
            let retry_in = Duration::from_secs(30 * 2u64.pow(job.attempts.clamp(0, 10) as u32));
            sqlx::query(
                "UPDATE jobs SET locked_until = NULL, locked_by = NULL, last_error = $3,
                   run_at = CASE WHEN attempts >= max_attempts THEN 'infinity' ELSE now() + $4 END
                 WHERE id = $1 AND locked_by = $2",
            )
            .bind(job.id)
            .bind(job.owner)
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
    // Deadlines of bazaars, items and old data; anonymizes deleted accounts (#169)
    CronJob {
        name: "retention",
        schedule: "15 3 * * *",
        kind: "retention.run",
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
