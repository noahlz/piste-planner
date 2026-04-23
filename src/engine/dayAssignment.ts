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
  Phase,
  dayStart,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, PoolStructure } from './types.ts'
import { crossoverPenalty } from './crossover.ts'
import { earliestResourceWindow, snapToSlot } from './resources.ts'

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
 * - video_scarcity: for STAGED_DE + REQUIRED video — ratio of video comps to video strips
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

  const videoCompsRequiring = allCompetitions.filter(
    c => c.de_mode === DeMode.STAGED && c.de_video_policy === VideoPolicy.REQUIRED,
  ).length
  const videoScarcity =
    competition.de_mode === DeMode.STAGED &&
    competition.de_video_policy === VideoPolicy.REQUIRED
      ? videoCompsRequiring / Math.max(config.video_strips_total, 1)
      : 0

  return crossoverCount + windowTightness + videoScarcity
}

// ──────────────────────────────────────────────
// saberPileupPenalty — METHODOLOGY.md §Scheduling Algorithm / §Saber Pileup
// ──────────────────────────────────────────────

/**
 * Penalty table indexed by how many OTHER saber events are already assigned
 * to the candidate day. Index 0 means no other saber events (no penalty).
 * Index 4+ clamps to table[4] = 50.0.
 */
export const SABER_PILEUP_PENALTY_TABLE = [0, 0.5, 2.0, 10.0, 50.0] as const

/**
 * Returns a penalty for placing a SABRE competition on a day that already
 * has many other SABRE competitions. Non-saber events always return 0.
 *
 * The penalty grows steeply to discourage piling saber events onto a single
 * day, since saber refs are three-weapon specialists and are naturally scarce.
 */
export function saberPileupPenalty(
  competition: Competition,
  candidateDay: number,
  assignments: Map<string, number>,
  allCompetitions: Competition[],
): number {
  if (competition.weapon !== Weapon.SABRE) return 0

  let count = 0
  for (const c of allCompetitions) {
    if (c.id === competition.id) continue
    if (c.weapon !== Weapon.SABRE) continue
    if (assignments.get(c.id) === candidateDay) count++
  }

  const idx = Math.min(count, SABER_PILEUP_PENALTY_TABLE.length - 1)
  return SABER_PILEUP_PENALTY_TABLE[idx]
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
  _poolStructure: PoolStructure,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
): number | null {
  const thisDayStart = dayStart(day, config)
  const latestStart = thisDayStart + config.LATEST_START_OFFSET
  const maxSlots = Math.ceil(config.LATEST_START_OFFSET / config.SLOT_MINS)

  const videoRequired = competition.de_video_policy === VideoPolicy.REQUIRED

  let slot = snapToSlot(thisDayStart)
  let attempts = 0

  while (slot <= latestStart && attempts < maxSlots) {
    attempts++

    const result = earliestResourceWindow(
      competition.strips_allocated,
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
