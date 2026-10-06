import { describe, it, expect } from 'vitest'
import { dayStart, dayEnd, dayHardEnd, findDayForTime } from '../../src/engine/types.ts'
import { DAY_AXIS_SPACING_MINS } from '../../src/store/buildConfig.ts'
import {
  allocateInterval,
  createGlobalState,
  findAvailableStripsInWindow,
} from '../../src/engine/resources.ts'
import { postScheduleWarnings, scheduleAllConcurrent } from '../../src/engine/concurrentScheduler.ts'
import {
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  CutMode,
  DeMode,
  Phase,
  RefPolicy,
  VideoPolicy,
} from '../../src/engine/types.ts'
import type { Bottleneck, DayWindow, ScheduleResult } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeScheduleResult, makeStrips } from '../helpers/factories.ts'
import { checkInvariants } from '../helpers/bottleneckInvariants.ts'

/**
 * 024 D7 – the engine's day window and its fallback axis.
 *
 * A config with empty `dayConfigs` (the drift ledger's) has no day windows of
 * its own, so the engine lays its days out the way the app's config does:
 * 1440 minutes apart, minute 0 standing for 9:00, each day's soft target
 * 600 minutes after its start (19:00) and its hard end 780 minutes after
 * (22:00). Ops Manual 2026-27 p.17, METHODOLOGY.md §Same-Day Completion and
 * Appendix A §Timing Constants. A back-to-back axis cost B4 one event with no
 * spec cause (plan §Group B).
 */
describe('fallback day axis (empty dayConfigs)', () => {
  const config = makeConfig({ days_available: 3 })

  it('spaces days 1440 apart, as the app\'s config does', () => {
    expect([0, 1, 2].map((d) => dayStart(d, config))).toEqual([0, 1440, 2880])
    expect(DAY_AXIS_SPACING_MINS).toBe(1440)
  })

  it('puts each day\'s soft target 600 minutes after its start (9:00 to 19:00)', () => {
    expect([0, 1, 2].map((d) => dayEnd(d, config))).toEqual([600, 2040, 3480])
  })

  it('puts each day\'s hard end 780 minutes after its start (9:00 to 22:00)', () => {
    expect([0, 1, 2].map((d) => dayHardEnd(d, config))).toEqual([780, 2220, 3660])
  })
})

describe('dayHardEnd with configured windows', () => {
  it('returns the window\'s own hard end', () => {
    const config = makeConfig({
      days_available: 2,
      dayConfigs: [
        { day_start_time: 540, day_end_time: 1140, day_hard_end_time: 1320 },
        { day_start_time: 1980, day_end_time: 2820, day_hard_end_time: 2820 },
      ],
    })
    expect(dayHardEnd(0, config)).toBe(1320)
    expect(dayHardEnd(1, config)).toBe(2820)
  })
})

/**
 * `findAvailableStripsInWindow`'s day inference, used only when no `day` is
 * passed: it must infer the day on the same 1440-spaced axis and label a miss
 * TIME only when the next window would end past that day's hard end.
 */
describe('findAvailableStripsInWindow day inference on the fallback axis', () => {
  function missOnDay1(duration: number) {
    const config = makeConfig({ strips: makeStrips(1, 0) })
    const state = createGlobalState(config)
    // Day 1 starts at 1440. The only strip is busy until 1440 + 700.
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 1440, 1440 + 700)
    return findAvailableStripsInWindow(state, config, 1, 1440, duration, false)
  }

  it('a window ending before day 1\'s hard end (1440 + 780) is a STRIPS miss', () => {
    const result = missOnDay1(60) // next window [2140, 2200]
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.earliest_next_start).toBe(1440 + 700)
      expect(result.reason).toBe('STRIPS')
    }
  })

  // guard: past the hard end is TIME today as well.
  it('a window ending past day 1\'s hard end is a TIME miss', () => {
    const result = missOnDay1(100) // next window [2140, 2240]
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('TIME')
    }
  })
})

