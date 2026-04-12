import { describe, it, expect } from 'vitest'
import {
  constraintScore,
  totalDayPenalty,
  earlyStartPenalty,
  weaponBalancePenalty,
  restDayPenalty,
  assignDay,
  SchedulingError,
  crossWeaponSameDemographicPenalty,
  lastDayRefShortagePenalty,
  findEarlierSlotSameDay,
} from '../../src/engine/dayAssignment.ts'
import {
  Category,
  Gender,
  Weapon,
  EventType,
  DeMode,
  VideoPolicy,
  BottleneckCause,
  BottleneckSeverity,
} from '../../src/engine/types.ts'
import type {
  Competition,
  GlobalState,
  PoolStructure,
} from '../../src/engine/types.ts'
import {
  makeStrips,
  makeConfig,
  makeCompetition,
  makeScheduleResult,
  DAY_START_8AM,
} from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Test helpers (dayAssignment-specific)
// ──────────────────────────────────────────────

function makeGlobalState(scheduleEntries: Record<string, ReturnType<typeof makeScheduleResult>> = {}): GlobalState {
  return {
    strip_free_at: Array(24).fill(DAY_START_8AM),
    refs_in_use_by_day: {},
    schedule: scheduleEntries,
    bottlenecks: [],
  }
}

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
    const allComps: Competition[] = [
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
  })

  it('saber competition with low saber ref availability → higher score', () => {
    const saberComp = makeCompetition({
      id: 'cadet-m-saber',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
    })

    // Many saber competitions competing for few saber refs
    const manySabreComps: Competition[] = [
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
    const manyVideoComps: Competition[] = [
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
// totalDayPenalty
// ──────────────────────────────────────────────

describe('totalDayPenalty', () => {
  const config = makeConfig()

  it('same population same weapon on day → INFINITY (level 0)', () => {
    // DIV1 MEN FOIL same category/gender/weapon as scheduled comp → INFINITY crossover
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const alreadyScheduled = makeCompetition({ id: 'div1-m-foil-2', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const scheduleResult = makeScheduleResult('div1-m-foil-2', 0)
    scheduleResult.pool_start = 480

    const state = makeGlobalState({ 'div1-m-foil-2': { ...scheduleResult } })
    const allComps = [comp, alreadyScheduled]

    const penalty = totalDayPenalty(comp, 0, 480, state, 0, allComps, config)
    expect(penalty).toBe(Infinity)
  })

  it('Group 1 mandatory pair same weapon on day → INFINITY (level 0)', () => {
    // JUNIOR↔CADET same weapon → Group 1 mandatory → Infinity crossover
    const comp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadet = makeCompetition({ id: 'cadet-m-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })
    const scheduleResult = makeScheduleResult('cadet-m-foil', 0)
    scheduleResult.pool_start = 480

    const state = makeGlobalState({ 'cadet-m-foil': { ...scheduleResult } })
    const allComps = [comp, cadet]

    const penalty = totalDayPenalty(comp, 0, 480, state, 0, allComps, config)
    expect(penalty).toBe(Infinity)
  })

  it('cross-gender pair on day → 0.0 crossover penalty', () => {
    // MEN FOIL vs WOMEN EPEE → different gender → 0.0 crossover; different weapon so no weapon balance issue
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const womenComp = makeCompetition({ id: 'div1-w-epee', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.EPEE })
    const scheduleResult = makeScheduleResult('div1-w-epee', 0)
    scheduleResult.pool_start = 480

    const state = makeGlobalState({ 'div1-w-epee': { ...scheduleResult } })
    const allComps = [comp, womenComp]

    // Cross-gender → 0 crossover penalty; times differ by >30 min → no same-time penalty
    // Mix of FOIL + EPEE on day → weapon balance 0.0; different weapon so no cross-weapon demo penalty
    const penalty = totalDayPenalty(comp, 0, 600, state, 0, allComps, config)
    expect(penalty).toBe(0.0)
  })

  it('high crossover same time (within 30 min) → adds 10.0', () => {
    // CADET↔JUNIOR same gender+weapon (crossover=1.0 ≥ 1.0) within 30 min → 10.0 same-time penalty
    const comp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadetSep = makeCompetition({ id: 'cadet-m-foil-sep', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })

    // At level 3, INFINITY blocks are ignored so we can test same-time penalty
    const scheduleResult = makeScheduleResult('cadet-m-foil-sep', 0)
    scheduleResult.pool_start = 490 // within 30 min of 480

    const state = makeGlobalState({ 'cadet-m-foil-sep': { ...scheduleResult } })
    const allComps = [comp, cadetSep]

    const penalty = totalDayPenalty(comp, 0, 480, state, 3, allComps, config)
    // At level 3, Infinity is ignored; but same-time penalty (xpen >= 1.0 → 10.0) still applies
    expect(penalty).toBeGreaterThanOrEqual(10.0)
  })

  it('penalises scheduling team event before its individual counterpart on same day', () => {
    // TEAM event scheduled before INDIVIDUAL counterpart on same day → 8.0 penalty
    const teamComp = makeCompetition({
      id: 'div1-m-foil-team',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })
    const indComp = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })

    const allComps = [teamComp, indComp]

    // individual at 500, team at 480 → gap = ind_start - team_start = 20 ≤ 30 → 8.0
    const scheduleResult = makeScheduleResult('div1-m-foil-ind', 0)
    scheduleResult.pool_start = 500

    const state = makeGlobalState({ 'div1-m-foil-ind': { ...scheduleResult } })

    const penalty = totalDayPenalty(teamComp, 0, 480, state, 0, allComps, config)
    // team_start=480, ind_start=500 → gap = ind_start - team_start = 20 ≤ 30 → 8.0
    expect(penalty).toBeGreaterThanOrEqual(8.0)
  })

  it('Y10 not in first slot → adds 0.3', () => {
    const y10Comp = makeCompetition({
      id: 'y10-m-foil',
      category: Category.Y10,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })

    // Use explicit dayConfigs so dayStart(0) = 480 (8AM) — matching real tournament expectations
    const configWithDays = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
      ],
    })
    const state = makeGlobalState()
    const allComps = [y10Comp]

    // Day 0 starts at 480. First slot is 480. SLOT_MINS = 30.
    // estimated_start = 480 + 31 (past first slot boundary at 480 + 30 = 510)
    const penaltyNotFirst = totalDayPenalty(y10Comp, 0, 511, state, 0, allComps, configWithDays)
    const penaltyFirst = totalDayPenalty(y10Comp, 0, 480, state, 0, allComps, configWithDays)

    expect(penaltyNotFirst).toBeGreaterThan(penaltyFirst)
    expect(penaltyNotFirst - penaltyFirst).toBeCloseTo(0.3)
  })

  it('Y8 not in first slot → adds 0.3', () => {
    const y8Comp = makeCompetition({
      id: 'y8-m-foil',
      category: Category.Y8,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })

    const configWithDays = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
      ],
    })
    const state = makeGlobalState()
    const allComps = [y8Comp]

    // Day 0 starts at 480. SLOT_MINS = 30. Not-first-slot is > 480+30 = 510.
    const penaltyNotFirst = totalDayPenalty(y8Comp, 0, 511, state, 0, allComps, configWithDays)
    const penaltyFirst = totalDayPenalty(y8Comp, 0, 480, state, 0, allComps, configWithDays)

    expect(penaltyNotFirst).toBeGreaterThan(penaltyFirst)
    expect(penaltyNotFirst - penaltyFirst).toBeCloseTo(0.3)
  })

  it('DIV1↔CADET same weapon+gender on same day → adds 5.0 soft separation penalty (level 0)', () => {
    const div1Comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    const cadetComp = makeCompetition({
      id: 'cadet-m-foil',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })

    const sr = makeScheduleResult('cadet-m-foil', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'cadet-m-foil': { ...sr } })
    const allComps = [div1Comp, cadetComp]

    const penalty = totalDayPenalty(div1Comp, 0, 600, state, 0, allComps, config)
    expect(penalty).toBeGreaterThanOrEqual(5.0)
  })

  it('DIV1↔CADET soft separation NOT applied at level >= 2', () => {
    const div1Comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    const cadetComp = makeCompetition({
      id: 'cadet-m-foil',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })

    const sr = makeScheduleResult('cadet-m-foil', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'cadet-m-foil': { ...sr } })
    const allComps = [div1Comp, cadetComp]

    // At level 2, soft separation and crossover penalties are waived
    const penaltyL2 = totalDayPenalty(div1Comp, 0, 600, state, 2, allComps, config)
    const penaltyL0 = totalDayPenalty(div1Comp, 0, 600, state, 0, allComps, config)

    // Level 0 must be strictly higher (includes the 5.0 separation penalty)
    expect(penaltyL0).toBeGreaterThan(penaltyL2)
    // Level 2 should NOT include the 5.0 soft separation contribution
    expect(penaltyL2).toBeLessThan(5.0)
  })

  it('DIV1↔CADET different gender → no soft separation penalty', () => {
    const div1Comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    // CADET WOMEN — different gender, should NOT trigger separation penalty
    const cadetWomenComp = makeCompetition({
      id: 'cadet-w-foil',
      category: Category.CADET,
      gender: Gender.WOMEN,
      weapon: Weapon.FOIL,
    })

    const sr = makeScheduleResult('cadet-w-foil', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'cadet-w-foil': { ...sr } })
    const allComps = [div1Comp, cadetWomenComp]

    const penalty = totalDayPenalty(div1Comp, 0, 600, state, 0, allComps, config)
    // Different gender → no separation penalty; crossover is 0 (different gender)
    // weaponBalance: both foil → rowCount=2 at this point, but since no epee, penalty = 0.5
    // Just verify that the 5.0 separation did NOT fire (penalty < 5.0)
    expect(penalty).toBeLessThan(5.0)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: DIV1 ind + JUNIOR team same weapon+gender on same day → Infinity (level 0)', () => {
    // DIV1 individual and JUNIOR team share fencer pool → hard block (INDIV_TEAM_RELAXABLE_BLOCKS entry)
    const div1IndComp = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const juniorTeamComp = makeCompetition({
      id: 'junior-m-foil-team',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })

    const sr = makeScheduleResult('junior-m-foil-team', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'junior-m-foil-team': { ...sr } })
    const allComps = [div1IndComp, juniorTeamComp]

    const penalty = totalDayPenalty(div1IndComp, 0, 600, state, 0, allComps, config)
    expect(penalty).toBe(Infinity)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: reverse direction — JUNIOR ind + DIV1 team same weapon+gender → Infinity (level 0)', () => {
    // JUNIOR individual and DIV1 team — reversed entry from INDIV_TEAM_RELAXABLE_BLOCKS
    const juniorIndComp = makeCompetition({
      id: 'junior-m-foil-ind',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const div1TeamComp = makeCompetition({
      id: 'div1-m-foil-team',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })

    const sr = makeScheduleResult('div1-m-foil-team', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'div1-m-foil-team': { ...sr } })
    const allComps = [juniorIndComp, div1TeamComp]

    const penalty = totalDayPenalty(juniorIndComp, 0, 600, state, 0, allComps, config)
    expect(penalty).toBe(Infinity)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: overridable at level 3 — DIV1 ind + JUNIOR team → NOT Infinity', () => {
    const div1IndComp = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const juniorTeamComp = makeCompetition({
      id: 'junior-m-foil-team',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })

    const sr = makeScheduleResult('junior-m-foil-team', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'junior-m-foil-team': { ...sr } })
    const allComps = [div1IndComp, juniorTeamComp]

    const penaltyL3 = totalDayPenalty(div1IndComp, 0, 600, state, 3, allComps, config)
    expect(penaltyL3).not.toBe(Infinity)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: different weapon does NOT trigger block', () => {
    // DIV1 individual FOIL vs JUNIOR team EPEE — different weapon → no hard block
    const div1IndFoil = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const juniorTeamEpee = makeCompetition({
      id: 'junior-m-epee-team',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
    })

    const sr = makeScheduleResult('junior-m-epee-team', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'junior-m-epee-team': { ...sr } })
    const allComps = [div1IndFoil, juniorTeamEpee]

    const penalty = totalDayPenalty(div1IndFoil, 0, 600, state, 0, allComps, config)
    expect(penalty).not.toBe(Infinity)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: different gender does NOT trigger block', () => {
    // DIV1 individual MEN vs JUNIOR team WOMEN — different gender → no hard block
    const div1IndMen = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const juniorTeamWomen = makeCompetition({
      id: 'junior-w-foil-team',
      category: Category.JUNIOR,
      gender: Gender.WOMEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })

    const sr = makeScheduleResult('junior-w-foil-team', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'junior-w-foil-team': { ...sr } })
    const allComps = [div1IndMen, juniorTeamWomen]

    const penalty = totalDayPenalty(div1IndMen, 0, 600, state, 0, allComps, config)
    expect(penalty).not.toBe(Infinity)
  })
})

