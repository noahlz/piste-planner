import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { KitchenSinkPage } from '../../src/components/KitchenSinkPage.tsx'
import { useStore } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.restoreAllMocks()
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** Selects a file in SaveLoadShare's hidden input and fires the change event. */
function uploadJson(json: string): void {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([json], 'tournament.piste.json', { type: 'application/json' })
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  fireEvent.change(fileInput)
}

// ──────────────────────────────────────────────
// Step 11.1: Render tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage render tests', () => {
  it('renders without crashing', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Generate Schedule' })).toBeInTheDocument()
  })

  it('renders tournament type dropdown', () => {
    render(<KitchenSinkPage />)
    expect(document.getElementById('tournament-type')).toBeInTheDocument()
  })

  it('renders days input', () => {
    render(<KitchenSinkPage />)
    expect(document.getElementById('days-available')).toBeInTheDocument()
  })

  it('renders strips input', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('spinbutton', { name: 'Number of strips' })).toBeInTheDocument()
  })

  it('renders video strips input', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toBeInTheDocument()
  })

  it('renders template selector', () => {
    render(<KitchenSinkPage />)
    // Template selector is now a ToggleGroup — check for a template name button
    expect(screen.getByRole('radio', { name: 'RYC Weekend' })).toBeInTheDocument()
  })

  it('renders no Validate button — findings derive on every render', () => {
    render(<KitchenSinkPage />)
    expect(screen.queryByRole('button', { name: 'Validate' })).not.toBeInTheDocument()
  })

  it('renders Generate Schedule button', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Generate Schedule' })).toBeInTheDocument()
  })

  it('renders Save to File button', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Save to File' })).toBeInTheDocument()
  })

  it('renders Generate Link button', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
  })

  it('shows findings on first render with no validate run', () => {
    // strips_total is 0 in the initial store — a hard error the derived findings
    // surface immediately.
    render(<KitchenSinkPage />)
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
    expect(screen.getByText(/strips_total must be > 0/)).toBeInTheDocument()
  })

  it('shows the analysis empty state when the inputs raise nothing', () => {
    seedValidConfig()
    render(<KitchenSinkPage />)
    expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()
  })

  it('shows the schedule empty state before anything is placed', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })

  it('shows empty fencer counts message when no competitions selected', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByText('Select competitions above to enter fencer counts.')).toBeInTheDocument()
  })

  it('renders competition toggles when template is applied', () => {
    const templateIds = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)
    // shadcn Toggle renders as role="button" with aria-pressed
    const toggles = screen.getAllByRole('button', { pressed: true })
    expect(toggles.length).toBe(templateIds.length)
  })

  it('renders file input for loading configurations', () => {
    render(<KitchenSinkPage />)
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Step 11.2: User flow tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage user flow tests', () => {
  it('selecting a template checks competition toggles', () => {
    render(<KitchenSinkPage />)
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    act(() => {
      useStore.getState().applyTemplate('RYC Weekend')
    })

    const templateIds = TEMPLATES['RYC Weekend']
    const state = useStore.getState()
    expect(Object.keys(state.selectedCompetitions)).toHaveLength(templateIds.length)
  })

  it('selecting a template shows fencer count inputs', () => {
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)

    // Fencer count inputs should appear for each selected competition
    const inputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('entering fencer counts updates the inputs', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)

    const inputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    const firstInput = inputs[0]

    fireEvent.change(firstInput, { target: { value: '48' } })

    expect((firstInput as HTMLInputElement).value).toBe('48')
  })

  it('analysis output follows an input change with no run in between', async () => {
    seedValidConfig()
    render(<KitchenSinkPage />)

    expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()

    // Drop strips to 0 — the derived findings pick it up on the re-render alone
    await act(async () => {
      useStore.getState().setStrips(0)
    })

    expect(screen.queryByText('Nothing to report for the current inputs.')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })

  it('validation errors appear when strips is 0 with competitions selected', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    // strips_total stays at 0 (default) — guaranteed validation error

    render(<KitchenSinkPage />)

    // Validation heading appears without any button press
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })

  it('clicking Generate Schedule writes placements and renders the derived table', async () => {
    const id = TEMPLATES['RYC Weekend'][0]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate Schedule' }))

    await waitFor(() => {
      expect(useStore.getState().placements[id]).toBeDefined()
      expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
      expect(screen.getByText(id)).toBeInTheDocument()
    })
  })

  it('full flow: template -> strips -> fencer counts -> findings track every edit', () => {
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)

    act(() => {
      useStore.getState().setStrips(12)
    })

    const fencerInputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    fencerInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '30' } })
    })

    // 18 events across 3 days on 12 strips still raises findings — and they are
    // on screen without a validate step.
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Step 11.3: Store integration tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage store integration tests', () => {
  it('changing tournament type updates store state', () => {
    render(<KitchenSinkPage />)
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    act(() => {
      useStore.getState().setTournamentType('RYC' as import('../../src/engine/types.ts').TournamentType)
    })

    expect(useStore.getState().tournament_type).toBe('RYC')
  })

  it('changing days input updates store state', () => {
    render(<KitchenSinkPage />)
    // Days is now a Radix Select; call store directly (matches tournament_type test pattern)
    act(() => {
      useStore.getState().setDays(2)
    })

    expect(useStore.getState().days_available).toBe(2)
  })

  it('changing strips input updates store state', () => {
    render(<KitchenSinkPage />)
    const stripsInput = screen.getByRole('spinbutton', { name: 'Number of strips' })

    fireEvent.change(stripsInput, { target: { value: '20' } })
    fireEvent.blur(stripsInput)

    expect(useStore.getState().strips_total).toBe(20)
  })

  it('changing fencer count input updates store state', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)

    const competitionIds = Object.keys(useStore.getState().selectedCompetitions).sort()
    const firstId = competitionIds[0]

    // Find the fencer count input for first competition and change it
    const input = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })[0]
    fireEvent.change(input, { target: { value: '64' } })
    fireEvent.blur(input)

    expect(useStore.getState().selectedCompetitions[firstId].fencer_count).toBe(64)
  })

  it('applying a template immediately changes what the analysis shows', async () => {
    seedValidConfig()
    render(<KitchenSinkPage />)

    expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()

    await act(async () => {
      useStore.getState().applyTemplate('RYC Weekend')
    })

    // No stale flag, no validate run — 18 more events change the findings on the spot
    expect(screen.queryByText('Nothing to report for the current inputs.')).not.toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Step 11.4: Save/load tests
// ──────────────────────────────────────────────

describe('SaveLoadShare save tests', () => {
  it('clicking Save to File triggers URL.createObjectURL', () => {
    const createObjectURL = vi.fn(() => 'blob:mock-url')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    // Capture the original createElement before mocking to avoid recursive calls
    const originalCreateElement = document.createElement.bind(document)
    const mockClick = vi.fn()
    const mockAnchor = { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return mockAnchor
      return originalCreateElement(tag)
    })

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to File' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(mockClick).toHaveBeenCalledOnce()
    expect(mockAnchor.download).toBe('tournament.piste.json')
  })

  it('saved JSON carries the v2 shape including placements', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().applyTemplate('RYC Weekend')
    useStore.getState().setStrips(12)
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })

    let capturedBlob: Blob | null = null
    const createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    })
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const originalCreateElement2 = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') return { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement
      return originalCreateElement2(tag)
    })

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to File' }))

    expect(capturedBlob).toBeTruthy()

    // jsdom's Blob doesn't support .text(), so use FileReader to read the content
    return new Promise<void>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => {
        const parsed = JSON.parse(reader.result as string)
        expect(parsed.schemaVersion).toBe(2)
        expect(parsed.tournament).toBeDefined()
        expect(parsed.competitions).toBeDefined()
        expect(parsed.tournament.strips_total).toBe(12)
        expect(parsed.placements[id].start_time).toBe(480)
        expect(parsed.dismissedFindings).toEqual([])
        resolve()
      }
      reader.readAsText(capturedBlob!)
    })
  })
})

