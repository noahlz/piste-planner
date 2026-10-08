/**
 * The re-run fields and their writers (020 T1a): `autoRerun` and
 * `lastAttemptedKey` on the UI slice, `runScheduleAll`'s write of the key
 * before it calls the engine, and `applyLoadedState`'s seed of the loaded
 * key. Field-level assertions only. T1b adds `selectRerunDue` and puts a due
 * line beside each key comparison below ("the key has moved on" marks the
 * spot).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { configKeyOf } from '../../src/store/keptRun.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { applyLoadedState, parseTournamentFile, SAVE_FILE_NAME } from '../../src/store/exportActions.ts'
import { selectDrawnSchedule, RunState } from '../../src/store/derived.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { runPreset, runTemplate } from '../helpers/drawnFixtures.ts'
import { payloadWithRefusedRun, resetReceiver, sendBoard, sentPayload } from '../helpers/replayFixtures.ts'
import type { SendOptions, SentBoard } from '../helpers/replayFixtures.ts'

vi.mock('../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
  vi.mocked(scheduleAll).mockClear()
})

/** The key of the inputs the engine would read from the store as it stands. */
function currentKey(): string {
  const { config, competitions } = buildTournamentConfig(useStore.getState())
  return configKeyOf(config, competitions)
}

/** An edit to an engine input that moves the key and touches nothing else. */
function editStrips(): void {
  const { strips_total, setStrips } = useStore.getState()
  setStrips(strips_total + 1)
}

function runState(): RunState {
  return selectDrawnSchedule(useStore.getState()).runState
}

// ──────────────────────────────────────────────
// The UI slice's two fields
// ──────────────────────────────────────────────

describe('the re-run fields on the UI slice', () => {
  it('setAutoRerun writes the switch', () => {
    useStore.getState().setAutoRerun(true)
    expect(useStore.getState().autoRerun).toBe(true)

    useStore.getState().setAutoRerun(false)
    expect(useStore.getState().autoRerun).toBe(false)
  })

  // Guard: green against the stub too, which declares both fields.
  it('a store reset gives autoRerun false and lastAttemptedKey null', () => {
    useStore.setState({ autoRerun: true, lastAttemptedKey: 'a-key' })

    useStore.setState(useStore.getInitialState(), true)

    expect(useStore.getState().autoRerun).toBe(false)
    expect(useStore.getState().lastAttemptedKey).toBeNull()
  })
})

// ──────────────────────────────────────────────
// runScheduleAll writes the key it is about to run
// ──────────────────────────────────────────────

describe('runScheduleAll records the key it ran', () => {
  it.each([
    ['a preset pick followed by its run', () => runPreset('B1')],
    ['a template pick followed by its run', () => runTemplate('RYC Weekend')],
  ])('after %s, the last-attempted key is the run\'s key and the board is fresh', (_name, pickAndRun) => {
    expect(useStore.getState().lastAttemptedKey, 'premise: nothing attempted yet').toBeNull()

    pickAndRun()

    const { lastRun, lastAttemptedKey } = useStore.getState()
    expect(lastRun, 'premise: the run was kept').not.toBeNull()
    expect(lastAttemptedKey).toBe(lastRun?.configKey)
    expect(lastAttemptedKey).toBe(currentKey())
    expect(runState()).toBe(RunState.FRESH)

    // The positive control: an edit moves the key away from the one recorded.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
  })

  it('writes the key before it calls the engine, so a run that throws records it and keeps no run', () => {
    runPreset('B1')
    expect(useStore.getState().lastRun, 'premise: the first run was kept').not.toBeNull()
    editStrips()
    const editedKey = currentKey()
    expect(useStore.getState().lastAttemptedKey, 'premise: the edit has not been attempted').not.toBe(editedKey)
    let keyInsideEngine: string | null = null
    vi.mocked(scheduleAll).mockImplementationOnce(() => {
      keyInsideEngine = useStore.getState().lastAttemptedKey
      throw new Error('boom')
    })

    runScheduleAll()

    expect(keyInsideEngine).toBe(editedKey)
    expect(useStore.getState().lastAttemptedKey).toBe(editedKey)
    expect(useStore.getState().lastRun).toBeNull()
    expect(runState()).toBe(RunState.STALE)

    // The key has moved on after one more edit, as it does after a good run.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
  })
})

