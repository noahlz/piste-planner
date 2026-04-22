/**
 * Schedule One Competition — METHODOLOGY.md §Scheduling Algorithm Phase 5
 *
 * Core single-competition scheduler. Thin orchestrator over phase schedulers
 * defined in phaseSchedulers.ts. Retains the retry loop, snapshot/restore,
 * same-day validation, and deadline checks from the original implementation.
 */

import {
  DeMode,
  Phase,
  BottleneckCause,
  BottleneckSeverity,
  dayStart,
  dayEnd,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, ScheduleResult, PoolStructure, EventTxLog } from './types.ts'
import {
  computePoolStructure,
  weightedPoolDuration,
  computeDeFencerCount,
} from './pools.ts'
import { computeBracketSize, calculateDeDuration, dePhasesForBracket } from './de.ts'
import { snapToSlot, snapshotState, restoreState } from './resources.ts'
import { findEarlierSlotSameDay, SchedulingError } from './dayAssignment.ts'
import {
  schedulePoolPhase,
  scheduleSingleStageDePhase,
  scheduleDePrelimsPhase,
  scheduleR16Phase,
  scheduleDeFinalsPhase,
  scheduleBronzePhase,
} from './phaseSchedulers.ts'
import { EventType, VideoPolicy } from './types.ts'

export function scheduleCompetition(
  competition: Competition,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
): ScheduleResult {
  const notBeforeBase = Math.max(competition.earliest_start, dayStart(day, config))

  const bracketSize = computeBracketSize(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )
  const totalDeBase = calculateDeDuration(competition.weapon, bracketSize, config.de_duration_table)
  const promotedFencerCount = computeDeFencerCount(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )

  // ── Pool phase baseline (for result shell) ──
  const poolStructure = computePoolStructure(competition.fencer_count, competition.use_single_pool_override)
  const wDuration = weightedPoolDuration(poolStructure, competition.weapon, config.pool_round_duration_table)

  // Build the initial schedule result shell
  const result: ScheduleResult = {
    competition_id: competition.id,
    assigned_day: day,
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
    promoted_fencer_count: promotedFencerCount,
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
    de_finals_start: null,
    de_finals_end: null,
    de_finals_strip_count: 0,
    de_bronze_start: null,
    de_bronze_end: null,
    de_bronze_strip_id: null,
    de_total_end: null,
    conflict_score: 0,
    pool_duration_baseline: wDuration,
    pool_duration_actual: 0,
    de_duration_baseline: totalDeBase,
    de_duration_actual: 0,
    constraint_relaxation_level: 0,
    accepted_warnings: [],
  }

  // Deadline check + pool allocation retry loop
  let rescheduleAttempts = 0
  const MAX_ATTEMPTS = config.MAX_RESCHEDULE_ATTEMPTS
  let notBefore = notBeforeBase

  // This loop implements the GOTO retry_from_pool_allocation pattern from METHODOLOGY.md §Scheduling Algorithm Phase 5.
  // Each iteration re-runs pool + DE allocation with a potentially earlier notBefore.
  // On retry, we must restore resource state to avoid leaking strips/refs from the
  // failed attempt — otherwise subsequent attempts see phantom resource occupancy.
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    // Snapshot mutable state so we can roll back on retry
    const snapshot = snapshotState(state)
    let txLog: EventTxLog = { stripChanges: [], refIntervalIdxs: [] }

    // ── POOL PHASE ──
    // schedulePoolPhase handles team/individual sequencing internally
    const { poolEnd } = schedulePoolPhase(
      competition, day, notBefore, state, config, allCompetitions, result, txLog,
    )

    // ── DEADLINE CHECK (post-pool) ──
    {
      const check = checkDeadline(poolEnd > dayEnd(day, config), competition, poolStructure, day, state, config, snapshot, rescheduleAttempts, MAX_ATTEMPTS, 'pools')
      rescheduleAttempts = check.rescheduleAttempts
      if (check.result.action === 'retry') { notBefore = check.result.notBefore; continue }
      if (check.result.action === 'throw') throw check.result.error
    }

    // ── ADMIN GAP ──
    const deNotBefore = snapToSlot(poolEnd + config.ADMIN_GAP_MINS)

    // Reset txLog for DE phase (pool txLog is not needed separately — rollback uses snapshotState)
    txLog = { stripChanges: [], refIntervalIdxs: [] }

    // ── DE PHASE ──
    if (competition.de_mode === DeMode.SINGLE_STAGE) {
      const { deEnd, deStripIndices } = scheduleSingleStageDePhase(
        competition, day, deNotBefore, state, config, result, txLog,
      )
      // Bronze bout for TEAM events — runs alongside the gold bout on a separate strip.
      // finalsStart = de_start (result was just populated), finalsEnd = deEnd.
      if (competition.event_type === EventType.TEAM) {
        const deStart = result.de_start!
        scheduleBronzePhase(competition, day, deStart, deEnd, deStripIndices, state, config, result, txLog, false)
      }
    } else {
      // STAGED: prelims (bracket >= 64) → R16 → finals → (optional bronze)
      const phases = dePhasesForBracket(bracketSize)
      let stagedNotBefore = deNotBefore
      let totalActual = 0

      if (phases.includes(Phase.DE_PRELIMS)) {
        const { prelimsEnd } = scheduleDePrelimsPhase(
          competition, day, stagedNotBefore, state, config, result, txLog,
        )
        totalActual += (result.de_prelims_end! - result.de_prelims_start!)
        stagedNotBefore = prelimsEnd
      }

      const { r16End } = scheduleR16Phase(
        competition, day, stagedNotBefore, state, config, result, txLog,
      )
      totalActual += (result.de_round_of_16_end! - result.de_round_of_16_start!)

      const { finalsEnd, finalsStripIndices } = scheduleDeFinalsPhase(
        competition, day, r16End, state, config, result, txLog,
      )
      totalActual += (result.de_finals_end! - result.de_finals_start!)

      result.de_duration_actual = totalActual
      result.de_total_end = finalsEnd

      // Bronze bout for TEAM events — runs alongside the gold bout on a separate strip.
      // finalsStart = de_finals_start (just populated), finalsEnd = finalsEnd.
      if (competition.event_type === EventType.TEAM) {
        const policy = competition.de_video_policy
        const finalsVideoRequired = policy === VideoPolicy.REQUIRED || policy === VideoPolicy.FINALS_ONLY
        const finStart = result.de_finals_start!
        scheduleBronzePhase(competition, day, finStart, finalsEnd, finalsStripIndices, state, config, result, txLog, finalsVideoRequired)
      }
    }

    // ── SAME-DAY VALIDATION ──
    const deTotalEnd = result.de_total_end ?? result.de_end ?? poolEnd

    // HARD: entire competition must complete on the assigned day.
    // which_day check: if DE end falls past the start of the next day, it's unrecoverable.
    const nextDayStart = dayStart(day + 1, config)
    if (deTotalEnd >= nextDayStart) {
      // Restore state before throwing so caller doesn't see phantom allocations
      restoreState(state, snapshot)
      throw new SchedulingError(
        BottleneckCause.SAME_DAY_VIOLATION,
        `${competition.id} DE ends at ${deTotalEnd} — crosses day ${day} boundary (next day starts at ${nextDayStart})`,
      )
    }

    // ── DEADLINE CHECK (post-DE) ──
    {
      const deOverrun = deTotalEnd > dayEnd(day, config) || deTotalEnd > competition.latest_end
      const check = checkDeadline(deOverrun, competition, poolStructure, day, state, config, snapshot, rescheduleAttempts, MAX_ATTEMPTS, 'DE overrun')
      rescheduleAttempts = check.rescheduleAttempts
      if (check.result.action === 'retry') { notBefore = check.result.notBefore; continue }
      if (check.result.action === 'throw') throw check.result.error
    }

    // Success — record and return
    state.schedule[competition.id] = result
    return result
  }

  // Should never reach here due to throws above, but satisfy TypeScript
  throw new SchedulingError(
    BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    `Scheduling failed for ${competition.id} — loop exhausted`,
  )
}