// ──────────────────────────────────────────────
// earlyStartPenalty
// ──────────────────────────────────────────────

describe('earlyStartPenalty', () => {
  it('Pattern A: two high-crossover comps both at 8AM same day → 2.0', () => {
    // CADET↔JUNIOR same gender+weapon → crossover ≥ 1.0 (Group 1)
    const comp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadetComp = makeCompetition({ id: 'cadet-m-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })

    // Use dayConfigs so dayStart(0, config) = 480 (8AM), matching pool_start=480
    const configWithDays = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
      ],
    })

    // cadet already scheduled at 8AM (480) on day 0
    const sr = makeScheduleResult('cadet-m-foil', 0)
    sr.pool_start = 480

    const state = makeGlobalState({ 'cadet-m-foil': { ...sr } })

    // junior also proposed at 8AM (480) same day 0 → Pattern A
    // Day start = 480, estimated_start = 480. Threshold = 10 min → early if (480 - 480) = 0 <= 10
    const penalty = earlyStartPenalty(comp, 0, 480, state, [comp, cadetComp], configWithDays)
    expect(penalty).toBeCloseTo(2.0)
  })

  it('Pattern B: two high-crossover comps both at 8AM consecutive days → 5.0', () => {
    // CADET on day 0 at 8AM, JUNIOR proposed on day 1 at 8AM → consecutive days
    const comp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadetComp = makeCompetition({ id: 'cadet-m-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })

    // Use explicit dayConfigs so dayStart(0) = 480 (8AM), dayStart(1) = 1320
    const configWithDayConfigs = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
        { day_start_time: 2160, day_end_time: 3000 },
      ],
    })

    const sr = makeScheduleResult('cadet-m-foil', 0)
    sr.pool_start = 480 // day 0 start = 480 (8AM)

    const state = makeGlobalState({ 'cadet-m-foil': { ...sr } })
    const allComps = [comp, cadetComp]

    // junior at day 1, start 1320 (8AM of day 1) → Pattern B
    const penalty = earlyStartPenalty(comp, 1, 1320, state, allComps, configWithDayConfigs)
    expect(penalty).toBeCloseTo(5.0)
  })

  it('Pattern C: ind+team both 8AM consecutive days → 2.0 (in addition to Pattern B 5.0)', () => {
    // DIV1 INDIVIDUAL on day 0 at 8AM, DIV1 TEAM proposed on day 1 at 8AM
    // Pattern B applies (crossover=Infinity ≥ 1.0) → +5.0
    // Pattern C also applies (consecutive 8AM ind+team pair) → +2.0
    // Combined: 5.0 + 2.0 = 7.0
    const teamComp = makeCompetition({
      id: 'div1-m-foil-team',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })
    const indComp = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })

    const configWithDayConfigs = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
        { day_start_time: 2160, day_end_time: 3000 },
      ],
    })

    const sr = makeScheduleResult('div1-m-foil-ind', 0)
    sr.pool_start = 480 // individual at 8AM day 0

    const state = makeGlobalState({ 'div1-m-foil-ind': { ...sr } })
    const allComps = [teamComp, indComp]

    // team proposed at 8AM day 1 (1320) → Pattern B (5.0) + Pattern C (2.0) = 7.0
    const penalty = earlyStartPenalty(teamComp, 1, 1320, state, allComps, configWithDayConfigs)
    expect(penalty).toBeCloseTo(7.0)

    // Isolated Pattern C: use a pair that is ind+team same demographic but different enough
    // that crossoverPenalty < 1.0 (no Pattern B). Since same cat/gender/weapon always gives
    // Infinity, we verify by checking the increment above a non-ind/team pair.
    // Pattern B fires when xpen >= 1.0; Pattern C fires independently.
    // The additive 2.0 from Pattern C is verified by comparing with a pair where
    // DIV1↔Y10 has zero crossover, so neither Pattern B nor C fires, giving 0.0.
    const y10Comp = makeCompetition({
      id: 'y10-m-foil',
      category: Category.Y10, // DIV1↔Y10 has zero crossover (no graph path)
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const sr2 = makeScheduleResult('y10-m-foil', 0)
    sr2.pool_start = 480
    const state2 = makeGlobalState({ 'y10-m-foil': { ...sr2 } })
    const allComps2 = [teamComp, y10Comp]

    // DIV1↔Y10 crossover = 0.0 → Pattern B does NOT fire
    // Pattern C requires same category → doesn't fire either → 0.0
    const penaltyNoPatternsB = earlyStartPenalty(teamComp, 1, 1320, state2, allComps2, configWithDayConfigs)
    expect(penaltyNoPatternsB).toBe(0.0)
  })

  it('Pattern C: cross-weapon ind+team pair → 0.0 (different weapon must NOT trigger Pattern C)', () => {
    // DIV1 INDIVIDUAL FOIL on day 0 at 8AM; DIV1 TEAM EPEE proposed on day 1 at 8AM.
    // Pattern C requires same weapon — cross-weapon pair should NOT fire.
    // Pattern B requires crossover >= HIGH_CROSSOVER_THRESHOLD; DIV1 IND FOIL vs DIV1 TEAM EPEE
    // have different weapon → crossoverPenalty = 0.0 → Pattern B also does not fire.
    const teamComp = makeCompetition({
      id: 'div1-m-epee-team',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
    })
    const indComp = makeCompetition({
      id: 'div1-m-foil-ind',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })

    const configWithDayConfigs = makeConfig({
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1320, day_end_time: 2160 },
        { day_start_time: 2160, day_end_time: 3000 },
      ],
    })

    const sr = makeScheduleResult('div1-m-foil-ind', 0)
    sr.pool_start = 480 // individual at 8AM day 0
    const state = makeGlobalState({ 'div1-m-foil-ind': { ...sr } })
    const allComps = [teamComp, indComp]

    // Team (EPEE) proposed at 8AM day 1. Different weapon → no Pattern B, no Pattern C.
    const penalty = earlyStartPenalty(teamComp, 1, 1320, state, allComps, configWithDayConfigs)
    expect(penalty).toBe(0.0)
  })

  it('not early → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const state = makeGlobalState()
    const config = makeConfig()

    // Day 0 start = 0, estimated_start = 100 → (100 - 0) = 100 > EARLY_START_THRESHOLD(10) → not early
    const penalty = earlyStartPenalty(comp, 0, 100, state, [comp], config)
    expect(penalty).toBe(0.0)
  })
})

