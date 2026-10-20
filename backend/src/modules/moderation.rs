//! Moderation by platform administrators (convex/moderation.ts). So far only the log;
//! the moderation functions follow with the port of the module.

use uuid::Uuid;

use crate::realtime::Topic;
use crate::rpc::Ctx;

pub struct LogEntry<'a> {
    pub admin: Uuid,
    pub action: &'a str,
    pub target_type: &'a str,
    pub target_id: Uuid,
    pub target_label: &'a str,
    pub reason: Option<&'a str>,
    pub report: Option<Uuid>,
}

pub async fn log_action(ctx: &mut Ctx, entry: LogEntry<'_>) -> sqlx::Result<()> {
    sqlx::query(
        "INSERT INTO moderation_log (admin_id, action, target_type, target_id, target_label, reason, report_id)
         VALUES ($1, $2::moderation_action, $3::report_target, $4, $5, $6, $7)",
    )
    .bind(entry.admin)
    .bind(entry.action)
    .bind(entry.target_type)
    .bind(entry.target_id)
    .bind(entry.target_label)
    .bind(entry.reason)
    .bind(entry.report)
    .execute(ctx.conn())
    .await?;
    ctx.touch(Topic::Admin);
    Ok(())
}
