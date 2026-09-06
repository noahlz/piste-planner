import { describe, it, expect } from 'vitest'
import {
  computeStripCap,
  recommendStripCount,
  recommendRefCount,
  flagFlightingCandidates,
} from '../../src/engine/stripBudget.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'
import { Weapon, DeMode } from '../../src/engine/types.ts'

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

// 011 T011: this name is now an alias for `analysis.ts`'s `suggestStripCount`
// (research.md D4/D5, FR-005..FR-010) and the signature gained `daysAvailable`.
// The rule itself is pinned in `analysis.test.ts`; what these four cases hold is
// the DELEGATION — that this name is no longer the max-over-events rule, that
// both of its extra arguments reach the rule, and that the absence of an answer
// crosses the alias as `null` rather than being coerced to 0.
//
// Every expected number below was `[M]` measured by running the rule, not
// derived by hand (tasks.md standing rule 8).

describe('recommendStripCount', () => {
  it('reports the absence of an answer, not 0, for an empty competition list', () => {
    // The old max rule returned 0 here. 0 is a legitimate strip count and would
    // read to the post-schedule INFO as "need 0 strips"; the absence of any
    // sizeable competition is not that (FR-010). The INFO's gate reads the null
    // and emits nothing at all.
    expect(recommendStripCount([], 2, 0.80)).toBeNull()
  })

  it('sums the events sharing the busiest day rather than taking the largest', () => {
    const comps = [
      makeCompetition({ id: 'small', fencer_count: 14 }), // ceil(14/7)=2 pools
      makeCompetition({ id: 'large', fencer_count: 70 }), // ceil(70/7)=10 pools
    ]
    // One day, so both events share it: 2 + 10 = 12 pools concurrent,
    // ceil(12 / 0.80) = 15. The max rule this replaces returned 13 — it sized
    // for the larger event alone and left the smaller one's 2 pools unhoused.
    expect(recommendStripCount(comps, 1, 0.80)).toBe(15)
  })

  it('passes the day count through — the same events over more days need fewer strips', () => {
    const comps = [
      makeCompetition({ id: 'small', fencer_count: 14 }), // 2 pools
      makeCompetition({ id: 'large', fencer_count: 70 }), // 10 pools
    ]
    // Two days separate the two events, so the busiest day is the large event
    // alone: ceil(10 / 0.80) = 13. Lower than the same set on one day (15
    // above), which is what proves `daysAvailable` reaches the rule rather
    // than being dropped by the alias.
    expect(recommendStripCount(comps, 2, 0.80)).toBe(13)
  })

  it('plan example: 54 pools at 0.80 → 68 strips', () => {
    // A single event with 378 fencers → ceil(378/7)=54 pools. One event cannot
    // be split across days, so this answer is the same at any day count — it
    // isolates the max_pool_strip_pct divisor: ceil(54 / 0.80) = 68.
    const comps = [makeCompetition({ fencer_count: 378 })]
    expect(recommendStripCount(comps, 3, 0.80)).toBe(68)
  })

  it('no longer throws on a competition too small to form a pool', () => {
    // Before T011 this name called `poolCountFor` on every competition
    // unconditionally (the old stripBudget.ts:40), so `fencer_count <= 1` threw
    // out of `computePoolStructure` (pools.ts:26) and took the whole
    // post-schedule diagnostic pass with it. The rule filters first, so the
    // unsizeable event contributes nothing and the rest is still sized:
    // 42 fencers → 6 pools, ceil(6 / 0.80) = 8.
    //
    // `analysis.test.ts` pins the same behavior on the rule. This pins it on
    // the call path that actually used to throw.
    const comps = [
      makeCompetition({ id: 'unsizeable', fencer_count: 1 }),
      makeCompetition({ id: 'sizeable', fencer_count: 42 }),
    ]
    expect(() => recommendStripCount(comps, 2, 0.80)).not.toThrow()
    expect(recommendStripCount(comps, 2, 0.80)).toBe(8)
  })
})

// ──────────────────────────────────────────────
// recommendRefCount
// ──────────────────────────────────────────────

