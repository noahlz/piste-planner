import { DeMode } from '../engine/types.ts'

/**
 * Display names for the engine's two DE modes, read by every surface that
 * names a mode so they share one list instead of several — the store's
 * third setting value, `'AUTO'`, has no entry here because it is not a mode but
 * a marker meaning "follow the tournament type" (data-model.md §Settings
 * override state), and its label names the mode it resolves to.
 */
export const DE_MODE_LABELS: Record<DeMode, string> = {
  [DeMode.SINGLE_STAGE]: 'Single Block',
  [DeMode.STAGED]: 'Staged DE Blocks',
}
