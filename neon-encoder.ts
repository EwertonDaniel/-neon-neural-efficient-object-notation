/**
 * NEON - Neural Efficient Object Notation
 * Encoder implementation
 */

export interface NeonEncodeOptions {
  mode?: 'readable' | 'ultra-compact' | 'hybrid'
  compress?: boolean
  abbreviate?: boolean
  indent?: number
  delimiter?: ' ' | '|' | '\t'
}

interface SchemaCache {
  [key: string]: string[]
}

export class NeonEncoder {
  private schemaCache: SchemaCache = {}
  private referenceCache: Map<any, string> = new Map()
  private refCounter = 0
  
  constructor(private options: NeonEncodeOptions = {}) {
    this.options = {
      mode: 'readable',
      compress: true,
      abbreviate: true,
      indent: 2,
      delimiter: ' ',
      ...options
    }
  }

  encode(value: any): string {
    this.schemaCache = {}
    this.referenceCache = new Map()
    this.refCounter = 0
    
    return this.encodeValue(value, 0)
  }

  private encodeValue(value: any, depth: number): string {
    if (value === null) return 'N'
    if (value === undefined) return 'N'
    
    const type = typeof value
    
    if (type === 'boolean') return value ? 'T' : 'F'
    if (type === 'number') return this.encodeNumber(value)
    if (type === 'string') return this.encodeString(value)
    
    if (Array.isArray(value)) {
      return this.encodeArray(value, depth)
    }
    
    if (type === 'object') {
      return this.encodeObject(value, depth)
    }
    
    return 'N'
  }

  private encodeNumber(n: number): string {
    if (!this.options.abbreviate) return String(n)
    
    // Abbreviate large numbers
    if (n >= 1_000_000) {
      const m = n / 1_000_000
      return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
    }
    if (n >= 1_000) {
      const k = n / 1_000
      return k % 1 === 0 ? `${k}K` : `${k.toFixed(1)}K`
    }
    
    // Remove leading zero for decimals
    if (n > 0 && n < 1) {
      return String(n).replace('0.', '.')
    }
    
    return String(n)
  }

  private encodeString(s: string): string {
    if (!s) return '""'
    
    const del = this.options.delimiter!
    const needsQuotes = 
      s.includes(del) ||
      s.includes(':') ||
      s.includes('"') ||
      s.includes('\\') ||
      s.includes('\n') ||
      s.startsWith(' ') ||
      s.endsWith(' ') ||
      s === 'T' || s === 'F' || s === 'N' ||
      /^-?\d+(\.\d+)?$/.test(s)
    
    if (!needsQuotes) {
      // Replace spaces with underscores for readability
      return s.replace(/ /g, '_')
    }
    
    // Escape quotes and backslashes
    const escaped = s
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t')
    
    return `"${escaped}"`
  }

  private encodeArray(arr: any[], depth: number): string {
    if (arr.length === 0) return '#0'
    
    // Check if array is tabular (uniform objects)
    const isTabular = this.isTabularArray(arr)
    
    if (isTabular) {
      return this.encodeTabularArray(arr, depth)
    }
    
    // Check if array of primitives
    const isPrimitive = arr.every(item => 
      typeof item !== 'object' || item === null
    )
    
    if (isPrimitive) {
      return this.encodePrimitiveArray(arr)
    }
    
    // Mixed array - use list format
    return this.encodeListArray(arr, depth)
  }

  private isTabularArray(arr: any[]): boolean {
    if (!arr.length) return false
    if (typeof arr[0] !== 'object' || arr[0] === null) return false
    
    const firstKeys = Object.keys(arr[0]).sort()
    
    return arr.every(item => {
      if (typeof item !== 'object' || item === null) return false
      const keys = Object.keys(item).sort()
      if (keys.length !== firstKeys.length) return false
      return keys.every((k, i) => k === firstKeys[i])
    })
  }

  private encodeTabularArray(arr: any[], depth: number): string {
    const keys = Object.keys(arr[0])
    const schema = keys.join(',')
    const del = this.options.delimiter!
    
    let result = `#${arr.length}^${schema}`
    
    const indent = this.options.mode === 'ultra-compact' ? '' : 
                   ' '.repeat(this.options.indent! * (depth + 1))
    
    for (const item of arr) {
      result += '\n' + indent
      const values = keys.map(k => this.encodeValue(item[k], depth + 1))
      result += values.join(del)
    }
    
    return result
  }

  private encodePrimitiveArray(arr: any[]): string {
    const del = this.options.delimiter!
    const values = arr.map(v => this.encodeValue(v, 0))
    return `#${arr.length} ${values.join(del)}`
  }

  private encodeListArray(arr: any[], depth: number): string {
    const indent = ' '.repeat(this.options.indent! * (depth + 1))
    let result = `#${arr.length}`
    
    for (const item of arr) {
      result += '\n' + indent + '- '
      result += this.encodeValue(item, depth + 1)
    }
    
    return result
  }

  private encodeObject(obj: any, depth: number): string {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '@'
    
    const indent = ' '.repeat(this.options.indent! * depth)
    const parts: string[] = []
    
    for (const [key, value] of entries) {
      const encodedKey = this.encodeString(key)
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Nested object
        parts.push(`${encodedKey}:`)
        const nested = this.encodeObject(value, depth + 1)
        parts.push('\n' + ' '.repeat(this.options.indent! * (depth + 1)) + nested)
      } else if (Array.isArray(value)) {
        parts.push(`${encodedKey}${this.encodeArray(value, depth + 1)}`)
      } else {
        parts.push(`${encodedKey}:${this.encodeValue(value, depth)}`)
      }
    }
    
    return '@' + parts.join(' ')
  }
}

/**
 * Encode a JavaScript value to NEON format
 */
export function encode(value: any, options?: NeonEncodeOptions): string {
  const encoder = new NeonEncoder(options)
  return encoder.encode(value)
}

/**
 * Quick helper to encode with ultra-compact mode
 */
export function encodeCompact(value: any): string {
  return encode(value, { 
    mode: 'ultra-compact',
    compress: true,
    abbreviate: true
  })
}