/**
 * The scheduler places work until the day's hard end, not its soft target
 * (METHODOLOGY.md §Same-Day Completion, §Phase 5): a phase ending between
 * 19:00 and 22:00 is placed, and SAME_DAY_VIOLATION fires only for a phase
 * that would end past 22:00 (§Bottlenecks Specific to the Concurrent
 * Scheduler).
 *
 * The one day opens late, at 17:30, so a single small event's pools end near
 * 19:00 and its DE runs on into the evening. The window is the scheduler-axis
 * shape `buildConfig.ts` emits for day hours 17:30–19:00.
 */
const LATE_WINDOW: DayWindow = { day_start_time: 1050, day_end_time: 1140, day_hard_end_time: 1320 }

function lateEventCompetition(fencerCount: number) {
  return makeCompetition({
    id: 'late-evt',
    fencer_count: fencerCount,
    de_mode: DeMode.SINGLE_STAGE,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    ref_policy: RefPolicy.ONE,
  })
}

function lateWindowConfig() {
  return makeConfig({
    days_available: 1,
    strips: makeStrips(20, 0),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    dayConfigs: [LATE_WINDOW],
  })
}

describe('the scheduler places work until the day\'s hard end', () => {
  function runOnLateWindow(fencerCount: number) {
    return scheduleAllConcurrent([lateEventCompetition(fencerCount)], lateWindowConfig())
  }

  // A SAME_DAY_VIOLATION carries its attempt's id, so the retry rollback
  // (`releaseEventAllocations`) removes it with the attempt. The failed-attempt
  // findings persist and name the phase that failed, so they are what these
  // tests read.
  function failedAttempts(result: ReturnType<typeof scheduleAllConcurrent>) {
    return result.bottlenecks.filter((b) =>
      b.cause === BottleneckCause.DEADLINE_BREACH
      || b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE)
  }

  it('places a DE that ends between 19:00 and 22:00 on its first attempt', () => {
    const result = runOnLateWindow(24)
    const s = result.schedule['late-evt']

    expect(s).toBeDefined()
    expect(s.de_end).toBeGreaterThan(LATE_WINDOW.day_end_time)
    expect(s.de_end).toBeLessThanOrEqual(LATE_WINDOW.day_hard_end_time)
    // No attempt failed, so no SAME_DAY_VIOLATION fired.
    expect(failedAttempts(result)).toEqual([])
  })

  it('places pools that end by 22:00 and fails the DE that would end past it', () => {
    const result = runOnLateWindow(100)

    expect(result.schedule['late-evt']).toBeUndefined()
    const failures = failedAttempts(result)
    expect(failures.map((b) => b.cause)).toEqual([
      BottleneckCause.DEADLINE_BREACH,
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    ])
    // Both attempts got past the pools and failed at the DE.
    for (const b of failures) expect(b.message).toMatch(new RegExp(`failed at ${Phase.DE}\\b`))
  })

  it('counts the referees of a phase that starts after 19:00 toward that day', () => {
    const result = runOnLateWindow(24)
    const s = result.schedule['late-evt']
    const day0 = result.ref_requirements_by_day?.[0]

    expect(s).toBeDefined()
    expect(s.de_start).toBeGreaterThan(LATE_WINDOW.day_end_time)
    // 24 fencers: 4 pools ask 4 referees, and the DE's opening round asks one
    // per strip, more than the pools, so the day's peak is the DE's start.
    expect(day0?.peak_time).toBe(s.de_start)
  })
})

/**
 * The late-day WARN (024 D7, METHODOLOGY.md §Same-Day Completion): when a
 * day's last competition ends after the day's soft target (its
 * `day_end_time`, 19:00 by default – Ops Manual 2026-27 p.17), the engine
 * emits one SCHEDULE_ACCEPTED_WITH_WARNINGS finding for that day, rule
 * `day-ends-past-target`, at every day count. An event's finish is its
 * `de_total_end` (gold/bronze tail included), or `pool_end` when it has no DE.
 * The finding names the day's estimated finish, carries the minutes past the
 * target as `delay_mins`, and lists the events that finish after the target.
 */
