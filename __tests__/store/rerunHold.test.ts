/**
 * The hold (020 T1c, R8, decision 18): while a re-run is due, the per-event
 * Unplaced rows of `selectFindings`, `selectPlacementCounts` and
 * `selectFooterMetrics` read `held`, the last calm board's values, so they
 * match the board the center holds. Every other row follows typing (FR-008).
 *
 * The fixture is B1 after the headline move, then the switch on: its live
 * values change when it goes stale (one `:room` row and 23 / 1 / 1 fresh,
 * none and 24 / 0 / 1 stale), so a missing hold shows. Every edit goes
 * through a store action, since a direct `useStore.setState` bypasses the
 * writer, save the memo case, which writes `held` alone.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { applyLoadedState } from '../../src/store/exportActions.ts'
import {
  selectAllFindings,
  selectDaySummaries,
  selectFindings,
  selectFooterMetrics,
  selectHasBlocking,
  selectPlacementCounts,
  selectRerunDue,
} from '../../src/store/derived.ts'
import type { FooterMetric, Finding, HeldBoard, PlacementCounts } from '../../src/store/derived.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { runAndMoveHeadline } from '../helpers/drawnFixtures.ts'

vi.mock('../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  vi.mocked(scheduleAll).mockClear()
})

/** Not the moved headline: an edit to it makes the board due without touching the mover. */
const VET = 'VET-W-FOIL-IND-VCMB'
const STALE_ROW_ID = 'stale:run'
/** B1 after the headline move, fresh. */
const CALM_COUNTS: PlacementCounts = { placed: 23, unplaced: 1, pinned: 1 }
/** The same board once stale, and after the run that re-seats the mover. */
const STALE_COUNTS: PlacementCounts = { placed: 24, unplaced: 0, pinned: 1 }

function state(): StoreState {
  return useStore.getState()
}

function due(): boolean {
  return selectRerunDue(state())
}

function isUnplacedRow(row: Finding): boolean {
  return row.id.startsWith('unplaced:')
}

/** What R8 holds, as the store reads it. */
interface Reading {
  rowIds: string[]
  counts: PlacementCounts
  metrics: FooterMetric[]
}

function readingOf(s: StoreState): Reading {
  return {
    rowIds: selectFindings(s).filter(isUnplacedRow).map((row) => row.id),
    counts: selectPlacementCounts(s),
    metrics: selectFooterMetrics(s),
  }
}

function read(): Reading {
  return readingOf(state())
}

/** The store as it would read with nothing held: the live values, for premises and "reads live" checks. */
function liveReading(): Reading {
  return readingOf({ ...state(), held: null })
}

/** The rows other than `unplaced:*`, as the Findings panel shows them. */
function otherRows(s: StoreState = state()): [string, string][] {
  return selectFindings(s).filter((row) => !isUnplacedRow(row)).map((row) => [row.id, row.message])
}

function shows(rowId: string): boolean {
  return selectFindings(state()).some((row) => row.id === rowId)
}

/** The snapshot the writer is expected to take of `s`. */
function snapshotOf(s: StoreState): HeldBoard {
  return {
    unplacedRows: selectAllFindings(s).filter(isUnplacedRow),
    counts: selectPlacementCounts(s),
    metrics: selectFooterMetrics(s),
  }
}

function typeFencers(count: number): void {
  state().updateCompetition(VET, { fencer_count: count })
}

/** B1 after the headline move, with the switch as asked, its premise asserted. */
function calmFixture(autoRerun = true): { mover: string; calm: Reading; calmSnapshot: HeldBoard } {
  const { id: mover } = runAndMoveHeadline('B1')
  state().setAutoRerun(autoRerun)
  expect(state().selectedCompetitions[VET]?.fencer_count, 'premise: the edited event starts at 40').toBe(40)
  expect(due(), 'premise: the fixture is not due').toBe(false)
  const calm = read()
  expect(calm.rowIds, 'premise: the mover raises one :room row').toEqual([`unplaced:${mover}:room`])
  expect(calm.counts, 'premise: the mover counts as unplaced').toEqual(CALM_COUNTS)
  return { mover, calm, calmSnapshot: snapshotOf(state()) }
}

