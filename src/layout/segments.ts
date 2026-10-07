/**
 * Pure layout: turns a derived event into the time segments it draws. Shared
 * by `src/store/derived.ts` (scorecard metrics) and `src/components/canvas/`
 * (the matrix canvas) — no React import, no store import.
 */

import type { DerivedEventSchedule } from '../engine/derive.ts'
import type { Phase } from '../engine/types.ts'
import { phaseSpans } from '../engine/unseated.ts'

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
 * A `null` start or end, or a span of zero minutes, means the segment does not
 * exist for this event. The enumeration lives in the engine (`phaseSpans`), so
 * this and the unseated-phase rule cannot disagree about what a phase is.
 */
export function eventTimeSegments(derived: DerivedEventSchedule): TimeSegment[] {
  return phaseSpans(derived.result).map(span => ({
    phase: span.phase,
    startMinutes: span.start,
    endMinutes: span.end,
    stripCount: span.stripCount,
  }))
}
