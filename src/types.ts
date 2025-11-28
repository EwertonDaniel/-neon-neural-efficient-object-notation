/**
 * NEON - Neural Efficient Object Notation
 * Core Type System
 *
 * Designed for maximum AI/LLM processing efficiency
 */

// =============================================================================
// NEON Value Types
// =============================================================================

export type NeonPrimitive = string | number | boolean | null;

export type NeonValue =
  | NeonPrimitive
  | NeonArray
  | NeonObject
  | NeonReference
  | NeonTypedValue;

export interface NeonArray extends Array<NeonValue> {}

export interface NeonObject {
  [key: string]: NeonValue;
}

export interface NeonReference {
  $ref: string | number;
}

export interface NeonTypedValue {
  $type: string;
  $value: NeonValue;
}

// =============================================================================
// Schema Types
// =============================================================================

export type NeonFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'int'
  | 'float'
  | 'date'
  | 'datetime'
  | 'email'
  | 'url'
  | 'uuid'
  | 'binary'
  | 'array'
  | 'object'
  | 'any';

export interface NeonSchemaField {
  name: string;
  type: NeonFieldType;
  nullable?: boolean;
  default?: NeonValue;
  abbreviation?: string;
  compressed?: boolean;
}

export interface NeonSchema {
  id?: string;
  name?: string;
  version?: number;
  fields: NeonSchemaField[];
  strict?: boolean;
}

export interface NeonSchemaRegistry {
  schemas: Map<string, NeonSchema>;
  register(schema: NeonSchema): string;
  get(id: string): NeonSchema | undefined;
  resolve(ref: string): NeonSchema | undefined;
}

// =============================================================================
// Encoder Options
// =============================================================================

export type NeonEncodingMode =
  | 'readable'       // Human-readable with indentation
  | 'compact'        // Minimal whitespace
  | 'ultra-compact'  // Maximum compression
  | 'streaming'      // Optimized for streaming
  | 'binary-hybrid'; // Binary for numbers, text for strings

export type NeonDelimiter = ' ' | '\t' | '|' | ',';

export interface NeonEncodeOptions {
  // Mode selection
  mode?: NeonEncodingMode;

  // Compression
  compressNumbers?: boolean;      // 95000 -> 95K
  compressStrings?: boolean;      // @company.com -> @co.com
  compressBooleans?: boolean;     // true -> T
  compressNulls?: boolean;        // null -> N

  // Abbreviations
  abbreviateFields?: boolean;     // department -> dept
  abbreviationMap?: Map<string, string>;

  // Formatting
  indent?: number;
  delimiter?: NeonDelimiter;
  lineEnding?: '\n' | '\r\n';

  // Schema
  includeSchema?: boolean;
  schemaRegistry?: NeonSchemaRegistry;
  inlineSchema?: boolean;

  // References
  enableReferences?: boolean;
  referenceThreshold?: number;    // Min occurrences to create reference

  // Streaming
  chunkSize?: number;
  flushCallback?: (chunk: string) => void;

  // Validation
  strict?: boolean;
  validateOutput?: boolean;
}

export const DEFAULT_ENCODE_OPTIONS: Required<Omit<NeonEncodeOptions, 'abbreviationMap' | 'schemaRegistry' | 'flushCallback'>> = {
  mode: 'readable',
  compressNumbers: true,
  compressStrings: true,
  compressBooleans: true,
  compressNulls: true,
  abbreviateFields: true,
  indent: 2,
  delimiter: ' ',
  lineEnding: '\n',
  includeSchema: true,
  inlineSchema: true,
  enableReferences: true,
  referenceThreshold: 2,
  chunkSize: 8192,
  strict: false,
  validateOutput: false,
};

// =============================================================================
// Decoder Options
// =============================================================================

export interface NeonDecodeOptions {
  // Parsing
  strict?: boolean;
  allowUnknownFields?: boolean;

  // Schema
  schemaRegistry?: NeonSchemaRegistry;
  validateSchema?: boolean;

  // References
  resolveReferences?: boolean;
  circularReferenceHandling?: 'error' | 'null' | 'skip';

