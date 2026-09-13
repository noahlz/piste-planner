import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ExportPopover } from '../../../src/components/workbench/ExportPopover.tsx'
import { useStore } from '../../../src/store/store.ts'
import { serializeState } from '../../../src/store/serialization.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 013 T010 — re-targets the deleted __tests__/components/saveLoadShare.test.tsx
// at ExportPopover, the Header's Popover wrapper over the same
// src/store/exportActions.ts behavior the retired top bar's save/load/share
// control exposed. `defaultOpen` renders the popover content pre-mounted,
// the same way select.test.tsx opens a Radix Select without a
// pointer-capture-dependent click.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Selects a file in the popover's hidden input and fires the change event. */
function uploadJson(json: string): void {
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File([json], 'tournament.piste.json', { type: 'application/json' })
  Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
  fireEvent.change(fileInput)
}

// ──────────────────────────────────────────────
// Render tests
// ──────────────────────────────────────────────

describe('ExportPopover render tests', () => {
  it('renders Save to File button', () => {
    render(<ExportPopover defaultOpen />)
    expect(screen.getByRole('button', { name: 'Save to File' })).toBeInTheDocument()
  })

  it('renders Generate Link button', () => {
    render(<ExportPopover defaultOpen />)
    expect(screen.getByRole('button', { name: 'Generate Link' })).toBeInTheDocument()
  })

  it('renders file input for loading configurations', () => {
    render(<ExportPopover defaultOpen />)
    expect(document.querySelector('input[type="file"]')).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Save tests
// ──────────────────────────────────────────────

describe('ExportPopover save tests', () => {
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

    render(<ExportPopover defaultOpen />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to File' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(mockClick).toHaveBeenCalledOnce()
    expect(mockAnchor.download).toBe('tournament.piste.json')
  })

  it('saved JSON carries the v3 shape including placements', () => {
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

    render(<ExportPopover defaultOpen />)
    fireEvent.click(screen.getByRole('button', { name: 'Save to File' }))

    expect(capturedBlob).toBeTruthy()

    // jsdom's Blob doesn't support .text(), so use FileReader to read the content
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string)
          expect(parsed.schemaVersion).toBe(3)
          expect(parsed.tournament).toBeDefined()
          expect(parsed.competitions).toBeDefined()
          expect(parsed.tournament.strips_total).toBe(12)
          expect(parsed.placements[id].start_time).toBe(480)
          expect(parsed.dismissedFindings).toEqual([])
          resolve()
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = reject
      reader.readAsText(capturedBlob!)
    })
  })
})

// ──────────────────────────────────────────────
// Load tests
// ──────────────────────────────────────────────

describe('ExportPopover load tests', () => {
  it('loading valid JSON hydrates store state', async () => {
    // Prepare a valid serialized state
    useStore.getState().setStrips(18)
    useStore.getState().applyTemplate('RJCC Weekend')
    const json = serializeState(useStore.getState())

    // Reset store
    useStore.setState(useStore.getInitialState())
    expect(useStore.getState().strips_total).toBe(0)

    render(<ExportPopover defaultOpen />)
    uploadJson(json)

    await waitFor(() => {
      expect(useStore.getState().strips_total).toBe(18)
    })
  })

  it('loading a placement whose event is not selected reports the drop', async () => {
    render(<ExportPopover defaultOpen />)

    const json = JSON.stringify({
      schemaVersion: 3,
      tournament: {
        tournament_type: 'RYC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 12,
        video_strips_total: 2,
      },
      competitions: {},
      globalOverrides: { ADMIN_GAP_MINS: 10, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 30 },
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

    render(<ExportPopover defaultOpen />)
    uploadJson(json)

    await waitFor(() => {
      expect(useStore.getState().strips_total).toBe(18)
    })
    // The live region is always mounted (so it can announce), just empty here
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('loading valid JSON clears any previous load error', async () => {
    useStore.setState(useStore.getInitialState())
    render(<ExportPopover defaultOpen />)

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
    render(<ExportPopover defaultOpen />)
    uploadJson('{ this is not valid json }')

    await waitFor(() => {
      expect(screen.getByText('Invalid JSON')).toBeInTheDocument()
    })
  })

  it('loading JSON with wrong schema shows error message', async () => {
    render(<ExportPopover defaultOpen />)
    uploadJson(JSON.stringify({ schemaVersion: 2, foo: 'bar' }))

    await waitFor(() => {
      expect(screen.getByText(/Unknown top-level field/)).toBeInTheDocument()
    })
  })

  // React review of T007 (013 T010 follow-up): parseTournamentFile's
  // readFileText rejects when FileReader fires onerror — a read failure, not
  // a parse failure. Uncaught, that rejection reaches no error boundary.
  // Stubs the global FileReader (rather than the module's parseTournamentFile)
  // so the assertion exercises handleLoad's real catch path end to end.
  it('a file read failure shows an alert and writes nothing to the store', async () => {
    class FailingFileReader {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      result: string | null = null
      error: DOMException = new DOMException('disk error', 'NotReadableError')
      readAsText() {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('FileReader', FailingFileReader)

    render(<ExportPopover defaultOpen />)
    uploadJson('{}')

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not read the file: disk error')
    })
    expect(useStore.getState().strips_total).toBe(0)
  })
})

// ──────────────────────────────────────────────
// Share tests
// ──────────────────────────────────────────────

describe('ExportPopover share tests', () => {
  it('Generate Link produces URL containing #config= hash', () => {
    render(<ExportPopover defaultOpen />)

    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }))

    const urlInputs = document.querySelectorAll('input[readonly]')
    expect(urlInputs.length).toBe(1)
    expect((urlInputs[0] as HTMLInputElement).value).toContain('#config=')
  })

  it('Copy writes the share link to a stubbed clipboard and reads "Copied"', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })

    render(<ExportPopover defaultOpen />)
    fireEvent.click(screen.getByRole('button', { name: 'Generate Link' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    })
    expect(writeText).toHaveBeenCalledOnce()
  })
})
