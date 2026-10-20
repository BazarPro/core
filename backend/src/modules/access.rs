//! Who may do what (convex/adminAuth.ts). Platform administrators moderate all user
//! content and may act as organizer of every event; all admin checks go through here.

use sqlx::PgConnection;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::rpc::Ctx;

pub async fn is_platform_admin(
    conn: &mut PgConnection,
    user_id: Option<Uuid>,
) -> sqlx::Result<bool> {
    let Some(user_id) = user_id else {
        return Ok(false);
    };
    let admin: Option<bool> = sqlx::query_scalar(
        "SELECT system_role = 'admin' AND status IS DISTINCT FROM 'banned'
                AND status IS DISTINCT FROM 'deleted'
         FROM users WHERE id = $1",
    )
    .bind(user_id)
    .fetch_optional(conn)
    .await?
    .flatten();
    Ok(admin.unwrap_or(false))
}

/// Active administrators, e.g. as recipients of moderation and approval emails.
pub async fn active_admins(conn: &mut PgConnection) -> sqlx::Result<Vec<Uuid>> {
    sqlx::query_scalar(
        "SELECT id FROM users WHERE system_role = 'admin'
           AND status IS DISTINCT FROM 'banned' AND status IS DISTINCT FROM 'deleted'",
    )
    .fetch_all(conn)
    .await
}

pub async fn require_admin(ctx: &mut Ctx) -> AppResult<Uuid> {
    let user = ctx.require_user()?;
    if !is_platform_admin(ctx.conn(), Some(user)).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    Ok(user)
}
