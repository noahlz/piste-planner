/**
 * Concurrent Phase Scheduler — METHODOLOGY.md §Concurrent Phase Scheduler
 *
 * OS-process-scheduling style loop over phase nodes. Each event decomposes into
 * a sequence of phase nodes (pools → DE phases) that depend on one another.
 * The loop pops the highest-priority READY phase, allocates resources via the
 * interval-list strip primitives, and pushes successors as READY.
 *
 * Resources: `findAvailableStripsInWindow` / `allocateInterval` from Phases A/B.
 * Day assignment: `assignDaysByColoring` from `dayColoring.ts`. Post-schedule
 * pipeline (`postScheduleDiagnostics`, `postScheduleDayBreakdown`,
 * `postScheduleWarnings` are defined below in this file, while
 * `computeRefRequirements` comes from `refs.ts`) runs once the loop completes.
 *
 * Shipped as Phase D on 2026-04-27. The serial path is gone — `scheduleAll`
 * (`scheduler.ts`) is a thin shim over `scheduleAllConcurrent` below.
 */

import {
  DeMode,
  EventType,
  Phase,
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  Category,
  dayStart,
  clockOnDay,
  dayEnd,
  dayHardEnd,
  dayMidnight,
  tailEstimateMins,
  ValidationMode,
} from './types.ts'
import type {
  Competition,
  TournamentConfig,
  ScheduleResult,
  Bottleneck,
  GlobalState,
  RefRequirementsByDay,
  StripAllocation,
  PinnedPlacement,
  DeBlocks,
  DeRound,
} from './types.ts'
import type { FindStripsInWindowResult } from './resources.ts'
import {
  createGlobalState,
  findAvailableStripsInWindow,
  allocateInterval,
  releaseEventAllocations,
  snapToSlot,
} from './resources.ts'
import {
  computePoolStructure,
  resolveRefsPerPool,
  estimatePoolDuration,
  weightedPoolDuration,
  computeDeFencerCount,
  isSizeableCount,
} from './pools.ts'
import { deBlocksFor, deRoundsMinutes } from './de.ts'
import { computeStripCap, peakDeStripDemand } from './stripBudget.ts'
import { computeRefRequirements, peakPoolRefDemand, peakDeRefDemand, refDemandFromSchedule } from './refs.ts'
import { phaseRequiresVideo, unseatedPhases } from './unseated.ts'
import { compareIds } from './order.ts'
import { findIndividualCounterpart, isAgeBandedVet, vetBandRank } from './crossover.ts'
import { GROUP_1_MANDATORY, GROUP_1_SOFT_TYPES, REGIONAL_GROUP_1_WINDOW_MINS, VET_STAGGER_MINS } from './constants.ts'
import {
  WaitAnchor,
  PredecessorState,
  passOverFailed,
  resolveWaits,
  assertAcyclicWaits,
  assertEveryEventResolved,
} from './crossEventWaits.ts'
import type { CrossEventWait, PredecessorStatus } from './crossEventWaits.ts'
import { buildConstraintGraph } from './constraintGraph.ts'
import { assignDaysByColoring } from './dayColoring.ts'
import { vetCoDaySplitFindings } from './placementRules.ts'
import { constraintScore } from './dayAssignment.ts'
import { validateConfig, FeasibilityRule } from './validation.ts'
import { dayConsumedCapacity } from './capacity.ts'

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
 * the phase nodes need (durations, strip targets).
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
  deBlocks: DeBlocks
  // The phase nodes that belong to this event, in topological order.
  phases: PhaseNode[]
  // Constraint score for priority tie-breaking.
  constraint_score: number
  // Once the event permanently fails (after attempt 2) this flag is set.
  permanently_failed: boolean
  // The regional Group 1 window's fixed ready-time floor for the first phase
  // (absolute minutes), or null. Set by `applyCrossEventEdges` on the older
  // side of a pair; the loop's seed and the retry reset apply it.
  group1_window_floor: number | null
  // The waits this event's first phase owes other events on its day (METHODOLOGY
  // §Cross-Event Dependency Edges), set by `applyCrossEventEdges`. Topology,
  // fixed for the run: a retry resets phases, not waits.
  cross_event_waits: CrossEventWait[]
  // The first phase's ready-time floor once every wait is resolved (absolute
  // minutes, snapped) and the predecessors that set it, or null when the event
  // has no wait or every wait lapsed. Stored here rather than on the node so the
  // retry reset keeps it, as `group1_window_floor` is kept.
  cross_event_floor: { time: number; binding: readonly string[] } | null
}

/** A regional Group 1 pair sharing a day, whose older side `applyCrossEventEdges` floored. */
interface RegionalWindowPair {
  older: EventState
  younger: EventState
}

/**
 * One node in the phase dependency DAG. Phase nodes are owned by a single event.
 * `successor_index` is the index of the next phase node in the same event's
 * `phases` array, and -1 means terminal. Cross-event waits live on the event
 * (`EventState.cross_event_waits`) and bind its first node.
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
  // DE nodes only: the counted rounds this block runs, re-derived at the strips
  // granted (METHODOLOGY.md §DE Duration). Empty for pool and flight nodes.
  de_rounds: readonly DeRound[]
  video_required: boolean
  // The cap to apply (pool_cap or de_cap).
  cap_kind: 'POOL' | 'DE'
}

const MAX_DEFERS_PER_PHASE = 16

// ──────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────

/**
 * Rule ids whose ERROR findings are about the competitions they name, so the
 * violation scopes to those events rather than to the tournament (FR-006/007,
 * research.md D2).
 *
 * Written out by hand rather than inferred from `kind === RuleKind.STRUCTURAL`
 * or from whether a finding's `subjects` resolve to competition ids. Both
 * inferences admit `duplicate-competition-id`, which is the one rule that must
 * never be excluded: a schedule keyed by id cannot be built from a set with
 * duplicates in it, and dropping both copies discards a real event to fix a
 * naming problem. `strips-total-positive` is structural too, with a field name
 * in `subjects`. The list admits neither. `team-staged-or-video` is left off
 * deliberately (024 plan D4): the app never builds a STAGED or REQUIRED team,
 * so one marks a hand-built config rather than a bad event, and it rejects the
 * whole tournament.
 */
const PER_EVENT_ERROR_RULES: ReadonlySet<string> = new Set([
  'fencer-count-bounds',
  'cut-value-range',
  'cut-value-min-promotions',
  'video-r16-strip-shortfall',
])

/** Shared empties, so the no-pins path allocates nothing new (013 FR-058). */
const NO_PINS: readonly PinnedPlacement[] = Object.freeze([])
const NO_PINNED_IDS: ReadonlySet<string> = new Set<string>()

