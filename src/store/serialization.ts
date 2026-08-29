import type { StoreState, CompetitionConfig, GlobalOverrides } from './store.ts'
import type { DayConfig, TournamentType, Weapon as WeaponType, Placement } from '../engine/types.ts'
import { TournamentType as TT, Weapon, PlacementSource } from '../engine/types.ts'
import { POOL_DURATION_MIN, POOL_DURATION_MAX } from '../engine/constants.ts'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export interface SerializedState {
  schemaVersion: 2
  tournament: {
    tournament_type: TournamentType
    days_available: number
    dayConfigs: DayConfig[]
    strips_total: number
    video_strips_total: number
    // Always written on save – optional only because reads tolerate its absence (schema leniency, research D3).
    pool_round_duration_table?: Record<WeaponType, number>
  }
  competitions: {
    selectedCompetitions: Record<string, CompetitionConfig>
    globalOverrides: GlobalOverrides
  }
  placements: Record<string, Placement>
  dismissedFindings: string[]
}

const VALID_TOP_LEVEL_KEYS = [
  'schemaVersion',
  'tournament',
  'competitions',
  'placements',
  'dismissedFindings',
] as const
const VALID_TOURNAMENT_TYPES = new Set(Object.values(TT))

// ──────────────────────────────────────────────
// Serialize
// ──────────────────────────────────────────────

