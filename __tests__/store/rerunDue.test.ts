/**
 * The re-run fields, their writers and the rule that reads them (020 T1a,
 * T1b): `autoRerun` and `lastAttemptedKey` on the UI slice,
 * `runScheduleAll`'s write of the key before it calls the engine,
 * `applyLoadedState`'s seed of the loaded key, and `selectRerunDue`,
 * `selectDueKey`, `selectConfigKey` and `selectHasBlocking` over them. Every
 * run and every load leaves the board not due, and the next edit to an engine
 * input makes it due (a due line sits beside each "the key has moved on").
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { configKeyOf } from '../../src/store/keptRun.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { applyLoadedState, parseTournamentFile, SAVE_FILE_NAME } from '../../src/store/exportActions.ts'
import {
  FindingSeverity,
  RunState,
  selectAllFindings,
  selectConfigKey,
  selectDrawnSchedule,
  selectDueKey,
  selectFindings,
  selectHasBlocking,
  selectRerunDue,
} from '../../src/store/derived.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import { runPreset, runTemplate } from '../helpers/drawnFixtures.ts'
import { ACTION_EDITS, FIELD_EDITS } from '../helpers/inputEdits.ts'
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

function due(): boolean {
  return selectRerunDue(useStore.getState())
}

function switchOn(): void {
  useStore.getState().setAutoRerun(true)
}

/** The Header's Auto-assign gate before 020: any Blocking row the Findings panel shows. */
function headerBlocking(): boolean {
  return selectFindings(useStore.getState()).some((row) => row.severity === FindingSeverity.BLOCKING)
}

/** The first placed event by code point, as the edit tables pick it. */
function firstPlacedId(): string {
  return Object.keys(useStore.getState().placements).sort()[0]
}

