use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// Errors of request handlers. Messages of `Client` are shown to the user (German, like
/// the ConvexError texts the frontend shows today); everything else is logged and
/// answered with a generic 500.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{message}")]
    Client { status: StatusCode, message: String },
    #[error(transparent)]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl AppError {
    pub fn bad_request(message: impl Into<String>) -> Self {
        Self::Client {
            status: StatusCode::BAD_REQUEST,
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::Client {
            status: StatusCode::NOT_FOUND,
            message: message.into(),
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self::Client {
            status: StatusCode::FORBIDDEN,
            message: message.into(),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            Self::Client { status, message } => {
                (status, Json(json!({ "error": message }))).into_response()
            }
            err => {
                tracing::error!(error = ?err, "request failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "error": "Interner Fehler" })),
                )
                    .into_response()
            }
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;
