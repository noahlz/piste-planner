import { Phase } from '../engine/types.ts'
import { runsOf } from '../layout/runs.ts'

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
 * because `DrawnBlock.phase` is the whole `Phase` union.
 */
const PHASE_DISPLAY: Partial<Record<Phase, string>> = {
  [Phase.POOLS]: 'Pools',
  [Phase.FLIGHT_A]: 'Flight A',
  [Phase.FLIGHT_B]: 'Flight B',
  [Phase.DE_PRELIMS]: 'DE prelims',
  // The code keeps the r16 name, but the stage is the round of 16 only for Div 1,
  // Junior and Cadet – every other individual category starts it at the round
  // of 8 (Ops Manual p.19, METHODOLOGY §Video Replay Policy).
  [Phase.DE_ROUND_OF_16]: 'Video stage',
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
 * The strips a set of 0-based indices names, 1-based, one run per maximal
 * stretch of consecutive indices. A drawn phase may hold strips that are not
 * contiguous (the scheduler's own index sets, 017 spec §6). An unseated
 * phase holds none, so callers name that case themselves: an empty set throws
 * a `RangeError` rather than printing "Strips " with nothing after it.
 */
export function stripSetLabel(strips: readonly number[]): string {
  if (strips.length === 0) throw new RangeError('stripSetLabel: an empty strip set names no strips')
  const runs = runsOf([...new Set(strips)].sort((a, b) => a - b))
  if (runs.length === 1) return stripRangeLabel(runs[0].first, runs[0].count)
  const parts = runs.map(({ first, count }) => (count === 1 ? `${first + 1}` : `${first + 1}–${first + count}`))
  return `Strips ${parts.join(', ')}`
}

/**
 * What an unseated block says about its strips: how many it needs, with no
 * range. An unseated block was granted no run at all, and naming a range for it
 * would claim strips it was never given – "Strips 1–4" over a day that had no
 * room for it, which is fiction on exactly the over-capacity day an organizer
 * opened the tool to find.
 */
export function unseatedStripsLabel(stripCount: number): string {
  return stripCount === 1 ? 'Unplaced, needs 1 strip' : `Unplaced, needs ${stripCount} strips`
}

/**
 * What a drawn block says about its strips: the strips it holds, one range per
 * run, or what an unseated block needs. Block's accessible name and the
 * tooltip's Strips row read it, so the two cannot word the same block apart.
 */
export function drawnStripsLabel(block: { strips: readonly number[]; stripCount: number }): string {
  return block.strips.length > 0
    ? stripSetLabel(block.strips)
    : unseatedStripsLabel(block.stripCount)
}
