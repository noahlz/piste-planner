/**
 * Phase-major schedulers — Stage 6 Task 1B implementation.
 *
 * Each function schedules one phase (pools, DE prelims, R16, finals, etc.)
 * for a single competition on a given day, mutating GlobalState and writing
 * into partialResult. Logic is extracted from scheduleOne.ts so that
 * scheduleCompetition can be rewritten as a thin orchestrator.
 *
 * Non-functional refactor — behavior is bit-identical to the original scheduleOne.ts.
 *
 * NOTE: these functions were designed to support a phase-major scheduling loop
 * (all events' pools, then all events' prelims, ...) but Stage 6 Task 3 attempted
 * that flip and reverted it. The functions are still called sequentially from
 * `scheduleCompetition` for one event at a time. See `scheduler.ts` Phase 3
 * comment block and `__tests__/engine/scheduler.test.ts` footer for the
 * postmortem on why phase-major was reverted (strip-rollback order-dependence
 * + density regressions under video-strip contention).
 */
import {
  EventType,
  VideoPolicy,
  Phase,
  BottleneckCause,
  BottleneckSeverity,
  dayEnd,
} from './types.ts'
import type { Competition, TournamentConfig, GlobalState, ScheduleResult, EventTxLog } from './types.ts'
import {
  computePoolStructure,
  resolveRefsPerPool,
  estimatePoolDuration,
  weightedPoolDuration,
} from './pools.ts'
import { computeBracketSize, calculateDeDuration, deBlockDurations } from './de.ts'
import { refsAvailableOnDay } from './refs.ts'
import { findIndividualCounterpart } from './crossover.ts'
import { earliestResourceWindow, allocateStrips, allocateRefs, snapToSlot, type NoWindowReason, type PoolContext, type ResourceWindowResult } from './resources.ts'
import { SchedulingError } from './dayAssignment.ts'
import { computeStripCap } from './stripBudget.ts'
import { dayStart } from './types.ts'

// ──────────────────────────────────────────────
// PartialScheduleResult
// ──────────────────────────────────────────────

/**
 * Accumulates fields from each phase into a single result object.
 * Once all phases complete successfully it is cast to a full ScheduleResult.
 */
export type PartialScheduleResult = Partial<ScheduleResult>

// ──────────────────────────────────────────────
// Shared helper: emitNoWindowDiagnostic
// ──────────────────────────────────────────────

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

type FoundWindow = Extract<ResourceWindowResult, { type: 'FOUND' }>

/**
 * Asserts a resource window search succeeded. On NO_WINDOW, emits a diagnostic
 * bottleneck and throws SchedulingError. On FOUND, accumulates contention
 * bottlenecks and returns the FOUND case (typed) for direct use.
 */
function assertWindowFound(
  window: ResourceWindowResult,
  competition: Competition,
  phase: Phase,
  phaseLabel: string,
  day: number,
  state: GlobalState,
): FoundWindow {
  if (window.type === 'NO_WINDOW') {
    emitNoWindowDiagnostic(window.reason, competition.id, phase, day, state)
    throw new SchedulingError(
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      `No resource window for ${competition.id} ${phaseLabel} on day ${day}`,
    )
  }
  state.bottlenecks.push(...window.bottlenecks)
  return window
}

/**
 * Computes DE bracket size and per-block durations for a competition. Returns
 * the bracket size and the deBlockDurations result.
 */
function computeDeBlocks(competition: Competition, config: TournamentConfig) {
  const bracketSize = computeBracketSize(
    competition.fencer_count,
    competition.cut_mode,
    competition.cut_value,
    competition.event_type,
  )
  const totalDeBase = calculateDeDuration(competition.weapon, bracketSize, config.de_duration_table)
  const blocks = deBlockDurations(bracketSize, totalDeBase)
  return { bracketSize, blocks }
}

// ──────────────────────────────────────────────
// Phase scheduler implementations
// ──────────────────────────────────────────────

