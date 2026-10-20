use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::i18n;

/// Errors of request handlers.
///
/// `Coded` is what `appError(code, params)` was in Convex: the app shows the text for the
/// code in its language (src/locales/<language>/errors.json), `message` is the German
/// text for logs and older clients. Sign-in errors keep the bare codes of Convex Auth
/// (`ACCOUNT_BANNED`, …), which the login pages match on. Everything else is logged and
/// answered with a generic 500.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{message}")]
    Coded {
        status: StatusCode,
        code: &'static str,
        params: Map<String, Value>,
        message: String,
    },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn coded(status: StatusCode, code: &'static str, params: &[(&str, &str)]) -> Self {
        Self::Coded {
            status,
            code,
            params: params
                .iter()
                .map(|(name, value)| ((*name).to_owned(), Value::from(*value)))
                .collect(),
            message: i18n::error_text(code, params),
        }
    }

    pub fn bad_request(code: &'static str) -> Self {
        Self::coded(StatusCode::BAD_REQUEST, code, &[])
    }

    pub fn unauthorized(code: &'static str) -> Self {
        Self::coded(StatusCode::UNAUTHORIZED, code, &[])
    }

    pub fn forbidden(code: &'static str) -> Self {
        Self::coded(StatusCode::FORBIDDEN, code, &[])
    }

    pub fn not_found(code: &'static str) -> Self {
        Self::coded(StatusCode::NOT_FOUND, code, &[])
    }

    pub fn too_many_requests(code: &'static str) -> Self {
        Self::coded(StatusCode::TOO_MANY_REQUESTS, code, &[])
    }

    /// The code of a coded error, for tests and redirects.
    pub fn code(&self) -> Option<&'static str> {
        match self {
            Self::Coded { code, .. } => Some(code),
            _ => None,
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Coded {
                status,
                code,
                params,
                message,
            } => (
                status,
                Json(json!({ "code": code, "params": params, "message": message })),
            )
                .into_response(),
            err => {
                tracing::error!(error = ?err, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "code": "internal", "message": "Interner Fehler" })),
                )
                    .into_response()
            }
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
