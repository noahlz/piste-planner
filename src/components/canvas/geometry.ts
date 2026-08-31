/**
 * Matrix canvas block geometry — FR-012, FR-013, FR-018.
 *
 * Pure arithmetic: no React, no store reads, nothing cached. Every quantity is
 * recomputed from view state plus the engine's already-derived durations on
 * each render, which is what FR-013 ("block geometry MUST be derived on read
 * and MUST NOT be stored") requires. Nothing here writes to, memoizes into, or
 * mutates a `DerivedEventSchedule`.
 *
 * Coordinate conventions, both relative to the visible window rather than to
 * the whole canvas:
 *
 * - x is pixels right of `windowStartMinutes`, so a block scrolled off the left
 *   edge has a negative x. Nothing is clamped — clamping here would collapse
 *   partially visible blocks onto the edge instead of letting them slide under
 *   it.
 * - y is pixels below the first rendered row, so a block above the scroll
 *   position has a negative y, for the same reason.
 *
 * Day grouping lives in `./windowing.ts`: this module never converts a day to a
 * row, it only turns a flat row index into pixels.
 */

import type { DerivedEventSchedule } from '../../engine/derive.ts'
import { Phase } from '../../engine/types.ts'
import { RowHeightStep } from '../../store/viewState.ts'

/**
 * Converts the store's zoom to a drawing scale.
 *
 * This exists as its own named function because it is the single place the
 * scale can be inverted. `ViewState.timeZoom` is **minutes per pixel**, so
 * pixels per minute is its reciprocal — and the two agree at the default
 * `timeZoom` of 1, which means an inverted implementation renders, scrolls and
 * zooms plausibly and only diverges once the user zooms.
 */
export function pxPerMinute(timeZoom: number): number {
  return 1 / timeZoom
}

/**
 * Horizontal offset of a block, in pixels from the left edge of the time
 * window. Negative when the block starts before the window; unbounded to the
 * right when it starts after it.
 */
export function blockX(
  startMinutes: number,
  windowStartMinutes: number,
  timeZoom: number,
): number {
  return (startMinutes - windowStartMinutes) * pxPerMinute(timeZoom)
}

/** Width of a block covering `durationMinutes` at the current zoom. */
export function blockWidth(durationMinutes: number, timeZoom: number): number {
  return durationMinutes * pxPerMinute(timeZoom)
}

/**
 * Row heights per step, in pixels. FR-018 makes these three discrete steps
 * rather than a continuous scale: compact is readable without labels, normal
 * carries a short label, and tall is comfortable with a gender prefix and a
 * weapon mark.
 */
export const ROW_HEIGHT_PX: Record<RowHeightStep, number> = {
  [RowHeightStep.COMPACT]: 16,
  [RowHeightStep.NORMAL]: 24,
  [RowHeightStep.TALL]: 36,
}

/**
 * Vertical offset of a block, in pixels below the first rendered row.
 * `windowStartRow` is the flat row index at the top of the viewport
 * (`visibleRowRange().firstRow`). Negative for a row above it.
 */
export function blockY(
  flatRowIndex: number,
  windowStartRow: number,
  rowHeightStep: RowHeightStep,
): number {
  return (flatRowIndex - windowStartRow) * ROW_HEIGHT_PX[rowHeightStep]
}

/** Height of a block covering `stripSpan` contiguous strips. */
export function blockHeight(stripSpan: number, rowHeightStep: RowHeightStep): number {
  return stripSpan * ROW_HEIGHT_PX[rowHeightStep]
}

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