/** Serialize current store state to JSON string. Only serializable slices are included. */
export function serializeState(state: StoreState): string {
  const serialized: SerializedState = {
    schemaVersion: 2,
    tournament: {
      tournament_type: state.tournament_type,
      days_available: state.days_available,
      dayConfigs: state.dayConfigs,
      strips_total: state.strips_total,
      video_strips_total: state.video_strips_total,
      pool_round_duration_table: state.pool_round_duration_table,
    },
    competitions: {
      selectedCompetitions: state.selectedCompetitions,
      globalOverrides: state.globalOverrides,
    },
    placements: state.placements,
    dismissedFindings: Object.keys(state.dismissedFindings),
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

  // Check for unknown top-level fields. v1's legacy carve-out for a stray
  // "referees" key does not carry over – it is rejected like any other unknown field.
  const allowedKeys = new Set<string>(VALID_TOP_LEVEL_KEYS)
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      return { valid: false, error: `Unknown top-level field: "${key}"` }
    }
  }

  // schemaVersion
  if (obj.schemaVersion !== 2) {
    return { valid: false, error: 'schemaVersion must be 2' }
  }

  // tournament
  if (obj.tournament == null || typeof obj.tournament !== 'object') {
    return { valid: false, error: 'Missing required field: tournament' }
  }
  const t = obj.tournament as Record<string, unknown>

  if (!VALID_TOURNAMENT_TYPES.has(t.tournament_type as TournamentType)) {
    return { valid: false, error: `Invalid tournament_type: "${String(t.tournament_type)}"` }
  }

  if (typeof t.days_available !== 'number' || t.days_available < 1 || t.days_available > 14) {
    return { valid: false, error: 'days_available must be between 1 and 14' }
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

  // pool_round_duration_table – absent is valid (schema leniency), present must be complete and in range
  if (t.pool_round_duration_table !== undefined) {
    const table = t.pool_round_duration_table
    if (table == null || typeof table !== 'object') {
      return { valid: false, error: 'pool_round_duration_table must be an object' }
    }
    const tableObj = table as Record<string, unknown>
    const weapons = Object.values(Weapon)
    for (const key of Object.keys(tableObj)) {
      if (!weapons.includes(key as WeaponType)) {
        return { valid: false, error: `Unknown weapon "${key}" in pool_round_duration_table` }
      }
    }
    for (const weapon of weapons) {
      if (!(weapon in tableObj)) {
        return { valid: false, error: `pool_round_duration_table is missing weapon "${weapon}"` }
      }
      const v = tableObj[weapon]
      if (
        typeof v !== 'number' ||
        !Number.isInteger(v) ||
        v < POOL_DURATION_MIN ||
        v > POOL_DURATION_MAX
      ) {
        return {
          valid: false,
          error: `pool_round_duration_table.${weapon} must be an integer between ${POOL_DURATION_MIN} and ${POOL_DURATION_MAX}`,
        }
      }
    }
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

  // placements – required key, keyed by event id. A day beyond days_available - 1 is
  // accepted here (stored intent); it surfaces as a finding elsewhere, not a load error.
  if (obj.placements == null || typeof obj.placements !== 'object' || Array.isArray(obj.placements)) {
    return { valid: false, error: 'placements must be an object' }
  }
  const placementsObj = obj.placements as Record<string, unknown>
  for (const [id, entry] of Object.entries(placementsObj)) {
    if (entry == null || typeof entry !== 'object') {
      return { valid: false, error: `placement for "${id}" must be an object` }
    }
    const p = entry as Record<string, unknown>

    if (typeof p.day !== 'number' || !Number.isInteger(p.day) || p.day < 0) {
      return { valid: false, error: `placement.day for "${id}" must be a non-negative integer` }
    }
    if (typeof p.start_time !== 'number' || !Number.isInteger(p.start_time) || p.start_time < 0) {
      return { valid: false, error: `placement.start_time for "${id}" must be a non-negative integer` }
    }
    if (typeof p.strip_count !== 'number' || !Number.isInteger(p.strip_count) || p.strip_count < 1) {
      return { valid: false, error: `placement.strip_count for "${id}" must be an integer >= 1` }
    }
    if (p.source !== PlacementSource.AUTO && p.source !== PlacementSource.MANUAL) {
      return { valid: false, error: `placement.source for "${id}" must be "auto" or "manual"` }
    }
    if (typeof p.pinned !== 'boolean') {
      return { valid: false, error: `placement.pinned for "${id}" must be a boolean` }
    }
    if (p.strips !== null) {
      if (!Array.isArray(p.strips)) {
        return { valid: false, error: `placement.strips for "${id}" must be null or an array of integers` }
      }
      for (const idx of p.strips) {
        if (typeof idx !== 'number' || !Number.isInteger(idx) || idx < 0) {
          return {
            valid: false,
            error: `placement.strips for "${id}" must contain only non-negative integers`,
          }
        }
      }
    }
  }

  // dismissedFindings – required key, array of finding identities. Unknown identities are
  // accepted (sticky records that may match a future recompute), so no cross-check here.
  if (!Array.isArray(obj.dismissedFindings)) {
    return { valid: false, error: 'dismissedFindings must be an array' }
  }
  for (const entry of obj.dismissedFindings) {
    if (typeof entry !== 'string') {
      return { valid: false, error: 'dismissedFindings must contain only strings' }
    }
  }

  return { valid: true, data: obj as unknown as SerializedState }
}

// ──────────────────────────────────────────────
// Deserialize
// ──────────────────────────────────────────────

/**
 * Deserialize JSON string back to partial store state.
 * Returns { state, droppedPlacements } on success, { error } on failure.
 * droppedPlacements lists placement event ids dropped because they no longer
 * match a selected competition (lenient load, always present, empty when none dropped).
 */
export function deserializeState(
  json: string,
): { state: Partial<StoreState>; droppedPlacements: string[] } | { error: string } {
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
  // Extra fields on tournament/competitions (e.g., the legacy include_finals_strip flag) are
  // silently dropped here — old saved tournaments load without error.
  const state: Partial<StoreState> = {
    tournament_type: data.tournament.tournament_type,
    days_available: data.tournament.days_available,
    dayConfigs: data.tournament.dayConfigs,
    strips_total: data.tournament.strips_total,
    video_strips_total: data.tournament.video_strips_total,
    selectedCompetitions: data.competitions.selectedCompetitions,
    globalOverrides: data.competitions.globalOverrides,
  }
  // Only assign when present – a key set to undefined would clobber the store's
  // seeded defaults through the useStore.setState merge (research D3).
  if (data.tournament.pool_round_duration_table !== undefined) {
    state.pool_round_duration_table = data.tournament.pool_round_duration_table
  }

  // Lenient load: a placement whose event id isn't selected is dropped and reported,
  // not an error (contract "Acceptance rules").
  const knownIds = new Set(Object.keys(data.competitions.selectedCompetitions))
  const placements: Record<string, Placement> = {}
  const droppedPlacements: string[] = []
  for (const [id, placement] of Object.entries(data.placements)) {
    if (knownIds.has(id)) {
      placements[id] = placement
    } else {
      droppedPlacements.push(id)
    }
  }
  state.placements = placements

  const dismissedFindings: Record<string, true> = {}
  for (const id of data.dismissedFindings) {
    dismissedFindings[id] = true
  }
  state.dismissedFindings = dismissedFindings

  return { state, droppedPlacements }
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
): { state: Partial<StoreState>; droppedPlacements: string[] } | { error: string } {
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
