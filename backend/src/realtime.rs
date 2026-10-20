//! Live updates (replaces the reactive `useQuery` of Convex).
//!
//! Mutations name the data they changed as topics, e.g. `event:<id>`. `touch` sends them
//! with `pg_notify` inside the mutation's transaction, so Postgres delivers them only
//! after the commit and to every backend instance. Each instance forwards them to its
//! WebSocket clients that subscribed to the topic; the client then refetches its queries.

use std::collections::HashSet;

use axum::extract::State;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use sqlx::postgres::PgListener;
use sqlx::{PgConnection, PgPool};
use tokio::sync::broadcast;

use crate::AppState;
use crate::auth::AuthUser;

pub const CHANNEL: &str = "bazarpro_invalidate";

/// A changed piece of data that clients can subscribe to.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Topic {
    /// Everything shown on an event page (details, products, sellers, sales)
    Event(uuid::Uuid),
    Product(uuid::Uuid),
    /// Data only this user sees: own products, sales, offers, notices
    User(uuid::Uuid),
    /// Lists across all events (overview, admin dashboard)
    Events,
    /// Admin views: reports, moderation log, messages, settings
    Admin,
}

impl Topic {
    pub fn key(&self) -> String {
        match self {
            Self::Event(id) => format!("event:{id}"),
            Self::Product(id) => format!("product:{id}"),
            Self::User(id) => format!("user:{id}"),
            Self::Events => "events".to_owned(),
            Self::Admin => "admin".to_owned(),
        }
    }
}

/// Marks topics as changed. Call it in the transaction of the change; the notification is
/// sent when the transaction commits and dropped when it rolls back.
pub async fn touch(conn: &mut PgConnection, topics: &[Topic]) -> sqlx::Result<()> {
    if topics.is_empty() {
        return Ok(());
    }
    let keys: Vec<String> = topics.iter().map(Topic::key).collect();
    sqlx::query("SELECT pg_notify($1, $2)")
        .bind(CHANNEL)
        .bind(keys.join(","))
        .execute(conn)
        .await?;
    Ok(())
}

/// Topics changed on any instance, received from Postgres.
#[derive(Clone)]
pub struct Hub {
    sender: broadcast::Sender<String>,
}

impl Hub {
    pub fn new() -> Self {
        let (sender, _) = broadcast::channel(1024);
        Self { sender }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<String> {
        self.sender.subscribe()
    }

    /// Forwards the Postgres notifications to the hub until the process ends. PgListener
    /// reconnects by itself; notifications sent while it was disconnected are lost, so
    /// clients get `resync` and refetch everything.
    pub async fn listen(self, pool: PgPool) -> anyhow::Result<()> {
        let mut listener = PgListener::connect_with(&pool).await?;
        listener.listen(CHANNEL).await?;
        loop {
            match listener.try_recv().await? {
                Some(notification) => {
                    for key in notification.payload().split(',') {
                        let _ = self.sender.send(key.to_owned());
                    }
                }
                None => {
                    tracing::warn!("lost the connection for live updates, reconnecting");
                    let _ = self.sender.send(RESYNC.to_owned());
                }
            }
        }
    }
}

impl Default for Hub {
    fn default() -> Self {
        Self::new()
    }
}

/// Sent to all clients when changes may have been missed.
const RESYNC: &str = "*";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum ClientMessage {
    Subscribe { topics: Vec<String> },
    Unsubscribe { topics: Vec<String> },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum ServerMessage<'a> {
    Invalidate { topics: Vec<&'a str> },
    Resync,
}

pub async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    current: Option<AuthUser>,
) -> Response {
    let user = current.map(|current| current.user_id);
    ws.on_upgrade(move |socket| serve_socket(socket, state.hub.subscribe(), user))
}

/// Whether the client may follow the topic: `user:<id>` only for the own user, so nobody
/// learns when someone else gets sales or offers.
fn may_subscribe(key: &str, user: Option<uuid::Uuid>) -> bool {
    match key.strip_prefix("user:") {
        Some(id) => user.is_some_and(|user| user.to_string() == id),
        None => true,
    }
}

async fn serve_socket(
    socket: WebSocket,
    mut changes: broadcast::Receiver<String>,
    user: Option<uuid::Uuid>,
) {
    let (mut tx, mut rx) = socket.split();
    let mut topics: HashSet<String> = HashSet::new();

    loop {
        tokio::select! {
            incoming = rx.next() => {
                let Some(Ok(message)) = incoming else { break };
                let Message::Text(text) = message else { continue };
                match serde_json::from_str::<ClientMessage>(&text) {
                    Ok(ClientMessage::Subscribe { topics: keys }) => {
                        topics.extend(keys.into_iter().filter(|key| may_subscribe(key, user)));
                    }
                    Ok(ClientMessage::Unsubscribe { topics: keys }) => {
                        for key in keys {
                            topics.remove(&key);
                        }
                    }
                    Err(err) => tracing::debug!(%err, "ignored websocket message"),
                }
            }
            change = changes.recv() => {
                let key = match change {
                    Ok(key) => key,
                    // This client fell behind; it cannot know what it missed
                    Err(broadcast::error::RecvError::Lagged(_)) => RESYNC.to_owned(),
                    Err(broadcast::error::RecvError::Closed) => break,
                };
                let reply = if key == RESYNC {
                    ServerMessage::Resync
                } else if topics.contains(&key) {
                    ServerMessage::Invalidate { topics: vec![key.as_str()] }
                } else {
                    continue;
                };
                let text = serde_json::to_string(&reply).expect("serializable");
                if tx.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_topics_are_private() {
        let me = uuid::Uuid::new_v4();
        assert!(may_subscribe(&format!("user:{me}"), Some(me)));
        assert!(!may_subscribe(
            &format!("user:{}", uuid::Uuid::new_v4()),
            Some(me)
        ));
        assert!(!may_subscribe(&format!("user:{me}"), None));
        assert!(may_subscribe("events", None));
    }
}
