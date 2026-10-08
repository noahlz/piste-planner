import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { bootstrap, DEFAULT_PRESET_ID } from '../../../src/store/boot.ts'
import { useStore } from '../../../src/store/store.ts'
import { SCENARIOS } from '../../../src/data/tournaments.ts'
import { encodeToUrl } from '../../../src/store/serialization.ts'
import { selectDrawnSchedule, RunState } from '../../../src/store/derived.ts'
import { hashOf, payloadWithRefusedRun, resetReceiver, sendBoard, sentPayload } from '../../helpers/replayFixtures.ts'
import { TournamentType, DAY_AXIS_SPACING_MINS } from '../../../src/engine/types.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  saveViewState,
} from '../../../src/store/viewState.ts'

// 004 T007 — boot behavior (FR-007, S2-contract.md §Boot): no fragment loads
// the default preset and auto-schedules it, a `#config=` fragment loads that
// state instead of the preset, and a fragment that fails to decode falls
// back to the preset rather than leaving an empty form.

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

describe('bootstrap with no usable fragment', () => {
  it('loads the default preset and auto-schedules it, so mounting the shell shows a populated schedule with no user action', () => {
    // Both DOM assertions below are the schedule table's — its rows, and its
    // own "No events placed yet." empty state. On T040's default matrix view
    // that empty state can never appear whatever boot did, so the assertion
    // would hold against an empty store: the table is what makes it evidence.
    saveViewState({ ...DEFAULT_VIEW_STATE, viewMode: ViewMode.SCHEDULE })
    bootstrap('')
    render(<WorkbenchShell />)

    const preset = SCENARIOS[DEFAULT_PRESET_ID]
    expect(useStore.getState().strips_total).toBe(preset.strips)
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)

    const center = screen.getByRole('main', { name: 'Center view' })
    expect(within(center).queryByText('No events placed yet.')).not.toBeInTheDocument()
    expect(within(center).getAllByRole('row').length).toBeGreaterThan(1)
  })

  // review finding B: the preset picker is a local useState in the header
  // today, set only by its own change handler, so boot()'s applyPreset call
  // never reaches it and the combobox reads blank on a normal first load.
  it('leaves the preset picker showing the loaded preset without any picker interaction', () => {
    bootstrap('')
    render(<WorkbenchShell />)

    const preset = SCENARIOS[DEFAULT_PRESET_ID]
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveTextContent(preset.label)
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
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    bootstrap('#config=not-a-valid-base64url-payload!!!')

    const preset = SCENARIOS[DEFAULT_PRESET_ID]
    const state = useStore.getState()
    expect(state.strips_total).toBe(preset.strips)
    expect(state.tournament_type).toBe(preset.tournamentType)
    expect(Object.keys(state.placements).length).toBeGreaterThan(0)
    // The decode failure is reported, not swallowed silently.
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})

describe('bootstrap with a #config= fragment that carries a run (017 T8)', () => {
  it.each([
    ['as shared', false, false],
    ['after one Move day', true, false],
    ['with pins, after one Move day', true, true],
  ])('draws the sender\'s board from the link %s', (_name, moved, pinned) => {
    const sent = sendBoard({ moved, pinned })
    expect(sent.drawn.runState, 'premise').toBe(RunState.FRESH)
    resetReceiver()

    bootstrap(sent.hash)

    expect(selectDrawnSchedule(useStore.getState())).toEqual(sent.drawn)
  })

  it('does not run the auto-scheduler on the receiver, only replays', () => {
    const sent = sendBoard({ moved: true })
    const placements = sentPayload(sent).placements
    resetReceiver()

    bootstrap(sent.hash)

    expect(useStore.getState().placements).toEqual(placements)
  })

  it('opens stale when the link has placements and no run', () => {
    const sent = sendBoard()
    const payload = sentPayload(sent)
    delete payload.run
    resetReceiver()

    bootstrap(hashOf(payload))

    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })

  it('opens stale and says so on the console when the run is refused', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sent = sendBoard({ pinned: true })
    const payload = payloadWithRefusedRun(sent)
    // Only the day is out of range: its start_time sits on day 99's own axis.
    const [first] = payload.run!
    payload.run![0] = { ...first, strip_count: 1, day: 99, start_time: 99 * DAY_AXIS_SPACING_MINS + (first.start_time % DAY_AXIS_SPACING_MINS) }
    resetReceiver()

    bootstrap(hashOf(payload))

    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/run/i), expect.stringMatching(/run day for .* must be a whole day/))
    warn.mockRestore()
  })

  it('opens stale from a stale sender, whose link carries no run', () => {
    sendBoard()
    useStore.getState().setStrips(useStore.getState().strips_total + 1)
    const hash = encodeToUrl(useStore.getState())
    resetReceiver()

    bootstrap(hash)

    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })
})