describe('R8: while due, the Unplaced rows and the footer hold the last calm board', () => {
  it('holds the pre-edit Unplaced rows and counts, lets the other rows follow typing, and takes the run\'s values when it lands', () => {
    const { calm } = calmFixture()

    typeFencers(41)

    expect(due(), 'premise: the edit is due').toBe(true)
    expect(liveReading().counts, 'premise: the live board reads stale').toEqual(STALE_COUNTS)
    expect(read().rowIds).toEqual(calm.rowIds)
    expect(read().counts).toEqual(calm.counts)
    // The whole list, in order: the held rows lead, as the Unplaced group,
    // since B1 has no Blocking row and `stale:run` is hidden while due. This
    // pins the rail badge too (decision 19), which is the list's length.
    expect(selectHasBlocking(state()), 'premise: no Blocking row ahead of the Unplaced group').toBe(false)
    expect(selectFindings(state()).map((row) => row.id)).toEqual([
      ...calm.rowIds,
      ...otherRows({ ...state(), held: null }).map(([id]) => id),
    ])

    // FR-008 (guard part): a second edit while due rewrites a non-`unplaced`
    // row, and the panel follows it.
    const othersBefore = otherRows()
    typeFencers(60)
    expect(due()).toBe(true)
    expect(otherRows(), 'premise: the edit changes a non-unplaced row').not.toEqual(othersBefore)
    expect(otherRows()).toEqual(otherRows({ ...state(), held: null }))
    expect(read().rowIds).toEqual(calm.rowIds)

    runScheduleAll()

    expect(selectAllFindings(state()).some(isUnplacedRow), 'premise: the run re-seats the mover').toBe(false)
    expect(state().held).toBeNull()
    expect(read().rowIds).toEqual([])
    expect(read().counts).toEqual(STALE_COUNTS)
  })

  it('holds the footer metrics and reads the run\'s once it lands', () => {
    const { calm } = calmFixture()

    // 100, not 41: at 41 the live Finish stays at 18:30, so a hold that let
    // Finish through would pass. At 100 all three rows move while stale.
    typeFencers(100)

    const live = liveReading().metrics
    for (const metric of calm.metrics) {
      expect(live.find((row) => row.id === metric.id)?.value, `premise: the edit moves the live ${metric.id}`).not.toBe(metric.value)
    }
    expect(read().metrics).toEqual(calm.metrics)

    runScheduleAll()

    expect(read().metrics, 'premise: the run\'s metrics differ from the held ones').not.toEqual(calm.metrics)
    expect(read().metrics).toEqual(liveReading().metrics)
  })

  // A `:day` row survives going stale, so a fencer-count edit would leave the
  // live one equal to the held one. A day count that takes the stranded event
  // back into range drops it from the live board, and only the hold keeps it.
  it('holds a stranded :day row the edit takes back into range, and drops it when the run lands', () => {
    const { mover } = calmFixture()
    const days = state().days_available
    const stranded = Object.keys(state().placements)
      .sort()
      .find((id) => id !== mover && id !== VET && !state().placements[id].pinned)
    expect(stranded, 'premise: an unpinned placed event to strand').toBeDefined()
    state().updatePlacement(stranded!, { day: days })
    expect(due(), 'premise: a hand move is not due').toBe(false)
    const calm = read()
    expect(calm.rowIds, 'premise: the stranded event raises a :day row').toEqual([
      `unplaced:${mover}:room`,
      `unplaced:${stranded}:day`,
    ])

    state().setDays(days + 1)

    expect(due(), 'premise: the day edit is due').toBe(true)
    expect(liveReading().rowIds, 'premise: the live board has the event back in range').toEqual([])
    expect(read().rowIds).toEqual(calm.rowIds)

    runScheduleAll()

    expect(state().held).toBeNull()
    expect(read().rowIds).toEqual([])
  })

  it('keeps the first snapshot through continued typing, not the first edit\'s stale values', () => {
    const { calm } = calmFixture()
    typeFencers(4)
    const heldAfterFirst = state().held

    typeFencers(41)

    expect(liveReading(), 'premise: the stale values differ from the calm ones').not.toEqual(calm)
    expect(state().held).toBe(heldAfterFirst)
    expect(read()).toEqual(calm)
  })

  it('lands the snapshot in the same notification as the edit', () => {
    const { calmSnapshot } = calmFixture()
    const seen: (HeldBoard | null)[] = []
    const unsubscribe = useStore.subscribe((now) => {
      seen.push(now.held)
    })
    try {
      // `updateCompetition` passes a function partial.
      typeFencers(41)
    } finally {
      unsubscribe()
    }

    expect(seen).toHaveLength(1)
    expect(seen[0]).toEqual(calmSnapshot)
  })

  it('reads live on a Blocking board, and the pre-Blocking board once a non-Blocking value is due', () => {
    const { calm } = calmFixture()
    const runStrips = state().strips_total

    state().setStrips(0)
    expect(selectHasBlocking(state()), 'premise: strips 0 is Blocking').toBe(true)
    expect(due()).toBe(false)
    expect(read()).toEqual(liveReading())

    state().setStrips(runStrips + 1)
    expect(selectHasBlocking(state()), 'premise: the strips are back').toBe(false)
    expect(due()).toBe(true)
    expect(read()).toEqual(calm)
  })

  it('hides a held row dismissed before the edit, because the filter hides it and not because it is missing', () => {
    const { mover, calm } = calmFixture()
    const roomRow = `unplaced:${mover}:room`
    state().dismissFinding(roomRow)
    expect(read().rowIds, 'premise: the dismissal hides the row').toEqual([])

    typeFencers(41)

    expect(due()).toBe(true)
    expect(read().rowIds).toEqual([])
    expect(state().held?.unplacedRows.map((row) => row.id)).toEqual([roomRow])
    expect(read().counts).toEqual(calm.counts)
  })

  // Task D entry: `dismissFinding` checks `selectAllFindings`, which holds
  // nothing, and the live stale board raises no `:room` row.
  it('ignores a Dismiss on a held row while due', () => {
    const { mover, calm } = calmFixture()
    typeFencers(41)
    expect(read().rowIds).toEqual(calm.rowIds)
    const dismissedBefore = state().dismissedFindings

    state().dismissFinding(`unplaced:${mover}:room`)

    expect(state().dismissedFindings).toBe(dismissedBefore)
    expect(read().rowIds).toEqual(calm.rowIds)
  })

  it.each([
    ['setPinned', (id: string) => state().setPinned(id, true)],
    ['updatePlacement', (id: string) => state().updatePlacement(id, { start_time: state().placements[id].start_time + 30 })],
  ])('a %s while due leaves the held counts, pinned included, until the run lands', (_name, act) => {
    const { mover, calm } = calmFixture()
    typeFencers(41)
    const other = Object.keys(state().placements)
      .sort()
      .find((id) => id !== mover && id !== VET && !state().placements[id].pinned)
    expect(other, 'premise: an unpinned placed event to act on').toBeDefined()

    act(other!)

    expect(due(), 'premise: a move or a pin keeps the board due').toBe(true)
    expect(liveReading().counts.pinned, 'premise: the live board counts the new pin').toBe(2)
    expect(read().counts).toEqual(calm.counts)

    runScheduleAll()

    expect(read().counts.pinned).toBe(2)
  })
})

