import { Category, CutMode, EventType, Gender, TournamentType, VetAgeGroup, VideoPolicy, Weapon } from './types.ts'

// ──────────────────────────────────────────────
// Category start preferences and capacity weights.
//
// earliest_start_offset: minutes after DAY_START_MINS before this category may begin.
// weight: multiplier applied to raw strip-hours in capacity-aware day assignment scoring.
//   > 1.0 → heavier than raw (large fields, video DE serialization)
//   < 1.0 → lighter than raw (small fields, flexible scheduling)
//
// VETERAN lookups use a compound key (`${Category.VETERAN}:${VetAgeGroup}`) to
// differentiate VET40/VET50 (weight 0.8, offset 0) from older groups (weight 0.6, offset 120).
// When vet_age_group is null (generic veteran), the plain VETERAN key resolves to weight 0.8.
// ──────────────────────────────────────────────

type CategoryStartPreferenceKey = Category | `${typeof Category.VETERAN}:${VetAgeGroup}`

// TS can't verify computed template literal property keys satisfy a union type (TS2740),
// so we assert the type. All keys are present — checked by tests.
export const CATEGORY_START_PREFERENCE = {
  [Category.Y8]:    { earliest_start_offset: 0,   weight: 1.0 },
  [Category.Y10]:   { earliest_start_offset: 0,   weight: 1.2 },
  [Category.Y12]:   { earliest_start_offset: 0,   weight: 1.0 },
  [Category.Y14]:   { earliest_start_offset: 0,   weight: 1.0 },
  [Category.CADET]: { earliest_start_offset: 0,   weight: 1.3 },
  [Category.JUNIOR]:  { earliest_start_offset: 0, weight: 1.3 },
  // Generic VETERAN key — used when vet_age_group is null; defaults to VET40/50 weight.
  [Category.VETERAN]: { earliest_start_offset: 0, weight: 0.8 },
  [`${Category.VETERAN}:${VetAgeGroup.VET40}`]: { earliest_start_offset: 0,   weight: 0.8 },
  [`${Category.VETERAN}:${VetAgeGroup.VET50}`]: { earliest_start_offset: 0,   weight: 0.8 },
  [`${Category.VETERAN}:${VetAgeGroup.VET60}`]: { earliest_start_offset: 120, weight: 0.6 },
  [`${Category.VETERAN}:${VetAgeGroup.VET70}`]: { earliest_start_offset: 120, weight: 0.6 },
  [`${Category.VETERAN}:${VetAgeGroup.VET80}`]: { earliest_start_offset: 120, weight: 0.6 },
  [`${Category.VETERAN}:${VetAgeGroup.VET_COMBINED}`]: { earliest_start_offset: 120, weight: 0.6 },
  [Category.DIV1]:  { earliest_start_offset: 0,   weight: 1.5 },
  [Category.DIV1A]: { earliest_start_offset: 0,   weight: 0.7 },
  [Category.DIV2]:  { earliest_start_offset: 0,   weight: 0.7 },
  [Category.DIV3]:  { earliest_start_offset: 0,   weight: 0.7 },
} as Record<CategoryStartPreferenceKey, { earliest_start_offset: number; weight: number }>

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
// Pool rounds run 75-120 min (see DEFAULT_POOL_ROUND_DURATION_TABLE), so a 60-min wave can't accommodate the second event starting inside the wave.
export const MORNING_WAVE_WINDOW_MINS = 120

// ──────────────────────────────────────────────
// DE / referee constants
// ──────────────────────────────────────────────

export const DE_REFS = 1
export const DE_FINALS_MIN_MINS = 30
export const DE_POD_SIZE = 4
export const DE_BOUT_DURATION: Record<Weapon, number> = {
  [Weapon.EPEE]: 20,
  [Weapon.FOIL]: 20,
  [Weapon.SABRE]: 10,
}
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
// Default fencer counts keyed by category × weapon × gender (individual events)
// or category × TEAM (team events).
// Derived from P75 of empirical NAC/Summer Nationals and regional data,
// rounded to nearest 10, skewed towards larger events (METHODOLOGY Appendix A).
// ──────────────────────────────────────────────

