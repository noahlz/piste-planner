/**
 * Day Assignment Engine — METHODOLOGY.md §Scheduling Algorithm / §Capacity-Aware Day Assignment
 *
 * Answers: which day should this competition be scheduled on?
 * Uses penalty scoring with constraint relaxation to find the best valid day.
 */
import {
  Category,
  Weapon,
  EventType,
  DeMode,
  VideoPolicy,
  RefPolicy,
  Phase,
  BottleneckCause,
  BottleneckSeverity,
  TournamentType,
  dayStart,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, PoolStructure } from './types.ts'
import {
  CAPACITY_PENALTY_CURVE,
  HIGH_CROSSOVER_THRESHOLD,
  INDIV_TEAM_RELAXABLE_BLOCKS,
  PENALTY_WEIGHTS,
  REST_DAY_PAIRS,
  SOFT_SEPARATION_PAIRS,
} from './constants.ts'
import {
  crossoverPenalty,
  proximityPenalty,
  individualTeamProximityPenalty,
} from './crossover.ts'
import { refsAvailableOnDay } from './refs.ts'
import { earliestResourceWindow, snapToSlot } from './resources.ts'
import { resolveRefsPerPool } from './pools.ts'
import {
  estimateCompetitionStripHours,
  dayConsumedCapacity,
  categoryWeight,
} from './capacity.ts'

// ──────────────────────────────────────────────
// SchedulingError
// ──────────────────────────────────────────────

export class SchedulingError extends Error {
  // Uses ES2022 Error.cause to carry the BottleneckCause string for callers to inspect
  constructor(causeCode: string, message: string) {
    super(message, { cause: causeCode })
    this.name = 'SchedulingError'
  }
}

// ──────────────────────────────────────────────
// Constraint relaxation levels (METHODOLOGY.md §Constraint Relaxation)
// ──────────────────────────────────────────────

const ConstraintLevel = {
  FULL: 0,
  DROP_PROXIMITY: 1,
  DROP_SOFT_CROSSOVER: 2,
  DROP_RELAXABLE_BLOCKS: 3,
} as const
type ConstraintLevel = (typeof ConstraintLevel)[keyof typeof ConstraintLevel]

// ──────────────────────────────────────────────
// constraintScore — METHODOLOGY.md §Scheduling Algorithm Phase 3
// ──────────────────────────────────────────────

/**
 * Scores how constrained a competition is relative to others.
 * Higher score → schedule this competition earlier (more constrained).
 *
 * Components:
 * - crossover_count: how many other competitions conflict with this one
 * - window_tightness: 840 / (latest_end - earliest_start)
 * - saber_scarcity: for SABRE weapon — ratio of saber comps to min saber refs
 * - video_scarcity: for STAGED_DE + REQUIRED video — ratio of video comps to video strips
 * - ref_weight: TWO→2.0, AUTO→1.0, ONE→0.5
 */
export function constraintScore(
  competition: Competition,
  allCompetitions: Competition[],
  config: TournamentConfig,
): number {
  const crossoverCount = allCompetitions.filter(
    c2 => c2.id !== competition.id && crossoverPenalty(competition, c2) > 0,
  ).length

  const windowMins = competition.latest_end - competition.earliest_start
  // Guard: avoid divide-by-zero for competitions with zero-width windows
  const windowTightness = windowMins > 0 ? 840 / windowMins : 840

  const saberComps = allCompetitions.filter(c => c.weapon === Weapon.SABRE).length
  const saberMin = Math.min(...config.referee_availability.map(r => r.three_weapon_refs))
  const saberScarcity =
    competition.weapon === Weapon.SABRE ? saberComps / Math.max(saberMin, 1) : 0

  const videoCompsRequiring = allCompetitions.filter(
    c => c.de_mode === DeMode.STAGED && c.de_video_policy === VideoPolicy.REQUIRED,
  ).length
  const videoScarcity =
    competition.de_mode === DeMode.STAGED &&
    competition.de_video_policy === VideoPolicy.REQUIRED
      ? videoCompsRequiring / Math.max(config.video_strips_total, 1)
      : 0

  const refWeightMap: Record<string, number> = {
    [RefPolicy.TWO]: 2.0,
    [RefPolicy.AUTO]: 1.0,
    [RefPolicy.ONE]: 0.5,
  }
  const refWeight = refWeightMap[competition.ref_policy] ?? 1.0

  return crossoverCount + windowTightness + saberScarcity + videoScarcity + refWeight
}