  // Streaming
  streamingMode?: boolean;
  onRecord?: (record: NeonValue, index: number) => void;

  // Error handling
  onError?: (error: NeonParseError) => void;
  continueOnError?: boolean;

  // Type coercion
  coerceTypes?: boolean;
  dateParser?: (value: string) => Date;

  // Performance
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
}

export const DEFAULT_DECODE_OPTIONS: Required<Omit<NeonDecodeOptions, 'schemaRegistry' | 'onRecord' | 'onError' | 'dateParser'>> = {
  strict: true,
  allowUnknownFields: true,
  validateSchema: true,
  resolveReferences: true,
  circularReferenceHandling: 'error',
  streamingMode: false,
  continueOnError: false,
  coerceTypes: true,
  maxDepth: 100,
  maxArrayLength: 1_000_000,
  maxStringLength: 10_000_000,
};

// =============================================================================
// Error Types
// =============================================================================

export type NeonErrorCode =
  | 'PARSE_ERROR'
  | 'SCHEMA_ERROR'
  | 'TYPE_ERROR'
  | 'REFERENCE_ERROR'
  | 'VALIDATION_ERROR'
  | 'ENCODING_ERROR'
  | 'OVERFLOW_ERROR'
  | 'CIRCULAR_REFERENCE'
  | 'UNKNOWN_SCHEMA'
  | 'INVALID_DELIMITER'
  | 'UNTERMINATED_STRING'
  | 'INVALID_NUMBER'
  | 'INVALID_ESCAPE';

export interface NeonErrorLocation {
  line: number;
  column: number;
  offset: number;
}

export interface NeonParseError {
  code: NeonErrorCode;
  message: string;
  location?: NeonErrorLocation;
  context?: string;
  expected?: string;
  found?: string;
}

export class NeonError extends Error {
  constructor(
    public readonly code: NeonErrorCode,
    message: string,
    public readonly location?: NeonErrorLocation,
    public readonly context?: string
  ) {
    super(`[${code}] ${message}${location ? ` at line ${location.line}, column ${location.column}` : ''}`);
    this.name = 'NeonError';
  }
}

// =============================================================================
// Token Types (for Lexer)
// =============================================================================

export type NeonTokenType =
  | 'OBJECT_START'    // @
  | 'ARRAY_START'     // #
  | 'SCHEMA_START'    // ^
  | 'REFERENCE'       // $
  | 'TYPE_PREFIX'     // ~
  | 'PATH_SEPARATOR'  // >
  | 'COLON'           // :
  | 'COMMA'           // ,
  | 'NEWLINE'         // \n
  | 'INDENT'          // whitespace at start of line
  | 'STRING'          // quoted or unquoted string
  | 'NUMBER'          // numeric value
  | 'BOOLEAN'         // T or F
  | 'NULL'            // N
  | 'LIST_ITEM'       // -
  | 'EOF';            // end of input

export interface NeonToken {
  type: NeonTokenType;
  value: string;
  raw: string;
  location: NeonErrorLocation;
}

// =============================================================================
// AST Types (for Parser)
// =============================================================================

export type NeonASTNodeType =
  | 'Root'
  | 'Object'
  | 'Array'
  | 'TabularArray'
  | 'Property'
  | 'Literal'
  | 'Reference'
  | 'Schema'
  | 'SchemaField';

export interface NeonASTNode {
  type: NeonASTNodeType;
  location: NeonErrorLocation;
}

export interface NeonRootNode extends NeonASTNode {
  type: 'Root';
  body: NeonASTNode;
}

export interface NeonObjectNode extends NeonASTNode {
  type: 'Object';
  properties: NeonPropertyNode[];
}

export interface NeonArrayNode extends NeonASTNode {
  type: 'Array';
  length: number;
  elements: NeonASTNode[];
}

export interface NeonTabularArrayNode extends NeonASTNode {
  type: 'TabularArray';
  length: number;
  schema: NeonSchemaNode;
  rows: NeonASTNode[][];
}

export interface NeonPropertyNode extends NeonASTNode {
  type: 'Property';
  key: string;
  value: NeonASTNode;
}

