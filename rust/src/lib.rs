//! NEON - Neural Efficient Object Notation
//!
//! Token-efficient data serialization for AI/LLM applications.
//!
//! # Example
//!
//! ```rust
//! use neon::{encode, decode};
//! use serde_json::json;
//!
//! let data = json!({
//!     "users": [
//!         {"id": 1, "name": "Alice", "active": true},
//!         {"id": 2, "name": "Bob", "active": false}
//!     ]
//! });
//!
//! let encoded = encode(&data, None).unwrap();
//! let decoded = decode(&encoded, None).unwrap();
//! ```

pub mod encoder;
pub mod decoder;
pub mod types;
pub mod error;

pub use encoder::{encode, encode_compact, NeonEncoder};
pub use decoder::{decode, NeonDecoder};
pub use types::{NeonEncodeOptions, NeonDecodeOptions, NeonStats};
pub use error::NeonError;