// ──────────────────────────────────────────────
// earlyStartPenalty — METHODOLOGY.md §Early-Start Conflicts
// ──────────────────────────────────────────────

/**
 * Penalises scheduling two high-crossover or ind+team events both at the
 * earliest start time (8AM) on the same or consecutive days.
 *
 * Pattern A: same-day 8AM high-crossover → +2.0 per pair
 * Pattern B: consecutive-day 8AM high-crossover → +5.0 per pair
 * Pattern C: consecutive-day 8AM ind+team same demographic → +2.0
 */
export function earlyStartPenalty(
  competition: Competition,
  day: number,
  estimatedStart: number,
  state: GlobalState,
  allCompetitions: Competition[],
  config: TournamentConfig,
): number {
  const thisDayStart = dayStart(day, config)
  const isEarly = estimatedStart - thisDayStart <= config.EARLY_START_THRESHOLD
  if (!isEarly) return 0.0

  let total = 0.0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (compId === competition.id) continue
    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue

    const c2PoolStart = sr.pool_start
    if (c2PoolStart == null) continue

    const c2DayStart = dayStart(sr.assigned_day, config)
    const c2IsEarly = c2PoolStart - c2DayStart <= config.EARLY_START_THRESHOLD

    if (!c2IsEarly) continue

    const dayGap = Math.abs(day - sr.assigned_day)

    if (dayGap === 0) {
      // Pattern A: same day, both early start, high crossover
      const xpen = crossoverPenalty(competition, c2)
      if (xpen >= HIGH_CROSSOVER_THRESHOLD) {
        total += PENALTY_WEIGHTS.EARLY_START_SAME_DAY_HIGH_CROSSOVER
      }
    } else if (dayGap === 1) {
      // Pattern B: consecutive days, both early start, high crossover
      const xpen = crossoverPenalty(competition, c2)
      if (xpen >= HIGH_CROSSOVER_THRESHOLD) {
        total += PENALTY_WEIGHTS.EARLY_START_CONSECUTIVE_HIGH_CROSSOVER
      }

      // Pattern C: consecutive days, ind+team same demographic (category+gender+weapon required —
      // cross-weapon pairs should not trigger this penalty)
      const sameDemo =
        competition.category === c2.category &&
        competition.gender === c2.gender &&
        competition.weapon === c2.weapon
      const oneIsTeam =
        (competition.event_type === EventType.TEAM && c2.event_type === EventType.INDIVIDUAL) ||
        (competition.event_type === EventType.INDIVIDUAL && c2.event_type === EventType.TEAM)
      if (sameDemo && oneIsTeam) {
        total += PENALTY_WEIGHTS.EARLY_START_CONSECUTIVE_INDIV_TEAM
      }
    }
  }

  return total
}

// ──────────────────────────────────────────────
// weaponBalancePenalty — METHODOLOGY.md §Weapon Balance
// ──────────────────────────────────────────────

/**
 * Penalises unbalanced weapon distribution on a day.
 * If the proposed competition would make either ROW (foil+saber) or epee
 * have zero representation → +0.5 (minority group absent).
 */
