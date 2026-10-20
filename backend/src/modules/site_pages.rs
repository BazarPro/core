//! Legal pages maintained by admins: imprint, privacy, terms (convex/sitePages.ts).

use std::sync::LazyLock;

use axum::http::StatusCode;
use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;

use super::access::require_admin;
use crate::error::{AppError, AppResult};
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{ms, ms_opt};

const TOPIC: Topic = Topic::Table("site_pages");
const MAX_TITLE_LENGTH: usize = 120;
const MAX_MARKDOWN_LENGTH: usize = 100_000;
/// Placeholders in the templates, e.g. [[Name des Vereins]]; a page with one is not finished
static PLACEHOLDER_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\[\[[^\]]+\]\]").unwrap());

pub fn register(registry: &mut Registry) {
    register!(registry, Query "sitePages.get" => get);
    register!(registry, Query "sitePages.listForAdmin" => list_for_admin);
    register!(registry, Mutation "sitePages.save" => save);
}

#[derive(Deserialize, Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum Slug {
    Imprint,
    Privacy,
    Terms,
}

impl Slug {
    const ALL: [Slug; 3] = [Slug::Imprint, Slug::Privacy, Slug::Terms];

    fn as_str(self) -> &'static str {
        match self {
            Self::Imprint => "imprint",
            Self::Privacy => "privacy",
            Self::Terms => "terms",
        }
    }
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SlugArgs {
    slug: Slug,
}

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct Page {
    title: String,
    markdown: String,
    version: i32,
    #[serde(with = "ms")]
    updated_at: DateTime<Utc>,
}

/// Public: the current text of a legal page, or null if admins have not saved one yet.
async fn get(ctx: &mut Ctx, args: SlugArgs) -> AppResult<Option<Page>> {
    ctx.read(TOPIC);
    Ok(sqlx::query_as(
        "SELECT title, markdown, version, updated_at FROM site_pages WHERE slug = $1::site_page_slug",
    )
    .bind(args.slug.as_str())
    .fetch_optional(ctx.conn())
    .await?)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NoArgs {}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AdminPage {
    slug: Slug,
    title: Option<String>,
    markdown: Option<String>,
    version: Option<i32>,
    #[serde(with = "ms_opt")]
    updated_at: Option<DateTime<Utc>>,
    updated_by_name: Option<String>,
    has_placeholders: bool,
}

#[derive(sqlx::FromRow)]
struct PageWithEditor {
    title: String,
    markdown: String,
    version: i32,
    updated_at: DateTime<Utc>,
    name: Option<String>,
}

/// Admins: state of every legal page for the editor and the dashboard warning.
async fn list_for_admin(ctx: &mut Ctx, _: NoArgs) -> AppResult<Vec<AdminPage>> {
    require_admin(ctx).await?;
    ctx.read(TOPIC);
    let mut pages = Vec::new();
    for slug in Slug::ALL {
        let row: Option<PageWithEditor> = sqlx::query_as(
            "SELECT p.title, p.markdown, p.version, p.updated_at, u.name
             FROM site_pages p LEFT JOIN users u ON u.id = p.updated_by
             WHERE p.slug = $1::site_page_slug",
        )
        .bind(slug.as_str())
        .fetch_optional(ctx.conn())
        .await?;
        pages.push(match row {
            Some(page) => AdminPage {
                slug,
                has_placeholders: PLACEHOLDER_PATTERN.is_match(&page.markdown),
                title: Some(page.title),
                markdown: Some(page.markdown),
                version: Some(page.version),
                updated_at: Some(page.updated_at),
                updated_by_name: page.name,
            },
            None => AdminPage {
                slug,
                title: None,
                markdown: None,
                version: None,
                updated_at: None,
                updated_by_name: None,
                has_placeholders: false,
            },
        });
    }
    Ok(pages)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveArgs {
    slug: Slug,
    title: String,
    markdown: String,
}

/// Admins: saves a new version of a legal page; older versions are kept. Saving the same
/// text again creates no version.
async fn save(ctx: &mut Ctx, args: SaveArgs) -> AppResult<i32> {
    let admin = require_admin(ctx).await?;
    let title = args.title.trim();
    let markdown = args.markdown.trim();
    let title_length = title.chars().count();
    if !(3..=MAX_TITLE_LENGTH).contains(&title_length) {
        return Err(AppError::coded(
            StatusCode::BAD_REQUEST,
            "profile.titleLength",
            &[("max", &MAX_TITLE_LENGTH.to_string())],
        ));
    }
    if markdown.is_empty() {
        return Err(AppError::bad_request("pages.empty"));
    }
    if markdown.chars().count() > MAX_MARKDOWN_LENGTH {
        return Err(AppError::bad_request("pages.tooLong"));
    }

    let existing: Option<(String, String, i32)> = sqlx::query_as(
        "SELECT title, markdown, version FROM site_pages WHERE slug = $1::site_page_slug",
    )
    .bind(args.slug.as_str())
    .fetch_optional(ctx.conn())
    .await?;
    if let Some((old_title, old_markdown, version)) = &existing
        && old_title == title
        && old_markdown == markdown
    {
        return Ok(*version);
    }
    let version = existing.map_or(0, |(_, _, version)| version) + 1;
    sqlx::query(
        "INSERT INTO site_pages (slug, title, markdown, version, updated_at, updated_by)
         VALUES ($1::site_page_slug, $2, $3, $4, now(), $5)
         ON CONFLICT (slug) DO UPDATE SET title = EXCLUDED.title, markdown = EXCLUDED.markdown,
           version = EXCLUDED.version, updated_at = now(), updated_by = EXCLUDED.updated_by",
    )
    .bind(args.slug.as_str())
    .bind(title)
    .bind(markdown)
    .bind(version)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    sqlx::query(
        "INSERT INTO site_page_versions (slug, version, title, markdown, created_at, created_by)
         VALUES ($1::site_page_slug, $2, $3, $4, now(), $5)",
    )
    .bind(args.slug.as_str())
    .bind(version)
    .bind(title)
    .bind(markdown)
    .bind(admin)
    .execute(ctx.conn())
    .await?;
    ctx.touch(TOPIC);
    Ok(version)
}
