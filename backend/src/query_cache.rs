//! Answers of queries without a signed-in user, shared by all visitors (what Convex does
//! with its query cache). On a bazaar day every sale tells all open event pages to
//! refetch; without the cache each of them would run the same query again.
//!
//! An answer is kept until a mutation touches one of its topics: `realtime::Hub` drops it
//! before it forwards the change to the WebSockets, so the refetch of the clients already
//! misses. Parallel misses of the same query wait for one computation. The cache only
//! works while the hub listens to Postgres; without it nobody would hear of changes.

use std::collections::HashMap;
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;
use tokio::sync::OnceCell;

use crate::error::AppResult;

/// Also bounds answers that depend on the time (e.g. upcoming events) or read something
/// without naming its topic.
const MAX_AGE: Duration = Duration::from_secs(10);
/// Arguments come from the client: beyond this, queries run uncached.
const MAX_ENTRIES: usize = 1000;

#[derive(Clone, Default)]
pub struct QueryCache {
    inner: Arc<Inner>,
}

#[derive(Default)]
struct Inner {
    live: AtomicBool,
    entries: Mutex<HashMap<String, Entry>>,
}

type Cell = Arc<OnceCell<Bytes>>;

struct Entry {
    cell: Cell,
    /// Empty until the answer is computed
    topics: Vec<String>,
    created: Instant,
}

impl QueryCache {
    /// The cached answer for `key`, or the one `compute` returns with the topics it read.
    pub async fn get_or_compute<F, Fut>(&self, key: String, compute: F) -> AppResult<Bytes>
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = AppResult<(Bytes, Vec<String>)>>,
    {
        let Some(cell) = self.cell(&key) else {
            return Ok(compute().await?.0);
        };
        let answer = cell
            .get_or_try_init(|| async {
                let (answer, topics) = compute().await?;
                self.set_topics(&key, &cell, topics);
                AppResult::Ok(answer)
            })
            .await?;
        Ok(answer.clone())
    }

    fn cell(&self, key: &str) -> Option<Cell> {
        if !self.inner.live.load(Ordering::Acquire) {
            return None;
        }
        let mut entries = self.inner.entries.lock().unwrap();
        if let Some(entry) = entries.get(key)
            && entry.created.elapsed() < MAX_AGE
        {
            return Some(entry.cell.clone());
        }
        if entries.len() >= MAX_ENTRIES {
            entries.retain(|_, entry| entry.created.elapsed() < MAX_AGE);
            if entries.len() >= MAX_ENTRIES {
                return None;
            }
        }
        let cell = Cell::default();
        entries.insert(
            key.to_owned(),
            Entry {
                cell: cell.clone(),
                topics: Vec::new(),
                created: Instant::now(),
            },
        );
        Some(cell)
    }

    fn set_topics(&self, key: &str, cell: &Cell, topics: Vec<String>) {
        let mut entries = self.inner.entries.lock().unwrap();
        if let Some(entry) = entries.get_mut(key)
            && Arc::ptr_eq(&entry.cell, cell)
        {
            entry.topics = topics;
        }
    }

    /// A mutation changed `topic`. Answers still being computed go too: they may have read
    /// the data before the change. Their callers get them, later requests compute anew.
    pub fn invalidate(&self, topic: &str) {
        self.inner.entries.lock().unwrap().retain(|_, entry| {
            entry.cell.initialized() && !entry.topics.iter().any(|t| t == topic)
        });
    }

    /// The hub listens (again): everything cached before may have missed changes.
    pub fn start(&self) {
        self.inner.entries.lock().unwrap().clear();
        self.inner.live.store(true, Ordering::Release);
    }

    /// The hub lost Postgres; until it listens again, queries run uncached.
    pub fn stop(&self) {
        self.inner.live.store(false, Ordering::Release);
        self.inner.entries.lock().unwrap().clear();
    }

