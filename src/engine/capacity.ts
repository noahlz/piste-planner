/**
 * Day capacity estimation functions.
 *
 * Provides strip-hour budgets for competitions and days.
 * Strip-hours = strips × hours; a proxy for how much of a day's scheduling
 * capacity a competition consumes. Used as input to capacity-aware day assignment.
 */

import { DeMode } from './types.ts'
import type { Competition, TournamentConfig, GlobalState } from './types.ts'
import { computePoolStructure, weightedPoolDuration } from './pools.ts'
import { computeBracketSize, calculateDeDuration, deBlockDurations } from './de.ts'

export interface CompetitionStripHours {
  /** Total estimated strip-hours consumed by this competition (pools + DE). */
  total_strip_hours: number
  /** Strip-hours consumed on video-capable strips (R16 + finals for STAGED_DE_BLOCKS only). */
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
 * Estimates strip-hours consumed by a single competition.
 *
 * Pool strip-hours: n_pools × weightedPoolDuration / 60
 *   Each pool runs on its own strip simultaneously; the number of pools is
 *   the parallel strip demand for the pool phase.
 *
 * DE strip-hours: strips_allocated × deDuration / 60
 *   For SINGLE_BLOCK: all DE strips run for the full DE duration.
 *   For STAGED_DE_BLOCKS: prelims use strips_allocated; R16 uses de_round_of_16_strips;
 *   finals uses de_finals_strips. The R16 and finals phases also count as video strip-hours.
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
  const totalDeDuration = calculateDeDuration(competition.weapon, bracketSize, config.de_duration_table)

  let de_strip_hours = 0
  let video_strip_hours = 0

  if (competition.de_mode === DeMode.STAGED_DE_BLOCKS) {
    // Split DE into prelims / R16 / finals phases and attribute strip-hours separately.
    // R16 and finals phases require video strips (per competition policy).
    const blocks = deBlockDurations(bracketSize, totalDeDuration)

    const prelims_strip_hours = competition.strips_allocated * (blocks.prelims_dur / 60)
    const r16_strip_hours = competition.de_round_of_16_strips * (blocks.r16_dur / 60)
    const finals_strip_hours = competition.de_finals_strips * (blocks.finals_dur / 60)

    de_strip_hours = prelims_strip_hours + r16_strip_hours + finals_strip_hours
    video_strip_hours = r16_strip_hours + finals_strip_hours
  } else {
    // SINGLE_BLOCK: all strips used for the full DE duration; no video strip budget tracked
    de_strip_hours = competition.strips_allocated * (totalDeDuration / 60)
    video_strip_hours = 0
  }

  return {
    total_strip_hours: pool_strip_hours + de_strip_hours,
    video_strip_hours,
  }
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