export interface NeonLiteralNode extends NeonASTNode {
  type: 'Literal';
  value: NeonPrimitive;
  raw: string;
}

export interface NeonReferenceNode extends NeonASTNode {
  type: 'Reference';
  id: string | number;
}

export interface NeonSchemaNode extends NeonASTNode {
  type: 'Schema';
  name?: string;
  fields: NeonSchemaFieldNode[];
}

export interface NeonSchemaFieldNode extends NeonASTNode {
  type: 'SchemaField';
  name: string;
  fieldType?: NeonFieldType;
}

// =============================================================================
// Statistics Types
// =============================================================================

export interface NeonStats {
  // Size metrics
  inputSize: number;
  outputSize: number;
  compressionRatio: number;
  savingsPercent: number;

  // Token metrics (estimated)
  inputTokens: number;
  outputTokens: number;
  tokenSavings: number;

  // Structure metrics
  objectCount: number;
  arrayCount: number;
  primitiveCount: number;
  maxDepth: number;

  // Performance metrics
  encodeTimeMs?: number;
  decodeTimeMs?: number;
  throughputMBps?: number;

  // Cost metrics (at $0.01 per 1K tokens)
  estimatedCostJson: number;
  estimatedCostNeon: number;
  costSavings: number;
}

// =============================================================================
// Streaming Types
// =============================================================================

export interface NeonStreamReader {
  read(): Promise<NeonValue | null>;
  readBatch(size: number): Promise<NeonValue[]>;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<NeonValue>;
}

export interface NeonStreamWriter {
  write(value: NeonValue): void;
  writeSchema(schema: NeonSchema): void;
  writeBatch(values: NeonValue[]): void;
  flush(): void;
  close(): void;
}

export interface NeonTransformOptions {
  transform?: (value: NeonValue) => NeonValue;
  filter?: (value: NeonValue) => boolean;
  batchSize?: number;
}

// =============================================================================
// Plugin System Types
// =============================================================================

export interface NeonPlugin {
  name: string;
  version: string;

  // Hooks
  beforeEncode?: (value: NeonValue, options: NeonEncodeOptions) => NeonValue;
  afterEncode?: (output: string, options: NeonEncodeOptions) => string;
  beforeDecode?: (input: string, options: NeonDecodeOptions) => string;
  afterDecode?: (value: NeonValue, options: NeonDecodeOptions) => NeonValue;

  // Custom types
  customTypes?: Map<string, {
    encode: (value: any) => string;
    decode: (raw: string) => any;
  }>;
}

// =============================================================================
// Utility Types
// =============================================================================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P];
};

// Type guard functions
export function isNeonObject(value: NeonValue): value is NeonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !('$ref' in value) && !('$type' in value);
}

export function isNeonArray(value: NeonValue): value is NeonArray {
  return Array.isArray(value);
}

export function isNeonReference(value: NeonValue): value is NeonReference {
  return typeof value === 'object' && value !== null && '$ref' in value;
}

export function isNeonTypedValue(value: NeonValue): value is NeonTypedValue {
  return typeof value === 'object' && value !== null && '$type' in value && '$value' in value;
}

export function isNeonPrimitive(value: NeonValue): value is NeonPrimitive {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

// =============================================================================
// Constants
// =============================================================================

export const NEON_SYMBOLS = {
  OBJECT: '@',
  ARRAY: '#',
  SCHEMA: '^',
  REFERENCE: '$',
  TYPE: '~',
  PATH: '>',
  COLON: ':',
  TRUE: 'T',
  FALSE: 'F',
  NULL: 'N',
  LIST_ITEM: '-',
} as const;

export const NEON_ABBREVIATIONS: Record<string, string> = {
  // Common field names - only use non-ambiguous abbreviations
  'department': 'dept',
  'description': 'desc',
  'configuration': 'config',
  'application': 'app',
  'environment': 'env',
  'timestamp': 'ts',
  'first_name': 'fname',
  'last_name': 'lname',
  'phone_number': 'phone',
  'email_address': 'emailaddr',
  'notifications': 'notif',
  'conversions': 'conv',
};

export const NEON_VERSION = '2.0.0';
export const NEON_MAGIC = 'NEON';