export function weaponBalancePenalty(
  competition: Competition,
  day: number,
  state: GlobalState,
  allCompetitions: Competition[],
): number {
  // Count existing weapons on the day
  let rowCount = 0
  let epeeCount = 0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (sr.assigned_day !== day) continue
    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue
    if (c2.weapon === Weapon.EPEE) {
      epeeCount++
    } else {
      rowCount++ // FOIL or SABRE
    }
  }

  // Add the proposed competition
  if (competition.weapon === Weapon.EPEE) {
    epeeCount++
  } else {
    rowCount++
  }

  const total = rowCount + epeeCount
  if (total <= 1) return 0.0

  // If either group is 0, minority is absent → penalty proportional to competition size
  if (rowCount === 0 || epeeCount === 0) return Math.min(PENALTY_WEIGHTS.WEAPON_BALANCE * competition.fencer_count / 200, 1.0)
  return 0.0
}

// ──────────────────────────────────────────────
// crossWeaponSameDemographicPenalty — METHODOLOGY.md §Demographic Crossover
// ──────────────────────────────────────────────

/**
 * Penalises scheduling same gender+category but different weapon events on the
 * same day (cross-weapon demographic overlap creates scheduling pressure).
 */
export function crossWeaponSameDemographicPenalty(
  competition: Competition,
  day: number,
  state: GlobalState,
  allCompetitions: Competition[],
): number {
  let total = 0.0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (sr.assigned_day !== day) continue
    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue

    // Cross-weapon overlap only meaningful for Veteran events (METHODOLOGY.md §Cross-Weapon)
    if (
      competition.category === Category.VETERAN &&
      c2.gender === competition.gender &&
      c2.category === competition.category &&
      c2.weapon !== competition.weapon
    ) {
      total += PENALTY_WEIGHTS.CROSS_WEAPON_SAME_DEMOGRAPHIC_VET
    }
  }

  return total
}

// ──────────────────────────────────────────────
// lastDayRefShortagePenalty — METHODOLOGY.md §Last-Day Referee Shortage
// ──────────────────────────────────────────────

/**
 * Penalises scheduling large competitions on the last day when ref availability
 * drops below the tournament average (refs often leave early).
 */
export function lastDayRefShortagePenalty(
  competition: Competition,
  day: number,
  _state: GlobalState,
  config: TournamentConfig,
): number {
  const lastDay = config.days_available - 1
  if (day !== lastDay) return 0.0

  const lastDayRefs = refsAvailableOnDay(day, competition.weapon, config)
  const avgRefs =
    config.referee_availability.reduce(
      (sum, _r, i) => sum + refsAvailableOnDay(i, competition.weapon, config),
      0,
    ) / Math.max(config.referee_availability.length, 1)

  if (lastDayRefs >= avgRefs) return 0.0

  // Thresholds scaled to tournament size — large NAC fields warrant a higher bar
  // than mid-size ROC or smaller events before triggering a penalty.
  const tournamentType = config.tournament_type
  if (tournamentType === TournamentType.NAC) {
    if (competition.fencer_count > 300) return PENALTY_WEIGHTS.LAST_DAY_REF_SHORTAGE_LARGE_NAC
  } else if (tournamentType === TournamentType.ROC) {
    if (competition.fencer_count > 100) return PENALTY_WEIGHTS.LAST_DAY_REF_SHORTAGE_LARGE_ROC
  } else {
    // Medium events (RYC, SYC, RJCC, SJCC, etc.)
    if (competition.fencer_count > 50) return PENALTY_WEIGHTS.LAST_DAY_REF_SHORTAGE_MEDIUM
  }
  return 0.0
}

// ──────────────────────────────────────────────
// restDayPenalty — METHODOLOGY.md §Rest Day Preference
// ──────────────────────────────────────────────

/**
 * Penalises scheduling JUNIOR↔CADET or JUNIOR↔DIV1 (same weapon) on consecutive
 * days — athletes in both categories need a rest day between events.
 */
export function restDayPenalty(
  competition: Competition,
  day: number,
  state: GlobalState,
  allCompetitions: Competition[],
): number {
  let total = 0.0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue

    // Only penalise same gender+weapon pairs in REST_DAY_PAIRS
    if (c2.gender !== competition.gender) continue
    if (c2.weapon !== competition.weapon) continue

    const isPair = REST_DAY_PAIRS.some(
      ([a, b]) =>
        (competition.category === a && c2.category === b) ||
        (competition.category === b && c2.category === a),
    )
    if (!isPair) continue

    const dayGap = Math.abs(day - sr.assigned_day)
    if (dayGap === 1) {
      total += PENALTY_WEIGHTS.REST_DAY_VIOLATION
    }
  }

  return total
}

