// Core domain types for the Piste Planner scheduling engine.
// Uses `as const` objects instead of TS enums for erasableSyntaxOnly compatibility.

export const Gender = {
  MEN: 'MEN',
  WOMEN: 'WOMEN',
} as const
export type Gender = (typeof Gender)[keyof typeof Gender]

export const Category = {
  Y8: 'Y8',
  Y10: 'Y10',
  Y12: 'Y12',
  Y14: 'Y14',
  CADET: 'CADET',
  JUNIOR: 'JUNIOR',
  VETERAN: 'VETERAN',
  DIV1: 'DIV1',
  DIV1A: 'DIV1A',
  DIV2: 'DIV2',
  DIV3: 'DIV3',
} as const
export type Category = (typeof Category)[keyof typeof Category]

export const Weapon = {
  FOIL: 'FOIL',
  EPEE: 'EPEE',
  SABRE: 'SABRE',
} as const
export type Weapon = (typeof Weapon)[keyof typeof Weapon]

export const EventType = {
  INDIVIDUAL: 'INDIVIDUAL',
  TEAM: 'TEAM',
} as const
export type EventType = (typeof EventType)[keyof typeof EventType]

export const RefPolicy = {
  ONE: 'ONE',
  TWO: 'TWO',
  AUTO: 'AUTO',
} as const
export type RefPolicy = (typeof RefPolicy)[keyof typeof RefPolicy]

export const DeMode = {
  SINGLE_BLOCK: 'SINGLE_BLOCK',
  STAGED_DE_BLOCKS: 'STAGED_DE_BLOCKS',
} as const
export type DeMode = (typeof DeMode)[keyof typeof DeMode]

export const DeStripRequirement = {
  HARD: 'HARD',
  IF_AVAILABLE: 'IF_AVAILABLE',
} as const
export type DeStripRequirement = (typeof DeStripRequirement)[keyof typeof DeStripRequirement]

export const VideoPolicy = {
  REQUIRED: 'REQUIRED',
  BEST_EFFORT: 'BEST_EFFORT',
  FINALS_ONLY: 'FINALS_ONLY',
} as const
export type VideoPolicy = (typeof VideoPolicy)[keyof typeof VideoPolicy]

export const VetAgeGroup = {
  VET40: 'VET40',
  VET50: 'VET50',
  VET60: 'VET60',
  VET70: 'VET70',
  VET80: 'VET80',
  VET_COMBINED: 'VET_COMBINED',
} as const
export type VetAgeGroup = (typeof VetAgeGroup)[keyof typeof VetAgeGroup]

export const TournamentType = {
  NAC: 'NAC',
  RYC: 'RYC',
  RJCC: 'RJCC',
  ROC: 'ROC',
  SYC: 'SYC',
  SJCC: 'SJCC',
} as const
export type TournamentType = (typeof TournamentType)[keyof typeof TournamentType]

export const FencerCountType = {
  ESTIMATED: 'ESTIMATED',
  CAPPED: 'CAPPED',
} as const
export type FencerCountType = (typeof FencerCountType)[keyof typeof FencerCountType]

export const PodCaptainOverride = {
  AUTO: 'AUTO',
  DISABLED: 'DISABLED',
  FORCE_4: 'FORCE_4',
} as const
export type PodCaptainOverride = (typeof PodCaptainOverride)[keyof typeof PodCaptainOverride]

export const CutMode = {
  DISABLED: 'DISABLED',
  PERCENTAGE: 'PERCENTAGE',
  COUNT: 'COUNT',
} as const
export type CutMode = (typeof CutMode)[keyof typeof CutMode]

