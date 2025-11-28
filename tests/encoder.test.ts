/**
 * NEON Encoder Test Suite
 *
 * Comprehensive tests including edge cases and round-trip verification
 */

import { encode, encodeCompact } from '../src/encoder';
import { decode } from '../src/decoder';

// =============================================================================
// Test Utilities
// =============================================================================

function expectRoundTrip(value: any, options?: any): void {
  const encoded = encode(value, options);
  const decoded = decode(encoded);
  expect(decoded).toEqual(value);
}

// =============================================================================
// Primitive Type Tests
// =============================================================================

describe('Primitives', () => {
  describe('null', () => {
    it('encodes null as N in compact mode', () => {
      expect(encode({ value: null })).toContain('N');
    });

    it('encodes null as null in strict mode', () => {
      expect(encode({ value: null }, { compressNulls: false })).toContain('null');
    });
  });

  describe('boolean', () => {
    it('encodes true as T in compact mode', () => {
      expect(encode({ active: true })).toContain('T');
    });

    it('encodes false as F in compact mode', () => {
      expect(encode({ active: false })).toContain('F');
    });

    it('encodes boolean as true/false in strict mode', () => {
      const result = encode({ active: true }, { compressBooleans: false });
      expect(result).toContain('true');
    });
  });

  describe('numbers', () => {
    it('encodes integers', () => {
      expect(encode({ n: 42 })).toContain('42');
    });

    it('encodes negative integers', () => {
      expect(encode({ n: -17 })).toContain('-17');
    });

    it('encodes decimals', () => {
      expect(encode({ n: 3.14 })).toMatch(/3\.14/);
    });

    it('encodes small decimals with leading dot', () => {
      const result = encode({ n: 0.5 });
      expect(result).toMatch(/\.5/);
    });

    it('abbreviates thousands as K', () => {
      expect(encode({ n: 95000 })).toContain('95K');
    });

    it('abbreviates millions as M', () => {
      expect(encode({ n: 2500000 })).toContain('2.5M');
    });

    it('abbreviates billions as B', () => {
      expect(encode({ n: 1000000000 })).toContain('1B');
    });

    it('does not abbreviate when disabled', () => {
      expect(encode({ n: 95000 }, { compressNumbers: false })).toContain('95000');
    });

    it('handles zero', () => {
      expect(encode({ n: 0 })).toContain('0');
    });

    it('handles negative decimals', () => {
      expect(encode({ n: -0.5 })).toMatch(/-\.?5/);
    });
  });

  describe('strings', () => {
    it('encodes simple strings without quotes', () => {
      expect(encode({ name: 'Alice' })).toContain('Alice');
      expect(encode({ name: 'Alice' })).not.toContain('"');
    });

    it('replaces spaces with underscores', () => {
      expect(encode({ name: 'Alice Johnson' })).toContain('Alice_Johnson');
    });

    it('quotes strings with special characters', () => {
      expect(encode({ msg: 'hello:world' })).toContain('"hello:world"');
    });

    it('escapes quotes in strings', () => {
      expect(encode({ msg: 'say "hello"' })).toContain('\\"');
    });

    it('escapes backslashes', () => {
      expect(encode({ path: 'C:\\path' })).toContain('\\\\');
    });

    it('escapes newlines', () => {
      expect(encode({ text: 'line1\nline2' })).toContain('\\n');
    });

    it('handles empty strings', () => {
      expect(encode({ empty: '' })).toContain('""');
    });

    it('quotes strings that look like numbers', () => {
      expect(encode({ code: '123' })).toContain('"123"');
    });

    it('quotes strings that look like booleans', () => {
      expect(encode({ val: 'T' })).toContain('"T"');
      expect(encode({ val: 'F' })).toContain('"F"');
      expect(encode({ val: 'N' })).toContain('"N"');
    });
  });
});

// =============================================================================
// Array Tests
// =============================================================================

