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
 * The canvas uses this only for events moved by hand and while the board is
 * stale (017). After a run, kept events draw the scheduler's own times, waits
 * included, so the DE here starts at pool end plus the admin gap, earlier than
 * the scheduler's on a busy day.
 *
 * Three `ScheduleResult` fields have no input derivation and are left neutral:
 * `conflict_score`, `constraint_relaxation_level`, `accepted_warnings`. They
 * are scheduler diagnostics about contention, not geometry.
 */

import { DAY_AXIS_SPACING_MINS, DeMode, PlacementSource, tailEstimateMins } from './types.ts'
import type { Competition, DeRound, Placement, ScheduleResult, TournamentConfig } from './types.ts'
import { snapToSlot } from './resources.ts'
import {
  computePoolStructure,
  computeDeFencerCount,
  estimatePoolDuration,
  isSizeableCount,
  resolveRefsPerPool,
  weightedPoolDuration,
} from './pools.ts'
import { deBlocksFor, deRoundsMinutes } from './de.ts'
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
 * Strips a DE block draws. A block with no counted round – a bracket of 2 –
 * draws none and takes 0 minutes (METHODOLOGY.md §DE Duration 'No counted
 * round'), matching `concurrentScheduler`'s `hasNoCountedRound`. Keyed to the
 * rounds, so the 1-strip floor still holds for every other block (024 plan D5).
 */
function grantedDeStrips(rounds: readonly DeRound[], desired: number, deCap: number): number {
  return rounds.length === 0 ? 0 : grantedStrips(desired, deCap)
}

/**
 * The placement a scheduler result becomes: its day, its pool start, and its
 * pool strip budget, marked auto and unpinned. `runScheduleAll` records these,
 * and the kept run keys its results by them (`keptRun.ts`).
 *
 * `result.pool_start` is on the scheduler axis, where day d's times are
 * shifted by d × DAY_AXIS_SPACING_MINS. That shift comes back off here, since
 * a placement's `start_time` is on its own day's clock axis. A Placement has
 * no way to say "somewhere on this day, time unknown", so a result with no
 * pool start has none (null).
 */
export function placementFromResult(result: ScheduleResult): Placement | null {
  if (result.pool_start === null) return null
  return {
    day: result.assigned_day,
    start_time: result.pool_start - result.assigned_day * DAY_AXIS_SPACING_MINS,
    strip_count: result.pool_strip_count,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
  }
}

/**
 * Computes one event's schedule geometry from its placement. Never throws on an
 * out-of-range day — durations are a function of (competition, config, strip
 * budget) only, so an impossible day changes the flag, not the blocks.
 *
 * `null` for a fencer count `isSizeableCount` rejects: there are no pools to
 * lay out, so the event has no geometry and every caller counts it not placed
 * (018 T4). Its `fencer-count-bounds` ERROR is validation's to report.
 */
export function deriveEventSchedule(
  placement: Placement,
  competition: Competition,
  config: TournamentConfig,
): DerivedEventSchedule | null {
  if (!isSizeableCount(competition.fencer_count, config)) return null
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
  const deBlocks = deBlocksFor(competition, config)

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
    bracket_size: deBlocks.bracketSize,
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
    de_duration_baseline: deBlocks.baselineMinutes,
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
  // phases carry their own asks (deBlocksFor: generalAsk / videoAsk), and each
  // block's length is derived per round at the strips it draws.
  const deStart = snapToSlot(poolEnd + config.ADMIN_GAP_MINS)
  const { general, video, generalAsk, videoAsk, boutMinutes } = deBlocks
  let terminalEnd: number

  if (competition.de_mode === DeMode.SINGLE_STAGE) {
    const deStrips = grantedDeStrips(general, generalAsk, deCap)
    const deDuration = deRoundsMinutes(general, deStrips, boutMinutes)

    result.de_start = deStart
    result.de_end = deStart + deDuration
    result.de_strip_count = deStrips
    result.de_duration_actual = deDuration
    terminalEnd = result.de_end
  } else {
    let segmentStart = deStart

    if (general.length > 0) {
      const prelimsStrips = grantedStrips(generalAsk, deCap)
      const prelimsDuration = deRoundsMinutes(general, prelimsStrips, boutMinutes)
      result.de_prelims_start = segmentStart
      result.de_prelims_end = segmentStart + prelimsDuration
      result.de_prelims_strip_count = prelimsStrips
      result.de_duration_actual += prelimsDuration
      segmentStart = snapToSlot(result.de_prelims_end + config.ADMIN_GAP_MINS)
    }

    const r16Strips = grantedDeStrips(video, videoAsk, deCap)
    const r16Duration = deRoundsMinutes(video, r16Strips, boutMinutes)

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

/** A competition's estimated size before it has a placement — the dock's chip. */
export interface EventFootprint {
  strips: number
  poolMinutes: number
  deMinutes: number
}

/**
 * Estimates a competition's footprint with no placement yet: the strips its
 * pool round would draw, how long the pool block runs, and how long the DE
 * block runs after it. Built by deriving a synthetic placement — day 0, the
 * day's clock start, one strip per pool — through the same
 * `deriveEventSchedule` the canvas uses once an event is actually placed, so
 * the dock's chip and the canvas's block are never computed by two different
 * formulas that could disagree.
 *
 * `deMinutes` is `de_total_end − de_start` for a single-stage DE. Staged DE
 * never populates `de_start` (see the branch above); its DE start is the
 * first staged phase instead, `de_prelims_start` when the bracket stages
 * prelims, else `de_round_of_16_start`.
 *
 * `null` when `deriveEventSchedule` gives no result: a count the engine
 * cannot size has no footprint (018 T4).
 */
export function estimateEventFootprint(
  competition: Competition,
  config: TournamentConfig,
): EventFootprint | null {
  if (!isSizeableCount(competition.fencer_count, config)) return null
  const poolStructure = computePoolStructure(
    competition.fencer_count,
    competition.use_single_pool_override,
  )
  const placement: Placement = {
    day: 0,
    start_time: config.dayConfigs[0]?.day_start_time ?? config.DAY_START_MINS,
    strip_count: poolStructure.n_pools,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
  }
  const derived = deriveEventSchedule(placement, competition, config)
  if (derived === null) return null
  const { result } = derived
  const deStart = result.de_start ?? result.de_prelims_start ?? result.de_round_of_16_start

  return {
    strips: result.pool_strip_count,
    poolMinutes: (result.pool_end ?? 0) - (result.pool_start ?? 0),
    deMinutes: (result.de_total_end ?? 0) - (deStart ?? 0),
  }
}
