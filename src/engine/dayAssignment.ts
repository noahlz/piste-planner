/**
 * Day Assignment Engine — METHODOLOGY.md §Scheduling Algorithm / §Capacity-Aware Day Assignment
 *
 * Answers: which day should this competition be scheduled on?
 * Uses penalty scoring with constraint relaxation to find the best valid day.
 */
import {
  Weapon,
  DeMode,
  VideoPolicy,
  RefPolicy,
  Phase,
  dayStart,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, PoolStructure } from './types.ts'
import { crossoverPenalty } from './crossover.ts'
import { refsAvailableOnDay } from './refs.ts'
import { earliestResourceWindow, snapToSlot } from './resources.ts'
import { resolveRefsPerPool } from './pools.ts'

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