describe('SaveLoadShare load tests', () => {
  // Validation findings render as role="alert" on every page now, so load errors
  // are matched by their text rather than by role.
  it('loading valid JSON hydrates store state', async () => {
    // Prepare a valid serialized state
    useStore.getState().setStrips(18)
    useStore.getState().applyTemplate('RJCC Weekend')
    const json = serializeState(useStore.getState())

    // Reset store
    useStore.setState(useStore.getInitialState())
    expect(useStore.getState().strips_total).toBe(0)

    render(<KitchenSinkPage />)
    uploadJson(json)

    await waitFor(() => {
      expect(useStore.getState().strips_total).toBe(18)
    })
  })

  it('loading a placement whose event is not selected reports the drop', async () => {
    render(<KitchenSinkPage />)

    const json = JSON.stringify({
      schemaVersion: 2,
      tournament: {
        tournament_type: 'RYC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 12,
        video_strips_total: 2,
      },
      competitions: {
        selectedCompetitions: {},
        globalOverrides: { ADMIN_GAP_MINS: 10, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 30 },
      },
      placements: {
        'GHOST-EVENT': {
          day: 0,
          start_time: 480,
          strip_count: 4,
          strips: null,
          source: 'auto',
          pinned: false,
        },
      },
      dismissedFindings: [],
    })
    uploadJson(json)

    await waitFor(() => {
      const notice = screen.getByRole('status')
      expect(notice.textContent).toMatch(/Dropped 1 placement/)
      expect(notice.textContent).toMatch(/GHOST-EVENT/)
    })
    // The rest of the configuration still loaded
    expect(useStore.getState().strips_total).toBe(12)
    expect(useStore.getState().placements).toEqual({})
  })

  it('loading a file with no orphan placements shows no drop notice', async () => {
    useStore.getState().setStrips(18)
    useStore.getState().applyTemplate('RJCC Weekend')
    const json = serializeState(useStore.getState())
    useStore.setState(useStore.getInitialState())

    render(<KitchenSinkPage />)
    uploadJson(json)

    await waitFor(() => {
      expect(useStore.getState().strips_total).toBe(18)
    })
    // The live region is always mounted (so it can announce), just empty here
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('loading valid JSON clears any previous load error', async () => {
    useStore.setState(useStore.getInitialState())
    render(<KitchenSinkPage />)

    uploadJson('not valid json!!!')

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON')).toBeInTheDocument()
    })

    uploadJson(serializeState(useStore.getState()))

    await waitFor(() => {
      expect(screen.queryByText('Invalid JSON')).not.toBeInTheDocument()
    })
  })

  it('loading invalid JSON shows error message', async () => {
    render(<KitchenSinkPage />)
    uploadJson('{ this is not valid json }')

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON')).toBeInTheDocument()
    })
  })

  it('loading JSON with wrong schema shows error message', async () => {
    render(<KitchenSinkPage />)
    uploadJson(JSON.stringify({ schemaVersion: 2, foo: 'bar' }))

    await waitFor(() => {
      expect(screen.getByText(/Unknown top-level field/)).toBeInTheDocument()
    })
  })
})

