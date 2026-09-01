import type {
  Competition,
  FlightingGroup,
  Strip,
  TournamentConfig,
} from '../engine/types.ts'
import { DeStripRequirement, RefPolicy } from '../engine/types.ts'
import { findCompetition } from '../engine/catalogue.ts'
import {
  DAY_START_MINS,
  DAY_END_MINS,
  LATEST_START_MINS,
  LATEST_START_OFFSET,
  SLOT_MINS,
  DAY_LENGTH_MINS,
  DE_REFS,
  SAME_TIME_WINDOW_MINS,
  INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD,
  MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS,
  MIN_FENCERS,
  DEFAULT_DE_DURATION_TABLE,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
} from '../engine/constants.ts'
import type { StoreState } from './store.ts'
import { TYPE_DEFAULTS } from './typeDefaults.ts'

/**
 * Calendar-day spacing between scheduler-axis day windows (research.md D5).
 * Day d's window is [d*DAY_AXIS_SPACING_MINS + start_d, d*DAY_AXIS_SPACING_MINS + end_d) —
 * see contracts/day-axis.md C1. `runActions.ts` imports this to reverse the
 * conversion when a schedule result becomes a Placement (C2).
 */
export const DAY_AXIS_SPACING_MINS = 1440

/**
 * Bridges the Zustand store shape to the engine's TournamentConfig + Competition[] interfaces.
 * Pure function — takes store state as parameter for testability.
 *
 * Flighting suggestions are passed in rather than read from the store: they are
 * derived from current inputs, and the store keeps only the user's accept/reject
 * intent against them (positionally, via `flightingSuggestionStates`).
 */
export function buildTournamentConfig(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = [],
): {
  config: TournamentConfig
  competitions: Competition[]
} {
  // `null` alone means "follow the tournament type's default" (research D7).
  // `??` and not `||`: `0` is a legitimate explicit value — a tournament with
  // no video strips — and must survive rather than resolve to a NAC's 8.
  // Resolved once into a local because two sites downstream need the resolved
  // number, the strip list and `config.video_strips_total`. Nothing is written
  // back to `state` (FR-036), so a later tournament type change still sees
  // `null` and re-resolves against the new type.
  const videoStrips = state.video_strips_total ?? TYPE_DEFAULTS[state.tournament_type].video_strips_total
  const strips = buildStrips(state.strips_total, videoStrips)

  const config: TournamentConfig = {
    tournament_type: state.tournament_type,
    days_available: state.days_available,
    strips,
    strips_total: state.strips_total,
    video_strips_total: videoStrips,
    // Store's dayConfigs are clock axis (0-1439 within each day). scheduleAll
    // requires the scheduler axis instead — day d's window shifted by
    // d*DAY_AXIS_SPACING_MINS so no two days' windows overlap on the absolute
    // minute axis strip_allocations uses (contracts/day-axis.md C1). The
    // store's own state.dayConfigs is left untouched — only this config copy
    // carries the shift.
    dayConfigs: state.dayConfigs.map((day, d) => ({
      day_start_time: d * DAY_AXIS_SPACING_MINS + day.day_start_time,
      day_end_time: d * DAY_AXIS_SPACING_MINS + day.day_end_time,
    })),

    // Global overrides from store
    ADMIN_GAP_MINS: state.globalOverrides.ADMIN_GAP_MINS,
    FLIGHT_BUFFER_MINS: state.globalOverrides.FLIGHT_BUFFER_MINS,
    THRESHOLD_MINS: state.globalOverrides.THRESHOLD_MINS,

    // Engine constants
    DAY_START_MINS,
    DAY_END_MINS,
    LATEST_START_MINS,
    LATEST_START_OFFSET,
    SLOT_MINS,
    DAY_LENGTH_MINS,
    DE_REFS,
    SAME_TIME_WINDOW_MINS,
    INDIV_TEAM_MIN_GAP_MINS,
    EARLY_START_THRESHOLD,
    MAX_RESCHEDULE_ATTEMPTS,
    MAX_FENCERS,
    MIN_FENCERS,
    pool_round_duration_table: state.pool_round_duration_table,
    de_duration_table: DEFAULT_DE_DURATION_TABLE,

    // Strip budget defaults — per-event UI overrides to be added in a future task
    max_pool_strip_pct: 0.80,
    max_de_strip_pct: 0.80,
  }

  const competitions = buildCompetitions(state, flightingSuggestions)

  return { config, competitions }
}

