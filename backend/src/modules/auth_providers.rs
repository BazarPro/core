//! OAuth providers with credentials on this instance; the login page only offers these
//! (convex/authProviders.ts). The same as GET /api/auth/providers.

use serde::{Deserialize, Serialize};

use crate::error::AppResult;
use crate::register;
use crate::rpc::{Ctx, Registry};

pub fn register(registry: &mut Registry) {
    register!(registry, Query "authProviders.configured" => configured);
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[derive(Serialize)]
struct Providers {
    google: bool,
    github: bool,
}

async fn configured(ctx: &mut Ctx, _: NoArgs) -> AppResult<Providers> {
    Ok(Providers {
        google: ctx.state.config.google.is_some(),
        github: ctx.state.config.github.is_some(),
    })
}