// ──────────────────────────────────────────────
// weaponBalancePenalty
// ──────────────────────────────────────────────

describe('weaponBalancePenalty', () => {
  it('all ROW weapons (foil+saber) on day → 0.5 penalty', () => {
    // fencer_count: 200 gives 0.5 * 200 / 200 = 0.5 (proportional to competition size)
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 200 })

    // Day already has foil and saber (both ROW), no epee
    const foilSr = { ...makeScheduleResult('foil-other', 0) }
    const saberSr = { ...makeScheduleResult('saber-other', 0) }

    const state = makeGlobalState({
      'foil-other': foilSr,
      'saber-other': saberSr,
    })

    // Need allComps to look up weapon for each schedule entry
    const allComps: Competition[] = [
      makeCompetition({ id: 'foil-other', weapon: Weapon.FOIL, category: Category.JUNIOR, gender: Gender.MEN }),
      makeCompetition({ id: 'saber-other', weapon: Weapon.SABRE, category: Category.CADET, gender: Gender.MEN }),
      comp,
    ]

    const penalty = weaponBalancePenalty(comp, 0, state, allComps)
    expect(penalty).toBeCloseTo(0.5)
  })

  it('mix of ROW and epee on day → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })

    const foilSr = { ...makeScheduleResult('foil-other', 0) }
    const epeeSr = { ...makeScheduleResult('epee-other', 0) }

    const state = makeGlobalState({
      'foil-other': foilSr,
      'epee-other': epeeSr,
    })

    const allComps: Competition[] = [
      makeCompetition({ id: 'foil-other', weapon: Weapon.FOIL, category: Category.JUNIOR, gender: Gender.MEN }),
      makeCompetition({ id: 'epee-other', weapon: Weapon.EPEE, category: Category.CADET, gender: Gender.MEN }),
      comp,
    ]

    const penalty = weaponBalancePenalty(comp, 0, state, allComps)
    expect(penalty).toBe(0.0)
  })
})