export function scheduleAllConcurrent(
  competitions: Competition[],
  config: TournamentConfig,
  pinned: readonly PinnedPlacement[] = NO_PINS,
): ScheduleAllResult {
  const state = createGlobalState(config)

  // Validation pass — same shape as serial scheduleAll. The scheduler is the
  // binding consumer: policy findings gate scheduling as errors (research D3).
  const validationErrors = validateConfig(config, competitions, ValidationMode.BINDING)
  for (const ve of validationErrors) {
    state.bottlenecks.push({
      competition_id: '',
      phase: Phase.VALIDATION,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      rule: ve.rule,
      subjects: ve.subjects,
      severity: ve.severity,
      delay_mins: 0,
      message: ve.message,
    })
  }
  // Findings are computed once, over the full competition set, and are never
  // recomputed over the reduced one (research.md D3) — the global rules are
  // sums over that set, so re-validating would turn "fails feasibility with 24
  // events" into "passes with 23", a scheduling decision dressed as validation.
  //
  // When every ERROR is on the per-event list, the competitions those findings
  // name are dropped and the remainder is scheduled (FR-006). One ERROR
  // bottleneck per finding is already in `state.bottlenecks` above, unchanged.
  // Any ERROR from outside the list — a global rule, or a per-event rule
  // alongside a global one — empties the whole schedule exactly as before
  // (FR-008).
  const errorFindings = validationErrors.filter(ve => ve.severity === BottleneckSeverity.ERROR)
  const scoped = errorFindings.length > 0
    && errorFindings.every(ve => PER_EVENT_ERROR_RULES.has(ve.rule))

  // The union of the scoped findings' subjects: two findings may name the same
  // competition, and the count below is of competitions, not of findings.
  const excludedIds = new Set<string>()
  if (scoped) {
    for (const ve of errorFindings) {
      for (const subject of ve.subjects) excludedIds.add(subject)
    }
  }
  const remaining = scoped ? competitions.filter(c => !excludedIds.has(c.id)) : competitions
  const excludedCount = competitions.length - remaining.length

  // `excludedCount === 0` covers the case where every subject named a
  // competition that is not in the set. The ERROR is real and nothing can be
  // removed to answer it, so the tournament is discarded as it is today rather
  // than scheduled in full with an unexplained ERROR attached.
  if (errorFindings.length > 0 && excludedCount === 0) {
    return {
      schedule: state.schedule,
      bottlenecks: state.bottlenecks,
      strip_allocations: state.strip_allocations,
    }
  }

  // One summary so a reader of a partial board knows it is partial (FR-009).
  if (excludedCount > 0) {
    state.bottlenecks.push({
      competition_id: '',
      phase: Phase.VALIDATION,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      rule: BottleneckRule.PER_EVENT_EXCLUSION_SUMMARY,
      subjects: [],
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${excludedCount} competition(s) excluded by per-event validation errors, leaving ${remaining.length} to schedule`,
    })
  }

  // A pin naming a competition this run is not scheduling — one the validation
  // pass above excluded, or one that was never in the set — is dropped. Day
  // range is the caller's to enforce (research D1).
  let activePins = pinned
  if (pinned.length > 0) {
    const remainingIds = new Set(remaining.map(c => c.id))
    activePins = pinned.filter(p => remainingIds.has(p.competition_id))
  }

  // Day assignment via DSatur graph coloring.
  const graph = buildConstraintGraph(remaining, config.tournament_type)
  const { dayMap, violations } = assignDaysByColoring(graph, remaining, config, activePins)

  // Build per-event state & phase nodes.
  const events = buildEventStates(remaining, dayMap, config)

  // Wire the cross-event waits (indv→team, the Vet co-day stagger) and the
  // regional Group 1 window's floors.
  const windowPairs = applyCrossEventEdges(events, config)

  // Pinned events claim their strip-time before the loop opens, at the day and
  // start the caller fixed, and are then kept out of the loop's seed so nothing
  // can defer, retry or move them (013 FR-054–FR-057, research D1).
  const pinnedIds = activePins.length > 0
    ? new Set(activePins.map(p => p.competition_id))
    : NO_PINNED_IDS
  if (activePins.length > 0) {
    preclaimPinnedEvents(activePins, events, state, config)
  }

  // Run the priority-queue loop.
  runConcurrentLoop(events, state, config, pinnedIds)
  state.bottlenecks.push(...regionalWindowFindings(windowPairs, state))

  // Materialize successful events into state.schedule. Already done inside the
  // loop after each event's terminal phase succeeds — see `commitEventResult`.

  // Report every hard edge the least-bad-color fallback broke to produce
  // dayMap (FR-003). One WARN per violated pair, naming both competitions.
  for (const violation of violations) {
    state.bottlenecks.push({
      competition_id: violation.id,
      phase: Phase.DAY_ASSIGNMENT,
      cause: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
      rule: BottleneckRule.HARD_SEPARATION_VIOLATED,
      subjects: [violation.id, violation.targetId].sort(),
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      day: dayMap.get(violation.id),
      message: `${violation.id} and ${violation.targetId} share a day: a hard separation could not be honored within the available days`,
    })
  }

  // A Vet co-day that a pin or the least-bad fallback split across days, judged
  // on the final day map, pins included (METHODOLOGY §Veteran Age-Group Co-Day
  // Rule). The same function serves the board's hand-placement check.
  state.bottlenecks.push(...vetCoDaySplitFindings(remaining, id => dayMap.get(id)))

  // Post-schedule ref demand from the scheduler's own timeline (METHODOLOGY.md
  // §Ref Demand Derivation, 017 spec §7): each phase at the times and on the
  // strips it allocated, waits included, less a phase that holds no strips.
  // Right after a run the footer draws this timeline, so the two count the
  // same intervals. Nothing in the scheduler reads it. `remaining`, not
  // `competitions`: an excluded event has no schedule entry.
  state.ref_demand_by_day = refDemandFromSchedule(
    Object.values(state.schedule),
    config,
    remaining,
    unseatedPhases(state),
  )

  // Standard post-schedule pipeline.
  const diagnostics = postScheduleDiagnostics(remaining, config, state.bottlenecks)
  state.bottlenecks.push(...diagnostics)
  const dayBreakdown = postScheduleDayBreakdown(remaining, config, state)
  state.bottlenecks.push(...dayBreakdown)
  const postWarnings = postScheduleWarnings(state.schedule, config)
  state.bottlenecks.push(...postWarnings)
  // Computed after the run, so the same pure function serves the drawn board
  // (018 T3) and because a WARN raised inside a failed attempt would be erased by
  // its rollback (`releaseEventAllocations`). A pinned last phase that broke its
  // limit keeps its ERROR (the pin is not retried), and the WARN is for an
  // overrun within the midnight limit, so that event gets no WARN on top.
  const overrunErrorIds = new Set(
    state.bottlenecks
      .filter((b) => b.rule === BottleneckRule.PHASE_OVERRUNS_DAY_END && b.severity === BottleneckSeverity.ERROR)
      .map((b) => b.competition_id),
  )
  state.bottlenecks.push(
    ...lastPhaseOverrunWarnings(state.schedule, config).filter((b) => !overrunErrorIds.has(b.competition_id)),
  )
  // The pool-start cutoff WARN (021 O2) is computed here for the same reason.
  // It never blocks placement, so an event that drew an ERROR still reports a
  // late start.
  state.bottlenecks.push(...poolStartAfterCutoffWarnings(state.schedule, config))

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

    // Guarded upstream: `validateConfig` raises `fencer-count-bounds` for every
    // count `isSizeableCount` rejects, and that rule is in
    // PER_EVENT_ERROR_RULES, so `scheduleAllConcurrent` either drops the event
    // or returns before this runs (018 T4).
    const poolStructure = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
    const poolBaseline = weightedPoolDuration(
      poolStructure,
      comp.weapon,
      config.pool_round_duration_table,
    )
    const refRes = resolveRefsPerPool(comp.ref_policy, poolStructure.n_pools)
    const deBlocks = deBlocksFor(comp, config)
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
      use_flighting: comp.flighted,
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
      bracket_size: deBlocks.bracketSize,
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
      pool_duration_baseline: poolBaseline,
      pool_duration_actual: 0,
      de_duration_baseline: deBlocks.baselineMinutes,
      de_duration_actual: 0,
    }

    const phases = buildPhaseNodes(comp, poolStructure, refRes, poolBaseline, deBlocks, config)

    events.push({
      competition: comp,
      assigned_day: day,
      attempt_id: 1,
      result,
      poolStructure,
      poolBaseline,
      poolRefRes: refRes,
      deBlocks,
      phases,
      constraint_score: constraintScore(comp, competitions, config),
      permanently_failed: false,
      group1_window_floor: null,
      cross_event_waits: [],
      cross_event_floor: null,
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
  deBlocks: DeBlocks,
  config: TournamentConfig,
): PhaseNode[] {
  const nodes: PhaseNode[] = []

  // Strip caps (cached per-phase-kind).
  const poolCap = computeStripCap(
    config.strips_total,
    config.max_pool_strip_pct,
    comp.max_pool_strip_pct_override,
  )

  // A flighted event splits its pools into Flight A and Flight B.
  if (comp.flighted) {
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
      de_rounds: [],
      video_required: false,
      cap_kind: 'POOL',
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
      de_rounds: [],
      video_required: false,
      cap_kind: 'POOL',
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
      de_rounds: [],
      video_required: false,
      cap_kind: 'POOL',
    })
  }

  // DE phases (METHODOLOGY.md §DE Modes, §DE Phase Breakdown). The general
  // ask is capped at DEFAULT_DE_STRIP_FOOTPRINT rather than bracketSize/2, so a
  // 3-5 event day can share the strip pool concurrently. Each block's length
  // is derived per round at the strips it is granted (computePhaseDuration).
  const { general, video, generalAsk, videoAsk, boutMinutes } = deBlocks
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
      desired_strip_count: generalAsk,
      duration_at_full: deRoundsMinutes(general, generalAsk, boutMinutes),
      de_rounds: general,
      video_required: false, // SINGLE_STAGE never uses video
      cap_kind: 'DE',
    })
  } else {
    // STAGED: prelims (only when the bracket is larger than the video-stage
    // round) → the video block, the video-stage round through the semis.
    if (general.length > 0) {
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
        desired_strip_count: generalAsk,
        duration_at_full: deRoundsMinutes(general, generalAsk, boutMinutes),
        de_rounds: general,
        video_required: false,
        cap_kind: 'DE',
      })
    }

    const r16VideoRequired = phaseRequiresVideo(Phase.DE_ROUND_OF_16, comp)
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
      desired_strip_count: videoAsk,
      duration_at_full: deRoundsMinutes(video, videoAsk, boutMinutes),
      de_rounds: video,
      video_required: r16VideoRequired,
      cap_kind: 'DE',
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
// Cross-event edges (indv→team, the Vet co-day stagger, regional Group 1 window)
// ──────────────────────────────────────────────

/**
 * Wires the cross-event dependencies of METHODOLOGY §Cross-Event Dependency
 * Edges and returns the regional Group 1 pairs it floored, for
 * `regionalWindowFindings` to judge once the loop has run.
 *
 * The two waits go on the waiter's `cross_event_waits`, and the loop's held set
 * makes them bind whatever order it meets the events in (`runConcurrentLoop`).
 * Only events in `events` can be waited on, so a predecessor that validation
 * excluded, or one with no day, has no wait at all.
 */
function applyCrossEventEdges(events: EventState[], config: TournamentConfig): RegionalWindowPair[] {
  const byId = new Map(events.map(e => [e.competition.id, e]))
  const competitions = events.map(e => e.competition)

  for (const event of events) {
    const comp = event.competition

    // Indv→team gap. A team sharing a day with its individual counterpart (only
    // through a pin or the least-bad fallback) is not ready before the
    // individual's last phase ends + INDIV_TEAM_MIN_GAP_MINS.
    if (comp.event_type === EventType.TEAM) {
      const ind = findIndividualCounterpart(comp, competitions)
      const indEvent = ind ? byId.get(ind.id) : undefined
      if (indEvent && indEvent.assigned_day === event.assigned_day) {
        event.cross_event_waits.push({
          waiter_id: comp.id,
          predecessor_id: indEvent.competition.id,
          anchor: WaitAnchor.TERMINAL_END,
          gap: config.INDIV_TEAM_MIN_GAP_MINS,
        })
      }
    }

    // Vet co-day stagger (owner ruling O1). A band's pools are not ready before
    // the pools of the next-older band present on its day start +
    // VET_STAGGER_MINS. One wait, to that band only: the bands further up are
    // ordered through it, and when it is never placed the wait passes up to
    // them (`passOverFailed`).
    const older = nextOlderBandOnDay(event, events)
    if (older) {
      event.cross_event_waits.push({
        waiter_id: comp.id,
        predecessor_id: older.competition.id,
        anchor: WaitAnchor.FIRST_POOL_START,
        gap: VET_STAGGER_MINS,
      })
    }
  }

  assertAcyclicWaits(events.flatMap(e => e.cross_event_waits))
  return applyRegionalWindowFloors(events, config)
}

/**
 * The age-banded Vet individual of the same gender and weapon on the event's
 * day whose band is the closest older one, or null when the event is the oldest
 * band present or is not an age-banded Vet individual.
 */
function nextOlderBandOnDay(event: EventState, events: EventState[]): EventState | null {
  const comp = event.competition
  if (!isAgeBandedVet(comp)) return null
  const myRank = vetBandRank(comp.vet_age_group)
  let best: EventState | null = null
  let bestRank = -1
  for (const other of events) {
    const oc = other.competition
    if (oc.id === comp.id || !isAgeBandedVet(oc)) continue
    if (oc.gender !== comp.gender || oc.weapon !== comp.weapon) continue
    if (other.assigned_day !== event.assigned_day) continue
    // A lower rank is an older band (VET80 0 … VET40 4).
    const rank = vetBandRank(oc.vet_age_group)
    if (rank >= myRank) continue
    if (best === null || rank > bestRank) {
      best = other
      bestRank = rank
    }
  }
  return best
}

/**
 * The regional Group 1 window (Ops Manual p.20 – Group 1, METHODOLOGY §Regional
 * Types: Soft, With a Time-of-Day Window). At ROC, RYC and RJCC, when a Group 1
 * pair of one weapon and gender shares a day, the older side's pools are not
 * ready before day start + 4 hours while the younger side starts from day start.
 *
 * The floor is fixed from day start and stored on the event, so the seed and
 * the retry reset apply it to the first phase. It is not a cross-event wait: it
 * depends on no other event's placement. Every pair sets the
 * same floor, so windows do not stack. Keyed by category, weapon and gender
 * alone, for any mix of individual and team events (024 plan D10).
 */
function applyRegionalWindowFloors(events: EventState[], config: TournamentConfig): RegionalWindowPair[] {
  const pairs: RegionalWindowPair[] = []
  if (!GROUP_1_SOFT_TYPES.has(config.tournament_type)) return pairs

  for (const older of events) {
    for (const younger of events) {
      const oc = older.competition
      const yc = younger.competition
      if (oc.gender !== yc.gender || oc.weapon !== yc.weapon) continue
      if (older.assigned_day !== younger.assigned_day) continue
      if (!GROUP_1_MANDATORY.some(p => p.older === oc.category && p.younger === yc.category)) continue
      older.group1_window_floor = dayStart(older.assigned_day, config) + REGIONAL_GROUP_1_WINDOW_MINS
      pairs.push({ older, younger })
    }
  }
  return pairs
}

/**
 * One finding per floored pair whose two events were both placed: INFO when
 * the window held, WARN when it did not. The window holds when the younger
 * side's pools start before the floor and the older side's at or after it. A
 * pin skips the seed, so a pinned older side can break it, and in a Y10, Y12
 * and Y14 day the Y12–Y14 pair starts together at the floor and breaks it
 * (METHODOLOGY §Regional Types: Soft, With a Time-of-Day Window). A pair with
 * an unplaced side has no finding: that event's own ERROR covers it.
 */
function regionalWindowFindings(pairs: RegionalWindowPair[], state: GlobalState): Bottleneck[] {
  const findings: Bottleneck[] = []
  for (const { older, younger } of pairs) {
    const o = state.schedule[older.competition.id]
    const y = state.schedule[younger.competition.id]
    const floor = older.group1_window_floor
    if (!o || !y || o.pool_start === null || y.pool_start === null || floor === null) continue

    const honoured = o.pool_start >= floor && y.pool_start < floor
    const oId = older.competition.id
    const yId = younger.competition.id
    const starts = `${yId} starts at ${y.pool_start} and ${oId}'s pools at ${o.pool_start}, window floor ${floor}`
    findings.push({
      competition_id: oId,
      phase: Phase.SEQUENCING,
      cause: BottleneckCause.SEQUENCING_CONSTRAINT,
      rule: honoured ? BottleneckRule.REGIONAL_WINDOW_HONOURED : BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
      subjects: [oId, yId].sort(),
      severity: honoured ? BottleneckSeverity.INFO : BottleneckSeverity.WARN,
      delay_mins: 0,
      day: o.assigned_day,
      message: honoured
        ? `${oId} and ${yId} share day ${o.assigned_day + 1} inside the regional Group 1 window: ${starts}`
        : `${oId} and ${yId} share day ${o.assigned_day + 1} and the regional Group 1 window is not honoured: ${starts}`,
    })
  }
  return findings
}

/**
 * The first phase's ready time with no cross-event wait: day start, held back
 * by the event's earliest start and by its regional window floor. This is also
 * where a lapsed wait leaves the event (O8).
 */
function unwaitedReadyTime(event: EventState, config: TournamentConfig): number {
  return Math.max(
    dayStart(event.assigned_day, config),
    event.competition.earliest_start,
    event.group1_window_floor ?? -Infinity,
  )
}

/**
 * The first phase's ready time when it enters the queue – at the seed, at a
 * held event's release, and at a retry: `unwaitedReadyTime` held back by the
 * resolved cross-event floor.
 */
function firstPhaseReadyTime(event: EventState, config: TournamentConfig): number {
  return Math.max(unwaitedReadyTime(event, config), event.cross_event_floor?.time ?? -Infinity)
}

/**
 * One `cross-event-dependency-delay` INFO when the cross-event floor pushed the
 * first phase past where it would be with no wait, `delay_mins` equal to the
 * push (METHODOLOGY §Cross-Event Dependency Edges). Called wherever the floor
 * is applied – the seed, a release and a retry – and tagged with the attempt,
 * so a rolled-back attempt takes its INFO with it.
 */
function crossEventDelayFinding(event: EventState, config: TournamentConfig): Bottleneck | null {
  const delay = firstPhaseReadyTime(event, config) - unwaitedReadyTime(event, config)
  if (delay <= 0 || event.cross_event_floor === null) return null
  const id = event.competition.id
  const binding = event.cross_event_floor.binding
  return {
    competition_id: id,
    phase: Phase.SEQUENCING,
    cause: BottleneckCause.SEQUENCING_CONSTRAINT,
    rule: BottleneckRule.CROSS_EVENT_DEPENDENCY_DELAY,
    subjects: [id, ...binding].sort(compareIds),
    severity: BottleneckSeverity.INFO,
    delay_mins: delay,
    message: `${id} ${event.phases[0].phase_label}: delayed ${delay}min by its cross-event wait on ${binding.join(', ')}`,
    attempt_id: event.attempt_id,
  }
}

/**
 * The wait between a phase's end and its successor's ready time. Flight A →
 * Flight B waits `FLIGHT_BUFFER_MINS` alone – the flight buffer replaces the
 * admin gap between the two flights – and every other successor waits
 * `ADMIN_GAP_MINS` (METHODOLOGY.md §Runtime Decomposition, §Allocation,
 * Deferral, and Failure). `derive.ts` places Flight B by the same rule.
 */
function successorGap(kind: PhaseKind, config: TournamentConfig): number {
  return kind === PhaseKind.FLIGHT_A ? config.FLIGHT_BUFFER_MINS : config.ADMIN_GAP_MINS
}

// ──────────────────────────────────────────────
// Pinned events (013 US6)
// ──────────────────────────────────────────────

/**
 * Claims strip-time for every pinned event before the loop opens, at exactly
 * the day and start the caller fixed (013 FR-054–FR-057, research D1).
 *
 * **Bounded before entry** (constitution IV): the pin list is sorted once, and
 * the pass then makes exactly one `tryAllocate` call per phase node per pin —
 * `Σ event.phases.length` over the pinned events, a number fixed before the
 * first iteration. There is no defer, no retry and no second pass, so a pin
 * that cannot claim strips still terminates the walk.
 *
 * A phase that finds no free strips keeps its time anyway: the pin's geometry
 * is the caller's (`derive.ts` draws the block from `strip_count`), so a
 * narrower or later claim would describe a block the caller does not draw. The
 * phase claims all or nothing, and the miss is reported as one WARN.
 */
function preclaimPinnedEvents(
  pinned: readonly PinnedPlacement[],
  events: EventState[],
  state: GlobalState,
  config: TournamentConfig,
): void {
  // Sorted once, by (day, start_time, id), so two pins contending for the same
  // strips always resolve the same way (research D1, determinism).
  const ordered = [...pinned].sort(
    (a, b) =>
      a.day - b.day ||
      a.start_time - b.start_time ||
      compareIds(a.competition_id, b.competition_id),
  )

  for (const pin of ordered) {
    const event = findEventState(events, pin.competition_id)
    if (event === null) continue

    let prev: PhaseNode | null = null
    for (const node of event.phases) {
      if (prev === null) {
        // The pinned start, unsnapped — the caller already put it on a slot
        // boundary, and snapping here would move the pin.
        node.ready_time = pin.start_time
      } else {
        // The loop's own successor rule (`runConcurrentLoop`, the 'ok' branch).
        node.ready_time = snapToSlot(prev.end_time + successorGap(prev.kind, config))
      }

      // The pool ask is the pin's own strip budget, split across flights the
      // way `derive.ts`'s `grantedStrips` splits it, so the engine and the
      // caller's geometry agree on how wide the block is. DE nodes keep the
      // counts `buildPhaseNodes` gave them.
      if (node.kind === PhaseKind.POOLS) {
        node.desired_strip_count = Math.min(node.desired_strip_count, pin.strip_count)
      } else if (node.kind === PhaseKind.FLIGHT_A) {
        node.desired_strip_count = Math.min(
          node.desired_strip_count,
          Math.ceil(pin.strip_count / 2),
        )
      } else if (node.kind === PhaseKind.FLIGHT_B) {
        node.desired_strip_count = Math.min(
          node.desired_strip_count,
          Math.floor(pin.strip_count / 2),
        )
      }

      const allocated = tryAllocate(node, event, state, config)
      if (allocated.outcome !== 'ok') {
        // Nothing claimed, but the phase still happened as far as the result is
        // concerned: same start, same duration, same strip count it asked for.
        const cappedCount = cappedStripCount(node, event, config)
        node.state = PhaseState.RUNNING
        node.end_time = node.ready_time + computePhaseDuration(node, cappedCount, event)
        onPhaseAllocated(node, event, cappedCount, state, config)
        state.bottlenecks.push({
          competition_id: pin.competition_id,
          phase: node.phase_label,
          cause: BottleneckCause.PINNED_UNCLAIMED,
          rule: BottleneckRule.PINNED_PHASE_UNCLAIMED,
          subjects: [pin.competition_id],
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `${pin.competition_id} ${node.phase_label}: pinned phase could not claim strips at its time`,
          attempt_id: 1,
        })
      }
      prev = node
    }

    // Recorded whatever happened — a pin is never deferred, retried or dropped.
    commitEventResult(event, state, config)
  }
}

// ──────────────────────────────────────────────
// Main loop
// ──────────────────────────────────────────────

function runConcurrentLoop(
  events: EventState[],
  state: GlobalState,
  config: TournamentConfig,
  pinnedIds: ReadonlySet<string> = NO_PINNED_IDS,
): void {
  // Seed the ready queue with each event's first phase node, at
  // `firstPhaseReadyTime`.
  //
  // A pinned event is already committed by `preclaimPinnedEvents`, so none of
  // its nodes enters `ready` — which is what keeps `handlePhaseFailure`, the
  // defer bump and the attempt-2 retry from ever seeing a pin. An empty
  // `pinnedIds` leaves the seed exactly as it was (FR-058).
  //
  // Cross-event waits (021 T6a). An event whose wait names an unplaced
  // predecessor is held out of `ready` until that predecessor's anchor phase is
  // placed or it fails for good, then queued at its floor. A predecessor that
  // fails for good is treated as absent (O8): a Vet band's wait passes up to
  // the next-older band still in play, and lapses only when none is left
  // (`passOverFailed`). A pinned predecessor was placed before the loop, so its
  // waiter is queued at the seed. Holding is what makes the wait bind: a
  // re-queue at the same ready time would be re-picked every iteration
  // (`compareNodes` has nothing that changes between them), and the defer path
  // would spend `defer_count` into a false retry.
  const ready: PhaseNode[] = []
  const held = new Set<EventState>()
  const allWaits = events.flatMap(e => e.cross_event_waits)
  const failedForGood = (id: string): boolean => findEventState(events, id)?.permanently_failed ?? true
  const statusOf = (wait: CrossEventWait): PredecessorStatus => predecessorStatus(wait, events)

  /** Queues the event's first phase at its floor, or holds it while a wait is pending. */
  const enqueueFirstPhase = (event: EventState): void => {
    const waits = event.cross_event_waits
      .map(w => passOverFailed(w, allWaits, failedForGood))
      .filter((w): w is CrossEventWait => w !== null)
    const resolution = resolveWaits(waits, statusOf)
    if (resolution.held) {
      held.add(event)
      return
    }
    held.delete(event)
    event.cross_event_floor = resolution.floor === null
      ? null
      : { time: snapToSlot(resolution.floor), binding: resolution.binding }
    const first = event.phases[0]
    first.ready_time = firstPhaseReadyTime(event, config)
    first.state = PhaseState.READY
    ready.push(first)
    const finding = crossEventDelayFinding(event, config)
    if (finding) state.bottlenecks.push(finding)
  }

  /**
   * Re-checks every held event after an anchor phase was placed or an event
   * failed for good. All of them, not only the direct waiters: a wait passed
   * over a failed band now names a band further up, which may be the one just
   * placed. One pass over a snapshot of the held set, so it is bounded by the
   * event count.
   */
  const recheckHeld = (): void => {
    for (const waiter of [...held]) enqueueFirstPhase(waiter)
  }

  for (const event of events) {
    if (pinnedIds.has(event.competition.id)) continue
    enqueueFirstPhase(event)
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
          snapToSlot(node.end_time + successorGap(node.kind, config)),
        )
        succ.state = PhaseState.READY
        ready.push(succ)
      } else {
        // Terminal phase succeeded — record the result.
        commitEventResult(event, state, config)
      }
      // The two anchors a wait can name: the first pool phase's start and the
      // last phase's end. Either placement may release a held waiter.
      if (node.index === 0 || node.successor_index === -1) recheckHeld()
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
        // A predecessor that failed for good releases its waiters, which then
        // wait as if it did not exist (O8).
        if (event.permanently_failed) recheckHeld()
        continue
      }
      // Emit NO_WINDOW_DIAGNOSTIC.
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.NO_WINDOW_DIAGNOSTIC,
        rule: BottleneckRule.PHASE_DEFERRED,
        subjects: [event.competition.id],
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
            rule: BottleneckRule.STRIP_CONTENTION_DEFERRAL,
            subjects: [event.competition.id],
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
      if (event.permanently_failed) recheckHeld()
    }
  }

  // The post-loop bound (constitution IV): every event the loop owned is placed
  // or failed for good, so a held event whose release never came cannot vanish
  // as "unplaced" with no finding.
  assertEveryEventResolved(
    events
      .filter(e => !pinnedIds.has(e.competition.id))
      .map(e => ({
        id: e.competition.id,
        resolved: state.schedule[e.competition.id] !== undefined || e.permanently_failed,
      })),
    events.flatMap(e => e.cross_event_waits),
  )
}

