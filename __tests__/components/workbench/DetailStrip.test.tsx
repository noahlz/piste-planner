import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { DetailStrip } from '../../../src/components/workbench/DetailStrip.tsx'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { selectDerivedSchedule, type DerivedSchedule } from '../../../src/store/derived.ts'
import { findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { assignStripLanes } from '../../../src/layout/lanes.ts'
import { eventTimeSegments } from '../../../src/layout/segments.ts'
import { estimateEventFootprint } from '../../../src/engine/derive.ts'
import { phaseDisplay, stripRangeLabel, stripAssignmentLabel } from '../../../src/components/canvas/CanvasTooltip.tsx'
import { formatClock, formatMinutes } from '../../../src/lib/time.ts'
import { Phase, PlacementSource } from '../../../src/engine/types.ts'
import { makeCompetition, makeConfig } from '../../helpers/factories.ts'

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
function b1Board(): DerivedSchedule {
  applyPreset('B1')
  runScheduleAll()
  return selectDerivedSchedule(useStore.getState())
}

/** The sorted-first placed event id, optionally excluding one assigned day —
 *  used by the Move day case so the day it moves *to* is guaranteed to be
 *  one of the "other" days offered. */
function placedEventId(schedule: DerivedSchedule, opts: { excludeDay?: number } = {}): string {
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

    const lanes = assignStripLanes(schedule.events, Math.max(0, Math.floor(schedule.config.strips_total)))
    const blocks = lanes.filter((b) => b.competitionId === id)
    const overflowed = blocks.some((b) => b.overflow)
    const expectedStrips = overflowed
      ? stripAssignmentLabel(0, Math.max(...blocks.map((b) => b.stripCount)), true)
      : stripRangeLabel(
          Math.min(...blocks.map((b) => b.firstStrip)),
          Math.max(...blocks.map((b) => b.firstStrip + b.stripCount)) -
            Math.min(...blocks.map((b) => b.firstStrip)),
        )
    expect(section).toHaveAttribute('data-selected-strips', expectedStrips)
    expect(section).toHaveTextContent(expectedStrips)

    expect(section).toHaveAttribute('data-selected-fencers', String(competition.fencer_count))
    expect(section).toHaveTextContent(`${competition.fencer_count} fencers`)
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
    // selected event cannot itself already be on day index 2.
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
    const schedule: DerivedSchedule = { config, competitions: [competition], events: {} }

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
