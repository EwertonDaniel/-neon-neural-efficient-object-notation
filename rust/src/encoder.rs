//! NEON Encoder Implementation

use crate::error::Result;
use crate::types::{symbols, get_abbreviations, NeonEncodeOptions, NeonStats};
use serde_json::Value;
use std::time::Instant;

/// Compress a number using K/M/B/T suffixes
fn compress_number(n: f64, enabled: bool) -> String {
    if !enabled {
        if n.fract() == 0.0 {
            return format!("{}", n as i64);
        }
        return format!("{}", n);
    }

    let abs_n = n.abs();
    let sign = if n < 0.0 { "-" } else { "" };

    if abs_n >= 1_000_000_000_000.0 {
        let val = abs_n / 1_000_000_000_000.0;
        if val.fract() == 0.0 {
            return format!("{}{}T", sign, val as i64);
        }
        return format!("{}{:.1}T", sign, val);
    }
    if abs_n >= 1_000_000_000.0 {
        let val = abs_n / 1_000_000_000.0;
        if val.fract() == 0.0 {
            return format!("{}{}B", sign, val as i64);
        }
        return format!("{}{:.1}B", sign, val);
    }
    if abs_n >= 1_000_000.0 {
        let val = abs_n / 1_000_000.0;
        if val.fract() == 0.0 {
            return format!("{}{}M", sign, val as i64);
        }
        return format!("{}{:.1}M", sign, val);
    }
    if abs_n >= 1_000.0 {
        let val = abs_n / 1_000.0;
        if val.fract() == 0.0 {
            return format!("{}{}K", sign, val as i64);
        }
        return format!("{}{:.1}K", sign, val);
    }

    // Leading dot for small decimals
    if abs_n > 0.0 && abs_n < 1.0 {
        let s = format!("{}", n);
        return s.replace("0.", ".");
    }

    // Integer check
    if n.fract() == 0.0 {
        return format!("{}", n as i64);
    }

    format!("{}", n)
}

/// Check if a string needs to be quoted
fn needs_quotes(s: &str, delimiter: char) -> bool {
    if s.is_empty() {
        return true;
    }

    let special_chars: Vec<char> = vec![':', '"', '\\', '\n', '\r', '\t'];

    if special_chars.iter().any(|c| s.contains(*c)) {
        return true;
    }
    if delimiter != ' ' && s.contains(delimiter) {
        return true;
    }
    if s.starts_with(' ') || s.ends_with(' ') {
        return true;
    }
    if s == "T" || s == "F" || s == "N" {
        return true;
    }

    // Check if looks like a number
    let num_pattern = regex_lite::Regex::new(r"^-?\d+(\.\d+)?[KMBT]?$").unwrap();
    if num_pattern.is_match(s) {
        return true;
    }

    // Check if starts with special character
    if let Some(first) = s.chars().next() {
        if "#@$~^>-".contains(first) {
            return true;
        }
    }

    false
}

/// Escape special characters in a string
fn escape_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// NEON Encoder
pub struct NeonEncoder {
    options: NeonEncodeOptions,
    stats: NeonStats,
}

impl NeonEncoder {
    pub fn new(options: Option<NeonEncodeOptions>) -> Self {
        Self {
            options: options.unwrap_or_default(),
            stats: NeonStats::default(),
        }
    }

    pub fn encode(&mut self, value: &Value) -> Result<String> {
        let start = Instant::now();

        let result = self.encode_value(value, 0)?;

        let elapsed = start.elapsed();
        let json_str = serde_json::to_string(value)?;

        self.stats = NeonStats {
            input_size: json_str.len(),
            output_size: result.len(),
            compression_ratio: result.len() as f64 / json_str.len() as f64,
            savings_percent: ((1.0 - result.len() as f64 / json_str.len() as f64) * 100.0) as i32,
            input_tokens: json_str.len() / 4,
            output_tokens: result.len() / 4,
            encode_time_ms: elapsed.as_secs_f64() * 1000.0,
            ..Default::default()
        };

        Ok(result)
    }

    pub fn get_stats(&self) -> &NeonStats {
        &self.stats
    }