/**
 * Schedules the pool round for one competition on the given day.
 * Handles team/individual sequencing, flighted vs. non-flighted branching.
 * Returns the absolute minute at which pools end so later phases can notBefore it.
 */
export function schedulePoolPhase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  allCompetitions: Competition[],
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
  poolContext?: PoolContext,
): { poolEnd: number } {
  // If team event, enforce individual-first ordering on same day (same weapon)
  let effectiveNotBefore = notBefore
  if (competition.event_type === EventType.TEAM) {
    const ind = findIndividualCounterpart(competition, allCompetitions)
    if (ind && state.schedule[ind.id] && state.schedule[ind.id].assigned_day === day) {
      const indResult = state.schedule[ind.id]
      const indEnd = indResult.de_total_end ?? indResult.pool_end ?? dayStart(day, config)
      const sequencedStart = snapToSlot(indEnd + config.INDIV_TEAM_MIN_GAP_MINS)
      if (sequencedStart > effectiveNotBefore) {
        state.bottlenecks.push({
          competition_id: competition.id,
          phase: Phase.SEQUENCING,
          cause: BottleneckCause.SEQUENCING_CONSTRAINT,
          severity: BottleneckSeverity.INFO,
          delay_mins: sequencedStart - effectiveNotBefore,
          message: `${competition.id} delayed to ${sequencedStart} — must follow ${ind.id} + ${config.INDIV_TEAM_MIN_GAP_MINS}min gap`,
        })
        effectiveNotBefore = sequencedStart
      }
    }
  }

  const poolStructure = computePoolStructure(competition.fencer_count, competition.use_single_pool_override)
  const availRefs = refsAvailableOnDay(day, competition.weapon, config)
  const refRes = resolveRefsPerPool(competition.ref_policy, poolStructure.n_pools, availRefs)
  const wDuration = weightedPoolDuration(poolStructure, competition.weapon, config.pool_round_duration_table)

  // Store pool_duration_baseline computed here into partialResult
  partialResult.pool_duration_baseline = wDuration

  let poolEnd: number
  const poolAllocCtx: PoolAllocationContext = {
    competition,
    poolStructure,
    refRes,
    wDuration,
    notBefore: effectiveNotBefore,
    day,
    state,
    config,
    partialResult,
    txLog,
    poolContext,
  }

  if (competition.flighted && competition.flighting_group_id === null) {
    // Standalone flighted
    poolEnd = allocateFlightedPools(poolAllocCtx)
  } else {
    // Non-flighted (or flighting group — treated as non-flighted for pool allocation)
    poolEnd = allocateNonFlightedPools(poolAllocCtx)
  }

  return { poolEnd }
}

/**
 * Schedules the DE prelims block (R32 / R64 / etc.) for staged-DE competitions.
 * Only called when bracket >= 64 (the orchestrator decides).
 */
export function scheduleDePrelimsPhase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
): { prelimsEnd: number } {
  const { bracketSize, blocks } = computeDeBlocks(competition, config)
  const deOptimal = Math.floor(bracketSize / 2)

  const prelimsWindow = assertWindowFound(
    earliestResourceWindow(
      Math.min(deOptimal, config.strips_total),
      config.DE_REFS,
      competition.weapon,
      false, // prelims never use video regardless of policy
      notBefore,
      day,
      state,
      config,
      competition.id,
      Phase.DE_PRELIMS,
    ),
    competition, Phase.DE_PRELIMS, 'DE_PRELIMS', day, state,
  )

  const prelimsStart = prelimsWindow.startTime
  const prelimsStrips = prelimsWindow.stripIndices.length
  const prelimsRatio = prelimsStrips / Math.max(deOptimal, 1)
  const prelimsActual = snapToSlot(Math.ceil(blocks.prelims_dur / Math.max(prelimsRatio, 0.01)))
  const prelimsEnd = prelimsStart + prelimsActual

  allocateStrips(state, prelimsWindow.stripIndices, prelimsEnd, txLog)
  allocateRefs(state, day, competition.weapon, config.DE_REFS, prelimsStart, prelimsEnd, txLog)

  partialResult.de_prelims_start = prelimsStart
  partialResult.de_prelims_end = prelimsEnd
  partialResult.de_prelims_strip_count = prelimsStrips

  return { prelimsEnd }
}

