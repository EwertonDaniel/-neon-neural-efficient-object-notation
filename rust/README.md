# NEON Rust Implementation

Token-efficient data serialization for AI/LLM applications.

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
    // users#2^id,name,active
    //   1 Alice T
    //   2 Bob F

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

let options = NeonEncodeOptions {
    compress_numbers: true,
    compress_booleans: true,
    abbreviate_fields: true,
    ..Default::default()
};

let encoded = encode(&data, Some(options))?;
```

## CLI Usage

### Encode JSON to NEON

```bash
# From file
neon encode -i data.json -o data.neon

# From stdin
cat data.json | neon encode

# With compression
neon encode -i data.json -c --stats

# With field abbreviation
neon encode -i data.json -c -a
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
neon compare -i data.json
neon compare -i data.json --detailed
```

### Validate NEON

```bash
neon validate -i data.neon
```

### Show Help

```bash
neon info
neon --help
neon encode --help
```

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

## License

MIT - Ewerton Daniel