// ──────────────────────────────────────────────
// totalDayPenalty — METHODOLOGY.md §Capacity-Aware Day Assignment
// ──────────────────────────────────────────────

/**
 * Computes the total penalty for scheduling `competition` on `day` starting at
 * `estimatedStart`, given the current schedule state and constraint level.
 *
 * Returns Infinity if the day is hard-blocked (crossover Infinity at level < 3).
 */
export function totalDayPenalty(
  competition: Competition,
  day: number,
  estimatedStart: number,
  state: GlobalState,
  level: ConstraintLevel,
  allCompetitions: Competition[],
  config: TournamentConfig,
): number {
  let total = 0.0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (sr.assigned_day !== day) continue

    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue

    const xpen = crossoverPenalty(competition, c2)

    // Hard block: same population or Group 1 mandatory pair
    if (level < ConstraintLevel.DROP_RELAXABLE_BLOCKS && xpen === Infinity) return Infinity

    // Hard block: INDIV_TEAM_RELAXABLE_BLOCKS — specific ind/team cross-category pairs that must
    // not share a day because they draw from overlapping fencer pools (same weapon+gender required).
    // Checked separately so future entries in INDIV_TEAM_RELAXABLE_BLOCKS automatically apply.
    if (level < ConstraintLevel.DROP_RELAXABLE_BLOCKS && competition.weapon === c2.weapon && competition.gender === c2.gender) {
      for (const block of INDIV_TEAM_RELAXABLE_BLOCKS) {
        const isIndTeamMatch =
          (competition.event_type === EventType.INDIVIDUAL &&
            competition.category === block.indivCategory &&
            c2.event_type === EventType.TEAM &&
            c2.category === block.teamCategory) ||
          (competition.event_type === EventType.TEAM &&
            competition.category === block.teamCategory &&
            c2.event_type === EventType.INDIVIDUAL &&
            c2.category === block.indivCategory)
        if (isIndTeamMatch) return Infinity
      }
    }

    // Soft crossover penalty (ignored at level ≥ DROP_SOFT_CROSSOVER)
    if (level < ConstraintLevel.DROP_SOFT_CROSSOVER) {
      total += xpen
    }

    // Same-time penalty: always applied regardless of level
    const c2Start = sr.pool_start ?? null
    if (c2Start !== null && Math.abs(estimatedStart - c2Start) <= config.SAME_TIME_WINDOW_MINS && xpen > 0) {
      total += xpen >= HIGH_CROSSOVER_THRESHOLD
        ? PENALTY_WEIGHTS.SAME_TIME_HIGH_CROSSOVER
        : PENALTY_WEIGHTS.SAME_TIME_LOW_CROSSOVER
    }

    // Individual+Team ordering penalty (same demographic)
    if (
      competition.category === c2.category &&
      competition.weapon === c2.weapon &&
      competition.gender === c2.gender
    ) {
      const oneIsInd = competition.event_type === EventType.INDIVIDUAL || c2.event_type === EventType.INDIVIDUAL
      const oneIsTeam = competition.event_type === EventType.TEAM || c2.event_type === EventType.TEAM

      if (oneIsInd && oneIsTeam) {
        // Determine which is team and which is individual
        const isCompTeam = competition.event_type === EventType.TEAM
        const teamStart = isCompTeam ? estimatedStart : (c2Start ?? estimatedStart)
        const indStart = isCompTeam ? (c2Start ?? estimatedStart) : estimatedStart

        const gap = teamStart - indStart // positive = team after ind (correct)
        if (Math.abs(gap) <= config.SAME_TIME_WINDOW_MINS || gap < 0) {
          total += PENALTY_WEIGHTS.INDIV_TEAM_SAME_TIME_OR_WRONG_ORDER
        } else if (gap < config.INDIV_TEAM_MIN_GAP_MINS) {
          total += PENALTY_WEIGHTS.INDIV_TEAM_GAP_UNDER_MIN
        }
      }
    }

    // Soft separation: e.g. DIV1↔CADET same weapon+gender should be on different days
    // (Operations Manual: only split in rare cases). Ignored at level ≥ DROP_SOFT_CROSSOVER, same as soft crossover.
    if (level < ConstraintLevel.DROP_SOFT_CROSSOVER) {
      for (const entry of SOFT_SEPARATION_PAIRS) {
        const [a, b] = entry.pair
        const isPair =
          (competition.category === a && c2.category === b) ||
          (competition.category === b && c2.category === a)
        if (isPair && competition.gender === c2.gender && competition.weapon === c2.weapon) {
          total += entry.penalty
        }
      }
    }
  }

  // Early start penalty
  total += earlyStartPenalty(competition, day, estimatedStart, state, allCompetitions, config)

  // Y8 and Y10 must be in the first slot of the day (METHODOLOGY: Y8/Y10 Early Scheduling → 0.3)
  const thisDayStart = dayStart(day, config)
  if (
    (competition.category === Category.Y10 || competition.category === Category.Y8) &&
    estimatedStart > thisDayStart + config.SLOT_MINS
  ) {
    total += PENALTY_WEIGHTS.Y10_NON_FIRST_SLOT
  }

  total += weaponBalancePenalty(competition, day, state, allCompetitions)
  total += crossWeaponSameDemographicPenalty(competition, day, state, allCompetitions)
  total += lastDayRefShortagePenalty(competition, day, state, config)
  total += restDayPenalty(competition, day, state, allCompetitions)

  // ── General capacity penalty ──────────────────────────────────────────────
  // Ramps up as the day fills (strip-hour budget), discouraging over-packing.
  {
    const consumed = dayConsumedCapacity(day, state, allCompetitions, config)
    const candidateStripHours = estimateCompetitionStripHours(competition, config)
    const candidateWeighted = candidateStripHours.total_strip_hours * categoryWeight(competition)
    const totalCapacity = config.strips_total * (config.DAY_LENGTH_MINS / 60)
    const fillRatio = (consumed.strip_hours_consumed + candidateWeighted) / totalCapacity

    let capacityPenalty: number
    if (fillRatio < CAPACITY_PENALTY_CURVE.LOW_THRESHOLD) {
      capacityPenalty = 0
    } else if (fillRatio < CAPACITY_PENALTY_CURVE.MID_THRESHOLD) {
      // Linear ramp 0 → LOW_BAND_MAX over the low–mid band
      const bandWidth = CAPACITY_PENALTY_CURVE.MID_THRESHOLD - CAPACITY_PENALTY_CURVE.LOW_THRESHOLD
      capacityPenalty = ((fillRatio - CAPACITY_PENALTY_CURVE.LOW_THRESHOLD) / bandWidth) * CAPACITY_PENALTY_CURVE.LOW_BAND_MAX
    } else if (fillRatio < CAPACITY_PENALTY_CURVE.HIGH_THRESHOLD) {
      // Steeper ramp LOW_BAND_MAX → LOW_BAND_MAX + MID_BAND_DELTA over the mid–high band
      const bandWidth = CAPACITY_PENALTY_CURVE.HIGH_THRESHOLD - CAPACITY_PENALTY_CURVE.MID_THRESHOLD
      capacityPenalty = CAPACITY_PENALTY_CURVE.LOW_BAND_MAX + ((fillRatio - CAPACITY_PENALTY_CURVE.MID_THRESHOLD) / bandWidth) * CAPACITY_PENALTY_CURVE.MID_BAND_DELTA
    } else {
      // Strongly discourage scheduling onto a near-full day
      capacityPenalty = CAPACITY_PENALTY_CURVE.OVERFLOW_PENALTY
    }
    total += capacityPenalty
  }

  // ── Video-strip capacity penalty (STAGED events only) ───────────
  // Estimates peak concurrent video-strip demand for staged-DE events on the day.
  if (competition.de_mode === DeMode.STAGED) {
    let sumR16 = 0
    let sumFinals = 0

    for (const [compId, sr] of Object.entries(state.schedule)) {
      if (sr.assigned_day !== day) continue
      const c2 = allCompetitions.find(c => c.id === compId)
      if (!c2 || c2.de_mode !== DeMode.STAGED) continue
      sumR16 += c2.de_round_of_16_strips
      sumFinals += c2.de_finals_strips
    }

    // Peak concurrent demand: the larger of the R16 phase or the finals phase
    const peakDemand = Math.max(
      sumR16 + competition.de_round_of_16_strips,
      sumFinals + competition.de_finals_strips,
    )

    if (peakDemand > config.video_strips_total) {
      total += 15.0
    } else if (peakDemand > 0.7 * config.video_strips_total) {
      total += 5.0
    }
  }

  // Proximity penalties only at FULL constraint level
  if (level < ConstraintLevel.DROP_PROXIMITY) {
    total += proximityPenalty(competition, day, state.schedule, allCompetitions)
    total += individualTeamProximityPenalty(competition, day, state.schedule, allCompetitions)
  }

  return total
}

