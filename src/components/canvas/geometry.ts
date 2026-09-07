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
