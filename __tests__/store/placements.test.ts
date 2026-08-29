import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore, type StoreState } from '../../src/store/store.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import * as schedulerModule from '../../src/engine/scheduler.ts'
import { PlacementSource } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'

const { scheduleAll } = schedulerModule

// The store surface below (PlacementsSlice, DismissalsSlice) is added by T008.
// Typing the cast this way means every access to a not-yet-existing member is
// a deliberate, typed reference rather than a stray `any`. The `as unknown as
// FutureState` cast absorbs the type mismatch, so this file compiles clean
// today — the expected TDD failures are runtime TypeErrors (calling a member
// that doesn't exist yet on the real store), not tsc errors.
interface PlacementsSlice {
  placements: Record<string, Placement>
  setPlacementsFromAuto: (placements: Record<string, Placement>) => void
  updatePlacement: (id: string, partial: Partial<Placement>) => void
  removePlacement: (id: string) => void
  clearPlacements: () => void
  setPinned: (id: string, pinned: boolean) => void
}

interface DismissalsSlice {
  dismissedFindings: Record<string, true>
  dismissFinding: (id: string) => void
  undismissFinding: (id: string) => void
}

type FutureState = StoreState & PlacementsSlice & DismissalsSlice

function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

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

// Smallest drift-ledger scenario (12 events, all scheduled per research.md D7's
// SCHEDULED_FLOORS) — realistic input for exercising runScheduleAll's extraction.
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

// Belt-and-suspenders for the scheduleAll spy below: if an assertion throws
// before its inline mockRestore() runs, this still tears the mock down before
// the next test.
afterEach(() => {
  vi.restoreAllMocks()
})

describe('placementsSlice', () => {
  describe('initial state', () => {
    it('placements is an empty object', () => {
      expect(futureState().placements).toEqual({})
    })
  })

  describe('setPlacementsFromAuto', () => {
    it('writes entries forced to source auto and pinned false, ignoring the input values', () => {
      futureState().setPlacementsFromAuto({
        A: makePlacement({ source: PlacementSource.MANUAL, pinned: true, day: 1, start_time: 600 }),
      })

      const placement = futureState().placements.A
      expect(placement).toEqual(makePlacement({ day: 1, start_time: 600, source: 'auto', pinned: false }))
    })

    it('replaces the whole map rather than merging', () => {
      futureState().setPlacementsFromAuto({ A: makePlacement() })
      futureState().setPlacementsFromAuto({ B: makePlacement() })

      const state = futureState()
      expect(Object.keys(state.placements)).toEqual(['B'])
    })
  })

  describe('updatePlacement', () => {
    it('merges the partial and forces source manual, pinned true', () => {
      futureState().setPlacementsFromAuto({ A: makePlacement({ day: 0, strip_count: 4 }) })

      futureState().updatePlacement('A', { day: 2 })

      const placement = futureState().placements.A
      expect(placement).toEqual(makePlacement({ day: 2, strip_count: 4, source: 'manual', pinned: true }))
    })
  })

  describe('setPinned', () => {
    it('toggles pinned without changing source', () => {
      futureState().setPlacementsFromAuto({ A: makePlacement() })

      futureState().setPinned('A', true)
      expect(futureState().placements.A).toEqual(makePlacement({ pinned: true }))

      futureState().setPinned('A', false)
      expect(futureState().placements.A).toEqual(makePlacement({ pinned: false }))
    })
  })

  describe('removePlacement', () => {
    it('deletes only the named entry', () => {
      futureState().setPlacementsFromAuto({ A: makePlacement(), B: makePlacement() })

      futureState().removePlacement('A')

      const state = futureState()
      expect(state.placements.A).toBeUndefined()
      expect(state.placements.B).toBeDefined()
    })
  })

  describe('clearPlacements', () => {
    it('resets the map to empty', () => {
      futureState().setPlacementsFromAuto({ A: makePlacement(), B: makePlacement() })

      futureState().clearPlacements()

      expect(futureState().placements).toEqual({})
    })
  })

  describe('removeCompetition', () => {
    it('deletes the competition placement in the same action, leaving other placements intact', () => {
      useStore.getState().selectCompetitions(['CDT-M-FOIL-IND', 'JR-W-EPEE-IND'])
      futureState().setPlacementsFromAuto({
        'CDT-M-FOIL-IND': makePlacement({ day: 0 }),
        'JR-W-EPEE-IND': makePlacement({ day: 1 }),
      })

      useStore.getState().removeCompetition('CDT-M-FOIL-IND')

      const state = futureState()
      expect(state.selectedCompetitions['CDT-M-FOIL-IND']).toBeUndefined()
      expect(state.placements['CDT-M-FOIL-IND']).toBeUndefined()
      expect(state.placements['JR-W-EPEE-IND']).toBeDefined()
    })
  })
})

