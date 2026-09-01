import type { CatalogueEntry, CutMode } from '../engine/types.ts'
import { CutMode as CutModeValues, EventType } from '../engine/types.ts'
import { DEFAULT_CUT_BY_CATEGORY } from '../engine/constants.ts'

/**
 * The default cut pair for a catalogue entry — the derivation two call sites
 * must agree on: `defaultConfigForId` (src/store/store.ts) applies it when a
 * competition is first created, and `CompetitionOverrides.tsx` re-derives it
 * to decide whether a field reads as user-modified. The engine's `cut-on-team`
 * rule (src/engine/validation.ts:157-159) requires every team event to carry
 * `DISABLED`, and the last time these two derivations diverged, the app
 * shipped an empty schedule for every tournament with team events
 * (specs/008-team-event-cut/research.md D1).
 */
export interface DefaultCut {
  mode: CutMode
  value: number
}

export function defaultCutForEntry(entry: CatalogueEntry): DefaultCut {
  if (entry.event_type === EventType.TEAM) {
    return { mode: CutModeValues.DISABLED, value: 100 }
  }
  return DEFAULT_CUT_BY_CATEGORY[entry.category]
}
