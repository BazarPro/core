//! Feature flags. The flags themselves are read with
//! `crate::flags`; this is the public query and the internal setter.

use std::collections::BTreeMap;

use serde::Deserialize;

use crate::error::AppResult;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};

const TOPIC: Topic = Topic::Table("feature_flags");

pub fn register(registry: &mut Registry) {
    register!(registry, Query "featureFlags.get" => get);
    register!(registry, InternalMutation "featureFlags.set" => set);
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GetArgs {
    key: Option<String>,
}

/// One flag (`{key: value}`, `{}` if unset) or all flags.
async fn get(ctx: &mut Ctx, args: GetArgs) -> AppResult<BTreeMap<String, bool>> {
    ctx.read(TOPIC);
    let rows: Vec<(String, bool)> = match args.key {
        Some(key) => {
            sqlx::query_as("SELECT key, value FROM feature_flags WHERE key = $1")
                .bind(key)
                .fetch_all(ctx.conn())
                .await?
        }
        None => {
            sqlx::query_as("SELECT key, value FROM feature_flags")
                .fetch_all(ctx.conn())
                .await?
        }
    };
    Ok(rows.into_iter().collect())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SetArgs {
    key: String,
    value: bool,
    description: Option<String>,
}

async fn set(ctx: &mut Ctx, args: SetArgs) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO feature_flags (key, value, description) VALUES ($1, $2, $3)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description",
    )
    .bind(args.key)
    .bind(args.value)
    .bind(args.description)
    .execute(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(())
}