// ──────────────────────────────────────────────
// restDayPenalty
// ──────────────────────────────────────────────

describe('restDayPenalty', () => {
  it('JUNIOR↔CADET same weapon consecutive days → 1.5', () => {
    const juniorComp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadetComp = makeCompetition({ id: 'cadet-m-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })

    // CADET already scheduled on day 0
    const cadetSr = makeScheduleResult('cadet-m-foil', 0)
    const state = makeGlobalState({ 'cadet-m-foil': { ...cadetSr } })
    const allComps: Competition[] = [juniorComp, cadetComp]

    // JUNIOR proposed on day 1 → gap = 1 → 1.5 penalty
    const penalty = restDayPenalty(juniorComp, 1, state, allComps)
    expect(penalty).toBeCloseTo(1.5)
  })

  it('JUNIOR↔CADET same weapon, gap ≥ 2 → 0.0', () => {
    const juniorComp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const cadetComp = makeCompetition({ id: 'cadet-m-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL })

    // CADET already scheduled on day 0
    const cadetSr = makeScheduleResult('cadet-m-foil', 0)
    const state = makeGlobalState({ 'cadet-m-foil': { ...cadetSr } })
    const allComps: Competition[] = [juniorComp, cadetComp]

    // JUNIOR proposed on day 2 → gap = 2 → 0.0
    const penalty = restDayPenalty(juniorComp, 2, state, allComps)
    expect(penalty).toBe(0.0)
  })

  it('REST_DAY_PAIRS: JUNIOR↔DIV1 same weapon consecutive days → 1.5', () => {
    const juniorComp = makeCompetition({ id: 'junior-m-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
    const div1Comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })

    const div1Sr = makeScheduleResult('div1-m-foil', 0)
    const state = makeGlobalState({ 'div1-m-foil': { ...div1Sr } })
    const allComps: Competition[] = [juniorComp, div1Comp]

    const penalty = restDayPenalty(juniorComp, 1, state, allComps)
    expect(penalty).toBeCloseTo(1.5)
  })
})

// ──────────────────────────────────────────────
// assignDay
// ──────────────────────────────────────────────

describe('assignDay', () => {
  it('simple 3-comp, 2-day config → optimal day assignment without relaxation', () => {
    // Three unrelated competitions (different genders/weapons) → no conflicts
    const comp1 = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 30 })
    const comp2 = makeCompetition({ id: 'div1-w-epee', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 30 })
    const comp3 = makeCompetition({ id: 'cadet-m-saber', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE, fencer_count: 30 })

    const config = makeConfig({ days_available: 2 })
    const state = makeGlobalState()
    const allComps = [comp1, comp2, comp3]
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6) })

    // Schedule comp1 first — should get day 0 (no conflicts)
    const { day, level } = assignDay(comp1, poolStructure, state, config, allComps)
    expect(day).toBeGreaterThanOrEqual(0)
    expect(day).toBeLessThan(config.days_available)
    expect(level).toBe(0)

    // No bottlenecks added for CONSTRAINT_RELAXED (optimal assignment)
    const relaxedBottlenecks = state.bottlenecks.filter(b => b.cause === BottleneckCause.CONSTRAINT_RELAXED)
    expect(relaxedBottlenecks).toHaveLength(0)
  })

  it('all days blocked by Infinity crossover at levels 0-2 → relaxes to level 3, produces CONSTRAINT_RELAXED bottleneck', () => {
    // Scenario: the only available day has a same-population conflict (Infinity crossover),
    // which is only overridden at level 3.
    const config = makeConfig({ days_available: 1 })

    const comp = makeCompetition({
      id: 'div1-m-foil',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 20,
      strips_allocated: 2,
    })

    // Same population already scheduled on day 0 → crossoverPenalty = Infinity
    const conflictComp = makeCompetition({
      id: 'div1-m-foil-2',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 20,
    })

    const conflictSr = makeScheduleResult('div1-m-foil-2', 0)
    conflictSr.pool_start = 0 // day 0 start (dayStart(0, config) = 0 with no dayConfigs)

    const state: GlobalState = {
      strip_free_at: Array(24).fill(0), // all strips free
      refs_in_use_by_day: {},
      schedule: { 'div1-m-foil-2': { ...conflictSr } },
      bottlenecks: [],
    }

    const allComps = [comp, conflictComp]
    const poolStructure = makePoolStructure({ n_pools: 3, pool_sizes: [7, 7, 6] })

    // Levels 0, 1, 2 will score day 0 as Infinity (same population block)
    // Level 3 ignores Infinity blocks → day 0 becomes valid
    const { day, level } = assignDay(comp, poolStructure, state, config, allComps)
    expect(day).toBe(0)
    expect(level).toBe(3) // level 3 was used because same-population blocked levels 0-2

    // CONSTRAINT_RELAXED bottlenecks: 3 INFO (failed levels 0-2) + 1 WARN (successful level 3)
    const relaxedBottlenecks = state.bottlenecks.filter(b => b.cause === BottleneckCause.CONSTRAINT_RELAXED)
    expect(relaxedBottlenecks).toHaveLength(4)
    expect(relaxedBottlenecks.filter(b => b.severity === BottleneckSeverity.INFO)).toHaveLength(3)
    expect(relaxedBottlenecks.filter(b => b.severity === BottleneckSeverity.WARN)).toHaveLength(1)
  })

  it('all days impossible → throws SchedulingError', () => {
    const config = makeConfig({
      days_available: 1,
      strips: makeStrips(1, 0), // only 1 strip
    })

    const comp = makeCompetition({
      id: 'test-comp',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 10,
      strips_allocated: 4, // needs 4 strips but only 1 exists
    })

    const allComps = [comp]
    const poolStructure = makePoolStructure({ n_pools: 2, pool_sizes: [5, 5] })

    // All strips occupied forever on the only day
    const state: GlobalState = {
      strip_free_at: [Infinity], // strip never free
      refs_in_use_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    expect(() => assignDay(comp, poolStructure, state, config, allComps)).toThrow(SchedulingError)

    try {
      assignDay(comp, poolStructure, state, config, allComps)
    } catch (caught) {
      expect((caught as SchedulingError).cause).toBe(BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE)
    }
  })

  it('all levels fail → error message includes relaxation trail with each level', () => {
    const config = makeConfig({
      days_available: 1,
      strips: makeStrips(1, 0),
    })

    const comp = makeCompetition({
      id: 'trail-comp',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 10,
      strips_allocated: 4,
    })

    const state: GlobalState = {
      strip_free_at: [Infinity],
      refs_in_use_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    const allComps = [comp]
    const poolStructure = makePoolStructure({ n_pools: 2, pool_sizes: [5, 5] })

    try {
      assignDay(comp, poolStructure, state, config, allComps)
      expect.unreachable('should have thrown')
    } catch (caught) {
      expect(caught).toBeInstanceOf(SchedulingError)
      const msg = (caught as SchedulingError).message
      expect(msg).toContain('trail-comp')
      // Trail should mention each level and its valid-day count
      expect(msg).toContain('Level 0')
      expect(msg).toContain('Level 1')
      expect(msg).toContain('Level 2')
      expect(msg).toContain('Level 3')
      expect(msg).toContain('0 valid')
    }
  })

  it('partial relaxation → INFO bottlenecks for failed levels, WARN for successful level', () => {
    const config = makeConfig({ days_available: 1 })

    const comp = makeCompetition({
      id: 'partial-relax',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 20,
      strips_allocated: 2,
    })

    // Same population on day 0 → Infinity crossover at levels 0-1
    // Level 2 drops soft crossover but keeps Infinity blocks → still blocked
    // Level 3 drops Infinity blocks → succeeds
    const conflictComp = makeCompetition({
      id: 'partial-relax-conflict',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 20,
    })

    const conflictSr = makeScheduleResult('partial-relax-conflict', 0)
    conflictSr.pool_start = 0

    const state: GlobalState = {
      strip_free_at: Array(24).fill(0),
      refs_in_use_by_day: {},
      schedule: { 'partial-relax-conflict': { ...conflictSr } },
      bottlenecks: [],
    }

    const allComps = [comp, conflictComp]
    const poolStructure = makePoolStructure({ n_pools: 3, pool_sizes: [7, 7, 6] })

    const { day, level } = assignDay(comp, poolStructure, state, config, allComps)
    expect(day).toBe(0)
    expect(level).toBe(3)

    // INFO bottlenecks for each failed intermediate level
    const infoBottlenecks = state.bottlenecks.filter(
      b => b.cause === BottleneckCause.CONSTRAINT_RELAXED && b.severity === BottleneckSeverity.INFO,
    )
    expect(infoBottlenecks).toHaveLength(3)

    // WARN bottleneck for the successful relaxed level
    const warnBottlenecks = state.bottlenecks.filter(
      b => b.cause === BottleneckCause.CONSTRAINT_RELAXED && b.severity === BottleneckSeverity.WARN,
    )
    expect(warnBottlenecks).toHaveLength(1)
    expect(warnBottlenecks[0].message).toContain('relaxation to level 3')
    expect(warnBottlenecks[0].message).toContain('Level 0')
  })
})

// ──────────────────────────────────────────────
// crossWeaponSameDemographicPenalty
// ──────────────────────────────────────────────

describe('crossWeaponSameDemographicPenalty', () => {
  it('same gender+category, different weapon on same day → 0.2 per competing comp', () => {
    const comp = makeCompetition({ id: 'vet-m-foil', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL })
    const otherWeapon = makeCompetition({ id: 'vet-m-epee', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.EPEE })

    const sr = makeScheduleResult('vet-m-epee', 0)
    const state = makeGlobalState({ 'vet-m-epee': { ...sr } })
    const allComps = [comp, otherWeapon]

    const penalty = crossWeaponSameDemographicPenalty(comp, 0, state, allComps)
    expect(penalty).toBeCloseTo(0.2)
  })

  it('same gender+category, different weapon, two competing comps on same day → 0.4', () => {
    const comp = makeCompetition({ id: 'vet-m-foil', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL })
    const epee1 = makeCompetition({ id: 'vet-m-epee-1', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.EPEE })
    const epee2 = makeCompetition({ id: 'vet-m-epee-2', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.EPEE })

    const state = makeGlobalState({
      'vet-m-epee-1': { ...makeScheduleResult('vet-m-epee-1', 0) },
      'vet-m-epee-2': { ...makeScheduleResult('vet-m-epee-2', 0) },
    })
    const allComps = [comp, epee1, epee2]

    const penalty = crossWeaponSameDemographicPenalty(comp, 0, state, allComps)
    expect(penalty).toBeCloseTo(0.4)
  })

  it('different gender → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const womenEpee = makeCompetition({ id: 'div1-w-epee', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.EPEE })

    const sr = makeScheduleResult('div1-w-epee', 0)
    const state = makeGlobalState({ 'div1-w-epee': { ...sr } })
    const allComps = [comp, womenEpee]

    const penalty = crossWeaponSameDemographicPenalty(comp, 0, state, allComps)
    expect(penalty).toBe(0.0)
  })

  it('same weapon on same day → 0.0 (same-weapon overlap is handled by crossover, not this function)', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const sameWeapon = makeCompetition({ id: 'div1-m-foil-2', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })

    const sr = makeScheduleResult('div1-m-foil-2', 0)
    const state = makeGlobalState({ 'div1-m-foil-2': { ...sr } })
    const allComps = [comp, sameWeapon]

    const penalty = crossWeaponSameDemographicPenalty(comp, 0, state, allComps)
    expect(penalty).toBe(0.0)
  })

  it('non-VETERAN category, different weapon on same day → 0.0 (penalty is VETERAN-only)', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const otherWeapon = makeCompetition({ id: 'div1-m-epee', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.EPEE })

    const sr = makeScheduleResult('div1-m-epee', 0)
    const state = makeGlobalState({ 'div1-m-epee': { ...sr } })
    const allComps = [comp, otherWeapon]

    const penalty = crossWeaponSameDemographicPenalty(comp, 0, state, allComps)
    expect(penalty).toBe(0.0)
  })
})

