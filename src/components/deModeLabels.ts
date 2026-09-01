import { DeMode } from '../engine/types.ts'

/**
 * Display names for the engine's two DE modes. Moved out of
 * `CompetitionOverrides.tsx` (004 T065) so the Advanced panel's collapsed
 * summary and the per-event control read one list instead of two — the store's
 * third setting value, `'AUTO'`, has no entry here because it is not a mode but
 * a marker meaning "follow the tournament type" (data-model.md §Settings
 * override state), and its label names the mode it resolves to.
 */
export const DE_MODE_LABELS: Record<DeMode, string> = {
  [DeMode.SINGLE_STAGE]: 'Single Block',
  [DeMode.STAGED]: 'Staged DE Blocks',
}
