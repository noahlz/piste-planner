import type {
  Competition,
  DayRefereeAvailability,
  Strip,
  TournamentConfig,
} from '../engine/types.ts'
import { DeStripRequirement } from '../engine/types.ts'
import { findCompetition } from '../engine/catalogue.ts'
import {
  DAY_START_MINS,
  DAY_END_MINS,
  LATEST_START_MINS,
  LATEST_START_OFFSET,
  SLOT_MINS,
  DAY_LENGTH_MINS,
  DE_REFS,
  DE_FINALS_MIN_MINS,
  SAME_TIME_WINDOW_MINS,
  INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD,
  MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS,
  MIN_FENCERS,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  DEFAULT_DE_DURATION_TABLE,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
} from '../engine/constants.ts'
import type { StoreState } from './store.ts'

/**
 * Bridges the Zustand store shape to the engine's TournamentConfig + Competition[] interfaces.
 * Pure function — takes store state as parameter for testability.
 */
export function buildTournamentConfig(state: StoreState): {
  config: TournamentConfig
  competitions: Competition[]
} {
  const strips = buildStrips(state.strips_total, state.video_strips_total)

  const referee_availability = buildRefereeAvailability(state.dayRefs)

  const config: TournamentConfig = {
    tournament_type: state.tournament_type,
    days_available: state.days_available,
    strips,
    strips_total: state.strips_total,
    video_strips_total: state.video_strips_total,
    referee_availability,
    pod_captain_override: state.pod_captain_override,
    dayConfigs: state.dayConfigs,

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
    DE_FINALS_MIN_MINS,
    SAME_TIME_WINDOW_MINS,
    INDIV_TEAM_MIN_GAP_MINS,
    EARLY_START_THRESHOLD,
    MAX_RESCHEDULE_ATTEMPTS,
    MAX_FENCERS,
    MIN_FENCERS,
    pool_round_duration_table: DEFAULT_POOL_ROUND_DURATION_TABLE,
    de_duration_table: DEFAULT_DE_DURATION_TABLE,

    // Strip budget defaults — per-event UI overrides to be added in a future task
    max_pool_strip_pct: 0.80,
    max_de_strip_pct: 0.80,

    // DE capacity estimation model — pod is default (sub-brackets with R16 consolidation)
    de_capacity_mode: 'pod',
  }

  const competitions = buildCompetitions(state)

  return { config, competitions }
}

function buildStrips(total: number, videoCount: number): Strip[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `strip-${i + 1}`,
    video_capable: i < videoCount,
  }))
}

function buildRefereeAvailability(
  dayRefs: StoreState['dayRefs'],
): DayRefereeAvailability[] {
  return dayRefs.map((ref, i) => ({
    day: i,
    foil_epee_refs: ref.foil_epee_refs,
    three_weapon_refs: ref.three_weapon_refs,
    source: 'ACTUAL' as const,
  }))
}

function buildCompetitions(state: StoreState): Competition[] {
  const competitions: Competition[] = []

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
      ref_policy: overrides.ref_policy,
      cut_mode: overrides.cut_mode,
      cut_value: overrides.cut_value,
      de_mode: overrides.de_mode,
      de_video_policy: overrides.de_video_policy,
      use_single_pool_override: overrides.use_single_pool_override,

      // Sensible defaults
      earliest_start: 0,
      latest_end: 9999,
      optional: false,
      // When include_finals_strip is enabled, designate the last strip as the dedicated finals strip
      de_finals_strip_id: state.include_finals_strip ? `strip-${state.strips_total}` : null,
      de_finals_strip_requirement: DeStripRequirement.HARD,
      de_round_of_16_strips: 4,
      de_round_of_16_requirement: DeStripRequirement.HARD,
      de_finals_strips: state.include_finals_strip ? 1 : 2,
      de_finals_requirement: DeStripRequirement.HARD,
      flighted: false,
      flighting_group_id: null,
      is_priority: false,
      strips_allocated: 0,

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
  for (let i = 0; i < state.flightingSuggestions.length; i++) {
    if (state.flightingSuggestionStates[i] !== 'accepted') continue

    const group = state.flightingSuggestions[i]
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