// ──────────────────────────────────────────────
// Day scoring helpers
// ──────────────────────────────────────────────

interface DayScore {
  day: number
  score: number
  estimatedStart: number
}

/**
 * Estimates the earliest start time for `competition` on `day` given the
 * current pool structure and state. Uses earliestResourceWindow to find a
 * valid resource window.
 *
 * Returns null if no valid window exists on that day (NO_WINDOW).
 */
function estimateStartOnDay(
  competition: Competition,
  poolStructure: PoolStructure,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
): number | null {
  const thisDayStart = dayStart(day, config)
  const notBefore = Math.max(competition.earliest_start, thisDayStart)

  const availableRefs = refsAvailableOnDay(day, competition.weapon, config)
  const refResolution = resolveRefsPerPool(
    competition.ref_policy,
    poolStructure.n_pools,
    availableRefs,
  )

  // Pools never require video strips — only DE phases do.
  // scheduleCompetition passes videoRequired=false for pool allocation.
  const result = earliestResourceWindow(
    competition.strips_allocated,
    refResolution.refs_needed,
    competition.weapon,
    false,
    notBefore,
    day,
    state,
    config,
    competition.id,
    Phase.POOLS,
  )

  if (result.type === 'NO_WINDOW') return null
  return result.startTime
}

/**
 * Scores all valid days for `competition` at the given constraint level.
 * Returns an array of DayScore for days where a resource window exists.
 */
