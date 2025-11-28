//! Error types for NEON operations

use thiserror::Error;

/// Errors that can occur during NEON operations
#[derive(Error, Debug)]
pub enum NeonError {
    #[error("Syntax error at line {line}, column {column}: {message}")]
    Syntax {
        message: String,
        line: usize,
        column: usize,
    },

    #[error("Type error: {message}")]
    Type { message: String },

    #[error("Encoding error: {message}")]
    Encode { message: String },

    #[error("Decoding error: {message}")]
    Decode { message: String },

    #[error("Maximum depth exceeded: {depth}")]
    MaxDepth { depth: usize },

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}

impl NeonError {
    pub fn syntax(message: impl Into<String>, line: usize, column: usize) -> Self {
        NeonError::Syntax {
            message: message.into(),
            line,
            column,
        }
    }

    pub fn type_error(message: impl Into<String>) -> Self {
        NeonError::Type {
            message: message.into(),
        }
    }

    pub fn encode(message: impl Into<String>) -> Self {
        NeonError::Encode {
            message: message.into(),
        }
    }

    pub fn decode(message: impl Into<String>) -> Self {
        NeonError::Decode {
            message: message.into(),
        }
    }
}

pub type Result<T> = std::result::Result<T, NeonError>;
