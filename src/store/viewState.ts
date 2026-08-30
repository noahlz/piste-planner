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

export const DEFAULT_VIEW_STATE: ViewState = {
  viewMode: ViewMode.SCHEDULE,
  rowHeightStep: RowHeightStep.NORMAL,
  timeZoom: 1,
  timeScroll: 0,
  rowScroll: 0,
  drawerHeight: 240,
  scorecardExpanded: false,
}

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
  if (typeof v.timeZoom !== 'number') return false
  if (typeof v.timeScroll !== 'number') return false
  if (typeof v.rowScroll !== 'number') return false
  if (typeof v.drawerHeight !== 'number') return false
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
    return DEFAULT_VIEW_STATE
  }
  if (raw == null || raw === '') {
    return DEFAULT_VIEW_STATE
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_VIEW_STATE
  }

  if (!isValidViewState(parsed)) {
    return DEFAULT_VIEW_STATE
  }

  return parsed
}

/** Writes viewer preferences to localStorage, overwriting any previous value under the same key. */
export function saveViewState(state: ViewState): void {
  localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(state))
}
