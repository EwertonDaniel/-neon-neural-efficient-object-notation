/**
 * NEON - Neural Efficient Object Notation
 * 
 * The future of data serialization for AI
 * 
 * @module neon-format
 * @version 1.0.0
 * @license MIT
 */

export { 
  encode, 
  encodeCompact,
  NeonEncoder,
  type NeonEncodeOptions 
} from './neon-encoder'

export { 
  decode,
  NeonDecoder,
  type NeonDecodeOptions 
} from './neon-decoder'

// Quick examples for documentation
export const examples = {
  simple: {
    input: { id: 1, name: 'Alice', active: true },
    output: '@id:1 name:Alice active:T'
  },
  array: {
    input: { tags: ['admin', 'user', 'dev'] },
    output: 'tags#3 admin user dev'
  },
  tabular: {
    input: {
      users: [
        { id: 1, name: 'Alice', active: true },
        { id: 2, name: 'Bob', active: false }
      ]
    },
    output: `users#2^id,name,active
  1 Alice T
  2 Bob F`
  }
}

// Version info
export const version = '1.0.0'
export const name = 'NEON'
export const fullName = 'Neural Efficient Object Notation'

/**
 * Get format statistics for a given data object
 */
export function getStats(data: any): {
  jsonSize: number
  neonSize: number
  jsonTokens: number
  neonTokens: number
  savingsPercent: number
  savingsTokens: number
} {
  const jsonStr = JSON.stringify(data, null, 2)
  const neonStr = encode(data)
  
  const jsonTokens = Math.ceil(jsonStr.length / 4)
  const neonTokens = Math.ceil(neonStr.length / 4)
  
  return {
    jsonSize: jsonStr.length,
    neonSize: neonStr.length,
    jsonTokens,
    neonTokens,
    savingsPercent: Math.round((1 - neonStr.length / jsonStr.length) * 100),
    savingsTokens: jsonTokens - neonTokens
  }
}

// Re-export for convenience
import { encode } from './neon-encoder'
