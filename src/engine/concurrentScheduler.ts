/**
 * Concurrent Phase Scheduler — METHODOLOGY.md §Concurrent Phase Scheduler
 *
 * OS-process-scheduling style loop over phase nodes. Each event decomposes into
 * a sequence of phase nodes (pools → DE phases) that depend on one another.
 * The loop pops the highest-priority READY phase, allocates resources via the
 * interval-list strip primitives, and pushes successors as READY.
 *
 * Resources: `findAvailableStripsInWindow` and `allocatePods` from Phases A/B.
 * Day assignment: `assignDaysByColoring` from `dayColoring.ts`. Post-schedule
 * pipeline (`postScheduleDiagnostics`, `postScheduleDayBreakdown`,
 * `postScheduleWarnings`, `computeRefRequirements`) reused from the serial
 * scheduler unchanged.
 *
 * This file is a parallel entry point — the existing `scheduleAll` continues to
 * use the serial path. Phase D will switch `scheduleAll` over and delete the
 * serial code.
 */

import {
  DeMode,
  EventType,
  VideoPolicy,
  Phase,
  BottleneckCause,
  BottleneckSeverity,
  Category,
  VetAgeGroup,
  dayStart,
  dayEnd,
  findDayForTime,
  tailEstimateMins,
} from './types.ts'
import type {
  Competition,
  TournamentConfig,
  ScheduleResult,
  Bottleneck,
  GlobalState,
  RefRequirementsByDay,
  RefDemandByDay,
  StripAllocation,
} from './types.ts'
import {
  createGlobalState,
  findAvailableStripsInWindow,
  allocateInterval,
  releaseEventAllocations,
  peakConcurrentStrips,
  snapToSlot,
} from './resources.ts'
import { allocatePods } from './pods.ts'
import {
  computePoolStructure,
  resolveRefsPerPool,
  estimatePoolDuration,
  weightedPoolDuration,
  computeDeFencerCount,
} from './pools.ts'
import {
  computeBracketSize,
  calculateDeDuration,
  deBlockDurations,
  dePhasesForBracket,
} from './de.ts'
import { computeStripCap, recommendStripCount, peakDeStripDemand } from './stripBudget.ts'
import { computePodRefDemand, computeRefRequirements, peakPoolRefDemand, peakDeRefDemand } from './refs.ts'
import { findIndividualCounterpart } from './crossover.ts'
import { buildConstraintGraph } from './constraintGraph.ts'
import { assignDaysByColoring } from './dayColoring.ts'
import { constraintScore } from './dayAssignment.ts'
import { validateConfig } from './validation.ts'
import { dayConsumedCapacity } from './capacity.ts'
import { DE_POD_SIZE } from './constants.ts'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface ScheduleAllResult {
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
  ref_requirements_by_day?: RefRequirementsByDay[]
  // Per-strip allocation lists exposed so post-schedule diagnostic tools
  // (e.g. ASCII lane renderer) can reconstruct which strip ran which
  // event-phase at each interval. Outer index = strip index; inner arrays
  // are sorted by start_time, no overlap.
  strip_allocations: StripAllocation[][]
}

/**
 * Phase-node lifecycle states. PENDING → READY → RUNNING is the success path.
 * FAILED is terminal for the current attempt.
 */
const PhaseState = {
  PENDING: 'PENDING',
  READY: 'READY',
  RUNNING: 'RUNNING',
  FAILED: 'FAILED',
} as const
type PhaseState = (typeof PhaseState)[keyof typeof PhaseState]

/**
 * Discriminator for what kind of work a phase node represents. Determines
 * which `Phase` is recorded on StripAllocation entries and how the result
 * fields are populated.
 */
const PhaseKind = {
  POOLS: 'POOLS',
  FLIGHT_A: 'FLIGHT_A',
  FLIGHT_B: 'FLIGHT_B',
  DE_PRELIMS: 'DE_PRELIMS',
  DE_R16: 'DE_R16',
  DE_SINGLE: 'DE_SINGLE',
} as const
type PhaseKind = (typeof PhaseKind)[keyof typeof PhaseKind]

/**
 * Per-event state for the loop: which phase nodes belong to it, day assignment,
 * retry attempt counter, partial result shell, and the bracket-derived constants
 * the phase nodes need (durations, pod counts).
 */
interface EventState {
  competition: Competition
  assigned_day: number
  attempt_id: number
  result: ScheduleResult
  // Pre-computed per-event constants.
  poolStructure: ReturnType<typeof computePoolStructure>
  poolBaseline: number
  poolRefRes: ReturnType<typeof resolveRefsPerPool>
  bracketSize: number
  totalDeBase: number
  // The phase nodes that belong to this event, in topological order.
  phases: PhaseNode[]
  // Constraint score for priority tie-breaking.
  constraint_score: number
  // Once the event permanently fails (after attempt 2) this flag is set.
  permanently_failed: boolean
}

/**
 * One node in the phase dependency DAG. Phase nodes are owned by a single event.
 * `successor_index` is the index of the next phase node in the same event's
 * `phases` array; -1 means terminal. Cross-event edges set `cross_event_predecessors`.
 */
interface PhaseNode {
  event_id: string
  kind: PhaseKind
  phase_label: Phase
  state: PhaseState
  ready_time: number
  end_time: number
  // Number of times this node has been pushed back onto the queue with an
  // earlier deferral. Compared to MAX_DEFERS_PER_PHASE.
  defer_count: number
  // Phase-node index inside event.phases (used for successor lookup).
  index: number
  successor_index: number
  // Computed per-attempt; null until allocated.
  desired_strip_count: number
  duration_at_full: number
  video_required: boolean
  // For STAGED DE phases: pods of DE_POD_SIZE.
  use_pods: boolean
  // The cap to apply (pool_cap or de_cap).
  cap_kind: 'POOL' | 'DE'
  // For Flight B and DE phases: explicit cross-event deps to enforce indv→team
  // and Vet sibling order.
  cross_event_predecessors: { event_id: string; min_gap: number }[]
}

const MAX_DEFERS_PER_PHASE = 16

// ──────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────

