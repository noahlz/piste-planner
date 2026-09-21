import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { ScheduleOutput } from '../../src/components/sections/ScheduleOutput.tsx'
import { WorkbenchShell } from '../../src/components/workbench/WorkbenchShell.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'

// 005 T011: schedule-output rows moved out of the two departing layout test
// files (triage-record.md rows: one departing file's rows 22, 23, 24, 25, 26,
// 27; the other departing file's row 41).
//
// 2026-09-01: the three cases that mounted `ScheduleView` were deleted with it.
// It was the pre-workbench "Regenerate" page, unreachable from `main.tsx`, and
// its only job here was wiring selectDerivedRefRequirements into
// RefRequirementsReport. Both components are gone — the status footer
// (`__tests__/components/workbench/StatusFooter.test.tsx`) carries the referee
// numbers now, and the derive-not-rerun property the deleted cases asserted is
// covered by `__tests__/store/derived.test.ts`.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** Selects one competition and places it, so the schedule view has something derived to show. */
function seedPlacedCompetition(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  seedValidConfig()
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 30 })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

/**
 * Seeds N competitions from `TEMPLATES['RYC Weekend']`, each placed via one
 * `setPlacementsFromAuto` call at the given day/start_time (strip_count 5).
 * Returns the ids in the same order as `specs`, so a case can name which id
 * landed where.
 */
function seedScheduled(specs: Array<{ day: number; start_time: number }>): string[] {
  seedValidConfig()
  const ids = TEMPLATES['RYC Weekend'].slice(0, specs.length)
  ids.forEach((id) => {
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
  })
  const placements = Object.fromEntries(
    ids.map((id, i) => [
      id,
      makePlacement({ day: specs[i].day, start_time: specs[i].start_time, strip_count: 5 }),
    ]),
  )
  useStore.getState().setPlacementsFromAuto(placements)
  return ids
}

describe('ScheduleOutput', () => {
  it('renders no staleness banner — placements are always current', () => {
    const id = seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument()
  })

  it('a placement seeded into the store renders as a schedule row', () => {
    const id = seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.getByText(id)).toBeInTheDocument()
    // Pool start derives straight from the placement's start_time (480 = 8:00)
    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)
    expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing is placed', () => {
    seedValidConfig()
    render(<ScheduleOutput />)

    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })

  it('editing a placement changes the rendered schedule with no re-run', async () => {
    const id = seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)

    await act(async () => {
      useStore.getState().updatePlacement(id, { start_time: 600 })
    })

    // 600 minutes = 10:00 — the derived row moved without touching Regenerate
    expect(screen.getAllByText('10:00').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('8:00')).toHaveLength(0)
  })

  it('a placement on a day past days_available is flagged, not hidden', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    const inRangeId = TEMPLATES['RYC Weekend'][1]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().addCompetition(inRangeId)
    useStore.getState().updateCompetition(inRangeId, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({
      [id]: makePlacement({ day: 7, strip_count: 5 }),
      [inRangeId]: makePlacement({ day: 0, strip_count: 5 }),
    })

    render(<ScheduleOutput />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 8' })).toBeInTheDocument()
    expect(screen.getByText('Day 8 out of range')).toBeInTheDocument()

    const outOfRangeRow = document.querySelector(`[data-schedule-row="${id}"]`)
    expect(outOfRangeRow).toHaveAttribute('data-out-of-range', 'true')

    const inRangeRow = document.querySelector(`[data-schedule-row="${inRangeId}"]`)
    expect(inRangeRow).not.toHaveAttribute('data-out-of-range')
  })

  it('renders one region per day with events, none for an empty day, inside the Schedule region', () => {
    seedScheduled([
      { day: 0, start_time: 480 },
      { day: 0, start_time: 540 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    expect(screen.getByRole('region', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Day 1' })).getByRole('heading', { name: 'Day 1' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 2' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Day 3' })).not.toBeInTheDocument()
  })

  it('orders rows within a day by pool start, regardless of placement order', () => {
    // Scoped to `[data-schedule-row]` order directly, not to a day region —
    // the region markup is what T036 adds, and this case is about row order,
    // which the current sort already gets right (contract §3 case 2:
    // predicted green).
    const ids = seedScheduled([
      { day: 0, start_time: 600 },
      { day: 0, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    const rowIds = Array.from(document.querySelectorAll('[data-schedule-row]')).map((el) =>
      el.getAttribute('data-schedule-row'),
    )
    expect(rowIds).toEqual([ids[1], ids[0]])
  })

  it('has no Day columnheader and keeps the seven remaining columns in order', () => {
    seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.queryByRole('columnheader', { name: 'Day' })).not.toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Competition',
      'Pool Start',
      'Pool End',
      'DE Start',
      'DE End',
      'Strips',
      'Finish',
    ])
  })

  it('renders every placed event exactly once across all day sections', () => {
    const ids = seedScheduled([
      { day: 0, start_time: 480 },
      { day: 0, start_time: 540 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    const rowIds = Array.from(document.querySelectorAll('[data-schedule-row]'))
      .map((el) => el.getAttribute('data-schedule-row') ?? '')
      .sort()
    expect(rowIds).toEqual([...ids].sort())
  })

  it('the Print button calls window.print once per press', () => {
    seedPlacedCompetition()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ScheduleOutput />)

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('gives every day section the print-page class', () => {
    seedScheduled([
      { day: 0, start_time: 480 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    expect(screen.getByRole('region', { name: 'Day 1' })).toHaveClass('print-page')
    expect(screen.getByRole('region', { name: 'Day 2' })).toHaveClass('print-page')
  })

  it('renders the Print button and the empty-state text with nothing placed', () => {
    seedValidConfig()
    render(<ScheduleOutput />)

    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })
})

describe('print (FR-052)', () => {
  it('marks the six always-present regions print-hidden, including the detail strip once a selection exists', () => {
    seedValidConfig()
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })

    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Tournament' }))

    const dock = screen.getByRole('region', { name: 'Unplaced events' })
    fireEvent.click(within(dock).getByRole('button'))

    expect(screen.getByRole('banner', { name: 'Header' })).toHaveClass('print-hidden')
    expect(dock).toHaveClass('print-hidden')
    expect(rail).toHaveClass('print-hidden')
    expect(screen.getByRole('complementary', { name: 'Inspector panel' })).toHaveClass('print-hidden')
    expect(screen.getByRole('region', { name: 'Selected event' })).toHaveClass('print-hidden')
    expect(screen.getByRole('contentinfo', { name: 'Status bar' })).toHaveClass('print-hidden')
  })
})
