//! NEON Decoder Implementation

use crate::error::{NeonError, Result};
use crate::types::{symbols, get_expansions, NeonDecodeOptions, NeonStats, Token, TokenType};
use serde_json::{Map, Number, Value};
use std::time::Instant;

/// Expand abbreviated numbers
fn expand_number(s: &str) -> f64 {
    let s = s.trim();
    if s.is_empty() {
        return 0.0;
    }

    if s.ends_with('T') {
        return s[..s.len() - 1].parse::<f64>().unwrap_or(0.0) * 1_000_000_000_000.0;
    }
    if s.ends_with('B') {
        return s[..s.len() - 1].parse::<f64>().unwrap_or(0.0) * 1_000_000_000.0;
    }
    if s.ends_with('M') {
        return s[..s.len() - 1].parse::<f64>().unwrap_or(0.0) * 1_000_000.0;
    }
    if s.ends_with('K') {
        return s[..s.len() - 1].parse::<f64>().unwrap_or(0.0) * 1_000.0;
    }

    // Leading dot
    if s.starts_with('.') {
        return format!("0{}", s).parse().unwrap_or(0.0);
    }
    if s.starts_with("-.") {
        return format!("-0{}", &s[1..]).parse().unwrap_or(0.0);
    }

    s.parse().unwrap_or(0.0)
}

/// Lexer for NEON format
struct Lexer {
    input: Vec<char>,
    pos: usize,
    line: usize,
    column: usize,
    tokens: Vec<Token>,
}

impl Lexer {
    fn new(input: &str) -> Self {
        Self {
            input: input.chars().collect(),
            pos: 0,
            line: 1,
            column: 1,
            tokens: Vec::new(),
        }
    }

    fn tokenize(&mut self) -> Vec<Token> {
        while self.pos < self.input.len() {
            self.scan_token();
        }

        self.add_token(TokenType::Eof, String::new(), String::new());
        std::mem::take(&mut self.tokens)
    }

