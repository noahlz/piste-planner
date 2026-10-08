import { useStore, type StoreState } from './store.ts'
import { serializeState, deserializeState, encodeToUrl } from './serialization.ts'
import type { DeserializeResult } from './serialization.ts'
import type { PinnedPlacement } from '../engine/types.ts'
import { replayRun } from './runActions.ts'
import { buildTournamentConfig } from './buildConfig.ts'
import { configKeyOf } from './keptRun.ts'

/** A share URL past this size may not work in all browsers (research D-share). */
export const URL_SIZE_WARNING_BYTES = 2048

/** Filename offered for the saved-configuration download. */
export const SAVE_FILE_NAME = 'tournament.piste.json'

export type ParsedFile = DeserializeResult | { error: string }

/** Serializes state to a JSON file and triggers a browser download. */
export function saveToFile(state: StoreState = useStore.getState()): void {
  const json = serializeState(state)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = SAVE_FILE_NAME
  a.click()
  URL.revokeObjectURL(url)
}

/** Reads a File's text content. jsdom's Blob/File has no .text(), so this
 * goes through FileReader instead (see src/test-setup.ts for other jsdom gaps). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

/** Reads and validates a saved configuration file without writing the store —
 * callers can inspect droppedPlacements and warn before applyLoadedState. */
export async function parseTournamentFile(file: File): Promise<ParsedFile> {
  const text = await readFileText(file)
  return deserializeState(text)
}

/** Writes parsed state onto the store, then ends with `lastRun` set (017 spec
 * §5): replayed from a valid `run`, else null, so a run from the board that was
 * there before never draws against the loaded placements, even when the two
 * configs share a key. The state goes in with `lastRun: null` in one update, so
 * no subscriber sees loaded placements beside the old run. Separate from
 * parsing so a caller can warn about dropped placements first (FR-009).
 * The same update seeds `lastAttemptedKey` with the key of the merged loaded
 * state (020 R3), so no subscriber sees loaded inputs without it and a load
 * never counts as an edit awaiting a re-run: it opens stale until the next edit.
 * Returns why the replay failed, or null when it did not (or no run came). */
export function applyLoadedState(state: Partial<StoreState>, run: readonly PinnedPlacement[] | null): string | null {
  useStore.setState((current) => {
    const { config, competitions } = buildTournamentConfig({ ...current, ...state })
    return { ...state, lastRun: null, loadRefusal: null, lastAttemptedKey: configKeyOf(config, competitions) }
  })
  return run === null ? null : replayRun(useStore.getState(), run)
}

/** Builds a shareable URL encoding the given state (or the live store) in its hash. */
export function buildShareLink(state: StoreState = useStore.getState()): string {
  const hash = encodeToUrl(state)
  return `${window.location.origin}${window.location.pathname}${hash}`
}

/** True when a share URL is large enough to risk browser/platform URL limits. */
export function shareLinkExceedsLimit(url: string): boolean {
  return new Blob([url]).size > URL_SIZE_WARNING_BYTES
}

/** Copies text to the clipboard. Resolves false rather than throwing when the
 * clipboard API is unavailable or the write is denied. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