    pub fn is_live(&self) -> bool {
        self.inner.live.load(Ordering::Acquire)
    }

    pub fn len(&self) -> usize {
        self.inner.entries.lock().unwrap().len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicUsize;

    use super::*;

    fn answer(text: &'static str, topics: &[&str]) -> AppResult<(Bytes, Vec<String>)> {
        Ok((
            Bytes::from_static(text.as_bytes()),
            topics.iter().map(|t| t.to_string()).collect(),
        ))
    }

    #[tokio::test]
    async fn computes_every_time_while_not_listening() {
        let cache = QueryCache::default();
        let runs = AtomicUsize::new(0);
        for _ in 0..2 {
            cache
                .get_or_compute("q".into(), || async {
                    runs.fetch_add(1, Ordering::SeqCst);
                    answer("a", &["event:1"])
                })
                .await
                .unwrap();
        }
        assert_eq!(runs.load(Ordering::SeqCst), 2);
        assert!(cache.is_empty());
    }

    #[tokio::test]
    async fn keeps_an_answer_until_its_topic_changes() {
        let cache = QueryCache::default();
        cache.start();
        let first = cache
            .get_or_compute("q".into(), || async { answer("old", &["event:1"]) })
            .await
            .unwrap();
        let cached = cache
            .get_or_compute("q".into(), || async { answer("new", &["event:1"]) })
            .await
            .unwrap();
        assert_eq!((&first[..], &cached[..]), (&b"old"[..], &b"old"[..]));

        cache.invalidate("event:2");
        let unrelated = cache
            .get_or_compute("q".into(), || async { answer("new", &["event:1"]) })
            .await
            .unwrap();
        assert_eq!(&unrelated[..], b"old");

        cache.invalidate("event:1");
        let fresh = cache
            .get_or_compute("q".into(), || async { answer("new", &["event:1"]) })
            .await
            .unwrap();
        assert_eq!(&fresh[..], b"new");
    }

    #[tokio::test]
    async fn parallel_misses_compute_once() {
        let cache = QueryCache::default();
        cache.start();
        let runs = AtomicUsize::new(0);
        let calls = (0..20).map(|_| {
            cache.get_or_compute("q".into(), || async {
                runs.fetch_add(1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_millis(20)).await;
                answer("a", &["events"])
            })
        });
        for result in futures::future::join_all(calls).await {
            assert_eq!(&result.unwrap()[..], b"a");
        }
        assert_eq!(runs.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn a_change_during_the_computation_is_not_cached_over() {
        let cache = QueryCache::default();
        cache.start();
        let stale = cache.get_or_compute("q".into(), || async {
            // A mutation commits while the query still reads the old data
            cache.invalidate("event:1");
            answer("old", &["event:1"])
        });
        assert_eq!(&stale.await.unwrap()[..], b"old");
        let fresh = cache
            .get_or_compute("q".into(), || async { answer("new", &["event:1"]) })
            .await
            .unwrap();
        assert_eq!(&fresh[..], b"new");
    }

    #[tokio::test]
    async fn errors_are_not_cached() {
        let cache = QueryCache::default();
        cache.start();
        let failed = cache
            .get_or_compute("q".into(), || async {
                Err(crate::error::AppError::bad_request("x"))
            })
            .await;
        assert!(failed.is_err());
        let ok = cache
            .get_or_compute("q".into(), || async { answer("a", &[]) })
            .await
            .unwrap();
        assert_eq!(&ok[..], b"a");
    }

    #[tokio::test]
    async fn stop_turns_the_cache_off() {
        let cache = QueryCache::default();
        cache.start();
        cache
            .get_or_compute("q".into(), || async { answer("a", &[]) })
            .await
            .unwrap();
        cache.stop();
        assert!(cache.is_empty());
        let after = cache
            .get_or_compute("q".into(), || async { answer("b", &[]) })
            .await
            .unwrap();
        assert_eq!(&after[..], b"b");
    }
}