export function scheduleAllConcurrent(
  competitions: Competition[],
  config: TournamentConfig,
): ScheduleAllResult {
  const state = createGlobalState(config)

  // Validation pass — same shape as serial scheduleAll.
  const validationErrors = validateConfig(config, competitions)
  for (const ve of validationErrors) {
    state.bottlenecks.push({
      competition_id: '',
      phase: Phase.VALIDATION,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      severity: ve.severity,
      delay_mins: 0,
      message: ve.message,
    })
  }
  const hasErrors = validationErrors.some(ve => ve.severity === BottleneckSeverity.ERROR)
  if (hasErrors) {
    return {
      schedule: state.schedule,
      bottlenecks: state.bottlenecks,
      strip_allocations: state.strip_allocations,
    }
  }

  // Day assignment via DSatur graph coloring.
  const graph = buildConstraintGraph(competitions)
  const { dayMap, relaxations } = assignDaysByColoring(graph, competitions, config)

  // Build per-event state & phase nodes.
  const events = buildEventStates(competitions, dayMap, config)

  // Wire cross-event dependency edges (indv→team, Vet sibling order).
  applyCrossEventEdges(events, config)

  // Run the priority-queue loop.
  runConcurrentLoop(events, state, config)

  // Materialize successful events into state.schedule. Already done inside the
  // loop after each event's terminal phase succeeds — see `commitEventResult`.

  // Apply day-assignment relaxations as bottlenecks (mirrors scheduleAll).
  for (const event of events) {
    const sr = state.schedule[event.competition.id]
    if (!sr) continue
    const relaxLevel = relaxations.get(event.competition.id)
    if (relaxLevel !== undefined) {
      sr.constraint_relaxation_level = relaxLevel
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: Phase.DAY_ASSIGNMENT,
        cause: BottleneckCause.CONSTRAINT_RELAXED,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${event.competition.id}: constraint relaxed to level ${relaxLevel} during day assignment`,
      })
    }
  }

  // Post-schedule ref demand: pool intervals via peakConcurrentStrips,
  // STAGED-DE pods via computePodRefDemand. Non-pod allocations (pools,
  // SINGLE_STAGE DE) are emitted as one RefDemandInterval per (event, phase).
  state.ref_demand_by_day = computePostScheduleRefDemand(state, config, competitions)

  // Standard post-schedule pipeline.
  const diagnostics = postScheduleDiagnostics(competitions, config, state.bottlenecks)
  state.bottlenecks.push(...diagnostics)
  const dayBreakdown = postScheduleDayBreakdown(competitions, config, state)
  state.bottlenecks.push(...dayBreakdown)
  const postWarnings = postScheduleWarnings(state.schedule, config)
  state.bottlenecks.push(...postWarnings)

  const ref_requirements_by_day = computeRefRequirements(
    state.ref_demand_by_day,
    config.days_available,
  )

  return {
    schedule: state.schedule,
    bottlenecks: state.bottlenecks,
    ref_requirements_by_day,
    strip_allocations: state.strip_allocations,
  }
}

// ──────────────────────────────────────────────
// Event/phase setup
// ──────────────────────────────────────────────

/**
 * Builds per-event state objects and the phase-node DAG for each event.
 * Decides STAGED vs SINGLE_STAGE and flighted vs non-flighted up front so the
 * phase-node array is fixed for the run (retries reset state, not topology).
 */
function buildEventStates(
  competitions: Competition[],
  dayMap: Map<string, number>,
  config: TournamentConfig,
): EventState[] {
  const events: EventState[] = []
  for (const comp of competitions) {
    const day = dayMap.get(comp.id)
    if (day === undefined) continue

    const poolStructure = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
    const poolBaseline = weightedPoolDuration(
      poolStructure,
      comp.weapon,
      config.pool_round_duration_table,
    )
    const refRes = resolveRefsPerPool(comp.ref_policy, poolStructure.n_pools)
    const bracketSize = computeBracketSize(
      comp.fencer_count,
      comp.cut_mode,
      comp.cut_value,
      comp.event_type,
    )
    const totalDeBase = calculateDeDuration(comp.weapon, bracketSize, config.de_duration_table)
    const promoted = computeDeFencerCount(
      comp.fencer_count,
      comp.cut_mode,
      comp.cut_value,
      comp.event_type,
    )

    // Build the result shell — populated incrementally as phases run.
    const result: ScheduleResult = {
      competition_id: comp.id,
      assigned_day: day,
      use_flighting: comp.flighted || comp.flighting_group_id !== null,
      is_priority: comp.is_priority,
      flighting_group_id: comp.flighting_group_id,
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
      entry_fencer_count: comp.fencer_count,
      promoted_fencer_count: promoted,
      bracket_size: bracketSize,
      cut_mode: comp.cut_mode,
      cut_value: comp.cut_value,
      de_mode: comp.de_mode,
      de_video_policy: comp.de_video_policy,
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

    const phases = buildPhaseNodes(comp, poolStructure, refRes, poolBaseline, bracketSize, config)

    events.push({
      competition: comp,
      assigned_day: day,
      attempt_id: 1,
      result,
      poolStructure,
      poolBaseline,
      poolRefRes: refRes,
      bracketSize,
      totalDeBase,
      phases,
      constraint_score: constraintScore(comp, competitions, config),
      permanently_failed: false,
    })
  }
  return events
}

/**
 * Decomposes one competition into its phase-node sequence. Sets the first node
 * to READY at dayStart(assigned_day); the rest start PENDING.
 */
function buildPhaseNodes(
  comp: Competition,
  poolStructure: ReturnType<typeof computePoolStructure>,
  refRes: ReturnType<typeof resolveRefsPerPool>,
  poolBaseline: number,
  bracketSize: number,
  config: TournamentConfig,
): PhaseNode[] {
  const nodes: PhaseNode[] = []

  // Strip caps (cached per-phase-kind).
  const poolCap = computeStripCap(
    config.strips_total,
    config.max_pool_strip_pct,
    comp.max_pool_strip_pct_override,
  )

  // Decide flighted: standalone-flighted events split pools into A/B.
  const isFlighted = comp.flighted && comp.flighting_group_id === null

  if (isFlighted) {
    const flightAPools = Math.ceil(poolStructure.n_pools / 2)
    const flightBPools = Math.floor(poolStructure.n_pools / 2)
    const flightADur = estimatePoolDuration(flightAPools, poolBaseline, poolCap, refRes.refs_per_pool).actual_duration
    const flightBDur = estimatePoolDuration(flightBPools, poolBaseline, poolCap, refRes.refs_per_pool).actual_duration

    nodes.push({
      event_id: comp.id,
      kind: PhaseKind.FLIGHT_A,
      phase_label: Phase.FLIGHT_A,
      state: PhaseState.PENDING,
      ready_time: 0,
      end_time: 0,
      defer_count: 0,
      index: 0,
      successor_index: 1,
      desired_strip_count: flightAPools,
      duration_at_full: flightADur,
      video_required: false,
      use_pods: false,
      cap_kind: 'POOL',
      cross_event_predecessors: [],
    })
    nodes.push({
      event_id: comp.id,
      kind: PhaseKind.FLIGHT_B,
      phase_label: Phase.FLIGHT_B,
      state: PhaseState.PENDING,
      ready_time: 0,
      end_time: 0,
      defer_count: 0,
      index: 1,
      successor_index: -1, // patched below
      desired_strip_count: flightBPools,
      duration_at_full: flightBDur,
      video_required: false,
      use_pods: false,
      cap_kind: 'POOL',
      cross_event_predecessors: [],
    })
  } else {
    // Standard non-flighted pools.
    const poolDur = estimatePoolDuration(poolStructure.n_pools, poolBaseline, poolCap, refRes.refs_per_pool).actual_duration
    nodes.push({
      event_id: comp.id,
      kind: PhaseKind.POOLS,
      phase_label: Phase.POOLS,
      state: PhaseState.PENDING,
      ready_time: 0,
      end_time: 0,
      defer_count: 0,
      index: 0,
      successor_index: -1, // patched below
      desired_strip_count: poolStructure.n_pools,
      duration_at_full: poolDur,
      video_required: false,
      use_pods: false,
      cap_kind: 'POOL',
      cross_event_predecessors: [],
    })
  }

  // DE phases.
  //
  // Real-world DE convention: each event runs DE rounds on ~4 pods of
  // DE_POD_SIZE strips (16 strips total), with fencers queued through the
  // pods round-by-round — NOT one bout per strip in parallel. A round of 128
  // uses 4 pods of 4 strips and queues 8 bouts per pod, not 64 strips at
  // once. The empirical durations in de_duration_table assume this 4-pod
  // model. Using bracketSize/2 (e.g. 128 for a 256 bracket) here forced one
  // event's DE to claim 64+ strips and serialize against any other event on
  // the same day — events would queue for hours rather than sharing the
  // strip pool concurrently. Capping at DEFAULT_DE_PODS × DE_POD_SIZE keeps
  // each event's DE footprint small enough that 3-5 events can run DE phases
  // concurrently across an 80-strip floor.
  const DEFAULT_DE_PODS = 4
  const deDesired = Math.max(1, Math.min(Math.floor(bracketSize / 2), DEFAULT_DE_PODS * DE_POD_SIZE))
  if (comp.de_mode === DeMode.SINGLE_STAGE) {
    nodes.push({
      event_id: comp.id,
      kind: PhaseKind.DE_SINGLE,
      phase_label: Phase.DE,
      state: PhaseState.PENDING,
      ready_time: 0,
      end_time: 0,
      defer_count: 0,
      index: nodes.length,
      successor_index: -1,
      desired_strip_count: deDesired,
      duration_at_full: 0, // computed at allocation time (depends on cap)
      video_required: false, // SINGLE_STAGE never uses video
      use_pods: false,
      cap_kind: 'DE',
      cross_event_predecessors: [],
    })
  } else {
    // STAGED: prelims (only when bracket >= 64) → R16.
    const phaseList = dePhasesForBracket(bracketSize)
    const blocks = deBlockDurations(bracketSize, calculateDeDuration(comp.weapon, bracketSize, config.de_duration_table))

    if (phaseList.includes(Phase.DE_PRELIMS)) {
      nodes.push({
        event_id: comp.id,
        kind: PhaseKind.DE_PRELIMS,
        phase_label: Phase.DE_PRELIMS,
        state: PhaseState.PENDING,
        ready_time: 0,
        end_time: 0,
        defer_count: 0,
        index: nodes.length,
        successor_index: -1, // patched below
        desired_strip_count: deDesired,
        duration_at_full: blocks.prelims_dur,
        video_required: false,
        use_pods: true,
        cap_kind: 'DE',
        cross_event_predecessors: [],
      })
    }

    const r16VideoRequired = comp.de_video_policy === VideoPolicy.REQUIRED
    nodes.push({
      event_id: comp.id,
      kind: PhaseKind.DE_R16,
      phase_label: Phase.DE_ROUND_OF_16,
      state: PhaseState.PENDING,
      ready_time: 0,
      end_time: 0,
      defer_count: 0,
      index: nodes.length,
      successor_index: -1,
      desired_strip_count: comp.de_round_of_16_strips,
      duration_at_full: blocks.r16_dur,
      video_required: r16VideoRequired,
      use_pods: true,
      cap_kind: 'DE',
      cross_event_predecessors: [],
    })
  }

  // Patch successor_index links (each node's successor is the next index).
  for (let i = 0; i < nodes.length - 1; i++) {
    nodes[i].successor_index = i + 1
  }
  nodes[nodes.length - 1].successor_index = -1

  // Set the first node READY at dayStart.
  // Caller (runConcurrentLoop) seeds ready_time once events list is built.
  return nodes
}

// ──────────────────────────────────────────────
// Cross-event edges (indv→team, Vet sibling order)
// ──────────────────────────────────────────────

const VET_AGE_BANDED_GROUPS: ReadonlySet<VetAgeGroup> = new Set([
  VetAgeGroup.VET40,
  VetAgeGroup.VET50,
  VetAgeGroup.VET60,
  VetAgeGroup.VET70,
  VetAgeGroup.VET80,
])

function applyCrossEventEdges(events: EventState[], config: TournamentConfig): void {
  const byId = new Map(events.map(e => [e.competition.id, e]))

  for (const event of events) {
    const comp = event.competition

    // Indv→team gap. When a TEAM event lands on the same day as its individual
    // counterpart, force the team's first phase to start at indiv.last + INDIV_TEAM_MIN_GAP_MINS.
    if (comp.event_type === EventType.TEAM) {
      const ind = findIndividualCounterpart(comp, events.map(e => e.competition))
      if (ind) {
        const indEvent = byId.get(ind.id)
        if (indEvent && indEvent.assigned_day === event.assigned_day) {
          event.phases[0].cross_event_predecessors.push({
            event_id: ind.id,
            min_gap: config.INDIV_TEAM_MIN_GAP_MINS,
          })
        }
      }
    }

    // Vet age-banded sibling order. The younger sibling's pools wait on the
    // older sibling's last phase end + ADMIN_GAP_MINS.
    if (
      comp.category === Category.VETERAN &&
      comp.event_type === EventType.INDIVIDUAL &&
      comp.vet_age_group !== null &&
      VET_AGE_BANDED_GROUPS.has(comp.vet_age_group)
    ) {
      const myAgeWeight = vetAgeWeight(comp.vet_age_group)
      for (const other of events) {
        const oc = other.competition
        if (oc.id === comp.id) continue
        if (oc.category !== Category.VETERAN) continue
        if (oc.event_type !== EventType.INDIVIDUAL) continue
        if (oc.vet_age_group === null) continue
        if (!VET_AGE_BANDED_GROUPS.has(oc.vet_age_group)) continue
        if (oc.gender !== comp.gender) continue
        if (oc.weapon !== comp.weapon) continue
        if (other.assigned_day !== event.assigned_day) continue

        const otherWeight = vetAgeWeight(oc.vet_age_group)
        // Younger has higher weight in this map (VET40 > VET80).
        // The older one finishes first; younger waits on it.
        if (myAgeWeight > otherWeight) {
          event.phases[0].cross_event_predecessors.push({
            event_id: oc.id,
            min_gap: config.ADMIN_GAP_MINS,
          })
        }
      }
    }
  }
}

const VET_AGE_WEIGHT: Partial<Record<VetAgeGroup, number>> = {
  [VetAgeGroup.VET80]: 0,
  [VetAgeGroup.VET70]: 1,
  [VetAgeGroup.VET60]: 2,
  [VetAgeGroup.VET50]: 3,
  [VetAgeGroup.VET40]: 4,
}
function vetAgeWeight(g: VetAgeGroup): number {
  return VET_AGE_WEIGHT[g] ?? 0
}

// ──────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────

function runConcurrentLoop(
  events: EventState[],
  state: GlobalState,
  config: TournamentConfig,
): void {
  // Seed the ready queue with each event's first phase node. Initial
  // ready_time = max(dayStart, earliest_start). Cross-event predecessors are
  // resolved lazily inside the loop (the predecessor may not be RUNNING yet
  // when we seed).
  const ready: PhaseNode[] = []
  for (const event of events) {
    const first = event.phases[0]
    first.ready_time = Math.max(
      dayStart(event.assigned_day, config),
      event.competition.earliest_start,
    )
    first.state = PhaseState.READY
    ready.push(first)
  }

  const totalPhaseCount = events.reduce((sum, e) => sum + e.phases.length, 0)
  const maxIter = Math.max(totalPhaseCount * MAX_DEFERS_PER_PHASE * 2, 1)

  // Tracks (event_id|phase|cause) keys that have already emitted a one-shot
  // diagnostic so we don't spam the bottleneck list on every defer.
  const emittedDiagnostics = new Set<string>()

  let iter = 0
  while (ready.length > 0) {
    iter++
    if (iter > maxIter) {
      throw new Error(
        `concurrentScheduler: exceeded max iterations (${maxIter}) — likely an unbounded retry loop`,
      )
    }

    // Pick the highest-priority node and remove from the ready array.
    const idx = pickHighestPriorityIndex(ready, events)
    const node = ready.splice(idx, 1)[0]
    const event = findEventState(events, node.event_id)
    if (event === null || event.permanently_failed) {
      continue
    }

    // Resolve cross-event predecessor wait times: a predecessor is "done" once
    // its event's terminal phase is RUNNING with a known end_time, OR the
    // predecessor's last phase has a non-zero end_time.
    const predReady = predecessorReadyTime(node, events)
    if (predReady !== null && predReady > node.ready_time) {
      const oldReady = node.ready_time
      node.ready_time = predReady
      // Emit SEQUENCING_CONSTRAINT.
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: Phase.SEQUENCING,
        cause: BottleneckCause.SEQUENCING_CONSTRAINT,
        severity: BottleneckSeverity.INFO,
        delay_mins: predReady - oldReady,
        message: `${event.competition.id} ${node.phase_label}: delayed ${predReady - oldReady}min by cross-event dependency`,
        attempt_id: event.attempt_id,
      })
    }

    // Snap ready_time to slot boundary.
    node.ready_time = snapToSlot(node.ready_time)

    // Try to allocate.
    const allocated = tryAllocate(node, event, state, config)
    if (allocated.outcome === 'ok') {
      // Promote successor and push it onto the ready queue.
      if (node.successor_index >= 0) {
        const succ = event.phases[node.successor_index]
        succ.ready_time = Math.max(
          succ.ready_time,
          snapToSlot(node.end_time + config.ADMIN_GAP_MINS),
        )
        // Flight A → Flight B uses FLIGHT_BUFFER_MINS gap, not ADMIN_GAP_MINS.
        if (node.kind === PhaseKind.FLIGHT_A) {
          succ.ready_time = Math.max(
            succ.ready_time,
            snapToSlot(node.end_time + config.FLIGHT_BUFFER_MINS),
          )
        }
        succ.state = PhaseState.READY
        ready.push(succ)
      } else {
        // Terminal phase succeeded — record the result.
        commitEventResult(event, state, config)
      }
    } else if (allocated.outcome === 'defer') {
      // Push back with new ready_time. Monotonicity check.
      if (allocated.next_ready_time <= node.ready_time) {
        throw new Error(
          `concurrentScheduler: monotonicity violated — node ${node.event_id}/${node.phase_label} new ready_time ${allocated.next_ready_time} <= old ${node.ready_time}`,
        )
      }
      node.ready_time = allocated.next_ready_time
      node.defer_count++
      if (node.defer_count > MAX_DEFERS_PER_PHASE) {
        // Treat as failure cascade.
        handlePhaseFailure(node, event, ready, state, config)
        continue
      }
      // Emit NO_WINDOW_DIAGNOSTIC.
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.NO_WINDOW_DIAGNOSTIC,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${event.competition.id} ${node.phase_label}: deferred to ${allocated.next_ready_time} (reason: ${allocated.reason})`,
        attempt_id: event.attempt_id,
      })
      // Emit STRIP_CONTENTION (INFO) one-shot per (event, phase) when the
      // miss reason is STRIPS and the phase is not video-required (video gets
      // its own VIDEO_STRIP_CONTENTION emission at allocation time). We do
      // not emit on reason === 'TIME' — that's a NO_WINDOW_DIAGNOSTIC concern.
      if (allocated.reason === 'STRIPS' && !node.video_required) {
        const key = `${event.competition.id}|${node.phase_label}|STRIP_CONTENTION`
        if (!emittedDiagnostics.has(key)) {
          emittedDiagnostics.add(key)
          state.bottlenecks.push({
            competition_id: event.competition.id,
            phase: node.phase_label,
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.INFO,
            delay_mins: 0,
            message: `${event.competition.id} ${node.phase_label}: strip contention forced deferral`,
            attempt_id: event.attempt_id,
          })
        }
      }
      ready.push(node)
    } else {
      // outcome === 'fail' — cascade and possibly retry.
      handlePhaseFailure(node, event, ready, state, config)
    }
  }
}