describe('recommendRefCount', () => {
  it('returns zeros for an empty competition list', () => {
    expect(recommendRefCount([], 1, makeConfig())).toEqual({ three_weapon: 0, foil_epee: 0 })
  })

  it('sabre-heavy: all refs are three-weapon, foil/epee surplus is zero', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 's2', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
    ]
    // peakSabrePools=15, peakSabreDe=10, max=15; peakFoilEpee=0 → three_weapon=15, foil_epee=0
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 15, foil_epee: 0 })
  })

  it('foil/epee only: three_weapon=0, all go to foil_epee', () => {
    const comps = [
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'e1', weapon: Weapon.EPEE, fencer_count: 35 }), // 5 pools
    ]
    // peakFoilEpeePools=15, peakFoilEpeeDe=10, max=15; peakSabre=0 → three_weapon=0, foil_epee=15
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 0, foil_epee: 15 })
  })

  it('mixed weapons: foil/epee refs are the surplus beyond the sabre crew', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 's2', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 140 }), // 20 pools
      makeCompetition({ id: 'f2', weapon: Weapon.FOIL, fencer_count: 70 }),  // 10 pools
    ]
    // peakSabre: max(15 pools, 10 DE) = 15. peakFoilEpee: max(30 pools, 10 DE) = 30.
    // three_weapon=15, foil_epee = 30 − 15 = 15
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 15, foil_epee: 15 })
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
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 0, foil_epee: 90 })
  })

  it('scales with refsPerPool', () => {
    const comps = [
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 35 }), // 5 pools
    ]
    // peakSabre: max(5*2=10 pools, 5 DE) = 10 → three_weapon=10
    expect(recommendRefCount(comps, 2, makeConfig())).toEqual({ three_weapon: 10, foil_epee: 0 })
  })

  it('DE demand exceeds pool demand when DE strips are high and fencer count is low', () => {
    // 14 fencers = 2 pools → pool demand = 2
    // DE: R16 strips=8, activeStrips = min(8, max(8, strips_allocated=8)) = 8.
    // DE demand = DE_REFS(1) × 8 = 8 (one referee per strip, no pod captains).
    const comps = [
      makeCompetition({
        id: 'de-heavy',
        weapon: Weapon.FOIL,
        fencer_count: 14,
        de_round_of_16_strips: 8,
      }),
    ]
    // max(2 pools, 8 DE) = 8 → foil_epee=8
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 0, foil_epee: 8 })
  })

  it('staged DE video-stage contention drives demand above per-class peaks', () => {
    // 3 foil competitions with STAGED DEs, each with R16 strips=4
    // Pool demand: 14 fencers = 2 pools each. Top-2 = 4.
    // DE demand per comp: activeStrips=min(4, max(4,8))=4, demand=DE_REFS(1)×4=4. Top-2=8.
    // Per-class peak = max(4 pools, 8 DE) = 8
    // Video-stage sum: 3 * max(4,2) = 12 > 8 → bumps foil_epee to 12
    const comps = [
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 14, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
      makeCompetition({ id: 'f2', weapon: Weapon.FOIL, fencer_count: 14, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
      makeCompetition({ id: 'f3', weapon: Weapon.FOIL, fencer_count: 14, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
    ]
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 0, foil_epee: 12 })
  })

  it('mixed: one weapon class pool-dominant, another DE-dominant', () => {
    const comps = [
      // Sabre: 70 fencers = 10 pools (pool-dominant). DE demand = 4.
      makeCompetition({ id: 's1', weapon: Weapon.SABRE, fencer_count: 70 }),
      // Foil: 14 fencers = 2 pools but R16 strips=8 → DE demand=8 (DE-dominant)
      makeCompetition({ id: 'f1', weapon: Weapon.FOIL, fencer_count: 14, de_round_of_16_strips: 8 }),
    ]
    // peakSabre = max(10 pools, 4 DE) = 10
    // peakFoilEpee = max(2 pools, 8 DE) = 8
    // three_weapon=10, foil_epee = max(0, 8 - 10) = 0
    expect(recommendRefCount(comps, 1, makeConfig())).toEqual({ three_weapon: 10, foil_epee: 0 })
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
