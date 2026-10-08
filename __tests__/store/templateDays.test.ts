import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildPinnedPlacements } from '../../src/store/buildConfig.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { DAY_END_MINS, DAY_START_MINS } from '../../src/engine/constants.ts'
import { PlacementSource, TournamentType } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'

// `applyTemplate` raises the board's days to the template's hard-rule minimum
// for the board's type, and never lowers them (019 R1, R1a). Templates never
// set the type (R2) – that guard is Header.test.tsx's "choosing a template …
// leaves tournament_type unchanged".

const DEFAULT_WINDOW = { day_start_time: DAY_START_MINS, day_end_time: DAY_END_MINS }

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

/** A board of `type` with `days` days, each on the default window (`setDays`). */
function board(type: TournamentType, days: number): void {
  const s = useStore.getState()
  s.setTournamentType(type)
  s.setDays(days)
}

describe('applyTemplate raises the day count', () => {
  // NAC Cadet/Junior needs 4 days where Group 1 is hard and 2 where it is soft.
  it.each([
    { type: TournamentType.NAC, days: 4 },
    { type: TournamentType.SYC, days: 4 },
    { type: TournamentType.SJCC, days: 4 },
    { type: TournamentType.ROC, days: 3 },
    { type: TournamentType.RYC, days: 3 },
    { type: TournamentType.RJCC, days: 3 },
  ])('NAC Cadet/Junior on a 3-day $type board ends at $days days and keeps the type', ({ type, days }) => {
    board(type, 3)

    useStore.getState().applyTemplate('NAC Cadet/Junior')

    expect(useStore.getState().days_available).toBe(days)
    expect(useStore.getState().tournament_type).toBe(type)
  })

  it('raises a 2-day RYC board to 3 for NAC Vet/Div1/Junior, the regional column', () => {
    board(TournamentType.RYC, 2)

    useStore.getState().applyTemplate('NAC Vet/Div1/Junior')

    expect(useStore.getState().days_available).toBe(3)
  })

  it('raises a 2-day NAC board to 3 for Junior Olympics', () => {
    board(TournamentType.NAC, 2)

    useStore.getState().applyTemplate('Junior Olympics')

    expect(useStore.getState().days_available).toBe(3)
  })

  // The custom window sits on the last existing day, so an added day that copied
  // the last window instead of taking the default would show it.
  it('keeps a custom window across the raise and gives the added day the default window', () => {
    board(TournamentType.NAC, 3)
    const custom = { day_start_time: 480, day_end_time: 1200 }
    useStore.getState().updateDayConfig(2, custom)

    useStore.getState().applyTemplate('NAC Cadet/Junior')

    expect(useStore.getState().dayConfigs).toEqual([DEFAULT_WINDOW, DEFAULT_WINDOW, custom, DEFAULT_WINDOW])
  })

  it('gives a fresh store (3 days, no windows) 4 days and 4 windows for NAC Cadet/Junior', () => {
    useStore.getState().applyTemplate('NAC Cadet/Junior')

    expect(useStore.getState().days_available).toBe(4)
    expect(useStore.getState().dayConfigs).toEqual([DEFAULT_WINDOW, DEFAULT_WINDOW, DEFAULT_WINDOW, DEFAULT_WINDOW])
  })

  /** A 4-day NAC board run on NAC Cadet/Junior, with the event on the last day pinned and its days lowered to 3. */
  function pinLoweredAway(): { id: string; pin: Placement } {
    board(TournamentType.NAC, 4)
    useStore.getState().setStrips(80)
    useStore.getState().applyTemplate('NAC Cadet/Junior')
    runScheduleAll()
    const onLastDay = Object.entries(useStore.getState().placements).find(([, p]) => p.day === 3)
    expect(onLastDay).toBeDefined()
    const [id] = onLastDay!
    useStore.getState().setPinned(id, true)
    const pin = useStore.getState().placements[id]
    useStore.getState().setDays(3)
    expect(buildPinnedPlacements(useStore.getState()).map((p) => p.competition_id)).not.toContain(id)
    return { id, pin }
  }

  // 020 R4 supersedes 019 decision 10 whenever a run happens between the lower
  // and the raise, which automatic re-run makes the default: the run drops the
  // pin on the removed day and re-places its event, as pressing Auto-assign
  // does (`runActions.test.ts` already proves the drop).
  it('loses a pin left on a lowered-away day when a run happens before the raise, and the re-pick does not bring it back', () => {
    const { id, pin } = pinLoweredAway()

    runScheduleAll()

    const replaced = useStore.getState().placements[id]
    expect(replaced.source).toBe(PlacementSource.AUTO)
    expect(replaced.pinned).toBe(false)
    expect(replaced.day).toBeLessThan(3)

    // Re-applying the template is what picking another one and back does.
    useStore.getState().applyTemplate('NAC Cadet/Junior')
    expect(buildPinnedPlacements(useStore.getState()).map((p) => p.competition_id)).not.toContain(id)
    runScheduleAll()

    expect(useStore.getState().placements[id]).not.toBe(pin)
    expect(useStore.getState().placements[id].pinned).toBe(false)
  })

  // Decision 10, as it holds with no run between the lower and the raise
  // (automatic re-run off): `setDays` keeps placements and
  // `buildPinnedPlacements` skips a pin whose day is out of range, so a raise
  // brings that day back and the next run honours the pin the organizer left there.
  it('with no run between the lower and the raise (automatic re-run off), the pin comes back', () => {
    const { id, pin } = pinLoweredAway()

    // Re-applying the template is what picking another one and back does.
    useStore.getState().applyTemplate('NAC Cadet/Junior')
    expect(buildPinnedPlacements(useStore.getState()).map((p) => p.competition_id)).toContain(id)
    runScheduleAll()

    expect(useStore.getState().placements[id]).toBe(pin)
    expect(useStore.getState().lastRun?.events[id]?.result.assigned_day).toBe(3)
  })
})

describe('applyTemplate leaves a board with enough days alone', () => {
  it('keeps a 4-day board’s days and its windows by reference', () => {
    board(TournamentType.NAC, 4)
    const before = useStore.getState().dayConfigs

    useStore.getState().applyTemplate('NAC Cadet/Junior')

    expect(useStore.getState().days_available).toBe(4)
    expect(useStore.getState().dayConfigs).toBe(before)
  })

  it('keeps a 5-day board at 5', () => {
    board(TournamentType.NAC, 5)

    useStore.getState().applyTemplate('NAC Vet/Div1/Junior')

    expect(useStore.getState().days_available).toBe(5)
  })

  it('keeps a fresh store’s 3 days and empty windows for RYC Weekend', () => {
    const before = useStore.getState().dayConfigs

    useStore.getState().applyTemplate('RYC Weekend')

    expect(useStore.getState().days_available).toBe(3)
    expect(useStore.getState().dayConfigs).toBe(before)
    expect(before).toEqual([])
  })

  // 4 is the table's largest minimum, so every template at every type has at
  // most 4 to ask for – a raise that set days to the minimum would lower most.
  it('never lowers days, for any template at any type', () => {
    const lowered: string[] = []
    for (const name of Object.keys(TEMPLATES)) {
      for (const type of Object.values(TournamentType)) {
        useStore.setState(useStore.getInitialState(), true)
        board(type, 4)
        useStore.getState().applyTemplate(name)
        const days = useStore.getState().days_available
        if (days !== 4) lowered.push(`${name} at ${type}: ${days}`)
      }
    }
    expect(lowered).toEqual([])
  })
})
