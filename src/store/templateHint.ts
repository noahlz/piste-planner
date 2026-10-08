import { TEMPLATES, TEMPLATE_MIN_DAYS, templateHintSentence, templateMinDays } from '../engine/catalogue.ts'
import type { StoreState } from './store.ts'

const HINT_CLOSING =
  'With fewer days some of them share a day, and the Findings panel flags each pair after Auto-assign.'

/**
 * The hint under the Tournament panel's Days pills (019 R3): why the loaded
 * template wants more days than the board has, or `null` when no hint applies.
 * It applies only when `loadedPresetId` names a template, `days_available` is
 * below that template's minimum for the board's type, and every event of the
 * template is still selected (a file load or a hand removal leaves the id stale).
 */
export function selectTemplateDaysHint(state: StoreState): string | null {
  const id = state.loadedPresetId
  // Defensive: `hasOwn`, not a plain lookup, so an unknown or stale id (even
  // 'toString') can never find an inherited property on the table.
  if (id === null || !Object.hasOwn(TEMPLATES, id) || !Object.hasOwn(TEMPLATE_MIN_DAYS, id)) return null

  const minDays = templateMinDays(id, state.tournament_type)
  if (state.days_available >= minDays) return null

  if (!TEMPLATES[id].every((eventId) => Object.hasOwn(state.selectedCompetitions, eventId))) return null

  const sentence = templateHintSentence(id, state.tournament_type)
  return `${id} needs ${minDays} days on a ${state.tournament_type} board. ${sentence} ${HINT_CLOSING}`
}
