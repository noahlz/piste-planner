import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'
import { selectDrawnSchedule, RunState } from '../../src/store/derived.ts'
import { moveHeadline } from '../helpers/drawnFixtures.ts'
import { Weapon } from '../../src/engine/types.ts'
import { DEFAULT_POOL_ROUND_DURATION_TABLE } from '../../src/engine/constants.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { payloadWithRefusedRun, resetReceiver, sendBoard, sentPayload } from '../helpers/replayFixtures.ts'
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

vi.mock('../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

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
    applyLoadedState(result.state, result.run)
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
    applyLoadedState({ strips_total: 27 }, null)
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

// ──────────────────────────────────────────────
// 017 T8: a saved file replays the sender's run (P6)
// ──────────────────────────────────────────────

async function receiveFile(json: string) {
  const result = await parseTournamentFile(new File([json], SAVE_FILE_NAME, { type: 'application/json' }))
  if ('error' in result) throw new Error(result.error)
  applyLoadedState(result.state, result.run)
  return result
}

describe('applyLoadedState with a run (017 T8)', () => {
  it.each([
    ['as saved', false],
    ['after one Move day', true],
  ])('draws the sender\'s board from a saved file %s', async (_name, moved) => {
    const sent = sendBoard({ moved })
    resetReceiver()

    await receiveFile(sent.json)

    expect(selectDrawnSchedule(useStore.getState())).toEqual(sent.drawn)
    expect(useStore.getState().lastRun).not.toBeNull()
  })

  it('replays the pins a pinned board was run with', async () => {
    const sent = sendBoard({ pinned: true, moved: true })
    const pins = useStore.getState().lastRun?.pins
    resetReceiver()

    await receiveFile(sent.json)

    expect(useStore.getState().lastRun?.pins).toEqual(pins)
    expect(selectDrawnSchedule(useStore.getState())).toEqual(sent.drawn)
  })

  it('writes no placement of its own, the loaded ones stay as saved', async () => {
    const sent = sendBoard({ moved: true })
    const saved = sentPayload(sent).placements
    resetReceiver()

    await receiveFile(sent.json)

    expect(useStore.getState().placements).toEqual(saved)
  })

  it('clears the previous run when the file carries none, even with an equal config key', async () => {
    const sent = sendBoard()
    const payload = sentPayload(sent)
    delete payload.run
    expect(useStore.getState().lastRun, 'premise: the sender still holds its run').not.toBeNull()

    await receiveFile(JSON.stringify(payload))

    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })

  it('clears the previous run and opens stale when the carried run is refused', async () => {
    const sent = sendBoard({ pinned: true })
    const payload = payloadWithRefusedRun(sent)

    const result = await receiveFile(JSON.stringify(payload))

    expect(result.runRefused).not.toBeNull()
    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })

  it('opens stale on a file saved after an input changed, as the sender would see it', async () => {
    const sent = sendBoard()
    useStore.getState().setStrips(useStore.getState().strips_total + 1)
    const json = serializeState(useStore.getState())
    expect(sent.drawn.runState, 'premise').toBe(RunState.FRESH)
    resetReceiver()

    await receiveFile(json)

    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })

  it('draws the same board as the sender after both make the same Move day', async () => {
    const sent = sendBoard()
    moveHeadline()
    const senderAfter = selectDrawnSchedule(useStore.getState())
    resetReceiver()
    await receiveFile(sent.json)

    moveHeadline()

    const receiverAfter = selectDrawnSchedule(useStore.getState())
    expect(receiverAfter.runState).toBe(RunState.FRESH)
    expect(receiverAfter).toEqual(senderAfter)
  })

  it('draws the sender\'s board over a receiver that had changed a pool duration', async () => {
    const sent = sendBoard()
    resetReceiver()
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, DEFAULT_POOL_ROUND_DURATION_TABLE.EPEE - 10)

    await receiveFile(sent.json)

    expect(useStore.getState().pool_round_duration_table).toEqual(DEFAULT_POOL_ROUND_DURATION_TABLE)
    expect(selectDrawnSchedule(useStore.getState())).toEqual(sent.drawn)
  })

  it('reports why the run was not replayed when the replay throws, and opens stale', async () => {
    const sent = sendBoard()
    resetReceiver()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(scheduleAll).mockImplementationOnce(() => {
      throw new Error('boom')
    })
    const parsed = await parseTournamentFile(new File([sent.json], SAVE_FILE_NAME))
    if ('error' in parsed) throw new Error(parsed.error)

    const failure = applyLoadedState(parsed.state, parsed.run)

    expect(failure).toMatch(/boom/)
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/replay/i), expect.stringMatching(/boom/))
    expect(useStore.getState().lastRun).toBeNull()
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.STALE)
  })

  it('reports no failure when the run replays', async () => {
    const sent = sendBoard()
    resetReceiver()
    const parsed = await parseTournamentFile(new File([sent.json], SAVE_FILE_NAME))
    if ('error' in parsed) throw new Error(parsed.error)

    expect(applyLoadedState(parsed.state, parsed.run)).toBeNull()
  })
})
