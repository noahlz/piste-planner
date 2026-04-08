/**
 * Day capacity estimation functions.
 *
 * Provides strip-hour budgets for competitions and days.
 * Strip-hours = strips × hours; a proxy for how much of a day's scheduling
 * capacity a competition consumes. Used as input to capacity-aware day assignment.
 */

import { Category, DeCapacityMode, DeMode, EventType } from './types.ts'
import type { Competition, TournamentConfig, GlobalState } from './types.ts'
import { CATEGORY_START_PREFERENCE, DE_POD_SIZE, DE_BOUT_DURATION } from './constants.ts'
import { computePoolStructure, weightedPoolDuration, computeDeFencerCount } from './pools.ts'
import { computeBracketSize, calculateDeDuration, deBlockDurations } from './de.ts'

export interface CompetitionStripHours {
  /** Total estimated strip-hours consumed by this competition (pools + DE). */
  total_strip_hours: number
  /** Strip-hours consumed on video-capable strips (R16 + finals for STAGED only). */
  video_strip_hours: number
}

export interface DayConsumedCapacity {
  strip_hours_consumed: number
  video_strip_hours_consumed: number
}

export interface DayRemainingCapacity {
  strip_hours_remaining: number
  video_strip_hours_remaining: number
}

/**
 * Distributes `total` items across `n` groups as evenly as possible.
 * Larger groups get one extra when total is not evenly divisible.
 * Returns an array of group sizes sorted largest-first.
 */
export function distributeEvenly(total: number, n: number): number[] {
  const base = Math.floor(total / n)
  const remainder = total % n
  const sizes: number[] = []
  for (let i = 0; i < n; i++) {
    sizes.push(base + (i < remainder ? 1 : 0))
  }
  return sizes
}

/**
 * Returns the largest power of 2 that is ≤ n.
 */
function prevPowerOf2(n: number): number {
  if (n <= 1) return 1
  return 1 << Math.floor(Math.log2(n))
}

/**
 * Pod model: DE strips organized into pods of DE_POD_SIZE. Each pod runs an
 * independent sub-bracket. At R16 (16 fencers remaining overall), pods
 * consolidate to a single pod. Strip-hours are scaled by the ratio of
 * table duration to bout-based duration.
 */
function podDeStripHours(
  promotedFencers: number,
  stripsAllocated: number,
  weapon: Competition['weapon'],
  tableDuration: number,
): number {
  if (promotedFencers <= 1) return 0

  const boutDuration = DE_BOUT_DURATION[weapon]
  const nPods = Math.ceil(stripsAllocated / DE_POD_SIZE)
  const podSizes = distributeEvenly(stripsAllocated, nPods)

  // For brackets ≤ 16, everything runs on a single pod from the start
  if (promotedFencers <= 16) {
    return podR16StripHours(promotedFencers, boutDuration, tableDuration)
  }

  const subBracketFencers = Math.floor(promotedFencers / nPods)
  // R16 cutoff per pod: 16 fencers remaining overall = 16/nPods per pod
  const subR16Cutoff = Math.floor(16 / nPods)

  // Pre-R16: each pod walks its sub-bracket down to the cutoff
  let maxPodBatches = 0
  for (const podStripCount of podSizes) {
    let podBatches = 0
    let fencers = subBracketFencers
    while (fencers > subR16Cutoff && fencers >= 2) {
      const bouts = Math.floor(fencers / 2)
      podBatches += Math.ceil(bouts / podStripCount)
      fencers = Math.floor(fencers / 2)
    }
    maxPodBatches = Math.max(maxPodBatches, podBatches)
  }

  const preR16Duration = maxPodBatches * boutDuration
  const preR16StripHours = stripsAllocated * preR16Duration / 60

  // R16 phase onward (single pod of DE_POD_SIZE strips, finals excluded)
  const r16StripHours = podR16StripHours(16, boutDuration, 0) // raw, no scaling on this piece

  // Bout-based total elapsed time for scaling
  const r16Batches = Math.ceil(8 / DE_POD_SIZE) + Math.ceil(4 / DE_POD_SIZE) + 1 // R16 + QF + SF
  const r16Duration = r16Batches * boutDuration
  const boutBasedTotal = preR16Duration + r16Duration

  // Scale to match empirical duration table
  const scaleFactor = boutBasedTotal > 0 ? tableDuration / boutBasedTotal : 1
  return (preR16StripHours + r16StripHours) * scaleFactor
}

/**
 * Computes strip-hours for R16 onward on a single pod (4 strips).
 * Finals bout excluded (dedicated strip). SF frees 2 strips.
 */
