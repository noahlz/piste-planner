/**
 * The drawn model (017 T4, spec §2): one answer to "what does the board show".
 * A run's events are kept, a hand-moved event is derived on its own, any edit
 * to the engine's inputs makes the whole board stale, and only a fresh board
 * counts an unseated block as unplaced.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore, type StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig, buildPinnedPlacements } from '../../src/store/buildConfig.ts'
import { keepRun, type KeptRun } from '../../src/store/keptRun.ts'
import {
  RunState,
  selectAllFindings,
  selectDaySummaries,
  selectDerivedFindings,
  selectDrawnSchedule,
  selectFooterMetrics,
  selectPlacementCounts,
  type DrawnSchedule,
} from '../../src/store/derived.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { unseatedPhases } from '../../src/engine/unseated.ts'
import { DeMode, Weapon } from '../../src/engine/types.ts'
import { SCENARIO_IDS, type ScenarioId } from '../../src/data/tournaments.ts'
import { makePlacement } from '../helpers/factories.ts'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

const store = (): StoreState => useStore.getState()
const drawn = (): DrawnSchedule => selectDrawnSchedule(store())

function runPreset(id: ScenarioId = 'B1'): void {
  applyPreset(id)
  runScheduleAll()
}

function sourcesOf(model: DrawnSchedule): Record<string, string> {
  return Object.fromEntries(Object.entries(model.events).map(([id, e]) => [id, e.source]))
}

/** The kept run, which a test that has just run must have. */
function keptRun(): KeptRun {
  const kept = store().lastRun
  expect(kept, 'the run was kept').not.toBeNull()
  return kept as KeptRun
}

/** The first placed event, by code point, so every test edits the same one. */
function firstPlacedId(): string {
  return Object.keys(store().placements).sort()[0]
}

/** Every placed event as a pin at its current placement, as pinning the whole board would hand the engine. */
function pinsForWholeBoard() {
  const state = store()
  const pinned = Object.fromEntries(
    Object.entries(state.placements).map(([id, p]) => [id, { ...p, pinned: true }]),
  )
  return buildPinnedPlacements({ ...state, placements: pinned })
}

function expectWholeBoardStale(): void {
  const model = drawn()
  expect(model.runState).toBe(RunState.STALE)
  expect(Object.keys(model.events).length).toBeGreaterThan(0)
  for (const [id, event] of Object.entries(model.events)) {
    expect(event.source, id).toBe('derived')
    expect(event.keptStrips, id).toBeNull()
  }
}

describe('after a run', () => {
  it.each(SCENARIO_IDS)('%s keeps every placed event, on the run\'s own result and strips', (id) => {
    runPreset(id)
    const kept = keptRun()
    const model = drawn()

    expect(model.runState).toBe(RunState.FRESH)
    expect(Object.keys(model.events).sort()).toEqual(Object.keys(store().placements).sort())
    for (const [eventId, event] of Object.entries(model.events)) {
      expect(event.source, eventId).toBe('kept')
      expect(event.day_out_of_range, eventId).toBe(false)
      expect(event.result, eventId).toEqual(kept.events[eventId].result)
      for (const phase of kept.events[eventId].phases) {
        expect(event.keptStrips?.[phase.phase], `${eventId} ${phase.phase}`).toEqual(phase.strips)
      }
    }
    for (const block of model.blocks) {
      const phase = kept.events[block.competitionId].phases.find(p => p.phase === block.phase)
      expect(block.strips, `${block.competitionId} ${block.phase}`).toEqual(phase?.strips)
    }
    expect(model.blocks.length).toBe(
      Object.values(kept.events).reduce((n, e) => n + e.phases.length, 0),
    )
    expect(model.unplacedIds.size).toBe(0)
  })
})

