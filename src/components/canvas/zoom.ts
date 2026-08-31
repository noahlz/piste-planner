/**
 * Matrix canvas zoom arithmetic — FR-017, FR-018, FR-020, constitution IV.
 *
 * Pure arithmetic: no React, no store reads, no dependency. `MatrixCanvas.tsx`
 * consumes every function here and adds nothing to them, which is what makes
 * the zoom behaviour testable without rendering.
 *
 * ## The scale is minutes per pixel
 *
 * `timeZoom` is minutes per pixel everywhere in this module, matching
 * `ViewState.timeZoom` and `windowing.visibleTimeRange`. A *larger* timeZoom is
 * zoomed *out*. `geometry.pxPerMinute` is the reciprocal and is the only place
 * the scale is inverted — nothing here divides by it.
 *
 * ## Clamping is this module's job, not the caller's
 *
 * `viewState.isValidViewState` rejects a non-finite or non-positive `timeZoom`
 * and a negative `timeScroll` *wholesale*: one bad field discards the entire
 * stored view state on the next boot, silently resetting the drawer height and
 * the row-height step along with it. So every function that produces a window
 * clamps `timeZoom` into `[MIN_TIME_ZOOM, MAX_TIME_ZOOM]` and `timeScroll` to
 * at least zero, and a caller may persist any window this module returns.
 *
 * The one behavioural consequence: cursor anchoring is exact except where the
 * `timeScroll` floor fires, i.e. within a viewport width of midnight. Days
 * start at `DAY_START_MINS` (480), so that boundary is off-screen in normal use.
 */

import { formatMinutes } from '../../lib/time.ts'
import { RowHeightStep } from '../../store/viewState.ts'
import type { TimeRange } from './windowing.ts'

/**
 * Zoom bounds, in minutes per pixel.
 *
 * - `MIN_TIME_ZOOM` 0.05 is 20px per minute: a one-minute sliver is 20px wide
 *   and zooming further only magnifies rounding.
 * - `MAX_TIME_ZOOM` 8 fits a full 840-minute competition day into 105px, which
 *   is already past the point of legibility, and keeps the coarsest hour-axis
 *   step (six hours) at 45px so labels never collapse onto each other.
 */
export const MIN_TIME_ZOOM = 0.05
export const MAX_TIME_ZOOM = 8

/** Matches `DEFAULT_VIEW_STATE.timeZoom`: the fallback for an unusable input. */
export const DEFAULT_TIME_ZOOM = 1

/** The canvas never scrolls before midnight — `viewState` refuses to store it. */
const MIN_TIME_SCROLL = 0

/** The horizontal half of the view state: what the time axis is showing. */
export interface TimeWindow {
  readonly timeZoom: number
  readonly timeScroll: number
}

/** Brings any number into the persistable zoom range. */
export function clampTimeZoom(timeZoom: number): number {
  if (!Number.isFinite(timeZoom)) return DEFAULT_TIME_ZOOM
  return Math.min(MAX_TIME_ZOOM, Math.max(MIN_TIME_ZOOM, timeZoom))
}

/** The minute of the day under a pixel offset from the left edge of the plot. */
export function minuteAtX(window: TimeWindow, x: number): number {
  return window.timeScroll + x * window.timeZoom
}

/**
 * Continuous cursor-anchored zoom (FR-017): the minute under `cursorX` stays
 * under `cursorX`.
 *
 * The anchor is read at the *current* zoom and the new scroll is solved against
 * the *clamped* new zoom — clamping afterwards would leave a scroll position
 * computed for a zoom that was never stored, so the cursor would drift exactly
 * at the ends of the range where the user is pushing hardest.
 */
export function zoomAtCursor(
  current: TimeWindow,
  nextTimeZoom: number,
  cursorX: number,
): TimeWindow {
  const anchorMinute = minuteAtX(current, cursorX)
  const timeZoom = clampTimeZoom(nextTimeZoom)
  return {
    timeZoom,
    timeScroll: Math.max(MIN_TIME_SCROLL, anchorMinute - cursorX * timeZoom),
  }
}