// These tests encode DismissalsSlice as T008 leaves it: an unguarded,
// state-only action. US3/T021 adds the advisory-only guard (finding must
// still be an active advisory to be dismissable) and will revisit this file.
describe('dismissalsSlice', () => {
  describe('initial state', () => {
    it('dismissedFindings is an empty object', () => {
      expect(futureState().dismissedFindings).toEqual({})
    })
  })

  describe('dismissFinding', () => {
    it('marks the finding id dismissed', () => {
      futureState().dismissFinding('same-population:A+B')

      expect(futureState().dismissedFindings).toEqual({ 'same-population:A+B': true })
    })
  })

  describe('undismissFinding', () => {
    it('clears a dismissed finding id', () => {
      futureState().dismissFinding('same-population:A+B')

      futureState().undismissFinding('same-population:A+B')

      expect(futureState().dismissedFindings).toEqual({})
    })
  })
})

describe('staleness removal', () => {
  it('drops analysisStale, scheduleStale, markStale, and clearStale from the store', () => {
    const state = useStore.getState()
    expect('analysisStale' in state).toBe(false)
    expect('scheduleStale' in state).toBe(false)
    expect('markStale' in state).toBe(false)
    expect('clearStale' in state).toBe(false)
  })
})

describe('scheduleSlice removal', () => {
  it('drops the entire schedule slice — scheduleResults, bottlenecks, refRequirementsByDay, and their setters', () => {
    const state = useStore.getState()
    expect('scheduleResults' in state).toBe(false)
    expect('bottlenecks' in state).toBe(false)
    expect('refRequirementsByDay' in state).toBe(false)
    expect('setScheduleResults' in state).toBe(false)
    expect('clearSchedule' in state).toBe(false)
  })
})

describe('analysisSlice shrink', () => {
  it('drops analysis result fields and actions while keeping flighting accept/reject intent', () => {
    const state = useStore.getState()
    expect('validationErrors' in state).toBe(false)
    expect('warnings' in state).toBe(false)
    expect('suggestions' in state).toBe(false)
    expect('flightingSuggestions' in state).toBe(false)
    expect('setAnalysisResults' in state).toBe(false)
    expect('clearAnalysis' in state).toBe(false)
    // Accept/reject intent for flighting suggestions is user intent, not derived — it stays.
    expect('flightingSuggestionStates' in state).toBe(true)
    expect('acceptFlightingSuggestion' in state).toBe(true)
    expect('rejectFlightingSuggestion' in state).toBe(true)
  })
})

describe('runScheduleAll (store inversion)', () => {
  it('writes an auto placement per scheduled event, extracted from scheduleAll output', () => {
    setupB5()
    const { config, competitions } = buildTournamentConfig(useStore.getState())
    const expected = scheduleAll(competitions, config)
    const scheduledIds = Object.keys(expected.schedule)
    expect(scheduledIds.length).toBeGreaterThan(0)

    runScheduleAll(useStore.getState())

    const state = futureState()
    expect(Object.keys(state.placements).sort()).toEqual(scheduledIds.sort())
    for (const id of scheduledIds) {
      const result = expected.schedule[id]
      expect(state.placements[id]).toEqual({
        day: result.assigned_day,
        start_time: result.pool_start,
        strip_count: result.pool_strip_count,
        strips: null,
        source: 'auto',
        pinned: false,
      })
    }
  })

  it('does not write placements when scheduling throws', () => {
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(1)
    useStore.getState().setStrips(4)
    useStore.getState().selectCompetitions(['CDT-M-FOIL-IND'])
    useStore.getState().updateCompetition('CDT-M-FOIL-IND', { fencer_count: 24 })

    // Force the failure path directly rather than hunting for engine inputs
    // that happen to throw today — the store-level contract under test is
    // "on any scheduling exception, placements are left untouched."
    const spy = vi.spyOn(schedulerModule, 'scheduleAll').mockImplementation(() => {
      throw new Error('boom')
    })

    expect(() => runScheduleAll(useStore.getState())).not.toThrow()
    expect(futureState().placements).toEqual({})

    spy.mockRestore()
  })
})
