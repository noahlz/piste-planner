import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'
import {
  URL_SIZE_WARNING_BYTES,
  SAVE_FILE_NAME,
  saveToFile,
  parseTournamentFile,
  applyLoadedState,
  buildShareLink,
  shareLinkExceedsLimit,
  copyToClipboard,
} from '../../src/store/exportActions.ts'

// ──────────────────────────────────────────────
// Setup
// ──────────────────────────────────────────────

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Stubs URL.createObjectURL/revokeObjectURL and document.createElement('a') so
 * saveToFile's anchor-click download path can be observed without a real DOM download. */
function stubDownload() {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

  const originalCreateElement = document.createElement.bind(document)
  const mockClick = vi.fn()
  const mockAnchor = { href: '', download: '', click: mockClick } as unknown as HTMLAnchorElement
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'a') return mockAnchor
    return originalCreateElement(tag)
  })

  return { createObjectURL, revokeObjectURL, mockClick, mockAnchor }
}

/** Reads a Blob's text via FileReader — jsdom's Blob has no .text(). */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsText(blob)
  })
}

/** Builds a valid v2 payload: RYC Weekend template plus one placement on its first event.
 * Sets strips_total to a non-default 27 (applyLoadedState's own case below) so a test
 * asserting the store is untouched after parsing has a value that would actually move. */
function validPayload(): { json: string; eventId: string } {
  const eventId = TEMPLATES['RYC Weekend'][0]
  useStore.getState().applyTemplate('RYC Weekend')
  useStore.getState().setPlacementsFromAuto({ [eventId]: makePlacement({ strip_count: 5 }) })
  useStore.getState().setStrips(27)
  return { json: serializeState(useStore.getState()), eventId }
}

// ──────────────────────────────────────────────
// saveToFile
// ──────────────────────────────────────────────

describe('saveToFile', () => {
  it('creates an object URL from a Blob of the serialized state', () => {
    const { createObjectURL } = stubDownload()
    useStore.getState().setStrips(12)

    saveToFile(useStore.getState())

    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    return readBlobText(blob).then((text) => {
      expect(text).toBe(serializeState(useStore.getState()))
    })
  })

  it('clicks an anchor downloading SAVE_FILE_NAME, then revokes the object URL', () => {
    const { revokeObjectURL, mockClick, mockAnchor } = stubDownload()

    saveToFile(useStore.getState())

    expect(mockClick).toHaveBeenCalledOnce()
    expect(mockAnchor.download).toBe(SAVE_FILE_NAME)
    expect(revokeObjectURL).toHaveBeenCalledOnce()
  })

  it('defaults to the live store state when called with no argument', () => {
    const { createObjectURL } = stubDownload()
    useStore.getState().setStrips(9)

    saveToFile()

    const blob = createObjectURL.mock.calls[0][0] as Blob
    return readBlobText(blob).then((text) => {
      expect(JSON.parse(text).tournament.strips_total).toBe(9)
    })
  })
})

// ──────────────────────────────────────────────
// parseTournamentFile
// ──────────────────────────────────────────────

describe('parseTournamentFile', () => {
  it('resolves state and no dropped placements for a valid payload, without touching the store', async () => {
    const { json, eventId } = validPayload()
    useStore.setState(useStore.getInitialState())

    const result = await parseTournamentFile(new File([json], SAVE_FILE_NAME, { type: 'application/json' }))

    expect('error' in result).toBe(false)
    if ('error' in result) throw new Error('unreachable')
    expect(result.droppedPlacements).toEqual([])
    expect(result.state.placements).toHaveProperty(eventId)
    // Parsing alone must not mutate the store — that is applyLoadedState's job.
    // validPayload() sets strips_total to 27, so this only proves non-mutation
    // if the store still reads its untouched initial 0 here, then 27 once
    // applyLoadedState actually writes the parsed state.
    expect(useStore.getState().strips_total).toBe(0)
    applyLoadedState(result.state)
    expect(useStore.getState().strips_total).toBe(27)
  })

  it('reports a placement whose event id is not in the payload competitions as dropped', async () => {
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
      globalOverrides: {},
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

    const result = await parseTournamentFile(new File([json], SAVE_FILE_NAME))

    if ('error' in result) throw new Error('unreachable')
    expect(result.droppedPlacements).toEqual(['GHOST-EVENT'])
  })

  it('resolves an error for invalid JSON', async () => {
    const result = await parseTournamentFile(new File(['not valid json!!!'], SAVE_FILE_NAME))
    expect('error' in result).toBe(true)
    if (!('error' in result)) throw new Error('unreachable')
    expect(result.error.length).toBeGreaterThan(0)
  })

  it('resolves an error for a wrong-schema object', async () => {
    const result = await parseTournamentFile(
      new File([JSON.stringify({ schemaVersion: 2, foo: 'bar' })], SAVE_FILE_NAME),
    )
    expect('error' in result).toBe(true)
    if (!('error' in result)) throw new Error('unreachable')
    expect(result.error.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// applyLoadedState
// ──────────────────────────────────────────────

describe('applyLoadedState', () => {
  it('writes the given partial state onto the store', () => {
    applyLoadedState({ strips_total: 27 })
    expect(useStore.getState().strips_total).toBe(27)
  })
})

// ──────────────────────────────────────────────
// buildShareLink / shareLinkExceedsLimit
// ──────────────────────────────────────────────

describe('buildShareLink', () => {
  it('returns the current origin and pathname with a #config= hash', () => {
    useStore.getState().setStrips(12)

    const url = buildShareLink(useStore.getState())

    expect(url.startsWith(`${window.location.origin}${window.location.pathname}`)).toBe(true)
    expect(url).toContain('#config=')
  })

  it('defaults to the live store state when called with no argument', () => {
    useStore.getState().setStrips(15)
    expect(buildShareLink()).toContain('#config=')
  })
})

describe('shareLinkExceedsLimit', () => {
  it('is false for a short URL', () => {
    expect(shareLinkExceedsLimit('https://example.com/#config=short')).toBe(false)
  })

  it('is true once the URL exceeds URL_SIZE_WARNING_BYTES', () => {
    const longUrl = `https://example.com/#config=${'a'.repeat(URL_SIZE_WARNING_BYTES + 1)}`
    expect(shareLinkExceedsLimit(longUrl)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// copyToClipboard
// ──────────────────────────────────────────────

describe('copyToClipboard', () => {
  it('resolves true when the clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyToClipboard('some text')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('some text')
  })

  it('resolves false when the clipboard write rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyToClipboard('some text')).resolves.toBe(false)
  })
})
