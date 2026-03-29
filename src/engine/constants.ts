import { Category, CutMode, EventType, TournamentType, VetAgeGroup, VideoPolicy, Weapon } from './types.ts'

// ──────────────────────────────────────────────
// Scheduling time constants (all values in minutes from midnight)
// ──────────────────────────────────────────────

export const DAY_START_MINS = 480 // 8:00 AM
export const DAY_END_MINS = 1320 // 10:00 PM
export const LATEST_START_MINS = 960 // 4:00 PM — pool rounds may not start after this
export const LATEST_START_OFFSET = 480 // offset from DAY_START to LATEST_START
export const SLOT_MINS = 30
export const DAY_LENGTH_MINS = 840 // DAY_END_MINS - DAY_START_MINS
export const ADMIN_GAP_MINS = 30
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
  [Weapon.FOIL]: 105,
  [Weapon.SABRE]: 75,
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
// Default fencer counts by category and event type.
// Derived from P75 of empirical NAC/Summer Nationals and regional data,
// rounded to nearest 10, skewed towards larger events.
// ──────────────────────────────────────────────

type FencerDefaultKey = `${Category}:${EventType}`

export const NAC_FENCER_DEFAULTS: Partial<Record<FencerDefaultKey, number>> = {
  [`${Category.Y8}:${EventType.INDIVIDUAL}`]: 10,
  [`${Category.Y10}:${EventType.INDIVIDUAL}`]: 80,
  [`${Category.Y12}:${EventType.INDIVIDUAL}`]: 170,
  [`${Category.Y14}:${EventType.INDIVIDUAL}`]: 100,
  [`${Category.CADET}:${EventType.INDIVIDUAL}`]: 230,
  [`${Category.CADET}:${EventType.TEAM}`]: 30,
  [`${Category.JUNIOR}:${EventType.INDIVIDUAL}`]: 260,
  [`${Category.JUNIOR}:${EventType.TEAM}`]: 30,
  [`${Category.VETERAN}:${EventType.INDIVIDUAL}`]: 30,
  [`${Category.VETERAN}:${EventType.TEAM}`]: 20,
  [`${Category.DIV1}:${EventType.INDIVIDUAL}`]: 210,
  [`${Category.DIV1}:${EventType.TEAM}`]: 40,
  [`${Category.DIV1A}:${EventType.INDIVIDUAL}`]: 20,
  [`${Category.DIV2}:${EventType.INDIVIDUAL}`]: 20,
  [`${Category.DIV3}:${EventType.INDIVIDUAL}`]: 140,
}

export const REGIONAL_FENCER_DEFAULTS: Partial<Record<FencerDefaultKey, number>> = {
  [`${Category.Y8}:${EventType.INDIVIDUAL}`]: 10,
  [`${Category.Y10}:${EventType.INDIVIDUAL}`]: 20,
  [`${Category.Y12}:${EventType.INDIVIDUAL}`]: 40,
  [`${Category.Y14}:${EventType.INDIVIDUAL}`]: 50,
  [`${Category.CADET}:${EventType.INDIVIDUAL}`]: 40,
  [`${Category.CADET}:${EventType.TEAM}`]: 10,
  [`${Category.JUNIOR}:${EventType.INDIVIDUAL}`]: 40,
  [`${Category.JUNIOR}:${EventType.TEAM}`]: 10,
  [`${Category.VETERAN}:${EventType.INDIVIDUAL}`]: 20,
  [`${Category.VETERAN}:${EventType.TEAM}`]: 10,
  [`${Category.DIV1}:${EventType.INDIVIDUAL}`]: 50,
  [`${Category.DIV1}:${EventType.TEAM}`]: 10,
  [`${Category.DIV1A}:${EventType.INDIVIDUAL}`]: 40,
  [`${Category.DIV2}:${EventType.INDIVIDUAL}`]: 40,
  [`${Category.DIV3}:${EventType.INDIVIDUAL}`]: 20,
}

// ──────────────────────────────────────────────
// Crossover graph: fraction of fencers in category A who also compete in B.
// Used to detect scheduling conflicts between same-gender competitions.
// ──────────────────────────────────────────────

// Maximum edge weight is 0.8 (capped per METHODOLOGY.md).
// Two-hop indirect edges are computed in crossover.ts, capped at 0.3.
export const CROSSOVER_GRAPH: Record<Category, Partial<Record<Category, number>>> = {
  [Category.Y8]: { [Category.Y10]: 0.8 },
  [Category.Y10]: { [Category.Y12]: 0.8 },
  [Category.Y12]: { [Category.Y14]: 0.8 },
  [Category.Y14]: {
    [Category.CADET]: 0.8,
    [Category.DIV2]: 0.8,
    [Category.DIV3]: 0.8,
    [Category.DIV1A]: 0.6,
  },
  [Category.CADET]: {
    [Category.JUNIOR]: 0.8,
    [Category.DIV1]: 0.8,
    [Category.DIV2]: 0.8,
    [Category.DIV3]: 0.8,
    [Category.DIV1A]: 0.6,
  },
  [Category.JUNIOR]: { [Category.DIV1]: 0.8, [Category.DIV1A]: 0.8 },
  [Category.VETERAN]: {
    [Category.DIV1]: 0.8,
    [Category.DIV2]: 0.8,
    [Category.DIV3]: 0.8,
    [Category.DIV1A]: 0.8,
  },
  [Category.DIV3]: { [Category.DIV2]: 0.8, [Category.DIV1A]: 0.8 },
  [Category.DIV2]: { [Category.DIV1A]: 0.8 },
  // DIV1→DIV1A removed: Div 1 is NAC-only, Div 1A is ROC-only — never coexist in a tournament
  [Category.DIV1]: {},
  [Category.DIV1A]: {},
}

