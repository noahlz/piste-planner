import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { bootstrap, DEFAULT_PRESET_ID } from '../../../src/store/boot.ts'
import { useStore } from '../../../src/store/store.ts'
import { SCENARIOS } from '../../../src/data/tournaments.ts'
import { encodeToUrl } from '../../../src/store/serialization.ts'
import { TournamentType } from '../../../src/engine/types.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'

// 004 T007 — boot behavior (FR-007, S2-contract.md §Boot): no fragment loads
// the default preset and auto-schedules it, a `#config=` fragment loads that
// state instead of the preset, and a fragment that fails to decode falls
// back to the preset rather than leaving an empty form.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('bootstrap with no usable fragment', () => {
  it('loads the default preset and auto-schedules it, so mounting the shell shows a populated schedule with no user action', () => {
    bootstrap('')
    render(<WorkbenchShell />)

    const preset = SCENARIOS[DEFAULT_PRESET_ID]
    expect(useStore.getState().strips_total).toBe(preset.strips)
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)

    const center = screen.getByRole('main', { name: 'Center view' })
    expect(within(center).queryByText('No events placed yet.')).not.toBeInTheDocument()
    expect(within(center).getAllByRole('row').length).toBeGreaterThan(1)
  })
})

describe('bootstrap with a #config= fragment', () => {
  it('loads that state instead of the preset, and does not auto-schedule it', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().setTournamentType(TournamentType.ROC)
    useStore.getState().setDays(2)
    useStore.getState().setStrips(5)
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    const hash = encodeToUrl(useStore.getState())

    useStore.setState(useStore.getInitialState())
    bootstrap(hash)

    const state = useStore.getState()
    expect(state.tournament_type).toBe(TournamentType.ROC)
    expect(state.days_available).toBe(2)
    expect(state.strips_total).toBe(5)
    expect(state.selectedCompetitions[id]?.fencer_count).toBe(30)
    // No scenario's strip count is 5 — the sender's tournament stayed the
    // tournament, DEFAULT_PRESET_ID's own strip count never overwrote it.
    expect(Object.values(SCENARIOS).some((s) => s.strips === 5)).toBe(false)
    // The fragment carried no placements, and loading it never runs the
    // auto-scheduler — a preset load would have populated placements here.
    expect(state.placements).toEqual({})
  })
})

describe('bootstrap with an undecodable #config= fragment', () => {
  it('falls back to the preset rather than leaving an empty form', () => {
    bootstrap('#config=not-a-valid-base64url-payload!!!')

    const preset = SCENARIOS[DEFAULT_PRESET_ID]
    const state = useStore.getState()
    expect(state.strips_total).toBe(preset.strips)
    expect(state.tournament_type).toBe(preset.tournamentType)
    expect(Object.keys(state.placements).length).toBeGreaterThan(0)
  })
})
