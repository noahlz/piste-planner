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

// The tool rail's five inspector panels (013 T009, ui-contract.md §Tool
// rail). `null` means the rail is fully closed.
export const PanelId = {
  TOURNAMENT: 'tournament',
  STRIPS: 'strips',
  EVENTS: 'events',
  FINDINGS: 'findings',
  SETTINGS: 'settings',
} as const
export type PanelId = (typeof PanelId)[keyof typeof PanelId]

/**
 * 013 T026 (data-model §2, contracts/ui-contract.md §Footer): the canvas no
 * longer holds a window of its own. The old row-height-step, per-axis zoom,
 * `timeScroll` and `rowScroll` fields described a canvas that scrolled by arithmetic and sized its
 * rows by a separate three-value control; the redesigned canvas scrolls
 * natively (so the browser owns both scroll positions) and its row height
 * follows the zoom rung. What is left to persist is where on the ladder the
 * viewer is, and whether they are in fit-to-day.
 */
export interface ViewState {
  viewMode: ViewMode
  /** An index into `components/canvas/zoomLadder.ts`'s ZOOM_STEPS: 0–5. */
  zoomStep: number
  /** Fit-to-day: the day span is solved to the plot's width, not to a rung. */
  fitting: boolean
  panel: PanelId | null
  panelDocked: boolean
  /** The detail strip is collapsed to one line. */
  detailCollapsed: boolean
}

// Frozen so a future accidental write (e.g. `state.zoomStep = x` instead of a
// copy) throws immediately in strict mode rather than corrupting every
// caller that shares this reference.
export const DEFAULT_VIEW_STATE: ViewState = Object.freeze({
  // The matrix is the center's default view from T040 on (FR-023, research
  // D11) — US1 shipped SCHEDULE because the canvas did not exist yet.
  viewMode: ViewMode.MATRIX,
  // The 100% rung (zoomLadder.ts DEFAULT_ZOOM), with fit-to-day on: the
  // opening view shows a whole day rather than a window into one, so a fresh
  // load needs no gesture to see what was scheduled (data-model §2).
  zoomStep: 2,
  fitting: true,
  panel: null,
  panelDocked: false,
  detailCollapsed: false,
})

export const VIEW_STATE_STORAGE_KEY = 'piste-planner:view-state'

/**
 * The ladder's bounds, restated rather than imported.
 *
 * `zoomLadder.ts` lives under `src/components/`, and a store module that
 * imported a component module would invert the dependency the rest of the
 * store keeps. The two are held together by `viewState.test.ts`, which pins
 * 0–5 against the ladder's six rungs.
 */
const MIN_ZOOM_STEP = 0
const MAX_ZOOM_STEP = 5

const VIEW_MODES: Set<string> = new Set(Object.values(ViewMode))
const PANEL_IDS: Set<string> = new Set(Object.values(PanelId))

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
  // A range check, not just typeof: a stored step outside the ladder is as
  // untrustworthy as one of the wrong type, and falls back to the same
  // wholesale default rather than being clamped or merged field-by-field.
  // Number.isInteger(Infinity) is false, so this excludes non-finite values
  // without a separate Number.isFinite check — and a fractional step, which
  // indexes no rung.
  if (
    typeof v.zoomStep !== 'number' ||
    !Number.isInteger(v.zoomStep) ||
    v.zoomStep < MIN_ZOOM_STEP ||
    v.zoomStep > MAX_ZOOM_STEP
  ) {
    return false
  }
  if (typeof v.fitting !== 'boolean') return false
  // null is a valid value (the rail fully closed) — only a non-null value has
  // to match one of the five ids, and a missing field is `undefined`, which
  // satisfies neither branch and falls back like every other missing field.
  if (v.panel !== null && (typeof v.panel !== 'string' || !PANEL_IDS.has(v.panel))) {
    return false
  }
  if (typeof v.panelDocked !== 'boolean') return false
  if (typeof v.detailCollapsed !== 'boolean') return false

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
