import { describe, it, expect } from 'vitest'
import {
  estimateCompetitionStripHours,
  aggregateStripHours,
  dayConsumedCapacity,
  dayRemainingCapacity,
  categoryWeight,
  weightedStripHours,
} from '../../src/engine/capacity.ts'
import type { Competition, GlobalState, TournamentConfig } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType, VideoPolicy, VetAgeGroup, Weapon,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeScheduleResult, makeStrips } from '../helpers/factories.ts'
import { validateFeasibility } from '../../src/engine/validation.ts'
import { computePoolStructure, weightedPoolDuration } from '../../src/engine/pools.ts'

/** The pool term of `estimateCompetitionStripHours`, so a test can read the DE term alone. */
function poolStripHours(comp: Competition, config: TournamentConfig): number {
  const structure = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
  return structure.n_pools * weightedPoolDuration(structure, comp.weapon, config.pool_round_duration_table) / 60
}

// ──────────────────────────────────────────────
// DE strip-hours = DE bouts × bout time (METHODOLOGY.md §DE Capacity Estimation)
// ──────────────────────────────────────────────

/** A Div 1 foil bout takes 20 minutes (METHODOLOGY.md §DE Duration). */
const FOIL_BOUT = 20

/** A Div 1 foil event with the cut off, so the bracket follows the fencer count alone. */
function divOneFoil(overrides: Partial<Competition>): Competition {
  return makeCompetition({
    category: Category.DIV1,
    weapon: Weapon.FOIL,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    ...overrides,
  })
}

