import { Category, CutMode, TournamentType, VideoPolicy, Weapon } from './types.ts'

// ──────────────────────────────────────────────
// Scheduling time constants (all values in minutes from midnight)
// ──────────────────────────────────────────────

export const DAY_START_MINS = 480 // 8:00 AM
export const DAY_END_MINS = 1320 // 10:00 PM
export const LATEST_START_MINS = 960 // 4:00 PM — pool rounds may not start after this
export const LATEST_START_OFFSET = 480 // offset from DAY_START to LATEST_START
export const SLOT_MINS = 30
export const DAY_LENGTH_MINS = 840 // DAY_END_MINS - DAY_START_MINS
export const ADMIN_GAP_MINS = 15
export const FLIGHT_BUFFER_MINS = 15
export const THRESHOLD_MINS = 10

// ──────────────────────────────────────────────
// DE / referee constants
// ──────────────────────────────────────────────

export const DE_REFS = 1
export const DE_FINALS_MIN_MINS = 30
export const SAME_TIME_WINDOW_MINS = 30
export const INDIV_TEAM_MIN_GAP_MINS = 120

// ──────────────────────────────────────────────
// Scheduling algorithm limits
// ──────────────────────────────────────────────

export const EARLY_START_THRESHOLD = 10
export const MAX_RESCHEDULE_ATTEMPTS = 3
export const MAX_FENCERS = 500
export const MIN_FENCERS = 2

// ──────────────────────────────────────────────
// Pool bout counts by pool size (n fencers → round-robin bouts)
// ──────────────────────────────────────────────

export const BOUT_COUNTS: Record<number, number> = {
  2: 1,
  3: 3,
  4: 6,
  5: 10,
  6: 15,
  7: 21,
  8: 28,
  9: 36,
  10: 45,
}

// ──────────────────────────────────────────────
// Default pool round durations by weapon (minutes for a full pool round)
// ──────────────────────────────────────────────

export const DEFAULT_POOL_ROUND_DURATION_TABLE: Record<Weapon, number> = {
  [Weapon.EPEE]: 120,
  [Weapon.FOIL]: 90,
  [Weapon.SABRE]: 60,
}

// ──────────────────────────────────────────────
// Default DE bout durations by weapon and bracket size (minutes per round)
// ──────────────────────────────────────────────

export const DEFAULT_DE_DURATION_TABLE: Record<Weapon, Record<number, number>> = {
  [Weapon.FOIL]: {
    2: 15,
    4: 30,
    8: 45,
    16: 60,
    32: 90,
    64: 120,
    128: 180,
    256: 240,
  },
  [Weapon.EPEE]: {
    2: 15,
    4: 30,
    8: 45,
    16: 60,
    32: 90,
    64: 120,
    128: 180,
    256: 240,
  },
  [Weapon.SABRE]: {
    2: 15,
    4: 20,
    8: 30,
    16: 45,
    32: 60,
    64: 90,
    128: 120,
    256: 120,
  },
}

// ──────────────────────────────────────────────
// Default cut-to-DE settings by category
// ──────────────────────────────────────────────

export const DEFAULT_CUT_BY_CATEGORY: Record<Category, { mode: CutMode; value: number }> = {
  [Category.Y8]: { mode: CutMode.DISABLED, value: 100 },
  [Category.Y10]: { mode: CutMode.DISABLED, value: 100 },
  [Category.Y12]: { mode: CutMode.DISABLED, value: 100 },
  [Category.Y14]: { mode: CutMode.PERCENTAGE, value: 20 },
  [Category.CADET]: { mode: CutMode.PERCENTAGE, value: 20 },
  [Category.JUNIOR]: { mode: CutMode.PERCENTAGE, value: 20 },
  [Category.VETERAN]: { mode: CutMode.DISABLED, value: 100 },
  [Category.DIV1]: { mode: CutMode.PERCENTAGE, value: 20 },
  [Category.DIV1A]: { mode: CutMode.DISABLED, value: 100 },
  [Category.DIV2]: { mode: CutMode.DISABLED, value: 100 },
  [Category.DIV3]: { mode: CutMode.DISABLED, value: 100 },
}

// ──────────────────────────────────────────────
// Default video policy by category
// ──────────────────────────────────────────────