describe('a placement edit derives only the event it touches (review focus 1)', () => {
  const PLACEMENT_EDITS: Record<string, (id: string) => void> = {
    'Move day': (id) => {
      const { placements, days_available } = store()
      store().updatePlacement(id, { day: (placements[id].day + 1) % days_available })
    },
    'start_time': (id) => store().updatePlacement(id, { start_time: store().placements[id].start_time + 30 }),
    'strip_count': (id) => store().updatePlacement(id, { strip_count: store().placements[id].strip_count + 1 }),
  }

  it.each(Object.keys(PLACEMENT_EDITS))('%s', (edit) => {
    runPreset()
    const id = firstPlacedId()
    drawn()

    PLACEMENT_EDITS[edit](id)
    const model = drawn()

    const sources = sourcesOf(model)
    expect(model.runState).toBe(RunState.FRESH)
    expect(Object.keys(sources).sort()).toEqual(Object.keys(store().placements).sort())
    expect(sources[id]).toBe('derived')
    expect(model.events[id].keptStrips).toBeNull()
    for (const [other, source] of Object.entries(sources)) {
      if (other !== id) expect(source, other).toBe('kept')
    }
  })

  it('a pin toggle keeps every event and the run\'s entry for the pinned one', () => {
    runPreset()
    const id = firstPlacedId()
    const before = drawn()

    store().setPinned(id, true)
    const model = drawn()

    const everyKept = Object.fromEntries(Object.keys(store().placements).map(placed => [placed, 'kept']))
    expect(model.runState).toBe(RunState.FRESH)
    expect(sourcesOf(model)).toEqual(sourcesOf(before))
    expect(sourcesOf(model)).toEqual(everyKept)
    expect(keptRun().events[id]).toBeDefined()
  })
})

describe('an edit to the engine\'s inputs makes the whole board stale (review focus 1)', () => {
  /** One store action per user-facing input edit (spec §5's stale row). */
  const ACTION_EDITS: Record<string, () => void> = {
    'fencer count': () => {
      const id = firstPlacedId()
      store().updateCompetition(id, { fencer_count: store().selectedCompetitions[id].fencer_count + 10 })
    },
    'flighted': () => store().updateCompetition('D1-M-EPEE-IND', { flighted: true }),
    'deselect': () => store().removeCompetition(firstPlacedId()),
    'a setting': () => store().setDeModeOverride(DeMode.SINGLE_STAGE),
    'day count': () => store().setDays(store().days_available + 1),
    'video count': () => store().setVideoStrips((store().video_strips_total ?? 0) - 2),
  }

  /**
   * One raw write per `StoreState` field `buildTournamentConfig` reads, so a
   * field missing from the selector's memo deps leaves the board fresh and
   * fails. The completeness check below keeps this list honest.
   */
  const FIELD_EDITS: Record<string, (s: StoreState) => Partial<StoreState>> = {
    tournament_type: (s) => ({ tournament_type: s.tournament_type === 'ROC' ? 'NAC' : 'ROC' }),
    days_available: (s) => ({ days_available: s.days_available + 1 }),
    dayConfigs: (s) => ({
      dayConfigs: s.dayConfigs.map((d, i) => (i === 0 ? { ...d, day_end_time: d.day_end_time - 30 } : d)),
    }),
    strips_total: (s) => ({ strips_total: s.strips_total + 1 }),
    video_strips_total: (s) => ({ video_strips_total: (s.video_strips_total ?? 0) - 2 }),
    pool_round_duration_table: (s) => ({
      pool_round_duration_table: {
        ...s.pool_round_duration_table,
        [Weapon.EPEE]: s.pool_round_duration_table[Weapon.EPEE] + 15,
      },
    }),
    de_mode_override: () => ({ de_mode_override: DeMode.SINGLE_STAGE }),
    selectedCompetitions: (s) => {
      const id = Object.keys(s.selectedCompetitions)[0]
      const existing = s.selectedCompetitions[id]
      return { selectedCompetitions: { ...s.selectedCompetitions, [id]: { ...existing, fencer_count: existing.fencer_count + 10 } } }
    },
  }

  it('the field list names every StoreState field buildTournamentConfig reads (must pass before and after)', () => {
    applyPreset('B1')
    const read = new Set<string>()
    const state = store()
    const recording = new Proxy(state, {
      get(target, key, receiver) {
        if (typeof key === 'string') read.add(key)
        return Reflect.get(target, key, receiver)
      },
    })
    buildTournamentConfig(recording)
    expect([...read].sort()).toEqual(Object.keys(FIELD_EDITS).sort())
  })

  it.each(Object.keys(ACTION_EDITS))('action: %s', (edit) => {
    runPreset()
    expect(drawn().runState).toBe(RunState.FRESH)

    ACTION_EDITS[edit]()

    expectWholeBoardStale()
  })

  it.each(Object.keys(FIELD_EDITS))('field: %s', (field) => {
    runPreset()
    expect(drawn().runState).toBe(RunState.FRESH)

    useStore.setState(FIELD_EDITS[field](store()))

    expectWholeBoardStale()
  })

  it('a deselect and reselect that only reorders the competitions', () => {
    runPreset()
    const id = Object.keys(store().selectedCompetitions)[0]
    const before = buildTournamentConfig(store()).competitions
    expect(drawn().runState).toBe(RunState.FRESH)

    const config = store().selectedCompetitions[id]
    store().removeCompetition(id)
    store().addCompetition(id)
    store().updateCompetition(id, config)

    // Premise: the same competitions in a different order, so only the order can make it stale.
    const after = buildTournamentConfig(store()).competitions
    const byId = (list: typeof before) => [...list].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(byId(after)).toEqual(byId(before))
    expect(after.map(c => c.id)).not.toEqual(before.map(c => c.id))

    expectWholeBoardStale()
  })
})

