/**
 * Schedule One Competition — METHODOLOGY.md §Scheduling Algorithm Phase 5
 *
 * Core single-competition scheduler. Given a competition, mutable global state,
 * tournament config, and the full competition list, assigns a day, allocates
 * resources for pool and DE phases, and records the result in state.
 */

import {
  EventType,
  DeMode,
  VideoPolicy,
  Phase,
  BottleneckCause,
  BottleneckSeverity,
  dayStart,
  dayEnd,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, ScheduleResult, PoolStructure, RefResolution } from './types.ts'
import {
  computePoolStructure,
  resolveRefsPerPool,
  estimatePoolDuration,
  weightedPoolDuration,
  computeDeFencerCount,
} from './pools.ts'
import { computeBracketSize, calculateDeDuration, dePhasesForBracket, deBlockDurations } from './de.ts'
import { refsAvailableOnDay } from './refs.ts'
import { findIndividualCounterpart } from './crossover.ts'
import { earliestResourceWindow, allocateStrips, allocateRefs, snapToSlot, snapshotState, restoreState, type NoWindowReason } from './resources.ts'
import { findEarlierSlotSameDay, SchedulingError } from './dayAssignment.ts'
import { computeStripCap } from './stripBudget.ts'

function formatTime(mins: number): string {
  if (!isFinite(mins)) return 'never'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

/**
 * Translates a NO_WINDOW reason into an INFO-severity diagnostic bottleneck
 * so users see why a specific resource window search failed.
 */
function emitNoWindowDiagnostic(
  reason: NoWindowReason | undefined,
  competitionId: string,
  phase: Phase,
  day: number,
  state: GlobalState,
): void {
  if (!reason) return

  let message: string
  switch (reason.kind) {
    case 'STRIPS':
      message = `${competitionId} ${phase} on day ${day + 1}: need ${reason.needed} strips, ${reason.available} free, earliest free at ${formatTime(reason.earliest_free)}`
      break
    case 'REFS':
      message = `${competitionId} ${phase} on day ${day + 1}: need ${reason.needed} refs, ${reason.available} available, next release at ${formatTime(reason.earliest_free)}`
      break
    case 'TIME':
      message = `${competitionId} ${phase} on day ${day + 1}: candidate ${formatTime(reason.candidate)} exceeds latest start ${formatTime(reason.latest_start)}`
      break
  }

  state.bottlenecks.push({
    competition_id: competitionId,
    phase,
    cause: BottleneckCause.NO_WINDOW_DIAGNOSTIC,
    severity: BottleneckSeverity.INFO,
    delay_mins: 0,
    message,
  })
}

export function scheduleCompetition(
  competition: Competition,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
): ScheduleResult {
  const poolStructure = computePoolStructure(competition.fencer_count, competition.use_single_pool_override)
  let notBefore = Math.max(competition.earliest_start, dayStart(day, config))

  // If team event, enforce individual-first ordering on same day (same weapon)
  if (competition.event_type === EventType.TEAM) {
    const ind = findIndividualCounterpart(competition, allCompetitions)
    if (ind && state.schedule[ind.id] && state.schedule[ind.id].assigned_day === day) {
      const indResult = state.schedule[ind.id]
      const indEnd = indResult.de_total_end ?? indResult.pool_end ?? dayStart(day, config)
      const sequencedStart = snapToSlot(indEnd + config.INDIV_TEAM_MIN_GAP_MINS)
      if (sequencedStart > notBefore) {
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: Phase.SEQUENCING,
          cause: BottleneckCause.SEQUENCING_CONSTRAINT,
          severity: BottleneckSeverity.INFO,
          delay_mins: sequencedStart - notBefore,
          message: `${competition.id} delayed to ${sequencedStart} — must follow ${ind.id} + ${config.INDIV_TEAM_MIN_GAP_MINS}min gap`,
        })
        notBefore = sequencedStart
      }
    }
  }

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

  // ── POOL PHASE ───────────────────────────────────────────
  const availRefs = refsAvailableOnDay(day, competition.weapon, config)
  const refRes = resolveRefsPerPool(competition.ref_policy, poolStructure.n_pools, availRefs)
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

  // This loop implements the GOTO retry_from_pool_allocation pattern from METHODOLOGY.md §Scheduling Algorithm Phase 5.
  // Each iteration re-runs pool + DE allocation with a potentially earlier notBefore.
  // On retry, we must restore resource state to avoid leaking strips/refs from the
  // failed attempt — otherwise subsequent attempts see phantom resource occupancy.
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    // Snapshot mutable state so we can roll back on retry
    const snapshot = snapshotState(state)

    let poolEnd: number

    if (competition.flighted && competition.flighting_group_id === null) {
      // ── Standalone flighted ──
      poolEnd = allocateFlightedPools(competition, poolStructure, refRes, wDuration, notBefore, day, state, config, result)
    } else {
      // ── Non-flighted (or flighting group — treated as non-flighted for pool allocation) ──
      poolEnd = allocateNonFlightedPools(competition, poolStructure, refRes, wDuration, notBefore, day, state, config, result)
    }

    // ── DEADLINE CHECK (post-pool) ──
    {
      const check = checkDeadline(poolEnd > dayEnd(day, config), competition, poolStructure, day, state, config, snapshot, rescheduleAttempts, MAX_ATTEMPTS, 'pools')
      rescheduleAttempts = check.rescheduleAttempts
      if (check.result.action === 'retry') { notBefore = check.result.notBefore; continue }
      if (check.result.action === 'throw') throw check.result.error
    }

    // ── ADMIN GAP ──
    const deNotBefore = snapToSlot(poolEnd + config.ADMIN_GAP_MINS)

    // ── DE PHASE ──
    if (competition.de_mode === DeMode.SINGLE_STAGE) {
      executeSingleBlockDe(competition, bracketSize, totalDeBase, deNotBefore, day, state, config, result)
    } else {
      executeThreeBlockDe(competition, bracketSize, totalDeBase, deNotBefore, day, state, config, result)
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
// Flighted pool allocation (standalone, not paired)
// ──────────────────────────────────────────────

function allocateFlightedPools(
  competition: Competition,
  poolStructure: ReturnType<typeof computePoolStructure>,
  refRes: ReturnType<typeof resolveRefsPerPool>,
  wDuration: number,
  notBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  result: ScheduleResult,
): number {
  const flightAPools = Math.ceil(poolStructure.n_pools / 2)
  const flightBPools = Math.floor(poolStructure.n_pools / 2)
  const availRefs = refsAvailableOnDay(day, competition.weapon, config)

  const effectiveCap = computeStripCap(
    config.strips_total,
    config.max_pool_strip_pct,
    competition.max_pool_strip_pct_override,
  )

  // Compute per-flight durations using half the pools
  const flightADur = estimatePoolDuration(
    flightAPools, wDuration,
    effectiveCap, availRefs, refRes.refs_per_pool,
  )
  const flightBDur = estimatePoolDuration(
    flightBPools, wDuration,
    effectiveCap, availRefs, refRes.refs_per_pool,
  )

  const flightARefsNeeded = Math.ceil(refRes.refs_needed / 2)
  const flightBRefsNeeded = Math.floor(refRes.refs_needed / 2)

  // Flight A
  const windowA = earliestResourceWindow(
    flightAPools, flightARefsNeeded,
    competition.weapon, false, notBefore, day,
    state, config, competition.id, Phase.FLIGHT_A,
  )
  if (windowA.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(windowA.reason, competition.id, Phase.FLIGHT_A, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} Flight A on day ${day}`,
    )
  }
  state.bottlenecks.push(...windowA.bottlenecks)

  const Ta = windowA.startTime
  const flightAEnd = Ta + flightADur.actual_duration
  allocateStrips(state, windowA.stripIndices, flightAEnd)
  allocateRefs(state, day, competition.weapon, flightARefsNeeded, Ta, flightAEnd)

  result.flight_a_start = Ta
  result.flight_a_end = flightAEnd
  result.flight_a_strips = windowA.stripIndices.length
  result.flight_a_refs = flightARefsNeeded
  result.pool_start = Ta

  // Flight B: starts after Flight A + buffer
  const flightBIdeal = snapToSlot(flightAEnd + config.FLIGHT_BUFFER_MINS)

  // HARD: Flight B must start on the same day as Flight A
  if (flightBIdeal >= dayEnd(day, config)) {
    throw new SchedulingError(
      BottleneckCause.SAME_DAY_VIOLATION,
      `${competition.id} Flight B start (${flightBIdeal}) crosses day ${day} boundary`,
    )
  }

  const windowB = earliestResourceWindow(
    flightBPools, flightBRefsNeeded,
    competition.weapon, false, flightBIdeal, day,
    state, config, competition.id, Phase.FLIGHT_B,
  )
  if (windowB.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(windowB.reason, competition.id, Phase.FLIGHT_B, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} Flight B on day ${day}`,
    )
  }
  state.bottlenecks.push(...windowB.bottlenecks)

  const Tb = windowB.startTime
  const flightBEnd = Tb + flightBDur.actual_duration

  // Emit FLIGHT_B_DELAYED if pushed back beyond buffer + threshold
  if (Tb > flightBIdeal + config.THRESHOLD_MINS) {
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.FLIGHT_B,
      cause: BottleneckCause.FLIGHT_B_DELAYED,
      severity: BottleneckSeverity.WARN,
      delay_mins: Tb - flightBIdeal,
      message: `${competition.id} Flight B delayed ${Tb - flightBIdeal} min past ideal start`,
    })
  }

  allocateStrips(state, windowB.stripIndices, flightBEnd)
  allocateRefs(state, day, competition.weapon, flightBRefsNeeded, Tb, flightBEnd)

  result.flight_b_start = Tb
  result.flight_b_end = flightBEnd
  result.flight_b_strips = windowB.stripIndices.length
  result.flight_b_refs = flightBRefsNeeded
  result.pool_end = flightBEnd
  result.pool_strip_count = windowA.stripIndices.length + windowB.stripIndices.length
  result.pool_refs_count = flightARefsNeeded + flightBRefsNeeded
  result.pool_duration_actual = flightADur.actual_duration + flightBDur.actual_duration

  return flightBEnd
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

