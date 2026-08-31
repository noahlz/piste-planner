/**
 * Matrix canvas windowing — FR-021, research D2, constitution IV.
 *
 * Pure arithmetic: no React, no store reads, no dependency. Every function here
 * is a direct computation — integer division, modulo, multiplication — so there
 * is no loop to bound and no search to converge. That is what lets the canvas
 * render only the visible slice (FR-021) without a virtualization library
 * (research D2 rejected `react-window` and `@tanstack/react-virtual`).
 *
 * ## The day header band is an OVERLAY, not a row
 *
 * The canvas is a sequence of day groups, and FR-019 makes each group's header
 * a *sticky band* — it floats over the rows of its day rather than occupying
 * one. So **rows per day is exactly `stripsTotal`**, with no header row and no
 * spacer row, and the flat row index is `day * stripsTotal + strip` with no
 * correction term.
 *
 * Anything drawing the header must position it from the day's first row, not
 * from a row of its own. If a future change gives the band a row, every
 * function in this module changes with it — the constant-time resolution below
 * depends on uniform, header-free day groups.
 *
 * ## Ranges
 *
 * Row ranges are **inclusive** on both ends (`firstRow`..`lastRow`), because
 * callers render `for (let r = firstRow; r <= lastRow; r++)`. A partially
 * visible row is included: the count of rows spanned is rounded **up**.
 *
 * Time ranges are **half-open**, `[startMinutes, endMinutes)`. A block ending
 * exactly at `startMinutes` or starting exactly at `endMinutes` is outside.
 * `intersectsTimeRange` is that rule, executable.
 */

import { ROW_HEIGHT_PX } from './geometry.ts'
import type { RowHeightStep } from '../../store/viewState.ts'

/**
 * Constant-time day-boundary lookup for the flat row index. Built once per
 * render from the config, never stored in the store.
 */
export interface DayLayout {
  /** Days in the tournament, i.e. the number of day groups. */
  readonly daysAvailable: number
  /** Strips per day, i.e. rows per day group. */
  readonly stripsTotal: number
  /** Rows in one day group. Equal to `stripsTotal` — the header band is an overlay. */
  readonly rowsPerDay: number
  /** Rows across every day group. `daysAvailable * stripsTotal`. */
  readonly totalRows: number
}

/** A flat row index resolved to its day group and the strip inside it. */
export interface RowLocation {
  readonly day: number
  readonly strip: number
}

/** An inclusive span of flat row indices to render. */
export interface RowRange {
  readonly firstRow: number
  readonly lastRow: number
}

/** A half-open span of minutes from midnight to render. */
export interface TimeRange {
  readonly startMinutes: number
  readonly endMinutes: number
}

/**
 * Non-negative integer floor. Guards the layout against a fractional or
 * negative `days_available` / `strips_total`, which would otherwise make
 * `resolveFlatRow`'s division produce fractional days.
 */
function nonNegativeInt(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/** Builds the day-boundary lookup. Degenerate inputs collapse to zero rows. */
export function buildDayLayout(daysAvailable: number, stripsTotal: number): DayLayout {
  const days = nonNegativeInt(daysAvailable)
  const strips = nonNegativeInt(stripsTotal)
  return {
    daysAvailable: days,
    stripsTotal: strips,
    rowsPerDay: strips,
    totalRows: days * strips,
  }
}

/**
 * Resolves a flat row index to its day and strip in constant time — one
 * division and one modulo, no scan and no binary search (constitution IV).
 * Returns `null` for an index outside `[0, totalRows)`.
 */
export function resolveFlatRow(layout: DayLayout, flatIndex: number): RowLocation | null {
  if (layout.rowsPerDay <= 0) return null
  if (!Number.isInteger(flatIndex) || flatIndex < 0 || flatIndex >= layout.totalRows) {
    return null
  }
  return {
    day: Math.floor(flatIndex / layout.rowsPerDay),
    strip: flatIndex % layout.rowsPerDay,
  }
}

/**
 * The inverse of `resolveFlatRow`: the flat row index of one strip on one day,
 * which is where a block's `blockY` comes from. Returns `null` for coordinates
 * outside the layout.
 */
export function flatRowIndex(layout: DayLayout, day: number, strip: number): number | null {
  if (day < 0 || day >= layout.daysAvailable) return null
  if (strip < 0 || strip >= layout.rowsPerDay) return null
  return day * layout.rowsPerDay + strip
}

/**
 * Rows a viewport spans, rounded **up** so a row visible by a single pixel is
 * still rendered — an exact multiple therefore adds no extra row.
 */
function rowsSpanning(viewportHeightPx: number, rowHeightStep: RowHeightStep): number {
  return Math.ceil(viewportHeightPx / ROW_HEIGHT_PX[rowHeightStep])
}

/**
 * The furthest `rowScroll` worth scrolling to: the position that puts the last
 * row at the bottom of the viewport. Scrolling past it would only add blank
 * space below the canvas, and pinning there is what keeps a *stale* stored
 * `rowScroll` — one saved against a larger tournament, which
 * `isValidViewState` happily accepts and nothing re-clamps when `setDays` or
 * `setStrips` shrinks the layout — from parking the user on a single last row.
 *
 * Zero when the canvas is shorter than the viewport, or when there is nothing
 * to scroll.
 */
export function maxRowScroll(
  viewportHeightPx: number,
  rowHeightStep: RowHeightStep,
  totalRows: number,
): number {
  if (totalRows <= 0 || viewportHeightPx <= 0) return 0
  return Math.max(0, totalRows - rowsSpanning(viewportHeightPx, rowHeightStep))
}

/**
 * The inclusive range of flat rows a viewport shows, from uniform row heights.
 *
 * `rowScroll` is clamped into `[0, maxRowScroll(...)]`, so scrolling past
 * either end pins to the nearest *full window* rather than rendering nothing
 * or a single row against a blank viewport. `lastRow` is clamped to
 * `totalRows - 1` as well, which still matters when the viewport is taller
 * than the whole canvas. Returns `null` when there is nothing to render.
 */
export function visibleRowRange(
  rowScroll: number,
  viewportHeightPx: number,
  rowHeightStep: RowHeightStep,
  totalRows: number,
): RowRange | null {
  if (totalRows <= 0 || viewportHeightPx <= 0) return null

  const firstRow = Math.min(
    Math.max(Math.floor(rowScroll), 0),
    maxRowScroll(viewportHeightPx, rowHeightStep, totalRows),
  )
  const lastRow = Math.min(
    firstRow + rowsSpanning(viewportHeightPx, rowHeightStep) - 1,
    totalRows - 1,
  )

  return { firstRow, lastRow }
}

/**
 * The half-open range of minutes a viewport shows. `timeZoom` is minutes per
 * pixel, so the window covers `viewportWidthPx * timeZoom` minutes — the one
 * place this module has to agree with `geometry.pxPerMinute`, which divides by
 * the same number.
 */
export function visibleTimeRange(
  timeScroll: number,
  timeZoom: number,
  viewportWidthPx: number,
): TimeRange {
  return {
    startMinutes: timeScroll,
    endMinutes: timeScroll + viewportWidthPx * timeZoom,
  }
}

/**
 * Whether a block overlaps the visible time window. The window is half-open:
 * a block ending exactly at `startMinutes` and a block starting exactly at
 * `endMinutes` are both outside.
 */
export function intersectsTimeRange(
  range: TimeRange,
  startMinutes: number,
  endMinutes: number,
): boolean {
  return startMinutes < range.endMinutes && endMinutes > range.startMinutes
}
