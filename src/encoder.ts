/**
 * NEON - Neural Efficient Object Notation
 * Advanced Encoder Implementation v2.0
 *
 * Optimized for AI/LLM processing with maximum compression
 */

import {
  NeonValue,
  NeonObject,
  NeonArray,
  NeonEncodeOptions,
  NeonSchema,
  NeonSchemaField,
  NeonStats,
  NeonFieldType,
  DEFAULT_ENCODE_OPTIONS,
  NEON_SYMBOLS,
  NEON_ABBREVIATIONS,
  isNeonObject,
  isNeonArray,
  isNeonPrimitive,
} from './types';

// =============================================================================
// Number Compression
// =============================================================================

const NUMBER_SUFFIXES = [
  { threshold: 1_000_000_000_000, suffix: 'T', divisor: 1_000_000_000_000 },
  { threshold: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 },
  { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
  { threshold: 1_000, suffix: 'K', divisor: 1_000 },
];

function compressNumber(n: number, compress: boolean): string {
  if (!compress || !Number.isFinite(n)) {
    return String(n);
  }

  // Handle negative numbers
  const sign = n < 0 ? '-' : '';
  const absN = Math.abs(n);

  // Very small decimals
  if (absN > 0 && absN < 1) {
    const str = String(n);
    return str.replace(/^(-?)0\./, '$1.');
  }

  // Large numbers with suffix
  for (const { threshold, suffix, divisor } of NUMBER_SUFFIXES) {
    if (absN >= threshold) {
      const divided = absN / divisor;
      // Use up to 2 decimal places, remove trailing zeros
      const formatted = divided.toFixed(2).replace(/\.?0+$/, '');
      return sign + formatted + suffix;
    }
  }

  // Integer check - remove unnecessary decimal
  if (Number.isInteger(n)) {
    return String(n);
  }

  // Regular decimal - limit precision to avoid floating point issues
  const str = n.toPrecision(15).replace(/\.?0+$/, '');
  return str;
}

function expandNumber(s: string): number {
  const lastChar = s.slice(-1).toUpperCase();
  const multipliers: Record<string, number> = {
    'K': 1_000,
    'M': 1_000_000,
    'B': 1_000_000_000,
    'T': 1_000_000_000_000,
  };

  if (multipliers[lastChar]) {
    return parseFloat(s.slice(0, -1)) * multipliers[lastChar];
  }

  if (s.startsWith('.') || s.startsWith('-.')) {
    return parseFloat(s.replace(/^(-?)\./, '$10.'));
  }

  return parseFloat(s);
}

// =============================================================================
// String Compression
// =============================================================================

const COMMON_DOMAINS = [
  { full: '@gmail.com', short: '@gm' },
  { full: '@yahoo.com', short: '@yh' },
  { full: '@hotmail.com', short: '@hm' },
  { full: '@outlook.com', short: '@ol' },
  { full: '@company.com', short: '@co' },
  { full: '@example.com', short: '@ex' },
];

function compressString(s: string, compress: boolean, abbreviations: Map<string, string>): string {
  if (!compress || !s) return s;

  // Check abbreviation map first
  if (abbreviations.has(s)) {
    return abbreviations.get(s)!;
  }

  // Check built-in abbreviations
  if (NEON_ABBREVIATIONS[s]) {
    return NEON_ABBREVIATIONS[s];
  }

  // Compress email domains
  for (const { full, short } of COMMON_DOMAINS) {
    if (s.endsWith(full)) {
      return s.slice(0, -full.length) + short;
    }
  }

  return s;
}

// =============================================================================
// Schema Detection & Generation
// =============================================================================

function detectSchema(arr: NeonObject[]): NeonSchema | null {
  if (arr.length === 0) return null;

  const first = arr[0];
  if (!isNeonObject(first)) return null;

  const keys = Object.keys(first);
  if (keys.length === 0) return null;

  // Check if all objects have the same keys
  const isUniform = arr.every(item => {
    if (!isNeonObject(item)) return false;
    const itemKeys = Object.keys(item);
    return itemKeys.length === keys.length &&
           keys.every(k => k in item);
  });

  if (!isUniform) return null;

  // Generate schema fields with type inference
  const fields: NeonSchemaField[] = keys.map(key => {
    const values = arr.map(item => (item as NeonObject)[key]);
    const type = inferFieldType(values);
    return { name: key, type };
  });

  return { fields };
}

function inferFieldType(values: NeonValue[]): NeonFieldType {
  const types = new Set<NeonFieldType>();

  for (const v of values) {
    if (v === null) continue;
    if (typeof v === 'boolean') types.add('boolean');
    else if (typeof v === 'number') {
      types.add(Number.isInteger(v) ? 'int' : 'float');
    }
    else if (typeof v === 'string') {
      // Try to detect specific string types
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) types.add('date');
      else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) types.add('datetime');
      else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) types.add('email');
      else if (/^https?:\/\//.test(v)) types.add('url');
      else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) types.add('uuid');
      else types.add('string');
    }
    else if (Array.isArray(v)) types.add('array');
    else if (typeof v === 'object') types.add('object');
  }

  if (types.size === 0) return 'null';
  if (types.size === 1) {
    const firstType = types.values().next().value;
    return firstType ?? 'any';
  }
  if (types.has('int') && types.has('float')) return 'number';
  return 'any';
}