/**
 * Where a wait's predecessor stands. Placed once its anchor phase is RUNNING –
 * the first phase's start for `FIRST_POOL_START`, the last phase's end for
 * `TERMINAL_END`. A RUNNING node's `ready_time` is its start
 * (`onPhaseAllocated`). Called only after `passOverFailed`, so the predecessor
 * is one the loop owns and has not failed for good.
 */
function predecessorStatus(wait: CrossEventWait, events: EventState[]): PredecessorStatus {
  const predecessor = findEventState(events, wait.predecessor_id)
  if (predecessor === null || predecessor.permanently_failed) {
    throw new Error(`concurrentScheduler: ${wait.waiter_id} waits on ${wait.predecessor_id}, which is not in play`)
  }
  const phases = predecessor.phases
  const anchor = wait.anchor === WaitAnchor.FIRST_POOL_START ? phases[0] : phases[phases.length - 1]
  if (anchor.state !== PhaseState.RUNNING) return { state: PredecessorState.PENDING }
  const time = wait.anchor === WaitAnchor.FIRST_POOL_START ? anchor.ready_time : anchor.end_time
  return { state: PredecessorState.PLACED, time }
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
      rule: BottleneckRule.FIRST_ATTEMPT_FAILED,
      subjects: [event.competition.id],
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `${event.competition.id}: attempt 1 failed at ${node.phase_label}, retrying`,
      attempt_id: 1,
    })
    // Reset all phases to PENDING/READY at the first phase's ready time, which
    // keeps the cross-event floor. Attempt 1's dependency INFO went with the
    // rollback above, so attempt 2 carries its own.
    event.attempt_id = 2
    resetEventPhases(event, config)
    ready.push(event.phases[0])
    const finding = crossEventDelayFinding(event, config)
    if (finding) state.bottlenecks.push(finding)
  } else {
    // Attempt 2 failed — permanent.
    releaseEventAllocations(state, event.competition.id, 2)
    state.bottlenecks.push({
      competition_id: event.competition.id,
      phase: Phase.DEADLINE_CHECK,
      cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      rule: BottleneckRule.EVENT_UNSCHEDULED,
      subjects: [event.competition.id],
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
 * READY at `firstPhaseReadyTime` – day start, held back by the event's regional
 * window floor and its cross-event floor when it has them – and the rest are
 * PENDING with cleared timestamps and defer counts.
 */
function resetEventPhases(event: EventState, config: TournamentConfig): void {
  for (let i = 0; i < event.phases.length; i++) {
    const p = event.phases[i]
    p.state = PhaseState.PENDING
    p.ready_time = 0
    p.end_time = 0
    p.defer_count = 0
  }
  event.phases[0].ready_time = firstPhaseReadyTime(event, config)
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
 * A DE node whose bracket has no counted round – a bracket of 2, whose gold
 * bout the tail estimate covers. It takes 0 minutes and claims no strip,
 * general or video (METHODOLOGY.md §DE Duration 'No counted round', §Scheduler
 * Stops at Semis). Keyed to the rounds, not to a strip ask of 0, so a pinned
 * flight whose budget splits to 0 keeps its 1-strip floor (024 plan D5).
 */
function hasNoCountedRound(node: PhaseNode): boolean {
  return node.cap_kind === 'DE' && node.de_rounds.length === 0
}

/**
 * The strip count a phase node actually gets: its ask, held down by the
 * cap its kind answers to, never below 1 – except a DE with no counted round,
 * which gets 0. Extracted from `tryAllocate` so the pre-claim pass can compute
 * the same number for a phase that claimed nothing.
 */
function cappedStripCount(
  node: PhaseNode,
  event: EventState,
  config: TournamentConfig,
): number {
  if (hasNoCountedRound(node)) return 0
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
  return Math.max(1, Math.min(node.desired_strip_count, cap))
}

/**
 * Attempts to allocate the phase node. On success mutates the event's result
 * and the global state via `allocateInterval`. On a deferrable miss returns
 * `next_ready_time`. On an unrecoverable miss (no slot within the phase's day
 * limit – see `fitsDay` below) returns `fail`.
 */
function tryAllocate(
  node: PhaseNode,
  event: EventState,
  state: GlobalState,
  config: TournamentConfig,
): AllocateOutcome {
  const day = event.assigned_day
  // Day-window cap is the tighter of the day's hard end and the event's
  // latest_end constraint. The 7:00 PM soft target does not bound placement: a
  // phase may run past it to the hard end (Ops Manual 2026-27 p.17,
  // METHODOLOGY.md §Same-Day Completion, §Phase 5).
  const dayHard = dayHardEnd(day, config)
  const hardEnd = Math.min(dayHard, event.competition.latest_end)
  // 018 R1: the event's last phase alone may also start before the hard end and
  // end past it, up to the day's midnight (or the organizer's later hard end),
  // never past latest_end. `scheduleAll` warns about it after the run
  // (`lastPhaseOverrunWarnings`). Every other phase ends by the hard end.
  const isLastPhase = node.successor_index === -1
  const lastPhaseEndCap = Math.min(Math.max(dayMidnight(day, config), dayHard), event.competition.latest_end)
  // The one day-limit rule the STAGED fits-in-day pre-check, the post-fit check
  // and both deferrals below share.
  const fitsDay = (start: number, dur: number): boolean =>
    start + dur <= hardEnd
    || (isLastPhase && start < hardEnd && start + dur <= lastPhaseEndCap)
  // A deferral also needs its new start before the hard end.
  // (`fitsDay` already implies start < hardEnd for any phase of positive length,
  // so the explicit check only matters for a zero-length phase.)
  const canDeferTo = (start: number | null, dur: number): start is number =>
    start !== null && start < hardEnd && fitsDay(start, dur)

  // Strip cap.
  const cappedCount = cappedStripCount(node, event, config)

  // Duration depends on phase kind.
  const duration = computePhaseDuration(node, cappedCount, event)

  // A DE with no counted round claims nothing, so it never searches for
  // strips: it "fits" at ready_time on an empty strip set and passes through
  // the same day-end check and result write as every other phase.
  const noCountedRound = hasNoCountedRound(node)

  // STAGED-DE phases (prelims, R16) pre-check whether the phase can fit
  // within its day limit at all, before searching for strips. Without this, a
  // phase whose duration alone overruns the day would still search for
  // strips and — if strips happened to be free at ready_time — fail with a
  // SAME_DAY_VIOLATION instead of deferring or failing cleanly.
  if (!noCountedRound && (node.kind === PhaseKind.DE_PRELIMS || node.kind === PhaseKind.DE_R16)) {
    if (!fitsDay(node.ready_time, duration)) {
      // Try deferring once via window probe to confirm STRIPS vs TIME.
      const win = findAvailableStripsInWindow(
        state, config, cappedCount, node.ready_time, duration, node.video_required, day,
      )
      if (win.fit === 'none' && canDeferTo(win.earliest_next_start, duration)) {
        return { outcome: 'defer', next_ready_time: win.earliest_next_start, reason: win.reason }
      }
      return { outcome: 'fail' }
    }
  }

  // Claim cappedCount strips for the phase duration as a single allocation —
  // the same path every phase kind uses (pools, flights, and both DE modes).
  const win: FindStripsInWindowResult = noCountedRound
    ? { fit: 'ok', strip_indices: [] }
    : findAvailableStripsInWindow(
        state, config, cappedCount, node.ready_time, duration, node.video_required, day,
      )
  if (win.fit === 'ok') {
    const startTime = node.ready_time
    const endTime = startTime + duration
    if (!fitsDay(startTime, duration)) {
      // Even a successful fit breaks the phase's day limit — fail. Flag as
      // SAME_DAY_VIOLATION ERROR (METHODOLOGY.md §Bottlenecks Specific to the
      // Concurrent Scheduler). Ending past the soft target alone never lands
      // here, nor does a last phase that overruns the hard end within its limit.
      // The limit it broke, as a clock time: midnight for a last phase that
      // starts in time, the hard end otherwise.
      const brokenLimit = isLastPhase && startTime < hardEnd
        ? `the last-phase limit ${clockOnDay(lastPhaseEndCap, day, config)}`
        : `day-end ${clockOnDay(hardEnd, day, config)}`
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.SAME_DAY_VIOLATION,
        rule: BottleneckRule.PHASE_OVERRUNS_DAY_END,
        subjects: [event.competition.id],
        severity: BottleneckSeverity.ERROR,
        delay_mins: 0,
        message: `${event.competition.id} ${node.phase_label}: ends at ${clockOnDay(endTime, day, config)} past ${brokenLimit}`,
        attempt_id: event.attempt_id,
      })
      return { outcome: 'fail' }
    }
    allocateInterval(state, event.competition.id, node.phase_label, win.strip_indices, startTime, endTime)
    node.state = PhaseState.RUNNING
    node.end_time = endTime
    onPhaseAllocated(node, event, win.strip_indices.length, state, config)
    // Video contention bottleneck for video-required phases that had to delay.
    if (node.video_required && node.defer_count > 0) {
      state.bottlenecks.push({
        competition_id: event.competition.id,
        phase: node.phase_label,
        cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
        rule: BottleneckRule.VIDEO_PHASE_DELAYED,
        subjects: [event.competition.id],
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `${event.competition.id} ${node.phase_label}: video-required phase delayed by contention`,
        attempt_id: event.attempt_id,
      })
    }
    return { outcome: 'ok' }
  }

  // Miss.
  if (canDeferTo(win.earliest_next_start, duration)) {
    return { outcome: 'defer', next_ready_time: snapToSlot(win.earliest_next_start), reason: win.reason }
  }
  return { outcome: 'fail' }
}

/**
 * Computes the actual (possibly cap-scaled) duration for a phase node given
 * the strip-count it ended up with. Pools recompute via estimatePoolDuration
 * (more rounds when strips are limited); DE phases re-derive their rounds'
 * waves at the granted strips (METHODOLOGY.md §DE Duration).
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
  // DE_SINGLE, DE_PRELIMS, DE_R16. The gold bout is not a counted round – the
  // tail estimate covers it (§Scheduler Stops at Semis).
  return deRoundsMinutes(node.de_rounds, cappedCount, event.deBlocks.boutMinutes)
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
  config: TournamentConfig,
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
      // FLIGHT_B_DELAYED when Flight B starts more than 30 min after its own
      // unblocked ready time, Flight A's end + the flight buffer snapped to a
      // slot – the time the loop gives it – so an uncontended Flight B never
      // draws it (METHODOLOGY.md §Bottlenecks Specific to the Concurrent Scheduler).
      const idealStart = snapToSlot((r.flight_a_end ?? 0) + successorGap(PhaseKind.FLIGHT_A, config))
      const delay = startTime - idealStart
      if (delay > 30) {
        state.bottlenecks.push({
          competition_id: event.competition.id,
          phase: Phase.FLIGHT_B,
          cause: BottleneckCause.FLIGHT_B_DELAYED,
          rule: BottleneckRule.FLIGHT_B_DELAYED,
          subjects: [event.competition.id],
          severity: BottleneckSeverity.WARN,
          delay_mins: delay,
          message: `${event.competition.id} Flight B delayed ${delay}min past its ready time`,
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
 * 2. Y8/Y10 first among nodes ready at the same time – a tie-break after
 *    ready_time, not a promise of the day's first slot. Without it, large
 *    events grab strip-time at day start and the small youth events get
 *    crowded out of their DE windows (METHODOLOGY §Within-Day Priority Order:
 *    Ops Manual p.20 – Group 2 asks for Y10 early, and Y8 is a departure).
 * 3. Flight A first – a flighted event's first flight claims its strips early,
 *    so Flight B can follow while the day has time left. It sits after Y8/Y10,
 *    so a youth first phase still wins, and before video-required, so it wins
 *    even when its ask is smaller than a co-day phase's (METHODOLOGY
 *    §Within-Day Priority Order key 3, §How Flighting Works).
 * 4. Video-required first
 * 5. Larger desired_strip_count first
 * 6. Higher constraint_score first
 * 7. Stable on event_id
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
  // Y8/Y10 wins among nodes ready at the same time (METHODOLOGY §Within-Day Priority Order).
  const aEvent = findEventState(events, a.event_id)
  const bEvent = findEventState(events, b.event_id)
  const aYouth = aEvent !== null && isYouthPriorityCategory(aEvent.competition.category)
  const bYouth = bEvent !== null && isYouthPriorityCategory(bEvent.competition.category)
  if (aYouth !== bYouth) return aYouth ? -1 : 1
  // Flight A wins next (key 3).
  const aFlightA = a.kind === PhaseKind.FLIGHT_A
  const bFlightA = b.kind === PhaseKind.FLIGHT_A
  if (aFlightA !== bFlightA) return aFlightA ? -1 : 1
  // Video-required wins.
  if (a.video_required !== b.video_required) return a.video_required ? -1 : 1
  // Larger strip count wins (more negative comes first → return b - a).
  if (a.desired_strip_count !== b.desired_strip_count) return b.desired_strip_count - a.desired_strip_count
  // Higher constraint score wins.
  const aScore = aEvent?.constraint_score ?? 0
  const bScore = bEvent?.constraint_score ?? 0
  if (aScore !== bScore) return bScore - aScore
  // Tie — stable on event_id.
  return compareIds(a.event_id, b.event_id)
}

function findEventState(events: EventState[], event_id: string): EventState | null {
  for (const e of events) {
    if (e.competition.id === event_id) return e
  }
  return null
}


// ──────────────────────────────────────────────
// postScheduleWarnings — METHODOLOGY.md §Phase 7: Post-Schedule Warnings
// ──────────────────────────────────────────────

/**
 * Generates post-schedule warnings per METHODOLOGY.md §Phase 7: Post-Schedule Warnings.
 * At every day count: one late-day WARN per day that ends past its soft target
 * (`lateDayWarnings`, §Same-Day Completion).
 * Then the first/last-day WARN (`firstLastDayWarnings`).
 */
export function postScheduleWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
): Bottleneck[] {
  return [...lateDayWarnings(schedule, config), ...firstLastDayWarnings(schedule, config)]
}

/**
 * One `SAME_DAY_VIOLATION` WARN per placed event whose last phase ends past its
 * day's hard end (METHODOLOGY.md §Same-Day Completion, 018 R1 and R3). The last
 * phase's end is `de_round_of_16_end` for a staged DE and `de_end` otherwise.
 * An event with neither placed no last phase and is skipped.
 *
 * Each WARN reuses rule `phase-overruns-day-end`, names the event as its owner
 * and only subject, carries the minutes past the hard end as `delay_mins`, and
 * gives the estimated finish as a clock time. `labelOf` turns an id into the
 * name the message shows (the store passes its competition label).
 *
 * Pure, and it reads days only through `dayHardEnd` and `clockOnDay`, so it
 * works on every axis as long as the results and the config share one: the
 * engine calls it after scheduling, and the store over the board as drawn.
 * Ordered by day, then id.
 */
export function lastPhaseOverrunWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
  labelOf: (id: string) => string = (id) => id,
): Bottleneck[] {
  const overruns: { id: string; day: number; end: number; hardEnd: number }[] = []
  for (const [id, r] of Object.entries(schedule)) {
    const end = r.de_round_of_16_end ?? r.de_end
    if (end === null) continue
    const hardEnd = dayHardEnd(r.assigned_day, config)
    if (end > hardEnd) overruns.push({ id, day: r.assigned_day, end, hardEnd })
  }
  overruns.sort((a, b) => a.day - b.day || compareIds(a.id, b.id))

  return overruns.map(({ id, day, end, hardEnd }) => ({
    competition_id: id,
    phase: Phase.POST_SCHEDULE,
    cause: BottleneckCause.SAME_DAY_VIOLATION,
    rule: BottleneckRule.PHASE_OVERRUNS_DAY_END,
    subjects: [id],
    severity: BottleneckSeverity.WARN,
    delay_mins: end - hardEnd,
    day,
    message: `${labelOf(id)} ends at ${clockOnDay(end, day, config)} on Day ${day + 1}, ${end - hardEnd} min past the day's hard end ${clockOnDay(hardEnd, day, config)}`,
  }))
}