function podR16StripHours(
  fencers: number,
  boutDuration: number,
  tableDuration: number,
): number {
  // Walk from current fencer count down to 2 (SF), excluding finals
  let totalStripHours = 0
  let totalBoutDuration = 0
  let current = fencers
  while (current > 2) {
    const bouts = Math.floor(current / 2)
    const stripsUsed = Math.min(bouts, DE_POD_SIZE)
    const batches = Math.ceil(bouts / DE_POD_SIZE)
    const roundDuration = batches * boutDuration
    totalStripHours += stripsUsed * roundDuration / 60
    totalBoutDuration += roundDuration
    current = Math.floor(current / 2)
  }

  // Scale to table duration if provided (for standalone small brackets)
  if (tableDuration > 0 && totalBoutDuration > 0) {
    totalStripHours *= tableDuration / totalBoutDuration
  }

  return totalStripHours
}

/**
 * Greedy model: all strips as a single pool. Strip-hours = total_bouts × bout_duration / 60.
 * Strip-count-independent. No duration scaling.
 */
function greedyDeStripHours(
  promotedFencers: number,
  weapon: Competition['weapon'],
): number {
  if (promotedFencers <= 1) return 0
  const totalBouts = promotedFencers - 2 // exclude finals bout
  return totalBouts * DE_BOUT_DURATION[weapon] / 60
}

/**
 * Team DE strip-hours: round-by-round, all bouts in a round run simultaneously.
 * No pods. Non-power-of-2 entries cause play-in bouts. Finals excluded.
 */
function teamDeStripHours(
  teamCount: number,
  weapon: Competition['weapon'],
): number {
  if (teamCount <= 1) return 0
  const boutDuration = DE_BOUT_DURATION[weapon]

  const playInBouts = teamCount - prevPowerOf2(teamCount)
  let totalStripHours = 0

  // Play-in round (if any)
  if (playInBouts > 0) {
    totalStripHours += playInBouts * boutDuration / 60
  }

  // Clean bracket rounds: after play-ins, the bracket is a clean power of 2.
  // Walk from full field down to SF (2 bouts), excluding finals (1 bout).
  let remaining = prevPowerOf2(teamCount)
  while (remaining >= 2) {
    const bouts = Math.floor(remaining / 2)
    if (bouts === 1) break // finals — excluded
    totalStripHours += bouts * boutDuration / 60
    remaining = Math.floor(remaining / 2)
  }

  return totalStripHours
}

/**
 * Estimates strip-hours consumed by a single competition.
 *
 * Pool strip-hours: n_pools × weightedPoolDuration / 60
 *   Each pool runs on its own strip simultaneously; the number of pools is
 *   the parallel strip demand for the pool phase.
 *
 * DE strip-hours depend on de_capacity_mode (pod or greedy) for individual events.
 * Team events always use the greedy/round-by-round model.
 *
 * For STAGED: prelims use the selected capacity model; R16 and finals
 * phases use their own strip counts and durations unchanged.
 */
export function estimateCompetitionStripHours(
  competition: Competition,
  config: TournamentConfig,
): CompetitionStripHours {
  const poolStructure = computePoolStructure(
    competition.fencer_count,
    competition.use_single_pool_override,
  )
  const poolDuration = weightedPoolDuration(
    poolStructure,
    competition.weapon,
    config.pool_round_duration_table,
  )

  // Pool strip-hours: one strip per pool, running in parallel
  const pool_strip_hours = poolStructure.n_pools * (poolDuration / 60)

  const bracketSize = computeBracketSize(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )
  const promotedFencers = computeDeFencerCount(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )
  const totalDeDuration = calculateDeDuration(competition.weapon, bracketSize, config.de_duration_table)

  let de_strip_hours = 0
  let video_strip_hours = 0

  // Team events always use the team round-by-round model
  if (competition.event_type === EventType.TEAM) {
    de_strip_hours = teamDeStripHours(competition.fencer_count, competition.weapon)
  } else if (competition.de_mode === DeMode.STAGED) {
    // Split DE into prelims / R16 / finals phases and attribute strip-hours separately.
    // R16 and finals phases require video strips (per competition policy).
    const blocks = deBlockDurations(bracketSize, totalDeDuration)

    // Prelims use the selected capacity model
    const prelimsPromoted = promotedFencers
    let prelims_strip_hours: number
    if (config.de_capacity_mode === DeCapacityMode.GREEDY) {
      // Greedy for prelims: bouts before R16. For a bracket of N,
      // prelims bouts = promoted - 16 (everything before R16 consolidation)
      const prelimsBouts = Math.max(prelimsPromoted - 16, 0)
      prelims_strip_hours = prelimsBouts * DE_BOUT_DURATION[competition.weapon] / 60
    } else {
      // Pod model for prelims only — compute pre-R16 strip-hours
      prelims_strip_hours = podPrelimsStripHours(
        prelimsPromoted,
        competition.strips_allocated,
        competition.weapon,
        blocks.prelims_dur,
      )
    }

    const r16_strip_hours = competition.de_round_of_16_strips * (blocks.r16_dur / 60)
    const finals_strip_hours = competition.de_finals_strips * (blocks.finals_dur / 60)

    de_strip_hours = prelims_strip_hours + r16_strip_hours + finals_strip_hours
    video_strip_hours = r16_strip_hours + finals_strip_hours
  } else {
    // SINGLE_STAGE: use selected capacity model
    if (config.de_capacity_mode === DeCapacityMode.GREEDY) {
      de_strip_hours = greedyDeStripHours(promotedFencers, competition.weapon)
    } else {
      de_strip_hours = podDeStripHours(
        promotedFencers,
        competition.strips_allocated,
        competition.weapon,
        totalDeDuration,
      )
    }
    video_strip_hours = 0
  }

  return {
    total_strip_hours: pool_strip_hours + de_strip_hours,
    video_strip_hours,
  }
}