describe('estimateCompetitionStripHours — DE bills bouts × bout time', () => {
  it('bills the worked example single-stage: foil, 248 promoted, 246 bouts × 20 min = 82 strip-hours', () => {
    const config = makeConfig()
    // R256 120 + R128 64 + R64 32 + R32 16 + R16 8 + QF 4 + SF 2 = 246 bouts.
    // strips_allocated is deliberately unlike the 16-strip ask: each bout bills
    // one strip for one bout time, whatever the grant.
    const comp = divOneFoil({
      id: 'worked-example',
      fencer_count: 248,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 36,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.total_strip_hours - poolStripHours(comp, config)).toBeCloseTo(82, 10)
    expect(result.video_strip_hours).toBe(0)
  })

  it('bills a team DE at the team match time: 32 épée teams, 30 matches × 60 min = 30 strip-hours', () => {
    const config = makeConfig()
    // R32 16 + R16 8 + QF 4 + SF 2 = 30 matches; the gold match is not billed.
    const comp = makeCompetition({
      id: 'team-32-match-time',
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
      fencer_count: 32,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.total_strip_hours - poolStripHours(comp, config)).toBeCloseTo(30, 10)
  })

  it('bills the worked example staged from the round of 16: 232 prelims bouts general, 14 video bouts video only', () => {
    const config = makeConfig()
    // Div 1 stages at the round of 16. Prelims R256–R32: 120 + 64 + 32 + 16 =
    // 232 bouts × 20 = 77.3 general strip-hours. Video R16–SF: 8 + 4 + 2 = 14
    // bouts × 20 = 4.7 video strip-hours, none of it billed to general.
    const comp = divOneFoil({
      id: 'worked-example-staged',
      fencer_count: 248,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.total_strip_hours - poolStripHours(comp, config)).toBeCloseTo(232 * FOIL_BOUT / 60, 10)
    expect(result.video_strip_hours).toBeCloseTo(14 * FOIL_BOUT / 60, 10)
  })

  it('bills no general DE hours for a staged bracket at or below its video-stage round', () => {
    const config = makeConfig()
    // 12 Div 1 fencers → bracket of 16, the round-of-16 video stage: every
    // round runs on video. R16 4 + QF 4 + SF 2 = 10 bouts × 20 = 3.33 video h.
    const comp = divOneFoil({
      id: 'staged-at-video-round',
      fencer_count: 12,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.total_strip_hours - poolStripHours(comp, config)).toBe(0)
    expect(result.video_strip_hours).toBeCloseTo(10 * FOIL_BOUT / 60, 10)
  })

  it('bills every team match to general and none to video', () => {
    const config = makeConfig()
    // §Team Events: R32 16 + R16 8 + QF 4 + SF 2 = 30 matches × 60 = 30 general h.
    // Built as the app builds a team (024 D4): SINGLE_STAGE, BEST_EFFORT.
    const comp = makeCompetition({
      id: 'team-single-stage',
      category: Category.DIV1,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
      fencer_count: 32,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.total_strip_hours - poolStripHours(comp, config)).toBeCloseTo(30, 10)
    expect(result.video_strip_hours).toBe(0)
  })
})

function makeGlobalState(
  scheduleEntries: Record<string, ReturnType<typeof makeScheduleResult>> = {},
  strips_total: number = 24,
): GlobalState {
  return {
    strip_allocations: Array.from({ length: strips_total }, () => []),
    ref_demand_by_day: {},
    schedule: scheduleEntries,
    bottlenecks: [],
  }
}

// ──────────────────────────────────────────────
// estimateCompetitionStripHours
// ──────────────────────────────────────────────

describe('estimateCompetitionStripHours', () => {
  it('SINGLE_STAGE individual event → pools + DE bouts × bout time', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'single-stage-flat',
      fencer_count: 64,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 10,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // 64 EPEE fencers, cut disabled: n_pools=10 (4 pools of 7, 6 pools of 6)
    // poolDurationForSize(EPEE,7)=120; poolDurationForSize(EPEE,6)=round(120*15/21)=86
    // weightedPoolDuration = round((4*120 + 6*86)/10) = round(99.6) = 100
    // pool_strip_hours = 10 * 100 / 60 ≈ 16.667
    // bracket 64: R64 32 + R32 16 + R16 8 + QF 4 + SF 2 = 62 bouts × 20 min / 60 ≈ 20.667
    const expectedPoolStripHours = 10 * 100 / 60
    const deStripHours = result.total_strip_hours - expectedPoolStripHours
    expect(deStripHours).toBeCloseTo(62 * 20 / 60, 10)
    expect(result.video_strip_hours).toBe(0) // SINGLE_STAGE, no video strip hours
  })

  it('SINGLE_STAGE DE strip-hours do not depend on strips_allocated', () => {
    // §DE Capacity Estimation: each bout bills one strip for one bout time,
    // whatever strip count the scheduler grants. Same event at 10 and 5 strips.
    const config = makeConfig()
    const at = (strips_allocated: number) => estimateCompetitionStripHours(makeCompetition({
      id: 'single-stage-flat-strips',
      fencer_count: 64,
      weapon: Weapon.EPEE,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated,
    }), config)

    expect(at(5)).toEqual(at(10))
  })

  it('SINGLE_STAGE DE strip-hours change with bracket size (the cut removes bouts)', () => {
    // Same fencer_count/weapon/strips_allocated as the baseline test, but a 50%
    // cut promotes 32 fencers instead of 64, dropping the bracket from 64 to 32
    // and its bouts from 62 to 30.
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'single-stage-flat-cut',
      fencer_count: 64,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 50,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 10,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // Pool strip-hours unchanged (pool structure is computed pre-cut, from raw fencer_count).
    // promoted = round(64 × (1 - 50/100)) = 32; bracketSize = nextPowerOf2(32) = 32
    // R32 16 + R16 8 + QF 4 + SF 2 = 30 bouts × 20 min / 60 = 10.0
    const expectedPoolStripHours = 10 * 100 / 60
    const deStripHours = result.total_strip_hours - expectedPoolStripHours
    expect(deStripHours).toBeCloseTo(10, 10)
  })

  it('team event with 30 fencers → much smaller strip-hour footprint than large individual', () => {
    const config = makeConfig()
    const teamComp = makeCompetition({
      id: 'team-30',
      fencer_count: 30,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 4,
    })
    const largeComp = makeCompetition({
      id: 'large-200',
      fencer_count: 200,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const teamResult = estimateCompetitionStripHours(teamComp, config)
    const largeResult = estimateCompetitionStripHours(largeComp, config)

    expect(teamResult.total_strip_hours).toBeLessThan(largeResult.total_strip_hours)
  })

  it('STAGED with REQUIRED video policy → non-zero video_strip_hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'staged-video',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // 100 Div 1 FOIL fencers: n_pools=15, 10 pools of 7, 5 pools of 6
    // poolDurationForSize(FOIL,7)=120, poolDurationForSize(FOIL,6)=round(120*15/21)=86
    // weightedPoolDuration = round((10*120 + 5*86)/15) = round(108.67) = 109
    // pool_strip_hours = 15 * 109 / 60 = 27.25
    // bracket 128, Div 1 stages at the round of 16:
    //   prelims R128 36 (100 − 64) + R64 32 + R32 16 = 84 bouts × 20 / 60 = 28 general h
    //   video R16 8 + QF 4 + SF 2 = 14 bouts × 20 / 60 ≈ 4.667 video h, billed to video only
    // total = 27.25 + 28 = 55.25
    const expectedPoolStripHours = 15 * 109 / 60
    const expectedPrelimsStripHours = 84 * 20 / 60
    const expectedVideoStripHours = 14 * 20 / 60
    expect(result.video_strip_hours).toBeCloseTo(expectedVideoStripHours, 10)
    expect(result.total_strip_hours).toBeCloseTo(expectedPoolStripHours + expectedPrelimsStripHours, 10)
  })

  it('SINGLE_STAGE competition → zero video_strip_hours regardless of video policy', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'single-block',
      fencer_count: 64,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const result = estimateCompetitionStripHours(comp, config)

    expect(result.video_strip_hours).toBe(0)
  })

  it('team event — 33 teams, EPEE → DE strip-hours = 31 (play-in round)', () => {
    // bracket 64: R64 1 play-in (33 − 32), then R32 16 + R16 8 + QF 4 + SF 2
    // (finals excluded) = 31 matches × 60 min (team match) / 60 = 31
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'team-33',
      fencer_count: 33,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // Pool for 33 EPEE: n_pools=5, 3 pools of 7 (120 min each), 2 pools of 6 (86 min each)
    // weightedPoolDur = round((3×120 + 2×86)/5) = round(106.4) = 106; pool_sh = 5×106/60 ≈ 8.833
    const expectedPoolStripHours = 5 * 106 / 60
    const deStripHours = result.total_strip_hours - expectedPoolStripHours
    expect(deStripHours).toBeCloseTo(31, 10)
  })

})

// ──────────────────────────────────────────────
// dayConsumedCapacity
// ──────────────────────────────────────────────

describe('dayConsumedCapacity', () => {
  it('empty day (no competitions assigned) → zero consumed capacity', () => {
    const config = makeConfig()
    const state = makeGlobalState()
    const allCompetitions: ReturnType<typeof makeCompetition>[] = []

    const result = dayConsumedCapacity(0, state, allCompetitions, config)

    expect(result.strip_hours_consumed).toBe(0)
    expect(result.video_strip_hours_consumed).toBe(0)
  })

  it('one large competition on a day → consumed capacity matches estimateCompetitionStripHours', () => {
    const config = makeConfig({ strips: Array.from({ length: 80 }, (_, i) => ({ id: `strip-${i+1}`, video_capable: i < 4 })) })
    const comp = makeCompetition({
      id: 'large-comp',
      fencer_count: 200,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 40,
    })
    const scheduleEntry = makeScheduleResult('large-comp', 0)
    const state = makeGlobalState({ 'large-comp': scheduleEntry })

    const result = dayConsumedCapacity(0, state, [comp], config)
    const estimate = estimateCompetitionStripHours(comp, config)

    expect(result.strip_hours_consumed).toBeCloseTo(estimate.total_strip_hours, 5)
    expect(result.video_strip_hours_consumed).toBe(0) // SINGLE_STAGE
  })

  it('sums strip-hours for multiple competitions assigned to the same day', () => {
    const config = makeConfig()
    const comp1 = makeCompetition({ id: 'comp-1', fencer_count: 30, weapon: Weapon.FOIL, strips_allocated: 4 })
    const comp2 = makeCompetition({ id: 'comp-2', fencer_count: 30, weapon: Weapon.EPEE, strips_allocated: 4 })

    const state = makeGlobalState({
      'comp-1': makeScheduleResult('comp-1', 0),
      'comp-2': makeScheduleResult('comp-2', 0),
    })

    const result = dayConsumedCapacity(0, state, [comp1, comp2], config)

    // comp1: 30 FOIL → 5 pools of 6; poolDur(FOIL,6)=round(120*15/21)=86; pool_sh=5*86/60≈7.167
    //   DE strip-hours computed via estimateCompetitionStripHours
    // comp2: 30 EPEE → 5 pools of 6; poolDur(EPEE,6)=86; pool_sh=5*86/60≈7.167
    //   DE strip-hours computed via estimateCompetitionStripHours
    const comp1StripHours = estimateCompetitionStripHours(comp1, config).total_strip_hours
    const comp2StripHours = estimateCompetitionStripHours(comp2, config).total_strip_hours
    expect(result.strip_hours_consumed).toBeCloseTo(comp1StripHours + comp2StripHours, 5)
  })

  it('only counts competitions assigned to the queried day, not other days', () => {
    const config = makeConfig()
    const comp1 = makeCompetition({ id: 'comp-day0', fencer_count: 30, strips_allocated: 4 })
    const comp2 = makeCompetition({ id: 'comp-day1', fencer_count: 30, strips_allocated: 4 })

    const state = makeGlobalState({
      'comp-day0': makeScheduleResult('comp-day0', 0),
      'comp-day1': makeScheduleResult('comp-day1', 1),
    })

    const day0Result = dayConsumedCapacity(0, state, [comp1, comp2], config)
    const emptyDayResult = dayConsumedCapacity(2, state, [comp1, comp2], config)

    // 30 FOIL (default weapon) → 5 pools of 6; poolDur(FOIL,6)=86; pool_sh=5*86/60≈7.167
    // DE strip-hours computed via estimateCompetitionStripHours
    const expectedSingleCompStripHours = estimateCompetitionStripHours(comp1, config).total_strip_hours
    expect(day0Result.strip_hours_consumed).toBeCloseTo(expectedSingleCompStripHours, 5)
    expect(emptyDayResult.strip_hours_consumed).toBe(0)
  })

  it('video strip-hours consumed is non-zero for STAGED + REQUIRED competitions', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'video-comp',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const state = makeGlobalState({ 'video-comp': makeScheduleResult('video-comp', 0) })

    const result = dayConsumedCapacity(0, state, [comp], config)

    // Same competition as in the estimateCompetitionStripHours STAGED test:
    // video R16 8 + QF 4 + SF 2 = 14 bouts × 20 / 60 ≈ 4.667 video strip-hours.
    const expectedVideoStripHours = 14 * 20 / 60
    expect(result.video_strip_hours_consumed).toBeCloseTo(expectedVideoStripHours, 10)
  })
})

// ──────────────────────────────────────────────
// dayRemainingCapacity
// ──────────────────────────────────────────────

describe('dayRemainingCapacity', () => {
  it('empty day → remaining capacity = full capacity (strips_total × DAY_LENGTH_MINS / 60)', () => {
    const config = makeConfig()
    // makeConfig defaults: 24 strips, 4 video, DAY_LENGTH_MINS=840
    const state = makeGlobalState()

    const result = dayRemainingCapacity(0, state, [], config)

    const expectedTotal = config.strips_total * config.DAY_LENGTH_MINS / 60
    const expectedVideo = config.video_strips_total * config.DAY_LENGTH_MINS / 60

    expect(result.strip_hours_remaining).toBeCloseTo(expectedTotal, 5)
    expect(result.video_strip_hours_remaining).toBeCloseTo(expectedVideo, 5)
  })

  it('80 strips × 14 hours = 1120 strip-hours total capacity on empty day', () => {
    const config = makeConfig({
      strips: Array.from({ length: 80 }, (_, i) => ({ id: `strip-${i+1}`, video_capable: i < 4 })),
    })
    const state = makeGlobalState({}, 80)

    const result = dayRemainingCapacity(0, state, [], config)

    // 80 strips × 840 mins / 60 = 80 × 14 = 1120 strip-hours
    expect(result.strip_hours_remaining).toBeCloseTo(1120, 5)
  })

  it('remaining capacity decreases after scheduling competitions', () => {
    const config = makeConfig()
    const comp = makeCompetition({ id: 'comp-1', fencer_count: 50, strips_allocated: 8 })

    const emptyState = makeGlobalState()
    const filledState = makeGlobalState({ 'comp-1': makeScheduleResult('comp-1', 0) })

    const emptyResult = dayRemainingCapacity(0, emptyState, [], config)
    const filledResult = dayRemainingCapacity(0, filledState, [comp], config)

    // 50 FOIL: n_pools=8; 2 pools of 7, 6 pools of 6
    // poolDur(FOIL,7)=120; poolDur(FOIL,6)=round(120*15/21)=86
    // weightedPoolDur = round((2*120+6*86)/8) = round(756/8) = round(94.5) = 95
    // pool_sh = 8 * 95 / 60 ≈ 12.667
    // DE strip-hours computed via estimateCompetitionStripHours
    const expectedCompStripHours = estimateCompetitionStripHours(comp, config).total_strip_hours
    expect(emptyResult.strip_hours_remaining - filledResult.strip_hours_remaining).toBeCloseTo(expectedCompStripHours, 5)
  })

  it('video remaining capacity tracks separately from general capacity', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'video-comp',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const emptyState = makeGlobalState()
    const filledState = makeGlobalState({ 'video-comp': makeScheduleResult('video-comp', 0) })

    const emptyResult = dayRemainingCapacity(0, emptyState, [], config)
    const filledResult = dayRemainingCapacity(0, filledState, [comp], config)

    expect(filledResult.video_strip_hours_remaining).toBeLessThan(emptyResult.video_strip_hours_remaining)
    // General strip-hours also decrease (video comp uses general strips too)
    expect(filledResult.strip_hours_remaining).toBeLessThan(emptyResult.strip_hours_remaining)
  })
})

// ──────────────────────────────────────────────
// categoryWeight
// ──────────────────────────────────────────────

describe('categoryWeight', () => {
  it('Y10 competition returns weight 1.2', () => {
    const comp = makeCompetition({ category: Category.Y10, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.2)
  })

  it('DIV1 competition returns weight 1.5', () => {
    const comp = makeCompetition({ category: Category.DIV1, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.5)
  })

  it('JUNIOR competition returns weight 1.3', () => {
    const comp = makeCompetition({ category: Category.JUNIOR, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.3)
  })

  it('CADET competition returns weight 1.3', () => {
    const comp = makeCompetition({ category: Category.CADET, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.3)
  })

  it('Y12 competition returns weight 1.0', () => {
    const comp = makeCompetition({ category: Category.Y12, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.0)
  })

  it('Y14 competition returns weight 1.0', () => {
    const comp = makeCompetition({ category: Category.Y14, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.0)
  })

  it('Y8 competition returns weight 1.0', () => {
    const comp = makeCompetition({ category: Category.Y8, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(1.0)
  })

  it('VETERAN VET40 competition returns weight 0.8', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET40 })
    expect(categoryWeight(comp)).toBe(0.8)
  })

  it('VETERAN VET50 competition returns weight 0.8', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET50 })
    expect(categoryWeight(comp)).toBe(0.8)
  })

  it('VETERAN VET_COMBINED competition returns weight 0.6', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET_COMBINED })
    expect(categoryWeight(comp)).toBe(0.6)
  })

  it('VETERAN VET60 competition returns weight 0.6', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET60 })
    expect(categoryWeight(comp)).toBe(0.6)
  })

  it('VETERAN VET70 competition returns weight 0.6', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET70 })
    expect(categoryWeight(comp)).toBe(0.6)
  })

  it('VETERAN VET80 competition returns weight 0.6', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: VetAgeGroup.VET80 })
    expect(categoryWeight(comp)).toBe(0.6)
  })

  it('VETERAN with null vet_age_group defaults to weight 0.8', () => {
    const comp = makeCompetition({ category: Category.VETERAN, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(0.8)
  })

  it('DIV1A competition returns weight 0.7', () => {
    const comp = makeCompetition({ category: Category.DIV1A, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(0.7)
  })

  it('DIV2 competition returns weight 0.7', () => {
    const comp = makeCompetition({ category: Category.DIV2, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(0.7)
  })

  it('DIV3 competition returns weight 0.7', () => {
    const comp = makeCompetition({ category: Category.DIV3, vet_age_group: null })
    expect(categoryWeight(comp)).toBe(0.7)
  })
})

// ──────────────────────────────────────────────
// weightedStripHours
// ──────────────────────────────────────────────

describe('weightedStripHours', () => {
  it('Y10 event with 80 fencers has weight 1.2 → 20% heavier than raw strip-hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.Y10,
      vet_age_group: null,
      fencer_count: 80,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 8,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * 1.2, 5)
  })

  it('VET_COMBINED event with 40 fencers has weight 0.6 → 40% lighter than raw strip-hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.VETERAN,
      vet_age_group: VetAgeGroup.VET_COMBINED,
      fencer_count: 40,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 6,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * 0.6, 5)
  })

  it('VET40 event with 40 fencers has weight 0.8 → lighter weight, no start offset', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.VETERAN,
      vet_age_group: VetAgeGroup.VET40,
      fencer_count: 40,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 6,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * 0.8, 5)
  })

  it('DIV1 event with 310 fencers has weight 1.5 → 50% heavier than raw strip-hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.DIV1,
      vet_age_group: null,
      fencer_count: 310,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 24,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * 1.5, 5)
  })

  it('DIV2 event with 100 fencers has weight 0.7 → lighter than raw strip-hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.DIV2,
      vet_age_group: null,
      fencer_count: 100,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 10,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * 0.7, 5)
  })

  it('weightedStripHours equals estimateCompetitionStripHours * categoryWeight', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      category: Category.JUNIOR,
      vet_age_group: null,
      fencer_count: 150,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 12,
    })

    const raw = estimateCompetitionStripHours(comp, config)
    const weight = categoryWeight(comp)
    const weighted = weightedStripHours(comp, config)

    expect(weighted).toBeCloseTo(raw.total_strip_hours * weight, 5)
    expect(weight).toBe(1.3)
  })
})

