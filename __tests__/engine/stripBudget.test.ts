import { describe, it, expect, beforeEach } from 'vitest'
import {
  computeStripCap,
  flagFlightingCandidates,
  buildStrips,
  peakDeStripDemand,
} from '../../src/engine/stripBudget.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { DeMode } from '../../src/engine/types.ts'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { resolveVideoStrips } from '../../src/store/typeDefaults.ts'

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
// flagFlightingCandidates
// ──────────────────────────────────────────────

describe('flagFlightingCandidates', () => {
  /** A config whose global pool strip cap is `cap`: `cap` strips at 100%. */
  const capConfig = (cap: number) => makeConfig({ strips: makeStrips(cap, 0), max_pool_strip_pct: 1 })
  /** 10 strips at the factory's 0.80: a global cap of 8. */
  const tenStrips = makeConfig({ strips: makeStrips(10, 0) })

  it('returns empty array when all events fit within the cap', () => {
    const comps = [
      makeCompetition({ id: 'a', fencer_count: 21 }), // 3 pools
      makeCompetition({ id: 'b', fencer_count: 14 }), // 2 pools
    ]
    expect(flagFlightingCandidates(comps, capConfig(5))).toEqual([])
  })

  it('flags events whose pool count exceeds the cap', () => {
    const comps = [
      makeCompetition({ id: 'big', fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'small', fencer_count: 14 }), // 2 pools
    ]
    // cap=8: 10>8 → 'big' flagged; 2≤8 → 'small' not flagged
    expect(flagFlightingCandidates(comps, capConfig(8))).toEqual(['big'])
  })

  it('flags multiple events when several exceed the cap', () => {
    const comps = [
      makeCompetition({ id: 'a', fencer_count: 70 }), // 10 pools
      makeCompetition({ id: 'b', fencer_count: 56 }), // 8 pools
      makeCompetition({ id: 'c', fencer_count: 14 }), // 2 pools
    ]
    // cap=7: 10>7, 8>7 → both flagged
    expect(flagFlightingCandidates(comps, capConfig(7))).toEqual(['a', 'b'])
  })

  it('does not flag an event exactly at the cap', () => {
    const comps = [makeCompetition({ id: 'exact', fencer_count: 56 })] // 8 pools
    expect(flagFlightingCandidates(comps, capConfig(8))).toEqual([])
  })

  it('correctly computes n_pools=1 for small events (≤9 fencers), not ceil(9/7)=2', () => {
    // Without the poolCountFor fix, Math.ceil(9/7)=2 would incorrectly flag this
    // at a cap of 1, but the real pool count is 1 so it should not be flagged at cap=1.
    const comps = [makeCompetition({ id: 'tiny', fencer_count: 9 })]
    expect(flagFlightingCandidates(comps, capConfig(1))).toEqual([])
  })

  // The cap is per event (METHODOLOGY §Strip Budget): computeStripCap with the
  // event's own max_pool_strip_pct_override, the global percentage otherwise.

  it('flags an event whose own override lowers its cap below its pools, though the global cap would not', () => {
    // 8 pools: within the global cap of 8, over its own cap of floor(10 × 0.5) = 5.
    const comps = [makeCompetition({ id: 'small', fencer_count: 56, max_pool_strip_pct_override: 0.5 })]
    expect(flagFlightingCandidates(comps, tenStrips)).toEqual(['small'])
  })

  it('does not flag an event whose own override raises its cap to its pools, though the global cap would', () => {
    // Both are 10 pools, over the global cap of 8. 'raised' has its own cap of
    // floor(10 × 1.0) = 10, while 'global' keeps the global cap and is flagged.
    const comps = [
      makeCompetition({ id: 'raised', fencer_count: 70, max_pool_strip_pct_override: 1.0 }),
      makeCompetition({ id: 'global', fencer_count: 70 }),
    ]
    expect(flagFlightingCandidates(comps, tenStrips)).toEqual(['global'])
  })

  it("skips an event over the config's MAX_FENCERS, as analysis Pass 1 does", () => {
    // 70 fencers is sizeable at the engine's own bounds (336) but not under a
    // config maximum of 64, so it has no pool round to flight.
    const comps = [makeCompetition({ id: 'over', fencer_count: 70 })]
    expect(flagFlightingCandidates(comps, makeConfig({ strips: makeStrips(10, 0), MAX_FENCERS: 64 }))).toEqual([])
  })

  it("skips an event under the config's MIN_FENCERS, as analysis Pass 1 does", () => {
    // 5 fencers is sizeable at the engine's own minimum (2) and would be flagged
    // over a cap of 0, but not under a config minimum of 8.
    const comps = [makeCompetition({ id: 'under', fencer_count: 5 })]
    const config = makeConfig({ strips: makeStrips(10, 0), max_pool_strip_pct: 0, MIN_FENCERS: 8 })
    expect(flagFlightingCandidates(comps, config)).toEqual([])
  })
})

// ──────────────────────────────────────────────
// peakDeStripDemand
// ──────────────────────────────────────────────

// A staged DE's peak strip demand is its video ask, min(4, bracket/2)
// (METHODOLOGY.md §DE Modes), and a bracket of 2 asks none (§DE Duration
// 'No counted round'; 024 plan D5).
describe('peakDeStripDemand', () => {
  it('bracket 32 → min(4, 16) = 4', () => {
    expect(peakDeStripDemand(makeCompetition({ fencer_count: 24, de_mode: DeMode.STAGED }))).toBe(4)
  })

  it('a bracket of 2 has no counted round and demands no strips', () => {
    expect(peakDeStripDemand(makeCompetition({ fencer_count: 2, de_mode: DeMode.STAGED }))).toBe(0)
  })
})

// ──────────────────────────────────────────────
// buildStrips
// ──────────────────────────────────────────────

describe('buildStrips', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState())
  })

  it('returns `total` strips with ids strip-1..strip-N and the first videoCount video-capable', () => {
    const strips = buildStrips(5, 2)

    expect(strips).toHaveLength(5)
    expect(strips.map(s => s.id)).toEqual(['strip-1', 'strip-2', 'strip-3', 'strip-4', 'strip-5'])
    expect(strips.map(s => s.video_capable)).toEqual([true, true, false, false, false])
  })

  it('buildTournamentConfig(state) yields config.strips deep-equal to buildStrips(state.strips_total, resolved video count)', () => {
    const state = useStore.getState()
    state.setStrips(10)
    state.setVideoStrips(3)

    const { config } = buildTournamentConfig(useStore.getState())
    const resolvedVideo = resolveVideoStrips(useStore.getState().video_strips_total, useStore.getState().tournament_type)

    expect(config.strips).toEqual(buildStrips(useStore.getState().strips_total, resolvedVideo))
  })
})