export type FencerDefaultKey =
  | `${Category}:${Weapon}:${Gender}`
  | `${Category}:${'TEAM'}`

export const NAC_FENCER_DEFAULTS: Partial<Record<FencerDefaultKey, number>> = {
  // DIV1 individual (E=Epee, F=Foil, S=Sabre; M=Men, W=Women)
  [`${Category.DIV1}:${Weapon.EPEE}:${Gender.MEN}`]: 310,
  [`${Category.DIV1}:${Weapon.FOIL}:${Gender.MEN}`]: 270,
  [`${Category.DIV1}:${Weapon.SABRE}:${Gender.MEN}`]: 210,
  [`${Category.DIV1}:${Weapon.EPEE}:${Gender.WOMEN}`]: 210,
  [`${Category.DIV1}:${Weapon.FOIL}:${Gender.WOMEN}`]: 160,
  [`${Category.DIV1}:${Weapon.SABRE}:${Gender.WOMEN}`]: 210,
  // DIV1 team
  [`${Category.DIV1}:${EventType.TEAM}`]: 40,

  // JUNIOR individual
  [`${Category.JUNIOR}:${Weapon.EPEE}:${Gender.MEN}`]: 260,
  [`${Category.JUNIOR}:${Weapon.FOIL}:${Gender.MEN}`]: 260,
  [`${Category.JUNIOR}:${Weapon.SABRE}:${Gender.MEN}`]: 260,
  [`${Category.JUNIOR}:${Weapon.EPEE}:${Gender.WOMEN}`]: 210,
  [`${Category.JUNIOR}:${Weapon.FOIL}:${Gender.WOMEN}`]: 180,
  [`${Category.JUNIOR}:${Weapon.SABRE}:${Gender.WOMEN}`]: 200,
  // JUNIOR team
  [`${Category.JUNIOR}:${EventType.TEAM}`]: 30,

  // CADET individual
  [`${Category.CADET}:${Weapon.EPEE}:${Gender.MEN}`]: 250,
  [`${Category.CADET}:${Weapon.FOIL}:${Gender.MEN}`]: 220,
  [`${Category.CADET}:${Weapon.SABRE}:${Gender.MEN}`]: 270,
  [`${Category.CADET}:${Weapon.EPEE}:${Gender.WOMEN}`]: 210,
  [`${Category.CADET}:${Weapon.FOIL}:${Gender.WOMEN}`]: 200,
  [`${Category.CADET}:${Weapon.SABRE}:${Gender.WOMEN}`]: 210,
  // CADET team
  [`${Category.CADET}:${EventType.TEAM}`]: 30,

  // Y14 individual
  [`${Category.Y14}:${Weapon.EPEE}:${Gender.MEN}`]: 230,
  [`${Category.Y14}:${Weapon.FOIL}:${Gender.MEN}`]: 210,
  [`${Category.Y14}:${Weapon.SABRE}:${Gender.MEN}`]: 230,
  [`${Category.Y14}:${Weapon.EPEE}:${Gender.WOMEN}`]: 180,
  [`${Category.Y14}:${Weapon.FOIL}:${Gender.WOMEN}`]: 200,
  [`${Category.Y14}:${Weapon.SABRE}:${Gender.WOMEN}`]: 200,

  // Y12 individual
  [`${Category.Y12}:${Weapon.EPEE}:${Gender.MEN}`]: 210,
  [`${Category.Y12}:${Weapon.FOIL}:${Gender.MEN}`]: 230,
  [`${Category.Y12}:${Weapon.SABRE}:${Gender.MEN}`]: 180,
  [`${Category.Y12}:${Weapon.EPEE}:${Gender.WOMEN}`]: 170,
  [`${Category.Y12}:${Weapon.FOIL}:${Gender.WOMEN}`]: 200,
  [`${Category.Y12}:${Weapon.SABRE}:${Gender.WOMEN}`]: 170,

  // Y10 individual
  [`${Category.Y10}:${Weapon.EPEE}:${Gender.MEN}`]: 80,
  [`${Category.Y10}:${Weapon.FOIL}:${Gender.MEN}`]: 110,
  [`${Category.Y10}:${Weapon.SABRE}:${Gender.MEN}`]: 80,
  [`${Category.Y10}:${Weapon.EPEE}:${Gender.WOMEN}`]: 60,
  [`${Category.Y10}:${Weapon.FOIL}:${Gender.WOMEN}`]: 70,
  [`${Category.Y10}:${Weapon.SABRE}:${Gender.WOMEN}`]: 70,

  // Y8 individual (all weapons/genders → 10)
  [`${Category.Y8}:${Weapon.EPEE}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.FOIL}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.SABRE}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.EPEE}:${Gender.WOMEN}`]: 10,
  [`${Category.Y8}:${Weapon.FOIL}:${Gender.WOMEN}`]: 10,
  [`${Category.Y8}:${Weapon.SABRE}:${Gender.WOMEN}`]: 10,

  // DIV2 individual
  [`${Category.DIV2}:${Weapon.EPEE}:${Gender.MEN}`]: 180,
  [`${Category.DIV2}:${Weapon.FOIL}:${Gender.MEN}`]: 170,
  [`${Category.DIV2}:${Weapon.SABRE}:${Gender.MEN}`]: 160,
  [`${Category.DIV2}:${Weapon.EPEE}:${Gender.WOMEN}`]: 110,
  [`${Category.DIV2}:${Weapon.FOIL}:${Gender.WOMEN}`]: 120,
  [`${Category.DIV2}:${Weapon.SABRE}:${Gender.WOMEN}`]: 130,

  // VETERAN individual
  [`${Category.VETERAN}:${Weapon.EPEE}:${Gender.MEN}`]: 120,
  [`${Category.VETERAN}:${Weapon.FOIL}:${Gender.MEN}`]: 80,
  [`${Category.VETERAN}:${Weapon.SABRE}:${Gender.MEN}`]: 40,
  [`${Category.VETERAN}:${Weapon.EPEE}:${Gender.WOMEN}`]: 80,
  [`${Category.VETERAN}:${Weapon.FOIL}:${Gender.WOMEN}`]: 40,
  [`${Category.VETERAN}:${Weapon.SABRE}:${Gender.WOMEN}`]: 50,
  // VETERAN team
  [`${Category.VETERAN}:${EventType.TEAM}`]: 20,

  // DIV3 individual — not in METHODOLOGY table; use old flat default
  [`${Category.DIV3}:${Weapon.EPEE}:${Gender.MEN}`]: 140,
  [`${Category.DIV3}:${Weapon.FOIL}:${Gender.MEN}`]: 140,
  [`${Category.DIV3}:${Weapon.SABRE}:${Gender.MEN}`]: 140,
  [`${Category.DIV3}:${Weapon.EPEE}:${Gender.WOMEN}`]: 140,
  [`${Category.DIV3}:${Weapon.FOIL}:${Gender.WOMEN}`]: 140,
  [`${Category.DIV3}:${Weapon.SABRE}:${Gender.WOMEN}`]: 140,

  // DIV1A individual — NAC-only, not in METHODOLOGY table; use old flat default
  [`${Category.DIV1A}:${Weapon.EPEE}:${Gender.MEN}`]: 20,
  [`${Category.DIV1A}:${Weapon.FOIL}:${Gender.MEN}`]: 20,
  [`${Category.DIV1A}:${Weapon.SABRE}:${Gender.MEN}`]: 20,
  [`${Category.DIV1A}:${Weapon.EPEE}:${Gender.WOMEN}`]: 20,
  [`${Category.DIV1A}:${Weapon.FOIL}:${Gender.WOMEN}`]: 20,
  [`${Category.DIV1A}:${Weapon.SABRE}:${Gender.WOMEN}`]: 20,
}

