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
  SINGLE_STAGE: 'SINGLE_STAGE',
  STAGED: 'STAGED',
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

export const PodCaptainOverride = {
  AUTO: 'AUTO',
  DISABLED: 'DISABLED',
  FORCE_4: 'FORCE_4',
} as const
export type PodCaptainOverride = (typeof PodCaptainOverride)[keyof typeof PodCaptainOverride]

export const DeCapacityEstimation = {
  POD_PACKED: 'pod_packed',
  SPREAD: 'spread',
} as const
export type DeCapacityEstimation = (typeof DeCapacityEstimation)[keyof typeof DeCapacityEstimation]

export const CutMode = {
  DISABLED: 'DISABLED',
  PERCENTAGE: 'PERCENTAGE',
  COUNT: 'COUNT',
} as const
export type CutMode = (typeof CutMode)[keyof typeof CutMode]

export const Phase = {
  POOLS: 'POOLS',
  FLIGHT_A: 'FLIGHT_A',
  FLIGHT_B: 'FLIGHT_B',
  DE_PRELIMS: 'DE_PRELIMS',
  DE_ROUND_OF_16: 'DE_ROUND_OF_16',
  DE: 'DE',
  SEQUENCING: 'SEQUENCING',
  DAY_ASSIGNMENT: 'DAY_ASSIGNMENT',
  CAPACITY: 'CAPACITY',
  FLIGHTING: 'FLIGHTING',
  CUT: 'CUT',
  VALIDATION: 'VALIDATION',
  SCHEDULING: 'SCHEDULING',
  POST_SCHEDULE: 'POST_SCHEDULE',
  DEADLINE_CHECK: 'DEADLINE_CHECK',
} as const
export type Phase = (typeof Phase)[keyof typeof Phase]

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
  PROXIMITY_PREFERENCE_UNMET: 'PROXIMITY_PREFERENCE_UNMET',
  CONSTRAINT_RELAXED: 'CONSTRAINT_RELAXED',
  FLIGHTING_GROUP_NOT_LARGEST: 'FLIGHTING_GROUP_NOT_LARGEST',
  FLIGHTING_GROUP_MANUAL_NEEDED: 'FLIGHTING_GROUP_MANUAL_NEEDED',
  MULTIPLE_FLIGHTED_SAME_DAY: 'MULTIPLE_FLIGHTED_SAME_DAY',
  GENDER_EQUITY_CAP_VIOLATION: 'GENDER_EQUITY_CAP_VIOLATION',
  REFEREE_INSUFFICIENT_ACCEPTED: 'REFEREE_INSUFFICIENT_ACCEPTED',
  SAME_DAY_VIOLATION: 'SAME_DAY_VIOLATION',
  SCHEDULE_ACCEPTED_WITH_WARNINGS: 'SCHEDULE_ACCEPTED_WITH_WARNINGS',
  CUT_SUMMARY: 'CUT_SUMMARY',
  RESOURCE_EXHAUSTION: 'RESOURCE_EXHAUSTION',
  RESOURCE_RECOMMENDATION: 'RESOURCE_RECOMMENDATION',
  DAY_RESOURCE_SUMMARY: 'DAY_RESOURCE_SUMMARY',
  NO_WINDOW_DIAGNOSTIC: 'NO_WINDOW_DIAGNOSTIC',
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

export interface Competition {
  id: string
  gender: Gender
  category: Category
  weapon: Weapon
  event_type: EventType
  fencer_count: number
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
  de_round_of_16_strips: number
  de_round_of_16_requirement: DeStripRequirement
  flighted: boolean
  flighting_group_id: string | null
  is_priority: boolean
  strips_allocated: number
  max_pool_strip_pct_override: number | null
  max_de_strip_pct_override: number | null
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
  SAME_TIME_WINDOW_MINS: number
  INDIV_TEAM_MIN_GAP_MINS: number
  EARLY_START_THRESHOLD: number
  MAX_RESCHEDULE_ATTEMPTS: number
  MAX_FENCERS: number
  MIN_FENCERS: number
  pool_round_duration_table: Record<Weapon, number>
  de_duration_table: Record<Weapon, Record<number, number>>
  dayConfigs: DayConfig[]
  max_pool_strip_pct: number
  max_de_strip_pct: number
  de_capacity_estimation: DeCapacityEstimation
}

export interface FlightingGroup {
  priority_competition_id: string
  flighted_competition_id: string
  strips_for_priority: number
  strips_for_flighted: number
}

export interface RefDemandInterval {
  startTime: number
  endTime: number
  count: number
  weapon: Weapon
}

export interface RefDemandByDay {
  intervals: RefDemandInterval[]
}

