import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { PlacementSource } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import {
  selectDerivedSchedule,
  selectDerivedFindings,
  selectDerivedRefRequirements,
} from '../../src/store/derived.ts'

function makePlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    day: 0,
    start_time: 480,
    strip_count: 4,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
    ...overrides,
  }
}

// Smallest drift-ledger scenario (12 events) — realistic roster for exercising
// derived selectors against real catalogue data.
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
  useStore.setState(useStore.getInitialState())
})

describe('selectDerivedSchedule', () => {
  it('derives a ScheduleResult per placed event, carrying the placement day', () => {
    setupB5()
    const ids = Object.keys(SCENARIOS.B5.fencerCounts)
    const placements: Record<string, Placement> = {}
    ids.forEach((id, i) => {
      placements[id] = makePlacement({ day: i % 3, start_time: 480, strip_count: 4 })
    })
    useStore.getState().setPlacementsFromAuto(placements)

    const schedule = selectDerivedSchedule(useStore.getState())
    for (const id of ids) {
      expect(schedule.events[id]).toBeDefined()
      expect(schedule.events[id].result.assigned_day).toBe(placements[id].day)
    }
  })

  it('omits events with no placement', () => {
    setupB5()
    const schedule = selectDerivedSchedule(useStore.getState())
    expect(Object.keys(schedule.events)).toEqual([])
  })

  it('reflects a placement update immediately, without a fresh scheduleAll run', () => {
    setupB5()
    const id = 'JR-M-EPEE-IND'
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 0 }) })
    expect(selectDerivedSchedule(useStore.getState()).events[id].result.assigned_day).toBe(0)

    useStore.getState().updatePlacement(id, { day: 2 })

    expect(selectDerivedSchedule(useStore.getState()).events[id].result.assigned_day).toBe(2)
  })

  it('flags day_out_of_range for a placement beyond days_available, while still deriving blocks', () => {
    setupB5() // days_available = 3
    const id = 'JR-M-EPEE-IND'
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 5 }) })

    const view = selectDerivedSchedule(useStore.getState()).events[id]
    expect(view.day_out_of_range).toBe(true)
    expect(view.result.pool_start).not.toBeNull()
  })
})

describe('memoization', () => {
  it('returns the identical reference across calls when nothing changed', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })

    const first = selectDerivedSchedule(useStore.getState())
    const second = selectDerivedSchedule(useStore.getState())
    expect(second).toBe(first)
  })

  it('ignores unrelated store changes — same output reference even after an unrelated set() call', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    // A store update to a field selectDerivedSchedule does not depend on still
    // replaces the top-level state object reference in Zustand — memoization
    // must be keyed on the relevant slices, not on that identity.
    useStore.getState().setLayoutMode('kitchen-sink')
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).toBe(first)
  })

  it('returns a new reference once a depended-on input changes', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    useStore.getState().updatePlacement('JR-M-EPEE-IND', { day: 1 })
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).not.toBe(first)
  })

  it('recomputes when a competition config changes', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).not.toBe(first)
    expect(second.events['JR-M-EPEE-IND'].result.entry_fencer_count).toBe(40)
  })

  it('memoizes selectDerivedFindings and selectDerivedRefRequirements independently of each other', () => {
    setupB5()
    const f1 = selectDerivedFindings(useStore.getState())
    const f2 = selectDerivedFindings(useStore.getState())
    expect(f2).toBe(f1)

    const r1 = selectDerivedRefRequirements(useStore.getState())
    const r2 = selectDerivedRefRequirements(useStore.getState())
    expect(r2).toBe(r1)
  })
})

describe('selectDerivedFindings', () => {
  it('returns validation errors and analysis output shaped from current inputs', () => {
    setupB5()
    const findings = selectDerivedFindings(useStore.getState())
    expect(Array.isArray(findings.validationErrors)).toBe(true)
    expect(Array.isArray(findings.analysis.warnings)).toBe(true)
    expect(Array.isArray(findings.analysis.suggestions)).toBe(true)
  })

  it('uses a placement day for day assignment when present, falling back to round-robin otherwise', () => {
    // Two 1-pool events (fencer_count <= 9), 1 strip total: any single event
    // alone (1 pool) does not exceed capacity, but two on the same day (2
    // pools) does — day 1: ... capacity warning below.
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(3)
    useStore.getState().setStrips(1)
    useStore.getState().selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 8 })
    useStore.getState().updateCompetition('JR-W-EPEE-IND', { fencer_count: 8 })

    // No placements: round-robin fallback (i % days_available) puts these two
    // events on different days (0 and 1) — no capacity warning.
    const noPlacements = selectDerivedFindings(useStore.getState())
    expect(noPlacements.analysis.warnings.some(w => w.message.includes('Day'))).toBe(false)

    // Both manually placed on the same day — placement day wins over the
    // round-robin fallback, producing the capacity warning.
    useStore.getState().setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 0 }),
      'JR-W-EPEE-IND': makePlacement({ day: 0 }),
    })
    const withPlacements = selectDerivedFindings(useStore.getState())
    expect(withPlacements.analysis.warnings.some(w => w.message.includes('Day 1:'))).toBe(true)
  })
})

describe('selectDerivedRefRequirements', () => {
  it('derives ref requirements from placements, not from an internal scheduleAll run', () => {
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(3)
    useStore.getState().setStrips(20)
    useStore.getState().selectCompetitions(['JR-M-EPEE-IND'])
    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })

    // Force the placement onto day 2 — scheduleAll's own day-assignment
    // algorithm would very likely pick day 0 for a lone event, so demand
    // showing up on day 2 only is proof this reads placements, not a fresh run.
    useStore.getState().setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 2, start_time: 480, strip_count: 4 }),
    })

    const reqs = selectDerivedRefRequirements(useStore.getState())
    expect(reqs).toHaveLength(3)
    expect(reqs[0].peak_total_refs).toBe(0)
    expect(reqs[1].peak_total_refs).toBe(0)
    expect(reqs[2].peak_total_refs).toBeGreaterThan(0)
  })

  it('returns one zeroed entry per day when there are no placements', () => {
    setupB5()
    const reqs = selectDerivedRefRequirements(useStore.getState())
    expect(reqs).toHaveLength(3)
    for (const r of reqs) {
      expect(r.peak_total_refs).toBe(0)
      expect(r.peak_saber_refs).toBe(0)
    }
  })
})
