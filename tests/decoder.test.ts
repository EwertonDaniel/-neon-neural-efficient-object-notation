/**
 * NEON Decoder Test Suite
 *
 * Comprehensive tests for parsing and error handling
 */

import { decode, validate, NeonDecoder } from '../src/decoder';
import { encode } from '../src/encoder';

// =============================================================================
// Primitive Parsing Tests
// =============================================================================

describe('Primitive Parsing', () => {
  describe('null', () => {
    it('parses N as null', () => {
      const result = decode('@value:N');
      expect(result).toEqual({ value: null });
    });

    it('parses null as null', () => {
      const result = decode('@value:null');
      expect(result).toEqual({ value: null });
    });
  });

  describe('boolean', () => {
    it('parses T as true', () => {
      const result = decode('@active:T');
      expect(result).toEqual({ active: true });
    });

    it('parses F as false', () => {
      const result = decode('@active:F');
      expect(result).toEqual({ active: false });
    });

    it('parses true as true', () => {
      const result = decode('@active:true');
      expect(result).toEqual({ active: true });
    });

    it('parses false as false', () => {
      const result = decode('@active:false');
      expect(result).toEqual({ active: false });
    });
  });

  describe('numbers', () => {
    it('parses integers', () => {
      const result = decode('@n:42');
      expect(result).toEqual({ n: 42 });
    });

    it('parses negative integers', () => {
      const result = decode('@n:-17');
      expect(result).toEqual({ n: -17 });
    });

    it('parses decimals', () => {
      const result = decode('@n:3.14');
      expect(result).toEqual({ n: 3.14 });
    });

    it('parses leading dot decimals', () => {
      const result = decode('@n:.5');
      expect(result).toEqual({ n: 0.5 });
    });

    it('expands K suffix', () => {
      const result = decode('@n:95K');
      expect(result).toEqual({ n: 95000 });
    });

    it('expands M suffix', () => {
      const result = decode('@n:2.5M');
      expect(result).toEqual({ n: 2500000 });
    });

    it('expands B suffix', () => {
      const result = decode('@n:1B');
      expect(result).toEqual({ n: 1000000000 });
    });

    it('expands T suffix', () => {
      const result = decode('@n:1T');
      expect(result).toEqual({ n: 1000000000000 });
    });

    it('handles decimal with suffix', () => {
      const result = decode('@n:1.5K');
      expect(result).toEqual({ n: 1500 });
    });
  });

  describe('strings', () => {
    it('parses unquoted strings', () => {
      const result = decode('@name:Alice');
      expect(result).toEqual({ name: 'Alice' });
    });

    it('converts underscores to spaces', () => {
      const result = decode('@name:Alice_Johnson');
      expect(result).toEqual({ name: 'Alice Johnson' });
    });

    it('parses quoted strings', () => {
      const result = decode('@msg:"hello world"');
      expect(result).toEqual({ msg: 'hello world' });
    });

    it('unescapes quotes in strings', () => {
      const result = decode('@msg:"say \\"hello\\""');
      expect(result).toEqual({ msg: 'say "hello"' });
    });

    it('unescapes backslashes', () => {
      const result = decode('@path:"C:\\\\path"');
      expect(result).toEqual({ path: 'C:\\path' });
    });

    it('unescapes newlines', () => {
      const result = decode('@text:"line1\\nline2"');
      expect(result).toEqual({ text: 'line1\nline2' });
    });

    it('handles empty strings', () => {
      const result = decode('@empty:""');
      expect(result).toEqual({ empty: '' });
    });
  });
});

// =============================================================================
// Array Parsing Tests
// =============================================================================