export const BottleneckCause = {
  STRIP_CONTENTION: 'STRIP_CONTENTION',
  REFEREE_CONTENTION: 'REFEREE_CONTENTION',
  STRIP_AND_REFEREE_CONTENTION: 'STRIP_AND_REFEREE_CONTENTION',
  SEQUENCING_CONSTRAINT: 'SEQUENCING_CONSTRAINT',
  SAME_DAY_DEMOGRAPHIC_CONFLICT: 'SAME_DAY_DEMOGRAPHIC_CONFLICT',
  UNAVOIDABLE_CROSSOVER_CONFLICT: 'UNAVOIDABLE_CROSSOVER_CONFLICT',
  SAME_TIME_CROSSOVER: 'SAME_TIME_CROSSOVER',
  SCHEDULED_8AM_SAME_DAY_CROSSOVER: 'SCHEDULED_8AM_SAME_DAY_CROSSOVER',
  SCHEDULED_8AM_CONSECUTIVE_DAYS: 'SCHEDULED_8AM_CONSECUTIVE_DAYS',
  SCHEDULED_8AM_INDV_TEAM: 'SCHEDULED_8AM_INDV_TEAM',
  INDIV_TEAM_ORDERING: 'INDIV_TEAM_ORDERING',
  DEADLINE_BREACH: 'DEADLINE_BREACH',
  DEADLINE_BREACH_UNRESOLVABLE: 'DEADLINE_BREACH_UNRESOLVABLE',
  AUTO_REF_FALLBACK: 'AUTO_REF_FALLBACK',
  TWO_REF_FALLBACK: 'TWO_REF_FALLBACK',
  FLIGHT_B_DELAYED: 'FLIGHT_B_DELAYED',
  STRIP_DEFICIT_NO_FLIGHTING: 'STRIP_DEFICIT_NO_FLIGHTING',
  VIDEO_STRIP_CONTENTION: 'VIDEO_STRIP_CONTENTION',
  SABRE_REF_FILLIN: 'SABRE_REF_FILLIN',
  DE_FINALS_BRONZE_NO_STRIP: 'DE_FINALS_BRONZE_NO_STRIP',
  PROXIMITY_PREFERENCE_UNMET: 'PROXIMITY_PREFERENCE_UNMET',
  CONSTRAINT_RELAXED: 'CONSTRAINT_RELAXED',
  FLIGHTING_GROUP_NOT_LARGEST: 'FLIGHTING_GROUP_NOT_LARGEST',
  FLIGHTING_GROUP_MANUAL_NEEDED: 'FLIGHTING_GROUP_MANUAL_NEEDED',
  MULTIPLE_FLIGHTED_SAME_DAY: 'MULTIPLE_FLIGHTED_SAME_DAY',
  GENDER_EQUITY_CAP_VIOLATION: 'GENDER_EQUITY_CAP_VIOLATION',
  REGIONAL_QUALIFIER_CAPPED: 'REGIONAL_QUALIFIER_CAPPED',
  REFEREE_INSUFFICIENT_ACCEPTED: 'REFEREE_INSUFFICIENT_ACCEPTED',
  SCHEDULE_ACCEPTED_WITH_WARNINGS: 'SCHEDULE_ACCEPTED_WITH_WARNINGS',
} as const
export type BottleneckCause = (typeof BottleneckCause)[keyof typeof BottleneckCause]

export const BottleneckSeverity = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
} as const
export type BottleneckSeverity = (typeof BottleneckSeverity)[keyof typeof BottleneckSeverity]

// ──────────────────────────────────────────────
// Interfaces
// ──────────────────────────────────────────────

export interface Strip {
  id: string
  video_capable: boolean
}

export interface DayRefereeAvailability {
  day: number
  foil_epee_refs: number
  sabre_refs: number
  source: 'OPTIMAL' | 'ACTUAL'
}

export interface Competition {
  id: string
  gender: Gender
  category: Category
  weapon: Weapon
  event_type: EventType
  fencer_count: number
  fencer_count_type: FencerCountType
  ref_policy: RefPolicy
  earliest_start: number
  latest_end: number
  optional: boolean
  vet_age_group: VetAgeGroup | null
  use_single_pool_override: boolean
  cut_mode: CutMode
  cut_value: number
  de_mode: DeMode
  de_video_policy: VideoPolicy
  de_finals_strip_id: string | null
  de_finals_strip_requirement: DeStripRequirement
  de_round_of_16_strips: number
  de_round_of_16_requirement: DeStripRequirement
  de_finals_strips: number
  de_finals_requirement: DeStripRequirement
  flighted: boolean
  flighting_group_id: string | null
  is_priority: boolean
  strips_allocated: number
}

export interface DayConfig {
  day_start_time: number
  day_end_time: number
}

export interface TournamentConfig {
  tournament_type: TournamentType
  days_available: number
  strips: Strip[]
  strips_total: number
  video_strips_total: number
  referee_availability: DayRefereeAvailability[]
  allow_sabre_ref_fillin: boolean
  pod_captain_override: PodCaptainOverride
  DAY_START_MINS: number
  DAY_END_MINS: number
  LATEST_START_MINS: number
  LATEST_START_OFFSET: number
  SLOT_MINS: number
  DAY_LENGTH_MINS: number
  ADMIN_GAP_MINS: number
  FLIGHT_BUFFER_MINS: number
  THRESHOLD_MINS: number
  DE_REFS: number
  DE_FINALS_MIN_MINS: number
  SAME_TIME_WINDOW_MINS: number
  INDIV_TEAM_MIN_GAP_MINS: number
  EARLY_START_THRESHOLD: number
  MAX_RESCHEDULE_ATTEMPTS: number
  MAX_FENCERS: number
  MIN_FENCERS: number
  pool_round_duration_table: Record<Weapon, number>
  de_duration_table: Record<Weapon, Record<number, number>>
  dayConfigs: DayConfig[]
}

