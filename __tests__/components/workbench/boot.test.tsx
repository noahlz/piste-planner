import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { RERUN_DEBOUNCE_MS } from '../../../src/components/workbench/useAutoRerun.ts'
import { bootstrap, DEFAULT_PRESET_ID } from '../../../src/store/boot.ts'
import { useStore } from '../../../src/store/store.ts'
import { SCENARIOS } from '../../../src/data/tournaments.ts'
import { encodeToUrl } from '../../../src/store/serialization.ts'
import { selectDrawnSchedule, RunState } from '../../../src/store/derived.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { applyLoadedState } from '../../../src/store/exportActions.ts'
import { deserializeState } from '../../../src/store/serialization.ts'
import { hashOf, payloadWithRefusedRun, resetReceiver, sendBoard, sentPayload } from '../../helpers/replayFixtures.ts'
import { TournamentType, DAY_AXIS_SPACING_MINS } from '../../../src/engine/types.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import { scheduleAll } from '../../../src/engine/scheduler.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  saveViewState,
} from '../../../src/store/viewState.ts'

// A pass-through spy: the engine is the real one, and the shell case below
// counts its runs (020 R3).
vi.mock('../../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

// 004 T007 — boot behavior (FR-007, S2-contract.md §Boot): no fragment loads
// the default preset and auto-schedules it, a `#config=` fragment loads that
// state instead of the preset, and a fragment that fails to decode falls
// back to the preset rather than leaving an empty form.

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
  vi.mocked(scheduleAll).mockClear()
})

// Spies and fake timers are restored here, not at the end of each test body, so
// a failed assertion cannot leave console.error or the clock replaced for the
// next test.
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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

// 018 T4 (R7): a refused link boots B1 and says why on the board, until the
// notice is dismissed or the next load succeeds.
describe('bootstrap with a refused #config= link (018 T4, R7)', () => {
  /** A link whose first event holds a fencer count the engine cannot size. */
  function zeroCountHash(): { hash: string; eventId: string } {
    const payload = sentPayload(sendBoard())
    const eventId = Object.keys(payload.competitions)[0]
    payload.competitions[eventId].fencer_count = 0
    resetReceiver()
    return { hash: hashOf(payload), eventId }
  }

  function noticeIn(center: HTMLElement): HTMLElement | null {
    return center.querySelector<HTMLElement>('[data-load-refusal]')
  }

  it('stores the refusal reason, still boots the default preset, and still logs the error', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { hash, eventId } = zeroCountHash()

    bootstrap(hash)

    const state = useStore.getState()
    expect(state.loadRefusal).toContain(eventId)
    expect(state.loadedPresetId).toBe(DEFAULT_PRESET_ID)
    expect(Object.keys(state.placements).length).toBeGreaterThan(0)
    expect(consoleError).toHaveBeenCalled()
  })

  it('stores a reason for an undecodable link too, not only for a count', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    bootstrap('#config=not-a-valid-base64url-payload!!!')
    expect(useStore.getState().loadRefusal).toContain('Invalid base64url encoding')
  })

  it('stores no refusal for a readable link or for no link', () => {
    bootstrap(sendBoard().hash)
    expect(useStore.getState().loadRefusal).toBeNull()
    resetReceiver()
    bootstrap('')
    expect(useStore.getState().loadRefusal).toBeNull()
  })

  it('shows a notice in the center view with the reason and the preset shown instead', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { hash, eventId } = zeroCountHash()
    bootstrap(hash)
    render(<WorkbenchShell />)

    const center = screen.getByRole('main', { name: 'Center view' })
    const notice = noticeIn(center)
    expect(notice).not.toBeNull()
    expect(notice).toHaveTextContent(/couldn.t be opened/i)
    expect(notice).toHaveTextContent(eventId)
    expect(notice).toHaveTextContent(DEFAULT_PRESET_ID)
  })

  it('keeps the notice, and not its Dismiss button, in a live region of its own beside the stale banner\'s', () => {
    vi.useFakeTimers()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    // The switch is how a test reaches a stale board on purpose (020 R5).
    saveViewState({ ...DEFAULT_VIEW_STATE, autoRerun: false })
    const { hash } = zeroCountHash()
    bootstrap(hash)
    render(<WorkbenchShell />)
    // Stale the board so both notices are up together, the case the placement is for.
    act(() => useStore.getState().setStrips(useStore.getState().strips_total + 1))
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS + 1)
    })

    const center = screen.getByRole('main', { name: 'Center view' })
    const notice = noticeIn(center)!
    const staleBanner = center.querySelector<HTMLElement>('[data-stale-banner]')
    expect(staleBanner, 'premise: the stale banner is showing').not.toBeNull()

    const noticeRegion = notice.querySelector<HTMLElement>('[role="status"]')
    const staleRegion = staleBanner!.closest<HTMLElement>('[role="status"]')
    expect(noticeRegion).not.toBeNull()
    expect(noticeRegion).toHaveTextContent(/couldn.t be opened/i)
    expect(noticeRegion).not.toBe(staleRegion)
    expect(staleBanner!.closest('[data-load-refusal]')).toBeNull()
    expect(noticeRegion!.contains(staleBanner)).toBe(false)
    expect(staleRegion!.contains(notice)).toBe(false)

    const dismiss = within(notice).getByRole('button', { name: /dismiss/i })
    expect(dismiss.closest('[role="status"]')).toBeNull()
  })

  it('renders no notice when nothing was refused, but keeps the live region mounted', () => {
    bootstrap('')
    render(<WorkbenchShell />)
    const center = screen.getByRole('main', { name: 'Center view' })
    expect(noticeIn(center)).toBeNull()
    expect(within(center).getAllByRole('status').length).toBeGreaterThanOrEqual(2)
  })

  it('removes the notice and clears the stored reason when it is dismissed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { hash } = zeroCountHash()
    bootstrap(hash)
    render(<WorkbenchShell />)
    const center = screen.getByRole('main', { name: 'Center view' })

    fireEvent.click(within(noticeIn(center)!).getByRole('button', { name: /dismiss/i }))

    expect(noticeIn(center)).toBeNull()
    expect(useStore.getState().loadRefusal).toBeNull()
  })

  describe('a later successful load clears it', () => {
    function refusedBoot(): void {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      bootstrap(zeroCountHash().hash)
      expect(useStore.getState().loadRefusal, 'premise: the link was refused').not.toBeNull()
    }

    it('a preset', () => {
      refusedBoot()
      applyPreset('B2')
      expect(useStore.getState().loadRefusal).toBeNull()
    })

    it('a template', () => {
      refusedBoot()
      useStore.getState().applyTemplate('RYC Weekend')
      expect(useStore.getState().loadRefusal).toBeNull()
    })

    it('a file or link', () => {
      const sent = sendBoard()
      const parsed = deserializeState(sent.json)
      if ('error' in parsed) throw new Error(parsed.error)
      resetReceiver()
      refusedBoot()
      applyLoadedState(parsed.state, parsed.run)
      expect(useStore.getState().loadRefusal).toBeNull()
    })
  })
})

