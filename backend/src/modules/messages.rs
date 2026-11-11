//! The contact form; admins read the messages in the moderation area.

use axum::http::StatusCode;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};

pub fn register(registry: &mut Registry) {
    register!(registry, Mutation "messages.sendMessage" => send_message);
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SendArgs {
    name: String,
    email: String,
    message: String,
    accepted_privacy_policy: bool,
}

const MAX_NAME_LENGTH: usize = 200;
/// The longest address SMTP allows
const MAX_EMAIL_LENGTH: usize = 254;
const MAX_MESSAGE_LENGTH: usize = 5000;
/// The form needs no login, so only a cap for all senders together keeps a script from
/// filling the table and the inbox of the admins (as for anonymous reports).
const MAX_MESSAGES_PER_HOUR: i64 = 30;

/// Enough to answer to: something on both sides of one `@`, no spaces.
fn is_email(email: &str) -> bool {
    match email.split_once('@') {
        Some((local, domain)) => {
            !local.is_empty()
                && domain.contains('.')
                && !domain.starts_with('.')
                && !domain.ends_with('.')
                && !domain.contains('@')
                && !email.chars().any(char::is_whitespace)
        }
        None => false,
    }
}

async fn send_message(ctx: &mut Ctx, args: SendArgs) -> AppResult<Uuid> {
    if !args.accepted_privacy_policy {
        return Err(AppError::bad_request("account.privacyRequired"));
    }
    let (name, email, message) = (args.name.trim(), args.email.trim(), args.message.trim());
    if name.is_empty() || message.is_empty() {
        return Err(AppError::bad_request("contact.incomplete"));
    }
    if email.len() > MAX_EMAIL_LENGTH || !is_email(email) {
        return Err(AppError::bad_request("contact.invalidEmail"));
    }
    if name.chars().count() > MAX_NAME_LENGTH || message.chars().count() > MAX_MESSAGE_LENGTH {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "contact.tooLong",
            &[("max", &MAX_MESSAGE_LENGTH.to_string())],
        ));
    }
    let last_hour: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM contact_messages WHERE created_at >= now() - interval '1 hour'",
    )
    .fetch_one(ctx.conn())
    .await?;
    if last_hour >= MAX_MESSAGES_PER_HOUR {
        return Err(AppError::too_many_requests("contact.rateLimited"));
    }
    let id = sqlx::query_scalar(
        "INSERT INTO contact_messages (name, email, message, accepted_privacy_policy)
         VALUES ($1, $2, $3, true) RETURNING id",
    )
    .bind(name)
    .bind(email)
    .bind(message)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(id)
}