// =============================================================================
// Main Encoder Class
// =============================================================================

export class NeonEncoder {
  private options: Required<Omit<NeonEncodeOptions, 'abbreviationMap' | 'schemaRegistry' | 'flushCallback'>>;
  private abbreviations: Map<string, string>;
  private referenceMap: Map<NeonValue, string>;
  private referenceCounter: number;
  private stats: Partial<NeonStats>;

  constructor(options: NeonEncodeOptions = {}) {
    this.options = { ...DEFAULT_ENCODE_OPTIONS, ...options };
    this.abbreviations = options.abbreviationMap || new Map();
    this.referenceMap = new Map();
    this.referenceCounter = 0;
    this.stats = {};
  }

  /**
   * Encode any JavaScript value to NEON format
   */
  encode(value: NeonValue): string {
    const startTime = performance.now();

    // Reset state
    this.referenceMap = new Map();
    this.referenceCounter = 0;

    // First pass: detect references if enabled
    if (this.options.enableReferences) {
      this.detectReferences(value);
    }

    // Second pass: encode
    const result = this.encodeValue(value, 0, '');

    const endTime = performance.now();

    // Calculate stats
    const jsonStr = JSON.stringify(value);
    this.stats = {
      inputSize: jsonStr.length,
      outputSize: result.length,
      compressionRatio: result.length / jsonStr.length,
      savingsPercent: Math.round((1 - result.length / jsonStr.length) * 100),
      inputTokens: Math.ceil(jsonStr.length / 4),
      outputTokens: Math.ceil(result.length / 4),
      encodeTimeMs: endTime - startTime,
    };

    return result;
  }

  /**
   * Get encoding statistics from last encode operation
   */
  getStats(): Partial<NeonStats> {
    return { ...this.stats };
  }

  /**
   * Detect values that appear multiple times for reference optimization
   */
  private detectReferences(value: NeonValue, seen = new Map<any, number>()): void {
    if (value === null || typeof value !== 'object') return;

    const existing = seen.get(value);
    if (existing !== undefined) {
      seen.set(value, existing + 1);
      return;
    }

    seen.set(value, 1);

    if (Array.isArray(value)) {
      for (const item of value) {
        this.detectReferences(item, seen);
      }
    } else {
      for (const v of Object.values(value)) {
        this.detectReferences(v, seen);
      }
    }

    // Create references for frequently used objects
    for (const [obj, count] of seen) {
      if (count >= this.options.referenceThreshold && typeof obj === 'object') {
        if (!this.referenceMap.has(obj)) {
          this.referenceMap.set(obj, String(++this.referenceCounter));
        }
      }
    }
  }

  /**
   * Main encoding dispatcher
   */
  private encodeValue(value: NeonValue, depth: number, _context: string): string {
    // Null
    if (value === null || value === undefined) {
      return this.options.compressNulls ? NEON_SYMBOLS.NULL : 'null';
    }

    // Boolean
    if (typeof value === 'boolean') {
      if (this.options.compressBooleans) {
        return value ? NEON_SYMBOLS.TRUE : NEON_SYMBOLS.FALSE;
      }
      return String(value);
    }

    // Number
    if (typeof value === 'number') {
      return compressNumber(value, this.options.compressNumbers);
    }

    // String
    if (typeof value === 'string') {
      return this.encodeString(value);
    }

    // Array
    if (Array.isArray(value)) {
      return this.encodeArray(value, depth);
    }

    // Object
    if (typeof value === 'object') {
      return this.encodeObject(value as NeonObject, depth);
    }

    // Fallback
    return String(value);
  }

  /**
   * Encode string with proper escaping and compression
   */
  private encodeString(s: string): string {
    if (s === '') return '""';

    // Apply compression
    const compressed = compressString(
      s,
      this.options.compressStrings,
      this.abbreviations
    );

    // Check if quoting is needed
    const needsQuotes = this.needsQuotes(compressed);

    if (!needsQuotes) {
      // Replace spaces with underscores for readability
      return compressed.replace(/ /g, '_');
    }

    // Escape and quote
    const escaped = compressed
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');

    return `"${escaped}"`;
  }

