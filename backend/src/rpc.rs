//! Queries and mutations: `useQuery(api.categories.getAllCategories, args)` is
//! `POST /api/query/categories.getAllCategories` with these arguments.
//!
//! A query runs in a read-only snapshot and answers `{value, topics}`: the topics are
//! what it read, the client subscribes to them on the WebSocket and refetches when a
//! mutation touches one. A mutation runs serializable and is retried
//! when it conflicts with a parallel one; its touched topics are sent on commit.
//! Internal functions (internalQuery/internalMutation) can only be run from the CLI.

use std::collections::HashMap;
use std::sync::LazyLock;

use axum::Json;
use axum::extract::{Path, State};
use std::io::Write;

use axum::http::{HeaderMap, StatusCode, header};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use flate2::Compression;
use flate2::write::GzEncoder;
use futures::future::BoxFuture;
use serde_json::{Value, json};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::AppState;
use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::realtime::{self, Topic};

/// Database work of a function, with the signed-in user and the topics read or touched.
pub struct Ctx {
    pub state: AppState,
    pub user: Option<Uuid>,
    pub tx: Transaction<'static, Postgres>,
    topics: Vec<Topic>,
}

impl Ctx {
    /// The query read this; the client refetches when it changes.
    pub fn read(&mut self, topic: Topic) {
        if !self.topics.contains(&topic) {
            self.topics.push(topic);
        }
    }

    /// The mutation changed this.
    pub fn touch(&mut self, topic: Topic) {
        self.read(topic);
    }

    pub fn require_user(&self) -> AppResult<Uuid> {
        self.user
            .ok_or_else(|| AppError::unauthorized("auth.required"))
    }

    pub fn conn(&mut self) -> &mut sqlx::PgConnection {
        &mut self.tx
    }

    /// A transaction for many calls in a row, e.g. the demo data; ends with `commit`.
    pub async fn begin(state: &AppState) -> AppResult<Self> {
        Ok(Self {
            state: state.clone(),
            user: None,
            tx: state.db.begin().await?,
            topics: Vec::new(),
        })
    }

    /// Runs a function as `user` in this transaction, like a request of that user.
    pub async fn call(&mut self, user: Option<Uuid>, name: &str, args: Value) -> AppResult<Value> {
        let (_, handler) = FUNCTIONS.get(name).ok_or_else(|| {
            AppError::coded(
                StatusCode::NOT_FOUND,
                "FUNCTION_NOT_FOUND",
                &[("name", name)],
            )
        })?;
        let caller = std::mem::replace(&mut self.user, user);
        let result = handler(self, args).await;
        self.user = caller;
        result
    }

    pub async fn commit(mut self) -> AppResult<()> {
        realtime::touch(&mut self.tx, &self.topics).await?;
        self.tx.commit().await?;
        Ok(())
    }
}

pub type Handler = for<'a> fn(&'a mut Ctx, Value) -> BoxFuture<'a, AppResult<Value>>;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Query,
    Mutation,
    InternalQuery,
    InternalMutation,
}

#[derive(Default)]
pub struct Registry {
    functions: HashMap<&'static str, (Kind, Handler)>,
}

impl Registry {
    pub fn add(&mut self, name: &'static str, kind: Kind, handler: Handler) {
        let previous = self.functions.insert(name, (kind, handler));
        assert!(previous.is_none(), "function {name} registered twice");
    }

    pub fn get(&self, name: &str) -> Option<(Kind, Handler)> {
        self.functions.get(name).copied()
    }

    pub fn names(&self) -> impl Iterator<Item = (&'static str, Kind)> + '_ {
        self.functions
            .iter()
            .map(|(name, (kind, _))| (*name, *kind))
    }
}

/// Registers an async fn `(ctx: &mut Ctx, args: T) -> AppResult<R>` under its API name;
/// `T` is deserialized from the arguments, `R` serialized as the result.
#[macro_export]
macro_rules! register {
    ($registry:expr, $kind:ident $name:literal => $function:path) => {{
        fn handler<'a>(
            ctx: &'a mut $crate::rpc::Ctx,
            args: serde_json::Value,
        ) -> futures::future::BoxFuture<'a, $crate::error::AppResult<serde_json::Value>> {
            Box::pin(async move {
                let args = serde_json::from_value(args).map_err($crate::rpc::invalid_args)?;
                let result = $function(ctx, args).await?;
                Ok(serde_json::to_value(result).map_err(anyhow::Error::from)?)
            })
        }
        $registry.add($name, $crate::rpc::Kind::$kind, handler);
    }};
}

pub fn invalid_args(err: serde_json::Error) -> AppError {
    AppError::coded(
        StatusCode::BAD_REQUEST,
        "INVALID_ARGUMENTS",
        &[("details", &err.to_string())],
    )
}

