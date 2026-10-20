//! Public questions and answers on items (convex/productQuestions.ts).

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_with::skip_serializing_none;
use uuid::Uuid;

use super::docs;
use super::event_products::find_active_listing;
use super::event_roles::{TEAM, has_any_role_or_admin};
use super::features::are_questions_open;
use super::notifications::{self, Area, Category, Content, T};
use super::offers::{can_act_for_seller, display_name};
use crate::error::{AppError, AppResult};
use crate::i18n::Locale;
use crate::realtime::Topic;
use crate::register;
use crate::rpc::{Ctx, Registry};
use crate::shape::{Id, ms, ms_opt};

const MAX_QUESTION_LENGTH: usize = 500;
const MAX_ANSWER_LENGTH: usize = 1000;
/// Keeps a single account from flooding an item with questions
const MAX_OPEN_QUESTIONS_PER_USER: i64 = 3;

pub fn register(registry: &mut Registry) {
    register!(registry, Query "productQuestions.listForProduct" => list_for_product);
    register!(registry, Mutation "productQuestions.ask" => ask);
    register!(registry, Mutation "productQuestions.answer" => answer);
    register!(registry, Mutation "productQuestions.remove" => remove);
}

#[skip_serializing_none]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QuestionView {
    #[serde(rename = "_id")]
    id: Uuid,
    question: String,
    answer: Option<String>,
    #[serde(with = "ms")]
    created_at: DateTime<Utc>,
    #[serde(with = "ms_opt")]
    answered_at: Option<DateTime<Utc>>,
    asker_name: String,
    is_mine: bool,
    can_answer: bool,
}

