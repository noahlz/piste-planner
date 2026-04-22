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
    // 24 FOIL (4 pools) + 24 SABRE (4 pools) → equal pool split (50%/50%).
    // totalPools=8, poolsPerDay=ceil(8/3)=3, stripsInUse=min(3,24)=3.
    // saberRatio=0.5, saberRefs=max(1,round(3*0.5))=max(1,2)=2.
    // foilEpeeRefs=max(1,3-2)=1.
    const competitions = {
      'CDT-M-FOIL-IND': { fencer_count: 24, use_single_pool_override: false },
      'CDT-M-SABRE-IND': { fencer_count: 24, use_single_pool_override: false },
    }
    const result = suggestRefs(competitions, 3, 24)
    expect(result).not.toBeNull()
    expect(result!.foil_epee_refs).toBe(1)
    expect(result!.three_weapon_refs).toBe(2)
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