export const REGIONAL_FENCER_DEFAULTS: Partial<Record<FencerDefaultKey, number>> = {
  // JUNIOR individual
  [`${Category.JUNIOR}:${Weapon.EPEE}:${Gender.MEN}`]: 120,
  [`${Category.JUNIOR}:${Weapon.FOIL}:${Gender.MEN}`]: 110,
  [`${Category.JUNIOR}:${Weapon.SABRE}:${Gender.MEN}`]: 120,
  [`${Category.JUNIOR}:${Weapon.EPEE}:${Gender.WOMEN}`]: 80,
  [`${Category.JUNIOR}:${Weapon.FOIL}:${Gender.WOMEN}`]: 50,
  [`${Category.JUNIOR}:${Weapon.SABRE}:${Gender.WOMEN}`]: 100,
  // JUNIOR team
  [`${Category.JUNIOR}:${EventType.TEAM}`]: 10,

  // CADET individual
  [`${Category.CADET}:${Weapon.EPEE}:${Gender.MEN}`]: 130,
  [`${Category.CADET}:${Weapon.FOIL}:${Gender.MEN}`]: 70,
  [`${Category.CADET}:${Weapon.SABRE}:${Gender.MEN}`]: 110,
  [`${Category.CADET}:${Weapon.EPEE}:${Gender.WOMEN}`]: 70,
  [`${Category.CADET}:${Weapon.FOIL}:${Gender.WOMEN}`]: 80,
  [`${Category.CADET}:${Weapon.SABRE}:${Gender.WOMEN}`]: 100,
  // CADET team
  [`${Category.CADET}:${EventType.TEAM}`]: 10,

  // Y14 individual
  [`${Category.Y14}:${Weapon.EPEE}:${Gender.MEN}`]: 120,
  [`${Category.Y14}:${Weapon.FOIL}:${Gender.MEN}`]: 140,
  [`${Category.Y14}:${Weapon.SABRE}:${Gender.MEN}`]: 130,
  [`${Category.Y14}:${Weapon.EPEE}:${Gender.WOMEN}`]: 110,
  [`${Category.Y14}:${Weapon.FOIL}:${Gender.WOMEN}`]: 110,
  [`${Category.Y14}:${Weapon.SABRE}:${Gender.WOMEN}`]: 100,

  // Y12 individual
  [`${Category.Y12}:${Weapon.EPEE}:${Gender.MEN}`]: 110,
  [`${Category.Y12}:${Weapon.FOIL}:${Gender.MEN}`]: 110,
  [`${Category.Y12}:${Weapon.SABRE}:${Gender.MEN}`]: 110,
  [`${Category.Y12}:${Weapon.EPEE}:${Gender.WOMEN}`]: 100,
  [`${Category.Y12}:${Weapon.FOIL}:${Gender.WOMEN}`]: 80,
  [`${Category.Y12}:${Weapon.SABRE}:${Gender.WOMEN}`]: 90,

  // Y10 individual
  [`${Category.Y10}:${Weapon.EPEE}:${Gender.MEN}`]: 50,
  [`${Category.Y10}:${Weapon.FOIL}:${Gender.MEN}`]: 50,
  [`${Category.Y10}:${Weapon.SABRE}:${Gender.MEN}`]: 60,
  [`${Category.Y10}:${Weapon.EPEE}:${Gender.WOMEN}`]: 50,
  [`${Category.Y10}:${Weapon.FOIL}:${Gender.WOMEN}`]: 40,
  [`${Category.Y10}:${Weapon.SABRE}:${Gender.WOMEN}`]: 40,

  // Y8 individual (all weapons/genders → 10)
  [`${Category.Y8}:${Weapon.EPEE}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.FOIL}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.SABRE}:${Gender.MEN}`]: 10,
  [`${Category.Y8}:${Weapon.EPEE}:${Gender.WOMEN}`]: 10,
  [`${Category.Y8}:${Weapon.FOIL}:${Gender.WOMEN}`]: 10,
  [`${Category.Y8}:${Weapon.SABRE}:${Gender.WOMEN}`]: 10,

  // DIV1A individual
  [`${Category.DIV1A}:${Weapon.EPEE}:${Gender.MEN}`]: 50,
  [`${Category.DIV1A}:${Weapon.FOIL}:${Gender.MEN}`]: 100,
  [`${Category.DIV1A}:${Weapon.SABRE}:${Gender.MEN}`]: 50,
  [`${Category.DIV1A}:${Weapon.EPEE}:${Gender.WOMEN}`]: 50,
  [`${Category.DIV1A}:${Weapon.FOIL}:${Gender.WOMEN}`]: 60,
  [`${Category.DIV1A}:${Weapon.SABRE}:${Gender.WOMEN}`]: 10,
  // DIV1A team
  [`${Category.DIV1A}:${EventType.TEAM}`]: 10,

  // DIV2 individual
  [`${Category.DIV2}:${Weapon.EPEE}:${Gender.MEN}`]: 60,
  [`${Category.DIV2}:${Weapon.FOIL}:${Gender.MEN}`]: 70,
  [`${Category.DIV2}:${Weapon.SABRE}:${Gender.MEN}`]: 50,
  [`${Category.DIV2}:${Weapon.EPEE}:${Gender.WOMEN}`]: 60,
  [`${Category.DIV2}:${Weapon.FOIL}:${Gender.WOMEN}`]: 20,
  [`${Category.DIV2}:${Weapon.SABRE}:${Gender.WOMEN}`]: 30,

  // VETERAN individual
  [`${Category.VETERAN}:${Weapon.EPEE}:${Gender.MEN}`]: 40,
  [`${Category.VETERAN}:${Weapon.FOIL}:${Gender.MEN}`]: 20,
  [`${Category.VETERAN}:${Weapon.SABRE}:${Gender.MEN}`]: 20,
  [`${Category.VETERAN}:${Weapon.EPEE}:${Gender.WOMEN}`]: 20,
  [`${Category.VETERAN}:${Weapon.FOIL}:${Gender.WOMEN}`]: 10,
  [`${Category.VETERAN}:${Weapon.SABRE}:${Gender.WOMEN}`]: 10,
  // VETERAN team
  [`${Category.VETERAN}:${EventType.TEAM}`]: 10,

  // DIV1 individual — regional (ROC not in METHODOLOGY table; keep existing flat default)
  [`${Category.DIV1}:${Weapon.EPEE}:${Gender.MEN}`]: 50,
  [`${Category.DIV1}:${Weapon.FOIL}:${Gender.MEN}`]: 50,
  [`${Category.DIV1}:${Weapon.SABRE}:${Gender.MEN}`]: 50,
  [`${Category.DIV1}:${Weapon.EPEE}:${Gender.WOMEN}`]: 50,
  [`${Category.DIV1}:${Weapon.FOIL}:${Gender.WOMEN}`]: 50,
  [`${Category.DIV1}:${Weapon.SABRE}:${Gender.WOMEN}`]: 50,
  // DIV1 team
  [`${Category.DIV1}:${EventType.TEAM}`]: 10,

  // DIV3 individual — regional
  [`${Category.DIV3}:${Weapon.EPEE}:${Gender.MEN}`]: 20,
  [`${Category.DIV3}:${Weapon.FOIL}:${Gender.MEN}`]: 20,
  [`${Category.DIV3}:${Weapon.SABRE}:${Gender.MEN}`]: 20,
  [`${Category.DIV3}:${Weapon.EPEE}:${Gender.WOMEN}`]: 20,
  [`${Category.DIV3}:${Weapon.FOIL}:${Gender.WOMEN}`]: 20,
  [`${Category.DIV3}:${Weapon.SABRE}:${Gender.WOMEN}`]: 20,
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
  [Category.DIV1, Category.DIV1A],
]