// ──────────────────────────────────────────────
// Non-flighted pool allocation (non-flighted and flighting-group competitions)
// ──────────────────────────────────────────────

function allocateNonFlightedPools(
  competition: Competition,
  poolStructure: PoolStructure,
  refRes: RefResolution,
  wDuration: number,
  notBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  result: ScheduleResult,
): number {
  const availRefs = refsAvailableOnDay(day, competition.weapon, config)
  const effectiveCap = computeStripCap(
    config.strips_total,
    config.max_pool_strip_pct,
    competition.max_pool_strip_pct_override,
  )
  const poolDur = estimatePoolDuration(
    poolStructure.n_pools,
    wDuration,
    effectiveCap,
    availRefs,
    refRes.refs_per_pool,
  )
  result.pool_duration_actual = poolDur.actual_duration

  const window = earliestResourceWindow(
    poolDur.effective_parallelism,
    refRes.refs_needed,
    competition.weapon,
    false,
    notBefore,
    day,
    state,
    config,
    competition.id,
    Phase.POOLS,
  )

  if (window.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(window.reason, competition.id, Phase.POOLS, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window found for ${competition.id} pools on day ${day}`,
    )
  }

  const T = window.startTime
  const poolEnd = T + poolDur.actual_duration
  allocateStrips(state, window.stripIndices, poolEnd)
  allocateRefs(state, day, competition.weapon, refRes.refs_needed, T, poolEnd)
  state.bottlenecks.push(...window.bottlenecks)

  result.pool_start = T
  result.pool_end = poolEnd
  result.pool_strip_count = window.stripIndices.length
  result.pool_refs_count = refRes.refs_needed

  return poolEnd
}

// ──────────────────────────────────────────────
// SINGLE_STAGE DE execution — METHODOLOGY.md §DE Modes
// ──────────────────────────────────────────────

function executeSingleBlockDe(
  competition: Competition,
  bracketSize: number,
  totalDeBase: number,
  deNotBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  result: ScheduleResult,
): void {
  const deOptimal = Math.floor(bracketSize / 2)
  const deRefsNeeded = config.DE_REFS

  const deEffectiveCap = computeStripCap(
    config.strips_total,
    config.max_de_strip_pct,
    competition.max_de_strip_pct_override,
  )

  // Find resource window for DE
  const window = earliestResourceWindow(
    Math.min(deOptimal, deEffectiveCap),
    deRefsNeeded,
    competition.weapon,
    false, // SINGLE_STAGE never uses video
    deNotBefore,
    day,
    state,
    config,
    competition.id,
    'DE',
  )

  if (window.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(window.reason, competition.id, Phase.DE, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} DE on day ${day}`,
    )
  }
  state.bottlenecks.push(...window.bottlenecks)

  const deStart = window.startTime
  const deStrips = window.stripIndices.length
  const ratio = Math.min(deStrips / Math.max(deOptimal, 1), 1.0)
  const actualDur = ratio >= 1.0 ? totalDeBase : Math.ceil(totalDeBase / ratio)
  const deEnd = deStart + actualDur

  allocateStrips(state, window.stripIndices, deEnd)
  allocateRefs(state, day, competition.weapon, deRefsNeeded, deStart, deEnd)

  result.de_start = deStart
  result.de_end = deEnd
  result.de_strip_count = deStrips
  result.de_duration_actual = actualDur
  result.de_total_end = deEnd

  // Bronze bout for TEAM events — simultaneous with gold on separate strip
  if (competition.event_type === EventType.TEAM) {
    allocateBronzeBout(competition, deStart, deEnd, day, window.stripIndices, state, config, result, false)
  }
}

