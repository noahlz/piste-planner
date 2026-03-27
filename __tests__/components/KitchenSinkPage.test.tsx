import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { KitchenSinkPage } from '../../src/components/KitchenSinkPage.tsx'
import { useStore } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { BottleneckSeverity, BottleneckCause } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.restoreAllMocks()
})

// ──────────────────────────────────────────────
// Step 11.1: Render tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage render tests', () => {
  it('renders without crashing', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument()
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
    expect(document.getElementById('strips-total')).toBeInTheDocument()
  })

  it('renders video strips input', () => {
    render(<KitchenSinkPage />)
    expect(document.getElementById('video-strips')).toBeInTheDocument()
  })

  it('renders pod captain select', () => {
    render(<KitchenSinkPage />)
    expect(document.getElementById('pod-captain')).toBeInTheDocument()
  })

  it('renders template selector', () => {
    render(<KitchenSinkPage />)
    expect(document.getElementById('template-select')).toBeInTheDocument()
  })

  it('renders Validate button', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByRole('button', { name: 'Validate' })).toBeInTheDocument()
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

  it('shows placeholder text in AnalysisOutput before validate', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByText('Run Validate to see results.')).toBeInTheDocument()
  })

  it('shows placeholder text in ScheduleOutput before generate', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByText('Run Generate Schedule to see results.')).toBeInTheDocument()
  })

  it('shows empty fencer counts message when no competitions selected', () => {
    render(<KitchenSinkPage />)
    expect(screen.getByText('Select competitions above to enter fencer counts.')).toBeInTheDocument()
  })

  it('renders competition checkboxes when template is applied', () => {
    const templateIds = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    render(<KitchenSinkPage />)
    const checkboxes = screen.getAllByRole('checkbox')
    const checked = checkboxes.filter((cb) => (cb as HTMLInputElement).checked)
    expect(checked.length).toBe(templateIds.length)
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
  it('selecting a template checks competition checkboxes', () => {
    render(<KitchenSinkPage />)
    const templateSelect = document.getElementById('template-select') as HTMLSelectElement

    fireEvent.change(templateSelect, { target: { value: 'RYC Weekend' } })

    // TEMPLATES['RYC Weekend'] has 18 competitions
    const templateIds = TEMPLATES['RYC Weekend']
    const state = useStore.getState()
    expect(Object.keys(state.selectedCompetitions)).toHaveLength(templateIds.length)
  })

  it('selecting a template shows fencer count inputs', () => {
    render(<KitchenSinkPage />)
    const templateSelect = document.getElementById('template-select') as HTMLSelectElement

    fireEvent.change(templateSelect, { target: { value: 'RYC Weekend' } })

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

  it('after validate, analysis output appears', () => {
    // Set up config with competitions but 0 strips — guarantees validation errors
    useStore.getState().applyTemplate('RYC Weekend')
    useStore.getState().setDays(2)
    // strips_total stays at 0 (default), so validation will produce errors

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    // Validation errors are guaranteed with 0 strips, so placeholder should be gone
    expect(screen.queryByText('Run Validate to see results.')).not.toBeInTheDocument()
    // And errors should be visible
    const state = useStore.getState()
    expect(state.validationErrors.length).toBeGreaterThan(0)
  })

  it('validation errors appear when strips is 0 with competitions selected', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    // strips_total stays at 0 (default) — guaranteed validation error

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    // Placeholder should be replaced with actual validation content
    expect(screen.queryByText('Run Validate to see results.')).not.toBeInTheDocument()
    // Validation heading should appear (errors are grouped under it)
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })

  it('clicking Generate Schedule populates schedule output table', () => {
    // Set up config with enough resources for scheduling to succeed
    useStore.getState().applyTemplate('RYC Weekend')
    useStore.getState().setDays(2)
    useStore.getState().setStrips(24)
    useStore.getState().setVideoStrips(4)
    // Set refs for both days
    useStore.getState().setDayRefs(0, { foil_epee_refs: 10, sabre_refs: 6 })
    useStore.getState().setDayRefs(1, { foil_epee_refs: 10, sabre_refs: 6 })

    render(<KitchenSinkPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate Schedule' }))

    // Schedule table should now be visible (placeholder gone)
    expect(screen.queryByText('Run Generate Schedule to see results.')).not.toBeInTheDocument()
    // Schedule output should have results or at least bottleneck messages
    const state = useStore.getState()
    const hasResults = Object.keys(state.scheduleResults).length > 0 || state.bottlenecks.length > 0
    expect(hasResults).toBe(true)
  })

  it('full flow: template -> fencer counts -> validate -> see validation section', () => {
    render(<KitchenSinkPage />)

    // Step 1: Apply template
    fireEvent.change(document.getElementById('template-select') as HTMLSelectElement, {
      target: { value: 'RYC Weekend' },
    })

    // Step 2: Set strips
    fireEvent.change(document.getElementById('strips-total') as HTMLInputElement, {
      target: { value: '12' },
    })

    // Step 3: Enter some fencer counts
    const fencerInputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    fencerInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '30' } })
    })

    // Step 4: Validate
    fireEvent.click(screen.getByRole('button', { name: 'Validate' }))

    // Validation section header should appear
    expect(screen.queryByText('Run Validate to see results.')).not.toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Step 11.3: Store integration tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage store integration tests', () => {
  it('changing tournament type dropdown updates store state', () => {
    render(<KitchenSinkPage />)
    const select = document.getElementById('tournament-type') as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'RYC' } })

    expect(useStore.getState().tournament_type).toBe('RYC')
  })

  it('changing days input updates store state', () => {
    render(<KitchenSinkPage />)
    const daysInput = document.getElementById('days-available') as HTMLInputElement

    fireEvent.change(daysInput, { target: { value: '2' } })

    expect(useStore.getState().days_available).toBe(2)
  })

  it('changing strips input updates store state', () => {
    render(<KitchenSinkPage />)
    const stripsInput = document.getElementById('strips-total') as HTMLInputElement

    fireEvent.change(stripsInput, { target: { value: '20' } })

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

    expect(useStore.getState().selectedCompetitions[firstId].fencer_count).toBe(64)
  })

  it('applying template marks store as stale', () => {
    render(<KitchenSinkPage />)

    fireEvent.change(document.getElementById('template-select') as HTMLSelectElement, {
      target: { value: 'RYC Weekend' },
    })

    expect(useStore.getState().analysisStale).toBe(true)
    expect(useStore.getState().scheduleStale).toBe(true)
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

  it('saved JSON contains expected structure', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    useStore.getState().setStrips(12)

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
        expect(parsed.schemaVersion).toBe(1)
        expect(parsed.tournament).toBeDefined()
        expect(parsed.competitions).toBeDefined()
        expect(parsed.referees).toBeDefined()
        expect(parsed.tournament.strips_total).toBe(12)
        resolve()
      }
      reader.readAsText(capturedBlob!)
    })
  })
})