    fn encode_value(&self, value: &Value, depth: usize) -> Result<String> {
        match value {
            Value::Null => {
                if self.options.compress_nulls {
                    Ok(symbols::NULL.to_string())
                } else {
                    Ok("null".to_string())
                }
            }
            Value::Bool(b) => {
                if self.options.compress_booleans {
                    Ok(if *b {
                        symbols::TRUE.to_string()
                    } else {
                        symbols::FALSE.to_string()
                    })
                } else {
                    Ok(b.to_string())
                }
            }
            Value::Number(n) => {
                let num = n.as_f64().unwrap_or(0.0);
                Ok(compress_number(num, self.options.compress_numbers))
            }
            Value::String(s) => Ok(self.encode_string(s)),
            Value::Array(arr) => self.encode_array(arr, depth),
            Value::Object(obj) => self.encode_object(obj, depth),
        }
    }

    fn encode_string(&self, s: &str) -> String {
        if s.is_empty() {
            return "\"\"".to_string();
        }

        if needs_quotes(s, self.options.delimiter) {
            return format!("\"{}\"", escape_string(s));
        }

        s.replace(' ', "_")
    }

    fn encode_key(&self, key: &str) -> String {
        if key.is_empty() {
            return "\"\"".to_string();
        }

        let key = if self.options.abbreviate_fields {
            get_abbreviations()
                .get(key)
                .map(|s| *s)
                .unwrap_or(key)
        } else {
            key
        };

        if key.contains(':') || key.contains('"') || key.contains('\\') || key.contains('\n') {
            return format!("\"{}\"", escape_string(key));
        }

        key.replace(' ', "_")
    }

    fn encode_array(&self, arr: &[Value], depth: usize) -> Result<String> {
        if arr.is_empty() {
            return Ok(format!("{}0", symbols::ARRAY));
        }

        // Check if tabular
        if self.is_tabular(arr) {
            return self.encode_tabular_array(arr, depth);
        }

        // Check if primitive
        let is_primitive = arr.iter().all(|v| !v.is_array() && !v.is_object());
        if is_primitive {
            return self.encode_primitive_array(arr);
        }

        // Mixed array
        self.encode_list_array(arr, depth)
    }

    fn is_tabular(&self, arr: &[Value]) -> bool {
        if arr.is_empty() {
            return false;
        }

        let first = match &arr[0] {
            Value::Object(obj) => obj,
            _ => return false,
        };

        let first_keys: std::collections::HashSet<_> = first.keys().collect();

        arr.iter().all(|v| {
            if let Value::Object(obj) = v {
                let keys: std::collections::HashSet<_> = obj.keys().collect();
                keys == first_keys
            } else {
                false
            }
        })
    }

    fn encode_tabular_array(&self, arr: &[Value], depth: usize) -> Result<String> {
        let first = arr[0].as_object().unwrap();
        let fields: Vec<&String> = first.keys().collect();

        let schema_fields: Vec<String> = fields
            .iter()
            .map(|f| {
                if self.options.abbreviate_fields {
                    get_abbreviations()
                        .get(f.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| f.to_string())
                } else {
                    f.to_string()
                }
            })
            .collect();

        let mut result = format!(
            "{}{}{}{}",
            symbols::ARRAY,
            arr.len(),
            symbols::SCHEMA,
            schema_fields.join(",")
        );

        let indent = " ".repeat(self.options.indent * (depth + 1));

        for item in arr {
            if let Value::Object(obj) = item {
                let values: Vec<String> = fields
                    .iter()
                    .map(|f| {
                        obj.get(*f)
                            .map(|v| self.encode_value(v, depth + 1).unwrap_or_default())
                            .unwrap_or_default()
                    })
                    .collect();

                result.push_str(&self.options.line_ending);
                result.push_str(&indent);
                result.push_str(&values.join(&self.options.delimiter.to_string()));
            }
        }

        Ok(result)
    }

    fn encode_primitive_array(&self, arr: &[Value]) -> Result<String> {
        let values: Vec<String> = arr
            .iter()
            .map(|v| self.encode_value(v, 0).unwrap_or_default())
            .collect();

        Ok(format!(
            "{}{} {}",
            symbols::ARRAY,
            arr.len(),
            values.join(&self.options.delimiter.to_string())
        ))
    }

    fn encode_list_array(&self, arr: &[Value], depth: usize) -> Result<String> {
        let indent = " ".repeat(self.options.indent * (depth + 1));
        let mut result = format!("{}{}", symbols::ARRAY, arr.len());

        for item in arr {
            let encoded = self.encode_value(item, depth + 1)?;
            result.push_str(&self.options.line_ending);
            result.push_str(&indent);
            result.push(symbols::LIST_ITEM);
            result.push(' ');
            result.push_str(&encoded);
        }

        Ok(result)
    }

