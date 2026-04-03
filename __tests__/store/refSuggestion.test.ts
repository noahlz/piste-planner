import { describe, it, expect } from 'vitest'
import { suggestRefs } from '../../src/store/refSuggestion.ts'

describe('suggestRefs', () => {
  it('returns null when no competitions selected', () => {
    expect(suggestRefs({}, 3, 24)).toBeNull()
  })

  it('returns null when strips_total is 0', () => {
    expect(
      suggestRefs({ 'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false } }, 3, 0),
    ).toBeNull()
  })

  it('returns null when days_available is 0', () => {
    expect(
      suggestRefs({ 'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false } }, 0, 24),
    ).toBeNull()
  })

  it('splits refs proportionally between saber and foil/epee', () => {
    const competitions = {
      'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false },
      'CDT-M-SABRE-IND': { fencer_count: 24, use_single_pool_override: false },
    }
    const result = suggestRefs(competitions, 3, 24)
    expect(result).not.toBeNull()
    expect(result!.foil_epee_refs).toBeGreaterThan(0)
    expect(result!.three_weapon_refs).toBeGreaterThan(0)
  })

  it('caps refs at strips_total', () => {
    const competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }> = {
      'CDT-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
      'JR-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
      'D1-M-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
      'CDT-W-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
      'JR-W-FOIL-IND': { fencer_count: 48, use_single_pool_override: false },
    }
    const result = suggestRefs(competitions, 1, 8)
    expect(result).not.toBeNull()
    expect(result!.foil_epee_refs + result!.three_weapon_refs).toBeLessThanOrEqual(8)
  })
})
