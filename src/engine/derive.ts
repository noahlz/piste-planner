/**
 * Derived block geometry — research D1.
 *
 * One event's blocks (pool, DE, flight A/B splits) are a pure function of its
 * placement plus the competition and config inputs, so no geometry needs
 * storing. This module reproduces what `concurrentScheduler` computes for a
 * single event, minus resource contention: the placement fixes the day, the
 * start, and the strip budget, and every duration comes from the same helpers
 * the scheduler calls.
 *
 * Three `ScheduleResult` fields have no input derivation and are left neutral:
 * `conflict_score`, `constraint_relaxation_level`, `accepted_warnings`. They
 * are scheduler diagnostics about contention, not geometry.
 */

import { DeMode, Phase, tailEstimateMins } from './types.ts'
import type { Competition, Placement, ScheduleResult, TournamentConfig } from './types.ts'
import { snapToSlot } from './resources.ts'
import {
  computePoolStructure,
  computeDeFencerCount,
  estimatePoolDuration,
  resolveRefsPerPool,
  weightedPoolDuration,
} from './pools.ts'
import {
  calculateDeDuration,
  computeBracketSize,
  deBlockDurations,
  dePhasesForBracket,
  deSingleStageDuration,
  deStagedPhaseDuration,
  deStripFootprint,
} from './de.ts'
import { computeStripCap } from './stripBudget.ts'

export interface DerivedEventSchedule {
  result: ScheduleResult
  /** The placement's day falls outside [0, days_available). Blocks still derive. */
  day_out_of_range: boolean
}

/**
 * Strips a phase actually draws: what it asks for, bounded by the config cap
 * and — for pool phases — the placement's budget. Never below 1, matching
 * `tryAllocate`'s `Math.max(1, ...)` floor for a zero-pool flight.
 */
function grantedStrips(desired: number, ...bounds: number[]): number {
  return Math.max(1, Math.min(desired, ...bounds))
}

/**
 * Computes one event's schedule geometry from its placement. Never throws on an
 * out-of-range day — durations are a function of (competition, config, strip
 * budget) only, so an impossible day changes the flag, not the blocks.
 */