describe('R8: what is not held', () => {
  it('reads live with the switch off, and a switch-off clears a snapshot', () => {
    calmFixture(false)
    typeFencers(41)
    expect(state().held).toBeNull()
    expect(read().counts).toEqual(STALE_COUNTS)
    expect(shows(STALE_ROW_ID)).toBe(true)

    // The due step that holds: a run, the switch on, an edit.
    runScheduleAll()
    state().setAutoRerun(true)
    const runSnapshot = snapshotOf(state())
    typeFencers(42)
    expect(due()).toBe(true)
    expect(state().held).toEqual(runSnapshot)

    state().setAutoRerun(false)
    expect(state().held).toBeNull()
    expect(read()).toEqual(liveReading())
    expect(shows(STALE_ROW_ID)).toBe(true)
  })

  // 020 T1c's choice for `runScheduleAll`'s direct write of the last-attempted
  // key: it clears `held` in the same update, since an attempt ends the due
  // episode whatever the engine then does. Inside the engine the board is
  // already not due, and nothing is held.
  it('reads live after a run that throws, with nothing held from the moment the attempt is recorded', () => {
    const { calm } = calmFixture()
    typeFencers(41)
    expect(read()).toEqual(calm)
    let heldInsideEngine: HeldBoard | null | undefined
    vi.mocked(scheduleAll).mockImplementationOnce(() => {
      heldInsideEngine = state().held
      throw new Error('boom')
    })

    runScheduleAll()

    expect(heldInsideEngine).toBeNull()
    expect(due()).toBe(false)
    expect(state().held).toBeNull()
    expect(read()).toEqual(liveReading())
    expect(read().counts).toEqual(STALE_COUNTS)
    expect(shows(STALE_ROW_ID)).toBe(true)
  })

  // The same choice on a Blocking board: the run there places nothing and
  // replaces every unpinned placement, so the pre-Blocking snapshot describes
  // a board that is gone. The writer alone would keep it (a Blocking result
  // keeps what is held), and the next due edit would read it.
  it('drops the pre-Blocking snapshot when a run is attempted on the Blocking board', () => {
    const { calmSnapshot } = calmFixture()
    const runStrips = state().strips_total
    state().setStrips(0)
    expect(state().held, 'the Blocking edit holds the calm board').toEqual(calmSnapshot)

    runScheduleAll()

    expect(state().held).toBeNull()
    state().setStrips(runStrips + 1)
    expect(due(), 'premise: the restored strips are due').toBe(true)
    expect(liveReading().counts, 'premise: the live board differs from the pre-Blocking one').not.toEqual(CALM_COUNTS)
    expect(read()).toEqual(liveReading())
  })

  it('applyLoadedState clears what is held', () => {
    const { calm } = calmFixture()
    typeFencers(41)
    expect(read()).toEqual(calm)

    applyLoadedState({}, null)

    expect(state().held).toBeNull()
    expect(due()).toBe(false)
    expect(read()).toEqual(liveReading())
  })

  it('a Blocking load then a due edit reads live, and a run then an edit holds the run\'s board', () => {
    calmFixture()
    const runStrips = state().strips_total
    applyLoadedState({ strips_total: 0 }, null)
    expect(selectHasBlocking(state()), 'premise: the load is Blocking').toBe(true)

    state().setStrips(runStrips + 1)

    expect(due()).toBe(true)
    expect(state().held).toBeNull()
    expect(read()).toEqual(liveReading())

    runScheduleAll()
    const runSnapshot = snapshotOf(state())
    typeFencers(41)
    expect(due()).toBe(true)
    expect(state().held).toEqual(runSnapshot)
  })

  // Guards: the stale board's values are the live ones too, and the stale
  // row stays hidden while due (T1b).
  it.each([
    [
      'a stale load, then an edit',
      () => {
        calmFixture()
        applyLoadedState({}, null)
        typeFencers(41)
      },
    ],
    [
      'the switch turned on after an edit made while it was off',
      () => {
        calmFixture(false)
        typeFencers(41)
        state().setAutoRerun(true)
      },
    ],
  ])('%s holds the stale board\'s values', (_name, reach) => {
    reach()

    expect(due()).toBe(true)
    expect(read().rowIds).toEqual([])
    expect(read().counts).toEqual(STALE_COUNTS)
    expect(shows(STALE_ROW_ID)).toBe(false)
  })
})