/**
 * Handles a phase-node failure: cascade to all not-yet-RUNNING phases of the
 * event, attempt 1 retries from dayStart, attempt 2 marks the event permanently
 * failed and emits DEADLINE_BREACH_UNRESOLVABLE.
 */
function handlePhaseFailure(
  node: PhaseNode,
  event: EventState,
  ready: PhaseNode[],
  state: GlobalState,
  config: TournamentConfig,
): void {
  // Cascade — mark all not-yet-RUNNING phases FAILED.
  for (const p of event.phases) {
    if (p.state !== PhaseState.RUNNING) p.state = PhaseState.FAILED
  }
  // Drop any ready entries belonging to this event from the ready queue.
  for (let i = ready.length - 1; i >= 0; i--) {
    if (ready[i].event_id === event.competition.id) ready.splice(i, 1)
  }

  if (event.attempt_id === 1) {
    // Roll back attempt 1's allocations.
    releaseEventAllocations(state, event.competition.id, 1)
    state.bottlenecks.push({
      competition_id: event.competition.id,
      phase: Phase.DEADLINE_CHECK,
      cause: BottleneckCause.DEADLINE_BREACH,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${event.competition.id}: attempt 1 failed at ${node.phase_label}, retrying`,
      attempt_id: 1,
    })
    // Reset all phases to PENDING/READY at dayStart.
    event.attempt_id = 2
    resetEventPhases(event, config)
    ready.push(event.phases[0])
  } else {
    // Attempt 2 failed — permanent.
    releaseEventAllocations(state, event.competition.id, 2)
    state.bottlenecks.push({
      competition_id: event.competition.id,
      phase: Phase.DEADLINE_CHECK,
      cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: `${event.competition.id}: both attempts failed at ${node.phase_label}, event unscheduled`,
      attempt_id: 2,
    })
    event.permanently_failed = true
  }
}

/**
 * Resets an event's phase nodes to PENDING/READY for retry. The first node is
 * READY at dayStart; the rest are PENDING with cleared timestamps and defer
 * counts.
 */
function resetEventPhases(event: EventState, config: TournamentConfig): void {
  for (let i = 0; i < event.phases.length; i++) {
    const p = event.phases[i]
    p.state = PhaseState.PENDING
    p.ready_time = 0
    p.end_time = 0
    p.defer_count = 0
  }
  event.phases[0].ready_time = Math.max(
    dayStart(event.assigned_day, config),
    event.competition.earliest_start,
  )
  event.phases[0].state = PhaseState.READY

  // Reset relevant result fields. Day assignment, ids, baselines stay.
  const r = event.result
  r.pool_start = null
  r.pool_end = null
  r.pool_strip_count = 0
  r.pool_refs_count = 0
  r.flight_a_start = null
  r.flight_a_end = null
  r.flight_a_strips = 0
  r.flight_a_refs = 0
  r.flight_b_start = null
  r.flight_b_end = null
  r.flight_b_strips = 0
  r.flight_b_refs = 0
  r.de_start = null
  r.de_end = null
  r.de_strip_count = 0
  r.de_prelims_start = null
  r.de_prelims_end = null
  r.de_prelims_strip_count = 0
  r.de_round_of_16_start = null
  r.de_round_of_16_end = null
  r.de_round_of_16_strip_count = 0
  r.de_total_end = null
  r.pool_duration_actual = 0
  r.de_duration_actual = 0
}

// ──────────────────────────────────────────────
// Allocation per phase
// ──────────────────────────────────────────────

type AllocateOutcome =
  | { outcome: 'ok' }
  | { outcome: 'defer'; next_ready_time: number; reason: 'STRIPS' | 'TIME' }
  | { outcome: 'fail' }

/**
 * Attempts to allocate the phase node. On success mutates the event's result
 * and the global state via `allocateInterval` / `allocatePods`. On a deferrable
 * miss returns `next_ready_time`. On an unrecoverable miss (no slot before
 * dayHardEnd) returns `fail`.
 */
function tryAllocate(
  node: PhaseNode,
  event: EventState,
  state: GlobalState,
  config: TournamentConfig,
): AllocateOutcome {
  const day = event.assigned_day
  // Day-window cap is the tighter of dayEnd and the event's latest_end constraint.
  const dayHardEnd = Math.min(dayEnd(day, config), event.competition.latest_end)

  // Strip cap.
  const cap =
    node.cap_kind === 'POOL'
      ? computeStripCap(
          config.strips_total,
          config.max_pool_strip_pct,
          event.competition.max_pool_strip_pct_override,
        )
      : computeStripCap(
          config.strips_total,
          config.max_de_strip_pct,
          event.competition.max_de_strip_pct_override,
        )
  const cappedCount = Math.max(1, Math.min(node.desired_strip_count, cap))

  // Duration depends on phase kind.
  const duration = computePhaseDuration(node, cappedCount, event)

  // STAGED-DE phases use pods.
  if (node.use_pods) {
    const podSize = DE_POD_SIZE
    const fitsInDay = node.ready_time + duration <= dayHardEnd
    if (!fitsInDay) {
      // Try deferring once via window probe to confirm STRIPS vs TIME.
      const win = findAvailableStripsInWindow(
        state, config, cappedCount, node.ready_time, duration, node.video_required, day,
      )
      if (win.fit === 'none' && win.earliest_next_start !== null && win.earliest_next_start + duration <= dayHardEnd) {
        return { outcome: 'defer', next_ready_time: win.earliest_next_start, reason: win.reason }
      }
      return { outcome: 'fail' }
    }

    const podResult = allocatePods(
      state, config, event.competition.id, node.phase_label,
      cappedCount, podSize, node.ready_time, duration, node.video_required,
    )
    if (podResult === null) {
      // Deferrable? Probe the window helper to find earliest_next_start.
      const win = findAvailableStripsInWindow(
        state, config, cappedCount, node.ready_time, duration, node.video_required, day,
      )
      if (win.fit === 'none' && win.earliest_next_start !== null && win.earliest_next_start + duration <= dayHardEnd) {
        return { outcome: 'defer', next_ready_time: snapToSlot(win.earliest_next_start), reason: win.reason }
      }
      return { outcome: 'fail' }
    }

    // Success — record on result.
    node.state = PhaseState.RUNNING
    node.end_time = node.ready_time + duration
    onPhaseAllocated(node, event, cappedCount, state, config)
    // Video contention bottleneck for video phases that had to delay.
    if (node.video_required && node.defer_count > 0) {
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${event.competition.id} ${node.phase_label}: video-required phase delayed by contention`,
        attempt_id: event.attempt_id,
      })
    }
    return { outcome: 'ok' }
  }

  // Non-pod (POOLS / FLIGHT_A / FLIGHT_B / DE_SINGLE).
  const win = findAvailableStripsInWindow(
    state, config, cappedCount, node.ready_time, duration, node.video_required, day,
  )
  if (win.fit === 'ok') {
    const startTime = node.ready_time
    const endTime = startTime + duration
    if (endTime > dayHardEnd) {
      // Even a successful fit overruns the day — fail. Flag as SAME_DAY_VIOLATION.
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.SAME_DAY_VIOLATION,
        severity: BottleneckSeverity.ERROR,
        delay_mins: 0,
        message: `${event.competition.id} ${node.phase_label}: ends at ${endTime} past day-end ${dayHardEnd}`,
        attempt_id: event.attempt_id,
      })
      return { outcome: 'fail' }
    }
    allocateInterval(state, event.competition.id, node.phase_label, win.strip_indices, startTime, endTime)
    node.state = PhaseState.RUNNING
    node.end_time = endTime
    onPhaseAllocated(node, event, win.strip_indices.length, state, config)
    return { outcome: 'ok' }
  }

  // Miss.
  if (win.earliest_next_start !== null && win.earliest_next_start + duration <= dayHardEnd) {
    return { outcome: 'defer', next_ready_time: snapToSlot(win.earliest_next_start), reason: win.reason }
  }
  return { outcome: 'fail' }
}