// ──────────────────────────────────────────────
// Deadline check helper — shared by post-pool and post-DE checks
// ──────────────────────────────────────────────

type DeadlineAction = { action: 'ok' } | { action: 'retry'; notBefore: number } | { action: 'throw'; error: SchedulingError }

function checkDeadline(
  overrun: boolean,
  competition: Competition,
  poolStructure: PoolStructure,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  snapshot: GlobalState,
  rescheduleAttempts: number,
  maxAttempts: number,
  context: string,
): { result: DeadlineAction; rescheduleAttempts: number } {
  if (!overrun) {
    return { result: { action: 'ok' }, rescheduleAttempts }
  }

  rescheduleAttempts++

  if (rescheduleAttempts > maxAttempts) {
    restoreState(state, snapshot)
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DEADLINE_CHECK,
      cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: `Exhausted ${maxAttempts} reschedule attempts for ${competition.id}${context === 'pools' ? '' : ` (${context})`}`,
    })
    return {
      result: {
        action: 'throw',
        error: new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `Exhausted ${maxAttempts} reschedule attempts for ${competition.id}${context === 'pools' ? '' : ` (${context})`}`,
        ),
      },
      rescheduleAttempts,
    }
  }

  const earlierSlot = findEarlierSlotSameDay(competition, poolStructure, day, state, config)

  if (earlierSlot !== null) {
    // Restore resource state before retrying — prevents leaked allocations
    restoreState(state, snapshot)
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DEADLINE_CHECK,
      cause: BottleneckCause.DEADLINE_BREACH,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `Rescheduled to earlier slot (attempt ${rescheduleAttempts}${context === 'pools' ? '' : `, ${context}`})`,
    })
    return { result: { action: 'retry', notBefore: earlierSlot }, rescheduleAttempts }
  }

  // Restore state before throwing so caller doesn't see phantom allocations
  restoreState(state, snapshot)
  state.bottlenecks.push({
    competition_id: competition.id,
    phase: Phase.DEADLINE_CHECK,
    cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    severity: BottleneckSeverity.ERROR,
    delay_mins: 0,
    message: `No earlier slot found for ${competition.id} on day ${day}${context === 'pools' ? '' : ` (${context})`}`,
  })
  return {
    result: {
      action: 'throw',
      error: new SchedulingError(
        BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
        `No earlier slot found for ${competition.id} on day ${day}${context === 'pools' ? '' : ` (${context})`}`,
      ),
    },
    rescheduleAttempts,
  }
}
