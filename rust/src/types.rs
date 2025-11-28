//! Type definitions for NEON

use std::collections::HashMap;

/// Symbols used in NEON format
pub mod symbols {
    pub const ARRAY: char = '#';
    pub const SCHEMA: char = '^';
    pub const OBJECT: char = '@';
    pub const TRUE: char = 'T';
    pub const FALSE: char = 'F';
    pub const NULL: char = 'N';
    pub const REFERENCE: char = '$';
    pub const PATH: char = '~';
    pub const TYPE_PREFIX: char = '>';
    pub const LIST_ITEM: char = '-';
    pub const COLON: char = ':';
    pub const COMMA: char = ',';
}

/// Options for NEON encoding
#[derive(Debug, Clone)]
pub struct NeonEncodeOptions {
    pub mode: EncodeMode,
    pub compress_numbers: bool,
    pub compress_booleans: bool,
    pub compress_nulls: bool,
    pub compress_strings: bool,
    pub abbreviate_fields: bool,
    pub delimiter: char,
    pub line_ending: String,
    pub indent: usize,
    pub enable_references: bool,
    pub max_inline_array: usize,
}

impl Default for NeonEncodeOptions {
    fn default() -> Self {
        Self {
            mode: EncodeMode::Compact,
            compress_numbers: true,
            compress_booleans: true,
            compress_nulls: true,
            compress_strings: true,
            abbreviate_fields: false,
            delimiter: ' ',
            line_ending: "\n".to_string(),
            indent: 2,
            enable_references: false,
            max_inline_array: 10,
        }
    }
}

/// Encoding mode
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum EncodeMode {
    Readable,
    Compact,
    UltraCompact,
}

/// Options for NEON decoding
#[derive(Debug, Clone)]
pub struct NeonDecodeOptions {
    pub strict: bool,
    pub expand_abbreviations: bool,
    pub max_depth: usize,
}

impl Default for NeonDecodeOptions {
    fn default() -> Self {
        Self {
            strict: true,
            expand_abbreviations: true,
            max_depth: 100,
        }
    }
}

/// Statistics from encoding/decoding operations
#[derive(Debug, Clone, Default)]
pub struct NeonStats {
    pub input_size: usize,
    pub output_size: usize,
    pub compression_ratio: f64,
    pub savings_percent: i32,
    pub input_tokens: usize,
    pub output_tokens: usize,
    pub encode_time_ms: f64,
    pub decode_time_ms: f64,
}

/// Token types for lexer
#[derive(Debug, Clone, PartialEq)]
pub enum TokenType {
    ArrayStart,
    SchemaStart,
    ObjectStart,
    Colon,
    Comma,
    Newline,
    Indent,
    ListItem,
    Null,
    Boolean,
    Number,
    String,
    Eof,
}

/// A lexer token
#[derive(Debug, Clone)]
pub struct Token {
    pub token_type: TokenType,
    pub value: String,
    pub raw: String,
    pub line: usize,
    pub column: usize,
}

/// Field abbreviations
pub fn get_abbreviations() -> HashMap<&'static str, &'static str> {
    let mut map = HashMap::new();
    map.insert("department", "dept");
    map.insert("description", "desc");
    map.insert("configuration", "config");
    map.insert("application", "app");
    map.insert("environment", "env");
    map.insert("timestamp", "ts");
    map.insert("first_name", "fname");
    map.insert("last_name", "lname");
    map.insert("phone_number", "phone");
    map.insert("email_address", "emailaddr");
    map.insert("notifications", "notif");
    map.insert("conversions", "conv");
    map
}

/// Reverse abbreviations for decoding
pub fn get_expansions() -> HashMap<&'static str, &'static str> {
    let mut map = HashMap::new();
    for (k, v) in get_abbreviations() {
        map.insert(v, k);
    }
    map
}
