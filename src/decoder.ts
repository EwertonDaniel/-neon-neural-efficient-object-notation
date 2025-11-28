/**
 * NEON - Neural Efficient Object Notation
 * Advanced Decoder Implementation v2.0
 *
 * Robust parsing with streaming support and error recovery
 */

import {
  NeonValue,
  NeonObject,
  NeonArray,
  NeonDecodeOptions,
  NeonToken,
  NeonTokenType,
  NeonErrorLocation,
  NeonError,
  NeonStats,
  DEFAULT_DECODE_OPTIONS,
  NEON_SYMBOLS,
  NEON_ABBREVIATIONS,
} from './types';

import { expandNumber } from './encoder';

// =============================================================================
// Lexer (Tokenizer)
// =============================================================================

class NeonLexer {
  private input: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: NeonToken[] = [];

  constructor(input: string) {
    this.input = input;
  }

  tokenize(): NeonToken[] {
    this.tokens = [];
    this.pos = 0;
    this.line = 1;
    this.column = 1;

    while (this.pos < this.input.length) {
      this.scanToken();
    }

    this.addToken('EOF', '', '');
    return this.tokens;
  }

  private scanToken(): void {
    const char = this.input[this.pos];

    // Skip carriage return
    if (char === '\r') {
      this.advance();
      return;
    }

    // Newline
    if (char === '\n') {
      this.addToken('NEWLINE', '\n', '\n');
      this.advance();
      this.line++;
      this.column = 1;
      return;
    }

    // Indentation at start of line (after newline)
    if (this.column === 1 && (char === ' ' || char === '\t')) {
      const start = this.pos;
      while (this.pos < this.input.length &&
             (this.input[this.pos] === ' ' || this.input[this.pos] === '\t')) {
        this.advance();
      }
      const indent = this.input.slice(start, this.pos);
      this.addToken('INDENT', indent, indent);
      return;
    }

    // Skip other whitespace (not at start of line)
    if (char === ' ' || char === '\t') {
      this.advance();
      return;
    }

    // Single character tokens
    switch (char) {
      case NEON_SYMBOLS.OBJECT:
        this.addToken('OBJECT_START', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.ARRAY:
        this.addToken('ARRAY_START', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.SCHEMA:
        this.addToken('SCHEMA_START', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.REFERENCE:
        this.addToken('REFERENCE', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.TYPE:
        this.addToken('TYPE_PREFIX', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.PATH:
        this.addToken('PATH_SEPARATOR', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.COLON:
        this.addToken('COLON', char, char);
        this.advance();
        return;
      case ',':
        this.addToken('COMMA', char, char);
        this.advance();
        return;
      case NEON_SYMBOLS.LIST_ITEM:
        // Check if followed by space (list item) or part of number
        if (this.pos + 1 < this.input.length && this.input[this.pos + 1] === ' ') {
          this.addToken('LIST_ITEM', char, char);
          this.advance();
          return;
        }
        // Fall through to number handling
        break;
    }

    // Boolean
    if (char === NEON_SYMBOLS.TRUE && this.isWordBoundary(this.pos + 1)) {
      this.addToken('BOOLEAN', 'true', char);
      this.advance();
      return;
    }
    if (char === NEON_SYMBOLS.FALSE && this.isWordBoundary(this.pos + 1)) {
      this.addToken('BOOLEAN', 'false', char);
      this.advance();
      return;
    }

    // Null
    if (char === NEON_SYMBOLS.NULL && this.isWordBoundary(this.pos + 1)) {
      this.addToken('NULL', 'null', char);
      this.advance();
      return;
    }

    // Quoted string
    if (char === '"') {
      this.scanQuotedString();
      return;
    }

    // Number (including negative and decimal)
    if (this.isNumberStart(char)) {
      this.scanNumber();
      return;
    }

    // Unquoted string / identifier
    this.scanUnquotedString();
  }

  private scanQuotedString(): void {
    const start = this.pos;
    this.advance(); // Skip opening quote

    let value = '';
    let escaping = false;

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      if (escaping) {
        switch (char) {
          case 'n': value += '\n'; break;
          case 'r': value += '\r'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          case '"': value += '"'; break;
          default: value += char;
        }
        escaping = false;
        this.advance();
        continue;
      }

      if (char === '\\') {
        escaping = true;
        this.advance();
        continue;
      }

      if (char === '"') {
        this.advance();
        break;
      }

      if (char === '\n') {
        throw new NeonError(
          'UNTERMINATED_STRING',
          'Unterminated string literal',
          this.getLocation()
        );
      }

      value += char;
      this.advance();
    }

    const raw = this.input.slice(start, this.pos);
    this.addToken('STRING', value, raw);
  }

  private scanNumber(): void {
    const start = this.pos;

    // Handle negative
    if (this.input[this.pos] === '-') {
      this.advance();
    }

    // Handle leading decimal point
    if (this.input[this.pos] === '.') {
      this.advance();
    }

    // Digits
    while (this.pos < this.input.length && /\d/.test(this.input[this.pos])) {
      this.advance();
    }

    // Decimal part
    if (this.pos < this.input.length && this.input[this.pos] === '.') {
      this.advance();
      while (this.pos < this.input.length && /\d/.test(this.input[this.pos])) {
        this.advance();
      }
    }

    // Suffix (K, M, B, T)
    if (this.pos < this.input.length && /[KMBT]/i.test(this.input[this.pos])) {
      this.advance();
    }

    const raw = this.input.slice(start, this.pos);
    const value = expandNumber(raw);
    this.addToken('NUMBER', String(value), raw);
  }

  private scanUnquotedString(): void {
    const start = this.pos;

    while (this.pos < this.input.length) {
      const char = this.input[this.pos];

      // Stop at delimiters
      if (' \t\n\r:,#@$~^>"'.includes(char)) {
        break;
      }

      this.advance();
    }

    const raw = this.input.slice(start, this.pos);

    // Check for full word keywords
    if (raw === 'null') {
      this.addToken('NULL', 'null', raw);
      return;
    }
    if (raw === 'true') {
      this.addToken('BOOLEAN', 'true', raw);
      return;
    }
    if (raw === 'false') {
      this.addToken('BOOLEAN', 'false', raw);
      return;
    }

    // Convert underscores back to spaces
    const value = raw.replace(/_/g, ' ');
    this.addToken('STRING', value, raw);
  }

  private isNumberStart(char: string): boolean {
    return /[-.\d]/.test(char);
  }

  private isWordBoundary(pos: number): boolean {
    if (pos >= this.input.length) return true;
    const char = this.input[pos];
    return ' \t\n\r:,#@$~^>"'.includes(char);
  }

  private advance(): void {
    this.pos++;
    this.column++;
  }

  private addToken(type: NeonTokenType, value: string, raw: string): void {
    this.tokens.push({
      type,
      value,
      raw,
      location: this.getLocation(),
    });
  }

  private getLocation(): NeonErrorLocation {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos,
    };
  }
}

// =============================================================================
// Parser
// =============================================================================

class NeonParser {
  private tokens: NeonToken[] = [];
  private pos: number = 0;
  private options: Required<Omit<NeonDecodeOptions, 'schemaRegistry' | 'onRecord' | 'onError' | 'dateParser'>>;
  private depth: number = 0;

  constructor(options: NeonDecodeOptions = {}) {
    this.options = { ...DEFAULT_DECODE_OPTIONS, ...options };
  }

  parse(tokens: NeonToken[]): NeonValue {
    this.tokens = tokens;
    this.pos = 0;
    this.depth = 0;

    // Skip leading newlines
    this.skipNewlines();

    if (this.isAtEnd()) {
      return null;
    }

    return this.parseValue();
  }

  private parseValue(): NeonValue {
    this.depth++;

    if (this.depth > this.options.maxDepth) {
      throw new NeonError(
        'OVERFLOW_ERROR',
        `Maximum depth of ${this.options.maxDepth} exceeded`,
        this.peek()?.location
      );
    }

    const token = this.peek();
    if (!token || token.type === 'EOF') {
      this.depth--;
      return null;
    }

    let result: NeonValue;

    // Check for named array first (e.g., "users#5^...")
    if (token.type === 'STRING' && this.peekNext()?.type === 'ARRAY_START') {
      result = this.parseNamedArray();
      this.depth--;
      return result;
    }

    switch (token.type) {
      case 'NULL':
        this.advance();
        result = null;
        break;

      case 'BOOLEAN':
        this.advance();
        result = token.value === 'true';
        break;

      case 'NUMBER':
        this.advance();
        result = parseFloat(token.value);
        break;

      case 'STRING':
        this.advance();
        result = this.expandAbbreviation(token.value);
        break;

      case 'OBJECT_START':
        result = this.parseObject();
        break;

      case 'ARRAY_START':
        result = this.parseArray();
        break;

      case 'REFERENCE':
        result = this.parseReference();
        break;

      default:
        this.advance();
        result = token.value;
    }

    this.depth--;
    return result;
  }

  private parseObject(): NeonObject {
    this.expect('OBJECT_START');
    const obj: NeonObject = {};

    while (!this.isAtEnd() && !this.check('NEWLINE') && !this.check('EOF')) {
      // Parse key
      const keyToken = this.peek();
      if (!keyToken || keyToken.type !== 'STRING') break;

      this.advance();
      const key = this.expandAbbreviation(keyToken.value);

      // Expect colon
      if (this.check('COLON')) {
        this.advance();

        // Check for array after colon
        if (this.check('ARRAY_START')) {
          obj[key] = this.parseArray();
        } else if (this.check('NEWLINE')) {
          // Nested object on next line
          this.skipNewlines();
          if (this.check('INDENT')) {
            this.advance();
            obj[key] = this.parseValue();
          } else {
            obj[key] = null;
          }
        } else {
          obj[key] = this.parseValue();
        }
      } else if (this.check('ARRAY_START')) {
        // Array without colon
        obj[key] = this.parseArray();
      }
    }

    return obj;
  }

  private parseArray(): NeonArray {
    this.expect('ARRAY_START');

    // Get length
    const lengthToken = this.peek();
    if (!lengthToken || lengthToken.type !== 'NUMBER') {
      throw new NeonError(
        'PARSE_ERROR',
        'Expected array length after #',
        lengthToken?.location
      );
    }
    this.advance();
    const length = parseInt(lengthToken.value);

    if (length > this.options.maxArrayLength) {
      throw new NeonError(
        'OVERFLOW_ERROR',
        `Array length ${length} exceeds maximum of ${this.options.maxArrayLength}`,
        lengthToken.location
      );
    }

    if (length === 0) {
      return [];
    }

    // Check for schema
    if (this.check('SCHEMA_START')) {
      return this.parseTabularArray(length);
    }

    // Check for inline primitives
    if (!this.check('NEWLINE')) {
      return this.parsePrimitiveArray(length);
    }

    // List array
    return this.parseListArray(length);
  }

  private parseTabularArray(length: number): NeonArray {
    this.expect('SCHEMA_START');

    // Parse field names
    const fields: string[] = [];
    while (!this.isAtEnd() && !this.check('NEWLINE')) {
      const fieldToken = this.peek();
      if (fieldToken?.type === 'STRING' || fieldToken?.type === 'NUMBER') {
        this.advance();
        fields.push(this.expandAbbreviation(String(fieldToken.value)));
      } else if (this.check('COMMA')) {
        this.advance();
      } else {
        break;
      }
    }

    const result: NeonArray = [];

    // Parse rows
    for (let i = 0; i < length; i++) {
      this.skipNewlines();

      // Skip indentation
      if (this.check('INDENT')) {
        this.advance();
      }

      const row: NeonObject = {};
      for (let j = 0; j < fields.length; j++) {
        if (j > 0 && this.check('COMMA')) {
          this.advance();
        }

        const value = this.parseValue();
        row[fields[j]] = value;
      }

      result.push(row);
    }

    return result;
  }

  private parsePrimitiveArray(length: number): NeonArray {
    const result: NeonArray = [];

    for (let i = 0; i < length; i++) {
      const value = this.parseValue();
      result.push(value);
    }

    return result;
  }

  private parseListArray(length: number): NeonArray {
    const result: NeonArray = [];

    for (let i = 0; i < length; i++) {
      this.skipNewlines();

      // Skip indentation
      if (this.check('INDENT')) {
        this.advance();
      }

      // Expect list item marker
      if (this.check('LIST_ITEM')) {
        this.advance();
      }

      const value = this.parseValue();
      result.push(value);
    }

    return result;
  }

  private parseNamedArray(): NeonObject {
    const nameToken = this.peek();
    if (!nameToken) {
      throw new NeonError('PARSE_ERROR', 'Expected array name', undefined);
    }
    this.advance();
    const name = nameToken.value;

    const array = this.parseArray();
    return { [name]: array };
  }

  private parseReference(): NeonValue {
    this.expect('REFERENCE');

    const idToken = this.peek();
    if (!idToken) {
      throw new NeonError('REFERENCE_ERROR', 'Expected reference ID after $', undefined);
    }
    this.advance();

    // In a real implementation, this would resolve the reference
    return { $ref: idToken.value };
  }

  private expandAbbreviation(value: string): string {
    // Expand known abbreviations
    for (const [full, abbr] of Object.entries(NEON_ABBREVIATIONS)) {
      if (value === abbr) {
        return full;
      }
    }
    return value;
  }

  // Token navigation helpers

  private peek(): NeonToken | null {
    return this.tokens[this.pos] || null;
  }

  private peekNext(): NeonToken | null {
    return this.tokens[this.pos + 1] || null;
  }

  private advance(): NeonToken | null {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.tokens[this.pos - 1] || null;
  }

  private check(type: NeonTokenType): boolean {
    const token = this.peek();
    return token?.type === type;
  }

  private expect(type: NeonTokenType): NeonToken {
    const token = this.peek();
    if (!token || token.type !== type) {
      throw new NeonError(
        'PARSE_ERROR',
        `Expected ${type}, got ${token?.type || 'EOF'}`,
        token?.location,
        token?.raw
      );
    }
    return this.advance()!;
  }

  private isAtEnd(): boolean {
    const token = this.peek();
    return !token || token.type === 'EOF';
  }

  private skipNewlines(): void {
    while (this.check('NEWLINE')) {
      this.advance();
    }
  }
}

// =============================================================================
// Main Decoder Class
// =============================================================================

export class NeonDecoder {
  private options: NeonDecodeOptions;
  private stats: Partial<NeonStats> = {};

  constructor(options: NeonDecodeOptions = {}) {
    this.options = { ...DEFAULT_DECODE_OPTIONS, ...options };
  }

  /**
   * Decode NEON formatted string to JavaScript value
   */
  decode(input: string): NeonValue {
    const startTime = performance.now();

    // Handle empty or whitespace-only input
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    // Lexical analysis
    const lexer = new NeonLexer(input);
    const tokens = lexer.tokenize();

    // Parsing
    const parser = new NeonParser(this.options);
    const result = parser.parse(tokens);

    const endTime = performance.now();

    // Calculate stats
    this.stats = {
      inputSize: input.length,
      outputSize: JSON.stringify(result).length,
      decodeTimeMs: endTime - startTime,
    };

    return result;
  }

  /**
   * Get decoding statistics from last decode operation
   */
  getStats(): Partial<NeonStats> {
    return { ...this.stats };
  }

  /**
   * Decode with streaming callback for each record
   */
  decodeStream(
    input: string,
    onRecord: (record: NeonValue, index: number) => void
  ): void {
    const lines = input.split('\n');
    let schema: string[] | null = null;
    let index = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Detect schema line
      if (trimmed.includes(NEON_SYMBOLS.SCHEMA)) {
        const schemaMatch = trimmed.match(/\^([^#@\n]+)/);
        if (schemaMatch) {
          schema = schemaMatch[1].split(',').map(f => f.trim());
        }
        continue;
      }

      // Skip header lines
      if (trimmed.startsWith('#') || trimmed.startsWith('@')) {
        continue;
      }

      // Parse data row
      if (schema) {
        const values = this.parseRowValues(trimmed);
        if (values.length === schema.length) {
          const record: NeonObject = {};
          for (let i = 0; i < schema.length; i++) {
            record[schema[i]] = values[i];
          }
          onRecord(record, index++);
        }
      }
    }
  }

  /**
   * Parse a single row of values
   */
  private parseRowValues(line: string): NeonValue[] {
    const values: NeonValue[] = [];
    let current = '';
    let inQuotes = false;
    let escaping = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === '\\') {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if ((char === ' ' || char === '\t') && !inQuotes) {
        if (current) {
          values.push(this.parseSimpleValue(current));
          current = '';
        }
        continue;
      }

      current += char;
    }

    if (current) {
      values.push(this.parseSimpleValue(current));
    }

    return values;
  }

  /**
   * Parse a simple value (primitive)
   */
  private parseSimpleValue(s: string): NeonValue {
    // Null
    if (s === NEON_SYMBOLS.NULL || s === 'null') return null;

    // Boolean
    if (s === NEON_SYMBOLS.TRUE || s === 'true') return true;
    if (s === NEON_SYMBOLS.FALSE || s === 'false') return false;

    // Number with suffix
    if (/^-?\d*\.?\d+[KMBT]?$/i.test(s)) {
      return expandNumber(s);
    }

    // Regular number
    if (/^-?\d*\.?\d+$/.test(s)) {
      return parseFloat(s);
    }

    // String - convert underscores back to spaces
    return s.replace(/_/g, ' ');
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Decode NEON formatted string with default options
 */
export function decode(input: string, options?: NeonDecodeOptions): NeonValue {
  const decoder = new NeonDecoder(options);
  return decoder.decode(input);
}

/**
 * Decode with strict validation
 */
export function decodeStrict(input: string): NeonValue {
  return decode(input, { strict: true, allowUnknownFields: false });
}

/**
 * Decode with streaming callback
 */
export function decodeStream(
  input: string,
  onRecord: (record: NeonValue, index: number) => void,
  options?: NeonDecodeOptions
): void {
  const decoder = new NeonDecoder(options);
  decoder.decodeStream(input, onRecord);
}

/**
 * Validate NEON string without full parsing
 */
export function validate(input: string): { valid: boolean; errors: NeonError[] } {
  const errors: NeonError[] = [];

  try {
    const lexer = new NeonLexer(input);
    lexer.tokenize();
    decode(input, { strict: true });
    return { valid: true, errors: [] };
  } catch (error) {
    if (error instanceof NeonError) {
      errors.push(error);
    } else {
      errors.push(new NeonError(
        'PARSE_ERROR',
        error instanceof Error ? error.message : 'Unknown error'
      ));
    }
    return { valid: false, errors };
  }
}