function scoreAllDays(
  competition: Competition,
  poolStructure: PoolStructure,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
  level: ConstraintLevel,
): DayScore[] {
  const scores: DayScore[] = []

  for (let day = 0; day < config.days_available; day++) {
    const estimatedStart = estimateStartOnDay(competition, poolStructure, day, state, config)
    if (estimatedStart === null) continue // NO_WINDOW

    const score = totalDayPenalty(competition, day, estimatedStart, state, level, allCompetitions, config)
    scores.push({ day, score, estimatedStart })
  }

  return scores
}

// ──────────────────────────────────────────────
// recordDiagnosticBottlenecks — METHODOLOGY.md §Capacity-Aware Day Assignment
// ──────────────────────────────────────────────

/**
 * Records diagnostic bottlenecks for the selected day after scoring is complete.
 * Called only for the chosen day, not speculatively during scoring.
 *
 * - SAME_DAY_DEMOGRAPHIC_CONFLICT (INFO): crossover > 0 and level < 2
 * - SAME_TIME_CROSSOVER (WARN): same-time penalty triggered
 * - INDIV_TEAM_ORDERING (WARN or INFO): ind+team ordering penalty triggered
 * - UNAVOIDABLE_CROSSOVER_CONFLICT (WARN): crossover on best day
 * - PROXIMITY_PREFERENCE_UNMET (INFO): no crossover, but proximity penalty
 */
