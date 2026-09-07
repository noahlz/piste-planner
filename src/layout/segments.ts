/**
 * Pure layout: turns a derived event into the time segments it draws. Shared
 * by `src/store/derived.ts` (scorecard metrics) and `src/components/canvas/`
 * (the matrix canvas) — no React import, no store import.
 */

import type { DerivedEventSchedule } from '../engine/derive.ts'
import { Phase } from '../engine/types.ts'

/**
 * One drawable time span of an event: a pool block, one flight, or one DE
 * phase. Minutes are minutes from midnight, as everywhere else in this app;
 * the day comes from `DerivedEventSchedule.result.assigned_day`, which every
 * segment of one event shares.
 */
export interface TimeSegment {
  phase: Phase
  startMinutes: number
  endMinutes: number
  /** Strips the phase draws across, from the engine's granted strip count. */
  stripCount: number
}

/**
 * Splits one derived event into the blocks the canvas draws.
 *
 * Every boundary is **read** from the `ScheduleResult` the engine already
 * computed — no duration is recalculated here, so the canvas can never disagree
 * with `ScheduleOutput` about when a phase runs.
 *
 * Two shapes of the result need care:
 *
 * - A flighted event fills `flight_a_*` and `flight_b_*` *and* leaves
 *   `pool_start`/`pool_end` spanning both flights (`derive.ts` sets
 *   `pool_end = flightBEnd`). Flights are therefore checked first, or the gap
 *   between them would be drawn as pool time.
 * - `de_total_end` extends past the last block by `tailEstimateMins()` to cover
 *   the medal bouts, which are deliberately not scheduled (`de.ts`
 *   "stop-at-semis" model). It gets no segment.
 *
 * A `null` start or end means the segment does not exist for this event.
 */
export function eventTimeSegments(derived: DerivedEventSchedule): TimeSegment[] {
  const r = derived.result
  const segments: TimeSegment[] = []

  const push = (
    phase: Phase,
    start: number | null,
    end: number | null,
    stripCount: number,
  ): void => {
    if (start === null || end === null) return
    segments.push({ phase, startMinutes: start, endMinutes: end, stripCount })
  }

  if (r.flight_a_start !== null) {
    push(Phase.FLIGHT_A, r.flight_a_start, r.flight_a_end, r.flight_a_strips)
    push(Phase.FLIGHT_B, r.flight_b_start, r.flight_b_end, r.flight_b_strips)
  } else {
    push(Phase.POOLS, r.pool_start, r.pool_end, r.pool_strip_count)
  }

  // Single-stage and staged are mutually exclusive on the result, so these
  // three pushes emit either the one DE block or the staged phases.
  push(Phase.DE, r.de_start, r.de_end, r.de_strip_count)
  push(Phase.DE_PRELIMS, r.de_prelims_start, r.de_prelims_end, r.de_prelims_strip_count)
  push(
    Phase.DE_ROUND_OF_16,
    r.de_round_of_16_start,
    r.de_round_of_16_end,
    r.de_round_of_16_strip_count,
  )

  return segments
}
