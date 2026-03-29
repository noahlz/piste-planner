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
    pool_round_duration: 90,
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

  it('sabre competition with low sabre ref availability → higher score', () => {
    const sabreComp = makeCompetition({
      id: 'cadet-m-sabre',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
    })

    // Many sabre competitions competing for few sabre refs
    const manySabreComps: Competition[] = [
      makeCompetition({ id: 's1', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's2', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's3', category: Category.CADET, gender: Gender.WOMEN, weapon: Weapon.SABRE }),
      makeCompetition({ id: 's4', category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.SABRE }),
      sabreComp,
    ]

    // Low sabre ref config (1 sabre ref, high scarcity)
    const lowSabreConfig = makeConfig({
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 1, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, sabre_refs: 1, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, sabre_refs: 1, source: 'ACTUAL' },
      ],
    })

    // Same weapon, abundant refs
    const highSabreConfig = makeConfig({
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 20, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, sabre_refs: 20, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, sabre_refs: 20, source: 'ACTUAL' },
      ],
    })

    const lowScore = constraintScore(sabreComp, manySabreComps, lowSabreConfig)
    const highScore = constraintScore(sabreComp, manySabreComps, highSabreConfig)
    expect(lowScore).toBeGreaterThan(highScore)
  })

  it('STAGED_DE + REQUIRED video → higher score', () => {
    const stagedVideoComp = makeCompetition({
      id: 'staged-video',
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
    })

    const singleBlockComp = makeCompetition({
      id: 'single-block',
      de_mode: DeMode.SINGLE_BLOCK,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })

    // Many competitions requiring video — scarce resource
    const manyVideoComps: Competition[] = [
      makeCompetition({ id: 'v1', de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeCompetition({ id: 'v2', de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeCompetition({ id: 'v3', de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
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
    // The additive 2.0 from Pattern C is verified by comparing with a hypothetical
    // non-team pair: if we remove the ind+team relationship, only Pattern B (5.0) remains.
    const div1AComp = makeCompetition({
      id: 'div1a-m-foil',
      category: Category.DIV1A, // DIV1↔DIV1A is soft crossover < 1.0 (0.3)
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const sr2 = makeScheduleResult('div1a-m-foil', 0)
    sr2.pool_start = 480
    const state2 = makeGlobalState({ 'div1a-m-foil': { ...sr2 } })
    const allComps2 = [teamComp, div1AComp]

    // Only Pattern C applies (ind+team same demo? No — different category now)
    // DIV1 crossover DIV1A = 0.3 < 1.0 → Pattern B does NOT fire
    // But Pattern C requires same category → doesn't fire either → 0.0
    const penaltyNoPatternsB = earlyStartPenalty(teamComp, 1, 1320, state2, allComps2, configWithDayConfigs)
    // DIV1 crossover with DIV1A = 0.3 < 1.0, so neither Pattern B nor C → 0.0
    expect(penaltyNoPatternsB).toBe(0.0)
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
  it('all ROW weapons (foil+sabre) on day → 0.5 penalty', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })

    // Day already has foil and sabre (both ROW), no epee
    const foilSr = { ...makeScheduleResult('foil-other', 0) }
    const sabreSr = { ...makeScheduleResult('sabre-other', 0) }

    const state = makeGlobalState({
      'foil-other': foilSr,
      'sabre-other': sabreSr,
    })

    // Need allComps to look up weapon for each schedule entry
    const allComps: Competition[] = [
      makeCompetition({ id: 'foil-other', weapon: Weapon.FOIL, category: Category.JUNIOR, gender: Gender.MEN }),
      makeCompetition({ id: 'sabre-other', weapon: Weapon.SABRE, category: Category.CADET, gender: Gender.MEN }),
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
    const comp3 = makeCompetition({ id: 'cadet-m-sabre', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE, fencer_count: 30 })

    const config = makeConfig({ days_available: 2 })
    const state = makeGlobalState()
    const allComps = [comp1, comp2, comp3]
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6), pool_round_duration: 90 })

    // Schedule comp1 first — should get day 0 (no conflicts)
    const result = assignDay(comp1, poolStructure, state, config, allComps)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThan(config.days_available)

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
    const poolStructure = makePoolStructure({ n_pools: 3, pool_sizes: [7, 7, 6], pool_round_duration: 90 })

    // Levels 0, 1, 2 will score day 0 as Infinity (same population block)
    // Level 3 ignores Infinity blocks → day 0 becomes valid
    const result = assignDay(comp, poolStructure, state, config, allComps)
    expect(result).toBe(0)

    // CONSTRAINT_RELAXED bottleneck should be recorded (level 3 was used)
    const relaxedBottlenecks = state.bottlenecks.filter(b => b.cause === BottleneckCause.CONSTRAINT_RELAXED)
    expect(relaxedBottlenecks).toHaveLength(1)
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
    const poolStructure = makePoolStructure({ n_pools: 2, pool_sizes: [5, 5], pool_round_duration: 90 })

    // All strips occupied forever on the only day
    const state: GlobalState = {
      strip_free_at: [Infinity], // strip never free
      refs_in_use_by_day: {},
      schedule: {},
      bottlenecks: [],
    }

    expect(() => assignDay(comp, poolStructure, state, config, allComps)).toThrow(SchedulingError)
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
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBe(0.0)
  })

  it('last day, refs < avg, fencer_count > 100 → 0.5', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 150, weapon: Weapon.FOIL })
    // Last day has fewer refs than days 0 and 1
    const config = makeConfig({
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, sabre_refs: 3, source: 'ACTUAL' }, // last day — far below average
      ],
    })
    const state = makeGlobalState()

    const penalty = lastDayRefShortagePenalty(comp, 2, state, config)
    expect(penalty).toBeCloseTo(0.5)
  })

  it('last day, refs < avg, fencer_count > 50 (but ≤ 100) → 0.2', () => {
    const comp = makeCompetition({ id: 'div1-m-foil', fencer_count: 75, weapon: Weapon.FOIL })
    const config = makeConfig({
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, sabre_refs: 3, source: 'ACTUAL' },
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
        { day: 0, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 5, sabre_refs: 3, source: 'ACTUAL' },
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
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6), pool_round_duration: 90 })
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
    const poolStructure = makePoolStructure({ n_pools: 5, pool_sizes: Array(5).fill(6), pool_round_duration: 90 })
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