/**
 * One `POOL_START_AFTER_CUTOFF` WARN per placed event whose first pool phase
 * starts later than its day's start + `LATEST_START_OFFSET` – 4:00 PM on a
 * 9:00 AM day (METHODOLOGY.md §Pool Start Cutoff, 021 O2). The first pool phase
 * is Flight A for a flighted event and the pools otherwise, and Flight B is
 * never checked. The event stays placed: nothing is dropped or moved for it.
 * An event with no pool start placed is skipped.
 *
 * Each WARN names the event as its owner and only subject, carries the minutes
 * past the cutoff as `delay_mins`, and gives the start as a clock time.
 * `labelOf` turns an id into the name the message shows (the store passes its
 * competition label).
 *
 * Pure, and it reads days only through `dayStart` and `clockOnDay`, so it works
 * on every axis as long as the results and the config share one: the engine
 * calls it after scheduling, and the store over the board as drawn (021 O10),
 * where a hand-moved event is checked at once. Ordered by day, then id.
 */
export function poolStartAfterCutoffWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
  labelOf: (id: string) => string = (id) => id,
): Bottleneck[] {
  const late: { id: string; day: number; start: number; cutoff: number; flighted: boolean }[] = []
  for (const [id, r] of Object.entries(schedule)) {
    const start = r.flight_a_start ?? r.pool_start
    if (start === null) continue
    const cutoff = dayStart(r.assigned_day, config) + config.LATEST_START_OFFSET
    if (start > cutoff) late.push({ id, day: r.assigned_day, start, cutoff, flighted: r.flight_a_start !== null })
  }
  late.sort((a, b) => a.day - b.day || compareIds(a.id, b.id))

  return late.map(({ id, day, start, cutoff, flighted }) => ({
    competition_id: id,
    phase: Phase.POST_SCHEDULE,
    cause: BottleneckCause.POOL_START_AFTER_CUTOFF,
    rule: BottleneckRule.POOL_START_AFTER_CUTOFF,
    subjects: [id],
    severity: BottleneckSeverity.WARN,
    delay_mins: start - cutoff,
    day,
    message: `${labelOf(id)} ${flighted ? 'Flight A starts' : 'pools start'} at ${clockOnDay(start, day, config)} on Day ${day + 1}, ${start - cutoff} min past the pool-start cutoff ${clockOnDay(cutoff, day, config)}`,
  }))
}