// 020 T3 (R5, R5a, R3): the feature turns on here. `bootstrap` seeds the
// store's flag from the viewer's stored preference before anything else, on
// the link path and the preset path alike.
describe('bootstrap seeds autoRerun from the stored view state (020 T3)', () => {
  /** A link whose sender's board carries no run, so it opens stale (R3). */
  function noRunHash(): string {
    const payload = sentPayload(sendBoard())
    delete payload.run
    resetReceiver()
    return hashOf(payload)
  }

  it('is on with nothing stored', () => {
    bootstrap('')
    expect(useStore.getState().autoRerun).toBe(true)
  })

  it('is off when the stored preference is off', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, autoRerun: false })
    bootstrap('')
    expect(useStore.getState().autoRerun).toBe(false)
  })

  // The flag starts false, so a seed that only ever turns it on would pass the
  // case above. Booting on first, then again with the preference off, proves
  // the seed also resets a flag that is already true.
  it('a boot with the preference off turns off a flag that an earlier boot turned on', () => {
    bootstrap('')
    expect(useStore.getState().autoRerun, 'premise: the first boot turned it on').toBe(true)

    saveViewState({ ...DEFAULT_VIEW_STATE, autoRerun: false })
    bootstrap('')

    expect(useStore.getState().autoRerun).toBe(false)
  })

  it.each([
    ['on with nothing stored', null, true],
    ['off when the stored preference is off', false, false],
  ])('on a link boot, is %s', (_name, stored, expected) => {
    const hash = sendBoard().hash
    resetReceiver()
    if (stored !== null) saveViewState({ ...DEFAULT_VIEW_STATE, autoRerun: stored })

    bootstrap(hash)

    expect(useStore.getState().autoRerun).toBe(expected)
  })

  // The seed lands before the shell renders and before any run, so a link
  // without a run opens stale and stays so (R3). The edit after it is the
  // positive control: the feature is on, and the next edit re-runs as usual.
  it('opens a no-run link stale for 2 s in the full shell with no run, then re-runs the next edit', () => {
    vi.useFakeTimers()
    bootstrap(noRunHash())
    render(<WorkbenchShell />)
    vi.mocked(scheduleAll).mockClear()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(vi.mocked(scheduleAll)).toHaveBeenCalledTimes(0)
    expect(document.querySelectorAll('[data-stale-banner]')).toHaveLength(1)

    act(() => useStore.getState().setStrips(useStore.getState().strips_total + 1))
    act(() => {
      vi.advanceTimersByTime(RERUN_DEBOUNCE_MS)
    })
    expect(vi.mocked(scheduleAll)).toHaveBeenCalledTimes(1)
  })
})