describe('late-day WARN (day-ends-past-target)', () => {
  const LATE_DAY_RULE = 'day-ends-past-target'

  function lateDayWarnings(bottlenecks: Bottleneck[]): Bottleneck[] {
    return bottlenecks.filter((b) => b.rule === LATE_DAY_RULE)
  }

  function finishing(id: string, day: number, deTotalEnd: number | null, poolEnd: number): ScheduleResult {
    return { ...makeScheduleResult(id, day), pool_start: poolEnd - 120, pool_end: poolEnd, de_total_end: deTotalEnd }
  }

  it('emits exactly one WARN per late day, with the day\'s finish and the events past the target', () => {
    // Fallback axis: targets at 600, 2040 and 3480, hard ends at 780, 2220
    // and 3660. Day 1 ends late on two events, day 2 ends exactly on its
    // target (not late), and day 3 ends late on an event with no DE.
    const config = makeConfig({ days_available: 3 })
    const schedule: Record<string, ScheduleResult> = {
      'A-LATE': finishing('A-LATE', 0, 700, 400),
      'B-LATE': finishing('B-LATE', 0, 650, 400),
      'C-ON-TIME': finishing('C-ON-TIME', 0, 590, 400),
      'D-AT-TARGET': finishing('D-AT-TARGET', 1, 2040, 1800),
      'E-NO-DE': finishing('E-NO-DE', 2, null, 3500),
    }

    const late = lateDayWarnings(postScheduleWarnings(schedule, config))

    expect(late.map((b) => b.subjects)).toEqual([['A-LATE', 'B-LATE'], ['E-NO-DE']])
    expect(late.map((b) => b.delay_mins)).toEqual([100, 20])
    for (const b of late) {
      expect(b.cause).toBe(BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS)
      expect(b.severity).toBe(BottleneckSeverity.WARN)
      expect(b.phase).toBe(Phase.POST_SCHEDULE)
      expect(b.competition_id).toBe('')
    }
    expect(late[0].message).toMatch(/^Day 1 .*\b700\b/)
    expect(late[1].message).toMatch(/^Day 3 .*\b3500\b/)
  })

  it('still warns about each late day on a 4-day run whose first and last days also run long', () => {
    // Fallback axis: targets at 600, 2040, 3480 and 4920. Days 1 and 4 end late
    // and run longer than the middle days (700 vs. 300 min), so the first and
    // last day warnings fire too.
    const config = makeConfig({ days_available: 4 })
    const schedule: Record<string, ScheduleResult> = {
      'A-LATE': finishing('A-LATE', 0, 700, 400),
      'B-MID': finishing('B-MID', 1, 1740, 1500),
      'C-MID': finishing('C-MID', 2, 3180, 3000),
      'D-LATE': finishing('D-LATE', 3, 5020, 4800),
    }

    const warnings = postScheduleWarnings(schedule, config)

    expect(lateDayWarnings(warnings).map((b) => b.subjects)).toEqual([['A-LATE'], ['D-LATE']])
    expect(warnings.map((b) => b.rule)).toEqual([
      BottleneckRule.DAY_ENDS_PAST_TARGET,
      BottleneckRule.DAY_ENDS_PAST_TARGET,
      BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE,
      BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
    ])
  })

  it('fires on a one-day run whose DE ends between 19:00 and 22:00', () => {
    const result = scheduleAllConcurrent([lateEventCompetition(24)], lateWindowConfig())
    const s = result.schedule['late-evt']
    expect(s.de_total_end).toBeGreaterThan(LATE_WINDOW.day_end_time)

    const late = lateDayWarnings(result.bottlenecks)
    expect(late).toHaveLength(1)
    expect(late[0].subjects).toEqual(['late-evt'])
    expect(late[0].delay_mins).toBe(s.de_total_end! - LATE_WINDOW.day_end_time)
    expect(late[0].message).toContain(String(s.de_total_end))
    checkInvariants(late[0], ['late-evt'], new Set())
  })

  // guard: no event ends past the target, so nothing fires – today as well.
  it('stays silent when every event ends by the 19:00 target', () => {
    const config = makeConfig({ days_available: 1, strips: makeStrips(20, 0) })
    const result = scheduleAllConcurrent([lateEventCompetition(24)], config)
    expect(result.schedule['late-evt'].de_total_end).toBeLessThanOrEqual(dayEnd(0, config))

    expect(lateDayWarnings(result.bottlenecks)).toEqual([])
  })
})