describe('SaveLoadShare load tests', () => {
  it('loading valid JSON hydrates store state', async () => {
    // Prepare a valid serialized state
    useStore.getState().setStrips(18)
    useStore.getState().applyTemplate('RJCC Weekend')
    const state = useStore.getState()
    const json = serializeState(state)

    // Reset store
    useStore.setState(useStore.getInitialState())
    expect(useStore.getState().strips_total).toBe(0)

    render(<KitchenSinkPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([json], 'tournament.piste.json', { type: 'application/json' })

    // Simulate file selection
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(useStore.getState().strips_total).toBe(18)
    })
  })

  it('loading valid JSON clears any previous load error', async () => {
    // First trigger an error
    useStore.setState(useStore.getInitialState())
    render(<KitchenSinkPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    // Upload invalid JSON to set error
    const invalidFile = new File(['not valid json!!!'], 'bad.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [invalidFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    // Now upload valid JSON
    const validJson = serializeState(useStore.getState())
    const validFile = new File([validJson], 'tournament.piste.json', { type: 'application/json' })
    Object.defineProperty(fileInput, 'files', { value: [validFile], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('loading invalid JSON shows error message', async () => {
    render(<KitchenSinkPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['{ this is not valid json }'], 'bad.json', { type: 'application/json' })

    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })

  it('loading JSON with wrong schema shows error message', async () => {
    render(<KitchenSinkPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    // Valid JSON but wrong schema (missing required fields)
    const wrongSchema = JSON.stringify({ schemaVersion: 2, foo: 'bar' })
    const file = new File([wrongSchema], 'wrong.json', { type: 'application/json' })

    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})

// ──────────────────────────────────────────────
// Step 11.5: Error state tests
// ──────────────────────────────────────────────

describe('KitchenSinkPage error state tests', () => {
  it('malformed file upload shows error message', async () => {
    render(<KitchenSinkPage />)

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['malformed!!!content'], 'bad.json', { type: 'application/json' })

    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)

    await waitFor(() => {
      const alert = screen.getByRole('alert')
      expect(alert).toBeInTheDocument()
      expect(alert.textContent).toBeTruthy()
    })
  })

  it('Generate Schedule button is disabled when there are hard validation errors', () => {
    // Inject hard ERROR into store directly
    useStore.getState().setAnalysisResults(
      [{ field: 'strips_total', message: 'Must be > 0', severity: BottleneckSeverity.ERROR }],
      { warnings: [], suggestions: [] },
    )

    render(<KitchenSinkPage />)

    const generateBtn = screen.getByRole('button', { name: 'Generate Schedule' })
    expect(generateBtn).toBeDisabled()
  })

  it('Generate Schedule button is enabled when there are only warnings', () => {
    useStore.getState().setAnalysisResults(
      [],
      {
        warnings: [{
          competition_id: 'CDT-M-FOIL-IND',
          phase: 'pool',
          cause: BottleneckCause.STRIP_CONTENTION,
          severity: BottleneckSeverity.WARN,
          delay_mins: 10,
          message: 'Strip contention',
        }],
        suggestions: [],
      },
    )

    render(<KitchenSinkPage />)

    const generateBtn = screen.getByRole('button', { name: 'Generate Schedule' })
    expect(generateBtn).not.toBeDisabled()
  })

  it('schedule output shows results after setScheduleResults in store', () => {
    const results = {
      'CDT-M-FOIL-IND': {
        competition_id: 'CDT-M-FOIL-IND',
        assigned_day: 0,
        use_flighting: false,
        is_priority: false,
        flighting_group_id: null,
        pool_start: 480,
        pool_end: 600,
        pool_strips_count: 4,
        pool_refs_count: 4,
        flight_a_start: null,
        flight_a_end: null,
        flight_a_strips: 0,
        flight_a_refs: 0,
        flight_b_start: null,
        flight_b_end: null,
        flight_b_strips: 0,
        flight_b_refs: 0,
        entry_fencer_count: 30,
        promoted_fencer_count: 30,
        bracket_size: 32,
        cut_mode: 'DISABLED' as const,
        cut_value: 0,
        de_mode: 'SINGLE_BLOCK' as const,
        de_video_policy: 'BEST_EFFORT' as const,
        de_start: 610,
        de_end: null,
        de_strips_count: 4,
        de_prelims_start: null,
        de_prelims_end: null,
        de_prelims_strips: 0,
        de_round_of_16_start: null,
        de_round_of_16_end: null,
        de_round_of_16_strips: 0,
        de_finals_start: null,
        de_finals_end: null,
        de_finals_strips: 0,
        de_bronze_start: null,
        de_bronze_end: null,
        de_bronze_strip_id: null,
        de_total_end: 750,
        conflict_score: 0,
        pool_duration_baseline: 120,
        pool_duration_actual: 120,
        de_duration_baseline: 140,
        de_duration_actual: 140,
        sabre_fillin_used: false,
        constraint_relaxation_level: 0,
        accepted_warnings: [],
      },
    }

    useStore.getState().setScheduleResults(results, [])

    render(<KitchenSinkPage />)

    // The schedule table should be visible
    expect(screen.getByText('Competition')).toBeInTheDocument()
    expect(screen.getByText('CDT-M-FOIL-IND')).toBeInTheDocument()
    expect(screen.queryByText('Run Generate Schedule to see results.')).not.toBeInTheDocument()
  })

  it('Generate Link produces URL containing #config= hash', () => {
    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }))

    const urlInputs = document.querySelectorAll('input[type="text"][readonly]')
    expect(urlInputs.length).toBe(1)
    expect((urlInputs[0] as HTMLInputElement).value).toContain('#config=')
  })
})

// ──────────────────────────────────────────────
// Additional: Analysis output section tests
// ──────────────────────────────────────────────

describe('AnalysisOutput section', () => {
  it('shows Validation heading when there are validation errors', () => {
    useStore.getState().setAnalysisResults(
      [{ field: 'strips_total', message: 'Must be > 0', severity: BottleneckSeverity.ERROR }],
      { warnings: [], suggestions: [] },
    )

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })

  it('shows Warnings heading when there are warnings', () => {
    useStore.getState().setAnalysisResults([], {
      warnings: [{
        competition_id: 'CDT-M-FOIL-IND',
        phase: 'pool',
        cause: BottleneckCause.STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: 10,
        message: 'Strip contention expected',
      }],
      suggestions: [],
    })

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Warnings' })).toBeInTheDocument()
  })

  it('shows Flighting Suggestions heading with Accept/Reject buttons', () => {
    useStore.getState().setAnalysisResults([], {
      warnings: [],
      suggestions: ['Flight the cadet events on day 1 and day 2'],
    })

    render(<KitchenSinkPage />)

    expect(screen.getByRole('heading', { name: 'Flighting Suggestions' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
  })

  it('clicking Accept changes suggestion state to Accepted', () => {
    useStore.getState().setAnalysisResults([], {
      warnings: [],
      suggestions: ['Flight the cadet events'],
    })

    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

    expect(screen.getByText('Accepted')).toBeInTheDocument()
    expect(useStore.getState().flightingSuggestionStates[0]).toBe('accepted')
  })

  it('clicking Reject changes suggestion state to Rejected', () => {
    useStore.getState().setAnalysisResults([], {
      warnings: [],
      suggestions: ['Flight the cadet events'],
    })

    render(<KitchenSinkPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(useStore.getState().flightingSuggestionStates[0]).toBe('rejected')
  })
})