// ──────────────────────────────────────────────
// lastDayRefShortagePenalty
// ──────────────────────────────────────────────

describe('lastDayRefShortagePenalty', () => {
  it('not last day → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 150 })
    const config = makeConfig({ days_available: 3 })
    const state = makeGlobalState()

    // day 1 is not the last day (last day = 2)
    const penalty = lastDayRefShortagePenalty(comp, 1, state, config)
    expect(penalty).toBe(0.0)
  })

  it('last day, refs >= avg → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 150, weapon: Weapon.FOIL })
    // All days have equal refs → last day = avg
    const config = makeConfig({
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBe(0.0)
  })

  it('last day, refs < avg, fencer_count > 300 (NAC) → 0.5', () => {
    // NAC threshold: >300 fencers → 0.5 (makeConfig defaults to NAC)
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 350, weapon: Weapon.FOIL })
    // Last day has fewer refs than days 0 and 1
    const config = makeConfig({
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, three_weapon_refs: 3, source: 'ACTUAL' }, // last day — far below average
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBeCloseTo(0.5)
  })

  it('last day, refs < avg, fencer_count > 50 (medium event) → 0.2', () => {
    // Medium-tier events (RYC, SYC, etc.): >50 fencers → 0.2
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 75, weapon: Weapon.FOIL })
    const config = makeConfig({
      tournament_type: 'RYC',
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, three_weapon_refs: 3, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBeCloseTo(0.2)
  })

  it('last day, refs < avg, fencer_count <= 50 → 0.0', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 40, weapon: Weapon.FOIL })
    const config = makeConfig({
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, three_weapon_refs: 3, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBe(0.0)
  })

  it('last day, refs < avg, ROC fencer_count > 100 → 0.3', () => {
    // ROC threshold: >100 fencers → 0.3
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 150, weapon: Weapon.FOIL })
    const config = makeConfig({
      tournament_type: 'ROC',
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, three_weapon_refs: 3, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBeCloseTo(0.3)
  })

  it('last day, refs < avg, ROC fencer_count <= 100 → 0.0', () => {
    // ROC threshold: exactly 100 does NOT exceed 100, so no penalty
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 100, weapon: Weapon.FOIL })
    const config = makeConfig({
      tournament_type: 'ROC',
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, three_weapon_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, three_weapon_refs: 3, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBe(0.0)
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

// ──────────────────────────────────────────────
// capacity penalty in totalDayPenalty
// ──────────────────────────────────────────────

describe('capacity penalty in totalDayPenalty', () => {
  // Config with 24 strips × 14-hour day = 336 strip-hours total capacity
  const config = makeConfig({
    strips: makeStrips(24, 6),
    days_available: 3,
  })

  // A small isolated competition (VET, low crossover risk) used as a probe
  // to measure the capacity penalty contribution in isolation.
  const candidateVet = makeCompetition({
    id: 'vet-m-foil',
    category: Category.VETERAN,
    gender: Gender.MEN,
    weapon: Weapon.FOIL,
    fencer_count: 40,
    strips_allocated: 4,
    de_mode: DeMode.SINGLE_STAGE,
  })

  it('day at 80% fill gets higher penalty than day at 20% fill', () => {
    // Fill day 0 with several large competitions (roughly 80% consumed)
    // Each makeCompetition defaults: fencer_count 24, strips_allocated 8, SINGLE_STAGE
    // 8 strips × ~3h DE ≈ 24 strip-hours each; 10 such comps ≈ 240/336 ≈ 71%
    // Use 12 to push closer to 80%.
    const heavySchedule: Record<string, ReturnType<typeof makeScheduleResult>> = {}
    const heavyComps: Competition[] = [candidateVet]

    for (let i = 0; i < 12; i++) {
      const id = `heavy-${i}`
      heavySchedule[id] = makeScheduleResult(id, 0)
      heavyComps.push(makeCompetition({ id, fencer_count: 30, strips_allocated: 8 }))
    }

    // Light day 1 — only 2 competitions scheduled
    const lightSchedule: Record<string, ReturnType<typeof makeScheduleResult>> = {}
    const lightComps: Competition[] = [candidateVet]

    for (let i = 0; i < 2; i++) {
      const id = `light-${i}`
      lightSchedule[id] = makeScheduleResult(id, 1)
      lightComps.push(makeCompetition({ id, fencer_count: 30, strips_allocated: 8 }))
    }

    const heavyState = makeGlobalState(heavySchedule)
    const lightState = makeGlobalState(lightSchedule)

    const estimatedStart = config.DAY_START_MINS

    const penaltyHeavy = totalDayPenalty(candidateVet, 0, estimatedStart, heavyState, 0, heavyComps, config)
    const penaltyLight = totalDayPenalty(candidateVet, 1, estimatedStart, lightState, 0, lightComps, config)

    expect(penaltyHeavy).toBeGreaterThan(penaltyLight)
  })

  it('day with 3 STAGED events already assigned → video-strip penalty applied', () => {
    // 6 video strips in config; each STAGED event needs de_round_of_16_strips + de_finals_strips
    // Default: de_round_of_16_strips=4, de_finals_strips=2 → 6 each
    // 3 events already on day: peak R16 demand = 3×4 = 12 > 6 → video penalty
    const existingIds = ['staged-1', 'staged-2', 'staged-3']
    const scheduleEntries: Record<string, ReturnType<typeof makeScheduleResult>> = {}
    const allComps: Competition[] = []

    for (const id of existingIds) {
      scheduleEntries[id] = makeScheduleResult(id, 0)
      allComps.push(makeCompetition({
        id,
        de_mode: DeMode.STAGED,
        de_round_of_16_strips: 4,
        de_finals_strips: 2,
        fencer_count: 64,
        strips_allocated: 16,
      }))
    }

    const candidateStaged = makeCompetition({
      id: 'staged-candidate',
      de_mode: DeMode.STAGED,
      de_round_of_16_strips: 4,
      de_finals_strips: 2,
      fencer_count: 64,
      strips_allocated: 16,
    })
    allComps.push(candidateStaged)

    const state = makeGlobalState(scheduleEntries)
    const estimatedStart = config.DAY_START_MINS

    // Baseline: same candidate on an empty day (no video penalty)
    const penaltyEmptyDay = totalDayPenalty(candidateStaged, 1, estimatedStart, makeGlobalState({}), 0, allComps, config)

    // Day 0 already has 3 staged events — video-strip peak demand exceeds capacity
    const penaltyCrowded = totalDayPenalty(candidateStaged, 0, estimatedStart, state, 0, allComps, config)

    expect(penaltyCrowded).toBeGreaterThan(penaltyEmptyDay)
  })

  it('large DIV1 event produces bigger capacity footprint than small VET event', () => {
    // Two empty days, two candidate events of different sizes.
    // The DIV1 event (weight 1.5, 310 fencers) should incur higher penalty on the same day
    // than the VET event (weight 0.6, 40 fencers) after both days are pre-loaded identically.
    const preloadedSchedule: Record<string, ReturnType<typeof makeScheduleResult>> = {}
    const baseComps: Competition[] = []

    // Pre-fill day 0 and day 1 identically at ~50% capacity so the candidate's
    // own footprint is what tips the penalty curve.
    for (let i = 0; i < 6; i++) {
      const id = `base-${i}`
      const day = i < 3 ? 0 : 1
      preloadedSchedule[id] = makeScheduleResult(id, day)
      baseComps.push(makeCompetition({ id, fencer_count: 30, strips_allocated: 8 }))
    }

    const div1Candidate = makeCompetition({
      id: 'div1-candidate',
      category: Category.DIV1,
      gender: Gender.WOMEN,
      weapon: Weapon.EPEE,
      fencer_count: 310,
      strips_allocated: 20,
      de_mode: DeMode.SINGLE_STAGE,
    })

    const vetCandidate = makeCompetition({
      id: 'vet-candidate',
      category: Category.VETERAN,
      gender: Gender.WOMEN,
      weapon: Weapon.EPEE,
      fencer_count: 40,
      strips_allocated: 4,
      de_mode: DeMode.SINGLE_STAGE,
    })

    const div1Comps = [...baseComps, div1Candidate]
    const vetComps = [...baseComps, vetCandidate]
    const state = makeGlobalState(preloadedSchedule)
    const estimatedStart = config.DAY_START_MINS

    const penaltyDiv1 = totalDayPenalty(div1Candidate, 0, estimatedStart, state, 0, div1Comps, config)
    const penaltyVet = totalDayPenalty(vetCandidate, 0, estimatedStart, state, 0, vetComps, config)

    expect(penaltyDiv1).toBeGreaterThan(penaltyVet)
  })

  it('day near full: adding large event pushes capacity past steep threshold → high penalty', () => {
    // Fill day 0 to ~90% with existing competitions, then add a large candidate.
    // 336 total strip-hours; 90% = ~302 strip-hours
    // makeCompetition defaults: 24 fencers, 8 strips_allocated, SINGLE_STAGE
    // Estimated DE hours per comp: 8 strips × ~3h = 24 strip-hours
    // Pool strip-hours: n_pools × poolDuration/60 ≈ 4 × 1.5 = 6 strip-hours
    // Total ≈ 30 strip-hours per comp; 10 comps ≈ 300 strip-hours ≈ 89%

    const nearFullSchedule: Record<string, ReturnType<typeof makeScheduleResult>> = {}
    const nearFullComps: Competition[] = []

    for (let i = 0; i < 10; i++) {
      const id = `filler-${i}`
      nearFullSchedule[id] = makeScheduleResult(id, 0)
      nearFullComps.push(makeCompetition({ id, fencer_count: 24, strips_allocated: 8 }))
    }

    const bigCandidate = makeCompetition({
      id: 'big-candidate',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      fencer_count: 150,
      strips_allocated: 16,
      de_mode: DeMode.SINGLE_STAGE,
    })
    nearFullComps.push(bigCandidate)

    const state = makeGlobalState(nearFullSchedule)
    const estimatedStart = config.DAY_START_MINS

    // Compare to an empty day
    const penaltyEmpty = totalDayPenalty(bigCandidate, 1, estimatedStart, makeGlobalState({}), 0, nearFullComps, config)
    const penaltyNearFull = totalDayPenalty(bigCandidate, 0, estimatedStart, state, 0, nearFullComps, config)

    // Near-full day should incur substantially more penalty (steep ramp at >80%)
    expect(penaltyNearFull).toBeGreaterThan(penaltyEmpty + 3.0)
  })
})