describe('R8: memo completeness', () => {
  const SELECTORS = {
    selectFindings,
    selectPlacementCounts,
    selectFooterMetrics,
    selectDaySummaries,
  } as const

  it.each(Object.keys(SELECTORS) as (keyof typeof SELECTORS)[])(
    '%s keeps its object across a no-op write while due, and follows held alone',
    (name) => {
      const select = SELECTORS[name]
      const { calmSnapshot } = calmFixture()
      typeFencers(41)
      expect(due(), 'premise: due').toBe(true)
      const first = select(state())

      // A write that moves none of the selector's deps.
      state().selectCompetition(state().selectedCompetitionId)
      expect(select(state())).toBe(first)

      // The fixture rule's one bypass: no action changes `held` alone.
      useStore.setState({
        held: {
          unplacedRows: [...calmSnapshot.unplacedRows],
          counts: { ...calmSnapshot.counts },
          metrics: calmSnapshot.metrics.map((metric) => ({ ...metric })),
        },
      })
      expect(select(state())).not.toBe(first)
    },
  )
})

describe('R8: held is session state', () => {
  // Guard: green against the stub, which declares the field.
  it('a store reset gives held null', () => {
    calmFixture()
    useStore.setState({ held: snapshotOf(state()) })

    useStore.setState(useStore.getInitialState(), true)

    expect(state().held).toBeNull()
  })
})
