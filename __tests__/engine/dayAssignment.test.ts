import { describe, it, expect } from 'vitest'
import {
  constraintScore,
  findEarlierSlotSameDay,
  saberPileupPenalty,
} from '../../src/engine/dayAssignment.ts'
import {
  Category,
  Gender,
  Weapon,
  DeMode,
  VideoPolicy,
  Phase,
} from '../../src/engine/types.ts'
import type {
  GlobalState,
  PoolStructure,
  StripAllocation,
} from '../../src/engine/types.ts'
import {
  makeStrips,
  makeConfig,
  makeCompetition,
} from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Test helpers (dayAssignment-specific)
// ──────────────────────────────────────────────

function makePoolStructure(overrides: Partial<PoolStructure> = {}): PoolStructure {
  return {
    n_pools: 8,
    pool_sizes: Array(8).fill(7),
    ...overrides,
  }
}

// ──────────────────────────────────────────────
// constraintScore
// ──────────────────────────────────────────────

describe('constraintScore', () => {
  it('competition with many crossover conflicts → higher score', () => {
    const comp = makeCompetition({
      id: 'cadet-m-foil',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      // tight window: 480 → 840 = 360 minutes
      earliest_start: 480,
      latest_end: 840,
    })

    // These all cross with CADET MEN FOIL (same gender+weapon, related categories)
    const allComps = [
      makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL }),
      makeCompetition({ id: 'y14-m-foil', category: Category.Y14, gender: Gender.MEN, weapon: Weapon.FOIL }),
      makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL }),
      makeCompetition({ id: 'div2-m-foil', category: Category.DIV2, gender: Gender.MEN, weapon: Weapon.FOIL }),
      comp,
    ]

    const config = makeConfig()
    const score = constraintScore(comp, allComps, config)

    // Loose window competition for comparison (no extra constraints)
    const looseComp = makeCompetition({
      id: 'loose',
      category: Category.VETERAN,
      gender: Gender.WOMEN,
      weapon: Weapon.EPEE,
      earliest_start: 480,
      latest_end: 1320,
    })
    const looseScore = constraintScore(looseComp, allComps, config)

    expect(score).toBeGreaterThan(looseScore)
    // Absolute lower bound: crossoverCount(4) + windowTightness(840/360≈2.33) + videoScarcity(0) ≈ 6.33
    // A refactor that scales scores to near-zero would fail this check.
    expect(score).toBeGreaterThan(5)
  })

  it('STAGED_DE + REQUIRED video → higher score', () => {
    const stagedVideoComp = makeCompetition({
      id: 'staged-video',
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })

    const singleBlockComp = makeCompetition({
      id: 'single-block',
      de_mode: DeMode.SINGLE_STAGE,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })

    // Many competitions requiring video — scarce resource
    const manyVideoComps = [
      makeCompetition({ id: 'v1', de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeCompetition({ id: 'v2', de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeCompetition({ id: 'v3', de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      stagedVideoComp,
      singleBlockComp,
    ]

    // Few video strips so scarcity is high
    const fewVideoConfig = makeConfig({ strips: makeStrips(24, 2) })
    const manyVideoConfig = makeConfig({ strips: makeStrips(24, 20) })

    const stagedLowVideoScore = constraintScore(stagedVideoComp, manyVideoComps, fewVideoConfig)
    const singleBlockScore = constraintScore(singleBlockComp, manyVideoComps, fewVideoConfig)

    // STAGED_DE + REQUIRED with scarce video strips should score higher
    expect(stagedLowVideoScore).toBeGreaterThan(singleBlockScore)

    // With many video strips, the video scarcity component disappears
    const stagedHighVideoScore = constraintScore(stagedVideoComp, manyVideoComps, manyVideoConfig)
    expect(stagedLowVideoScore).toBeGreaterThan(stagedHighVideoScore)
  })
})

// ──────────────────────────────────────────────
// saberPileupPenalty
// ──────────────────────────────────────────────

describe('saberPileupPenalty', () => {
  const sabre = makeCompetition({ id: 's1', weapon: Weapon.SABRE })
  const foil = makeCompetition({ id: 'f1', weapon: Weapon.FOIL })
  const otherSabres = [
    makeCompetition({ id: 's2', weapon: Weapon.SABRE }),
    makeCompetition({ id: 's3', weapon: Weapon.SABRE }),
    makeCompetition({ id: 's4', weapon: Weapon.SABRE }),
    makeCompetition({ id: 's5', weapon: Weapon.SABRE }),
    makeCompetition({ id: 's6', weapon: Weapon.SABRE }),
  ]

  it('non-saber event → penalty is 0 regardless of day contents', () => {
    const assignments = new Map([['s2', 0], ['s3', 0], ['s4', 0]] as [string, number][])
    expect(saberPileupPenalty(foil, 0, assignments, [foil, ...otherSabres])).toBe(0)
  })

  it('saber on day with 0 other saber → 0', () => {
    expect(saberPileupPenalty(sabre, 0, new Map(), [sabre, ...otherSabres])).toBe(0)
  })

  it('saber on day with 1 other saber → 0.5', () => {
    const assignments = new Map([['s2', 0]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(0.5)
  })

  it('saber on day with 2 other saber → 2.0', () => {
    const assignments = new Map([['s2', 0], ['s3', 0]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(2.0)
  })

  it('saber on day with 3 other saber → 10.0', () => {
    const assignments = new Map([['s2', 0], ['s3', 0], ['s4', 0]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(10.0)
  })

  it('saber on day with 5 other saber → 50.0 (clamped)', () => {
    const assignments = new Map([['s2', 0], ['s3', 0], ['s4', 0], ['s5', 0], ['s6', 0]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(50.0)
  })

  it('saber on different day from other saber events → 0', () => {
    const assignments = new Map([['s2', 1], ['s3', 1]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(0)
  })

  it('excludes self from count', () => {
    // Self is in assignments on the same day — still excluded from count
    const assignments = new Map([['s1', 0], ['s2', 0]] as [string, number][])
    expect(saberPileupPenalty(sabre, 0, assignments, [sabre, ...otherSabres])).toBe(0.5)
  })
})

// ──────────────────────────────────────────────
// findEarlierSlotSameDay
// ──────────────────────────────────────────────

describe('findEarlierSlotSameDay', () => {
  it('resources available at day start → returns day start time', () => {
    const comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      strips_allocated: 4,
      fencer_count: 30,
    })
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6) })
    const config = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
        { day_start_time: 2160, day_end_time: 3000 },
      ],
    })

    // All strips free from the start of day 0 — empty allocation lists mean
    // nextFreeTime returns 0, which is <= dayStart(0)=480.
    const state: GlobalState = {
      strip_allocations: Array.from({ length: 24 }, () => []),
      ref_demand_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    const result = findEarlierSlotSameDay(comp, poolStructure, 0, state, config)
    expect(result).toBe(480)
  })

  it('no resources available (all strips occupied forever) → returns null', () => {
    const comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      strips_allocated: 4,
      fencer_count: 30,
    })
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6) })
    const config = makeConfig({
      days_available: 1,
      strips: makeStrips(24, 4),
    })

    // All strips occupied beyond the end of day → no window possible. Use a
    // very large end_time (1e9) so nextFreeTime returns past any candidate.
    const busyAlloc = (): StripAllocation => ({
      event_id: 'busy',
      phase: Phase.POOLS,
      start_time: 0,
      end_time: 1e9,
    })
    const state: GlobalState = {
      strip_allocations: Array.from({ length: 24 }, () => [busyAlloc()]),
      ref_demand_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    const result = findEarlierSlotSameDay(comp, poolStructure, 0, state, config)
    expect(result).toBeNull()
  })
})
