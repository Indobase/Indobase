use thiserror::Error;

#[derive(Debug, Error)]
pub enum RazorpayError {
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("API error ({status}): {message}")]
    Api { status: u16, message: String },
    #[error("JSON error: {0}")]
    Json(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Signature verification failed")]
    Signature,
}