/**
 * The first and last days should be shorter than the days between (Ops Manual
 * p.20 – Group 2; METHODOLOGY.md §Phase 7, 024 D10). Reads the first and last
 * USED day and needs at least 3 used days. Each of the two warns when it is not
 * shorter than the shortest used middle day. A day's projected length is its
 * last end (`de_total_end`, or `pool_end` with no DE) minus its day start.
 * Day assignment plans for this with the reduced first/last day capacity
 * (`dayColoring.ts`, §First and Last Day Capacity).
 *
 * Exported for the store (016 Task C), which runs it over the placements as
 * drawn. It reads days only through `dayStart`, so the results and the config's
 * `dayConfigs` must share one axis.
 */
export function firstLastDayWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
): Bottleneck[] {
  const dayLengths = new Map<number, number>()
  for (const r of Object.values(schedule)) {
    const end = r.de_total_end ?? r.pool_end
    // An event with no pool or flight start placed nothing, so it uses no day.
    const start = r.pool_start ?? r.flight_a_start
    if (end === null || start === null) continue
    const length = end - dayStart(r.assigned_day, config)
    dayLengths.set(r.assigned_day, Math.max(dayLengths.get(r.assigned_day) ?? 0, length))
  }

  const usedDays = [...dayLengths.keys()].sort((a, b) => a - b)
  if (usedDays.length < 3) return []

  const firstDay = usedDays[0]
  const lastDay = usedDays[usedDays.length - 1]
  const shortestMiddle = Math.min(...usedDays.slice(1, -1).map((d) => dayLengths.get(d)!))

  const warnings: Bottleneck[] = []
  const edges = [
    { day: firstDay, label: 'First', rule: BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE },
    { day: lastDay, label: 'Last', rule: BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE },
  ]
  for (const { day, label, rule } of edges) {
    const length = dayLengths.get(day)!
    if (length < shortestMiddle) continue
    warnings.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      rule,
      subjects: [],
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      day,
      message: `${label} day (Day ${day + 1}, ${length} min) is not shorter than the shortest middle day (${shortestMiddle} min)`,
    })
  }
  return warnings
}

