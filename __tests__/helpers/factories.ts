import type { Competition, ScheduleResult } from '../../src/engine/types.ts'
import {
  type Category, type Gender, type Weapon,
  EventType, CutMode, DeMode, VideoPolicy,
} from '../../src/engine/types.ts'

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
