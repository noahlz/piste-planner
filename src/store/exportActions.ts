import { useStore, type StoreState } from './store.ts'
import { serializeState, deserializeState, encodeToUrl } from './serialization.ts'

/** A share URL past this size may not work in all browsers (research D-share). */
export const URL_SIZE_WARNING_BYTES = 2048

/** Filename offered for the saved-configuration download. */
export const SAVE_FILE_NAME = 'tournament.piste.json'

export type ParsedFile =
  | { state: Partial<StoreState>; droppedPlacements: string[] }
  | { error: string }

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

/** Writes parsed state onto the store. Separate from parsing so a caller can
 * warn about dropped placements first (FR-009). */
export function applyLoadedState(state: Partial<StoreState>): void {
  useStore.setState(state)
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
