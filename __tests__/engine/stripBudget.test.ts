import { describe, it, expect } from 'vitest'
import {
  computeStripCap,
  recommendStripCount,
  recommendRefCount,
  flagFlightingCandidates,
} from '../../src/engine/stripBudget.ts'
import { makeCompetition } from '../helpers/factories.ts'
import { Weapon } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// computeStripCap
// ──────────────────────────────────────────────

describe('computeStripCap', () => {
  it('applies the global percentage when no override is provided', () => {
    expect(computeStripCap(100, 0.80)).toBe(80)
  })

  it('applies the event override percentage when provided', () => {
    expect(computeStripCap(100, 0.80, 0.60)).toBe(60)
  })

  it('uses the global pct when the override is null', () => {
    expect(computeStripCap(100, 0.80, null)).toBe(80)
  })

  it('floors the result', () => {
    // floor(25 * 0.80) = floor(20.0) = 20
    expect(computeStripCap(25, 0.80)).toBe(20)
    // floor(85 * 0.80) = floor(68.0) = 68
    expect(computeStripCap(85, 0.80)).toBe(68)
    // floor(10 * 0.33) = floor(3.3) = 3
    expect(computeStripCap(10, 0.33)).toBe(3)
    // floor(7 * 0.80) = floor(5.6) = 5 (not 6)
    expect(computeStripCap(7, 0.80)).toBe(5)
  })
})

// ──────────────────────────────────────────────
// recommendStripCount
// ──────────────────────────────────────────────

describe('recommendStripCount', () => {
  it('returns 0 for an empty competition list', () => {
    expect(recommendStripCount([], 0.80)).toBe(0)
  })

  it('handles a single competition', () => {
    // fencer_count=21 → n_pools=ceil(21/7)=3; strips=ceil(3/0.80)=4
    const comps = [makeCompetition({ fencer_count: 21 })]
    expect(recommendStripCount(comps, 0.80)).toBe(4)
  })

  it('uses the competition with the most pools', () => {
    const comps = [
      makeCompetition({ id: 'small', fencer_count: 14 }), // ceil(14/7)=2 pools
      makeCompetition({ id: 'large', fencer_count: 70 }), // ceil(70/7)=10 pools
    ]
    // ceil(10 / 0.80) = 13
    expect(recommendStripCount(comps, 0.80)).toBe(13)
  })

  it('plan example: 54 pools at 0.80 → 68 strips', () => {
    // A single event with 378 fencers → ceil(378/7)=54 pools
    const comps = [makeCompetition({ fencer_count: 378 })]
    expect(recommendStripCount(comps, 0.80)).toBe(68)
  })
})

// ──────────────────────────────────────────────
// recommendRefCount
// ──────────────────────────────────────────────

describe('recommendRefCount', () => {
  it('returns zeros for an empty competition list', () => {
    expect(recommendRefCount([], 1)).toEqual({ three_weapon: 0, foil_epee: 0 })
  })

  it('sabre-heavy: all refs are three-weapon, foil/epee surplus is zero', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 's2', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
    ]
    // peakSabre=15, peakFoilEpee=0 → three_weapon=15, foil_epee=0
    expect(recommendRefCount(comps, 1)).toEqual({ three_weapon: 15, foil_epee: 0 })
  })

  it('foil/epee only: three_weapon=0, all go to foil_epee', () => {
    const comps = [
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'e1', weapon: Weapon.EPEE, fencer_count: 35 }), // 5 pools
    ]
    // peakFoilEpee=15, peakSabre=0 → three_weapon=0, foil_epee=15
    expect(recommendRefCount(comps, 1)).toEqual({ three_weapon: 0, foil_epee: 15 })
  })

  it('mixed weapons: foil/epee refs are the surplus beyond the sabre crew', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 's2', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 140 }), // 20 pools
      makeCompetition({ id: 'f2', weapon: Weapon.FOIL, fencer_count: 70 }),  // 10 pools
    ]
    // peakSabre=15, three_weapon=15
    // peakFoilEpee=30, ceil(30*1)=30 − 15 = 15 foil_epee
    expect(recommendRefCount(comps, 1)).toEqual({ three_weapon: 15, foil_epee: 15 })
  })

  it('uses only the top-2 events per weapon class', () => {
    // Third-largest events should not contribute to peak
    const comps = [
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 140 }), // 20 pools
      makeCompetition({ id: 'f2', weapon: Weapon.FOIL, fencer_count: 70 }),  // 10 pools
      makeCompetition({ id: 'f3', weapon: Weapon.FOIL, fencer_count: 490 }), // 70 pools — 3rd!
    ]
    // Pool counts sorted desc: f3=70, f1=20, f2=10. Top-2 are f3 and f1; f2 is excluded.
    // peak foil/epee = 70 + 20 = 90; three_weapon=0
    expect(recommendRefCount(comps, 1)).toEqual({ three_weapon: 0, foil_epee: 90 })
  })

  it('scales with refsPerPool', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
    ]
    // peakSabre=5, refsPerPool=2 → three_weapon=10
    expect(recommendRefCount(comps, 2)).toEqual({ three_weapon: 10, foil_epee: 0 })
  })
})

// ──────────────────────────────────────────────
// flagFlightingCandidates
// ──────────────────────────────────────────────

describe('flagFlightingCandidates', () => {
  it('returns empty array when all events fit within the cap', () => {
    const comps = [
      makeCompetition({ id: 'a', fencer_count: 21 }), // 3 pools
      makeCompetition({ id: 'b', fencer_count: 14 }), // 2 pools
    ]
    expect(flagFlightingCandidates(comps, 5)).toEqual([])
  })

  it('flags events whose pool count exceeds the cap', () => {
    const comps = [
      makeCompetition({ id: 'big', fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'small', fencer_count: 14 }), // 2 pools
    ]
    // cap=8: 10>8 → 'big' flagged; 2≤8 → 'small' not flagged
    expect(flagFlightingCandidates(comps, 8)).toEqual(['big'])
  })

  it('flags multiple events when several exceed the cap', () => {
    const comps = [
      makeCompetition({ id: 'a', fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'b', fencer_count: 56 }), // 8 pools
      makeCompetition({ id: 'c', fencer_count: 14 }), // 2 pools
    ]
    // cap=7: 10>7, 8>7 → both flagged
    expect(flagFlightingCandidates(comps, 7)).toEqual(['a', 'b'])
  })

  it('does not flag an event exactly at the cap', () => {
    const comps = [makeCompetition({ id: 'exact', fencer_count: 56 })] // 8 pools
    expect(flagFlightingCandidates(comps, 8)).toEqual([])
  })

  it('correctly computes n_pools=1 for small events (≤9 fencers), not ceil(9/7)=2', () => {
    // Without the poolCountFor fix, Math.ceil(9/7)=2 would incorrectly flag this
    // at a cap of 1, but the real pool count is 1 so it should not be flagged at cap=1.
    const comps = [makeCompetition({ id: 'tiny', fencer_count: 9 })]
    expect(flagFlightingCandidates(comps, 1)).toEqual([])
  })
})