function recordDiagnosticBottlenecks(
  competition: Competition,
  day: number,
  estimatedStart: number,
  state: GlobalState,
  level: ConstraintLevel,
  allCompetitions: Competition[],
  config: TournamentConfig,
): void {
  let hasCrossover = false
  let hasSameTimeCrossover = false
  let hasIndTeamOrdering = false

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (sr.assigned_day !== day) continue
    const c2 = allCompetitions.find(c => c.id === compId)
    if (!c2) continue

    const xpen = crossoverPenalty(competition, c2)

    if (xpen > 0 && level < ConstraintLevel.DROP_SOFT_CROSSOVER) {
      hasCrossover = true
      state.bottlenecks.push({
        competition_id: competition.id,
        phase: Phase.DAY_ASSIGNMENT,
        cause: BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${competition.id}: same-day demographic conflict with ${compId} on day ${day}`,
      })
    }

    const c2Start = sr.pool_start ?? null
    if (c2Start !== null && Math.abs(estimatedStart - c2Start) <= config.SAME_TIME_WINDOW_MINS && xpen > 0) {
      hasSameTimeCrossover = true
    }

    if (
      competition.category === c2.category &&
      competition.weapon === c2.weapon &&
      competition.gender === c2.gender
    ) {
      const oneIsInd =
        competition.event_type === EventType.INDIVIDUAL || c2.event_type === EventType.INDIVIDUAL
      const oneIsTeam =
        competition.event_type === EventType.TEAM || c2.event_type === EventType.TEAM

      if (oneIsInd && oneIsTeam && c2Start !== null) {
        const isCompTeam = competition.event_type === EventType.TEAM
        const teamStart = isCompTeam ? estimatedStart : c2Start
        const indStart = isCompTeam ? c2Start : estimatedStart
        const gap = teamStart - indStart
        if (Math.abs(gap) <= config.SAME_TIME_WINDOW_MINS || gap < 0 || gap < config.INDIV_TEAM_MIN_GAP_MINS) {
          hasIndTeamOrdering = true
        }
      }
    }
  }

  if (hasSameTimeCrossover) {
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DAY_ASSIGNMENT,
      cause: BottleneckCause.SAME_TIME_CROSSOVER,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${competition.id}: same-time crossover conflict on day ${day}`,
    })
  }

  if (hasIndTeamOrdering) {
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DAY_ASSIGNMENT,
      cause: BottleneckCause.INDIV_TEAM_ORDERING,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${competition.id}: individual+team ordering issue on day ${day}`,
    })
  }

  // Crossover vs. proximity distinction for top-level bottleneck
  if (hasCrossover) {
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DAY_ASSIGNMENT,
      cause: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${competition.id}: unavoidable crossover conflict on day ${day}`,
    })
  } else if (level < ConstraintLevel.DROP_PROXIMITY) {
    // No crossover — check if proximity penalties are the source
    const proxPenalty =
      proximityPenalty(competition, day, state.schedule, allCompetitions) +
      individualTeamProximityPenalty(competition, day, state.schedule, allCompetitions)
    if (proxPenalty > 0) {
      state.bottlenecks.push({
        competition_id: competition.id,
        phase: Phase.DAY_ASSIGNMENT,
        cause: BottleneckCause.PROXIMITY_PREFERENCE_UNMET,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${competition.id}: proximity preference unmet on day ${day}`,
      })
    }
  }
}

// ──────────────────────────────────────────────
// assignDay — METHODOLOGY.md §Constraint Relaxation
// ──────────────────────────────────────────────

/**
 * Assigns the best day for `competition` using constraint relaxation.
 *
 * Tries constraint levels 0→3 in order:
 * - Level 0: full constraints (proximity + crossover + hard blocks)
 * - Level 1: ignore proximity penalties
 * - Level 2: ignore soft crossover penalties (keep Infinity blocks only)
 * - Level 3: ignore Infinity blocks (same population allowed — last resort)
 *
 * Records bottlenecks when constraints must be relaxed or when the best
 * available day still has unavoidable conflicts.
 *
 * Throws SchedulingError if no valid day exists even at level 3.
 */
export function assignDay(
  competition: Competition,
  poolStructure: PoolStructure,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
): { day: number; level: number } {
  // Track each relaxation attempt for diagnostics
  const trail: Array<{ level: number; validCount: number; totalCount: number }> = []

  for (const level of Object.values(ConstraintLevel)) {
    const scores = scoreAllDays(competition, poolStructure, state, config, allCompetitions, level)

    // Filter out Infinity-scored days (hard blocks at lower levels)
    const valid = scores.filter(s => s.score !== Infinity)

    if (valid.length === 0) {
      trail.push({ level, validCount: 0, totalCount: scores.length })
      // Record INFO bottleneck for the failed level
      state.bottlenecks.push({
        competition_id: competition.id,
        phase: Phase.DAY_ASSIGNMENT,
        cause: BottleneckCause.CONSTRAINT_RELAXED,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${competition.id}: Level ${level}: 0 valid days of ${scores.length}`,
      })
      continue
    }

    const best = valid.reduce((min, s) => (s.score < min.score ? s : min), valid[0])

    // Record relaxation bottleneck if we had to relax constraints
    if (level > ConstraintLevel.FULL) {
      const trailSummary = trail.map(t => `Level ${t.level}: ${t.validCount} valid days of ${t.totalCount}`).join(', ')
      state.bottlenecks.push({
        competition_id: competition.id,
        phase: Phase.DAY_ASSIGNMENT,
        cause: BottleneckCause.CONSTRAINT_RELAXED,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `${competition.id}: day assignment required constraint relaxation to level ${level} (${trailSummary})`,
      })
    }

    // Record diagnostic bottlenecks for the chosen day
    if (best.score > 0) {
      recordDiagnosticBottlenecks(competition, best.day, best.estimatedStart, state, level, allCompetitions, config)
    }

    return { day: best.day, level }
  }

  const trailSummary = trail.map(t => `Level ${t.level}: ${t.validCount} valid days of ${t.totalCount}`).join(', ')
  throw new SchedulingError(
    BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    `No valid day found for competition ${competition.id} — all days exhausted at all constraint levels. Trail: ${trailSummary}`,
  )
}