/**
 * The three row heights in order (FR-018). Stepped, never continuous: the
 * design fixes these because legibility falls off a cliff between them.
 */
export const ROW_HEIGHT_ORDER: readonly RowHeightStep[] = [
  RowHeightStep.COMPACT,
  RowHeightStep.NORMAL,
  RowHeightStep.TALL,
]

/**
 * Moves one step along `ROW_HEIGHT_ORDER`. Stepping past either end stays put
 * rather than wrapping — a control that jumped from tall back to compact would
 * read as a glitch, not as a range limit.
 */
export function stepRowHeight(current: RowHeightStep, delta: number): RowHeightStep {
  const index = ROW_HEIGHT_ORDER.indexOf(current)
  if (index < 0) return RowHeightStep.NORMAL
  const next = Math.min(ROW_HEIGHT_ORDER.length - 1, Math.max(0, index + Math.sign(delta)))
  return ROW_HEIGHT_ORDER[next]
}

/**
 * The window that shows `[startMinutes, endMinutes)` across `viewportWidthPx`.
 * `null` when there is nothing sensible to fit — an unmeasured viewport or an
 * empty span — so the caller keeps whatever window it already had rather than
 * jumping to an arbitrary one.
 */
function windowCovering(
  startMinutes: number,
  endMinutes: number,
  viewportWidthPx: number,
): TimeWindow | null {
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return null
  if (!Number.isFinite(viewportWidthPx) || viewportWidthPx <= 0) return null
  const span = endMinutes - startMinutes
  if (span <= 0) return null

  return {
    timeZoom: clampTimeZoom(span / viewportWidthPx),
    timeScroll: Math.max(MIN_TIME_SCROLL, startMinutes),
  }
}

/**
 * Fit-to-day (FR-020): the window covers one day's *configured* span, read from
 * `dayConfigs[d]`, not the `DAY_START_MINS`/`DAY_END_MINS` constants — a day
 * whose hours were shortened should fit to the hours it actually has.
 */
export function fitToDay(
  dayStartMinutes: number,
  dayEndMinutes: number,
  viewportWidthPx: number,
): TimeWindow | null {
  return windowCovering(dayStartMinutes, dayEndMinutes, viewportWidthPx)
}

/**
 * Fit-to-tournament (FR-020): the window covers the union of every placed
 * event's span — earliest start to latest end — across all days. The canvas
 * shares one time-of-day window between day groups, so this is a union in
 * minutes-from-midnight and not a span in wall-clock days.
 *
 * With nothing placed there is no union, so this returns `null` and the caller
 * keeps its current window. Snapping to an arbitrary default would throw away
 * a zoom the user set deliberately, and an empty canvas gives no evidence about
 * what they would rather be looking at.
 */
export function fitToTournament(
  spans: readonly TimeRange[],
  viewportWidthPx: number,
): TimeWindow | null {
  if (spans.length === 0) return null

  let earliest = Number.POSITIVE_INFINITY
  let latest = Number.NEGATIVE_INFINITY
  for (const span of spans) {
    if (!Number.isFinite(span.startMinutes) || !Number.isFinite(span.endMinutes)) continue
    earliest = Math.min(earliest, span.startMinutes)
    latest = Math.max(latest, span.endMinutes)
  }

  return windowCovering(earliest, latest, viewportWidthPx)
}

/** Zoom-to-selection padding: 5% of the span, but never less than 5 minutes. */
export const SELECTION_PADDING_FRACTION = 0.05
export const SELECTION_MIN_PADDING_MINUTES = 5

/**
 * Zoom-to-selection (FR-020): the window covers a given minute range **with
 * padding**, unlike fit-to-day and fit-to-tournament which cover their spans
 * exactly.
 *
 * The difference is deliberate. A day span and a tournament union are already
 * whole boundaries, so padding them would show empty margins on both sides. A
 * selection is one block the user wants to look at, and a block flush against
 * both viewport edges reads as clipped — the padding is what shows it is not.
 *
 * The padded start is floored at midnight, so an early-morning selection stays
 * covered while the window start remains persistable.
 */
