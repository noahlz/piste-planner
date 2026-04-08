import { describe, it, expect } from 'vitest'
import {
  estimateCompetitionStripHours,
  dayConsumedCapacity,
  dayRemainingCapacity,
  categoryWeight,
  weightedStripHours,
  distributeEvenly,
} from '../../src/engine/capacity.ts'
import type { GlobalState } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType, VideoPolicy, VetAgeGroup, Weapon,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeScheduleResult } from '../helpers/factories.ts'

function makeGlobalState(
  scheduleEntries: Record<string, ReturnType<typeof makeScheduleResult>> = {},
  strips_total: number = 24,
): GlobalState {
  return {
    strip_free_at: Array(strips_total).fill(480),
    refs_in_use_by_day: {},
    schedule: scheduleEntries,
    bottlenecks: [],
  }
}

// ──────────────────────────────────────────────
// estimateCompetitionStripHours
// ──────────────────────────────────────────────

describe('estimateCompetitionStripHours', () => {
  it('200-fencer EPEE INDIVIDUAL event → pod model reduces DE strip-hours vs flat formula', () => {
    const config = makeConfig()
    // 200 fencers → n_pools = ceil(200/7) = 29
    // pool_strip_hours = 29 * 163 / 60 = 78.8167
    // Pod model DE on 16 strips: produces ~52.2 strip-hours (vs flat 64)
    const comp = makeCompetition({
      id: 'epee-200',
      fencer_count: 200,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const result = estimateCompetitionStripHours(comp, config)

    const expectedPoolStripHours = 29 * 163 / 60   // 78.8167
    // Pod model produces less than the old flat formula (16 * 240 / 60 = 64)
    const flatDeStripHours = 16 * 240 / 60
    expect(result.total_strip_hours).toBeGreaterThan(expectedPoolStripHours)
    expect(result.total_strip_hours).toBeLessThan(expectedPoolStripHours + flatDeStripHours)
    expect(result.video_strip_hours).toBe(0) // SINGLE_STAGE, no video strip hours
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

  it('STAGED_DE_BLOCKS with REQUIRED video policy → non-zero video_strip_hours', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'staged-video',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
      de_finals_strips: 2,
      strips_allocated: 8,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // 100 FOIL fencers: n_pools=15, 10 pools of 7, 5 pools of 6
    // poolDurationForSize(FOIL,7)=147, poolDurationForSize(FOIL,6)=105
    // weightedPoolDuration = round((10*147 + 5*105)/15) = round(133) = 133
    // pool_strip_hours = 15 * 133 / 60 = 33.25
    // bracket = 128; deDuration(FOIL,128) = 180
    // deBlockDurations(128,180): finalsDur=3 < 30 → floor applied: finals=30, remaining=150
    // prelims = round(33/63 * 150) = 79, r16 = 71
    // prelims_strip_hours = 8 * 79/60 = 10.5333
    // r16_strip_hours = 4 * 71/60 = 4.7333, finals_strip_hours = 2 * 30/60 = 1.0
    // video_strip_hours = 4.7333 + 1.0 = 5.7333
    // total = 33.25 + 10.5333 + 4.7333 + 1.0 = 49.5167
    const expectedPoolStripHours = 15 * 133 / 60
    const expectedPrelimsStripHours = 8 * 79 / 60
    const expectedR16StripHours = 4 * 71 / 60
    const expectedFinalsStripHours = 2 * 30 / 60
    const expectedVideoStripHours = expectedR16StripHours + expectedFinalsStripHours
    const expectedTotal = expectedPoolStripHours + expectedPrelimsStripHours + expectedR16StripHours + expectedFinalsStripHours
    expect(result.video_strip_hours).toBeCloseTo(expectedVideoStripHours, 1)
    expect(result.total_strip_hours).toBeCloseTo(expectedTotal, 1)
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

  it('pod model — 256-fencer EPEE on 16 strips → DE strip-hours ≈ 53.47', () => {
    // 4 pods of 4 strips; sub-bracket = 64 per pod; pre-R16 = 15 batches × 20 min = 300 min
    // preR16StripHours = 16 × 300/60 = 80.0; r16StripHours = 4.667
    // scaleFactor = 240/380; total DE sh = 84.667 × 0.63158 ≈ 53.47
    const podConfig = makeConfig({ de_capacity_mode: 'pod' })
    const greedyConfig = makeConfig({ de_capacity_mode: 'greedy' })
    const comp = makeCompetition({
      id: 'pod-256',
      fencer_count: 256,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const podResult = estimateCompetitionStripHours(comp, podConfig)
    const greedyResult = estimateCompetitionStripHours(comp, greedyConfig)

    // Pool strip-hours are the same regardless of de_capacity_mode.
    // Greedy DE for 256 fencers: (256-2) * 20/60 = 84.667. Isolate pool_sh then check pod DE.
    const greedyDeStripHours = (256 - 2) * 20 / 60
    const poolStripHours = greedyResult.total_strip_hours - greedyDeStripHours
    const podDeStripHours = podResult.total_strip_hours - poolStripHours
    expect(podDeStripHours).toBeCloseTo(53.47, 0)
  })

  it('greedy model — 256 fencers, 20% cut → DE strip-hours ≈ 67.67', () => {
    // promoted = round(256 × 0.80) = 205; totalBouts = 203; 203 × 20/60 = 67.67
    const greedyConfig = makeConfig({ de_capacity_mode: 'greedy' })
    const cutComp = makeCompetition({
      id: 'greedy-256-cut',
      fencer_count: 256,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })
    const noCutComp = makeCompetition({
      id: 'greedy-256-nocut',
      fencer_count: 256,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const cutResult = estimateCompetitionStripHours(cutComp, greedyConfig)
    const noCutResult = estimateCompetitionStripHours(noCutComp, greedyConfig)

    // Pool strip-hours are the same (same fencer_count). Isolate via greedy no-cut baseline.
    const poolStripHours = noCutResult.total_strip_hours - (256 - 2) * 20 / 60
    const deStripHours = cutResult.total_strip_hours - poolStripHours
    expect(deStripHours).toBeCloseTo(67.67, 1)
  })

  it('pod model — bracket ≤ 16 (12 fencers, 8 strips) → DE strip-hours ≈ 3.0', () => {
    // podR16StripHours(12, 20, 60): walk 12→6→3→1; totalBoutDur=80; scaleFactor=60/80=0.75
    // totalStripHours = (2.667 + 1.0 + 0.333) × 0.75 = 4.0 × 0.75 = 3.0
    const podConfig = makeConfig({ de_capacity_mode: 'pod' })
    const greedyConfig = makeConfig({ de_capacity_mode: 'greedy' })
    const comp = makeCompetition({
      id: 'pod-small',
      fencer_count: 12,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 8,
    })

    const podResult = estimateCompetitionStripHours(comp, podConfig)
    const greedyResult = estimateCompetitionStripHours(comp, greedyConfig)

    // Pool strip-hours same regardless of mode. Greedy DE for 12 fencers: (12-2)*20/60 = 3.333
    const poolStripHours = greedyResult.total_strip_hours - (12 - 2) * 20 / 60
    const podDeStripHours = podResult.total_strip_hours - poolStripHours
    // Flat formula: 8 × 60/60 = 8.0; pod model is much less
    expect(podDeStripHours).toBeCloseTo(3.0, 1)
    expect(podDeStripHours).toBeLessThan(8 * 60 / 60)
  })

  it('team event — 33 teams, EPEE → uses team model regardless of de_capacity_mode', () => {
    // playInBouts=1 (33-32); rounds 32→16→8→4→2 (finals excluded)
    // teamDeStripHours = (1+16+8+4+2) × 20/60 = 31 × 20/60 ≈ 10.333
    const podConfig = makeConfig({ de_capacity_mode: 'pod' })
    const greedyConfig = makeConfig({ de_capacity_mode: 'greedy' })
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

    const podResult = estimateCompetitionStripHours(comp, podConfig)
    const greedyResult = estimateCompetitionStripHours(comp, greedyConfig)

    // Team events use the team model regardless of de_capacity_mode — results must be equal
    expect(podResult.total_strip_hours).toBe(greedyResult.total_strip_hours)
    // Total = pool_strip_hours + 10.333; verify DE portion ≈ 10.333
    // Pool for 33 EPEE: n_pools=5, 3 pools of 7 (168 min each), 2 pools of 6 (120 min each)
    // weightedPoolDur = round((3×168 + 2×120)/5) = round(148.8) = 149; pool_sh = 5×149/60 ≈ 12.417
    const expectedPoolStripHours = 5 * 149 / 60
    const deStripHours = podResult.total_strip_hours - expectedPoolStripHours
    expect(deStripHours).toBeCloseTo(10.333, 1)
  })

  it('team event — 32 teams, EPEE → DE strip-hours = 10.0 (no play-ins)', () => {
    // 32 teams, no play-ins. R32:16 + R16:8 + QF:4 + SF:2 = 30 bouts (finals excluded)
    // teamDeStripHours = 30 × 20/60 = 10.0
    const config = makeConfig({ de_capacity_mode: 'pod' })
    const comp = makeCompetition({
      id: 'team-32',
      fencer_count: 32,
      weapon: Weapon.EPEE,
      event_type: EventType.TEAM,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const result = estimateCompetitionStripHours(comp, config)

    // Pool for 32 EPEE: n_pools=5, 2 pools of 7 (168 min), 3 pools of 6 (120 min)
    // weightedPoolDur = round((2×168 + 3×120)/5) = round(139.2) = 139; pool_sh = 5×139/60
    const expectedPoolStripHours = 5 * 139 / 60
    const deStripHours = result.total_strip_hours - expectedPoolStripHours
    expect(deStripHours).toBeCloseTo(10.0, 1)
  })

  it('greedy model — strip count does not affect total strip-hours', () => {
    const config = makeConfig({ de_capacity_mode: 'greedy' })
    const comp4 = makeCompetition({
      id: 'greedy-strips-4',
      fencer_count: 100,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 4,
    })
    const comp16 = makeCompetition({
      id: 'greedy-strips-16',
      fencer_count: 100,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const result4 = estimateCompetitionStripHours(comp4, config)
    const result16 = estimateCompetitionStripHours(comp16, config)

    expect(result4.total_strip_hours).toBe(result16.total_strip_hours)
  })

  it('pod model — 200-fencer EPEE on 16 strips produces fewer DE strip-hours than flat formula', () => {
    const podConfig = makeConfig({ de_capacity_mode: 'pod' })
    const greedyConfig = makeConfig({ de_capacity_mode: 'greedy' })
    const comp = makeCompetition({
      id: 'pod-200-vs-flat',
      fencer_count: 200,
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 16,
    })

    const podResult = estimateCompetitionStripHours(comp, podConfig)
    const greedyResult = estimateCompetitionStripHours(comp, greedyConfig)

    // Flat formula: 16 strips × 240 min / 60 = 64 strip-hours
    const flatDeStripHours = 16 * 240 / 60
    const poolStripHours = greedyResult.total_strip_hours - (200 - 2) * 20 / 60
    const podDeStripHours = podResult.total_strip_hours - poolStripHours
    expect(podDeStripHours).toBeLessThan(flatDeStripHours)
    expect(podDeStripHours).toBeGreaterThan(0)
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

    // comp1: 30 FOIL → 5 pools of 6; poolDur(FOIL,6)=105; pool_sh=5*105/60=8.75
    //   DE uses pod model — strip-hours computed via estimateCompetitionStripHours
    // comp2: 30 EPEE → 5 pools of 6; poolDur(EPEE,6)=120; pool_sh=5*120/60=10.0
    //   DE uses pod model — strip-hours computed via estimateCompetitionStripHours
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

    // 30 FOIL (default weapon) → 5 pools of 6; poolDur(FOIL,6)=105; pool_sh=5*105/60=8.75
    // DE uses pod model — strip-hours computed via estimateCompetitionStripHours
    const expectedSingleCompStripHours = estimateCompetitionStripHours(comp1, config).total_strip_hours
    expect(day0Result.strip_hours_consumed).toBeCloseTo(expectedSingleCompStripHours, 5)
    expect(emptyDayResult.strip_hours_consumed).toBe(0)
  })

  it('video strip-hours consumed is non-zero for STAGED_DE_BLOCKS + REQUIRED competitions', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'video-comp',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
      de_finals_strips: 2,
      strips_allocated: 8,
    })

    const state = makeGlobalState({ 'video-comp': makeScheduleResult('video-comp', 0) })

    const result = dayConsumedCapacity(0, state, [comp], config)

    // Same competition as in the estimateCompetitionStripHours STAGED_DE_BLOCKS test:
    // r16_strip_hours = 4 * 71 / 60 = 4.7333; finals_strip_hours = 2 * 30 / 60 = 1.0
    // video_strip_hours = 4.7333 + 1.0 = 5.7333
    const expectedVideoStripHours = 4 * 71 / 60 + 2 * 30 / 60
    expect(result.video_strip_hours_consumed).toBeCloseTo(expectedVideoStripHours, 1)
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
    // poolDur(FOIL,7)=round(105*21/15)=147; poolDur(FOIL,6)=105
    // weightedPoolDur = round((2*147+6*105)/8) = round(924/8) = round(115.5) = 116
    // pool_sh = 8 * 116 / 60 = 15.4667
    // DE uses pod model — strip-hours computed via estimateCompetitionStripHours
    const expectedCompStripHours = estimateCompetitionStripHours(comp, config).total_strip_hours
    expect(emptyResult.strip_hours_remaining - filledResult.strip_hours_remaining).toBeCloseTo(expectedCompStripHours, 5)
  })

  it('video remaining capacity tracks separately from general capacity', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'video-comp',
      fencer_count: 100,
      weapon: Weapon.FOIL,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
      de_finals_strips: 2,
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
// distributeEvenly
// ──────────────────────────────────────────────

describe('distributeEvenly', () => {
  it('divides evenly when divisible', () => {
    expect(distributeEvenly(12, 3)).toEqual([4, 4, 4])
  })

  it('larger groups get one extra when not divisible', () => {
    expect(distributeEvenly(10, 3)).toEqual([4, 3, 3])
  })

  it('6 strips across 2 pods → [3, 3]', () => {
    expect(distributeEvenly(6, 2)).toEqual([3, 3])
  })
})