/**
 * Computes the actual (possibly cap-scaled) duration for a phase node given
 * the strip-count it ended up with. Pools recompute via estimatePoolDuration
 * (more rounds when strips are limited); DE phases scale duration by
 * (target_strips / actual_strips).
 */
function computePhaseDuration(node: PhaseNode, cappedCount: number, event: EventState): number {
  if (node.kind === PhaseKind.POOLS) {
    const pd = estimatePoolDuration(
      event.poolStructure.n_pools,
      event.poolBaseline,
      cappedCount,
      event.poolRefRes.refs_per_pool,
    )
    return pd.actual_duration
  }
  if (node.kind === PhaseKind.FLIGHT_A) {
    const flightAPools = Math.ceil(event.poolStructure.n_pools / 2)
    return estimatePoolDuration(flightAPools, event.poolBaseline, cappedCount, event.poolRefRes.refs_per_pool).actual_duration
  }
  if (node.kind === PhaseKind.FLIGHT_B) {
    const flightBPools = Math.floor(event.poolStructure.n_pools / 2)
    return estimatePoolDuration(flightBPools, event.poolBaseline, cappedCount, event.poolRefRes.refs_per_pool).actual_duration
  }
  if (node.kind === PhaseKind.DE_PRELIMS) {
    const ratio = cappedCount / Math.max(node.desired_strip_count, 1)
    return snapToSlot(Math.ceil(node.duration_at_full / Math.max(ratio, 0.01)))
  }
  if (node.kind === PhaseKind.DE_R16) {
    const ratio = cappedCount / Math.max(node.desired_strip_count, 1)
    return snapToSlot(Math.ceil(node.duration_at_full / Math.max(ratio, 0.01)))
  }
  // DE_SINGLE: duration scales with ratio, but excludes gold-bout fraction.
  const totalBouts = Math.floor(event.bracketSize / 2)
  const adjustedTotal = totalBouts > 0 ? event.totalDeBase * (totalBouts - 1) / totalBouts : 0
  const ratio = Math.min(cappedCount / Math.max(node.desired_strip_count, 1), 1.0)
  if (ratio >= 1.0) return Math.round(adjustedTotal)
  return Math.ceil(adjustedTotal / ratio)
}

