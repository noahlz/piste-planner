/**
 * Schedule One Competition — PRD Section 13
 *
 * Core single-competition scheduler. Given a competition, mutable global state,
 * tournament config, and the full competition list, assigns a day, allocates
 * resources for pool and DE phases, and records the result in state.
 */

import {
  EventType,
  DeMode,
  VideoPolicy,
  Weapon,
  BottleneckCause,
  BottleneckSeverity,
  dayStart,
  dayEnd,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, ScheduleResult } from './types.ts'
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
import { earliestResourceWindow, allocateStrips, allocateRefs, allocateRefsForSaber, snapToSlot } from './resources.ts'
import { assignDay, findEarlierSlotSameDay, SchedulingError } from './dayAssignment.ts'

export function scheduleCompetition(
  competition: Competition,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
): ScheduleResult {
  const poolStructure = computePoolStructure(competition.fencer_count, competition.use_single_pool_override)
  const day = assignDay(competition, poolStructure, state, config, allCompetitions)
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
          phase: 'SEQUENCING',
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
    pool_strips_count: 0,
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
    de_strips_count: 0,
    de_prelims_start: null,
    de_prelims_end: null,
    de_prelims_strips: 0,
    de_round_of_16_start: null,
    de_round_of_16_end: null,
    de_round_of_16_strips: 0,
    de_finals_start: null,
    de_finals_end: null,
    de_finals_strips: 0,
    de_bronze_start: null,
    de_bronze_end: null,
    de_bronze_strip_id: null,
    de_total_end: null,
    conflict_score: 0,
    pool_duration_baseline: wDuration,
    pool_duration_actual: 0,
    de_duration_baseline: totalDeBase,
    de_duration_actual: 0,
    saber_fillin_used: false,
    constraint_relaxation_level: 0,
    accepted_warnings: [],
  }

  // Deadline check + pool allocation retry loop
  let rescheduleAttempts = 0
  const MAX_ATTEMPTS = config.MAX_RESCHEDULE_ATTEMPTS

  // This loop implements the GOTO retry_from_pool_allocation pattern from the PRD.
  // Each iteration re-runs pool + DE allocation with a potentially earlier notBefore.
  // On retry, we must restore resource state to avoid leaking strips/refs from the
  // failed attempt — otherwise subsequent attempts see phantom resource occupancy.
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    // Snapshot mutable state so we can roll back on retry
    const stripSnapshot = [...state.strip_free_at]
    const refsSnapshot = JSON.parse(JSON.stringify(state.refs_in_use_by_day))
    const bottleneckCount = state.bottlenecks.length

    let poolEnd: number

    if (competition.flighted && competition.flighting_group_id === null) {
      // ── Standalone flighted ──
      poolEnd = allocateFlightedPools(competition, poolStructure, refRes, wDuration, notBefore, day, state, config, result)
    } else {
      // ── Non-flighted (or flighting group — treated as non-flighted for pool allocation) ──
      const poolDur = estimatePoolDuration(
        poolStructure.n_pools,
        wDuration,
        config.strips_total,
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
        'POOLS',
      )

      if (window.type === 'NO_WINDOW') {
        throw new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `No resource window found for ${competition.id} pools on day ${day}`,
        )
      }

      const T = window.startTime
      poolEnd = T + poolDur.actual_duration
      allocateStrips(state, window.stripIndices, poolEnd)
      allocateRefs(state, day, competition.weapon, refRes.refs_needed, T, poolEnd)
      state.bottlenecks.push(...window.bottlenecks)

      result.pool_start = T
      result.pool_end = poolEnd
      result.pool_strips_count = window.stripIndices.length
      result.pool_refs_count = refRes.refs_needed
    }

    // ── DEADLINE CHECK (post-pool) ──
    if (poolEnd > dayEnd(day, config)) {
      rescheduleAttempts++
      if (rescheduleAttempts > MAX_ATTEMPTS) {
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `Exhausted ${MAX_ATTEMPTS} reschedule attempts for ${competition.id}`,
        })
        throw new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `Exhausted ${MAX_ATTEMPTS} reschedule attempts for ${competition.id}`,
        )
      }
      const earlierSlot = findEarlierSlotSameDay(competition, poolStructure, day, state, config)
      if (earlierSlot !== null) {
        // Restore resource state before retrying — prevents leaked allocations
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        notBefore = earlierSlot
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `Rescheduled to earlier slot (attempt ${rescheduleAttempts})`,
        })
        continue // retry pool + DE allocation
      } else {
        // Restore state before throwing so caller doesn't see phantom allocations
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `No earlier slot found for ${competition.id} on day ${day}`,
        })
        throw new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `No earlier slot found for ${competition.id} on day ${day}`,
        )
      }
    }

    // ── ADMIN GAP ──
    const deNotBefore = snapToSlot(poolEnd + config.ADMIN_GAP_MINS)

    // ── DE PHASE ──
    if (competition.de_mode === DeMode.SINGLE_BLOCK) {
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
      state.strip_free_at = [...stripSnapshot]
      state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
      state.bottlenecks.length = bottleneckCount
      throw new SchedulingError(
        BottleneckCause.SAME_DAY_VIOLATION,
        `${competition.id} DE ends at ${deTotalEnd} — crosses day ${day} boundary (next day starts at ${nextDayStart})`,
      )
    }

    if (deTotalEnd > dayEnd(day, config) || deTotalEnd > competition.latest_end) {
      rescheduleAttempts++
      if (rescheduleAttempts > MAX_ATTEMPTS) {
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `Exhausted ${MAX_ATTEMPTS} reschedule attempts for ${competition.id} (DE overrun)`,
        })
        throw new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `Exhausted ${MAX_ATTEMPTS} reschedule attempts for ${competition.id} (DE overrun)`,
        )
      }
      const earlierSlot = findEarlierSlotSameDay(competition, poolStructure, day, state, config)
      if (earlierSlot !== null) {
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        notBefore = earlierSlot
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `Rescheduled to earlier slot (attempt ${rescheduleAttempts}, DE overrun)`,
        })
        continue // retry from pool allocation
      } else {
        state.strip_free_at = [...stripSnapshot]
        state.refs_in_use_by_day = JSON.parse(JSON.stringify(refsSnapshot))
        state.bottlenecks.length = bottleneckCount
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: 'DEADLINE_CHECK',
          cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `No earlier slot found for ${competition.id} on day ${day} (DE overrun)`,
        })
        throw new SchedulingError(
          BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
          `No earlier slot found for ${competition.id} on day ${day} (DE overrun)`,
        )
      }
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

  // Compute per-flight durations using half the pools
  const flightADur = estimatePoolDuration(
    flightAPools, wDuration,
    config.strips_total, availRefs, refRes.refs_per_pool,
  )
  const flightBDur = estimatePoolDuration(
    flightBPools, wDuration,
    config.strips_total, availRefs, refRes.refs_per_pool,
  )

  const flightARefsNeeded = Math.ceil(refRes.refs_needed / 2)
  const flightBRefsNeeded = Math.floor(refRes.refs_needed / 2)

  // Flight A
  const windowA = earliestResourceWindow(
    flightAPools, flightARefsNeeded,
    competition.weapon, false, notBefore, day,
    state, config, competition.id, 'FLIGHT_A',
  )
  if (windowA.type === 'NO_WINDOW') {
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
    state, config, competition.id, 'FLIGHT_B',
  )
  if (windowB.type === 'NO_WINDOW') {
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
      phase: 'FLIGHT_B',
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
  result.pool_strips_count = windowA.stripIndices.length + windowB.stripIndices.length
  result.pool_refs_count = flightARefsNeeded + flightBRefsNeeded
  result.pool_duration_actual = flightADur.actual_duration + flightBDur.actual_duration

  return flightBEnd
}