/**
 * One WARN per day whose last competition ends after the day's soft target,
 * `dayEnd` (default 7:00 PM – Ops Manual 2026-27 p.17), at every day count
 * (METHODOLOGY.md §Same-Day Completion, 024 D7). Scheduling is not blocked:
 * the scheduler already placed the work, up to the day's hard end and an
 * event's last phase up to midnight.
 *
 * An event's finish is its `de_total_end`, gold/bronze tail included, or its
 * `pool_end` when it has no DE. The message carries the day's estimated
 * finish, `delay_mins` the minutes past the target, and `subjects` the events
 * that finish after it. The finding stays in the engine and the drift ledger
 * in 024 – the app's own late-day row is the store's late-finish row (D7).
 */
function lateDayWarnings(
  schedule: Record<string, ScheduleResult>,
  config: TournamentConfig,
): Bottleneck[] {
  const lateByDay = new Map<number, { finish: number; ids: string[] }>()
  for (const r of Object.values(schedule)) {
    const finish = r.de_total_end ?? r.pool_end
    if (finish === null || finish <= dayEnd(r.assigned_day, config)) continue
    const late = lateByDay.get(r.assigned_day)
    if (late) {
      late.finish = Math.max(late.finish, finish)
      late.ids.push(r.competition_id)
    } else {
      lateByDay.set(r.assigned_day, { finish, ids: [r.competition_id] })
    }
  }

  const warnings: Bottleneck[] = []
  for (const [day, { finish, ids }] of [...lateByDay.entries()].sort(([a], [b]) => a - b)) {
    const target = dayEnd(day, config)
    const subjects = [...new Set(ids)].sort()
    warnings.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      rule: BottleneckRule.DAY_ENDS_PAST_TARGET,
      subjects,
      severity: BottleneckSeverity.WARN,
      delay_mins: finish - target,
      day,
      message: `Day ${day + 1} ends at ${clockOnDay(finish, day, config)}, ${finish - target} min past its target ${clockOnDay(target, day, config)}: ${subjects.join(', ')} finish after it`,
    })
  }
  return warnings
}