// ──────────────────────────────────────────────
// Step 11.5: Error state tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage error state tests', () => {
  it('malformed file upload shows error message', async () => {
    render(<KitchenSinkPage />)
    uploadJson('malformed!!!content')

    await waitFor(() => {
      expect(screen.getByText(/invalid|malformed|error|parse|json/i)).toBeInTheDocument()
    })
  })

  it('Generate Schedule is disabled while derived findings hold a hard error', () => {
    // strips_total 0 with competitions selected is a structural error
    useStore.getState().applyTemplate('RYC Weekend')

    render(<KitchenSinkPage />)

    expect(screen.getByRole('button', { name: 'Generate Schedule' })).toBeDisabled()
  })

  it('Generate Schedule is enabled once the hard error is fixed', async () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)

    expect(screen.getByRole('button', { name: 'Generate Schedule' })).toBeDisabled()

    await act(async () => {
      useStore.getState().selectCompetitions([])
      useStore.getState().setStrips(12)
    })

    expect(screen.getByRole('button', { name: 'Generate Schedule' })).not.toBeDisabled()
  })

  it('schedule output renders a row derived from a seeded placement', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })

    render(<KitchenSinkPage />)

    expect(screen.getByText(id)).toBeInTheDocument()
    // Pool start comes straight from the placement (480 minutes = 8:00)
    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)
    expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
  })

  it('a placement on a day past days_available is flagged, not hidden', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 7, strip_count: 5 }) })

    render(<KitchenSinkPage />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.getByText('Day 8 out of range')).toBeInTheDocument()
  })

  it('Generate Link produces URL containing #config= hash', () => {
    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }))

    const urlInputs = document.querySelectorAll('input[readonly]')
    expect(urlInputs.length).toBe(1)
    expect((urlInputs[0] as HTMLInputElement).value).toContain('#config=')
  })
})

// ──────────────────────────────────────────────
// Additional: Analysis output section tests
// ──────────────────────────────────────────────

describe('AnalysisOutput section', () => {
  /** One large event on a single strip: a strip deficit that raises warnings and one flighting suggestion. */
  function seedStripDeficit(): string {
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().setDays(3)
    useStore.getState().setStrips(1)
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 60 })
    return id
  }

  it('shows Validation heading when the inputs produce validation errors', () => {
    useStore.getState().applyTemplate('RYC Weekend')

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })

  it('shows Warnings heading when the analysis raises warnings', () => {
    seedStripDeficit()

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Warnings' })).toBeInTheDocument()
  })

  it('shows Flighting Suggestions heading with Accept/Reject buttons', () => {
    seedStripDeficit()

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Flighting Suggestions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('clicking Accept changes suggestion state to Accepted', () => {
    seedStripDeficit()

    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(useStore.getState().flightingSuggestionStates[0]).toBe('accepted')
  })

  it('clicking Reject changes suggestion state to Rejected', () => {
    seedStripDeficit()

    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(useStore.getState().flightingSuggestionStates[0]).toBe('rejected')
  })
})