/**
 * Schedules the Round of 16 block for staged-DE competitions.
 */
export function scheduleR16Phase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
): { r16End: number } {
  const policy = competition.de_video_policy
  const r16VideoRequired = policy === VideoPolicy.REQUIRED

  const r16Target = competition.de_round_of_16_strips
  const r16Window = assertWindowFound(
    earliestResourceWindow(
      r16Target,
      config.DE_REFS * r16Target,
      competition.weapon,
      r16VideoRequired,
      notBefore,
      day,
      state,
      config,
      competition.id,
      Phase.DE_ROUND_OF_16,
    ),
    competition, Phase.DE_ROUND_OF_16, 'DE_ROUND_OF_16', day, state,
  )

  const { blocks } = computeDeBlocks(competition, config)

  const r16Start = r16Window.startTime
  const r16Strips = r16Window.stripIndices.length
  const r16Ratio = r16Strips / Math.max(r16Target, 1)
  const r16Actual = snapToSlot(Math.ceil(blocks.r16_dur / Math.max(r16Ratio, 0.01)))
  const r16End = r16Start + r16Actual

  allocateStrips(state, r16Window.stripIndices, r16End, txLog)
  allocateRefs(state, day, competition.weapon, r16Strips, r16Start, r16End, txLog)

  partialResult.de_round_of_16_start = r16Start
  partialResult.de_round_of_16_end = r16End
  partialResult.de_round_of_16_strip_count = r16Strips

  return { r16End }
}

/**
 * Schedules the DE finals block (top-8 and gold bout) for staged-DE competitions.
 * Returns the end time and the strip indices reserved for finals so bronze can reuse.
 */
export function scheduleDeFinalsPhase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
): { finalsEnd: number; finalsStripIndices: number[] } {
  const policy = competition.de_video_policy
  const finalsVideoRequired = policy === VideoPolicy.REQUIRED || policy === VideoPolicy.FINALS_ONLY

  const finTarget = competition.de_finals_strips
  const finWindow = assertWindowFound(
    earliestResourceWindow(
      finTarget,
      config.DE_REFS,
      competition.weapon,
      finalsVideoRequired,
      notBefore, // continuous from R16 end — no gap
      day,
      state,
      config,
      competition.id,
      Phase.DE_FINALS,
    ),
    competition, Phase.DE_FINALS, 'DE_FINALS', day, state,
  )

  const { blocks } = computeDeBlocks(competition, config)

  const finStart = finWindow.startTime
  const finActual = Math.max(blocks.finals_dur, config.DE_FINALS_MIN_MINS)
  const finEnd = finStart + finActual

  allocateStrips(state, finWindow.stripIndices, finEnd, txLog)
  allocateRefs(state, day, competition.weapon, 1, finStart, finEnd, txLog)

  partialResult.de_finals_start = finStart
  partialResult.de_finals_end = finEnd
  partialResult.de_finals_strip_count = finWindow.stripIndices.length

  return { finalsEnd: finEnd, finalsStripIndices: finWindow.stripIndices }
}

/**
 * Schedules the single-stage DE bracket (all rounds in one block).
 * Used when competition.de_mode === DeMode.SINGLE_STAGE.
 * Returns deEnd and deStripIndices so the caller can pass them to scheduleBronzePhase.
 */
