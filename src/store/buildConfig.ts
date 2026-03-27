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

  const allow_sabre_ref_fillin = state.dayRefs.some(d => d.allow_sabre_ref_fillin)

  const config: TournamentConfig = {
    tournament_type: state.tournament_type,
    days_available: state.days_available,
    strips,
    strips_total: state.strips_total,
    video_strips_total: state.video_strips_total,
    referee_availability,
    allow_sabre_ref_fillin,
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
    sabre_refs: ref.sabre_refs,
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
      de_finals_strip_id: null,
      de_finals_strip_requirement: DeStripRequirement.HARD,
      de_round_of_16_strips: 4,
      de_round_of_16_requirement: DeStripRequirement.HARD,
      de_finals_strips: 2,
      de_finals_requirement: DeStripRequirement.HARD,
      flighted: false,
      flighting_group_id: null,
      is_priority: false,
      strips_allocated: 0,
      // TODO: Apply accepted flighting suggestions from state.flightingSuggestionStates
    })
  }

  return competitions
}