describe('what counts as unplaced', () => {
  it('a fresh board counts the events the run could not seat (pin-all re-run)', () => {
    runPreset()
    for (const id of Object.keys(store().placements)) store().setPinned(id, true)
    const { config, competitions } = buildTournamentConfig(store())
    const pins = buildPinnedPlacements(store())
    const unseated = unseatedPhases(scheduleAll(competitions, config, pins))
    expect(unseated.size).toBe(8)
    const expected = new Set([...unseated].map(key => key.split('|')[0]))

    runScheduleAll()
    const model = drawn()

    expect(model.runState).toBe(RunState.FRESH)
    expect(new Set(model.unplacedIds)).toEqual(expected)
    const counted = model.blocks.filter(block => block.countsAsUnplaced)
    expect(counted.length).toBe(8)
    for (const block of model.blocks) {
      expect(block.countsAsUnplaced).toBe(block.unseated)
      expect(block.overflow).toBe(block.countsAsUnplaced)
    }
  })

  it('a stale board with unseated phases counts none of them (review focus 10)', () => {
    runPreset()
    const id = firstPlacedId()
    store().updateCompetition(id, { fencer_count: store().selectedCompetitions[id].fencer_count + 10 })
    const model = drawn()

    expect(model.runState).toBe(RunState.STALE)
    expect(model.blocks.some(block => block.unseated), 'premise: derived times leave phases unseated').toBe(true)
    expect(model.unplacedIds.size).toBe(0)
    expect(model.blocks.filter(block => block.countsAsUnplaced || block.overflow)).toEqual([])
  })
})

describe('a board with no run', () => {
  it('is stale when it holds an in-range placement of a selected event', () => {
    applyPreset('B1')
    const ids = Object.keys(store().selectedCompetitions)
    store().setPlacementsFromAuto(
      Object.fromEntries(ids.map((id, i) => [id, makePlacement({ day: i % 4, start_time: 480, strip_count: 4 })])),
    )

    expectWholeBoardStale()
  })

  const NOTHING_TO_BE_STALE_ABOUT: Record<string, () => void> = {
    'empty': () => {},
    'placements of deselected events only': () =>
      useStore.setState({ placements: { 'Y14-M-FOIL-IND': makePlacement({ day: 0, start_time: 480, strip_count: 4 }) } }),
    'out-of-range placements only': () => {
      const id = Object.keys(store().selectedCompetitions)[0]
      useStore.setState({ placements: { [id]: makePlacement({ day: 9, start_time: 480, strip_count: 4 }) } })
    },
  }

  it.each(Object.keys(NOTHING_TO_BE_STALE_ABOUT))('is fresh when %s', (board) => {
    applyPreset('B1')
    NOTHING_TO_BE_STALE_ABOUT[board]()

    const model = drawn()
    expect(model.runState).toBe(RunState.FRESH)
    expect(model.unplacedIds.size).toBe(0)
  })
})

describe('memoization (review focus 9)', () => {
  it('a run that changes the output but no placement gives every selector keyed on the schedule a new value', () => {
    runPreset()
    const SELECTORS = {
      selectDrawnSchedule,
      selectAllFindings,
      selectDerivedFindings,
      selectFooterMetrics,
      selectPlacementCounts,
      selectDaySummaries,
    } as const
    const before = Object.fromEntries(Object.entries(SELECTORS).map(([name, select]) => [name, select(store())]))
    const placements = store().placements

    // The pin-all run seats fewer phases at the same placements.
    const { config, competitions } = buildTournamentConfig(store())
    const pins = pinsForWholeBoard()
    const pinAllRun = scheduleAll(competitions, config, pins)
    expect(unseatedPhases(pinAllRun).size, 'premise: the second run differs').toBeGreaterThan(0)
    store().setLastRun(keepRun(pinAllRun, config, competitions, pins))

    expect(store().placements).toBe(placements)
    for (const [name, select] of Object.entries(SELECTORS)) {
      expect(select(store()), name).not.toBe(before[name])
    }
  })
})
