import { describe, it, expect } from 'vitest'
import { dayStart, dayEnd, dayHardEnd, dayMidnight, findDayForTime, clockOnDay } from '../../src/engine/types.ts'
import { DAY_AXIS_SPACING_MINS } from '../../src/store/buildConfig.ts'
import {
  allocateInterval,
  createGlobalState,
  findAvailableStripsInWindow,
} from '../../src/engine/resources.ts'
import {
  lastPhaseOverrunWarnings,
  postScheduleWarnings,
  scheduleAllConcurrent,
} from '../../src/engine/concurrentScheduler.ts'
import { unseatedPhases } from '../../src/engine/unseated.ts'
import {
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  Category,
  DeMode,
  Gender,
  Phase,
  Weapon,
} from '../../src/engine/types.ts'
import type { Bottleneck, Competition, DayWindow, ScheduleResult } from '../../src/engine/types.ts'
import { makeConfig, makeScheduleResult, makeStrips } from '../helpers/factories.ts'
import { clock, lateEventCompetition, SEVEN_PM, TEN_PM, windowFrom } from '../helpers/lateEvent.ts'
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

const NINE_AM = clock(9)

/** The app's axis: each day's window shifted by d × DAY_AXIS_SPACING_MINS, as `buildConfig.ts` does. */
function appAxisConfig(days: number) {
  return makeConfig({
    days_available: days,
    dayConfigs: Array.from({ length: days }, (_, d) => ({
      day_start_time: d * DAY_AXIS_SPACING_MINS + NINE_AM,
      day_end_time: d * DAY_AXIS_SPACING_MINS + SEVEN_PM,
      day_hard_end_time: d * DAY_AXIS_SPACING_MINS + TEN_PM,
    })),
  })
}

/**
 * The scheduler places work until the day's hard end, not its soft target
 * (METHODOLOGY.md §Same-Day Completion, §Phase 5): a phase ending between
 * 19:00 and 22:00 is placed. Only an event's last phase may run past 22:00, up
 * to midnight, and then it draws a WARN (the R1 block below). A SAME_DAY_VIOLATION
 * ERROR is for any other phase ending past 22:00, or a last phase starting at or
 * after 22:00 or ending past midnight (§Bottlenecks Specific to the Concurrent
 * Scheduler).
 *
 * The one day opens late, at 17:30, so a single small event's pools end near
 * 19:00 and its DE runs on into the evening. The window is the scheduler-axis
 * shape `buildConfig.ts` emits for day hours 17:30–19:00.
 */
const LATE_WINDOW: DayWindow = { day_start_time: clock(17, 30), day_end_time: SEVEN_PM, day_hard_end_time: TEN_PM }

function lateWindowConfig() {
  return makeConfig({
    days_available: 1,
    strips: makeStrips(20, 0),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    dayConfigs: [LATE_WINDOW],
  })
}

// A SAME_DAY_VIOLATION ERROR carries its attempt's id, so the retry rollback
// (`releaseEventAllocations`) removes it with the attempt. The failed-attempt
// findings persist and name the phase that failed, so they are what these
// tests read.
function failedAttempts(result: ReturnType<typeof scheduleAllConcurrent>) {
  return result.bottlenecks.filter((b) =>
    b.cause === BottleneckCause.DEADLINE_BREACH
    || b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE)
}

