import type { CatalogueEntry, CutMode } from '../engine/types.ts'
import { CutMode as CutModeValues, EventType } from '../engine/types.ts'
import { DEFAULT_CUT_BY_CATEGORY } from '../engine/constants.ts'

/**
 * The default cut pair for a catalogue entry. Since the per-event record shrank
 * (013 research D7) this has one caller: `buildConfig.ts` applies it as the
 * first of the three cut rules, ahead of the regional override and the team
 * coercion. The engine's `cut-on-team` rule (src/engine/validation.ts:157-159)
 * requires every team event to carry `DISABLED`, and the last time this
 * derivation diverged from a second copy of itself, the app shipped an empty
 * schedule for every tournament with team events
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