function buildStrips(total: number, videoCount: number): Strip[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `strip-${i + 1}`,
    video_capable: i < videoCount,
  }))
}

function buildCompetitions(
  state: StoreState,
  flightingSuggestions: FlightingGroup[],
): Competition[] {
  const competitions: Competition[] = []

  // The two per-event settings whose "unset" markers resolve against the
  // tournament type (research D5, D6). Resolution happens here, on the copy
  // travelling to the engine — `src/engine/pools.ts` never learns about
  // tournaments (constitution I) and the store keeps its `AUTO`s (FR-036).
  const typeDefaults = TYPE_DEFAULTS[state.tournament_type]

  for (const [id, overrides] of Object.entries(state.selectedCompetitions)) {
    const entry = findCompetition(id)
    if (!entry) continue

    competitions.push({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,

      // Store overrides
      fencer_count: overrides.fencer_count,
      // `AUTO` is the only value that follows the type; `ONE` and `TWO` are the
      // organizer's own and beat the default (FR-037).
      ref_policy:
        overrides.ref_policy === RefPolicy.AUTO ? typeDefaults.ref_policy : overrides.ref_policy,
      cut_mode: overrides.cut_mode,
      cut_value: overrides.cut_value,
      // Same rule for DE mode (research D6): the store's setting carries an
      // `'AUTO'` the engine's `DeMode` has no member for, and resolving it here
      // is what narrows the union — an explicit SINGLE_STAGE or STAGED passes
      // through as itself.
      de_mode: overrides.de_mode === 'AUTO' ? typeDefaults.de_mode : overrides.de_mode,
      de_video_policy: overrides.de_video_policy,
      use_single_pool_override: overrides.use_single_pool_override,

      // Sensible defaults
      earliest_start: 0,
      // Genuinely unconstrained (research.md D6) — a finite sentinel like the
      // old 9999 binds once a day's scheduler-axis end (d*DAY_AXIS_SPACING_MINS
      // + day_end_time) passes it, which under 1440-minute spacing starts at
      // day 7. Infinity can never be the minimum in
      // Math.min(dayEnd(day, config), latest_end), for any day count.
      latest_end: Infinity,
      optional: false,
      de_round_of_16_strips: 4,
      de_round_of_16_requirement: DeStripRequirement.HARD,
      flighted: false,
      flighting_group_id: null,
      is_priority: false,
      // The fourth seam parity-exceptions.md names. A `0` here zeroes the DE
      // term of `estimateCompetitionStripHours`
      // (`strips_allocated × de_duration / 60`, src/engine/capacity.ts:146),
      // so every individual event contributed nothing to the upfront
      // feasibility estimate and the gate at src/engine/validation.ts:405
      // never fired on the app path. This is the ledger factory's own
      // pre-allocation (`__tests__/helpers/scenarios.ts:69`) — a default, not
      // a decision: the accepted-flighting loop below overwrites it with the
      // organizer's explicit allocation.
      strips_allocated: Math.max(2, Math.ceil(overrides.fencer_count / 7)),

      // Per-event strip budget overrides — always null until UI exposes them
      max_pool_strip_pct_override: null,
      max_de_strip_pct_override: null,
    })
  }

  // For regional tournament types (ROC, SYC, RJCC, SJCC), force DISABLED cuts on categories
  // that must advance all fencers to DEs per the USA Fencing Athlete Handbook.
  if (REGIONAL_CUT_TOURNAMENT_TYPES.has(state.tournament_type)) {
    for (const comp of competitions) {
      const override = REGIONAL_CUT_OVERRIDES[comp.category]
      if (override) {
        comp.cut_mode = override.mode
        comp.cut_value = override.value
      }
    }
  }

  // Apply accepted flighting suggestions, mutating the competition objects already in the array.
  for (let i = 0; i < flightingSuggestions.length; i++) {
    if (state.flightingSuggestionStates[i] !== 'accepted') continue

    const group = flightingSuggestions[i]
    const groupId = `${group.priority_competition_id}+${group.flighted_competition_id}`

    const priority = competitions.find((c) => c.id === group.priority_competition_id)
    if (priority) {
      priority.flighted = true
      priority.is_priority = true
      priority.flighting_group_id = groupId
      priority.strips_allocated = group.strips_for_priority
    }

    const flighted = competitions.find((c) => c.id === group.flighted_competition_id)
    if (flighted) {
      flighted.flighted = true
      flighted.is_priority = false
      flighted.flighting_group_id = groupId
      flighted.strips_allocated = group.strips_for_flighted
    }
  }

  return competitions
}