describe('the scheduler places work until the day\'s hard end', () => {
  function runOnLateWindow(fencerCount: number) {
    return scheduleAllConcurrent([lateEventCompetition(fencerCount)], lateWindowConfig())
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
 * 018 R1 (METHODOLOGY.md §Same-Day Completion, `SAME_DAY_VIOLATION` ERROR and
 * WARN): an event's last phase – its DE, or the R16 stage of a staged DE – may
 * end past the day's 22:00 hard end when it starts before the hard end and ends
 * by midnight. The event is placed and draws one WARN. Every other phase still
 * ends by the hard end, and `latest_end` stays a hard per-event limit.
 */
const MIDNIGHT = clock(24)

function runFrom(start: number, competition: Competition) {
  return scheduleAllConcurrent([competition], windowFrom(start))
}

function overrunWarnings(bottlenecks: Bottleneck[]): Bottleneck[] {
  return bottlenecks.filter((b) =>
    b.rule === BottleneckRule.PHASE_OVERRUNS_DAY_END && b.severity === BottleneckSeverity.WARN)
}

/** Both attempts failed at `phase` and the event was dropped. */
function expectDroppedAt(result: ReturnType<typeof scheduleAllConcurrent>, phase: string) {
  expect(result.schedule['late-evt']).toBeUndefined()
  const failures = failedAttempts(result)
  expect(failures.map((b) => b.cause)).toEqual([
    BottleneckCause.DEADLINE_BREACH,
    BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
  ])
  for (const b of failures) expect(b.message).toMatch(new RegExp(`failed at ${phase}\\b`))
}

describe('an event\'s last phase may run past the hard end, up to midnight (018 R1)', () => {
  // Opens 17:55: pools 17:55–19:44, DE 20:15–23:15.
  const overrunRun = () => runFrom(clock(17, 55), lateEventCompetition(100))

  it('places a last phase that starts before 22:00 and ends at 23:15 on its first attempt', () => {
    const result = overrunRun()
    const s = result.schedule['late-evt']

    expect(s).toBeDefined()
    expect(s.de_start).toBeLessThan(TEN_PM)
    expect(s.de_end).toBe(clock(23, 15))
    expect(failedAttempts(result)).toEqual([])
  })

  it('emits exactly one WARN for it, naming the event and its 23:15 finish', () => {
    const warnings = overrunWarnings(overrunRun().bottlenecks)

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({
      rule: BottleneckRule.PHASE_OVERRUNS_DAY_END,
      cause: BottleneckCause.SAME_DAY_VIOLATION,
      severity: BottleneckSeverity.WARN,
      phase: Phase.POST_SCHEDULE,
      competition_id: 'late-evt',
      subjects: ['late-evt'],
      day: 0,
      delay_mins: 75,
    })
    expect(warnings[0].message).toBe('late-evt ends at 23:15 on Day 1, 75 min past the day\'s hard end 22:00')
    checkInvariants(warnings[0], ['late-evt'], new Set(), 1)
  })

  it('lets a staged event\'s R16 run past 22:00 and warns on the R16 end', () => {
    // Opens 18:00: pools 18:00–19:40, prelims 20:10–21:10, R16 21:40–23:00.
    const result = runFrom(clock(18), lateEventCompetition(64, DeMode.STAGED))
    const s = result.schedule['late-evt']

    expect(s).toBeDefined()
    expect(s.de_prelims_end).toBeLessThanOrEqual(TEN_PM)
    expect(s.de_round_of_16_end).toBe(clock(23))
    const warnings = overrunWarnings(result.bottlenecks)
    expect(warnings).toHaveLength(1)
    expect(warnings[0].delay_mins).toBe(60)
    expect(warnings[0].message).toContain('23:00')
  })

  describe('a pinned last phase past 22:00', () => {
    // The same 17:55 window, its pools pinned at the window's start.
    const pinnedRun = () =>
      scheduleAllConcurrent([lateEventCompetition(100)], windowFrom(clock(17, 55)), [
        { competition_id: 'late-evt', day: 0, start_time: clock(17, 55), strip_count: 20 },
      ])

    it('is claimed and warned: no ERROR, no unclaimed pin, nothing unseated, one WARN', () => {
      const result = pinnedRun()

      expect(result.schedule['late-evt'].de_end).toBe(clock(23, 15))
      expect(result.bottlenecks.filter((b) =>
        b.cause === BottleneckCause.SAME_DAY_VIOLATION && b.severity === BottleneckSeverity.ERROR)).toEqual([])
      expect(result.bottlenecks.filter((b) => b.cause === BottleneckCause.PINNED_UNCLAIMED)).toEqual([])
      expect(unseatedPhases(result).size).toBe(0)
      expect(overrunWarnings(result.bottlenecks).map((b) => b.subjects)).toEqual([['late-evt']])
    })
  })

  // A pinned last phase that breaks its limit keeps the ERROR and the unclaimed
  // pin, and draws no WARN on top (METHODOLOGY.md: the WARN is for an overrun
  // within the midnight limit). The ERROR names the limit it broke as a clock time.
  describe.each([
    {
      name: 'ends past midnight', fencers: 100, opens: clock(19, 10),
      // Pools 19:10–20:59, DE 21:30–00:30.
      message: 'late-evt DE: ends at 00:30 past the last-phase limit 00:00',
    },
    {
      name: 'starts at or after 22:00', fencers: 24, opens: clock(20, 10),
      // Pools 20:10–21:36, DE 22:10–23:30.
      message: 'late-evt DE: ends at 23:30 past day-end 22:00',
    },
  ])('a pinned last phase that $name', ({ fencers, opens, message }) => {
    const pinnedRun = () => scheduleAllConcurrent([lateEventCompetition(fencers)], windowFrom(opens), [
      { competition_id: 'late-evt', day: 0, start_time: opens, strip_count: 20 },
    ])

    it('keeps the SAME_DAY_VIOLATION ERROR, naming the limit as a clock time, and the unclaimed pin', () => {
      const result = pinnedRun()
      const errors = result.bottlenecks.filter((b) =>
        b.rule === BottleneckRule.PHASE_OVERRUNS_DAY_END && b.severity === BottleneckSeverity.ERROR)

      expect(errors.map((b) => b.message)).toEqual([message])
      expect(result.bottlenecks.filter((b) => b.cause === BottleneckCause.PINNED_UNCLAIMED)).toHaveLength(1)
    })

    it('draws no overrun WARN for the same event', () => {
      expect(overrunWarnings(pinnedRun().bottlenecks)).toEqual([])
    })
  })

  // The start edge: a last phase may start before, not at, the hard end. On a
  // 24-fencer event the DE starts 120 min after the window opens.
  describe('the start edge', () => {
    // guard: opens 20:00 – pools 20:00–21:26, so the DE would start at 22:00 sharp.
    it('drops a last phase that would start exactly at 22:00', () => {
      expectDroppedAt(runFrom(clock(20), lateEventCompetition(24)), Phase.DE)
    })

    it('places a last phase that starts at 21:55, 5 minutes before the hard end', () => {
      const result = runFrom(clock(19, 55), lateEventCompetition(24))
      const s = result.schedule['late-evt']

      expect(s.de_start).toBe(clock(21, 55))
      expect(s.de_end).toBe(clock(23, 15))
      expect(failedAttempts(result)).toEqual([])
      expect(overrunWarnings(result.bottlenecks)).toHaveLength(1)
    })
  })

  // The end edge: a last phase may end at midnight, not a minute after.
  describe('the midnight edge', () => {
    it('places a last phase that ends exactly at midnight, with a WARN', () => {
      const result = runFrom(clock(18, 40), lateEventCompetition(100))

      expect(result.schedule['late-evt'].de_end).toBe(MIDNIGHT)
      expect(overrunWarnings(result.bottlenecks).map((b) => b.delay_mins)).toEqual([120])
    })

    // guard: one minute later the DE would end at 00:01.
    it('drops a last phase that would end one minute past midnight', () => {
      expectDroppedAt(runFrom(clock(18, 41), lateEventCompetition(100)), Phase.DE)
    })
  })

  // guard: opens 20:10 – pools 20:10–21:36, so the DE would start 22:10 and
  // end 23:30, before midnight but after the hard end.
  it('drops an event whose last phase would start after 22:00', () => {
    expectDroppedAt(runFrom(clock(20, 10), lateEventCompetition(24)), Phase.DE)
  })

  // guard: opens 19:10 – pools 19:10–20:59, DE would run 21:30–00:30.
  it('drops an event whose last phase would end past midnight', () => {
    expectDroppedAt(runFrom(clock(19, 10), lateEventCompetition(100)), Phase.DE)
  })

  // guard: opens 20:50 – pools would end 22:16. Pools are never the last phase.
  it('drops an event whose pools would end past 22:00', () => {
    expectDroppedAt(runFrom(clock(20, 50), lateEventCompetition(24)), Phase.POOLS)
  })

  // guard: opens 19:20 – pools 19:20–21:00, prelims would run 21:30–22:30.
  it('drops a staged event whose prelims would end past 22:00', () => {
    expectDroppedAt(runFrom(clock(19, 20), lateEventCompetition(64, DeMode.STAGED)), Phase.DE_PRELIMS)
  })

  // guard: opens 17:30 – the DE would end 20:50, past a latest_end of 20:30.
  it('drops an event whose last phase would end past a latest_end set below 22:00', () => {
    const competition = { ...lateEventCompetition(24), latest_end: clock(20, 30) }
    expectDroppedAt(runFrom(clock(17, 30), competition), Phase.DE)
  })

  /**
   * The miss-defer path: the last phase finds no strips at its ready time and
   * defers behind another event's DE. The two events differ in gender, weapon
   * and category, or the same-population check drops both. The day opens 16:40.
   */
  describe('a last phase deferred behind another event\'s DE', () => {
    function twoEventRun(foilFencers: number, epeeFencers: number) {
      const a = { ...lateEventCompetition(foilFencers), id: 'A', gender: Gender.MEN, category: Category.DIV1, weapon: Weapon.FOIL }
      const b = { ...lateEventCompetition(epeeFencers), id: 'B', gender: Gender.WOMEN, category: Category.JUNIOR, weapon: Weapon.EPEE }
      return scheduleAllConcurrent([a, b], windowFrom(clock(16, 40)))
    }

    it('is placed past 22:00 when the deferred start is before the hard end, with one WARN', () => {
      // A (24): DE 18:40–20:00. B (100): pools to 18:29, DE deferred behind A's
      // DE to 20:00 and run to 23:00.
      const result = twoEventRun(24, 100)
      const b = result.schedule['B']

      expect(result.bottlenecks.filter((x) => x.rule === BottleneckRule.PHASE_DEFERRED).map((x) => x.message))
        .toEqual(['B DE: deferred to 1200 (reason: TIME)'])
      expect([b.de_start, b.de_end]).toEqual([clock(20), clock(23)])
      expect(overrunWarnings(result.bottlenecks).map((x) => x.subjects)).toEqual([['B']])
      expect(result.schedule['A'].de_end).toBe(clock(20))
    })

    // guard: with both events at 100 the strips free only at 23:20, after the
    // hard end, so B's DE neither defers nor fits and B is dropped at its DE
    // on the first attempt (its retry then fails at the pools).
    it('fails when the strips free only at or after 22:00, and the event is dropped', () => {
      const result = twoEventRun(100, 100)

      expect(result.schedule['A'].de_end).toBe(clock(23, 20))
      expect(result.schedule['B']).toBeUndefined()
      const failures = failedAttempts(result).filter((x) => x.competition_id === 'B')
      expect(failures.map((x) => x.cause)).toEqual([
        BottleneckCause.DEADLINE_BREACH,
        BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      ])
      expect(failures[0].message).toMatch(/failed at DE\b/)
    })
  })
})

describe('dayMidnight, the last-phase limit on the scheduler axes', () => {
  it('with a dayConfigs window, is the next multiple of 1440 above the day\'s start', () => {
    expect([0, 1, 2].map((d) => dayMidnight(d, appAxisConfig(3)))).toEqual([MIDNIGHT, 2 * MIDNIGHT, 3 * MIDNIGHT])
  })

  it('without dayConfigs, is dayStart + (1440 − DAY_START_MINS)', () => {
    expect([0, 1, 2].map((d) => dayMidnight(d, makeConfig({ days_available: 3 })))).toEqual([900, 2340, 3780])
    expect(dayMidnight(1, makeConfig({ days_available: 3, DAY_START_MINS: 480 }))).toBe(1440 + 960)
  })
})

describe('lastPhaseOverrunWarnings', () => {
  function ending(id: string, day: number, deEnd: number | null, r16End: number | null = null): ScheduleResult {
    return { ...makeScheduleResult(id, day), de_end: deEnd, de_round_of_16_end: r16End }
  }

  // Fallback axis: hard ends at 780 (day 0) and 2220 (day 1).
  const fallback = makeConfig({ days_available: 2 })
  // Inserted out of (day, id) order, so the ordering is the function's.
  const schedule: Record<string, ScheduleResult> = {
    'B-STAGED': ending('B-STAGED', 1, null, 2250),
    'Z-SINGLE': ending('Z-SINGLE', 0, 810),
    'A-SINGLE': ending('A-SINGLE', 0, 800),
    'C-AT-HARD-END': ending('C-AT-HARD-END', 0, 780),
    'D-UNPLACED': ending('D-UNPLACED', 0, null),
  }

  it('names each event whose last phase ends past its day\'s hard end, reading the R16 end when staged', () => {
    const warnings = lastPhaseOverrunWarnings(schedule, fallback)

    expect(warnings.map(({ subjects, day, delay_mins }) => ({ subjects, day, delay_mins }))).toEqual([
      { subjects: ['A-SINGLE'], day: 0, delay_mins: 20 },
      { subjects: ['Z-SINGLE'], day: 0, delay_mins: 30 },
      { subjects: ['B-STAGED'], day: 1, delay_mins: 30 },
    ])
  })

  it('names the event through labelOf and gives its finish as a clock time', () => {
    // 800 on day 0 of the fallback axis is 22:20 (minute 0 stands for 9:00).
    const warnings = lastPhaseOverrunWarnings({ 'A-SINGLE': schedule['A-SINGLE'] }, fallback, (id) => `Label ${id}`)

    expect(warnings).toHaveLength(1)
    expect(warnings[0].message).toContain('Label A-SINGLE')
    expect(warnings[0].message).toContain('22:20')
  })

  it('reads the clock on the app axis', () => {
    const warnings = lastPhaseOverrunWarnings({ X: ending('X', 1, MIDNIGHT + 23 * 60 + 15) }, appAxisConfig(2))

    expect(warnings.map((b) => b.delay_mins)).toEqual([75])
    expect(warnings[0].message).toContain('23:15')
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
    // Clock times on the fallback axis, where minute 0 of each day is 9:00:
    // 700 is 20:40 on day 1 and 3500 is 19:20 on day 3 (2880 + 620).
    expect(late[0].message).toMatch(/^Day 1 ends at 20:40, /)
    expect(late[1].message).toMatch(/^Day 3 ends at 19:20, /)
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
    // The one window is on day index 0, so its clock is the scheduler minute.
    const clock = `${String(Math.floor(s.de_total_end! / 60)).padStart(2, '0')}:${String(s.de_total_end! % 60).padStart(2, '0')}`
    expect(late[0].message).toContain(`ends at ${clock},`)
    checkInvariants(late[0], ['late-evt'], new Set())
  })

  describe('day and clock times (016 Task A)', () => {
    it('sets day to the late day\'s 0-based index', () => {
      const [warn] = lateDayWarnings(postScheduleWarnings({ 'X-LATE': finishing('X-LATE', 2, 4080, 3800) }, appAxisConfig(3)))

      expect(warn.day).toBe(2)
    })

    it('reads clock times on the app axis for a day-index-2 overrun', () => {
      // Day index 2's target is 4020 (19:00 after 2880 + 1140), and finish 4080 is 20:00.
      const [warn] = lateDayWarnings(postScheduleWarnings({ 'X-LATE': finishing('X-LATE', 2, 4080, 3800) }, appAxisConfig(3)))

      expect(warn.message).toBe('Day 3 ends at 20:00, 60 min past its target 19:00: X-LATE finish after it')
    })

    // No dayConfigs: day index 2 starts at 2880 and minute 0 stands for 9:00,
    // so target 3480 is 19:00 and finish 3500 is 19:20.
    const fallbackLate = () => {
      const config = makeConfig({ days_available: 3 })
      expect(config.DAY_START_MINS).toBe(540)
      return lateDayWarnings(postScheduleWarnings({ 'E-LATE': finishing('E-LATE', 2, 3500, 3300) }, config))[0]
    }

    it('reads clock times on the fallback axis, where minute 0 of a day stands for DAY_START_MINS', () => {
      expect(fallbackLate().message).toBe('Day 3 ends at 19:20, 20 min past its target 19:00: E-LATE finish after it')
    })

    it('sets day on the fallback axis too', () => {
      expect(fallbackLate().day).toBe(2)
    })
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

  function firstLastWarnings(schedule: Record<string, ScheduleResult>, daysAvailable: number): Bottleneck[] {
    return postScheduleWarnings(schedule, makeConfig({ days_available: daysAvailable }))
      .filter((b) => FIRST_LAST_RULES.includes(b.rule))
  }

  function firstLastRules(schedule: Record<string, ScheduleResult>, daysAvailable: number): string[] {
    return firstLastWarnings(schedule, daysAvailable).map((b) => b.rule)
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
    // 4 days available, day 3 empty: days 0–2 are used, so day 2 is the last.
    expect(
      firstLastWarnings(daysOfLength({ 0: 300, 1: 400, 2: 450 }), 4).map(({ rule, day }) => ({ rule, day })),
    ).toEqual([{ rule: BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE, day: 2 }])
  })

  it('takes the shortest middle day from the used days only, skipping an empty one', () => {
    // Day 1 is empty, so the shortest used middle day is day 2 at 400. Both
    // edges (300) are shorter. An empty day counted as 0 would make both warn.
    expect(firstLastRules(daysOfLength({ 0: 300, 2: 400, 3: 300 }), 4)).toEqual([])
  })

  it('stays silent with fewer than 3 used days, however long they run', () => {
    expect(firstLastRules(daysOfLength({ 0: 700, 3: 700 }), 4)).toEqual([])
  })

  it('sets day to the first used day, not day 0, on the first-day finding', () => {
    // Day 0 is empty, so days 1–3 are used and day 1 is the first, as long as
    // the shortest middle day (500).
    const schedule = daysOfLength({ 1: 500, 2: 500, 3: 400 })

    expect(firstLastWarnings(schedule, 4).map(({ rule, day }) => ({ rule, day }))).toEqual([
      { rule: BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE, day: 1 },
    ])
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

/**
 * `clockOnDay(t, d, config)` (016 Task A): an absolute scheduler-axis minute on
 * day d as a zero-padded 24-hour `HH:MM`, measured from the day's own start. With
 * `dayConfigs` the app axis applies (t - d × DAY_AXIS_SPACING_MINS). Without
 * them minute 0 of each day stands for `DAY_START_MINS`, so the clock is
 * t - dayStart(d) + DAY_START_MINS.
 */
describe('clockOnDay', () => {
  const appAxis = appAxisConfig(3)
  const fallback = makeConfig({ days_available: 3 })

  it.each([
    { t: 4080, d: 2, clock: '20:00' },
    { t: 4020, d: 2, clock: '19:00' },
    { t: 1440 + 65, d: 1, clock: '01:05' },
    { t: 540, d: 0, clock: '09:00' },
    { t: 4080.6, d: 2, clock: '20:01' },
    { t: 1440 + 1500, d: 1, clock: '01:00' },
  ])('app axis: minute $t on day $d is $clock', ({ t, d, clock }) => {
    expect(clockOnDay(t, d, appAxis)).toBe(clock)
  })

  it.each([
    { t: 3500, d: 2, clock: '19:20' },
    { t: 3480, d: 2, clock: '19:00' },
    { t: 0, d: 0, clock: '09:00' },
    { t: 1440 + 60, d: 1, clock: '10:00' },
  ])('fallback axis: minute $t on day $d is $clock', ({ t, d, clock }) => {
    expect(clockOnDay(t, d, fallback)).toBe(clock)
  })

  it('fallback axis: a non-default DAY_START_MINS shifts the clock', () => {
    const cfg = makeConfig({ days_available: 3, DAY_START_MINS: 480 })
    expect(clockOnDay(0, 0, cfg)).toBe('08:00')
    expect(clockOnDay(1440 + 60, 1, cfg)).toBe('09:00')
  })
})