// ──────────────────────────────────────────────
// STAGED execution — METHODOLOGY.md §DE Phase Breakdown (for Staged DEs)
// ──────────────────────────────────────────────

function executeThreeBlockDe(
  competition: Competition,
  bracketSize: number,
  totalDeBase: number,
  deNotBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  result: ScheduleResult,
): void {
  const blocks = deBlockDurations(bracketSize, totalDeBase)
  const phases = dePhasesForBracket(bracketSize)
  const deOptimal = Math.floor(bracketSize / 2)

  // Per-block video requirements: FINALS_ONLY only enables video for finals/bronze,
  // not R16. REQUIRED enables video for all blocks (except prelims which never use video).
  const policy = competition.de_video_policy
  const r16VideoRequired = policy === VideoPolicy.REQUIRED
  const finalsVideoRequired = policy === VideoPolicy.REQUIRED || policy === VideoPolicy.FINALS_ONLY

  let currentStart = deNotBefore
  let totalActual = 0

  // ── DE_PRELIMS (bracket >= 64) ──
  if (phases.includes(Phase.DE_PRELIMS)) {
    const prelimsWindow = earliestResourceWindow(
      Math.min(deOptimal, config.strips_total),
      config.DE_REFS,
      competition.weapon,
      false, // prelims never use video regardless of policy
      currentStart,
      day,
      state,
      config,
      competition.id,
      Phase.DE_PRELIMS,
    )

    if (prelimsWindow.type === 'NO_WINDOW') {
      emitNoWindowDiagnostic(prelimsWindow.reason, competition.id, Phase.DE_PRELIMS, day, state)
      throw new SchedulingError(
        BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
        `No resource window for ${competition.id} DE_PRELIMS on day ${day}`,
      )
    }
    state.bottlenecks.push(...prelimsWindow.bottlenecks)

    const prelimsStart = prelimsWindow.startTime
    const prelimsStrips = prelimsWindow.stripIndices.length
    const prelimsRatio = prelimsStrips / Math.max(deOptimal, 1)
    const prelimsActual = snapToSlot(Math.ceil(blocks.prelims_dur / Math.max(prelimsRatio, 0.01)))
    const prelimsEnd = prelimsStart + prelimsActual

    allocateStrips(state, prelimsWindow.stripIndices, prelimsEnd)
    allocateRefs(state, day, competition.weapon, config.DE_REFS, prelimsStart, prelimsEnd)

    result.de_prelims_start = prelimsStart
    result.de_prelims_end = prelimsEnd
    result.de_prelims_strip_count = prelimsStrips
    totalActual += prelimsActual
    currentStart = prelimsEnd
  }

  // ── DE_ROUND_OF_16 ──
  const r16Target = competition.de_round_of_16_strips
  const r16Window = earliestResourceWindow(
    r16Target,
    config.DE_REFS * r16Target,
    competition.weapon,
    r16VideoRequired,
    currentStart,
    day,
    state,
    config,
    competition.id,
    Phase.DE_ROUND_OF_16,
  )

  if (r16Window.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(r16Window.reason, competition.id, Phase.DE_ROUND_OF_16, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} DE_ROUND_OF_16 on day ${day}`,
    )
  }
  state.bottlenecks.push(...r16Window.bottlenecks)

  const r16Start = r16Window.startTime
  const r16Strips = r16Window.stripIndices.length
  const r16Ratio = r16Strips / Math.max(r16Target, 1)
  const r16Actual = snapToSlot(Math.ceil(blocks.r16_dur / Math.max(r16Ratio, 0.01)))
  const r16End = r16Start + r16Actual

  allocateStrips(state, r16Window.stripIndices, r16End)
  allocateRefs(state, day, competition.weapon, r16Strips, r16Start, r16End)

  result.de_round_of_16_start = r16Start
  result.de_round_of_16_end = r16End
  result.de_round_of_16_strip_count = r16Strips
  totalActual += r16Actual

  // ── DE_FINALS ──
  const finTarget = competition.de_finals_strips
  const finWindow = earliestResourceWindow(
    finTarget,
    config.DE_REFS,
    competition.weapon,
    finalsVideoRequired,
    r16End, // continuous — no gap
    day,
    state,
    config,
    competition.id,
    Phase.DE_FINALS,
  )

  if (finWindow.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(finWindow.reason, competition.id, Phase.DE_FINALS, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} DE_FINALS on day ${day}`,
    )
  }
  state.bottlenecks.push(...finWindow.bottlenecks)

  const finStart = finWindow.startTime
  const finActual = Math.max(blocks.finals_dur, config.DE_FINALS_MIN_MINS)
  const finEnd = finStart + finActual

  allocateStrips(state, finWindow.stripIndices, finEnd)
  allocateRefs(state, day, competition.weapon, 1, finStart, finEnd)

  result.de_finals_start = finStart
  result.de_finals_end = finEnd
  result.de_finals_strip_count = finWindow.stripIndices.length
  totalActual += finActual

  result.de_duration_actual = totalActual
  result.de_total_end = finEnd

  // Bronze bout for TEAM events
  if (competition.event_type === EventType.TEAM) {
    allocateBronzeBout(competition, finStart, finEnd, day, finWindow.stripIndices, state, config, result, finalsVideoRequired)
  }
}