/**
 * Writes phase-allocation results back into the event's ScheduleResult shell.
 * Each phase kind owns its own subset of fields.
 */
function onPhaseAllocated(
  node: PhaseNode,
  event: EventState,
  stripCount: number,
  state: GlobalState,
  _config: TournamentConfig,
): void {
  const r = event.result
  const startTime = node.ready_time
  const endTime = node.end_time

  switch (node.kind) {
    case PhaseKind.POOLS:
      r.pool_start = startTime
      r.pool_end = endTime
      r.pool_strip_count = stripCount
      r.pool_refs_count = event.poolRefRes.refs_needed
      r.pool_duration_actual = endTime - startTime
      break
    case PhaseKind.FLIGHT_A: {
      const refs = Math.ceil(event.poolRefRes.refs_needed / 2)
      r.flight_a_start = startTime
      r.flight_a_end = endTime
      r.flight_a_strips = stripCount
      r.flight_a_refs = refs
      r.pool_start = startTime
      r.pool_duration_actual = endTime - startTime
      break
    }
    case PhaseKind.FLIGHT_B: {
      const refs = Math.floor(event.poolRefRes.refs_needed / 2)
      r.flight_b_start = startTime
      r.flight_b_end = endTime
      r.flight_b_strips = stripCount
      r.flight_b_refs = refs
      r.pool_end = endTime
      r.pool_strip_count = (r.flight_a_strips ?? 0) + stripCount
      r.pool_refs_count = (r.flight_a_refs ?? 0) + refs
      r.pool_duration_actual = (r.pool_duration_actual ?? 0) + (endTime - startTime)
      // FLIGHT_B_DELAYED diagnostic if delayed past Flight A's natural buffer.
      const flightANaturalStart = (r.flight_a_end ?? 0) + 0
      const idealStart = flightANaturalStart // already includes FLIGHT_BUFFER_MINS via successor.ready_time
      const delay = startTime - idealStart
      if (delay > 30) {
        state.bottlenecks.push({
          competition_id: event.competition.id,
          phase: Phase.FLIGHT_B,
          cause: BottleneckCause.FLIGHT_B_DELAYED,
          severity: BottleneckSeverity.WARN,
          delay_mins: delay,
          message: `${event.competition.id} Flight B delayed ${delay}min past Flight A end`,
          attempt_id: event.attempt_id,
        })
      }
      break
    }
    case PhaseKind.DE_PRELIMS:
      r.de_prelims_start = startTime
      r.de_prelims_end = endTime
      r.de_prelims_strip_count = stripCount
      r.de_duration_actual = (r.de_duration_actual ?? 0) + (endTime - startTime)
      break
    case PhaseKind.DE_R16:
      r.de_round_of_16_start = startTime
      r.de_round_of_16_end = endTime
      r.de_round_of_16_strip_count = stripCount
      r.de_duration_actual = (r.de_duration_actual ?? 0) + (endTime - startTime)
      break
    case PhaseKind.DE_SINGLE:
      r.de_start = startTime
      r.de_end = endTime
      r.de_strip_count = stripCount
      r.de_duration_actual = endTime - startTime
      break
  }
}