pub static FUNCTIONS: LazyLock<Registry> = LazyLock::new(crate::modules::register_all);

/// Mutations conflicting with a parallel one are retried. The wait
/// grows and is random, so parallel retries do not collide again in step.
const MAX_ATTEMPTS: u32 = 30;
const MAX_BACKOFF_MS: u64 = 1000;

fn backoff(attempt: u32) -> std::time::Duration {
    let ceiling = (1u64 << attempt.min(10)).min(MAX_BACKOFF_MS);
    std::time::Duration::from_millis(rand::random_range(0..=ceiling))
}

fn is_conflict(err: &AppError) -> bool {
    match err {
        AppError::Database(sqlx::Error::Database(db)) => {
            // serialization_failure, deadlock_detected
            matches!(db.code().as_deref(), Some("40001" | "40P01"))
        }
        _ => false,
    }
}

async fn run_query(
    state: &AppState,
    user: Option<Uuid>,
    handler: Handler,
    args: Value,
) -> AppResult<(Value, Vec<Topic>)> {
    let mut ctx = Ctx {
        state: state.clone(),
        user,
        tx: state
            .db
            .begin_with("BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            .await?,
        topics: Vec::new(),
    };
    let result = handler(&mut ctx, args).await;
    // Explicitly, also after an error: the connection goes back to the pool clean
    ctx.tx.rollback().await?;
    Ok((result?, ctx.topics))
}

/// Demo and test data (seed.*, only allowed on test instances) is written in large
/// transactions that would lose every serialization conflict against the small mutations
/// running next to them, e.g. in parallel end-to-end tests.
fn begin_statement(name: &str) -> &'static str {
    if name.starts_with("seed.") {
        "BEGIN ISOLATION LEVEL READ COMMITTED"
    } else {
        "BEGIN ISOLATION LEVEL SERIALIZABLE"
    }
}

async fn run_mutation(
    state: &AppState,
    user: Option<Uuid>,
    name: &str,
    handler: Handler,
    args: Value,
) -> AppResult<(Value, Vec<Topic>)> {
    let mut attempt = 1;
    loop {
        let result = async {
            // Held while the transaction is open, released while waiting for a retry
            let _permit = state.mutations.acquire().await.expect("never closed");
            let mut ctx = Ctx {
                state: state.clone(),
                user,
                tx: state.db.begin_with(begin_statement(name)).await?,
                topics: Vec::new(),
            };
            let work = async {
                // Serializable transactions lock what they read: a sequential scan locks the
                // whole table, so every parallel write to it counts as a conflict. Index
                // scans only lock the rows (see "Serializable Isolation Level" in the
                // Postgres docs); without a usable index the planner still scans.
                sqlx::query("SET LOCAL enable_seqscan = off")
                    .execute(ctx.conn())
                    .await?;
                let value = handler(&mut ctx, args.clone()).await?;
                realtime::touch(&mut ctx.tx, &ctx.topics).await?;
                Ok::<_, AppError>(value)
            }
            .await;
            match work {
                Ok(value) => {
                    ctx.tx.commit().await?;
                    Ok((value, ctx.topics))
                }
                Err(err) => {
                    // Explicitly: the connection goes back to the pool clean
                    let _ = ctx.tx.rollback().await;
                    Err(err)
                }
            }
        }
        .await;
        match result {
            Err(err) if is_conflict(&err) && attempt < MAX_ATTEMPTS => {
                tracing::debug!(function = name, attempt, "mutation conflicted, retrying");
                tokio::time::sleep(backoff(attempt)).await;
                attempt += 1;
            }
            Err(err) if is_conflict(&err) => {
                tracing::error!(
                    function = name,
                    attempts = attempt,
                    "mutation kept conflicting, gave up"
                );
                return Err(err);
            }
            // Visible in the normal logs: how often parallel mutations get in each other's way
            result => {
                if attempt > 1 && result.is_ok() {
                    tracing::info!(
                        function = name,
                        attempts = attempt,
                        "mutation needed retries"
                    );
                }
                return result;
            }
        }
    }
}

fn find(name: &str, allowed: Kind) -> AppResult<Handler> {
    match FUNCTIONS.get(name) {
        Some((kind, handler)) if kind == allowed => Ok(handler),
        _ => Err(AppError::coded(
            StatusCode::NOT_FOUND,
            "FUNCTION_NOT_FOUND",
            &[("name", name)],
        )),
    }
}

/// A shared answer: the JSON and, made once, its gzip for clients that accept it.
#[derive(Clone)]
pub struct Answer {
    json: Bytes,
    gzip: Bytes,
}

impl Answer {
    fn new(json: Vec<u8>) -> anyhow::Result<Self> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&json)?;
        Ok(Self {
            gzip: encoder.finish()?.into(),
            json: json.into(),
        })
    }
}