// ──────────────────────────────────────────────
// aggregateStripHours
// ──────────────────────────────────────────────

describe('aggregateStripHours', () => {
  it('sums estimateCompetitionStripHours(...).total_strip_hours and video_strip_hours over the list', () => {
    const config = makeConfig()
    const comps = [
      makeCompetition({ id: 'a', fencer_count: 24, de_mode: DeMode.STAGED }),
      makeCompetition({ id: 'b', fencer_count: 56, de_mode: DeMode.STAGED }),
      makeCompetition({ id: 'c', fencer_count: 100, de_mode: DeMode.SINGLE_STAGE }),
    ]
    const expectedTotal = comps.reduce(
      (sum, c) => sum + estimateCompetitionStripHours(c, config).total_strip_hours,
      0,
    )
    const expectedVideo = comps.reduce(
      (sum, c) => sum + estimateCompetitionStripHours(c, config).video_strip_hours,
      0,
    )

    const result = aggregateStripHours(comps, config)

    expect(result.total_strip_hours).toBeCloseTo(expectedTotal, 5)
    expect(result.video_strip_hours).toBeCloseTo(expectedVideo, 5)
  })

  it('skips a competition below MIN_FENCERS and one above MAX_FENCERS', () => {
    const config = makeConfig() // MIN_FENCERS 2, MAX_FENCERS 500
    const inRange = makeCompetition({ id: 'in-range', fencer_count: 24 })
    // fencer_count 1 is below MIN_FENCERS; estimateCompetitionStripHours may
    // throw on an unsizeable event, so the filter must run before the
    // estimator is ever called on this competition.
    const tooFew = makeCompetition({ id: 'too-few', fencer_count: 1 })
    const tooMany = makeCompetition({ id: 'too-many', fencer_count: 501 })

    const expected = estimateCompetitionStripHours(inRange, config)
    const result = aggregateStripHours([inRange, tooFew, tooMany], config)

    expect(result.total_strip_hours).toBeCloseTo(expected.total_strip_hours, 5)
    expect(result.video_strip_hours).toBeCloseTo(expected.video_strip_hours, 5)
  })

  it('returns 0 for both fields on an empty list', () => {
    const config = makeConfig()
    expect(aggregateStripHours([], config)).toEqual({
      total_strip_hours: 0,
      video_strip_hours: 0,
    })
  })

  it('agrees to the strip-hour with the number validateFeasibility reports for the same board', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(2, 0),
    })
    const comps = Array.from({ length: 20 }, (_, i) =>
      makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }),
    )

    const findings = validateFeasibility(config, comps)
    const finding = findings.find(f => f.field === 'feasibility')
    expect(finding).toBeDefined()
    const match = finding!.message.match(/(\d+) general strip-hours needed/)
    expect(match).not.toBeNull()
    const reported = Number(match![1])

    const result = aggregateStripHours(comps, config)
    expect(Math.round(result.total_strip_hours)).toBe(reported)
  })
})
