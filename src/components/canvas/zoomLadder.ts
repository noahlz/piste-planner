/**
 * The zoom ladder (013, research D3, data-model §7) — six discrete pixel-
 * per-minute rungs plus a fit-to-day mode. Pure arithmetic: no React, no
 * store reads, nothing else in this module.
 *
 * A ladder replaces the continuous `[0.05, 8]` minutes-per-pixel zoom that
 * 004's canvas view used, which could reach scales
 * where blocks were narrower than their own borders (backlog §Zooming in
 * destroys the view). A ladder cannot reach a scale it does not contain,
 * which closes that defect by construction rather than by a clamp somebody
 * can later loosen.
 */

/** One rung: `ppm` is pixels per minute, `row` is the strip row height in px. */
export interface ZoomRung {
  readonly ppm: number
  readonly row: number
}

/** The six rungs, in order, from the mockup's ZOOM_STEPS. */
export const ZOOM_STEPS: readonly ZoomRung[] = [
  { ppm: 1.5, row: 15 },
  { ppm: 2.2, row: 22 },
  { ppm: 3.2, row: 34 },
  { ppm: 4.6, row: 48 },
  { ppm: 6.5, row: 62 },
  { ppm: 9.0, row: 78 },
]

/** The 100% rung: reset and a fresh view state both land here. */
export const DEFAULT_ZOOM = 2

/** The last index into ZOOM_STEPS. */
export const MAX_ZOOM_STEP = 5

/** Rung 2's ppm — the denominator every zoomReadout percentage is read against. */
export const ZOOM_BASE_PPM = 3.2

/** Fit day with no measured plot width draws at this rung's ppm. */
export const FIT_FALLBACK_STEP = DEFAULT_ZOOM

/** The zoom half of view state: which rung, and whether fit-to-day is active. */
export interface ZoomState {
  readonly zoomStep: number
  readonly fitting: boolean
}

/** Clamps a step into [0, MAX_ZOOM_STEP]; non-finite input falls back to DEFAULT_ZOOM. */
function clampStep(step: number): number {
  if (!Number.isFinite(step)) return DEFAULT_ZOOM
  return Math.min(MAX_ZOOM_STEP, Math.max(0, step))
}

/** The rung at a step, clamping out-of-range and non-finite input. */
export function rungAt(step: number): ZoomRung {
  return ZOOM_STEPS[clampStep(step)]
}

/** The percentage readout for a step, relative to rung 2 (the 100% rung). */
export function zoomReadout(step: number): string {
  return `${Math.round((rungAt(step).ppm / ZOOM_BASE_PPM) * 100)}%`
}

/** Whether the ladder has a finer rung above this step. */
export function canZoomIn(step: number): boolean {
  return step < MAX_ZOOM_STEP
}

/** Whether the ladder has a coarser rung below this step. */
export function canZoomOut(step: number): boolean {
  return step > 0
}

/**
 * Steps one rung in (`delta` 1) or out (`delta` -1), always clearing fit
 * mode. From fit mode this steps from the *stored* zoomStep — fit mode has
 * no rung of its own, so leaving it lands on the neighbour of whatever rung
 * was stored when it was entered. At either end of the ladder this returns
 * an equal, non-fitting state rather than wrapping.
 */
export function stepZoom(state: ZoomState, delta: 1 | -1): ZoomState {
  return { zoomStep: clampStep(state.zoomStep + delta), fitting: false }
}

/** The reset rung, fit mode cleared. */
export function resetZoom(): ZoomState {
  return { zoomStep: DEFAULT_ZOOM, fitting: false }
}

/** Enters fit-to-day, keeping whatever rung is stored for when it is left. */
export function fitDay(state: ZoomState): ZoomState {
  return { ...state, fitting: true }
}
