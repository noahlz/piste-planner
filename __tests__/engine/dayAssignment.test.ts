import { describe, it, expect } from 'vitest'
import {
  constraintScore,
  findEarlierSlotSameDay,
} from '../../src/engine/dayAssignment.ts'
import {
  Category,
  Gender,
  Weapon,
  DeMode,
  VideoPolicy,
} from '../../src/engine/types.ts'
import type {
  GlobalState,
  PoolStructure,
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
    // Absolute lower bound: crossoverCount(4) + windowTightness(840/360≈2.33) + refWeight(1) ≈ 7.33
    // A refactor that scales scores to near-zero would fail this check.
    expect(score).toBeGreaterThan(5)
  })

  it('saber competition with low saber ref availability → higher score', () => {
    const saberComp = makeCompetition({
      id: 'cadet-m-saber',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
    })

    // Many saber competitions competing for few saber refs
    const manySabreComps = [
      makeCompetition({ id: 's1', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's2', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's3', category: Category.CADET, gender: Gender.WOMEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's4', category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.SABRE }),
      saberComp,
    ]

    // Low saber ref config (1 saber ref, high scarcity)
    const lowSabreConfig = makeConfig({
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 1, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 1, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, three_weapon_refs: 1, source: 'ACTUAL' },
      ],
    })

    // Same weapon, abundant refs
    const highSabreConfig = makeConfig({
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 20, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 20, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, three_weapon_refs: 20, source: 'ACTUAL' },
      ],
    })

    const lowScore = constraintScore(saberComp, manySabreComps, lowSabreConfig)
    const highScore = constraintScore(saberComp, manySabreComps, highSabreConfig)
    expect(lowScore).toBeGreaterThan(highScore)
    // Absolute lower bound: saberScarcity (5/1=5) + crossoverCount(4) + refWeight(1) + window ≈ 10
    // A refactor that scales scores to near-zero would fail this check.
    expect(lowScore).toBeGreaterThan(5)
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

    // All strips free from the start of day 0
    const state: GlobalState = {
      strip_free_at: Array(24).fill(480),
      refs_in_use_by_day: {},
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

    // All strips occupied beyond the end of day → no window possible
    const state: GlobalState = {
      strip_free_at: Array(24).fill(Infinity),
      refs_in_use_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    const result = findEarlierSlotSameDay(comp, poolStructure, 0, state, config)
    expect(result).toBeNull()
  })
})