/**
 * Called when an event's terminal phase has completed. Sets de_total_end via
 * tailEstimateMins and copies the result into state.schedule.
 */
function commitEventResult(
  event: EventState,
  state: GlobalState,
  _config: TournamentConfig,
): void {
  const r = event.result
  // Determine the terminal-phase end time.
  const lastPhase = event.phases[event.phases.length - 1]
  let terminalEnd: number | null = null
  switch (lastPhase.kind) {
    case PhaseKind.DE_R16:
      terminalEnd = r.de_round_of_16_end
      break
    case PhaseKind.DE_SINGLE:
      terminalEnd = r.de_end
      break
    case PhaseKind.POOLS:
      terminalEnd = r.pool_end
      break
    case PhaseKind.FLIGHT_B:
      terminalEnd = r.flight_b_end ?? r.pool_end
      break
    default:
      terminalEnd = lastPhase.end_time
  }
  if (terminalEnd !== null) {
    r.de_total_end = terminalEnd + tailEstimateMins(event.competition.event_type)
  }
  state.schedule[event.competition.id] = r
}

// ──────────────────────────────────────────────
// Priority + dependency helpers
// ──────────────────────────────────────────────

/**
 * Picks the index in `ready` of the highest-priority node. Priority order:
 * 1. Earlier ready_time first
 * 2. Y8/Y10 first — must start in the first slot of the day (mirrors
 *    daySequencing.ts rule 1; without this, large events grab strip-time at
 *    dayStart and the small youth events get crowded out of their DE windows).
 * 3. Video-required first
 * 4. Larger desired_strip_count first
 * 5. Higher constraint_score first
 */
