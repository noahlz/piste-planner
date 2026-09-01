import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import type { Placement } from '../../src/engine/types.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'

/**
 * User Story 2 (spec.md): a tournament's day hours are honored day by day —
 * events land inside their own day's configured window, narrowing one day's
 * hours moves that day's overflow without perturbing another day's
 * placements, and a day too short for an event leaves it unplaced rather
 * than spilling past the close.
 *
 * These are behavior tests over the store's real path
 * (`buildTournamentConfig` -> `scheduleAll` -> `runScheduleAll`'s clock-time
 * conversion), not axis-literal assertions — contracts/day-axis.md C1's
 * literal-window checks already live in dayAxis.test.ts.
 */

// Real, multi-day, all-scheduled data (12 events, 3 days) — same fixture
// placements.test.ts uses for its C2 round-trip check, so day-hours behavior
// is exercised against a tournament already known to place across days 0-2.
function setupB5(): void {
  const scenario = SCENARIOS.B5
  const state = useStore.getState()
  state.setTournamentType(scenario.tournamentType)
  state.setDays(scenario.days)
  state.setStrips(scenario.strips)
  state.setVideoStrips(scenario.videoStrips)
  state.selectCompetitions(Object.keys(scenario.fencerCounts))
  for (const [id, fencer_count] of Object.entries(scenario.fencerCounts)) {
    useStore.getState().updateCompetition(id, { fencer_count })
  }
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

describe('per-day hours are honored (spec.md User Story 2)', () => {
  it('places every event inside its own day\'s configured window when days have different hours', () => {
    setupB5()
    // Three genuinely different windows, matching dayAxis.test.ts's per-day
    // fixture so the shapes exercised here line up with C1's own coverage.
    useStore.getState().updateDayConfig(0, { day_start_time: 480, day_end_time: 1200 }) // 08:00-20:00
    useStore.getState().updateDayConfig(1, { day_start_time: 540, day_end_time: 1320 }) // 09:00-22:00
    useStore.getState().updateDayConfig(2, { day_start_time: 420, day_end_time: 1080 }) // 07:00-18:00
    const dayConfigsAtScheduling = useStore.getState().dayConfigs

    runScheduleAll(useStore.getState())

    const placements = Object.values(useStore.getState().placements)
    expect(placements.length).toBeGreaterThan(0)

    for (const placement of placements) {
      const window = dayConfigsAtScheduling[placement.day]
      expect(window, `placement day ${placement.day} has no matching dayConfigs entry`).toBeDefined()
      expect(
        placement.start_time,
        `placement on day ${placement.day} starts at ${placement.start_time}, before that day's own start ${window.day_start_time}`,
      ).toBeGreaterThanOrEqual(window.day_start_time)
      expect(
        placement.start_time,
        `placement on day ${placement.day} starts at ${placement.start_time}, at or after that day's own close ${window.day_end_time}`,
      ).toBeLessThan(window.day_end_time)
    }

    // Not vacuous: prove more than one day's window is actually exercised,
    // so this isn't merely re-checking day 0 under three different labels.
    const daysUsed = new Set(placements.map((p) => p.day))
    expect(daysUsed.size, 'expected placements to span more than one day').toBeGreaterThan(1)
  })

  it('narrowing one day moves that day\'s overflow without shifting another day\'s events', () => {
    setupB5()
    // Uniform default hours (store.ts setDays default, 480-1320 on all three
    // days) as the baseline — same shape placements.test.ts's round-trip
    // test uses, known to place across all three days.
    runScheduleAll(useStore.getState())
    const baseline = useStore.getState().placements
    expect(Object.keys(baseline).length).toBeGreaterThan(0)

    const baselineByDay = new Map<number, Record<string, Placement>>()
    for (const [id, placement] of Object.entries(baseline)) {
      const forDay = baselineByDay.get(placement.day) ?? {}
      forDay[id] = placement
      baselineByDay.set(placement.day, forDay)
    }
    expect(baselineByDay.size, 'expected the baseline to use more than one day').toBeGreaterThan(1)

    // Narrow the last day hard enough that it can no longer hold what was
    // assigned to it, without touching the other two days' configs at all.
    const narrowedDay = Math.max(...baselineByDay.keys())
    useStore.getState().updateDayConfig(narrowedDay, { day_start_time: 480, day_end_time: 700 })
    const dayConfigsAfterNarrowing = useStore.getState().dayConfigs

    runScheduleAll(useStore.getState())
    const after = useStore.getState().placements

    // Every day other than the narrowed one: placements are byte-identical
    // to the baseline. This is the assertion that catches a global
    // re-shuffle rather than a localized response to the narrowed day.
    for (const [day, forDay] of baselineByDay) {
      if (day === narrowedDay) continue
      for (const [id, placement] of Object.entries(forDay)) {
        expect(after[id], `event ${id} on untouched day ${day} disappeared after narrowing day ${narrowedDay}`).toBeDefined()
        expect(after[id]).toEqual(placement)
      }
    }

    // The narrowed day itself: whatever remains there fits the new window,
    // and something actually changed for that day's roster (moved off it,
    // shifted within it, or dropped to unplaced) — otherwise the narrowing
    // had no effect and this test would be vacuous.
    const narrowedWindow = dayConfigsAfterNarrowing[narrowedDay]
    let narrowedDayChanged = false
    for (const [id, baselinePlacement] of Object.entries(baselineByDay.get(narrowedDay)!)) {
      const now = after[id]
      if (now === undefined) {
        narrowedDayChanged = true // overflow became unplaced
        continue
      }
      if (now.day !== narrowedDay || now.start_time !== baselinePlacement.start_time) {
        narrowedDayChanged = true // overflow moved to another day, or shifted within this one
      }
      if (now.day === narrowedDay) {
        expect(now.start_time).toBeGreaterThanOrEqual(narrowedWindow.day_start_time)
        expect(now.start_time).toBeLessThan(narrowedWindow.day_end_time)
      }
    }
    expect(narrowedDayChanged, `expected narrowing day ${narrowedDay} to change at least one of its events`).toBe(true)
  })

  it('leaves an event unplaced, rather than spilling past the close, when its day is too short to hold it', () => {
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(1)
    useStore.getState().setStrips(8)
    useStore.getState().setVideoStrips(2)
    useStore.getState().selectCompetitions(['CDT-M-FOIL-IND'])
    useStore.getState().updateCompetition('CDT-M-FOIL-IND', { fencer_count: 24 })
    // 10 minutes: nowhere near enough for a 24-fencer pool round, let alone
    // the DE that follows it.
    useStore.getState().updateDayConfig(0, { day_start_time: 480, day_end_time: 490 })

    // Engine level: the event fails to place. It does not throw, and — since
    // an event only enters `schedule` when its terminal phase actually
    // commits (concurrentScheduler.ts:1108) — an event that can never find a
    // slot in its ten-minute day gets no entry at all, rather than an entry
    // with a start time past the day's close.
    const { config, competitions } = buildTournamentConfig(useStore.getState())
    // Guard against a false pass: if selectCompetitions silently no-op'd on a
    // bad id, competitions would be empty, nothing would schedule, and the
    // schedule-is-undefined assertion below would pass for the wrong reason.
    expect(competitions.some(c => c.id === 'CDT-M-FOIL-IND')).toBe(true)
    let result
    expect(() => { result = scheduleAll(competitions, config) }).not.toThrow()
    expect(result!.schedule['CDT-M-FOIL-IND']).toBeUndefined()

    // Store level: the event lands in the unplaced set (no Placement written),
    // not scheduled past day_end_time.
    runScheduleAll(useStore.getState())
    const state = useStore.getState()
    expect(state.placements['CDT-M-FOIL-IND']).toBeUndefined()
    for (const placement of Object.values(state.placements)) {
      expect(placement.start_time).toBeLessThan(490)
    }
  })
})
