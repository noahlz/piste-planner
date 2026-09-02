import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ScheduleOutput } from '../../src/components/sections/ScheduleOutput.tsx'
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
// RefRequirementsReport. Both components are gone — the scorecard
// (`__tests__/components/workbench/Scorecard.test.tsx`) carries the referee
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
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 7, strip_count: 5 }) })

    render(<ScheduleOutput />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.getByText('Day 8 out of range')).toBeInTheDocument()
  })
})