function pickHighestPriorityIndex(ready: PhaseNode[], events: EventState[]): number {
  let bestIdx = 0
  for (let i = 1; i < ready.length; i++) {
    if (compareNodes(ready[i], ready[bestIdx], events) < 0) bestIdx = i
  }
  return bestIdx
}

function isYouthPriorityCategory(category: Category): boolean {
  return category === Category.Y8 || category === Category.Y10
}

function compareNodes(a: PhaseNode, b: PhaseNode, events: EventState[]): number {
  // Lower ready_time wins.
  if (a.ready_time !== b.ready_time) return a.ready_time - b.ready_time
  // Y8/Y10 wins — youth-priority categories must start early in the day.
  const aEvent = findEventState(events, a.event_id)
  const bEvent = findEventState(events, b.event_id)
  const aYouth = aEvent !== null && isYouthPriorityCategory(aEvent.competition.category)
  const bYouth = bEvent !== null && isYouthPriorityCategory(bEvent.competition.category)
  if (aYouth !== bYouth) return aYouth ? -1 : 1
  // Video-required wins.
  if (a.video_required !== b.video_required) return a.video_required ? -1 : 1
  // Larger strip count wins (more negative comes first → return b - a).
  if (a.desired_strip_count !== b.desired_strip_count) return b.desired_strip_count - a.desired_strip_count
  // Higher constraint score wins.
  const aScore = aEvent?.constraint_score ?? 0
  const bScore = bEvent?.constraint_score ?? 0
  if (aScore !== bScore) return bScore - aScore
  // Tie — stable on event_id.
  return a.event_id.localeCompare(b.event_id)
}

function findEventState(events: EventState[], event_id: string): EventState | null {
  for (const e of events) {
    if (e.competition.id === event_id) return e
  }
  return null
}

/**
 * Computes the ready_time floor imposed by cross-event predecessors. Returns
 * null when no predecessor exists. Predecessor "done time" comes from the
 * event's terminal phase end_time (RUNNING) or its de_total_end on the schedule.
 */
function predecessorReadyTime(node: PhaseNode, events: EventState[]): number | null {
  if (node.cross_event_predecessors.length === 0) return null
  let maxFloor = -Infinity
  for (const dep of node.cross_event_predecessors) {
    const depEvent = findEventState(events, dep.event_id)
    if (depEvent === null) continue
    // Predecessor must have all phases RUNNING for us to know its end.
    const depEnd = depEvent.phases[depEvent.phases.length - 1].end_time
    if (depEvent.phases[depEvent.phases.length - 1].state !== PhaseState.RUNNING) continue
    const floor = depEnd + dep.min_gap
    if (floor > maxFloor) maxFloor = floor
  }
  if (maxFloor === -Infinity) return null
  return maxFloor
}

// ──────────────────────────────────────────────
// Post-schedule ref demand
// ──────────────────────────────────────────────

/**
 * Builds ref_demand_by_day from final allocation state.
 *
 * Pool / Flight / SINGLE_STAGE-DE phases (no pod_id): one RefDemandInterval
 * per allocation interval, where `count` is sourced from `peakConcurrentStrips`
 * for that interval's window, scaled by `refs_per_pool` (pool/flight) or
 * `DE_REFS` (SINGLE_STAGE DE). Plan line 102: peakConcurrentStrips drives the
 * post-schedule ref output and replaces the older sweep-line on
 * RefDemandInterval[].
 *
 * STAGED-DE pods: `computePodRefDemand` emits one interval (count=1) per pod —
 * the pod abstraction already encodes "1 head ref per pod".
 */
function computePostScheduleRefDemand(
  state: GlobalState,
  config: TournamentConfig,
  competitions: Competition[],
): Record<number, RefDemandByDay> {
  const result: Record<number, RefDemandByDay> = {}

  // Distinct non-pod allocations keyed by (event_id, phase, start, end). Each
  // unique window represents one phase block; we use peakConcurrentStrips to
  // measure the actual concurrent strip occupancy in that window.
  const seen = new Set<string>()
  type NonPodWindow = { event_id: string; phase: Phase; start: number; end: number }
  const windows: NonPodWindow[] = []
  for (let i = 0; i < state.strip_allocations.length; i++) {
    const list = state.strip_allocations[i]
    for (const a of list) {
      if (a.pod_id !== undefined) continue
      const key = `${a.event_id}|${a.phase}|${a.start_time}|${a.end_time}`
      if (seen.has(key)) continue
      seen.add(key)
      windows.push({ event_id: a.event_id, phase: a.phase, start: a.start_time, end: a.end_time })
    }
  }

  const compById = new Map(competitions.map(c => [c.id, c]))
  for (const w of windows) {
    const comp = compById.get(w.event_id)
    if (!comp) continue
    const day = findDayForTime(config, w.start)
    if (day === null) continue
    if (!result[day]) result[day] = { intervals: [] }

    // Use peakConcurrentStrips to count how many strips this event occupies
    // across the window, then scale to ref demand. We restrict the peak read
    // by filtering allocations down to this event's contribution: we re-walk
    // the allocations directly because peakConcurrentStrips is not
    // event-scoped. Use its return as a sanity bound but compute the
    // event-specific concurrent count from the per-strip lists.
    const peak = peakConcurrentStrips(state, config, { start: w.start, end: w.end })
    let stripsForEvent = 0
    for (const stripList of state.strip_allocations) {
      for (const a of stripList) {
        if (a.event_id !== w.event_id) continue
        if (a.phase !== w.phase) continue
        if (a.start_time !== w.start || a.end_time !== w.end) continue
        stripsForEvent++
      }
    }
    // Cap by total peak so a degenerate scan can never claim more strips than
    // the day actually saw concurrently.
    if (stripsForEvent > peak.total) stripsForEvent = peak.total

    let count: number
    if (w.phase === Phase.POOLS || w.phase === Phase.FLIGHT_A || w.phase === Phase.FLIGHT_B) {
      const refRes = resolveRefsPerPool(
        comp.ref_policy,
        computePoolStructure(comp.fencer_count, comp.use_single_pool_override).n_pools,
      )
      count = w.phase === Phase.POOLS
        ? refRes.refs_needed
        : Math.max(1, Math.round(refRes.refs_needed / 2))
    } else if (w.phase === Phase.DE) {
      count = stripsForEvent * config.DE_REFS
    } else {
      count = stripsForEvent
    }

    result[day].intervals.push({
      startTime: w.start,
      endTime: w.end,
      count,
      weapon: comp.weapon,
    })
  }

  // STAGED-DE pods.
  const podDemand = computePodRefDemand(state, config, competitions)
  for (const [dayKey, byDay] of Object.entries(podDemand)) {
    const d = Number(dayKey)
    if (!result[d]) result[d] = { intervals: [] }
    result[d].intervals.push(...byDay.intervals)
  }

  return result
}

