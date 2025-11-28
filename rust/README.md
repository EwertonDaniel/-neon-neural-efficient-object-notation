# NEON Rust Implementation

Token-efficient data serialization for AI/LLM applications.

## Features

- **40-60% size reduction** compared to JSON
- **Tabular encoding** for arrays of uniform objects
- **Number compression** with K/M/B/T suffixes (1000 -> 1K)
- **Boolean compression** (true/false -> T/F)
- **Field abbreviation** for common field names
- **Full CLI tool** for encoding, decoding, and comparison

## Installation

### As Library

Add to your `Cargo.toml`:

```toml
[dependencies]
neon-format = "2.0"
```

### CLI Tool

```bash
# From source
cd rust
cargo install --path .

# Or build release binary
cargo build --release
./target/release/neon --help
```

## Library Usage

```rust
use neon::{encode, decode};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Encode to NEON
    let data = json!({
        "users": [
            {"id": 1, "name": "Alice", "active": true},
            {"id": 2, "name": "Bob", "active": false}
        ]
    });

    let encoded = encode(&data, None)?;
    println!("NEON:\n{}", encoded);
    // users#2^active,id,name
    //   T 1 Alice
    //   F 2 Bob

    // Decode back to JSON
    let decoded = decode(&encoded, None)?;
    println!("JSON: {}", decoded);

    Ok(())
}
```

### With Options

```rust
use neon::{encode, NeonEncodeOptions};
use serde_json::json;

let data = json!({"count": 1500000, "active": true});

let options = NeonEncodeOptions {
    compress_numbers: true,
    compress_booleans: true,
    abbreviate_fields: true,
    ..Default::default()
};

let encoded = encode(&data, Some(options))?;
// Result: @active:T count:1.5M
```

### Compact Mode

```rust
use neon::encode_compact;
use serde_json::json;

let data = json!({"users": [{"id": 1}, {"id": 2}]});
let encoded = encode_compact(&data)?;
// Maximum compression with all optimizations enabled
```

## CLI Usage

### Encode JSON to NEON

```bash
# From file
neon encode -i data.json -o data.neon

# From stdin
cat data.json | neon encode

# With compact mode (maximum compression)
neon encode -i data.json -c --stats

# With field abbreviation
neon encode -i data.json -a

# Show statistics
neon encode -i data.json --stats
```

### Decode NEON to JSON

```bash
# From file
neon decode -i data.neon -o data.json

# Pretty print
neon decode -i data.neon -p

# With statistics
neon decode -i data.neon -s
```

### Compare Formats

```bash
# Basic comparison
neon compare -i data.json

# Detailed with sample output
neon compare -i data.json --detailed
```

Output example:
```
=== NEON Format Comparison ===

Size Comparison:
+--------------------+------------+------------+----------+
| Format             | Size       | Tokens     | vs JSON  |
+--------------------+------------+------------+----------+
| JSON (pretty)      |     150 B  |       ~37  | -        |
| JSON (minified)    |      87 B  |       ~21  | -        |
| NEON (default)     |      44 B  |       ~11  | -49%     |
| NEON (compact)     |      44 B  |       ~11  | -49%     |
+--------------------+------------+------------+----------+

LLM Cost Analysis (at $0.01/1K tokens):
  JSON cost/request:  $0.000217
  NEON cost/request:  $0.000110
  Savings per 1K:     $0.11
  Annual (1M req):    $107
```

### Validate NEON

```bash
neon validate -i data.neon
# Output: Valid NEON format
```

### Show Format Info

```bash
neon info
```

## NEON Syntax Reference

| Symbol | Meaning | Example |
|--------|---------|---------|
| `#` | Array with count | `items#3` |
| `^` | Schema definition | `#3^id,name,active` |
| `@` | Object | `@id:1 name:Alice` |
| `T` | True | `active:T` |
| `F` | False | `active:F` |
| `N` | Null | `value:N` |
| `K` | Thousands (x1,000) | `1.5K` = 1500 |
| `M` | Millions (x1,000,000) | `2M` = 2000000 |
| `B` | Billions | `1B` = 1000000000 |
| `T` | Trillions | `1T` = 1000000000000 |

## Building

```bash
cd rust

# Debug build
cargo build

# Release build (optimized)
cargo build --release

# Run tests
cargo test

# Run benchmarks
cargo bench
```

## Benchmarks

Run with `cargo bench`. Results on typical hardware:

| Operation | 1000 records |
|-----------|--------------|
| JSON serialize | ~116 us |
| NEON encode | ~5.7 ms |
| JSON deserialize | ~508 us |
| NEON decode | ~3.3 ms |

Note: NEON prioritizes **token efficiency** over raw speed. The size reduction translates directly to LLM API cost savings.

## API Reference

### Functions

- `encode(value: &Value, options: Option<NeonEncodeOptions>) -> Result<String>` - Encode JSON to NEON
- `encode_compact(value: &Value) -> Result<String>` - Encode with maximum compression
- `decode(input: &str, options: Option<NeonDecodeOptions>) -> Result<Value>` - Decode NEON to JSON

### Types

- `NeonEncodeOptions` - Encoding configuration
  - `compress_numbers: bool` - Enable K/M/B/T suffixes
  - `compress_booleans: bool` - Enable T/F compression
  - `abbreviate_fields: bool` - Abbreviate common field names
  - `indent: usize` - Indentation level (default: 2)

- `NeonDecodeOptions` - Decoding configuration
  - `strict: bool` - Enable strict parsing mode

## License

MIT - Ewerton Daniel