export function deriveEventSchedule(
  placement: Placement,
  competition: Competition,
  config: TournamentConfig,
): DerivedEventSchedule {
  const poolStructure = computePoolStructure(
    competition.fencer_count,
    competition.use_single_pool_override,
  )
  const poolBaseline = weightedPoolDuration(
    poolStructure,
    competition.weapon,
    config.pool_round_duration_table,
  )
  const refs = resolveRefsPerPool(competition.ref_policy, poolStructure.n_pools)
  const bracketSize = computeBracketSize(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )
  const totalDeBase = calculateDeDuration(
    competition.weapon,
    bracketSize,
    config.de_duration_table,
  )

  const poolCap = computeStripCap(
    config.strips_total,
    config.max_pool_strip_pct,
    competition.max_pool_strip_pct_override,
  )
  const deCap = computeStripCap(
    config.strips_total,
    config.max_de_strip_pct,
    competition.max_de_strip_pct_override,
  )

  const result: ScheduleResult = {
    competition_id: competition.id,
    assigned_day: placement.day,
    use_flighting: competition.flighted || competition.flighting_group_id !== null,
    is_priority: competition.is_priority,
    flighting_group_id: competition.flighting_group_id,
    pool_start: null,
    pool_end: null,
    pool_strip_count: 0,
    pool_refs_count: 0,
    flight_a_start: null,
    flight_a_end: null,
    flight_a_strips: 0,
    flight_a_refs: 0,
    flight_b_start: null,
    flight_b_end: null,
    flight_b_strips: 0,
    flight_b_refs: 0,
    entry_fencer_count: competition.fencer_count,
    promoted_fencer_count: computeDeFencerCount(
      competition.fencer_count,
      competition.cut_mode,
      competition.cut_value,
      competition.event_type,
    ),
    bracket_size: bracketSize,
    cut_mode: competition.cut_mode,
    cut_value: competition.cut_value,
    de_mode: competition.de_mode,
    de_video_policy: competition.de_video_policy,
    de_start: null,
    de_end: null,
    de_strip_count: 0,
    de_prelims_start: null,
    de_prelims_end: null,
    de_prelims_strip_count: 0,
    de_round_of_16_start: null,
    de_round_of_16_end: null,
    de_round_of_16_strip_count: 0,
    de_total_end: null,
    conflict_score: 0,
    pool_duration_baseline: poolBaseline,
    pool_duration_actual: 0,
    de_duration_baseline: totalDeBase,
    de_duration_actual: 0,
    constraint_relaxation_level: 0,
    accepted_warnings: [],
  }

  // Pool block. A standalone flighted event splits its pools into A and B;
  // an event that merely carries a flighting_group_id does not
  // (concurrentScheduler.ts buildPhaseNodes), even though use_flighting is true.
  const poolStart = snapToSlot(placement.start_time)
  const splitsIntoFlights = competition.flighted && competition.flighting_group_id === null
  let poolEnd: number

  if (splitsIntoFlights) {
    const flightAPools = Math.ceil(poolStructure.n_pools / 2)
    const flightBPools = Math.floor(poolStructure.n_pools / 2)
    const flightAStrips = grantedStrips(
      flightAPools, poolCap, Math.ceil(placement.strip_count / 2),
    )
    const flightBStrips = grantedStrips(
      flightBPools, poolCap, Math.floor(placement.strip_count / 2),
    )
    const flightAEnd = poolStart + estimatePoolDuration(
      flightAPools, poolBaseline, flightAStrips, refs.refs_per_pool,
    ).actual_duration
    // Flight B waits out the longer of the admin gap and the flight buffer.
    const flightBStart = Math.max(
      snapToSlot(flightAEnd + config.ADMIN_GAP_MINS),
      snapToSlot(flightAEnd + config.FLIGHT_BUFFER_MINS),
    )
    const flightBEnd = flightBStart + estimatePoolDuration(
      flightBPools, poolBaseline, flightBStrips, refs.refs_per_pool,
    ).actual_duration
    const flightARefs = Math.ceil(refs.refs_needed / 2)
    const flightBRefs = Math.floor(refs.refs_needed / 2)

    result.flight_a_start = poolStart
    result.flight_a_end = flightAEnd
    result.flight_a_strips = flightAStrips
    result.flight_a_refs = flightARefs
    result.flight_b_start = flightBStart
    result.flight_b_end = flightBEnd
    result.flight_b_strips = flightBStrips
    result.flight_b_refs = flightBRefs
    result.pool_start = poolStart
    result.pool_end = flightBEnd
    result.pool_strip_count = flightAStrips + flightBStrips
    result.pool_refs_count = flightARefs + flightBRefs
    result.pool_duration_actual = (flightAEnd - poolStart) + (flightBEnd - flightBStart)
    poolEnd = flightBEnd
  } else {
    const poolStrips = grantedStrips(poolStructure.n_pools, poolCap, placement.strip_count)
    poolEnd = poolStart + estimatePoolDuration(
      poolStructure.n_pools, poolBaseline, poolStrips, refs.refs_per_pool,
    ).actual_duration

    result.pool_start = poolStart
    result.pool_end = poolEnd
    result.pool_strip_count = poolStrips
    result.pool_refs_count = refs.refs_needed
    result.pool_duration_actual = poolEnd - poolStart
  }

  // DE block(s). The placement's strip budget covers the pool block only — DE
  // phases carry their own footprint (deStripFootprint / de_round_of_16_strips).
  const deStart = snapToSlot(poolEnd + config.ADMIN_GAP_MINS)
  const deDesired = deStripFootprint(bracketSize, config.DEFAULT_DE_STRIP_FOOTPRINT)
  let terminalEnd: number

  if (competition.de_mode === DeMode.SINGLE_STAGE) {
    const deStrips = grantedStrips(deDesired, deCap)
    const deDuration = deSingleStageDuration(totalDeBase, bracketSize, deStrips, deDesired)

    result.de_start = deStart
    result.de_end = deStart + deDuration
    result.de_strip_count = deStrips
    result.de_duration_actual = deDuration
    terminalEnd = result.de_end
  } else {
    const blocks = deBlockDurations(bracketSize, totalDeBase)
    let segmentStart = deStart

    if (dePhasesForBracket(bracketSize).includes(Phase.DE_PRELIMS)) {
      const prelimsStrips = grantedStrips(deDesired, deCap)
      const prelimsDuration = deStagedPhaseDuration(
        blocks.prelims_dur, prelimsStrips, deDesired,
      )
      result.de_prelims_start = segmentStart
      result.de_prelims_end = segmentStart + prelimsDuration
      result.de_prelims_strip_count = prelimsStrips
      result.de_duration_actual += prelimsDuration
      segmentStart = snapToSlot(result.de_prelims_end + config.ADMIN_GAP_MINS)
    }

    const r16Desired = competition.de_round_of_16_strips
    const r16Strips = grantedStrips(r16Desired, deCap)
    const r16Duration = deStagedPhaseDuration(blocks.r16_dur, r16Strips, r16Desired)

    result.de_round_of_16_start = segmentStart
    result.de_round_of_16_end = segmentStart + r16Duration
    result.de_round_of_16_strip_count = r16Strips
    result.de_duration_actual += r16Duration
    terminalEnd = result.de_round_of_16_end
  }

  result.de_total_end = terminalEnd + tailEstimateMins(competition.event_type)

  return {
    result,
    day_out_of_range: placement.day < 0 || placement.day >= config.days_available,
  }
}
