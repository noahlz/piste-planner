// Viewer preferences: how one person is looking at a tournament, not the
// tournament itself. Persisted to localStorage under one key, deliberately
// outside src/store/serialization.ts (research D10) — serializeState builds
// an explicit object literal, so a field this module owns cannot leak into a
// shared URL by accident.

export const ViewMode = {
  MATRIX: 'matrix',
  SCHEDULE: 'schedule',
} as const
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode]

export const RowHeightStep = {
  COMPACT: 'compact',
  NORMAL: 'normal',
  TALL: 'tall',
} as const
export type RowHeightStep = (typeof RowHeightStep)[keyof typeof RowHeightStep]

export interface ViewState {
  viewMode: ViewMode
  rowHeightStep: RowHeightStep
  timeZoom: number // minutes per pixel
  timeScroll: number // minutes from midnight
  rowScroll: number // flat row index
  drawerHeight: number
  scorecardExpanded: boolean
}

// Frozen so a future accidental write (e.g. `state.timeZoom = x` instead of a
// copy) throws immediately in strict mode rather than corrupting every
// caller that shares this reference.
export const DEFAULT_VIEW_STATE: ViewState = Object.freeze({
  // The matrix is the center's default view from T040 on (FR-023, research
  // D11) — US1 shipped SCHEDULE because the canvas did not exist yet.
  viewMode: ViewMode.MATRIX,
  rowHeightStep: RowHeightStep.NORMAL,
  timeZoom: 1,
  // 08:00, where a competition day starts. Midnight is a valid scroll but it
  // opens the matrix on eight hours of empty grid with the schedule off the
  // right edge, which `Fit to day` then has to undo on every first load.
  timeScroll: 480,
  rowScroll: 0,
  drawerHeight: 240,
  scorecardExpanded: false,
})

export const VIEW_STATE_STORAGE_KEY = 'piste-planner:view-state'

const VIEW_MODES: Set<string> = new Set(Object.values(ViewMode))
const ROW_HEIGHT_STEPS: Set<string> = new Set(Object.values(RowHeightStep))

/**
 * Structural validation against DEFAULT_VIEW_STATE's shape. Every field is
 * required and union fields are checked against their `as const` value sets
 * rather than trusted from the parse — a stale or hand-edited localStorage
 * value must fall back to defaults, never reach the UI half-formed.
 */
function isValidViewState(value: unknown): value is ViewState {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const v = value as Record<string, unknown>

  if (typeof v.viewMode !== 'string' || !VIEW_MODES.has(v.viewMode)) return false
  if (typeof v.rowHeightStep !== 'string' || !ROW_HEIGHT_STEPS.has(v.rowHeightStep)) return false
  // Range checks, not just typeof: a stored value out of range is as
  // untrustworthy as one of the wrong type, and falls back to the same
  // wholesale default rather than being clamped or merged field-by-field.
  // Number.isFinite is required explicitly — typeof Infinity === 'number'
  // and Infinity satisfies both `> 0` and `>= 0` bounds below.
  if (typeof v.timeZoom !== 'number' || !Number.isFinite(v.timeZoom) || v.timeZoom <= 0) {
    return false
  }
  if (typeof v.timeScroll !== 'number' || !Number.isFinite(v.timeScroll) || v.timeScroll < 0) {
    return false
  }
  // Number.isInteger(Infinity) is false, so this already excludes non-finite
  // values without a separate Number.isFinite check.
  if (typeof v.rowScroll !== 'number' || !Number.isInteger(v.rowScroll) || v.rowScroll < 0) {
    return false
  }
  if (
    typeof v.drawerHeight !== 'number' ||
    !Number.isFinite(v.drawerHeight) ||
    v.drawerHeight < 0
  ) {
    return false
  }
  if (typeof v.scorecardExpanded !== 'boolean') return false

  return true
}

/**
 * Reads viewer preferences from localStorage. Never throws — any missing key,
 * malformed JSON, wrong-shaped JSON, missing field, or invalid union value
 * falls back wholesale to DEFAULT_VIEW_STATE.
 */
export function loadViewState(): ViewState {
  let raw: string | null
  try {
    raw = localStorage.getItem(VIEW_STATE_STORAGE_KEY)
  } catch {
    return { ...DEFAULT_VIEW_STATE }
  }
  if (raw == null || raw === '') {
    return { ...DEFAULT_VIEW_STATE }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ...DEFAULT_VIEW_STATE }
  }

  if (!isValidViewState(parsed)) {
    return { ...DEFAULT_VIEW_STATE }
  }

  return parsed
}

/**
 * Writes viewer preferences to localStorage, overwriting any previous value
 * under the same key. Never throws — a full quota or a browser that denies
 * storage access (e.g. Safari private mode) must not interrupt the caller,
 * matching the tolerance loadViewState() already has for a throwing getItem.
 */
export function saveViewState(state: ViewState): void {
  try {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage unavailable or full: the view preference silently doesn't
    // persist for this session, which is preferable to breaking the caller.
  }
}
