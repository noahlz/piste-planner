/**
 * The sender's side of a replay (017 T8, spec §5): a board that has been run,
 * optionally hand-moved, and what leaves it as a link or a saved file. Tests
 * then reset the store and receive it, and compare the two drawn models.
 */
import { useStore } from '../../src/store/store.ts'
import { encodeToUrl, serializeState } from '../../src/store/serialization.ts'
import type { SerializedState } from '../../src/store/serialization.ts'
import { selectDrawnSchedule } from '../../src/store/derived.ts'
import type { DrawnSchedule } from '../../src/store/derived.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'
import { moveHeadline, runAndPinAll, runPreset } from './drawnFixtures.ts'

export interface SentBoard {
  /** What the sender's canvas shows. */
  drawn: DrawnSchedule
  /** `#config=...`, as the share link carries it. */
  hash: string
  /** The saved file's text. */
  json: string
}

export interface SendOptions {
  scenario?: ScenarioId
  /** Pin every placed event and run again, so the run carries pins. */
  pinned?: boolean
  /** Move the headline event to the next day after the run. */
  moved?: boolean
}

/** Runs a preset on the store and returns what the sender would send. */
export function sendBoard({ scenario = 'B1', pinned = false, moved = false }: SendOptions = {}): SentBoard {
  if (pinned) runAndPinAll(scenario)
  else runPreset(scenario)
  if (moved) moveHeadline()
  const state = useStore.getState()
  return { drawn: selectDrawnSchedule(state), hash: encodeToUrl(state), json: serializeState(state) }
}

/** The sender's payload as an object a test can corrupt. */
export function sentPayload(board: SentBoard): SerializedState {
  return JSON.parse(board.json) as SerializedState
}

/** A fresh store, as a receiver's browser opens with. */
export function resetReceiver(): void {
  useStore.setState(useStore.getInitialState(), true)
}

/**
 * The sender's payload with its first pin corrupted to a `strip_count` of 0.
 * The pins come from the store's kept run, not from the payload, so the
 * refusal tests exercise the reader whatever the writer does.
 */
export function payloadWithRefusedRun(board: SentBoard): SerializedState {
  const payload = sentPayload(board)
  const pins = useStore.getState().lastRun?.pins ?? []
  payload.run = [{ ...pins[0], strip_count: 0 }, ...pins.slice(1)]
  return payload
}

/** `#config=...` for a payload, the way `encodeToUrl` writes it. */
export function hashOf(payload: unknown): string {
  return `#config=${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

/** The payload a `#config=...` hash carries. */
export function payloadOfHash(hash: string): SerializedState {
  const b64 = hash.slice('#config='.length).replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(b64)) as SerializedState
}