// ──────────────────────────────────────────────
// Bronze bout allocation (shared by SINGLE_STAGE and STAGED)
// ──────────────────────────────────────────────

function allocateBronzeBout(
  competition: Competition,
  finalsStart: number,
  finalsEnd: number,
  day: number,
  goldStripIndices: number[],
  state: GlobalState,
  config: TournamentConfig,
  result: ScheduleResult,
  videoRequired: boolean,
): void {
  const goldSet = new Set(goldStripIndices)

  // Try to find a free strip not used by gold
  const strips = config.strips
  const freeAt = state.strip_free_at

  let bronzeIdx: number | null = null

  if (videoRequired) {
    // Try video strips first (excluding gold)
    for (let i = 0; i < strips.length; i++) {
      if (goldSet.has(i)) continue
      if (strips[i].video_capable && freeAt[i] <= finalsStart) {
        bronzeIdx = i
        break
      }
    }
  } else {
    // Non-video preferred, then any strip (excluding gold)
    // Try non-video first
    for (let i = 0; i < strips.length; i++) {
      if (goldSet.has(i)) continue
      if (!strips[i].video_capable && freeAt[i] <= finalsStart) {
        bronzeIdx = i
        break
      }
    }
    // Fallback to video strips
    if (bronzeIdx === null) {
      for (let i = 0; i < strips.length; i++) {
        if (goldSet.has(i)) continue
        if (strips[i].video_capable && freeAt[i] <= finalsStart) {
          bronzeIdx = i
          break
        }
      }
    }
  }

  if (bronzeIdx === null) {
    // No free strip for bronze — emit bottleneck
    // Severity depends on video policy per METHODOLOGY.md §Video Replay Policy
    const severity = videoRequired ? BottleneckSeverity.WARN : BottleneckSeverity.INFO
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: Phase.DE_FINALS_BRONZE,
      cause: BottleneckCause.DE_FINALS_BRONZE_NO_STRIP,
      severity,
      delay_mins: 0,
      message: `No free strip for bronze bout of ${competition.id}`,
    })
    return
  }

  // Allocate bronze strip
  allocateStrips(state, [bronzeIdx], finalsEnd)

  // Allocate one ref for bronze — weapon-agnostic
  allocateRefs(state, day, competition.weapon, 1, finalsStart, finalsEnd)

  result.de_bronze_start = finalsStart
  result.de_bronze_end = finalsEnd
  result.de_bronze_strip_id = strips[bronzeIdx].id
  result.de_total_end = Math.max(result.de_total_end ?? 0, finalsEnd)
}