pub async fn query_handler(
    State(state): State<AppState>,
    Path(name): Path<String>,
    current: Option<AuthUser>,
    headers: HeaderMap,
    Json(args): Json<Value>,
) -> AppResult<Response> {
    let handler = find(&name, Kind::Query)?;
    let user = current.map(|c| c.user_id);
    let answer = async {
        let (value, topics) = run_query(&state, user, handler, args.clone()).await?;
        let topics: Vec<String> = topics.iter().map(Topic::key).collect();
        let body = serde_json::to_vec(&json!({ "value": value, "topics": topics }))
            .map_err(anyhow::Error::from)?;
        AppResult::Ok((body, topics))
    };
    let json_response = |body| ([(header::CONTENT_TYPE, "application/json")], body).into_response();
    // Visitors share answers; what a signed-in user sees can depend on them
    if user.is_some() {
        return Ok(json_response(Bytes::from(answer.await?.0)));
    }
    let key = format!("{name}\n{args}");
    let shared = state
        .hub
        .cache
        .get_or_compute(key, || async {
            let (body, topics) = answer.await?;
            Ok((Answer::new(body)?, topics))
        })
        .await?;
    let accepts_gzip = headers
        .get_all(header::ACCEPT_ENCODING)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .any(|value| value.contains("gzip"));
    if !accepts_gzip {
        return Ok(json_response(shared.json));
    }
    // Already compressed: the compression layer passes it on as it is
    Ok((
        [
            (header::CONTENT_TYPE, "application/json"),
            (header::CONTENT_ENCODING, "gzip"),
            (header::VARY, "accept-encoding"),
        ],
        shared.gzip,
    )
        .into_response())
}

/// Queries per batch: the app loads a whole bazaar for offline use in a few requests.
const MAX_BATCH: usize = 500;
/// Queries of a batch running at the same time; each holds a database connection.
const BATCH_PARALLEL: usize = 4;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchCall {
    name: String,
    args: Value,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BatchArgs {
    calls: Vec<BatchCall>,
}

/// Many queries in one request, each answered like `POST /api/query/<name>`, or null
/// when it failed (unknown, not allowed, invalid arguments). For the offline copy of the
/// app, which keeps the answers as if it had asked one by one.
pub async fn batch_query_handler(
    State(state): State<AppState>,
    current: Option<AuthUser>,
    Json(args): Json<BatchArgs>,
) -> AppResult<Json<Value>> {
    use futures::StreamExt;
    if args.calls.len() > MAX_BATCH {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "INVALID_ARGUMENTS",
            &[("details", &format!("at most {MAX_BATCH} calls"))],
        ));
    }
    let user = current.map(|c| c.user_id);
    let results: Vec<Value> = futures::stream::iter(args.calls)
        .map(|call| {
            let state = state.clone();
            async move {
                let Ok(handler) = find(&call.name, Kind::Query) else {
                    return Value::Null;
                };
                match run_query(&state, user, handler, call.args).await {
                    Ok((value, topics)) => {
                        let topics: Vec<String> = topics.iter().map(Topic::key).collect();
                        json!({ "value": value, "topics": topics })
                    }
                    Err(_) => Value::Null,
                }
            }
        })
        .buffered(BATCH_PARALLEL)
        .collect()
        .await;
    Ok(Json(json!({ "results": results })))
}

pub async fn mutation_handler(
    State(state): State<AppState>,
    Path(name): Path<String>,
    current: Option<AuthUser>,
    Json(args): Json<Value>,
) -> AppResult<Json<Value>> {
    let handler = find(&name, Kind::Mutation)?;
    let user = current.map(|c| c.user_id);
    let (value, topics) = run_mutation(&state, user, &name, handler, args).await?;
    // The client refetches its queries of these before the call resolves, so it sees the
    // change right away; other users' topics stay private, like on the WebSocket
    let topics: Vec<String> = topics
        .iter()
        .map(Topic::key)
        .filter(|key| realtime::may_subscribe(key, user))
        .collect();
    Ok(Json(json!({ "value": value, "topics": topics })))
}

/// Calls any function as the given user (or none): CLI `run` and tests.
pub async fn call(
    state: &AppState,
    user: Option<Uuid>,
    name: &str,
    args: Value,
) -> AppResult<Value> {
    let (kind, handler) = FUNCTIONS.get(name).ok_or_else(|| {
        AppError::coded(
            StatusCode::NOT_FOUND,
            "FUNCTION_NOT_FOUND",
            &[("name", name)],
        )
    })?;
    match kind {
        Kind::Query | Kind::InternalQuery => Ok(run_query(state, user, handler, args).await?.0),
        Kind::Mutation | Kind::InternalMutation => {
            Ok(run_mutation(state, user, name, handler, args).await?.0)
        }
    }
}
