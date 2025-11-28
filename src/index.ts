/**
 * NEON - Neural Efficient Object Notation
 *
 * A token-efficient data serialization format optimized for LLM processing.
 *
 * @module neon-format
 * @version 2.0.0
 * @license MIT
 * @author Ewerton Daniel
 *
 * @example
 * ```typescript
 * import { encode, decode } from 'neon-format';
 *
 * const data = {
 *   users: [
 *     { id: 1, name: 'Alice', active: true },
 *     { id: 2, name: 'Bob', active: false }
 *   ]
 * };
 *
 * const neon = encode(data);
 * // users#2^id,name,active
 * //   1 Alice T
 * //   2 Bob F
 *
 * const restored = decode(neon);
 * ```
 */

// =============================================================================
// Core Exports
// =============================================================================

// Encoder
export {
  NeonEncoder,
  encode,
  encodeCompact,
  encodeUltraCompact,
  encodeReadable,
  getEncodingStats,
} from './encoder';

// Decoder
export {
  NeonDecoder,
  decode,
  decodeStrict,
  decodeStream,
  validate,
} from './decoder';

// Types
export type {
  // Values
  NeonValue,
  NeonPrimitive,
  NeonArray,
  NeonObject,
  NeonReference,
  NeonTypedValue,

  // Schema
  NeonSchema,
  NeonSchemaField,
  NeonFieldType,
  NeonSchemaRegistry,

  // Options
  NeonEncodeOptions,
  NeonDecodeOptions,
  NeonEncodingMode,
  NeonDelimiter,

  // Errors
  NeonError,
  NeonErrorCode,
  NeonErrorLocation,
  NeonParseError,

  // Statistics
  NeonStats,

  // Streaming
  NeonStreamReader,
  NeonStreamWriter,
  NeonTransformOptions,

  // Plugins
  NeonPlugin,

  // Tokens & AST
  NeonToken,
  NeonTokenType,
  NeonASTNode,
} from './types';

// Type guards
export {
  isNeonObject,
  isNeonArray,
  isNeonReference,
  isNeonTypedValue,
  isNeonPrimitive,
} from './types';

// Constants
export {
  NEON_SYMBOLS,
  NEON_ABBREVIATIONS,
  NEON_VERSION,
} from './types';

// =============================================================================
// Convenience Utilities
// =============================================================================

import { encode } from './encoder';
import { decode } from './decoder';
import { NeonStats, NEON_VERSION } from './types';

/**
 * Format information
 */
export const info = {
  name: 'NEON',
  fullName: 'Neural Efficient Object Notation',
  version: NEON_VERSION,
  description: 'Token-efficient data serialization for AI/LLM',
  author: 'Ewerton Daniel',
  license: 'MIT',
};

/**
 * Quick statistics for a data object
 */
export function getStats(data: any): NeonStats {
  const jsonStr = JSON.stringify(data);
  const neonStr = encode(data);

  const jsonTokens = Math.ceil(jsonStr.length / 4);
  const neonTokens = Math.ceil(neonStr.length / 4);

  return {
    inputSize: jsonStr.length,
    outputSize: neonStr.length,
    compressionRatio: neonStr.length / jsonStr.length,
    savingsPercent: Math.round((1 - neonStr.length / jsonStr.length) * 100),
    inputTokens: jsonTokens,
    outputTokens: neonTokens,
    tokenSavings: jsonTokens - neonTokens,
    objectCount: 0,
    arrayCount: 0,
    primitiveCount: 0,
    maxDepth: 0,
    estimatedCostJson: (jsonTokens / 1000) * 0.01,
    estimatedCostNeon: (neonTokens / 1000) * 0.01,
    costSavings: ((jsonTokens - neonTokens) / 1000) * 0.01,
  };
}

/**
 * Round-trip test utility
 */
export function roundTrip(data: any): { success: boolean; encoded: string; decoded: any; match: boolean } {
  const encoded = encode(data);
  const decoded = decode(encoded);
  const match = JSON.stringify(data) === JSON.stringify(decoded);

  return {
    success: true,
    encoded,
    decoded,
    match,
  };
}

/**
 * Compare JSON vs NEON sizes
 */
export function compare(data: any): {
  json: { size: number; tokens: number };
  neon: { size: number; tokens: number };
  savings: { size: number; tokens: number; percent: number };
} {
  const jsonStr = JSON.stringify(data);
  const neonStr = encode(data);

  const jsonTokens = Math.ceil(jsonStr.length / 4);
  const neonTokens = Math.ceil(neonStr.length / 4);

  return {
    json: { size: jsonStr.length, tokens: jsonTokens },
    neon: { size: neonStr.length, tokens: neonTokens },
    savings: {
      size: jsonStr.length - neonStr.length,
      tokens: jsonTokens - neonTokens,
      percent: Math.round((1 - neonStr.length / jsonStr.length) * 100),
    },
  };
}

// =============================================================================
// Examples (for documentation)
// =============================================================================

export const examples = {
  simple: {
    input: { id: 1, name: 'Alice', active: true },
    output: '@id:1 name:Alice active:T',
  },
  primitiveArray: {
    input: { tags: ['admin', 'user', 'dev'] },
    output: 'tags#3 admin user dev',
  },
  tabular: {
    input: {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ],
    },
    output: `users#2^id,name,active
  1 Alice T
  2 Bob F`,
  },
  nested: {
    input: {
      user: {
        profile: { name: 'Alice', age: 30 },
      },
    },
    output: '@user:@profile:@name:Alice age:30',
  },
};

// =============================================================================
// Default Export
// =============================================================================

export default {
  encode,
  decode,
  getStats,
  compare,
  roundTrip,
  validate,
  info,
  examples,
};