export function zoomToSelection(
  selection: TimeRange,
  viewportWidthPx: number,
): TimeWindow | null {
  const span = selection.endMinutes - selection.startMinutes
  if (!Number.isFinite(span) || span <= 0) return null

  const padding = Math.max(SELECTION_MIN_PADDING_MINUTES, span * SELECTION_PADDING_FRACTION)
  return windowCovering(
    selection.startMinutes - padding,
    selection.endMinutes + padding,
    viewportWidthPx,
  )
}

/**
 * Minimum pixels between hour-axis ticks. A `HH:MM` label at the axis font size
 * is roughly 34px, so 48px leaves the labels legibly separated rather than
 * merely non-overlapping.
 */
export const MIN_TICK_SPACING_PX = 48

/**
 * The hour-axis ladder, coarsest step last. Every entry is a whole number of
 * hours, so labels always land on the hour however far out the user zooms.
 */
export const TICK_STEP_LADDER_MINUTES: readonly number[] = [60, 120, 180, 360]

/**
 * The tick step for a zoom level: the finest ladder entry that still leaves
 * `MIN_TICK_SPACING_PX` between labels. Below the coarsest entry the axis stops
 * coarsening and labels tighten — at `MAX_TIME_ZOOM` six hours is 45px, close
 * enough to the minimum that the bound is chosen rather than accidental.
 */
export function chooseTickStepMinutes(timeZoom: number): number {
  const base = TICK_STEP_LADDER_MINUTES[0]
  if (!Number.isFinite(timeZoom) || timeZoom <= 0) return base

  const pxPerMinute = 1 / timeZoom
  const fitting = TICK_STEP_LADDER_MINUTES.find(
    (step) => step * pxPerMinute >= MIN_TICK_SPACING_PX,
  )
  return fitting ?? TICK_STEP_LADDER_MINUTES[TICK_STEP_LADDER_MINUTES.length - 1]
}

/** One labelled tick on the hour axis. `minutes` is minutes from midnight. */
export interface AxisTick {
  readonly minutes: number
  readonly label: string
}

/**
 * Ceiling on ticks in one axis. A 4000px viewport at `MAX_TIME_ZOOM` spans
 * 32,000 minutes and yields 89 ticks, so nothing reachable through the clamps
 * comes near this.
 */
export const MAX_AXIS_TICKS = 200

/**
 * The ticks for one hour axis over the visible window.
 *
 * The count is computed arithmetically and the array is built from it — there
 * is no `while (t < end)` walk to bound (constitution IV). The window is
 * **half-open**, matching `windowing.visibleTimeRange`: a tick exactly at
 * `endMinutes` sits on the right edge of the plot and is excluded.
 *
 * Overrunning `MAX_AXIS_TICKS` throws. It is unreachable through the clamps, so
 * reaching it means an upstream invariant already broke, and quietly allocating
 * millions of nodes would turn that into a hang instead of a message.
 */
export function hourTicks(range: TimeRange, timeZoom: number): AxisTick[] {
  const { startMinutes, endMinutes } = range
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) return []

  const step = chooseTickStepMinutes(timeZoom)
  const first = Math.ceil(startMinutes / step) * step
  if (first >= endMinutes) return []

  const count = Math.ceil((endMinutes - first) / step)
  if (count > MAX_AXIS_TICKS) {
    throw new Error(
      `hourTicks: ${count} ticks requested for window [${startMinutes}, ${endMinutes}) ` +
        `at step ${step}, over the ${MAX_AXIS_TICKS} tick ceiling`,
    )
  }

  return Array.from({ length: count }, (_, i) => {
    const minutes = first + i * step
    return { minutes, label: formatMinutes(minutes) }
  })
}