// ──────────────────────────────────────────────
// Soft separation pairs: high penalty but not hard-blocked.
// DIV1↔CADET is "allowed in rare cases" per Ops Manual.
// DIV1↔DIV2 and DIV1↔DIV3 are common enough to warrant soft separation only.
// ──────────────────────────────────────────────

export const SOFT_SEPARATION_PAIRS: { pair: [Category, Category]; penalty: number }[] = [
  { pair: [Category.DIV1, Category.CADET], penalty: 5.0 },
  { pair: [Category.DIV1, Category.DIV2], penalty: 3.0 },
  { pair: [Category.DIV1, Category.DIV3], penalty: 3.0 },
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
// Individual/Team relaxable blocks: pairs that MUST NOT be on the same day
// (same weapon and gender) unless constraints are relaxed to level 3.
// (METHODOLOGY.md §Individual/Team Separation)
// ──────────────────────────────────────────────

export const INDIV_TEAM_RELAXABLE_BLOCKS: { indivCategory: Category; teamCategory: Category }[] = [
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

// ──────────────────────────────────────────────
// Penalty weights — named constants from METHODOLOGY.md Appendix A
// ──────────────────────────────────────────────

export const PENALTY_WEIGHTS = {
  /** Same-time high crossover (edge >= 0.8) */
  SAME_TIME_HIGH_CROSSOVER: 10.0,
  /** Same-time low crossover (edge < 0.8) */
  SAME_TIME_LOW_CROSSOVER: 4.0,
  /** Ind+team same-time or wrong order on same day */
  INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER: 8.0,
  /** Ind+team gap < 120 min on same day */
  INDIV_TEAM_GAP_UNDER_MIN: 3.0,
  /** Early start consecutive days, high crossover */
  EARLY_START_CONSECUTIVE_HIGH_CROSSOVER: 5.0,
  /** Early start same day, high crossover */
  EARLY_START_SAME_DAY_HIGH_CROSSOVER: 2.0,
  /** Early start consecutive days, ind+team same demographic */
  EARLY_START_CONSECUTIVE_INDIV_TEAM: 2.0,
  /** Rest day violation (consecutive-day penalty for JUNIOR/CADET/DIV1) */
  REST_DAY_VIOLATION: 1.5,
  /** Team scheduled before individual (wrong order, proximity) */
  TEAM_BEFORE_INDIVIDUAL: 1.0,
  /** Weapon balance — minority group absent on a day */
  WEAPON_BALANCE: 0.5,
  /** Last-day ref shortage: large NAC (300+ fencers) */
  LAST_DAY_REF_SHORTAGE_LARGE_NAC: 0.5,
  /** Proximity 3+ days apart */
  PROXIMITY_3_PLUS_DAYS: 0.5,
  /** Y10 non-first-slot penalty */
  Y10_NON_FIRST_SLOT: 0.3,
  /** Last-day ref shortage: large ROC (100+ fencers) */
  LAST_DAY_REF_SHORTAGE_LARGE_ROC: 0.3,
  /** Ind+team 2+ days apart (proximity) */
  INDIV_TEAM_2_PLUS_DAYS: 0.3,
  /** Cross-weapon same demographic (Veteran only) */
  CROSS_WEAPON_SAME_DEMOGRAPHIC_VET: 0.2,
  /** Last-day ref shortage: medium tournament (50-100 fencers) */
  LAST_DAY_REF_SHORTAGE_MEDIUM: 0.2,
  /** Proximity 1 day apart (bonus — negative) */
  PROXIMITY_1_DAY: -0.4,
  /** Ind+team day after individual (bonus — negative) */
  INDIV_TEAM_DAY_AFTER: -0.4,
} as const

// ──────────────────────────────────────────────
// Capacity penalty curve — fill-ratio thresholds and ramps
// ──────────────────────────────────────────────

export const CAPACITY_PENALTY_CURVE = {
  /** Fill ratio below which no capacity penalty applies */
  LOW_THRESHOLD: 0.6,
  /** Fill ratio at which the moderate ramp begins */
  MID_THRESHOLD: 0.8,
  /** Fill ratio at which the steep ramp ends and max penalty applies */
  HIGH_THRESHOLD: 0.95,
  /** Maximum penalty for the low-to-mid band */
  LOW_BAND_MAX: 3.0,
  /** Additional penalty added across the mid-to-high band */
  MID_BAND_DELTA: 7.0,
  /** Flat penalty when fill ratio exceeds the high threshold */
  OVERFLOW_PENALTY: 20.0,
} as const