// ──────────────────────────────────────────────
// postScheduleWarnings — METHODOLOGY.md §Phase 7: Post-Schedule Warnings
// ──────────────────────────────────────────────

/**
 * Generates post-schedule warnings per METHODOLOGY.md §Phase 7: Post-Schedule Warnings (Ops Manual Group 2).
 * For 4+ day events: warns if first or last day is longer than the average
 * middle day duration.
 */
export function postScheduleWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
): Bottleneck[] {
  const warnings: Bottleneck[] = []

  if (config.days_available < 4) return warnings

  // Compute max duration per day (from day start to latest event end)
  const dayDurations: Record<number, number> = {}

  for (const r of Object.values(schedule)) {
    const end = r.de_total_end ?? r.pool_end
    // start is only used as a null guard — if no pool/flight started, skip this event.
    // Duration is measured from dayStart, not from the event's start time.
    const start = r.pool_start ?? r.flight_a_start
    if (end === null || start === null) continue

    const ds = dayStart(r.assigned_day, config)
    const duration = end - ds
    dayDurations[r.assigned_day] = Math.max(dayDurations[r.assigned_day] ?? 0, duration)
  }

  // Middle days: indices 1 through (days_available - 2)
  const middleDays: number[] = []
  for (let d = 1; d <= config.days_available - 2; d++) {
    middleDays.push(d)
  }

  if (middleDays.length === 0) return warnings

  const avgMiddle =
    middleDays.reduce((sum, d) => sum + (dayDurations[d] ?? 0), 0) / middleDays.length

  const firstDayDur = dayDurations[0] ?? 0
  const lastDayDur = dayDurations[config.days_available - 1] ?? 0

  if (firstDayDur > avgMiddle * 1.1) {
    warnings.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `First day (${firstDayDur} min) is longer than average middle day (${Math.round(avgMiddle)} min)`,
    })
  }

  if (lastDayDur > avgMiddle * 1.1) {
    warnings.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `Last day (${lastDayDur} min) is longer than average middle day (${Math.round(avgMiddle)} min)`,
    })
  }

  return warnings
}

// ──────────────────────────────────────────────
// postScheduleDiagnostics — resource recommendations
// ──────────────────────────────────────────────

/**
 * When scheduling fails due to resource exhaustion, emits INFO-severity
 * recommendations telling users how many strips and refs they actually need.
 * Returns empty array if no RESOURCE_EXHAUSTION errors exist.
 */
export function postScheduleDiagnostics(
  competitions: Competition[],
  config: TournamentConfig,
  bottlenecks: Bottleneck[],
): Bottleneck[] {
  const results: Bottleneck[] = []

  const hasResourceExhaustion = bottlenecks.some(
    b => b.severity === BottleneckSeverity.ERROR && b.cause === BottleneckCause.RESOURCE_EXHAUSTION,
  )
  if (!hasResourceExhaustion) return results

  // Strip recommendation
  const recommended = recommendStripCount(competitions, config.max_pool_strip_pct)
  if (recommended > config.strips_total) {
    results.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.RESOURCE_RECOMMENDATION,
      severity: BottleneckSeverity.INFO,
      delay_mins: 0,
      message: `Strips: need ${recommended}, have ${config.strips_total} — add ${recommended - config.strips_total} more (or enable flighting for large events).`,
    })
  }

  return results
}

// ──────────────────────────────────────────────
// postScheduleDayBreakdown — per-day resource summaries
// ──────────────────────────────────────────────

/**
 * After scheduling, emits per-day resource summaries for days that have
 * at least one failed competition. Shows strip-hour and ref usage vs capacity.
 */
export function postScheduleDayBreakdown(
  competitions: Competition[],
  config: TournamentConfig,
  state: GlobalState,
): Bottleneck[] {
  const results: Bottleneck[] = []

  // Identify days that have at least one failed event
  const failedCompIds = new Set(
    state.bottlenecks
      .filter(b => b.severity === BottleneckSeverity.ERROR)
      .map(b => b.competition_id)
      .filter(id => id !== ''),
  )
  if (failedCompIds.size === 0) return results

  // Determine which days had failures (assigned_day from schedule, or all days for unscheduled comps)
  const daysWithFailures = new Set<number>()
  for (const compId of failedCompIds) {
    const sr = state.schedule[compId]
    if (sr) {
      daysWithFailures.add(sr.assigned_day)
    } else {
      // Competition never got a day assignment — all days are relevant
      for (let d = 0; d < config.days_available; d++) daysWithFailures.add(d)
    }
  }

  for (const day of [...daysWithFailures].sort((a, b) => a - b)) {
    // Strip-hours summary
    const consumed = dayConsumedCapacity(day, state, competitions, config)
    const totalCapacity = config.strips_total * (config.DAY_LENGTH_MINS / 60)
    const stripDeficit = Math.max(0, consumed.strip_hours_consumed - totalCapacity)

    results.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.DAY_RESOURCE_SUMMARY,
      severity: stripDeficit > 0 ? BottleneckSeverity.WARN : BottleneckSeverity.INFO,
      delay_mins: 0,
      message: `Day ${day + 1} strips: ${consumed.strip_hours_consumed.toFixed(1)} strip-hours consumed of ${totalCapacity.toFixed(1)} available${stripDeficit > 0 ? ` (${stripDeficit.toFixed(1)} over capacity)` : ''}.`,
    })

    // Sum peak ref demand across scheduled competitions on this day.
    // Each competition's peak is the larger of its pool and DE demand.
    const compsOnDay = competitions.filter(c => state.schedule[c.id]?.assigned_day === day)
    let peakRefDemand = 0
    for (const comp of compsOnDay) {
      if (comp.fencer_count <= 1) continue
      const poolDemand = peakPoolRefDemand(comp, comp.ref_policy)
      const deDemand = peakDeRefDemand(comp, config)
      peakRefDemand += Math.max(poolDemand, deDemand)
    }

    if (peakRefDemand > 0) {
      results.push({
        competition_id: '',
        phase: Phase.POST_SCHEDULE,
        cause: BottleneckCause.DAY_RESOURCE_SUMMARY,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `Day ${day + 1} refs: peak demand ${peakRefDemand}.`,
      })
    }

    // Video-stage DE ref contention
    const stagedComps = compsOnDay.filter(c => c.de_mode === DeMode.STAGED)
    const stagedCount = stagedComps.length
    const videoStageSum = stagedComps.reduce(
      (sum, c) => sum + peakDeStripDemand(c),
      0,
    )
    if (videoStageSum > 0) {
      results.push({
        competition_id: '',
        phase: Phase.POST_SCHEDULE,
        cause: BottleneckCause.DAY_RESOURCE_SUMMARY,
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `Day ${day + 1} video-stage DE ref demand: ${videoStageSum} refs across ${stagedCount} staged events`,
      })
    }
  }

  return results
}
