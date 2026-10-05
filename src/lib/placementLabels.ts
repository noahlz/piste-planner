import { Phase } from '../engine/types.ts'

/**
 * How a block names itself in words — the phase and the strips it runs on.
 *
 * Three surfaces read the same block: `Block`'s accessible name, `CanvasTooltip`'s
 * field rows and `DetailStrip`'s summary. They must agree exactly, so the
 * strings have one home, and this is it.
 *
 * 013 T026 folded the old label helper into `CanvasTooltip.tsx` when its other
 * reader was deleted; 013 T031 moved the whole set out again, because
 * `selectFindings` (`src/store/derived.ts`) needs `phaseDisplay` for an
 * Unplaced row's `where` and the store may not import from `src/components/`
 * (research D6 fixed the direction as store → layout/lib ← components). The
 * three helpers travel together rather than `phaseDisplay` alone: they are one
 * vocabulary, and the two files that read them read more than one of them.
 * Being a plain module rather than a `.tsx` also retires the three
 * `react-refresh/only-export-components` suppressions they carried.
 *
 * Only the six phases `eventTimeSegments` emits can reach a block, so
 * `phaseDisplay`'s fallback is unreachable rather than lenient — it exists
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

/**
 * What a block says about its strips, overflow included.
 *
 * An overflowed block was granted no run at all: `assignStripLanes` reports it
 * at `firstStrip: 0` so it has somewhere to draw, and records no occupancy for
 * it. Reading that 0 as a placement makes both surfaces claim strips the block
 * was never given — "Strips 1–4" over a day that had no room for it, which is
 * fiction on exactly the over-capacity day an organizer opened the tool to
 * find. So the count is reported without a range, and the failure is named.
 */
export function stripAssignmentLabel(
  firstStrip: number,
  stripCount: number,
  overflow: boolean,
): string {
  if (!overflow) return stripRangeLabel(firstStrip, stripCount)
  return stripCount === 1 ? 'Unplaced, needs 1 strip' : `Unplaced, needs ${stripCount} strips`
}