// ──────────────────────────────────────────────
// postScheduleDiagnostics — resource recommendations
// ──────────────────────────────────────────────

/**
 * When scheduling fails due to resource exhaustion, emits one INFO-severity
 * finding naming the four levers an organizer can pull, in order: add a day,
 * flight events, cap entries, add strips. Reports no strip count of its own
 * (FR-015) — see the comment below for why. Returns empty array if no
 * RESOURCE_EXHAUSTION ERROR exists and no feasibility WARN was reported.
 */
export function postScheduleDiagnostics(
  // Unused since T010 dropped the strip-count recommendation (FR-015): the
  // signature is kept stable for its one call site and its export from
  // scheduler.ts rather than reshaping a public function for this alone.
  _competitions: Competition[],
  _config: TournamentConfig,
  bottlenecks: Bottleneck[],
): Bottleneck[] {
  const results: Bottleneck[] = []

  // A demoted feasibility finding is told apart by its `rule`, which the
  // validation pass copies onto the Bottleneck. Widened per research.md D3:
  // feasibility demoting to WARN must not silence the strip recommendation it
  // is paired with. A WARN from any other rule (e.g. days-available-range)
  // still leaves this false.
  const feasibilityRules: readonly string[] = Object.values(FeasibilityRule)
  const hasResourceExhaustion = bottlenecks.some(b => {
    if (b.cause !== BottleneckCause.RESOURCE_EXHAUSTION) return false
    if (b.severity === BottleneckSeverity.ERROR) return true
    return b.severity === BottleneckSeverity.WARN && feasibilityRules.includes(b.rule)
  })
  if (!hasResourceExhaustion) return results

  // No strip count of its own (FR-015, research.md D4). All three candidates
  // that could supply one are barred: the search's answer runs inside
  // `scheduleAll` and calling it here would recurse (FR-011); the concurrency
  // ceiling (`suggestStripCount`) must reach no user-visible surface
  // (FR-005); and reporting the strip-hours floor as an answer is 011's
  // research.md D4 rejection of strip-hours-over-day-length — it implies a
  // pool round can run on fewer strips over more hours, the double-stripping
  // practice the averaged pool durations already absorb. The organizer keeps
  // the shortfall figures they have today from the feasibility WARN (FR-013);
  // this finding adds only the levers, in the product owner's order
  // (research.md D6, FR-012). Cap entries is prose only — the app has no
  // per-event entry cap (FR-014).
  results.push({
    competition_id: '',
    phase: Phase.POST_SCHEDULE,
    cause: BottleneckCause.RESOURCE_RECOMMENDATION,
    rule: BottleneckRule.RESOURCE_LEVERS,
    subjects: [],
    severity: BottleneckSeverity.INFO,
    delay_mins: 0,
    message: 'More work than the venue holds. In the order an organizer can act: add a day, flight the largest events, cap entries, and last add strips — strips mean renting more of the facility. The feasibility warning carries the shortfall figures.',
  })

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
      rule: BottleneckRule.DAY_STRIP_HOURS_SUMMARY,
      subjects: [],
      severity: stripDeficit > 0 ? BottleneckSeverity.WARN : BottleneckSeverity.INFO,
      delay_mins: 0,
      day,
      message: `Day ${day + 1} strips: ${consumed.strip_hours_consumed.toFixed(1)} strip-hours consumed of ${totalCapacity.toFixed(1)} available${stripDeficit > 0 ? ` (${stripDeficit.toFixed(1)} over capacity)` : ''}.`,
    })

    // Sum peak ref demand across scheduled competitions on this day.
    // Each competition's peak is the larger of its pool and DE demand.
    const compsOnDay = competitions.filter(c => state.schedule[c.id]?.assigned_day === day)
    let peakRefDemand = 0
    for (const comp of compsOnDay) {
      // Only scheduled events reach here, and none is unsizeable (the
      // validation pass drops those, PER_EVENT_ERROR_RULES); kept as a cheap
      // backstop on the same predicate (018 T4).
      if (!isSizeableCount(comp.fencer_count, config)) continue
      const poolDemand = peakPoolRefDemand(comp, comp.ref_policy)
      const deDemand = peakDeRefDemand(comp, config)
      peakRefDemand += Math.max(poolDemand, deDemand)
    }

    if (peakRefDemand > 0) {
      results.push({
        competition_id: '',
        phase: Phase.POST_SCHEDULE,
        cause: BottleneckCause.DAY_RESOURCE_SUMMARY,
        rule: BottleneckRule.DAY_REF_PEAK_SUMMARY,
        subjects: [],
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        day,
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
        rule: BottleneckRule.DAY_VIDEO_DE_REF_SUMMARY,
        subjects: [],
        severity: BottleneckSeverity.INFO,
        delay_mins: 0,
        day,
        message: `Day ${day + 1} video-stage DE ref demand: ${videoStageSum} refs across ${stagedCount} staged events`,
      })
    }
  }

  return results
}