// ──────────────────────────────────────────────
// findEarlierSlotSameDay — METHODOLOGY.md §Capacity-Aware Day Assignment
// ──────────────────────────────────────────────

/**
 * Tries to find an earlier start slot on the given day by scanning slots
 * from day start to latest start offset, checking resource availability.
 *
 * Returns the earliest valid slot where the competition can finish within
 * the day, or null if no earlier slot is found.
 *
 * Bounded iteration: at most (LATEST_START_OFFSET / SLOT_MINS) attempts.
 */
export function findEarlierSlotSameDay(
  competition: Competition,
  poolStructure: PoolStructure,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
): number | null {
  const thisDayStart = dayStart(day, config)
  const latestStart = thisDayStart + config.LATEST_START_OFFSET
  const maxSlots = Math.ceil(config.LATEST_START_OFFSET / config.SLOT_MINS)

  const availableRefs = refsAvailableOnDay(day, competition.weapon, config)
  const refResolution = resolveRefsPerPool(
    competition.ref_policy,
    poolStructure.n_pools,
    availableRefs,
  )

  const videoRequired = competition.de_video_policy === VideoPolicy.REQUIRED

  let slot = snapToSlot(thisDayStart)
  let attempts = 0

  while (slot <= latestStart && attempts < maxSlots) {
    attempts++

    const result = earliestResourceWindow(
      competition.strips_allocated,
      refResolution.refs_needed,
      competition.weapon,
      videoRequired,
      slot,
      day,
      state,
      config,
      competition.id,
      Phase.POOLS,
    )

    if (result.type === 'FOUND') {
      return result.startTime
    }

    slot = snapToSlot(slot + config.SLOT_MINS)
  }

  return null
}
