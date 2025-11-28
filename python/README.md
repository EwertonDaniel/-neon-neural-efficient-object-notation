# NEON Python Implementation

Token-efficient data serialization for AI/LLM applications.

## Installation

```bash
pip install neon-format
```

Or from source:

```bash
cd python
pip install -e .
```

## Quick Start

```python
import neon

# Encode data to NEON
data = {
    "users": [
        {"id": 1, "name": "Alice", "active": True},
        {"id": 2, "name": "Bob", "active": False}
    ]
}

encoded = neon.encode(data)
print(encoded)
# users#2^id,name,active
#   1 Alice T
#   2 Bob F

# Decode back to Python
decoded = neon.decode(encoded)
print(decoded)
# {'users': [{'id': 1, 'name': 'Alice', 'active': True}, ...]}
```

## API

### Encoding

```python
import neon
from neon import NeonEncodeOptions

# Default encoding (compact mode)
encoded = neon.encode(data)

# Maximum compression
encoded = neon.encode_compact(data)

# Custom options
options = NeonEncodeOptions(
    mode="compact",
    compress_numbers=True,
    compress_booleans=True,
    abbreviate_fields=False,
)
encoded = neon.encode(data, options)
```

### Decoding

```python
import neon
from neon import NeonDecodeOptions

# Standard decode
data = neon.decode(neon_string)

# Streaming decode
def process_record(record, index):
    print(f"Record {index}: {record}")

neon.decode_stream(neon_string, process_record)
```

### Statistics

```python
encoder = neon.NeonEncoder()
encoded = encoder.encode(data)
stats = encoder.get_stats()

print(f"Input size: {stats.input_size}")
print(f"Output size: {stats.output_size}")
print(f"Savings: {stats.savings_percent}%")
```

## Running Tests

```bash
cd python
pip install -e ".[dev]"
pytest
```

## License

MIT - Ewerton Daniel
