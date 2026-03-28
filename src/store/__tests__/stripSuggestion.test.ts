import { describe, it, expect } from 'vitest'
import { suggestStrips } from '../stripSuggestion'

describe('suggestStrips', () => {
  it('returns null when no competitions', () => {
    expect(suggestStrips({}, false)).toBeNull()
  })

  it('returns null when all fencer counts are 0', () => {
    const comps = { 'comp-1': { fencer_count: 0, use_single_pool_override: false } }
    expect(suggestStrips(comps, false)).toBeNull()
  })

  it('suggests n_pools for largest competition', () => {
    // 300 fencers → ceil(300/7) = 43 pools
    const comps = {
      'large': { fencer_count: 300, use_single_pool_override: false },
      'small': { fencer_count: 20, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, false)).toBe(43)
  })

  it('adds +1 when include finals strip is true', () => {
    const comps = {
      'large': { fencer_count: 300, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, true)).toBe(44)
  })

  it('handles single pool override', () => {
    // 10 fencers with override → 1 pool
    const comps = {
      'small': { fencer_count: 10, use_single_pool_override: true },
    }
    expect(suggestStrips(comps, false)).toBe(1)
  })

  it('handles small competition (≤9 fencers)', () => {
    // 8 fencers → 1 pool
    const comps = {
      'tiny': { fencer_count: 8, use_single_pool_override: false },
    }
    expect(suggestStrips(comps, false)).toBe(1)
  })

  it('skips competitions with fencer_count < 2', () => {
    const comps = {
      'invalid': { fencer_count: 1, use_single_pool_override: false },
      'valid': { fencer_count: 50, use_single_pool_override: false },
    }
    // 50 fencers → ceil(50/7) = 8 pools
    expect(suggestStrips(comps, false)).toBe(8)
  })
})
