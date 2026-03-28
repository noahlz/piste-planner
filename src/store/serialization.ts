import type { StoreState, CompetitionConfig, GlobalOverrides, DayRefConfig } from './store.ts'
import type { DayConfig, TournamentType, PodCaptainOverride } from '../engine/types.ts'
import { TournamentType as TT } from '../engine/types.ts'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SerializedState {
  schemaVersion: 1
  tournament: {
    tournament_type: TournamentType
    days_available: number
    dayConfigs: DayConfig[]
    strips_total: number
    video_strips_total: number
    include_finals_strip?: boolean  // optional for backwards compat
    pod_captain_override: PodCaptainOverride
  }
  competitions: {
    selectedCompetitions: Record<string, CompetitionConfig>
    globalOverrides: GlobalOverrides
  }
  referees: {
    dayRefs: DayRefConfig[]
  }
}

const VALID_TOP_LEVEL_KEYS = ['schemaVersion', 'tournament', 'competitions', 'referees'] as const
const VALID_TOURNAMENT_TYPES = new Set(Object.values(TT))

// ──────────────────────────────────────────────
// Serialize
// ──────────────────────────────────────────────

/** Serialize current store state to JSON string. Only serializable slices are included. */
export function serializeState(state: StoreState): string {
  const serialized: SerializedState = {
    schemaVersion: 1,
    tournament: {
      tournament_type: state.tournament_type,
      days_available: state.days_available,
      dayConfigs: state.dayConfigs,
      strips_total: state.strips_total,
      video_strips_total: state.video_strips_total,
      include_finals_strip: state.include_finals_strip,
      pod_captain_override: state.pod_captain_override,
    },
    competitions: {
      selectedCompetitions: state.selectedCompetitions,
      globalOverrides: state.globalOverrides,
    },
    referees: {
      dayRefs: state.dayRefs,
    },
  }
  return JSON.stringify(serialized)
}

// ──────────────────────────────────────────────
// Validate
// ──────────────────────────────────────────────

/** Validate parsed data against the serialization schema. */
export function validateSchema(
  data: unknown,
): { valid: true; data: SerializedState } | { valid: false; error: string } {
  if (data == null || typeof data !== 'object') {
    return { valid: false, error: 'Input must be a non-null object' }
  }

  const obj = data as Record<string, unknown>

  // Check for unknown top-level fields
  const allowedKeys = new Set<string>(VALID_TOP_LEVEL_KEYS)
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unknown top-level field: "${key}"` }
    }
  }

  // schemaVersion
  if (obj.schemaVersion !== 1) {
    return { valid: false, error: 'schemaVersion must be 1' }
  }

  // tournament
  if (obj.tournament == null || typeof obj.tournament !== 'object') {
    return { valid: false, error: 'Missing required field: tournament' }
  }
  const t = obj.tournament as Record<string, unknown>

  if (!VALID_TOURNAMENT_TYPES.has(t.tournament_type as TournamentType)) {
    return { valid: false, error: `Invalid tournament_type: "${String(t.tournament_type)}"` }
  }

  if (typeof t.days_available !== 'number' || t.days_available < 2 || t.days_available > 4) {
    return { valid: false, error: 'days_available must be between 2 and 4' }
  }

  if (typeof t.strips_total !== 'number' || t.strips_total < 0) {
    return { valid: false, error: 'strips_total must be >= 0' }
  }

  if (
    typeof t.video_strips_total !== 'number' ||
    t.video_strips_total < 0 ||
    t.video_strips_total > (t.strips_total as number)
  ) {
    return { valid: false, error: 'video_strips_total must be >= 0 and <= strips_total' }
  }

  // competitions
  if (obj.competitions == null || typeof obj.competitions !== 'object') {
    return { valid: false, error: 'Missing required field: competitions' }
  }
  const c = obj.competitions as Record<string, unknown>

  if (c.selectedCompetitions != null && typeof c.selectedCompetitions === 'object') {
    const comps = c.selectedCompetitions as Record<string, Record<string, unknown>>
    for (const [id, config] of Object.entries(comps)) {
      if (typeof config.fencer_count !== 'number' || config.fencer_count < 0) {
        return { valid: false, error: `fencer_count must be >= 0 for competition "${id}"` }
      }
    }
  }

  // referees
  if (obj.referees == null || typeof obj.referees !== 'object') {
    return { valid: false, error: 'Missing required field: referees' }
  }

  return { valid: true, data: data as SerializedState }
}

// ──────────────────────────────────────────────
// Deserialize
// ──────────────────────────────────────────────

/**
 * Deserialize JSON string back to partial store state.
 * Returns { state } on success, { error } on failure.
 */
export function deserializeState(
  json: string,
): { state: Partial<StoreState> } | { error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return { error: 'Invalid JSON' }
  }

  const validation = validateSchema(parsed)
  if (!validation.valid) {
    return { error: validation.error }
  }

  const data = validation.data
  return {
    state: {
      tournament_type: data.tournament.tournament_type,
      days_available: data.tournament.days_available,
      dayConfigs: data.tournament.dayConfigs,
      strips_total: data.tournament.strips_total,
      video_strips_total: data.tournament.video_strips_total,
      include_finals_strip: data.tournament.include_finals_strip ?? false,
      pod_captain_override: data.tournament.pod_captain_override,
      selectedCompetitions: data.competitions.selectedCompetitions,
      globalOverrides: data.competitions.globalOverrides,
      dayRefs: data.referees.dayRefs,
    },
  }
}

// ──────────────────────────────────────────────
// URL encode / decode (JSON → base64url, no compression for jsdom compat)
// ──────────────────────────────────────────────

/** Convert standard base64 to base64url: replace +→-, /→_, strip trailing = */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Convert base64url back to standard base64 with padding */
function fromBase64Url(b64url: string): string {
  let b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  // Re-add padding
  const pad = b64.length % 4
  if (pad === 2) b64 += '=='
  else if (pad === 3) b64 += '='
  return b64
}

const URL_PREFIX = '#config='

/** Encode state to URL hash string: JSON → base64url → #config=... */
export function encodeToUrl(state: StoreState): string {
  const json = serializeState(state)
  const b64 = btoa(json)
  return `${URL_PREFIX}${toBase64Url(b64)}`
}

/** Decode URL hash string back to partial store state. */
export function decodeFromUrl(
  hash: string,
): { state: Partial<StoreState> } | { error: string } {
  if (!hash.startsWith(URL_PREFIX)) {
    return { error: `URL hash must start with "${URL_PREFIX}"` }
  }

  const payload = hash.slice(URL_PREFIX.length)

  let json: string
  try {
    json = atob(fromBase64Url(payload))
  } catch {
    return { error: 'Invalid base64url encoding' }
  }

  return deserializeState(json)
}