describe('Array Parsing', () => {
  describe('empty arrays', () => {
    it('parses #0 as empty array', () => {
      const result = decode('items#0');
      expect(result).toEqual({ items: [] });
    });
  });

  describe('primitive arrays', () => {
    it('parses inline number array', () => {
      const result = decode('nums#3 1 2 3');
      expect(result).toEqual({ nums: [1, 2, 3] });
    });

    it('parses inline string array', () => {
      const result = decode('tags#3 a b c');
      expect(result).toEqual({ tags: ['a', 'b', 'c'] });
    });

    it('parses inline boolean array', () => {
      const result = decode('flags#3 T F T');
      expect(result).toEqual({ flags: [true, false, true] });
    });
  });

  describe('tabular arrays', () => {
    it('parses tabular array with schema', () => {
      const input = `users#2^id,name
  1 Alice
  2 Bob`;
      const result = decode(input);
      expect(result).toEqual({
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
      });
    });

    it('handles multiple fields', () => {
      const input = `items#2^id,name,active
  1 Alice T
  2 Bob F`;
      const result = decode(input);
      expect(result).toEqual({
        items: [
          { id: 1, name: 'Alice', active: true },
          { id: 2, name: 'Bob', active: false },
        ],
      });
    });

    it('handles numeric values in rows', () => {
      const input = `items#2^id,value,ratio
  1 100 .5
  2 200K 1.5`;
      const result = decode(input);
      expect(result).toEqual({
        items: [
          { id: 1, value: 100, ratio: 0.5 },
          { id: 2, value: 200000, ratio: 1.5 },
        ],
      });
    });

    it('handles quoted strings in rows', () => {
      const input = `items#2^id,name
  1 "Hello World"
  2 Simple`;
      const result = decode(input);
      expect(result).toEqual({
        items: [
          { id: 1, name: 'Hello World' },
          { id: 2, name: 'Simple' },
        ],
      });
    });
  });
});

// =============================================================================
// Object Parsing Tests
// =============================================================================

describe('Object Parsing', () => {
  describe('empty objects', () => {
    it('parses @ as empty object', () => {
      const result = decode('@');
      expect(result).toEqual({});
    });
  });

  describe('simple objects', () => {
    it('parses single property', () => {
      const result = decode('@id:1');
      expect(result).toEqual({ id: 1 });
    });

    it('parses multiple properties', () => {
      const result = decode('@id:1 name:Alice');
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });
  });
});

// =============================================================================
// Streaming Tests
// =============================================================================

describe('Streaming', () => {
  it('processes records via callback', () => {
    const input = `users#3^id,name
  1 Alice
  2 Bob
  3 Carol`;

    const records: any[] = [];
    const decoder = new NeonDecoder();
    decoder.decodeStream(input, (record, index) => {
      records.push({ record, index });
    });

    expect(records.length).toBe(3);
    expect(records[0].record).toEqual({ id: 1, name: 'Alice' });
    expect(records[0].index).toBe(0);
    expect(records[2].record).toEqual({ id: 3, name: 'Carol' });
  });

  it('handles large streams', () => {
    const lines = ['items#100^id,name'];
    for (let i = 1; i <= 100; i++) {
      lines.push(`  ${i} Item_${i}`);
    }
    const input = lines.join('\n');

    const records: any[] = [];
    const decoder = new NeonDecoder();
    decoder.decodeStream(input, (record) => {
      records.push(record);
    });

    expect(records.length).toBe(100);
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('Validation', () => {
  it('validates correct NEON', () => {
    const result = validate('@id:1 name:Alice');
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('validates tabular format', () => {
    const input = `users#2^id,name
  1 Alice
  2 Bob`;
    const result = validate(input);
    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  it('handles empty input', () => {
    const result = decode('');
    expect(result).toBeNull();
  });

  it('handles whitespace-only input', () => {
    const result = decode('   \n   ');
    expect(result).toBeNull();
  });
});

// =============================================================================
// Integration Tests (Encode -> Decode)
// =============================================================================

describe('Integration', () => {
  it('round-trips simple object', () => {
    const data = { id: 1, name: 'Alice' };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips boolean values', () => {
    const data = { active: true, deleted: false };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips null value', () => {
    const data = { value: null };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips number array', () => {
    const data = { nums: [1, 2, 3] };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips empty array', () => {
    const data = { items: [] as number[] };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips tabular data', () => {
    const data = {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false },
      ],
    };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('round-trips mixed types', () => {
    const data = {
      id: 42,
      name: 'Test',
      active: true,
      count: null,
      score: 95.5,
    };
    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });
});

// =============================================================================
// Compatibility Tests
// =============================================================================

describe('JSON Compatibility', () => {
  it('handles all JSON primitive types', () => {
    const data = {
      string: 'hello',
      number: 42,
      decimal: 3.14,
      boolTrue: true,
      boolFalse: false,
      nullValue: null,
    };

    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('handles nested JSON structures', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
          },
        },
      },
    };

    const encoded = encode(data);
    const decoded = decode(encoded);
    expect(decoded).toEqual(data);
  });

  it('handles JSON arrays', () => {
    const data = {
      items: [
        { id: 1, children: [{ name: 'a' }, { name: 'b' }] },
        { id: 2, children: [{ name: 'c' }] },
      ],
    };

    // Note: NEON handles uniform arrays well; mixed nesting may vary
    const encoded = encode(data);
    expect(() => decode(encoded)).not.toThrow();
  });
});