// ──────────────────────────────────────────────
// applyLoadedState seeds the key of the loaded inputs
// ──────────────────────────────────────────────

/** Parses a saved file's text and applies it, as the app's file load does. */
async function receive(json: string): Promise<string | null> {
  const parsed = await parseTournamentFile(new File([json], SAVE_FILE_NAME, { type: 'application/json' }))
  if ('error' in parsed) throw new Error(parsed.error)
  return applyLoadedState(parsed.state, parsed.run)
}

/** Sends `options`' board and returns it with the key of the inputs it ran, the receiver reset after it. */
function sendAndReset(options: SendOptions = {}): { sent: SentBoard; senderKey: string } {
  const sent = sendBoard(options)
  const senderKey = useStore.getState().lastRun?.configKey
  expect(senderKey, 'premise: the sender holds a kept run').toBeDefined()
  return { sent, senderKey: senderKey! }
}

describe('applyLoadedState seeds the last-attempted key (R3: loads open stale)', () => {
  it.each([
    {
      name: 'a file carrying no run',
      options: {} as SendOptions,
      text: (sent: SentBoard) => {
        const payload = sentPayload(sent)
        delete payload.run
        return JSON.stringify(payload)
      },
      replayThrows: false,
    },
    {
      name: 'a file whose run is refused',
      options: { pinned: true } as SendOptions,
      text: (sent: SentBoard) => JSON.stringify(payloadWithRefusedRun(sent)),
      replayThrows: false,
    },
    {
      name: 'a file whose run replays into a throw',
      options: {} as SendOptions,
      text: (sent: SentBoard) => sent.json,
      replayThrows: true,
    },
  ])('opens $name stale, with the loaded key as the last attempt', async ({ options, text, replayThrows }) => {
    const { sent, senderKey } = sendAndReset(options)
    const json = text(sent)
    resetReceiver()
    // The replay's failure is logged by design (`replayRun`), so keep the log quiet.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    if (replayThrows) {
      vi.mocked(scheduleAll).mockImplementationOnce(() => {
        throw new Error('boom')
      })
    }

    try {
      await receive(json)
    } finally {
      warn.mockRestore()
    }

    expect(useStore.getState().lastRun).toBeNull()
    expect(runState()).toBe(RunState.STALE)
    expect(useStore.getState().lastAttemptedKey).toBe(senderKey)
    expect(useStore.getState().lastAttemptedKey).toBe(currentKey())

    // The next edit moves the key away from the seed.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
  })

  it('seeds the key of a run that replays, which is the replayed run\'s own key', async () => {
    const { sent, senderKey } = sendAndReset()
    resetReceiver()

    await receive(sent.json)

    expect(useStore.getState().lastRun?.configKey).toBe(senderKey)
    expect(useStore.getState().lastAttemptedKey).toBe(senderKey)
    expect(runState()).toBe(RunState.FRESH)
  })

  it('shows a subscriber the seed in the same notification as the loaded inputs', async () => {
    const { sent, senderKey } = sendAndReset()
    resetReceiver()
    expect(useStore.getState().strips_total, 'premise: the load changes the strips').not.toBe(
      sentPayload(sent).tournament.strips_total,
    )
    const seen: { inputsChanged: boolean; seed: string | null }[] = []
    const unsubscribe = useStore.subscribe((now, before) => {
      seen.push({
        inputsChanged:
          now.strips_total !== before.strips_total || now.selectedCompetitions !== before.selectedCompetitions,
        seed: now.lastAttemptedKey,
      })
    })
    try {
      await receive(sent.json)
    } finally {
      unsubscribe()
    }

    expect(seen[0]).toEqual({ inputsChanged: true, seed: senderKey })
  })

  // Guard: green before and after. `applyLoadedState` never writes the switch,
  // and no payload carries one (R5a).
  it.each([true, false])('leaves autoRerun as it was (%s)', async (before) => {
    const { sent } = sendAndReset()
    resetReceiver()
    useStore.setState({ autoRerun: before })

    await receive(sent.json)

    expect(useStore.getState().autoRerun).toBe(before)
  })
})