/**
 * The first/last-day WARN (024 D10, METHODOLOGY.md §Phase 7 – Ops Manual p.20,
 * Group 2: the first and last days should be shorter than the days between).
 * It reads the first and last USED day, needs at least 3 used days, and fires
 * when either is not shorter than the shortest used middle day. A day's
 * projected length is its last end minus its day start.
 */
describe('first/last-day WARN', () => {
  const FIRST_LAST_RULES: string[] = [
    BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE,
    BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
  ]

  /** One event per entry, ending `length` minutes after its day's start (fallback axis, 1440 apart). */
  function daysOfLength(lengths: Record<number, number>): Record<string, ScheduleResult> {
    const schedule: Record<string, ScheduleResult> = {}
    for (const [day, length] of Object.entries(lengths)) {
      const d = Number(day)
      const end = d * 1440 + length
      schedule[`E${d}`] = { ...makeScheduleResult(`E${d}`, d), pool_start: d * 1440, pool_end: end - 60, de_total_end: end }
    }
    return schedule
  }

  function firstLastRules(schedule: Record<string, ScheduleResult>, daysAvailable: number): string[] {
    return postScheduleWarnings(schedule, makeConfig({ days_available: daysAvailable }))
      .map((b) => b.rule as string)
      .filter((rule) => FIRST_LAST_RULES.includes(rule))
  }

  it('warns when the first day is as long as the only middle day of 3', () => {
    expect(firstLastRules(daysOfLength({ 0: 500, 1: 500, 2: 400 }), 3)).toEqual([
      BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE,
    ])
  })

  it('compares against the shortest used middle day, not their average', () => {
    // Middle days 300 and 500. The last day equals the shortest, so it warns.
    // The first is one minute shorter, so it does not.
    expect(firstLastRules(daysOfLength({ 0: 299, 1: 300, 2: 500, 3: 300 }), 4)).toEqual([
      BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
    ])
  })

  it('reads the last used day, not the last available one', () => {
    // 4 days available, day 4 empty: days 1–3 are used, so day 3 is the last.
    expect(firstLastRules(daysOfLength({ 0: 300, 1: 400, 2: 450 }), 4)).toEqual([
      BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
    ])
  })

  it('stays silent with fewer than 3 used days, however long they run', () => {
    expect(firstLastRules(daysOfLength({ 0: 700, 3: 700 }), 4)).toEqual([])
  })

  // guard: both edge days strictly shorter than the middle – silent today too.
  it('stays silent when the first and last days are both shorter than every middle day', () => {
    expect(firstLastRules(daysOfLength({ 0: 299, 1: 300, 2: 299 }), 3)).toEqual([])
  })
})

describe('findDayForTime reads the day\'s hard end', () => {
  const config = makeConfig({
    days_available: 2,
    dayConfigs: [
      { day_start_time: 540, day_end_time: 1140, day_hard_end_time: 1320 },
      { day_start_time: 1980, day_end_time: 2580, day_hard_end_time: 2760 },
    ],
  })

  it('places a time between the 19:00 target and the 22:00 hard end on its day', () => {
    expect(findDayForTime(config, 1200)).toBe(0)
    expect(findDayForTime(config, 2700)).toBe(1)
  })

  // guard: past the hard end belongs to no day, today as well.
  it('places a time at or past the hard end on no day', () => {
    expect(findDayForTime(config, 1320)).toBeNull()
  })
})