export function scheduleSingleStageDePhase(
  competition: Competition,
  day: number,
  notBefore: number,
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
): { deEnd: number; deStripIndices: number[] } {
  const { bracketSize } = computeDeBlocks(competition, config)
  const totalDeBase = calculateDeDuration(competition.weapon, bracketSize, config.de_duration_table)
  const deOptimal = Math.floor(bracketSize / 2)
  const deRefsNeeded = config.DE_REFS

  const deEffectiveCap = computeStripCap(
    config.strips_total,
    config.max_de_strip_pct,
    competition.max_de_strip_pct_override,
  )

  const window = assertWindowFound(
    earliestResourceWindow(
      Math.min(deOptimal, deEffectiveCap),
      deRefsNeeded,
      competition.weapon,
      false, // SINGLE_STAGE never uses video
      notBefore,
      day,
      state,
      config,
      competition.id,
      Phase.DE,
    ),
    competition, Phase.DE, 'DE', day, state,
  )

  const deStart = window.startTime
  const deStrips = window.stripIndices.length
  const ratio = Math.min(deStrips / Math.max(deOptimal, 1), 1.0)
  const actualDur = ratio >= 1.0 ? totalDeBase : Math.ceil(totalDeBase / ratio)
  const deEnd = deStart + actualDur

  allocateStrips(state, window.stripIndices, deEnd, txLog)
  allocateRefs(state, day, competition.weapon, deRefsNeeded, deStart, deEnd, txLog)

  partialResult.de_start = deStart
  partialResult.de_end = deEnd
  partialResult.de_strip_count = deStrips
  partialResult.de_duration_actual = actualDur
  partialResult.de_total_end = deEnd

  return { deEnd, deStripIndices: window.stripIndices }
}

/**
 * Schedules the bronze-medal bout, which runs alongside the gold bout on a separate strip.
 * goldStripIndices are the strips already reserved for finals; bronze must use a different one.
 */