/** B1 after a run, with the switch as asked: the board the sweeps edit. */
function runB1(autoRerun: boolean): void {
  runPreset('B1')
  useStore.getState().setAutoRerun(autoRerun)
  expect(due(), 'premise: a fresh run is not due').toBe(false)
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
    // The pick resets the store, so the switch goes on after it. The rule is a
    // function of the state alone, so this reads as a pick made with it on.
    switchOn()
    expect(due()).toBe(false)

    // The positive control: an edit moves the key away from the one recorded.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
    expect(due()).toBe(true)
  })

  it('writes the key before it calls the engine, so a run that throws records it and keeps no run', () => {
    runPreset('B1')
    switchOn()
    expect(useStore.getState().lastRun, 'premise: the first run was kept').not.toBeNull()
    editStrips()
    const editedKey = currentKey()
    expect(useStore.getState().lastAttemptedKey, 'premise: the edit has not been attempted').not.toBe(editedKey)
    expect(due(), 'premise: the edit is due').toBe(true)
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
    // Not retried: the attempt is recorded although no run was kept.
    expect(due()).toBe(false)

    // The key has moved on after one more edit, as it does after a good run.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
    expect(due()).toBe(true)
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
    switchOn()
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
    // R3: a load that opens stale is not re-run by itself.
    expect(due()).toBe(false)

    // The next edit moves the key away from the seed.
    editStrips()
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
    expect(due()).toBe(true)
  })

  it('seeds the key of a run that replays, which is the replayed run\'s own key', async () => {
    const { sent, senderKey } = sendAndReset()
    resetReceiver()
    switchOn()

    await receive(sent.json)

    expect(useStore.getState().lastRun?.configKey).toBe(senderKey)
    expect(useStore.getState().lastAttemptedKey).toBe(senderKey)
    expect(runState()).toBe(RunState.FRESH)
    expect(due()).toBe(false)

    editStrips()
    expect(due()).toBe(true)
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

// ──────────────────────────────────────────────
// Every edit to an engine input is due (switch on), none is (switch off)
// ──────────────────────────────────────────────

describe('an edit to an engine input after a run makes the board due', () => {
  it.each(Object.keys(ACTION_EDITS))('action: %s is due with the switch on, and not with it off', (edit) => {
    runB1(true)
    ACTION_EDITS[edit]()
    expect(due()).toBe(true)
    expect(selectDueKey(useStore.getState())).toBe(currentKey())

    runB1(false)
    ACTION_EDITS[edit]()
    expect(due()).toBe(false)
    expect(selectDueKey(useStore.getState())).toBeNull()
  })

  // One raw write per field `buildTournamentConfig` reads (the proxy-checked
  // list), so a field missing from `selectConfigKey`'s memo deps hands back
  // the cached key here and fails.
  it.each(Object.keys(FIELD_EDITS))('field: %s moves selectConfigKey, and is due with the switch on, not with it off', (field) => {
    runB1(true)
    const before = selectConfigKey(useStore.getState())
    expect(before).toBe(useStore.getState().lastRun?.configKey)

    useStore.setState(FIELD_EDITS[field](useStore.getState()))

    expect(selectConfigKey(useStore.getState())).not.toBe(before)
    expect(selectConfigKey(useStore.getState())).toBe(currentKey())
    expect(due()).toBe(true)
    expect(selectDueKey(useStore.getState())).toBe(currentKey())

    runB1(false)
    useStore.setState(FIELD_EDITS[field](useStore.getState()))
    expect(due()).toBe(false)
    expect(selectDueKey(useStore.getState())).toBeNull()
  })

  it.each([
    [
      'a Flight toggle (the DetailStrip button\'s write)',
      () => {
        const id = firstPlacedId()
        const flighted = useStore.getState().selectedCompetitions[id].flighted ?? false
        useStore.getState().updateCompetition(id, { flighted: !flighted })
      },
    ],
    [
      'an inverted day window (R7)',
      () => useStore.getState().updateDayConfig(0, { day_start_time: 21 * 60, day_end_time: 8 * 60 }),
    ],
  ])('%s is due', (_name, edit) => {
    runB1(true)

    edit()

    expect(headerBlocking(), 'premise: the edit is not Blocking').toBe(false)
    expect(due()).toBe(true)
  })
})

// ──────────────────────────────────────────────
// What the rule leaves alone
// ──────────────────────────────────────────────

describe('what never makes the board due', () => {
  it('a Blocking board is not due though its key moved, restoring the run\'s value is not due, and the next edit is', () => {
    runB1(true)
    const runStrips = useStore.getState().strips_total

    useStore.getState().setStrips(0)
    expect(headerBlocking(), 'premise: strips 0 is Blocking').toBe(true)
    expect(currentKey()).not.toBe(useStore.getState().lastRun?.configKey)
    expect(currentKey()).not.toBe(useStore.getState().lastAttemptedKey)
    expect(due()).toBe(false)
    expect(selectDueKey(useStore.getState())).toBeNull()

    useStore.getState().setStrips(runStrips)
    expect(currentKey()).toBe(useStore.getState().lastRun?.configKey)
    expect(due()).toBe(false)

    // The positive control: a non-Blocking edit after it.
    useStore.getState().setStrips(runStrips + 1)
    expect(headerBlocking()).toBe(false)
    expect(due()).toBe(true)
  })

  // Guards for the move and the pin (they touch `placements` only, never the
  // key), each followed by a key edit that is due.
  it.each([
    ['setPinned', (id: string) => useStore.getState().setPinned(id, true)],
    [
      'updatePlacement',
      (id: string) => useStore.getState().updatePlacement(id, { start_time: useStore.getState().placements[id].start_time + 30 }),
    ],
  ])('%s is not due, and a key edit after it is', (_name, act) => {
    runB1(true)

    act(firstPlacedId())
    expect(due()).toBe(false)

    editStrips()
    expect(due()).toBe(true)
  })
})

describe('the rule reads the key, not the run state', () => {
  it('after a run that places nothing on a board that is not Blocking, an edit is due', () => {
    useStore.setState(useStore.getInitialState(), true)
    applyPreset('B1')
    const { days_available, updateDayConfig } = useStore.getState()
    for (let day = 0; day < days_available; day++) {
      updateDayConfig(day, { day_start_time: 21 * 60, day_end_time: 8 * 60 })
    }
    switchOn()

    const counts = runScheduleAll()

    expect(counts.placed, 'premise: every day window inverted places nothing').toBe(0)
    expect(headerBlocking(), 'premise: the board is not Blocking').toBe(false)
    expect(runState(), 'premise: a board holding no placement is fresh').toBe(RunState.FRESH)
    expect(due()).toBe(false)

    editStrips()

    // `runStateOf` cannot see the edit, since nothing is placed. The key can.
    expect(runState()).toBe(RunState.FRESH)
    expect(due()).toBe(true)
  })
})

// ──────────────────────────────────────────────
// The stale row hides while a re-run is due
// ──────────────────────────────────────────────

const STALE_ROW_ID = 'stale:run'

function shows(rowId: string): boolean {
  return selectFindings(useStore.getState()).some((row) => row.id === rowId)
}

describe('the stale:run row while a re-run is due', () => {
  it('is dropped from selectFindings while due, and selectAllFindings keeps it', () => {
    runB1(true)

    editStrips()

    expect(runState(), 'premise: the edit leaves the board stale').toBe(RunState.STALE)
    expect(due()).toBe(true)
    expect(shows(STALE_ROW_ID)).toBe(false)
    expect(selectAllFindings(useStore.getState()).some((row) => row.id === STALE_ROW_ID)).toBe(true)
  })

  // Guard: the switch off is today's board.
  it('shows with the switch off', () => {
    runB1(false)

    editStrips()

    expect(runState()).toBe(RunState.STALE)
    expect(shows(STALE_ROW_ID)).toBe(true)
  })

  // Guard: strips 0 is stale today, since `runStateOf` checks only the day
  // range, and a Blocking board is never due.
  it('shows on a Blocking board', () => {
    runB1(true)

    useStore.getState().setStrips(0)

    expect(headerBlocking(), 'premise: strips 0 is Blocking').toBe(true)
    expect(runState()).toBe(RunState.STALE)
    expect(shows(STALE_ROW_ID)).toBe(true)
  })

  // selectFindings' memo deps: the switch and the last attempt each change
  // the answer with no other field moving.
  it('follows the switch and the last attempt alone', () => {
    runB1(false)
    editStrips()
    expect(shows(STALE_ROW_ID), 'premise: stale with the switch off').toBe(true)

    switchOn()
    expect(shows(STALE_ROW_ID)).toBe(false)

    useStore.setState({ lastAttemptedKey: currentKey() })
    expect(shows(STALE_ROW_ID)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// selectHasBlocking is the Header's rule
// ──────────────────────────────────────────────

/** Strips 0 with every Blocking row's id in the dismissal set, which hides none of them. */
function dismissEveryBlockingRow(): void {
  const ids = selectAllFindings(useStore.getState())
    .filter((row) => row.severity === FindingSeverity.BLOCKING)
    .map((row) => [row.id, true] as const)
  useStore.setState({ dismissedFindings: Object.fromEntries(ids) })
}

describe('selectHasBlocking equals the Header\'s rule over selectFindings', () => {
  // The B1–B8 rows are guards (no board is Blocking, so the stub's false
  // matches); the strips rows go red against it.
  it.each([
    ...SCENARIO_IDS.map((id) => [id, () => runPreset(id), false] as const),
    ['B1 at strips 0', () => { runPreset('B1'); useStore.getState().setStrips(0) }, true] as const,
    ['B1 at strips 1', () => { runPreset('B1'); useStore.getState().setStrips(1) }, true] as const,
    [
      'B1 at strips 0, every Blocking row dismissed',
      () => { runPreset('B1'); useStore.getState().setStrips(0); dismissEveryBlockingRow() },
      true,
    ] as const,
  ])('%s', (_name, setup, blocking) => {
    setup()

    expect(headerBlocking(), 'premise').toBe(blocking)
    expect(selectHasBlocking(useStore.getState())).toBe(blocking)
  })
})