describe('Arrays', () => {
  describe('empty arrays', () => {
    it('encodes empty array as #0', () => {
      expect(encode({ items: [] })).toContain('#0');
    });
  });

  describe('primitive arrays', () => {
    it('encodes number array inline', () => {
      const result = encode({ nums: [1, 2, 3] });
      expect(result).toContain('#3');
      expect(result).toMatch(/1\s+2\s+3/);
    });

    it('encodes string array inline', () => {
      const result = encode({ tags: ['a', 'b', 'c'] });
      expect(result).toContain('#3');
    });

    it('encodes boolean array', () => {
      const result = encode({ flags: [true, false, true] });
      expect(result).toContain('T');
      expect(result).toContain('F');
    });
  });

  describe('tabular arrays', () => {
    it('detects uniform objects and uses schema', () => {
      const data = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      };
      const result = encode(data);
      expect(result).toContain('^id,name');
      expect(result).toContain('Alice');
      expect(result).toContain('Bob');
    });

    it('encodes each row on new line', () => {
      const data = {
        items: [
          { a: 1, b: 2 },
          { a: 3, b: 4 },
        ],
      };
      const result = encode(data);
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('list arrays', () => {
    it('encodes non-uniform arrays as list', () => {
      const data = {
        mixed: [1, 'two', { three: 3 }],
      };
      const result = encode(data);
      expect(result).toContain('-');
    });
  });
});

// =============================================================================
// Object Tests
// =============================================================================

describe('Objects', () => {
  describe('empty objects', () => {
    it('encodes empty object as @', () => {
      expect(encode({ obj: {} })).toContain('@');
    });
  });

  describe('simple objects', () => {
    it('encodes key:value pairs', () => {
      const result = encode({ id: 1, name: 'Alice' });
      expect(result).toContain('id:1');
      expect(result).toContain('name:Alice');
    });
  });

  describe('nested objects', () => {
    it('encodes nested structures', () => {
      const data = {
        user: {
          profile: {
            name: 'Alice',
          },
        },
      };
      const result = encode(data);
      expect(result).toContain('name:Alice');
    });
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('special characters in keys', () => {
    it('handles keys with spaces', () => {
      const data = { 'first name': 'Alice' };
      const result = encode(data);
      const hasUnderscore = result.includes('first_name');
      const hasQuoted = result.includes('"first name"');
      expect(hasUnderscore || hasQuoted).toBe(true);
    });
  });

  describe('unicode', () => {
    it('handles unicode characters', () => {
      const data = { emoji: 'Hello' };
      const result = encode(data);
      const decoded = decode(result);
      expect(decoded).toEqual(data);
    });

    it('handles CJK characters', () => {
      const data = { text: 'text' };
      expectRoundTrip(data);
    });
  });

  describe('deep nesting', () => {
    it('handles deeply nested structures', () => {
      let obj: any = { value: 'deep' };
      for (let i = 0; i < 10; i++) {
        obj = { nested: obj };
      }
      expect(() => encode(obj)).not.toThrow();
    });
  });

  describe('large arrays', () => {
    it('handles arrays with many elements', () => {
      const data = {
        items: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          name: `Item ${i}`,
        })),
      };
      const result = encode(data);
      expect(result).toContain('#100');
    });
  });

  describe('mixed content', () => {
    it('handles arrays of arrays', () => {
      const data = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
        ],
      };
      expect(() => encode(data)).not.toThrow();
    });
  });

  describe('numeric precision', () => {
    it('preserves reasonable precision', () => {
      const data = { precise: 3.141592653589793 };
      const result = encode(data, { compressNumbers: false });
      expect(result).toMatch(/3\.14159/);
    });
  });
});

// =============================================================================
// Round-Trip Tests
// =============================================================================

describe('Round-Trip', () => {
  it('preserves simple objects', () => {
    expectRoundTrip({ id: 1, name: 'Alice', active: true });
  });

  it('preserves arrays', () => {
    expectRoundTrip({ items: [1, 2, 3] });
  });

  it('preserves tabular data', () => {
    expectRoundTrip({
      users: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
    });
  });

  it('preserves null values', () => {
    expectRoundTrip({ value: null });
  });

  it('preserves empty structures', () => {
    expectRoundTrip({ empty: {} });
    expectRoundTrip({ empty: [] });
  });

  it('preserves nested structures', () => {
    expectRoundTrip({
      user: {
        profile: {
          name: 'Alice',
          age: 30,
        },
      },
    });
  });
});

// =============================================================================
// Compression Tests
// =============================================================================

describe('Compression', () => {
  it('compact mode produces smaller output', () => {
    const data = {
      users: [
        { id: 1, name: 'Alice', active: true, salary: 95000 },
        { id: 2, name: 'Bob', active: false, salary: 75000 },
      ],
    };

    const json = JSON.stringify(data);
    const neon = encode(data);
    const compact = encodeCompact(data);

    expect(neon.length).toBeLessThan(json.length);
    expect(compact.length).toBeLessThanOrEqual(neon.length);
  });

  it('abbreviates field names when enabled', () => {
    const data = { department: 'Engineering' };
    const result = encode(data, { abbreviateFields: true });
    // May contain 'dept' instead of 'department'
    expect(result.length).toBeLessThanOrEqual(encode(data, { abbreviateFields: false }).length);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('Performance', () => {
  it('encodes 1000 records in under 100ms', () => {
    const data = {
      users: Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        active: i % 2 === 0,
      })),
    };

    const start = performance.now();
    encode(data);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