export interface FlightingGroup {
  priority_competition_id: string
  flighted_competition_id: string
  strips_for_priority: number
  strips_for_flighted: number
}

export interface ReleaseEvent {
  time: number
  type: 'foil_epee' | 'sabre' | 'fillin'
  count: number
}

export interface RefsInUseByDay {
  foil_epee_in_use: number
  sabre_in_use: number
  fillin_in_use: number
  release_events: ReleaseEvent[]
}

export interface AcceptedWarning {
  cause: BottleneckCause
  severity: BottleneckSeverity
  message: string
}

export interface ScheduleResult {
  competition_id: string
  assigned_day: number
  use_flighting: boolean
  is_priority: boolean
  flighting_group_id: string | null
  pool_start: number | null
  pool_end: number | null
  pool_strips_count: number
  pool_refs_count: number
  flight_a_start: number | null
  flight_a_end: number | null
  flight_a_strips: number
  flight_a_refs: number
  flight_b_start: number | null
  flight_b_end: number | null
  flight_b_strips: number
  flight_b_refs: number
  entry_fencer_count: number
  promoted_fencer_count: number
  bracket_size: number
  cut_mode: CutMode
  cut_value: number
  de_mode: DeMode
  de_video_policy: VideoPolicy
  de_start: number | null
  de_end: number | null
  de_strips_count: number
  de_prelims_start: number | null
  de_prelims_end: number | null
  de_prelims_strips: number
  de_round_of_16_start: number | null
  de_round_of_16_end: number | null
  de_round_of_16_strips: number
  de_finals_start: number | null
  de_finals_end: number | null
  de_finals_strips: number
  de_bronze_start: number | null
  de_bronze_end: number | null
  de_bronze_strip_id: string | null
  de_total_end: number | null
  conflict_score: number
  pool_duration_baseline: number
  pool_duration_actual: number
  de_duration_baseline: number
  de_duration_actual: number
  sabre_fillin_used: boolean
  constraint_relaxation_level: number
  accepted_warnings: AcceptedWarning[]
}

export interface GlobalState {
  strip_free_at: number[]
  refs_in_use_by_day: Record<number, RefsInUseByDay>
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
}

export interface Bottleneck {
  competition_id: string
  phase: string
  cause: BottleneckCause
  severity: BottleneckSeverity
  delay_mins: number
  message: string
}

export interface PoolStructure {
  n_pools: number
  pool_sizes: number[]
  pool_round_duration: number
}

export interface PoolDurationResult {
  actual_duration: number
  baseline: number
  effective_parallelism: number
  double_duty_pairs: number
  uncompensated: number
  penalised: boolean
}

export interface RefResolution {
  refs_per_pool: number
  refs_needed: number
  shortfall: number
}

export interface DeBlockDurations {
  prelims_dur: number
  r16_dur: number
  finals_dur: number
}

export interface ValidationError {
  field: string
  message: string
  severity: BottleneckSeverity
}

export interface AnalysisResult {
  warnings: Bottleneck[]
  suggestions: string[]
}

export interface CatalogueEntry {
  id: string
  gender: Gender
  category: Category
  weapon: Weapon
  event_type: EventType
  vet_age_group: VetAgeGroup | null
}

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/**
 * Returns the absolute minute offset from T=0 for the start of the given day.
 * Uses per-day config when available, otherwise uses the uniform day length.
 */
export function dayStart(d: number, config: TournamentConfig): number {
  if (config.dayConfigs && config.dayConfigs[d]) {
    return config.dayConfigs[d].day_start_time
  }
  return d * config.DAY_LENGTH_MINS
}

/**
 * Returns the absolute minute offset from T=0 for the end of the given day.
 * Uses per-day config when available, otherwise uses the uniform day length.
 */
export function dayEnd(d: number, config: TournamentConfig): number {
  if (config.dayConfigs && config.dayConfigs[d]) {
    return config.dayConfigs[d].day_end_time
  }
  return d * config.DAY_LENGTH_MINS + config.DAY_LENGTH_MINS
}
