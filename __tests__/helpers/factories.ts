import type { Competition, ScheduleResult, TournamentConfig, Strip } from '../../src/engine/types.ts'
import {
  Category, Gender, Weapon,
  EventType, CutMode, DeMode, VideoPolicy,
  FencerCountType, RefPolicy, DeStripRequirement,
} from '../../src/engine/types.ts'
import {
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  DEFAULT_DE_DURATION_TABLE,
} from '../../src/engine/constants.ts'

// Minutes-from-midnight constants used across test factories
export const DAY_START_8AM = 480
export const DAY_END_10PM = 1320
export const LATEST_START_4PM = 960

export type CompetitionKey = Pick<Competition, 'category' | 'gender' | 'weapon' | 'event_type' | 'id'>

export function makeComp(
  id: string,
  category: Category,
  gender: Gender,
  weapon: Weapon,
  event_type: EventType = EventType.INDIVIDUAL,
): CompetitionKey {
  return { id, category, gender, weapon, event_type }
}

export function makeStrips(total: number, videoCount: number): Strip[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `strip-${i + 1}`,
    video_capable: i < videoCount,
  }))
}

export function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  const strips = overrides.strips ?? makeStrips(24, 4)
  const days = overrides.days_available ?? 3
  return {
    tournament_type: 'NAC',
    days_available: days,
    strips,
    strips_total: strips.length,
    video_strips_total: strips.filter(s => s.video_capable).length,
    referee_availability: Array.from({ length: days }, (_, i) => ({
      day: i,
      foil_epee_refs: 20,
      sabre_refs: 10,
      source: 'ACTUAL' as const,
    })),
    allow_sabre_ref_fillin: false,
    pod_captain_override: 'AUTO',
    DAY_START_MINS: DAY_START_8AM,
    DAY_END_MINS: DAY_END_10PM,
    LATEST_START_MINS: LATEST_START_4PM,
    LATEST_START_OFFSET: 480,
    SLOT_MINS: 30,
    DAY_LENGTH_MINS: 840,
    ADMIN_GAP_MINS: 15,
    FLIGHT_BUFFER_MINS: 15,
    THRESHOLD_MINS: 10,
    DE_REFS: 1,
    DE_FINALS_MIN_MINS: 30,
    SAME_TIME_WINDOW_MINS: 30,
    INDIV_TEAM_MIN_GAP_MINS: 120,
    EARLY_START_THRESHOLD: 10,
    MAX_RESCHEDULE_ATTEMPTS: 3,
    MAX_FENCERS: 500,
    MIN_FENCERS: 2,
    pool_round_duration_table: DEFAULT_POOL_ROUND_DURATION_TABLE,
    de_duration_table: DEFAULT_DE_DURATION_TABLE,
    dayConfigs: [],
    ...overrides,
  }
}

export function makeCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'test-comp',
    gender: Gender.MEN,
    category: Category.DIV1,
    weapon: Weapon.FOIL,
    event_type: EventType.INDIVIDUAL,
    fencer_count: 24,
    fencer_count_type: FencerCountType.ESTIMATED,
    ref_policy: RefPolicy.AUTO,
    earliest_start: 0,
    latest_end: 9999,
    optional: false,
    vet_age_group: null,
    use_single_pool_override: false,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    de_mode: DeMode.SINGLE_BLOCK,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    de_finals_strip_id: null,
    de_finals_strip_requirement: DeStripRequirement.HARD,
    de_round_of_16_strips: 4,
    de_round_of_16_requirement: DeStripRequirement.HARD,
    de_finals_strips: 2,
    de_finals_requirement: DeStripRequirement.HARD,
    flighted: false,
    flighting_group_id: null,
    is_priority: false,
    strips_allocated: 8,
    ...overrides,
  }
}

export function makeScheduleResult(competition_id: string, assigned_day: number): ScheduleResult {
  return {
    competition_id,
    assigned_day,
    use_flighting: false,
    is_priority: false,
    flighting_group_id: null,
    pool_start: null,
    pool_end: null,
    pool_strips_count: 0,
    pool_refs_count: 0,
    flight_a_start: null,
    flight_a_end: null,
    flight_a_strips: 0,
    flight_a_refs: 0,
    flight_b_start: null,
    flight_b_end: null,
    flight_b_strips: 0,
    flight_b_refs: 0,
    entry_fencer_count: 0,
    promoted_fencer_count: 0,
    bracket_size: 0,
    cut_mode: CutMode.DISABLED,
    cut_value: 0,
    de_mode: DeMode.SINGLE_BLOCK,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    de_start: null,
    de_end: null,
    de_strips_count: 0,
    de_prelims_start: null,
    de_prelims_end: null,
    de_prelims_strips: 0,
    de_round_of_16_start: null,
    de_round_of_16_end: null,
    de_round_of_16_strips: 0,
    de_finals_start: null,
    de_finals_end: null,
    de_finals_strips: 0,
    de_bronze_start: null,
    de_bronze_end: null,
    de_bronze_strip_id: null,
    de_total_end: null,
    conflict_score: 0,
    pool_duration_baseline: 0,
    pool_duration_actual: 0,
    de_duration_baseline: 0,
    de_duration_actual: 0,
    sabre_fillin_used: false,
    constraint_relaxation_level: 0,
    accepted_warnings: [],
  }
}