/**
 * Prelims strip-hours for STAGED.
 *
 * For STAGED, R16/finals phases already use their own strip counts
 * and empirical durations. The prelims phase uses the flat formula
 * `stripsAllocated × prelimsDuration / 60` — the pod sub-bracket math cancels
 * out after duration scaling because prelims duration is already empirical.
 */
function podPrelimsStripHours(
  promotedFencers: number,
  stripsAllocated: number,
  _weapon: Competition['weapon'],
  prelimsDuration: number,
): number {
  if (promotedFencers <= 16) return 0
  return stripsAllocated * prelimsDuration / 60
}

/**
 * Sums the strip-hours consumed by all competitions assigned to `day`.
 */
export function dayConsumedCapacity(
  day: number,
  state: GlobalState,
  allCompetitions: Competition[],
  config: TournamentConfig,
): DayConsumedCapacity {
  let strip_hours_consumed = 0
  let video_strip_hours_consumed = 0

  for (const [compId, sr] of Object.entries(state.schedule)) {
    if (sr.assigned_day !== day) continue

    const comp = allCompetitions.find(c => c.id === compId)
    if (!comp) continue

    const estimate = estimateCompetitionStripHours(comp, config)
    strip_hours_consumed += estimate.total_strip_hours
    video_strip_hours_consumed += estimate.video_strip_hours
  }

  return { strip_hours_consumed, video_strip_hours_consumed }
}

/**
 * Returns the strip-hours remaining on `day` after subtracting consumed capacity
 * from the total available capacity.
 *
 * Total capacity: strips_total × DAY_LENGTH_MINS / 60
 * Video capacity: video_strips_total × DAY_LENGTH_MINS / 60
 */
export function dayRemainingCapacity(
  day: number,
  state: GlobalState,
  allCompetitions: Competition[],
  config: TournamentConfig,
): DayRemainingCapacity {
  const total_capacity = config.strips_total * (config.DAY_LENGTH_MINS / 60)
  const video_capacity = config.video_strips_total * (config.DAY_LENGTH_MINS / 60)

  const consumed = dayConsumedCapacity(day, state, allCompetitions, config)

  return {
    strip_hours_remaining: total_capacity - consumed.strip_hours_consumed,
    video_strip_hours_remaining: video_capacity - consumed.video_strip_hours_consumed,
  }
}

/**
 * Returns the capacity weight for a competition's age category.
 *
 * For VETERAN competitions, a compound key (`VETERAN:${vet_age_group}`) is used when
 * vet_age_group is set, so VET60/70/80/COMBINED (weight 0.6) are distinguished from
 * VET40/50 (weight 0.8). When vet_age_group is null, falls back to the plain VETERAN
 * entry (weight 0.8 — same as the lighter vet groups).
 */
export function categoryWeight(competition: Competition): number {
  if (competition.category === Category.VETERAN && competition.vet_age_group !== null) {
    const key = `${Category.VETERAN}:${competition.vet_age_group}` as const
    return CATEGORY_START_PREFERENCE[key].weight
  }
  return CATEGORY_START_PREFERENCE[competition.category].weight
}

/**
 * Returns the estimated strip-hours for a competition scaled by its category weight.
 * Used in capacity-aware day assignment to treat heavyweight events (DIV1, JUNIOR)
 * as occupying more effective scheduling capacity than their raw strip-hours suggest.
 */
export function weightedStripHours(competition: Competition, config: TournamentConfig): number {
  return estimateCompetitionStripHours(competition, config).total_strip_hours * categoryWeight(competition)
}