export interface RefRequirementsByDay {
  day: number
  peak_total_refs: number
  peak_saber_refs: number
  peak_time: number
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
  pool_strip_count: number
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
  de_strip_count: number
  de_prelims_start: number | null
  de_prelims_end: number | null
  de_prelims_strip_count: number
  de_round_of_16_start: number | null
  de_round_of_16_end: number | null
  de_round_of_16_strip_count: number
  de_total_end: number | null
  conflict_score: number
  pool_duration_baseline: number
  pool_duration_actual: number
  de_duration_baseline: number
  de_duration_actual: number
  constraint_relaxation_level: number
  accepted_warnings: AcceptedWarning[]
}

/**
 * One concrete usage of a strip during scheduling. Strip allocations are written
 * once per allocateInterval call and never mutated afterward — rollback splices
 * the allocation out of the strip's list rather than editing it in place.
 *
 * `start_time` and `end_time` are in minutes-from-tournament-start (T=0).
 * `pod_id` is present for STAGED-DE pod allocations (Phase B onward), absent for
 * pool and SINGLE_STAGE-DE allocations.
 */
export interface StripAllocation {
  event_id: string
  phase: Phase
  pod_id?: string
  start_time: number
  end_time: number
}

/**
 * Logical group of up to 4 strips that runs a STAGED-DE round together with one
 * head referee. Pod IDs persist on StripAllocation entries so post-schedule ref
 * staffing can group strips into ref-staffing units.
 *
 * The full pod abstraction is introduced in Phase B (`src/engine/pods.ts`); this
 * type is exported now so Phase A's StripAllocation.pod_id field has a stable
 * shape to point at.
 */
export interface Pod {
  id: string
  strip_indices: number[]
}

export interface GlobalState {
  /**
   * Per-strip chronologically ordered list of intervals the strip has been
   * allocated to. Outer index is strip index (matches config.strips). Inner
   * arrays are kept sorted by start_time (invariant maintained by allocateInterval).
   *
   * "Strip is free at time T" is computed as nextFreeTime(state, i) <= T, where
   * nextFreeTime returns the latest end_time across the strip's allocation list
   * (or 0 if empty). Rollback removes entries by event_id; concurrent claims are
   * first-class state.
   */
  strip_allocations: StripAllocation[][]
  ref_demand_by_day: Record<number, RefDemandByDay>
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
}

export interface Bottleneck {
  competition_id: string
  phase: Phase
  cause: BottleneckCause
  severity: BottleneckSeverity
  delay_mins: number
  message: string
  attempt_id?: number  // Phase C concurrent scheduler tags retry-emitted bottlenecks
}

export interface PoolStructure {
  n_pools: number
  pool_sizes: number[]
}

export interface PoolDurationResult {
  actual_duration: number
  baseline: number
  effective_parallelism: number
  uncompensated: number
  penalised: boolean
}

export interface RefResolution {
  refs_per_pool: number
  refs_needed: number
}

export interface DeBlockDurations {
  prelims_dur: number
  r16_dur: number
}

export interface ValidationError {
  field: string
  message: string
  severity: BottleneckSeverity
}

export interface AnalysisResult {
  warnings: Bottleneck[]
  suggestions: string[]
  flightingSuggestions?: FlightingGroup[]
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
// Phase-scheduler transaction log
// ──────────────────────────────────────────────

/**
 * Records mutations made during a single competition's phase scheduling so that
 * they can be rolled back if the event cannot be fully scheduled.
 *
 * - stripAllocationsAdded: direct object references to StripAllocation entries
 *   pushed into state.strip_allocations[stripIdx]. Rollback removes by object
 *   identity (indexOf + splice), which is order-independent and works even when
 *   multiple events' allocations interleave in the same strip's list.
 * - refEvents: direct object references to pushed RefDemandInterval entries so rollback
 *   can find-and-remove by identity. Using object references instead of array indices
 *   is required for phase-major scheduling, where multiple events' txLogs interleave
 *   and rolling back one event's entries would shift another's recorded indices.
 */
export interface EventTxLog {
  stripAllocationsAdded: Array<{ stripIdx: number; allocation: StripAllocation }>
  refEvents: Array<{ day: number; event: RefDemandInterval }>
}

// ──────────────────────────────────────────────
// Helper functions
// ──────────────────────────────────────────────

/**
 * Returns the estimated minutes for the gold (and bronze for team) bouts that follow the
 * scheduler's last allocated phase. See METHODOLOGY.md §Scheduler Stops at Semis.
 */
export function tailEstimateMins(eventType: EventType): number {
  // Import constants inline to avoid a circular-dependency (types.ts ← constants.ts ← types.ts).
  // Values are duplicated from INDIV_TAIL_MINS / TEAM_TAIL_MINS and must stay in sync.
  return eventType === EventType.TEAM ? 60 : 30
}

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

/**
 * Returns the day index d such that dayStart(d) <= t < dayEnd(d), or null when
 * no day in [0, days_available) contains t.
 */
export function findDayForTime(config: TournamentConfig, t: number): number | null {
  for (let d = 0; d < config.days_available; d++) {
    if (dayStart(d, config) <= t && t < dayEnd(d, config)) return d
  }
  return null
}