// ──────────────────────────────────────────────
// SINGLE_BLOCK DE execution — PRD Section 10.4
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

  // Find resource window for DE
  const window = earliestResourceWindow(
    Math.min(deOptimal, config.strips_total),
    deRefsNeeded,
    competition.weapon,
    false, // SINGLE_BLOCK never uses video
    deNotBefore,
    day,
    state,
    config,
    competition.id,
    'DE',
  )

  if (window.type === 'NO_WINDOW') {
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
  result.de_strips_count = deStrips
  result.de_duration_actual = actualDur
  result.de_total_end = deEnd

  // Bronze bout for TEAM events — simultaneous with gold on separate strip
  if (competition.event_type === EventType.TEAM) {
    allocateBronzeBout(competition, deStart, deEnd, day, window.stripIndices, state, config, result, false)
  }
}

// ──────────────────────────────────────────────
// STAGED_DE_BLOCKS execution — PRD Section 10.5
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
  if (phases.includes('DE_PRELIMS')) {
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
      'DE_PRELIMS',
    )

    if (prelimsWindow.type === 'NO_WINDOW') {
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
    result.de_prelims_strips = prelimsStrips
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
    'DE_ROUND_OF_16',
  )

  if (r16Window.type === 'NO_WINDOW') {
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
  result.de_round_of_16_strips = r16Strips
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
    'DE_FINALS',
  )

  if (finWindow.type === 'NO_WINDOW') {
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
  result.de_finals_strips = finWindow.stripIndices.length
  totalActual += finActual

  result.de_duration_actual = totalActual
  result.de_total_end = finEnd

  // Bronze bout for TEAM events
  if (competition.event_type === EventType.TEAM) {
    allocateBronzeBout(competition, finStart, finEnd, day, finWindow.stripIndices, state, config, result, finalsVideoRequired)
  }
}

// ──────────────────────────────────────────────
// Bronze bout allocation (shared by SINGLE_BLOCK and STAGED)
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
    // Severity depends on video policy per PRD Section 10.6
    const severity = videoRequired ? BottleneckSeverity.WARN : BottleneckSeverity.INFO
    state.bottlenecks.push({
      competition_id: competition.id,
      phase: 'DE_FINALS_BRONZE',
      cause: BottleneckCause.DE_FINALS_BRONZE_NO_STRIP,
      severity,
      delay_mins: 0,
      message: `No free strip for bronze bout of ${competition.id}`,
    })
    return
  }

  // Allocate bronze strip
  allocateStrips(state, [bronzeIdx], finalsEnd)

  // Allocate ref for bronze (no fill-in for saber)
  if (competition.weapon === Weapon.SABRE) {
    const saberResult = allocateRefsForSaber(
      1, finalsStart, finalsEnd, day, state,
      { ...config, allow_saber_ref_fillin: false },
      competition.id, 'DE_FINALS_BRONZE',
    )
    if (saberResult.type === 'OK') {
      state.bottlenecks.push(...saberResult.bottlenecks)
    }
  } else {
    allocateRefs(state, day, competition.weapon, 1, finalsStart, finalsEnd)
  }

  result.de_bronze_start = finalsStart
  result.de_bronze_end = finalsEnd
  result.de_bronze_strip_id = strips[bronzeIdx].id
  result.de_total_end = Math.max(result.de_total_end ?? 0, finalsEnd)
}