export const DEFAULT_VIDEO_POLICY_BY_CATEGORY: Record<Category, VideoPolicy> = {
  [Category.Y8]: VideoPolicy.BEST_EFFORT,
  [Category.Y10]: VideoPolicy.BEST_EFFORT,
  [Category.Y12]: VideoPolicy.BEST_EFFORT,
  [Category.Y14]: VideoPolicy.BEST_EFFORT,
  [Category.CADET]: VideoPolicy.REQUIRED,
  [Category.JUNIOR]: VideoPolicy.REQUIRED,
  [Category.VETERAN]: VideoPolicy.BEST_EFFORT,
  [Category.DIV1]: VideoPolicy.REQUIRED,
  [Category.DIV1A]: VideoPolicy.BEST_EFFORT,
  [Category.DIV2]: VideoPolicy.BEST_EFFORT,
  [Category.DIV3]: VideoPolicy.BEST_EFFORT,
}

// ──────────────────────────────────────────────
// Crossover graph: fraction of fencers in category A who also compete in B.
// Used to detect scheduling conflicts between same-gender competitions.
// ──────────────────────────────────────────────

export const CROSSOVER_GRAPH: Record<Category, Partial<Record<Category, number>>> = {
  [Category.Y8]: { [Category.Y10]: 1.0 },
  [Category.Y10]: { [Category.Y12]: 1.0 },
  [Category.Y12]: { [Category.Y14]: 1.0 },
  [Category.Y14]: {
    [Category.CADET]: 1.0,
    [Category.DIV2]: 1.0,
    [Category.DIV3]: 1.0,
    [Category.DIV1A]: 0.6,
  },
  [Category.CADET]: {
    [Category.JUNIOR]: 1.0,
    [Category.DIV1]: 1.0,
    [Category.DIV2]: 1.0,
    [Category.DIV3]: 1.0,
    [Category.DIV1A]: 0.6,
  },
  [Category.JUNIOR]: { [Category.DIV1]: 1.0, [Category.DIV1A]: 0.3 },
  [Category.VETERAN]: {
    [Category.DIV1]: 0.3,
    [Category.DIV2]: 1.0,
    [Category.DIV3]: 1.0,
    [Category.DIV1A]: 1.0,
  },
  [Category.DIV3]: { [Category.DIV2]: 1.0, [Category.DIV1A]: 1.0 },
  [Category.DIV2]: { [Category.DIV1A]: 1.0 },
  [Category.DIV1]: { [Category.DIV1A]: 0.3 },
  [Category.DIV1A]: {},
}

// ──────────────────────────────────────────────
// Group 1 mandatory same-day pairings (both competitions must be scheduled same day)
// ──────────────────────────────────────────────

export const GROUP_1_MANDATORY: [Category, Category][] = [
  [Category.DIV1, Category.JUNIOR],
  [Category.DIV1, Category.CADET],
  [Category.JUNIOR, Category.CADET],
  [Category.Y8, Category.Y10],
  [Category.Y10, Category.Y12],
  [Category.Y12, Category.Y14],
  [Category.Y14, Category.CADET],
]

// ──────────────────────────────────────────────
// Proximity graph: preference weights for scheduling related categories on the same day.
// Higher weight = stronger preference for same-day placement.
// ──────────────────────────────────────────────

export const PROXIMITY_GRAPH: { cat1: Category; cat2: Category; weight: number }[] = [
  { cat1: Category.DIV1, cat2: Category.JUNIOR, weight: 1.0 },
  { cat1: Category.JUNIOR, cat2: Category.CADET, weight: 1.0 },
  { cat1: Category.CADET, cat2: Category.Y14, weight: 1.0 },
  { cat1: Category.Y14, cat2: Category.Y12, weight: 0.8 },
  { cat1: Category.Y12, cat2: Category.Y10, weight: 0.8 },
  { cat1: Category.VETERAN, cat2: Category.VETERAN, weight: 1.0 },
  { cat1: Category.VETERAN, cat2: Category.DIV1A, weight: 0.6 },
]

// ──────────────────────────────────────────────
// Proximity penalty weights by scheduling distance (days apart)
// ──────────────────────────────────────────────

export const PROXIMITY_PENALTY_WEIGHTS: Record<number, number> = {
  0: 0.0,
  1: -0.4,
  2: 0.0,
  3: 0.5,
}

// ──────────────────────────────────────────────
// REST_DAY_PAIRS: category pairs that should have a rest day between them
// ──────────────────────────────────────────────

export const REST_DAY_PAIRS: [Category, Category][] = [
  [Category.JUNIOR, Category.CADET],
  [Category.JUNIOR, Category.DIV1],
]

// ──────────────────────────────────────────────
// Regional qualifier tournament types — cannot cap fencer registrations per handbook.
// ──────────────────────────────────────────────

export const REGIONAL_QUALIFIER_TYPES: ReadonlySet<string> = new Set<string>([
  TournamentType.RYC,
  TournamentType.RJCC,
  TournamentType.ROC,
  TournamentType.SYC,
  TournamentType.SJCC,
])