export function scheduleBronzePhase(
  competition: Competition,
  day: number,
  finalsStart: number,
  finalsEnd: number,
  goldStripIndices: number[],
  state: GlobalState,
  config: TournamentConfig,
  partialResult: PartialScheduleResult,
  txLog: EventTxLog,
  videoRequired: boolean,
): void {
  const goldSet = new Set(goldStripIndices)
  const strips = config.strips
  const freeAt = state.strip_free_at

  // Find first strip not in goldSet that is free at finalsStart and matches the predicate.
  const findFreeBronzeStrip = (predicate: (videoCapable: boolean) => boolean): number | null => {
    for (let i = 0; i < strips.length; i++) {
      if (goldSet.has(i)) continue
      if (predicate(strips[i].video_capable) && freeAt[i] <= finalsStart) return i
    }
    return null
  }

  let bronzeIdx: number | null
  if (videoRequired) {
    // Video strips only (excluding gold)
    bronzeIdx = findFreeBronzeStrip((video) => video)
  } else {
    // Non-video preferred, fallback to video
    bronzeIdx = findFreeBronzeStrip((video) => !video) ?? findFreeBronzeStrip((video) => video)
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
  allocateStrips(state, [bronzeIdx], finalsEnd, txLog)

  // Allocate one ref for bronze — weapon-agnostic
  allocateRefs(state, day, competition.weapon, 1, finalsStart, finalsEnd, txLog)

  partialResult.de_bronze_start = finalsStart
  partialResult.de_bronze_end = finalsEnd
  partialResult.de_bronze_strip_id = strips[bronzeIdx].id
  partialResult.de_total_end = Math.max(partialResult.de_total_end ?? 0, finalsEnd)
}

// ──────────────────────────────────────────────
// Internal helpers (flighted / non-flighted pool allocation)
// ──────────────────────────────────────────────

/** Shared parameter bundle for pool-allocation helpers. */
interface PoolAllocationContext {
  competition: Competition
  poolStructure: ReturnType<typeof computePoolStructure>
  refRes: ReturnType<typeof resolveRefsPerPool>
  wDuration: number
  notBefore: number
  day: number
  state: GlobalState
  config: TournamentConfig
  partialResult: PartialScheduleResult
  txLog: EventTxLog
  poolContext?: PoolContext
}

function allocateFlightedPools({
  competition,
  poolStructure,
  refRes,
  wDuration,
  notBefore,
  day,
  state,
  config,
  partialResult,
  txLog,
  poolContext,
}: PoolAllocationContext): number {
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
  const windowA = assertWindowFound(
    earliestResourceWindow(
      flightAPools, flightARefsNeeded,
      competition.weapon, false, notBefore, day,
      state, config, competition.id, Phase.FLIGHT_A,
      poolContext,
    ),
    competition, Phase.FLIGHT_A, 'Flight A', day, state,
  )

  const Ta = windowA.startTime
  const flightAEnd = Ta + flightADur.actual_duration
  allocateStrips(state, windowA.stripIndices, flightAEnd, txLog)
  allocateRefs(state, day, competition.weapon, flightARefsNeeded, Ta, flightAEnd, txLog)

  partialResult.flight_a_start = Ta
  partialResult.flight_a_end = flightAEnd
  partialResult.flight_a_strips = windowA.stripIndices.length
  partialResult.flight_a_refs = flightARefsNeeded
  partialResult.pool_start = Ta

  // Flight B: starts after Flight A + buffer
  const flightBIdeal = snapToSlot(flightAEnd + config.FLIGHT_BUFFER_MINS)

  // HARD: Flight B must start on the same day as Flight A
  if (flightBIdeal >= dayEnd(day, config)) {
    throw new SchedulingError(
      BottleneckCause.SAME_DAY_VIOLATION,
      `${competition.id} Flight B start (${flightBIdeal}) crosses day ${day} boundary`,
    )
  }

  const windowB = assertWindowFound(
    earliestResourceWindow(
      flightBPools, flightBRefsNeeded,
      competition.weapon, false, flightBIdeal, day,
      state, config, competition.id, Phase.FLIGHT_B,
      poolContext,
    ),
    competition, Phase.FLIGHT_B, 'Flight B', day, state,
  )

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

  allocateStrips(state, windowB.stripIndices, flightBEnd, txLog)
  allocateRefs(state, day, competition.weapon, flightBRefsNeeded, Tb, flightBEnd, txLog)

  partialResult.flight_b_start = Tb
  partialResult.flight_b_end = flightBEnd
  partialResult.flight_b_strips = windowB.stripIndices.length
  partialResult.flight_b_refs = flightBRefsNeeded
  partialResult.pool_end = flightBEnd
  partialResult.pool_strip_count = windowA.stripIndices.length + windowB.stripIndices.length
  partialResult.pool_refs_count = flightARefsNeeded + flightBRefsNeeded
  partialResult.pool_duration_actual = flightADur.actual_duration + flightBDur.actual_duration

  return flightBEnd
}

function allocateNonFlightedPools({
  competition,
  poolStructure,
  refRes,
  wDuration,
  notBefore,
  day,
  state,
  config,
  partialResult,
  txLog,
  poolContext,
}: PoolAllocationContext): number {
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
  partialResult.pool_duration_actual = poolDur.actual_duration

  const window = assertWindowFound(
    earliestResourceWindow(
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
      poolContext,
    ),
    competition, Phase.POOLS, 'pools', day, state,
  )

  const T = window.startTime
  const poolEnd = T + poolDur.actual_duration
  allocateStrips(state, window.stripIndices, poolEnd, txLog)
  allocateRefs(state, day, competition.weapon, refRes.refs_needed, T, poolEnd, txLog)

  partialResult.pool_start = T
  partialResult.pool_end = poolEnd
  partialResult.pool_strip_count = window.stripIndices.length
  partialResult.pool_refs_count = refRes.refs_needed

  return poolEnd
}