  /**
   * Encode an object key name (handles spaces and special characters)
   */
  private encodeKeyName(key: string): string {
    if (!key) return '""';

    // Check if key needs quoting
    const needsQuotes =
      key.includes(':') ||
      key.includes('"') ||
      key.includes('\\') ||
      key.includes('\n') ||
      key.startsWith(' ') ||
      key.endsWith(' ') ||
      key === NEON_SYMBOLS.TRUE ||
      key === NEON_SYMBOLS.FALSE ||
      key === NEON_SYMBOLS.NULL ||
      /^-?\d+(\.\d+)?[KMBT]?$/.test(key) ||
      /^[#@$~^>-]/.test(key);

    if (!needsQuotes) {
      // Replace spaces with underscores
      return key.replace(/ /g, '_');
    }

    // Escape and quote
    const escaped = key
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');

    return `"${escaped}"`;
  }

  /**
   * Check if a string needs to be quoted
   * Note: Spaces in the middle of strings are converted to underscores,
   * so they don't require quoting. Only leading/trailing spaces require quotes.
   */
  private needsQuotes(s: string): boolean {
    const del = this.options.delimiter;

    // Check for delimiter if it's not a space (spaces are handled via underscore replacement)
    if (del !== ' ' && s.includes(del)) {
      return true;
    }

    return (
      s.includes(':') ||
      s.includes('"') ||
      s.includes('\\') ||
      s.includes('\n') ||
      s.includes('\r') ||
      s.includes('\t') ||
      s.startsWith(' ') ||
      s.endsWith(' ') ||
      s === NEON_SYMBOLS.TRUE ||
      s === NEON_SYMBOLS.FALSE ||
      s === NEON_SYMBOLS.NULL ||
      /^-?\d+(\.\d+)?[KMBT]?$/.test(s) ||
      /^[#@$~^>-]/.test(s)
    );
  }

  /**
   * Encode array with automatic tabular detection
   */
  private encodeArray(arr: NeonArray, depth: number): string {
    if (arr.length === 0) {
      return `${NEON_SYMBOLS.ARRAY}0`;
    }

    // Try tabular encoding for arrays of uniform objects
    const schema = detectSchema(arr as NeonObject[]);
    if (schema) {
      return this.encodeTabularArray(arr as NeonObject[], schema, depth);
    }

    // Check for primitive array
    const isPrimitive = arr.every(isNeonPrimitive);
    if (isPrimitive) {
      return this.encodePrimitiveArray(arr, depth);
    }

    // Mixed array - use list format
    return this.encodeListArray(arr, depth);
  }

  /**
   * Encode tabular array (uniform objects) - THE SWEET SPOT
   */
  private encodeTabularArray(arr: NeonObject[], schema: NeonSchema, depth: number): string {
    const fields = schema.fields.map(f => f.name);
    const del = this.options.delimiter;
    const nl = this.options.lineEnding;
    const indent = this.getIndent(depth + 1);

    // Abbreviate field names if enabled
    const schemaFields = this.options.abbreviateFields
      ? fields.map(f => NEON_ABBREVIATIONS[f] || f)
      : fields;

    // Header line
    let result = `${NEON_SYMBOLS.ARRAY}${arr.length}${NEON_SYMBOLS.SCHEMA}${schemaFields.join(',')}`;

    // Data rows
    for (const item of arr) {
      result += nl + indent;
      const values = fields.map(f => this.encodeValue(item[f], depth + 1, f));
      result += values.join(del);
    }

    return result;
  }

  /**
   * Encode primitive array on single line
   */
  private encodePrimitiveArray(arr: NeonArray, depth: number): string {
    const del = this.options.delimiter;
    const values = arr.map(v => this.encodeValue(v, depth, ''));
    return `${NEON_SYMBOLS.ARRAY}${arr.length}${del}${values.join(del)}`;
  }

  /**
   * Encode mixed array with list items
   */
  private encodeListArray(arr: NeonArray, depth: number): string {
    const nl = this.options.lineEnding;
    const indent = this.getIndent(depth + 1);

    let result = `${NEON_SYMBOLS.ARRAY}${arr.length}`;

    for (const item of arr) {
      result += nl + indent + '- ';
      const encoded = this.encodeValue(item, depth + 1, '');
      // Handle multi-line values
      if (encoded.includes('\n')) {
        result += encoded.split('\n').join('\n' + indent + '  ');
      } else {
        result += encoded;
      }
    }

    return result;
  }

  /**
   * Encode object
   */
  private encodeObject(obj: NeonObject, depth: number): string {
    const entries = Object.entries(obj);

    if (entries.length === 0) {
      return NEON_SYMBOLS.OBJECT;
    }

    // Check if this is a root object with a single array property (common case)
    if (depth === 0 && entries.length === 1) {
      const [key, value] = entries[0];
      if (Array.isArray(value)) {
        const schema = detectSchema(value as NeonObject[]);
        if (schema) {
          // Encode as named tabular array
          const fields = schema.fields.map(f => f.name);
          const schemaFields = this.options.abbreviateFields
            ? fields.map(f => NEON_ABBREVIATIONS[f] || f)
            : fields;

          const del = this.options.delimiter;
          const nl = this.options.lineEnding;
          const indent = this.getIndent(1);

          let result = `${key}${NEON_SYMBOLS.ARRAY}${value.length}${NEON_SYMBOLS.SCHEMA}${schemaFields.join(',')}`;

          for (const item of value as NeonObject[]) {
            result += nl + indent;
            const values = fields.map(f => this.encodeValue(item[f], 1, f));
            result += values.join(del);
          }

          return result;
        }
      }
    }

    // Standard object encoding
    const parts: string[] = [];
    const nl = this.options.lineEnding;
    const childIndent = this.getIndent(depth + 1);

    for (const [key, value] of entries) {
      const abbreviatedKey = this.options.abbreviateFields
        ? (NEON_ABBREVIATIONS[key] || key)
        : key;
      const encodedKey = this.encodeKeyName(abbreviatedKey);

      if (isNeonObject(value) && Object.keys(value).length > 0) {
        // Nested object
        const nested = this.encodeObject(value, depth + 1);
        if (this.options.mode === 'compact' || this.options.mode === 'ultra-compact') {
          parts.push(`${encodedKey}:{${nested.slice(1)}}`);
        } else {
          parts.push(`${encodedKey}:${nl}${childIndent}${nested}`);
        }
      } else if (isNeonArray(value)) {
        // Array property
        const encoded = this.encodeArray(value, depth + 1);
        if (encoded.includes('\n')) {
          parts.push(`${encodedKey}${encoded}`);
        } else {
          parts.push(`${encodedKey}${encoded}`);
        }
      } else {
        // Primitive
        const encoded = this.encodeValue(value, depth, key);
        parts.push(`${encodedKey}:${encoded}`);
      }
    }

    if (this.options.mode === 'compact' || this.options.mode === 'ultra-compact') {
      return NEON_SYMBOLS.OBJECT + parts.join(' ');
    }

    return NEON_SYMBOLS.OBJECT + parts.join(' ');
  }

  /**
   * Get indentation string for given depth
   */
  private getIndent(depth: number): string {
    if (this.options.mode === 'ultra-compact') return '';
    if (this.options.mode === 'compact') return '';
    return ' '.repeat(this.options.indent * depth);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Encode value to NEON format with default options
 */
export function encode(value: NeonValue, options?: NeonEncodeOptions): string {
  const encoder = new NeonEncoder(options);
  return encoder.encode(value);
}

/**
 * Encode with compact mode
 */
export function encodeCompact(value: NeonValue): string {
  return encode(value, { mode: 'compact' });
}

/**
 * Encode with ultra-compact mode for maximum compression
 */
export function encodeUltraCompact(value: NeonValue): string {
  return encode(value, { mode: 'ultra-compact' });
}

/**
 * Encode with readable mode for human inspection
 */
export function encodeReadable(value: NeonValue): string {
  return encode(value, { mode: 'readable', indent: 2 });
}

/**
 * Get encoding statistics without returning the encoded string
 */
export function getEncodingStats(value: NeonValue, options?: NeonEncodeOptions): NeonStats {
  const encoder = new NeonEncoder(options);
  const encoded = encoder.encode(value);
  const stats = encoder.getStats();

  const json = JSON.stringify(value);

  return {
    inputSize: json.length,
    outputSize: encoded.length,
    compressionRatio: encoded.length / json.length,
    savingsPercent: Math.round((1 - encoded.length / json.length) * 100),
    inputTokens: Math.ceil(json.length / 4),
    outputTokens: Math.ceil(encoded.length / 4),
    tokenSavings: Math.ceil(json.length / 4) - Math.ceil(encoded.length / 4),
    objectCount: 0, // Would need traversal to calculate
    arrayCount: 0,
    primitiveCount: 0,
    maxDepth: 0,
    encodeTimeMs: stats.encodeTimeMs,
    estimatedCostJson: (Math.ceil(json.length / 4) / 1000) * 0.01,
    estimatedCostNeon: (Math.ceil(encoded.length / 4) / 1000) * 0.01,
    costSavings: ((Math.ceil(json.length / 4) - Math.ceil(encoded.length / 4)) / 1000) * 0.01,
  };
}

// Export number utilities for decoder
export { expandNumber, compressNumber };