    fn scan_token(&mut self) {
        let c = self.input[self.pos];

        // Skip whitespace (except newlines)
        if c == ' ' || c == '\t' || c == '\r' {
            self.advance();
            return;
        }

        // Newline
        if c == '\n' {
            self.add_token(TokenType::Newline, "\n".to_string(), "\n".to_string());
            self.advance();
            self.line += 1;
            self.column = 1;
            return;
        }

        // Symbols
        match c {
            c if c == symbols::ARRAY => {
                self.add_token(TokenType::ArrayStart, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            c if c == symbols::SCHEMA => {
                self.add_token(TokenType::SchemaStart, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            c if c == symbols::OBJECT => {
                self.add_token(TokenType::ObjectStart, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            c if c == symbols::COLON => {
                self.add_token(TokenType::Colon, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            c if c == symbols::COMMA => {
                self.add_token(TokenType::Comma, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            c if c == symbols::LIST_ITEM => {
                self.add_token(TokenType::ListItem, c.to_string(), c.to_string());
                self.advance();
                return;
            }
            _ => {}
        }

        // Boolean shortcuts
        if c == symbols::TRUE && self.is_word_boundary(self.pos + 1) {
            self.add_token(TokenType::Boolean, "true".to_string(), c.to_string());
            self.advance();
            return;
        }
        if c == symbols::FALSE && self.is_word_boundary(self.pos + 1) {
            self.add_token(TokenType::Boolean, "false".to_string(), c.to_string());
            self.advance();
            return;
        }
        if c == symbols::NULL && self.is_word_boundary(self.pos + 1) {
            self.add_token(TokenType::Null, "null".to_string(), c.to_string());
            self.advance();
            return;
        }

        // Quoted string
        if c == '"' {
            self.scan_quoted_string();
            return;
        }

        // Number
        if self.is_number_start(c) {
            self.scan_number();
            return;
        }

        // Unquoted string
        self.scan_unquoted_string();
    }

    fn scan_quoted_string(&mut self) {
        self.advance(); // Skip opening quote
        let start = self.pos;
        let mut value = String::new();

        while self.pos < self.input.len() && self.input[self.pos] != '"' {
            if self.input[self.pos] == '\\' {
                self.advance();
                if self.pos < self.input.len() {
                    let escape_char = self.input[self.pos];
                    match escape_char {
                        'n' => value.push('\n'),
                        'r' => value.push('\r'),
                        't' => value.push('\t'),
                        '"' => value.push('"'),
                        '\\' => value.push('\\'),
                        _ => value.push(escape_char),
                    }
                }
            } else {
                value.push(self.input[self.pos]);
            }
            self.advance();
        }

        let raw: String = self.input[start..self.pos].iter().collect();
        self.advance(); // Skip closing quote
        self.add_token(TokenType::String, value, format!("\"{}\"", raw));
    }

    fn scan_number(&mut self) {
        let start = self.pos;

        // Optional negative sign
        if self.input[self.pos] == '-' {
            self.advance();
        }

        // Leading dot
        if self.pos < self.input.len() && self.input[self.pos] == '.' {
            self.advance();
        }

        // Digits
        while self.pos < self.input.len() && self.input[self.pos].is_ascii_digit() {
            self.advance();
        }

        // Decimal part
        if self.pos < self.input.len() && self.input[self.pos] == '.' {
            self.advance();
            while self.pos < self.input.len() && self.input[self.pos].is_ascii_digit() {
                self.advance();
            }
        }

        // Suffix (K, M, B, T)
        if self.pos < self.input.len() && "KMBT".contains(self.input[self.pos]) {
            self.advance();
        }

        let raw: String = self.input[start..self.pos].iter().collect();
        let value = expand_number(&raw).to_string();
        self.add_token(TokenType::Number, value, raw);
    }

    fn scan_unquoted_string(&mut self) {
        let start = self.pos;
        let delimiters = " \t\n\r:,#@$~^>\"";

        while self.pos < self.input.len() && !delimiters.contains(self.input[self.pos]) {
            self.advance();
        }

        let raw: String = self.input[start..self.pos].iter().collect();

        // Check for keywords
        match raw.as_str() {
            "null" => self.add_token(TokenType::Null, "null".to_string(), raw),
            "true" => self.add_token(TokenType::Boolean, "true".to_string(), raw),
            "false" => self.add_token(TokenType::Boolean, "false".to_string(), raw),
            _ => {
                // Convert underscores to spaces
                let value = raw.replace('_', " ");
                self.add_token(TokenType::String, value, raw);
            }
        }
    }

    fn is_number_start(&self, c: char) -> bool {
        c.is_ascii_digit() || c == '-' || c == '.'
    }

    fn is_word_boundary(&self, pos: usize) -> bool {
        if pos >= self.input.len() {
            return true;
        }
        let delimiters = " \t\n\r:,#@$~^>\"";
        delimiters.contains(self.input[pos])
    }

    fn advance(&mut self) {
        self.pos += 1;
        self.column += 1;
    }

    fn add_token(&mut self, token_type: TokenType, value: String, raw: String) {
        self.tokens.push(Token {
            token_type,
            value,
            raw,
            line: self.line,
            column: self.column,
        });
    }
}

/// Parser for NEON format
struct Parser {
    options: NeonDecodeOptions,
    tokens: Vec<Token>,
    current: usize,
    depth: usize,
}

impl Parser {
    fn new(options: NeonDecodeOptions) -> Self {
        Self {
            options,
            tokens: Vec::new(),
            current: 0,
            depth: 0,
        }
    }

    fn parse(&mut self, tokens: Vec<Token>) -> Result<Value> {
        self.tokens = tokens;
        self.current = 0;
        self.depth = 0;

        self.skip_newlines();

        if self.is_at_end() {
            return Ok(Value::Null);
        }

        self.parse_value()
    }

    fn parse_value(&mut self) -> Result<Value> {
        self.depth += 1;

        if self.depth > self.options.max_depth {
            return Err(NeonError::MaxDepth {
                depth: self.options.max_depth,
            });
        }

        let token = match self.peek() {
            Some(t) => t.clone(),
            None => {
                self.depth -= 1;
                return Ok(Value::Null);
            }
        };

        if token.token_type == TokenType::Eof {
            self.depth -= 1;
            return Ok(Value::Null);
        }

        // Check for named array
        if token.token_type == TokenType::String {
            if let Some(next) = self.peek_next() {
                if next.token_type == TokenType::ArrayStart {
                    let result = self.parse_named_array()?;
                    self.depth -= 1;
                    return Ok(result);
                }
            }
        }

        let result = match token.token_type {
            TokenType::Null => {
                self.advance();
                Value::Null
            }
            TokenType::Boolean => {
                self.advance();
                Value::Bool(token.value == "true")
            }
            TokenType::Number => {
                self.advance();
                let num: f64 = token.value.parse().unwrap_or(0.0);
                if num.fract() == 0.0 {
                    Value::Number(Number::from(num as i64))
                } else {
                    Value::Number(Number::from_f64(num).unwrap_or(Number::from(0)))
                }
            }
            TokenType::String => {
                self.advance();
                Value::String(self.expand_abbreviation(&token.value))
            }
            TokenType::ObjectStart => self.parse_object()?,
            TokenType::ArrayStart => self.parse_array()?,
            _ => {
                self.advance();
                Value::String(token.value)
            }
        };

        self.depth -= 1;
        Ok(result)
    }

    fn parse_object(&mut self) -> Result<Value> {
        self.expect(TokenType::ObjectStart)?;
        let mut obj = Map::new();

        while !self.is_at_end() && !self.check(TokenType::Newline) && !self.check(TokenType::Eof) {
            let key_token = match self.peek() {
                Some(t) if t.token_type == TokenType::String => t.clone(),
                _ => break,
            };

            self.advance();
            let key = self.expand_abbreviation(&key_token.value);

            if self.check(TokenType::Colon) {
                self.advance();

                if self.check(TokenType::ArrayStart) {
                    obj.insert(key, self.parse_array()?);
                } else if self.check(TokenType::Newline) {
                    self.skip_newlines();
                    if self.check(TokenType::Indent) {
                        self.advance();
                        obj.insert(key, self.parse_value()?);
                    } else {
                        obj.insert(key, Value::Null);
                    }
                } else {
                    obj.insert(key, self.parse_value()?);
                }
            } else if self.check(TokenType::ArrayStart) {
                obj.insert(key, self.parse_array()?);
            } else {
                break;
            }
        }

        Ok(Value::Object(obj))
    }

    fn parse_array(&mut self) -> Result<Value> {
        self.expect(TokenType::ArrayStart)?;

        let length_token = self
            .peek()
            .ok_or_else(|| NeonError::syntax("Expected array length", 0, 0))?
            .clone();

        if length_token.token_type != TokenType::Number {
            return Err(NeonError::syntax("Expected array length", 0, 0));
        }

        self.advance();
        let length: usize = length_token.value.parse().unwrap_or(0) as usize;

        if length == 0 {
            return Ok(Value::Array(Vec::new()));
        }

        // Check for schema
        let schema = if self.check(TokenType::SchemaStart) {
            self.advance();
            Some(self.parse_schema()?)
        } else {
            None
        };

        // Check for inline values
        if !self.check(TokenType::Newline) && !self.check(TokenType::Eof) {
            let mut arr = Vec::new();
            while arr.len() < length && !self.is_at_end() {
                if self.check(TokenType::Newline) || self.check(TokenType::Eof) {
                    break;
                }
                arr.push(self.parse_value()?);
            }
            return Ok(Value::Array(arr));
        }

        // Multiline array
        if let Some(fields) = schema {
            self.parse_tabular_rows(length, &fields)
        } else {
            self.parse_list_rows(length)
        }
    }

    fn parse_named_array(&mut self) -> Result<Value> {
        let name_token = self.peek().unwrap().clone();
        self.advance();
        let name = name_token.value;

        let arr = self.parse_array()?;

        let mut obj = Map::new();
        obj.insert(name, arr);
        Ok(Value::Object(obj))
    }

    fn parse_schema(&mut self) -> Result<Vec<String>> {
        let mut fields = Vec::new();

        while !self.is_at_end() {
            let token = match self.peek() {
                Some(t) if t.token_type == TokenType::String => t.clone(),
                _ => break,
            };

            self.advance();
            fields.push(self.expand_abbreviation(&token.value));

            if self.check(TokenType::Comma) {
                self.advance();
            } else {
                break;
            }
        }

        Ok(fields)
    }

    fn parse_tabular_rows(&mut self, length: usize, fields: &[String]) -> Result<Value> {
        let mut result = Vec::new();

        for _ in 0..length {
            self.skip_newlines();

            if self.check(TokenType::Indent) {
                self.advance();
            }

            let mut obj = Map::new();
            for field in fields {
                if self.is_at_end() || self.check(TokenType::Newline) {
                    break;
                }
                obj.insert(field.clone(), self.parse_value()?);
            }

            result.push(Value::Object(obj));
        }

        Ok(Value::Array(result))
    }

    fn parse_list_rows(&mut self, length: usize) -> Result<Value> {
        let mut result = Vec::new();

        for _ in 0..length {
            self.skip_newlines();

            if self.check(TokenType::Indent) {
                self.advance();
            }

            if self.check(TokenType::ListItem) {
                self.advance();
            }

            result.push(self.parse_value()?);
        }

        Ok(Value::Array(result))
    }

    fn expand_abbreviation(&self, value: &str) -> String {
        if self.options.expand_abbreviations {
            get_expansions()
                .get(value)
                .map(|s| s.to_string())
                .unwrap_or_else(|| value.to_string())
        } else {
            value.to_string()
        }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.current)
    }

    fn peek_next(&self) -> Option<&Token> {
        self.tokens.get(self.current + 1)
    }

    fn advance(&mut self) -> Option<&Token> {
        if !self.is_at_end() {
            self.current += 1;
        }
        self.tokens.get(self.current - 1)
    }

    fn check(&self, token_type: TokenType) -> bool {
        self.peek()
            .map(|t| t.token_type == token_type)
            .unwrap_or(false)
    }

    fn expect(&mut self, token_type: TokenType) -> Result<&Token> {
        if self.check(token_type.clone()) {
            Ok(self.advance().unwrap())
        } else {
            Err(NeonError::syntax(
                format!("Expected {:?}", token_type),
                self.peek().map(|t| t.line).unwrap_or(0),
                self.peek().map(|t| t.column).unwrap_or(0),
            ))
        }
    }

    fn is_at_end(&self) -> bool {
        self.peek()
            .map(|t| t.token_type == TokenType::Eof)
            .unwrap_or(true)
    }

    fn skip_newlines(&mut self) {
        while self.check(TokenType::Newline) {
            self.advance();
        }
    }
}

/// NEON Decoder
pub struct NeonDecoder {
    options: NeonDecodeOptions,
    stats: NeonStats,
}

impl NeonDecoder {
    pub fn new(options: Option<NeonDecodeOptions>) -> Self {
        Self {
            options: options.unwrap_or_default(),
            stats: NeonStats::default(),
        }
    }

    pub fn decode(&mut self, input: &str) -> Result<Value> {
        let start = Instant::now();

        if input.trim().is_empty() {
            return Ok(Value::Null);
        }

        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();

        let mut parser = Parser::new(self.options.clone());
        let result = parser.parse(tokens)?;

        let elapsed = start.elapsed();
        let output_str = serde_json::to_string(&result)?;

        self.stats = NeonStats {
            input_size: input.len(),
            output_size: output_str.len(),
            decode_time_ms: elapsed.as_secs_f64() * 1000.0,
            ..Default::default()
        };

        Ok(result)
    }

    pub fn get_stats(&self) -> &NeonStats {
        &self.stats
    }
}

/// Decode a NEON string to JSON Value
pub fn decode(input: &str, options: Option<NeonDecodeOptions>) -> Result<Value> {
    let mut decoder = NeonDecoder::new(options);
    decoder.decode(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_null() {
        let result = decode("N", None).unwrap();
        assert_eq!(result, Value::Null);
    }

    #[test]
    fn test_decode_boolean() {
        assert_eq!(decode("T", None).unwrap(), Value::Bool(true));
        assert_eq!(decode("F", None).unwrap(), Value::Bool(false));
    }

    #[test]
    fn test_decode_number() {
        assert_eq!(decode("42", None).unwrap(), Value::Number(42.into()));
        assert_eq!(decode("95K", None).unwrap(), Value::Number(95000.into()));
    }

    #[test]
    fn test_decode_string() {
        assert_eq!(
            decode("hello", None).unwrap(),
            Value::String("hello".to_string())
        );
        assert_eq!(
            decode("hello_world", None).unwrap(),
            Value::String("hello world".to_string())
        );
    }

    #[test]
    fn test_decode_array() {
        let result = decode("#3 1 2 3", None).unwrap();
        assert!(result.is_array());
        assert_eq!(result.as_array().unwrap().len(), 3);
    }
}
