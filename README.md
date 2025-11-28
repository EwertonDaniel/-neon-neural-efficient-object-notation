# NEON - Neural Efficient Object Notation

> Token-efficient data serialization for AI/LLM applications

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](https://github.com/EwertonDaniel/-neon-neural-efficient-object-notation)

## What is NEON?

NEON is a text-based data serialization format designed to minimize token count when sending structured data to Large Language Models (LLMs). It achieves **55-70% size reduction** compared to JSON for tabular data.

## When to Use NEON

**Use NEON when:**
- Sending large datasets to LLM APIs (token cost reduction)
- Streaming tabular data line-by-line
- You control both encoder and decoder
- Data is primarily uniform/tabular

**Use JSON when:**
- Universal compatibility is required
- Working with existing ecosystems
- Human editing is the primary concern
- No performance constraints

**Use TOON when:**
- You need established, stable tooling
- Broader ecosystem compatibility
- Lossless round-trip is mandatory

## Quick Start

```typescript
import { encode, decode } from 'neon-format';

const data = {
  users: [
    { id: 1, name: 'Alice', active: true },
    { id: 2, name: 'Bob', active: false }
  ]
};

// Encode to NEON
const neon = encode(data);
console.log(neon);
// users#2^id,name,active
//   1 Alice T
//   2 Bob F

// Decode back
const restored = decode(neon);
```

## Benchmark Results

Reproducible benchmarks using seed=42 datasets:

### Size Comparison (1000 records)

| Dataset | JSON | NEON | Reduction |
|---------|------|------|-----------|
| Employees | 187 KB | 52 KB | 72% |
| Orders | 156 KB | 48 KB | 69% |
| Metrics | 178 KB | 55 KB | 69% |

### Token Comparison (estimated, cl100k_base-like)

| Dataset | JSON Tokens | NEON Tokens | Savings |
|---------|-------------|-------------|---------|
| Employees (1K) | 16,200 | 4,800 | 70% |
| Orders (1K) | 14,100 | 4,200 | 70% |

**Run benchmarks yourself:**
```bash
npm run benchmark
```

## Syntax Overview

### Primitives
```
null    → N
true    → T
false   → F
95000   → 95K (compact mode)
0.5     → .5
"hello" → hello (unquoted when safe)
```

### Arrays
```
# Primitive array
tags#3 admin user dev

# Tabular array (the sweet spot)
users#3^id,name,active
  1 Alice T
  2 Bob T
  3 Carol F
```

### Objects
```
@id:1 name:Alice active:T
```

## Two Modes

### Strict Mode (Lossless)
- Full JSON round-trip compatibility
- No abbreviations
- Use for: data storage, APIs

```typescript
encode(data, {
  compressNumbers: false,
  compressBooleans: false,
  abbreviateFields: false
});
```

### Compact Mode (Lossy)
- Aggressive token reduction
- Number abbreviations (95000 → 95K)
- Use for: LLM prompts, logging

```typescript
encode(data);  // Default
encodeCompact(data);
```

**Warning**: Compact mode may lose precision:
- `95123` → `95.1K` → `95100`

## API Reference

### Encoding

```typescript
import { encode, encodeCompact, encodeReadable } from 'neon-format';

// Default (compact)
encode(data);

// Explicit compact
encodeCompact(data);

// Human-readable
encodeReadable(data);

// With options
encode(data, {
  mode: 'compact',           // 'readable' | 'compact' | 'ultra-compact'
  compressNumbers: true,     // 95000 → 95K
  compressBooleans: true,    // true → T
  abbreviateFields: true,    // department → dept
  delimiter: ' ',            // ' ' | '\t' | '|'
});
```

### Decoding

```typescript
import { decode, decodeStream, validate } from 'neon-format';

// Standard decode
const data = decode(neonString);

// Streaming decode (for large datasets)
decodeStream(neonString, (record, index) => {
  console.log(`Record ${index}:`, record);
});

// Validation
const { valid, errors } = validate(neonString);
```

### Statistics

```typescript
import { getStats, compare } from 'neon-format';

const stats = getStats(data);
console.log(`Savings: ${stats.savingsPercent}%`);

const comparison = compare(data);
console.log(`JSON: ${comparison.json.tokens} tokens`);
console.log(`NEON: ${comparison.neon.tokens} tokens`);
```

## Specification

See [SPEC.md](./SPEC.md) for the complete formal specification including:
- BNF grammar
- Encoding rules
- Escape sequences
- Streaming format

## Relationship to TOON

NEON is inspired by [TOON](https://github.com/toonspec/toon) but differs in:

| Feature | TOON | NEON |
|---------|------|------|
| Syntax | `[]{}: ` | `#^@ ` |
| Lossless | Always | Strict mode only |
| Abbreviations | No | Yes (compact mode) |
| Streaming | Partial | First-class |
| Ecosystem | Established | Emerging |

NEON is best thought of as an **aggressive compression layer** for scenarios where token reduction is critical and you control both ends.

## Known Limitations

1. **Underscore ambiguity**: In unquoted strings, `_` becomes space. Use quotes to preserve literal underscores.

2. **Number precision loss**: Compact mode abbreviations round numbers (`1581` → `1.58K` → `1580`).

3. **Not a JSON drop-in**: Requires NEON parser on both ends.

4. **Best for tabular data**: Non-uniform nested structures see less improvement.

## Installation

```bash
npm install neon-format
# or
pnpm add neon-format
# or
yarn add neon-format
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run benchmarks
npm run benchmark

# Build
npm run build
```

## Project Structure

```
├── src/
│   ├── types.ts      # Type definitions
│   ├── encoder.ts    # Encoder implementation
│   ├── decoder.ts    # Decoder implementation
│   └── index.ts      # Public API
├── tests/
│   ├── encoder.test.ts
│   └── decoder.test.ts
├── benchmarks/
│   ├── datasets.ts   # Reproducible test data
│   └── benchmark.ts  # Benchmark runner
├── SPEC.md           # Formal specification
└── README.md
```

## Roadmap

- [x] TypeScript implementation
- [x] Encoder with compression modes
- [x] Decoder with streaming
- [x] Formal specification
- [x] Benchmark suite
- [x] Test suite
- [ ] Python implementation
- [ ] CLI tool
- [ ] VSCode extension
- [ ] Online playground

## Contributing

Contributions are welcome! Please:
1. Read the [SPEC.md](./SPEC.md)
2. Run tests: `npm test`
3. Run benchmarks: `npm run benchmark`
4. Submit a PR

## License

MIT - Ewerton Daniel

---

**NEON**: When every token counts.