// ──────────────────────────────────────────────
// Group 1 mandatory different-day separations (Ops Manual Ch.4, pp.26–27).
// Pairs listed here return Infinity penalty for same-day placement.
// Y8/Y10 intentionally omitted — Y8 CAN and SHOULD be on the same day as Y10.
// DIV1/CADET moved to SOFT_SEPARATION_PAIRS — "allowed in rare cases."
// ──────────────────────────────────────────────

export const GROUP_1_MANDATORY: [Category, Category][] = [
  [Category.DIV1, Category.JUNIOR],
  [Category.JUNIOR, Category.CADET],
  [Category.Y10, Category.Y12],
  [Category.Y12, Category.Y14],
  [Category.Y14, Category.CADET],
  // Summer Nationals runs Div1 + Div1A + Div2 + Div3 — must never share a day.
  [Category.DIV1, Category.DIV1A],
  [Category.DIV1, Category.DIV2],
  [Category.DIV1, Category.DIV3],
]

// ──────────────────────────────────────────────
// Soft separation pairs: high penalty but not hard-blocked.
// DIV1↔CADET is "allowed in rare cases" per Ops Manual.
// ──────────────────────────────────────────────

export const SOFT_SEPARATION_PAIRS: { pair: [Category, Category]; penalty: number }[] = [
  { pair: [Category.DIV1, Category.CADET], penalty: 5.0 },
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

// ──────────────────────────────────────────────
// High crossover threshold — edges at or above this trigger stronger penalties
// in dayAssignment.ts (same-time 10.0, early-start 5.0/2.0).
// ──────────────────────────────────────────────

export const HIGH_CROSSOVER_THRESHOLD = 0.8

// ──────────────────────────────────────────────
// Video stage round: the DE round at which video replay begins per category.
// At NACs these are guaranteed; at other tournaments they're best-effort.
// (Ops Manual Ch.4, p.25)
// ──────────────────────────────────────────────

type VideoStageKey = Category | `${Category}:${VetAgeGroup}`

export const VIDEO_STAGE_ROUND: Partial<Record<VideoStageKey, number>> = {
  [Category.DIV1]: 16,
  [Category.JUNIOR]: 16,
  [Category.CADET]: 16,
  [Category.Y10]: 8,
  [Category.Y12]: 8,
  [Category.Y14]: 8,
  [`${Category.VETERAN}:${VetAgeGroup.VET50}`]: 8,
  [`${Category.VETERAN}:${VetAgeGroup.VET60}`]: 8,
  [`${Category.VETERAN}:${VetAgeGroup.VET70}`]: 8,
  [`${Category.VETERAN}:${VetAgeGroup.VET40}`]: 4,
  [`${Category.VETERAN}:${VetAgeGroup.VET80}`]: 4,
  [`${Category.VETERAN}:${VetAgeGroup.VET_COMBINED}`]: 4,
  [Category.DIV1A]: 4,
  [Category.DIV2]: 4,
  [Category.DIV3]: 4,
}

// ──────────────────────────────────────────────
// Flighting eligibility — only these categories with 200+ fencers may be flighted.
// (METHODOLOGY.md §Flighting)
// ──────────────────────────────────────────────

export const FLIGHTING_ELIGIBLE_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  Category.CADET,
  Category.JUNIOR,
  Category.DIV1,
])

export const FLIGHTING_MIN_FENCERS = 200

// ──────────────────────────────────────────────
// Individual/Team hard blocks: pairs that MUST NOT be on the same day
// (same weapon and gender). (METHODOLOGY.md §Individual/Team Separation)
// ──────────────────────────────────────────────

export const INDIV_TEAM_HARD_BLOCKS: { indivCategory: Category; teamCategory: Category }[] = [
  { indivCategory: Category.VETERAN, teamCategory: Category.VETERAN },
  { indivCategory: Category.DIV1, teamCategory: Category.JUNIOR },
  { indivCategory: Category.JUNIOR, teamCategory: Category.DIV1 },
]

// ──────────────────────────────────────────────
// Regional cut overrides: at ROC/SYC/RJCC/SJCC, these categories use 100% advancement
// instead of the default 20% cut. (METHODOLOGY.md §Default Cuts by Age Category)
// ──────────────────────────────────────────────

export const REGIONAL_CUT_OVERRIDES: Partial<Record<Category, { mode: CutMode; value: number }>> = {
  [Category.Y14]: { mode: CutMode.DISABLED, value: 100 },
  [Category.CADET]: { mode: CutMode.DISABLED, value: 100 },
  [Category.JUNIOR]: { mode: CutMode.DISABLED, value: 100 },
  [Category.DIV1]: { mode: CutMode.DISABLED, value: 100 },
}

export const REGIONAL_CUT_TOURNAMENT_TYPES: ReadonlySet<string> = new Set<string>([
  TournamentType.ROC,
  TournamentType.SYC,
  TournamentType.RJCC,
  TournamentType.SJCC,
])
