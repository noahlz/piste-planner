import { Phase } from '../../engine/types.ts'

/**
 * How a block names itself in words — the phase and the strips it runs on.
 *
 * Two surfaces read the same block: `EventBlock`'s accessible name and
 * `CanvasTooltip`'s field rows. They must agree exactly, so the strings have one
 * home here rather than a copy in each. `competitionLabels.ts` is the same rule
 * applied to a competition's own vocabulary (weapon, category, gender); this is
 * the part of a block's description that comes from its placement instead.
 */

/**
 * Phase names. Only the six phases `eventTimeSegments` emits can reach a block,
 * so `phaseDisplay`'s fallback is unreachable rather than lenient — it exists
 * because `BlockPlacement.phase` is the whole `Phase` union.
 */
const PHASE_DISPLAY: Partial<Record<Phase, string>> = {
  [Phase.POOLS]: 'Pools',
  [Phase.FLIGHT_A]: 'Flight A',
  [Phase.FLIGHT_B]: 'Flight B',
  [Phase.DE_PRELIMS]: 'DE prelims',
  [Phase.DE_ROUND_OF_16]: 'DE round of 16',
  [Phase.DE]: 'DE',
}

export function phaseDisplay(phase: Phase): string {
  return PHASE_DISPLAY[phase] ?? phase
}

/**
 * The strips a block occupies, 1-based for a reader. A single strip reads as
 * one strip rather than as a range of one, and a run uses an en dash the way
 * every other range in the UI does.
 */
export function stripRangeLabel(firstStrip: number, stripCount: number): string {
  const first = firstStrip + 1
  const last = firstStrip + stripCount
  return first === last ? `Strip ${first}` : `Strips ${first}–${last}`
}
