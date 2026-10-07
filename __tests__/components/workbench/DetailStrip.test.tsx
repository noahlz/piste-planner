import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { DetailStrip } from '../../../src/components/workbench/DetailStrip.tsx'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import {
  drawnScheduleFrom,
  RunState,
  selectDrawnSchedule,
  type DrawnSchedule,
} from '../../../src/store/derived.ts'
import { findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/lib/competitionLabels.ts'
import { eventTimeSegments } from '../../../src/layout/segments.ts'
import { estimateEventFootprint } from '../../../src/engine/derive.ts'
import { phaseDisplay, stripSetLabel } from '../../../src/lib/placementLabels.ts'
import { formatClock, formatMinutes } from '../../../src/lib/time.ts'
import { DeMode, Phase, PlacementSource } from '../../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeScheduleResult, makeStrips } from '../../helpers/factories.ts'
import { drawnFromDerived, runAndMoveHeadline } from '../../helpers/drawnFixtures.ts'

// 013 T028 (part b) — red tests for the detail strip (contract §4,
// phase4-contract.md). DetailStrip.tsx does not exist yet (T029 writes it),
// selectedCompetitionId/selectCompetition are not yet on the store, and
// Block has no onClick — every case below fails on one of those, not on a
// logic mistake in this file.

// The store surface pinned by phase4-contract.md §1 (added by T029). The
// cast keeps every reference here typed and deliberate rather than a stray
// `any` — the same pattern __tests__/store/placements.test.ts uses for a
// slice T008 had not yet added.
interface SelectionSlice {
  selectedCompetitionId: string | null
  selectCompetition: (id: string | null) => void
}
type FutureState = StoreState & SelectionSlice
function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

afterEach(() => {
  cleanup()
})

/** Preset B1, run through the auto-scheduler, read back as the committed model
 *  (same fixture Canvas.test.tsx's b1Board() builds — all 24 events place). */
function b1Board(): DrawnSchedule {
  applyPreset('B1')
  runScheduleAll()
  return selectDrawnSchedule(useStore.getState())
}

/** Every strip the last run kept for `id`, across its phases. */
function keptStripsOf(id: string): number[] {
  const kept = useStore.getState().lastRun?.events[id]
  if (!kept) throw new Error(`the last run kept no ${id}`)
  return kept.phases.flatMap((phase) => [...phase.strips])
}

/** How many separate runs of consecutive indices a strip set has. */
function runCount(strips: readonly number[]): number {
  const sorted = [...new Set(strips)].sort((a, b) => a - b)
  return sorted.filter((strip, i) => i === 0 || sorted[i - 1] !== strip - 1).length
}

/** The sorted-first placed event id, optionally excluding one assigned day —
 *  used by the Move day case so the day it moves *to* is guaranteed to be
 *  one of the "other" days offered. */
function placedEventId(schedule: DrawnSchedule, opts: { excludeDay?: number } = {}): string {
  const ids = Object.keys(schedule.events).sort()
  const match = ids.find(
    (id) => opts.excludeDay === undefined || schedule.events[id].result.assigned_day !== opts.excludeDay,
  )
  if (!match) throw new Error('no placed event matches the requested day exclusion')
  return match
}

function expectedName(id: string): string {
  const entry = findCompetition(id)
  return entry ? competitionLabel(entry) : id
}

const noop = () => {}

describe('DetailStrip renders nothing (contract §4 "Renders null when...")', () => {
  it('renders nothing when there is no selection', () => {
    const schedule = b1Board()
    // No selectCompetition call — the boot state, and the state of every
    // render before the user's first click, since DetailStrip mounts
    // permanently inside CenterView.
    expect(futureState().selectedCompetitionId).toBeNull()

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    expect(screen.queryByRole('region', { name: 'Selected event' })).not.toBeInTheDocument()
  })

  it('renders nothing when the selected id names no competition in schedule.competitions', () => {
    const schedule = b1Board()
    futureState().selectCompetition('does-not-exist-in-this-schedule')

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    expect(screen.queryByRole('region', { name: 'Selected event' })).not.toBeInTheDocument()
  })
})

describe('DetailStrip facts (contract §4 Facts)', () => {
  it('names the selected event, its day, strips and fencer count', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    const competition = schedule.competitions.find((c) => c.id === id)
    if (!competition) throw new Error(`no competition for ${id}`)
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const section = screen.getByRole('region', { name: 'Selected event' })
    const name = expectedName(id)
    expect(section).toHaveAttribute('data-selected-name', name)
    expect(section).toHaveTextContent(name)

    const day = schedule.events[id].result.assigned_day
    expect(section).toHaveAttribute('data-selected-day', String(day + 1))
    expect(section).toHaveTextContent(`Day ${day + 1}`)

    // Right after a run every event is kept, so its label names the strips the
    // run gave it (017 spec §6), read off the kept run rather than the blocks.
    const expectedStrips = stripSetLabel(keptStripsOf(id))
    expect(section).toHaveAttribute('data-selected-strips', expectedStrips)
    expect(section).toHaveTextContent(expectedStrips)

    expect(section).toHaveAttribute('data-selected-fencers', String(competition.fencer_count))
    expect(section).toHaveTextContent(`${competition.fencer_count} fencers`)
  })

  // test-quality review note: every other case above recomputes its expected
  // strips string with the same assignStripLanes/stripRangeLabel formula the
  // component calls, so a conceptual mistake shared by both would pass
  // unnoticed. This fixture is built so the answer is provable by hand
  // instead, and the assertion below is the literal, not the formula.
  it('reads "Strips 12–16" for a block seated behind an 11-strip blocker at the same start time', () => {
    const config = makeConfig({ strips: makeStrips(20, 0) })
    const blocker = makeCompetition({ id: 'aaa-blocker', fencer_count: 24 })
    const selected = makeCompetition({ id: 'bbb-selected', fencer_count: 24 })
    const schedule = drawnFromDerived({
      config,
      competitions: [blocker, selected],
      events: {
        [blocker.id]: {
          result: { ...makeScheduleResult(blocker.id, 0), pool_start: 480, pool_end: 600, pool_strip_count: 11 },
          day_out_of_range: false,
        },
        [selected.id]: {
          result: { ...makeScheduleResult(selected.id, 0), pool_start: 480, pool_end: 600, pool_strip_count: 5 },
          day_out_of_range: false,
        },
      },
    })
    useStore.setState({
      selectedCompetitions: {
        [blocker.id]: { fencer_count: blocker.fencer_count, flighted: blocker.flighted },
        [selected.id]: { fencer_count: selected.fencer_count, flighted: selected.flighted },
      },
    })
    futureState().selectCompetition(selected.id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const section = screen.getByRole('region', { name: 'Selected event' })
    // By hand: both events start at the same minute on the same day, so the
    // strip assigner seats them by id — "aaa-blocker" first — on the first
    // free strips in the engine's candidate order (no video strips here, so
    // index order). The blocker takes 0-based strips 0-10 (11 strips), leaving
    // "bbb-selected"'s 5 strips at 0-based 11-15, i.e. 1-based 12-16.
    expect(section).toHaveAttribute('data-selected-strips', 'Strips 12–16')
    expect(section).toHaveTextContent('Strips 12–16')
  })

  it('names a kept split strip set by its runs, "Strips 1–4, 9–10"', () => {
    const config = makeConfig({ strips: makeStrips(20, 0) })
    const selected = makeCompetition({ id: 'split', fencer_count: 24 })
    const schedule = drawnScheduleFrom(
      config,
      [selected],
      {
        [selected.id]: {
          result: { ...makeScheduleResult(selected.id, 0), pool_start: 480, pool_end: 600, pool_strip_count: 6 },
          day_out_of_range: false,
          keptStrips: { [Phase.POOLS]: [0, 1, 2, 3, 8, 9] },
          source: 'kept',
        },
      },
      RunState.FRESH,
    )
    futureState().selectCompetition(selected.id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const section = screen.getByRole('region', { name: 'Selected event' })
    expect(section).toHaveAttribute('data-selected-strips', 'Strips 1–4, 9–10')
    expect(section).toHaveTextContent('Strips 1–4, 9–10')
  })

  it('names the strips the run drew for a B1 event whose kept strips are not contiguous', () => {
    const schedule = b1Board()
    const id = Object.keys(schedule.events)
      .sort()
      .find((eventId) => runCount(keptStripsOf(eventId)) > 1)
    if (!id) throw new Error('premise: B1 keeps at least one event on a split strip set')
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const label = screen.getByRole('region', { name: 'Selected event' }).getAttribute('data-selected-strips')
    expect(label).toBe(stripSetLabel(keptStripsOf(id)))
    expect(label).toContain(', ')
  })

  it('names the strips an event the model counts unplaced still needs', () => {
    const { id } = runAndMoveHeadline('B1')
    const schedule = selectDrawnSchedule(useStore.getState())
    const unplacedBlocks = schedule.blocks.filter((b) => b.competitionId === id && b.countsAsUnplaced)
    expect(unplacedBlocks.length, 'premise: the headline move leaves the event unplaced').toBeGreaterThan(0)
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const needed = Math.max(...unplacedBlocks.map((b) => b.stripCount))
    expect(screen.getByRole('region', { name: 'Selected event' })).toHaveAttribute(
      'data-selected-strips',
      `Unplaced, needs ${needed} strips`,
    )
  })
})

describe('DetailStrip, a placed event on a day outside the tournament (react review finding 1)', () => {
  it('keeps Pin, Move day and Flight, and names the out-of-range day and strips honestly', () => {
    const schedule = b1Board()
    // The scenario the finding names: an organizer shrinks Days available
    // after auto-scheduling, so a placement's day survives unchanged while the
    // tournament around it gets smaller. setDays (not updatePlacement) is the
    // realistic trigger — it leaves the placement itself, still AUTO and
    // unpinned, exactly as runScheduleAll committed it.
    const lastDay = Math.max(...Object.values(schedule.events).map((e) => e.result.assigned_day))
    const id = Object.keys(schedule.events).find(
      (eventId) => schedule.events[eventId].result.assigned_day === lastDay,
    )
    if (!id) throw new Error('no event placed on the last day')
    futureState().selectCompetition(id)
    expect(useStore.getState().placements[id]?.pinned).toBe(false)

    useStore.getState().setDays(lastDay)
    const outOfRangeSchedule = selectDrawnSchedule(useStore.getState())
    expect(outOfRangeSchedule.events[id].day_out_of_range).toBe(true)
    expect(useStore.getState().placements[id]?.pinned).toBe(false)

    render(<DetailStrip schedule={outOfRangeSchedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const section = screen.getByRole('region', { name: 'Selected event' })

    // The event is still placed (schedule.events[id] exists), and Move day is
    // the control that repairs an out-of-range day, so it stays alongside Pin
    // and Flight rather than being withdrawn.
    expect(screen.getByRole('button', { name: 'Pin' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Flight' })).toBeInTheDocument()

    // data-selected-day still carries the 1-based day number (contract §4),
    // but the visible text names the condition, matching how ScheduleOutput
    // words the same fact ("Day N out of range", ScheduleOutput.tsx:115).
    expect(section).toHaveAttribute('data-selected-day', String(lastDay + 1))
    expect(section).toHaveTextContent(`Day ${lastDay + 1} out of range`)

    // data-selected-strips must always render for a placed event, and must not
    // claim strips assignStripLanes never granted it — it skips a
    // day_out_of_range event outright (lanes.ts:148).
    expect(section).toHaveAttribute('data-selected-strips', 'Unplaced, day out of range')
    expect(section).toHaveTextContent('Unplaced, day out of range')
  })
})

describe('DetailStrip phase pills, placed (contract §4 Phase pills)', () => {
  it('shows one pill per segment, in eventTimeSegments order, with 24-hour clock times', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const segments = eventTimeSegments(schedule.events[id])
    const pills = document.querySelectorAll('[data-phase-pill]')
    expect(pills).toHaveLength(segments.length)
    segments.forEach((segment, i) => {
      expect(pills[i]).toHaveAttribute('data-phase-pill', segment.phase)
      expect(pills[i]).toHaveTextContent(
        `${phaseDisplay(segment.phase)} ${formatClock(segment.startMinutes)}–${formatClock(segment.endMinutes)}`,
      )
    })
  })

  // The case above re-derives its text with phaseDisplay, so it cannot catch a
  // wrong label. This one is written out by hand for a staged event.
  it('reads "Video stage 14:00–15:30" on a staged event, with every pill literal', () => {
    const config = makeConfig({ strips: makeStrips(20, 4) })
    const staged = makeCompetition({ id: 'staged', fencer_count: 24, de_mode: DeMode.STAGED })
    const schedule = drawnFromDerived({
      config,
      competitions: [staged],
      events: {
        [staged.id]: {
          result: {
            ...makeScheduleResult(staged.id, 0),
            pool_start: 480,
            pool_end: 600,
            pool_strip_count: 4,
            de_prelims_start: 600,
            de_prelims_end: 840,
            de_prelims_strip_count: 4,
            de_round_of_16_start: 840,
            de_round_of_16_end: 930,
            de_round_of_16_strip_count: 4,
          },
          day_out_of_range: false,
        },
      },
    })
    futureState().selectCompetition(staged.id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const pills = Array.from(document.querySelectorAll('[data-phase-pill]')).map((el) => el.textContent)
    expect(pills).toEqual([
      'Pools 08:00–10:00',
      'DE prelims 10:00–14:00',
      'Video stage 14:00–15:30',
    ])
  })
})

describe('DetailStrip Pin (contract §4 Actions)', () => {
  it('toggles the live placement pinned flag, not a drawn fact', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    futureState().selectCompetition(id)
    // setPlacementsFromAuto (runScheduleAll's own commit) always seeds pinned: false.
    expect(useStore.getState().placements[id]?.pinned).toBe(false)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const pinButton = screen.getByRole('button', { name: 'Pin' })
    expect(pinButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(pinButton)

    expect(useStore.getState().placements[id]?.pinned).toBe(true)
    const pinnedButton = screen.getByRole('button', { name: 'Pinned' })
    expect(pinnedButton).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('DetailStrip Move day (contract §4 Actions, FR-047)', () => {
  it('offers every other day and moves the placement, manual and pinned, at the same start time', () => {
    const schedule = b1Board()
    // Day 3 (index 2) must be one of the "other" days offered, so the
    // selected event cannot itself already be on day index 2. This implicitly
    // depends on B1 running more than two days — if B1 ever shrinks to two,
    // excludeDay: 2 stops excluding anything and this case fails loudly rather
    // than silently proving nothing.
    const id = placedEventId(schedule, { excludeDay: 2 })
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const moveButton = screen.getByRole('button', { name: 'Move day' })
    expect(moveButton).toHaveAttribute('aria-haspopup', 'menu')
    expect(moveButton).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(moveButton)
    expect(moveButton).toHaveAttribute('aria-expanded', 'true')

    const menu = screen.getByRole('menu')
    const currentDay = schedule.events[id].result.assigned_day
    const expectedLabels = Array.from({ length: schedule.config.days_available }, (_, i) => i)
      .filter((day) => day !== currentDay)
      .map((day) => `Day ${day + 1}`)
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(expectedLabels)

    const originalStartTime = useStore.getState().placements[id]?.start_time

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Day 3' }))

    expect(useStore.getState().placements[id]).toMatchObject({
      day: 2,
      start_time: originalStartTime,
      source: PlacementSource.MANUAL,
      pinned: true,
    })
  })
})

describe('DetailStrip Flight (contract §4 Actions)', () => {
  it('toggles flighted for the selected competition', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    futureState().selectCompetition(id)
    expect(useStore.getState().selectedCompetitions[id]?.flighted).toBe(false)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const flightButton = screen.getByRole('button', { name: 'Flight' })
    expect(flightButton).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(flightButton)

    expect(useStore.getState().selectedCompetitions[id]?.flighted).toBe(true)
    expect(flightButton).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('DetailStrip Collapse / Expand (contract §4 Actions, Collapsed)', () => {
  it('calls the toggle callback both ways and, collapsed, renders only the one-line shape', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    futureState().selectCompetition(id)
    const onToggle = vi.fn()

    const { rerender } = render(
      <DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={onToggle} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Collapse details' }))
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(<DetailStrip schedule={schedule} detailCollapsed={true} onToggleDetailCollapsed={onToggle} />)

    const section = screen.getByRole('region', { name: 'Selected event' })
    expect(section).toHaveAttribute('data-collapsed', 'true')
    expect(section).toHaveTextContent(expectedName(id))

    expect(section.querySelectorAll('[data-phase-pill]')).toHaveLength(0)
    expect(section).not.toHaveAttribute('data-selected-day')
    expect(section).not.toHaveAttribute('data-selected-strips')
    expect(section).not.toHaveAttribute('data-selected-fencers')
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move day' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flight' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Expand details' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand details' }))
    expect(onToggle).toHaveBeenCalledTimes(2)
  })
})

describe('DetailStrip Dismiss (contract §4 Actions)', () => {
  it('clears the selection', () => {
    const schedule = b1Board()
    const id = placedEventId(schedule)
    futureState().selectCompetition(id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(futureState().selectedCompetitionId).toBeNull()
  })
})

describe('DetailStrip, no placement (contract §4 "Placed vs unplaced")', () => {
  it('shows name, fencer count and footprint duration pills, a Flight button, and no Pin or Move day', () => {
    const config = makeConfig()
    const competition = makeCompetition({ id: 'unplaced-comp', fencer_count: 32 })
    const schedule = drawnFromDerived({ config, competitions: [competition], events: {} })

    useStore.setState({
      selectedCompetitions: {
        [competition.id]: { fencer_count: competition.fencer_count, flighted: competition.flighted },
      },
    })
    futureState().selectCompetition(competition.id)

    render(<DetailStrip schedule={schedule} detailCollapsed={false} onToggleDetailCollapsed={noop} />)

    const section = screen.getByRole('region', { name: 'Selected event' })
    expect(section).toHaveTextContent(expectedName(competition.id))
    expect(section).toHaveAttribute('data-selected-fencers', String(competition.fencer_count))
    expect(section).toHaveTextContent(`${competition.fencer_count} fencers`)

    const footprint = estimateEventFootprint(competition, config)
    const pills = section.querySelectorAll('[data-phase-pill]')
    expect(pills).toHaveLength(2)
    expect(pills[0]).toHaveAttribute('data-phase-pill', Phase.POOLS)
    expect(pills[0]).toHaveTextContent(`Pools ${formatMinutes(footprint.poolMinutes)}`)
    expect(pills[1]).toHaveAttribute('data-phase-pill', Phase.DE)
    expect(pills[1]).toHaveTextContent(`DE ${formatMinutes(footprint.deMinutes)}`)

    expect(screen.getByRole('button', { name: 'Flight' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pin' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Pinned' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Move day' })).not.toBeInTheDocument()
  })
})
