import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ScheduleOutput } from '../../src/components/sections/ScheduleOutput.tsx'
import { ScheduleView } from '../../src/components/ScheduleView.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'

// 005 T011: 7 schedule-output rows moved out of the two departing layout test
// files (triage-record.md rows: one departing file's rows 22, 23, 24, 25, 26,
// 27; the other departing file's row 41). Row 24 splits into two cases — a
// schedule half mounting ScheduleOutput and a referee half mounting
// ScheduleView — since one source case asserted both empty states at once.
// Five cases mount ScheduleOutput alone; three mount ScheduleView, the
// smallest surviving component that wires selectDerivedRefRequirements into
// RefRequirementsReport (see triage-record.md's S2 amendments).

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

describe('ScheduleView', () => {
  it('shows the referee empty state when nothing is placed', () => {
    seedValidConfig()
    render(<ScheduleView />)

    expect(screen.getByText('No referee demand — nothing is placed yet.')).toBeInTheDocument()
  })

  it('referee requirements derive from the placement, not from a scheduler run', () => {
    seedPlacedCompetition()
    render(<ScheduleView />)

    expect(screen.getByText('Referee Requirements')).toBeInTheDocument()
    expect(screen.getByText('Peak Total Refs')).toBeInTheDocument()
    expect(screen.queryByText('No referee demand — nothing is placed yet.')).not.toBeInTheDocument()
  })

  it('Regenerate writes placements and the derived table follows', async () => {
    const id = TEMPLATES['RYC Weekend'][0]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })

    expect(Object.keys(useStore.getState().placements)).toHaveLength(0)

    render(<ScheduleView />)
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => {
      expect(useStore.getState().placements[id]).toBeDefined()
      expect(screen.getByText(id)).toBeInTheDocument()
    })
  })
})
