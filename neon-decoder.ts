/**
 * NEON - Neural Efficient Object Notation
 * Decoder implementation
 */

export interface NeonDecodeOptions {
  strict?: boolean
  expandPaths?: boolean
}

export class NeonDecoder {
  private lines: string[] = []
  private currentLine = 0
  private schemaCache: Map<string, string[]> = new Map()
  
  constructor(private options: NeonDecodeOptions = {}) {
    this.options = {
      strict: true,
      expandPaths: false,
      ...options
    }
  }

  decode(input: string): any {
    this.lines = input.trim().split('\n')
    this.currentLine = 0
    this.schemaCache = new Map()
    
    return this.parseValue(this.lines[0], 0)
  }

  private parseValue(line: string, depth: number): any {
    line = line.trim()
    
    if (!line) return null
    
    // Null
    if (line === 'N') return null
    
    // Boolean
    if (line === 'T') return true
    if (line === 'F') return false
    
    // Number
    if (/^-?\d+(\.\d+)?[KM]?$/.test(line)) {
      return this.parseNumber(line)
    }
    
    // Array
    if (line.startsWith('#')) {
      return this.parseArray(line, depth)
    }
    
    // Object
    if (line.startsWith('@')) {
      return this.parseObject(line, depth)
    }
    
    // String
    return this.parseString(line)
  }

  private parseNumber(s: string): number {
    if (s.endsWith('M')) {
      return parseFloat(s.slice(0, -1)) * 1_000_000
    }
    if (s.endsWith('K')) {
      return parseFloat(s.slice(0, -1)) * 1_000
    }
    if (s.startsWith('.')) {
      return parseFloat('0' + s)
    }
    return parseFloat(s)
  }

  private parseString(s: string): string {
    // Quoted string
    if (s.startsWith('"') && s.endsWith('"')) {
      return s
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\')
    }
    
    // Unquoted - replace underscores back to spaces
    return s.replace(/_/g, ' ')
  }

  private parseArray(line: string, depth: number): any[] {
    // Extract length and schema
    const match = line.match(/^#(\d+)(\^(.+?))?(\s|$)/)
    if (!match) {
      throw new Error(`Invalid array header: ${line}`)
    }
    
    const length = parseInt(match[1])
    const schema = match[3]
    const rest = line.slice(match[0].length).trim()
    
    if (length === 0) return []
    
    // Primitive array on same line
    if (rest && !schema) {
      return rest.split(/\s+/).map(v => this.parseValue(v, depth))
    }
    
    // Tabular array
    if (schema) {
      return this.parseTabularArray(length, schema.split(','), depth)
    }
    
    // List array
    return this.parseListArray(length, depth)
  }

  private parseTabularArray(length: number, fields: string[], depth: number): any[] {
    const result: any[] = []
    const expectedIndent = ' '.repeat((depth + 1) * 2)
    
    for (let i = 0; i < length; i++) {
      this.currentLine++
      if (this.currentLine >= this.lines.length) {
        throw new Error(`Array truncated: expected ${length} rows, got ${i}`)
      }
      
      const line = this.lines[this.currentLine]
      const trimmed = line.trimStart()
      
      // Split by delimiter (space, tab, or pipe)
      let values: string[]
      if (line.includes('|')) {
        values = trimmed.split('|').map(v => v.trim())
      } else if (line.includes('\t')) {
        values = trimmed.split('\t').map(v => v.trim())
      } else {
        // Space-delimited - need smarter parsing for quoted strings
        values = this.smartSplit(trimmed, ' ')
      }
      
      if (values.length !== fields.length) {
        throw new Error(`Field count mismatch: expected ${fields.length}, got ${values.length}`)
      }
      
      const obj: any = {}
      for (let j = 0; j < fields.length; j++) {
        obj[fields[j]] = this.parseValue(values[j], depth + 1)
      }
      result.push(obj)
    }
    
    return result
  }

  private smartSplit(s: string, delimiter: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    let escaping = false
    
    for (let i = 0; i < s.length; i++) {
      const char = s[i]
      
      if (escaping) {
        current += char
        escaping = false
        continue
      }
      
      if (char === '\\') {
        escaping = true
        current += char
        continue
      }
      
      if (char === '"') {
        inQuotes = !inQuotes
        current += char
        continue
      }
      
      if (char === delimiter && !inQuotes) {
        if (current) {
          result.push(current)
          current = ''
        }
        continue
      }
      
      current += char
    }
    
    if (current) {
      result.push(current)
    }
    
    return result
  }

  private parseListArray(length: number, depth: number): any[] {
    const result: any[] = []
    
    for (let i = 0; i < length; i++) {
      this.currentLine++
      if (this.currentLine >= this.lines.length) {
        throw new Error(`Array truncated: expected ${length} items, got ${i}`)
      }
      
      const line = this.lines[this.currentLine].trim()
      if (!line.startsWith('- ')) {
        throw new Error(`Expected list item with '- ' prefix: ${line}`)
      }
      
      const value = line.slice(2).trim()
      result.push(this.parseValue(value, depth + 1))
    }
    
    return result
  }

  private parseObject(line: string, depth: number): any {
    const obj: any = {}
    
    // Remove @ prefix
    line = line.slice(1).trim()
    
    if (!line) return obj
    
    // Parse key:value pairs
    const pairs = this.smartSplit(line, ' ')
    
    for (const pair of pairs) {
      if (!pair.includes(':')) continue
      
      const colonIdx = pair.indexOf(':')
      const key = this.parseString(pair.slice(0, colonIdx))
      const value = pair.slice(colonIdx + 1)
      
      if (value) {
        obj[key] = this.parseValue(value, depth)
      } else {
        // Nested object on next lines
        // This is simplified - full implementation would parse nested structure
        obj[key] = {}
      }
    }
    
    return obj
  }
}

/**
 * Decode a NEON formatted string to JavaScript value
 */
export function decode(input: string, options?: NeonDecodeOptions): any {
  const decoder = new NeonDecoder(options)
  return decoder.decode(input)
}