    fn encode_object(
        &self,
        obj: &serde_json::Map<String, Value>,
        depth: usize,
    ) -> Result<String> {
        if obj.is_empty() {
            return Ok(symbols::OBJECT.to_string());
        }

        let entries: Vec<(&String, &Value)> = obj.iter().collect();

        // Check for root object with single array property
        if depth == 0 && entries.len() == 1 {
            let (key, value) = entries[0];
            if let Value::Array(arr) = value {
                if self.is_tabular(arr) {
                    let first = arr[0].as_object().unwrap();
                    let fields: Vec<&String> = first.keys().collect();

                    let schema_fields: Vec<String> = fields
                        .iter()
                        .map(|f| {
                            if self.options.abbreviate_fields {
                                get_abbreviations()
                                    .get(f.as_str())
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| f.to_string())
                            } else {
                                f.to_string()
                            }
                        })
                        .collect();

                    let mut result = format!(
                        "{}{}{}{}{}",
                        key,
                        symbols::ARRAY,
                        arr.len(),
                        symbols::SCHEMA,
                        schema_fields.join(",")
                    );

                    let indent = " ".repeat(self.options.indent);

                    for item in arr {
                        if let Value::Object(item_obj) = item {
                            let values: Vec<String> = fields
                                .iter()
                                .map(|f| {
                                    item_obj
                                        .get(*f)
                                        .map(|v| self.encode_value(v, 1).unwrap_or_default())
                                        .unwrap_or_default()
                                })
                                .collect();

                            result.push_str(&self.options.line_ending);
                            result.push_str(&indent);
                            result.push_str(&values.join(&self.options.delimiter.to_string()));
                        }
                    }

                    return Ok(result);
                }
            }
        }

        // Standard object encoding
        let mut parts: Vec<String> = Vec::new();

        for (key, value) in entries {
            let encoded_key = self.encode_key(key);

            match value {
                Value::Object(nested) if !nested.is_empty() => {
                    let nested_encoded = self.encode_object(nested, depth + 1)?;
                    parts.push(format!("{}:{{{}}}", encoded_key, &nested_encoded[1..]));
                }
                Value::Array(arr) => {
                    let encoded = self.encode_array(arr, depth + 1)?;
                    parts.push(format!("{}{}", encoded_key, encoded));
                }
                _ => {
                    let encoded = self.encode_value(value, depth)?;
                    parts.push(format!("{}:{}", encoded_key, encoded));
                }
            }
        }

        Ok(format!("{}{}", symbols::OBJECT, parts.join(" ")))
    }
}

/// Encode a JSON value to NEON format
pub fn encode(value: &Value, options: Option<NeonEncodeOptions>) -> Result<String> {
    let mut encoder = NeonEncoder::new(options);
    encoder.encode(value)
}

/// Encode with maximum compression
pub fn encode_compact(value: &Value) -> Result<String> {
    let options = NeonEncodeOptions {
        compress_numbers: true,
        compress_booleans: true,
        compress_nulls: true,
        abbreviate_fields: true,
        ..Default::default()
    };
    encode(value, Some(options))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_encode_null() {
        let result = encode(&json!(null), None).unwrap();
        assert_eq!(result, "N");
    }

    #[test]
    fn test_encode_boolean() {
        assert_eq!(encode(&json!(true), None).unwrap(), "T");
        assert_eq!(encode(&json!(false), None).unwrap(), "F");
    }

    #[test]
    fn test_encode_number() {
        assert_eq!(encode(&json!(42), None).unwrap(), "42");
        assert_eq!(encode(&json!(95000), None).unwrap(), "95K");
        assert_eq!(encode(&json!(2500000), None).unwrap(), "2.5M");
    }

    #[test]
    fn test_encode_string() {
        assert_eq!(encode(&json!("hello"), None).unwrap(), "hello");
        assert_eq!(encode(&json!("hello world"), None).unwrap(), "hello_world");
    }

    #[test]
    fn test_encode_array() {
        let result = encode(&json!([1, 2, 3]), None).unwrap();
        assert_eq!(result, "#3 1 2 3");
    }

    #[test]
    fn test_encode_tabular() {
        let data = json!({
            "users": [
                {"id": 1, "name": "Alice"},
                {"id": 2, "name": "Bob"}
            ]
        });
        let result = encode(&data, None).unwrap();
        assert!(result.contains("users#2^"));
        assert!(result.contains("Alice"));
        assert!(result.contains("Bob"));
    }
}
