use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::{Map, Value, json};

use crate::i18n;

/// Errors of request handlers.
///
/// `Coded` is an error with a code and parameters: the app shows the text for the
/// code in its language (src/locales/<language>/errors.json), `message` is the German
/// text for logs and older clients. Sign-in errors have bare codes (`ACCOUNT_BANNED`, …),
/// which the login pages match on. Everything else is logged and
/// answered with a generic 500.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{message}")]
    Coded {
        status: StatusCode,
        code: &'static str,
        params: Map<String, Value>,
        message: String,
        /// The error of one item when a whole cart fails: `{code, params}`
        cause: Option<Value>,
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
            cause: None,
        }
    }

    /// `code` with `inner` as cause, e.g. "„Ski“: Der Artikel ist nicht verkäuflich." for the
    /// item of a cart that failed. Errors without code are passed on unchanged.
    pub fn with_cause(code: &'static str, params: &[(&str, &str)], inner: AppError) -> Self {
        match inner {
            Self::Coded {
                code: inner_code,
                params: inner_params,
                message: inner_message,
                status,
                ..
            } => match Self::coded(status, code, params) {
                Self::Coded {
                    code,
                    params,
                    message,
                    ..
                } => Self::Coded {
                    status,
                    code,
                    params,
                    message: format!("{message} {inner_message}"),
                    cause: Some(serde_json::json!({ "code": inner_code, "params": inner_params })),
                },
                other => other,
            },
            other => other,
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
                cause,
            } => {
                let mut body = json!({ "code": code, "params": params, "message": message });
                if let Some(cause) = cause {
                    body["cause"] = cause;
                }
                (status, Json(body)).into_response()
            }
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
