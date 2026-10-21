//! The contact form; admins read the messages in the moderation area.

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

async fn send_message(ctx: &mut Ctx, args: SendArgs) -> AppResult<Uuid> {
    if !args.accepted_privacy_policy {
        return Err(AppError::bad_request("account.privacyRequired"));
    }
    let id = sqlx::query_scalar(
        "INSERT INTO contact_messages (name, email, message, accepted_privacy_policy)
         VALUES ($1, $2, $3, true) RETURNING id",
    )
    .bind(args.name)
    .bind(args.email)
    .bind(args.message)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(id)
}
