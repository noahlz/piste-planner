/**
 * Day capacity estimation functions.
 *
 * Provides strip-hour budgets for competitions and days.
 * Strip-hours = strips × hours; a proxy for how much of a day's scheduling
 * capacity a competition consumes. Used as input to capacity-aware day assignment.
 *
 * DE strip-hours bill one strip for one bout time per DE bout (METHODOLOGY.md
 * §DE Capacity Estimation), individual and team events alike. There is no
 * configurable estimation model. General and video strip-hours are disjoint
 * budgets: a staged event's video-stage bouts bill video only.
 */

import { Category, EventType } from './types.ts'
import type { Competition, DeRound, TournamentConfig, GlobalState } from './types.ts'
import { CATEGORY_START_PREFERENCE } from './constants.ts'
import { computePoolStructure, weightedPoolDuration } from './pools.ts'
import { deBlocksFor } from './de.ts'

interface CompetitionStripHours {
  /**
   * General strip-hours consumed by this competition: pools plus the DE bouts
   * that run on general strips. A STAGED event's video-stage bouts are not in
   * it (METHODOLOGY.md §DE Capacity Estimation).
   */
  total_strip_hours: number
  /** Strip-hours of the STAGED video block (video-stage round through the semis). */
  video_strip_hours: number
}

interface DayConsumedCapacity {
  strip_hours_consumed: number
  video_strip_hours_consumed: number
}

interface DayRemainingCapacity {
  strip_hours_remaining: number
  video_strip_hours_remaining: number
}

/** Strip-hours `rounds` bill: one strip for one bout time per bout. */
function deBoutStripHours(rounds: readonly DeRound[], boutMinutes: number): number {
  return rounds.reduce((sum, { bouts }) => sum + bouts, 0) * boutMinutes / 60
}

/**
 * Estimates strip-hours consumed by a single competition.
 *
 * Pool strip-hours: n_pools × weightedPoolDuration / 60
 *   Each pool runs on its own strip simultaneously; the number of pools is
 *   the parallel strip demand for the pool phase.
 *
 * DE strip-hours: DE bouts × bout_minutes / 60 (METHODOLOGY.md §DE Capacity
 * Estimation), counted from the first bracket round through the semis with
 * byes not counted, whatever strip count the scheduler grants. Each bout bills
 * one budget:
 * - Individual SINGLE_STAGE: every bout bills `total_strip_hours`.
 * - Individual STAGED: the prelims (rounds above the video-stage round) bill
 *   `total_strip_hours`, and the video-stage round through the semis bills
 *   only `video_strip_hours`. A bracket at or below its video-stage round has
 *   no prelims bill (§DE Phase Breakdown).
 * - Team: every match bills `total_strip_hours` at the team match time and
 *   none bills video, whatever the DE mode (§DE Capacity Estimation → Team
 *   Events; Ops Manual p.19 – teams have video only for the gold/bronze).
 *   METHODOLOGY's `teamDeStripHours` is this same model.
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

  // `general` is every round for SINGLE_STAGE and the prelims for STAGED;
  // `video` is empty unless STAGED. A team event folds any video rounds back
  // into general, so a team under a STAGED setting still bills no video.
  const { general, video, boutMinutes } = deBlocksFor(competition, config)
  const isTeam = competition.event_type === EventType.TEAM
  const generalRounds = isTeam ? [...general, ...video] : general
  const videoRounds = isTeam ? [] : video

  return {
    total_strip_hours: pool_strip_hours + deBoutStripHours(generalRounds, boutMinutes),
    video_strip_hours: deBoutStripHours(videoRounds, boutMinutes),
  }
}

/**
 * Sums `estimateCompetitionStripHours` over `competitions`, skipping any
 * competition outside `MIN_FENCERS`–`MAX_FENCERS`. This is the tournament's
 * one aggregate strip-hours fact: `validateFeasibility`'s shortfall message
 * and the Suggest search's floor (012 research.md D2) both read it here
 * rather than each summing the list a second time. The filter is part of the
 * fact — dropping it would make the floor disagree with the warning printed
 * beside it.
 */
export function aggregateStripHours(
  competitions: Competition[],
  config: TournamentConfig,
): { total_strip_hours: number; video_strip_hours: number } {
  let total_strip_hours = 0
  let video_strip_hours = 0
  for (const c of competitions) {
    if (c.fencer_count < config.MIN_FENCERS || c.fencer_count > config.MAX_FENCERS) continue
    const e = estimateCompetitionStripHours(c, config)
    total_strip_hours += e.total_strip_hours
    video_strip_hours += e.video_strip_hours
  }
  return { total_strip_hours, video_strip_hours }
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