#[derive(sqlx::FromRow)]
struct QuestionRow {
    id: Uuid,
    asker_id: Uuid,
    question: String,
    answer: Option<String>,
    created_at: DateTime<Utc>,
    answered_at: Option<DateTime<Utc>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProductArgs {
    product_id: Id,
}

/// The questions of an item, oldest first; of hidden items only for the seller side.
async fn list_for_product(ctx: &mut Ctx, args: ProductArgs) -> AppResult<Vec<QuestionView>> {
    ctx.read(Topic::Product(args.product_id.0));
    let Some(product) = docs::product(ctx.conn(), args.product_id.0).await? else {
        return Ok(Vec::new());
    };
    let viewer = ctx.user;
    let can_answer = match viewer {
        Some(user) => can_act_for_seller(ctx, &product, user).await?,
        None => false,
    };
    if product.moderation.is_some() && !can_answer {
        return Ok(Vec::new());
    }
    let rows: Vec<QuestionRow> = sqlx::query_as(
        "SELECT id, asker_id, question, answer, created_at, answered_at FROM product_questions
         WHERE product_id = $1 ORDER BY created_at, id",
    )
    .bind(product.id)
    .fetch_all(ctx.conn())
    .await?;
    let mut views = Vec::new();
    for row in rows {
        let asker = docs::user(ctx.conn(), row.asker_id).await?;
        views.push(QuestionView {
            id: row.id,
            question: row.question,
            answer: row.answer,
            created_at: row.created_at,
            answered_at: row.answered_at,
            asker_name: display_name(asker.as_ref(), T(Locale::De)),
            is_mine: viewer == Some(row.asker_id),
            can_answer,
        });
    }
    Ok(views)
}

fn too_long(code: &'static str, max: usize) -> AppError {
    AppError::coded(
        axum::http::StatusCode::BAD_REQUEST,
        code,
        &[("max", &max.to_string())],
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AskArgs {
    product_id: Id,
    question: String,
}

/// A public question on an item; the event of its current listing must allow it.
async fn ask(ctx: &mut Ctx, args: AskArgs) -> AppResult<Uuid> {
    let user = ctx
        .user
        .ok_or_else(|| AppError::unauthorized("auth.loginToAsk"))?;
    let product = docs::product(ctx.conn(), args.product_id.0)
        .await?
        .filter(|p| p.moderation.is_none())
        .ok_or_else(|| AppError::not_found("notFound.product"))?;
    if product.vendor_id == user {
        return Err(AppError::bad_request("question.ownItem"));
    }
    if product.sold {
        return Err(AppError::bad_request("product.alreadySold"));
    }
    let now = Utc::now();
    let Some((event, _)) = find_active_listing(ctx.conn(), product.id, now)
        .await?
        .filter(|(event, _)| event.resolved_features().questions)
    else {
        return Err(AppError::bad_request("question.notAllowed"));
    };
    if !are_questions_open(&event, now) {
        return Err(AppError::bad_request("question.notYet"));
    }
    let text = args.question.trim().to_owned();
    let length = text.chars().count();
    if length < 3 {
        return Err(AppError::bad_request("question.tooShort"));
    }
    if length > MAX_QUESTION_LENGTH {
        return Err(too_long("question.tooLong", MAX_QUESTION_LENGTH));
    }
    let open: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM product_questions WHERE product_id = $1 AND asker_id = $2 AND answer IS NULL",
    )
    .bind(product.id)
    .bind(user)
    .fetch_one(ctx.conn())
    .await?;
    if open >= MAX_OPEN_QUESTIONS_PER_USER {
        return Err(AppError::bad_request("question.waitForAnswers"));
    }
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO product_questions (event_id, product_id, asker_id, question) VALUES ($1, $2, $3, $4) RETURNING id",
    )
    .bind(event.id)
    .bind(product.id)
    .bind(user)
    .bind(&text)
    .fetch_one(ctx.conn())
    .await?;
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    let (title, path) = (
        product.title.clone(),
        format!("/products/view/{}", product.id),
    );
    notifications::notify_user(
        ctx,
        product.vendor_id,
        |t: T| Content {
            category: Some(Category::Questions),
            subject: t.t("question.new.subject", &[("title", &title)]),
            heading: t.t("question.new.heading", &[]),
            paragraphs: vec![
                t.t("question.new.text", &[("title", &title)]),
                t.t("common.quote", &[("text", &text)]),
            ],
            link: t.link("question.new.link", path.clone()),
            footnote: Some(t.t("question.new.footnote", &[])),
            ..Content::default()
        },
        Some(Area::Products),
        Duration::zero(),
    )
    .await?;
    Ok(id)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AnswerArgs {
    question_id: Id,
    answer: String,
}

/// The seller (or the organizer of a walk-in seller) answers or edits the answer.
async fn answer(ctx: &mut Ctx, args: AnswerArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let question: Option<(Uuid, Uuid, String, Option<String>)> = sqlx::query_as(
        "SELECT product_id, asker_id, question, answer FROM product_questions WHERE id = $1",
    )
    .bind(args.question_id.0)
    .fetch_optional(ctx.conn())
    .await?;
    let (product_id, asker, question, previous) =
        question.ok_or_else(|| AppError::not_found("notFound.question"))?;
    let product = docs::product(ctx.conn(), product_id).await?;
    let Some(product) = product else {
        return Err(AppError::forbidden("auth.forbidden"));
    };
    if !can_act_for_seller(ctx, &product, user).await? {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    let text = args.answer.trim().to_owned();
    if text.is_empty() {
        return Err(AppError::bad_request("question.answerEmpty"));
    }
    if text.chars().count() > MAX_ANSWER_LENGTH {
        return Err(too_long("question.answerTooLong", MAX_ANSWER_LENGTH));
    }
    sqlx::query("UPDATE product_questions SET answer = $2, answered_by = $3, answered_at = now() WHERE id = $1")
        .bind(args.question_id.0)
        .bind(&text)
        .bind(user)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Product(product.id));
    ctx.touch(Topic::User(product.vendor_id));
    if previous.is_none() {
        let (title, path) = (
            product.title.clone(),
            format!("/products/view/{}", product.id),
        );
        notifications::notify_user(
            ctx,
            asker,
            |t: T| Content {
                category: Some(Category::Buyer),
                subject: t.t("question.answered.subject", &[("title", &title)]),
                heading: t.t("question.answered.heading", &[]),
                paragraphs: vec![
                    t.t("question.answered.asked", &[("question", &question)]),
                    t.t("question.answered.answer", &[("answer", &text)]),
                ],
                link: t.link("moderation.viewProduct", path.clone()),
                ..Content::default()
            },
            None,
            Duration::zero(),
        )
        .await?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RemoveArgs {
    question_id: Id,
}

/// Removes a question: the asker, the seller and the event organizers may.
async fn remove(ctx: &mut Ctx, args: RemoveArgs) -> AppResult<()> {
    let user = ctx.require_user()?;
    let question: Option<(Uuid, Uuid, Uuid)> = sqlx::query_as(
        "SELECT asker_id, product_id, event_id FROM product_questions WHERE id = $1",
    )
    .bind(args.question_id.0)
    .fetch_optional(ctx.conn())
    .await?;
    let Some((asker, product_id, event)) = question else {
        return Ok(());
    };
    let mut allowed = asker == user;
    if !allowed && let Some(product) = docs::product(ctx.conn(), product_id).await? {
        allowed = can_act_for_seller(ctx, &product, user).await?;
    }
    if !allowed {
        allowed = has_any_role_or_admin(ctx.conn(), event, user, &TEAM).await?;
    }
    if !allowed {
        return Err(AppError::forbidden("auth.forbidden"));
    }
    sqlx::query("DELETE FROM product_questions WHERE id = $1")
        .bind(args.question_id.0)
        .execute(ctx.conn())
        .await?;
    ctx.touch(Topic::Product(product_id));
    Ok(())
}
