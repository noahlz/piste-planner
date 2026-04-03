import { describe, it, expect } from 'vitest'
import {
  estimateCompetitionStripHours,
  dayConsumedCapacity,
  dayRemainingCapacity,
} from '../../src/engine/capacity.ts'
import type { GlobalState } from '../../src/engine/types.ts'
import {
  CutMode, DeMode, EventType, VideoPolicy, Weapon,
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
  it('200-fencer EPEE INDIVIDUAL event → exact pool and DE strip-hours', () => {
    const config = makeConfig()
    // 200 fencers → n_pools = ceil(200/7) = 29
    // base_size = floor(200/29) = 6, remainder = 200 % 29 = 26
    // 26 pools of 7, 3 pools of 6
    // poolDurationForSize(EPEE, 7) = round(120 * 21/15) = 168
    // poolDurationForSize(EPEE, 6) = round(120 * 15/15) = 120
    // weightedPoolDuration = round((26*168 + 3*120) / 29) = round(163.03) = 163
    // pool_strip_hours = 29 * 163 / 60 = 78.8167
    // DE: no cut → bracket = 256; EPEE 256 = 240 mins; de_strip_hours = 16 * 240 / 60 = 64
    // total = 78.8167 + 64 = 142.8167
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
    const expectedDeStripHours = 16 * 240 / 60     // 64
    const expectedTotal = expectedPoolStripHours + expectedDeStripHours
    expect(result.total_strip_hours).toBeCloseTo(expectedTotal, 1)
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

  it('one large competition consuming 40 strips for 4h → ~160 strip-hours consumed', () => {
    const config = makeConfig({ strips: Array.from({ length: 80 }, (_, i) => ({ id: `strip-${i+1}`, video_capable: i < 4 })) })
    // Use a competition where we can predict strip-hours consumed
    // With strips_allocated=40 and total DE duration = 4h = 240 mins:
    // DE strip-hours = 40 * 240 / 60 = 160 strip-hours
    // We need fencer count such that DE bracket duration ≈ 240 mins
    // FOIL, bracket 256 = 240 mins, fencer_count=200 no cut → bracket=256
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

    // 200 FOIL fencers: n_pools=29, 26 pools of 7, 3 pools of 6
    // poolDurationForSize(FOIL,7) = round(105*21/15) = 147
    // poolDurationForSize(FOIL,6) = round(105*15/15) = 105
    // weightedPoolDuration = round((26*147 + 3*105)/29) = round(4137/29) = round(142.65) = 143
    // pool_strip_hours = 29 * 143 / 60 = 69.1167
    // bracket=256; deDuration(FOIL,256)=240; de_strip_hours = 40 * 240 / 60 = 160
    // total = 69.1167 + 160 = 229.1167
    const expectedPoolStripHours = 29 * 143 / 60
    const expectedDeStripHours = 40 * 240 / 60
    const expectedTotal = expectedPoolStripHours + expectedDeStripHours
    expect(result.strip_hours_consumed).toBeCloseTo(expectedTotal, 1)
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
    //   bracket=32; FOIL[32]=90; de_sh=4*90/60=6.0 → comp1_total=14.75
    // comp2: 30 EPEE → 5 pools of 6; poolDur(EPEE,6)=120; pool_sh=5*120/60=10.0
    //   bracket=32; EPEE[32]=90; de_sh=4*90/60=6.0 → comp2_total=16.0
    const comp1StripHours = 5 * 105 / 60 + 4 * 90 / 60   // 8.75 + 6.0 = 14.75
    const comp2StripHours = 5 * 120 / 60 + 4 * 90 / 60   // 10.0 + 6.0 = 16.0
    expect(result.strip_hours_consumed).toBeCloseTo(comp1StripHours + comp2StripHours, 1)
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
    // bracket=32; FOIL[32]=90; de_sh=4*90/60=6.0 → total=14.75
    const expectedSingleCompStripHours = 5 * 105 / 60 + 4 * 90 / 60   // 8.75 + 6.0 = 14.75
    expect(day0Result.strip_hours_consumed).toBeCloseTo(expectedSingleCompStripHours, 1)
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
    // bracket=64; FOIL[64]=120; de_sh = 8 * 120 / 60 = 16.0
    // comp_total = 15.4667 + 16.0 = 31.4667
    const expectedCompStripHours = 8 * 116 / 60 + 8 * 120 / 60
    expect(emptyResult.strip_hours_remaining - filledResult.strip_hours_remaining).toBeCloseTo(expectedCompStripHours, 1)
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
