/**
 * Master Scheduler — METHODOLOGY.md §Scheduling Algorithm
 *
 * Top-level orchestrator: sorts competitions by constraint priority,
 * schedules each via scheduleCompetition, and collects results + bottlenecks.
 */

import type {
  Competition,
  TournamentConfig,
  ScheduleResult,
  Bottleneck,
  GlobalState,
} from './types.ts'
import {
  Phase,
  DeMode,
  BottleneckCause,
  BottleneckSeverity,
  dayStart,
} from './types.ts'
import { createGlobalState, snapshotState, restoreState } from './resources.ts'
import { scheduleCompetition } from './scheduleOne.ts'
import { constraintScore, SchedulingError } from './dayAssignment.ts'
import { buildConstraintGraph } from './constraintGraph.ts'
import type { ConstraintGraph } from './constraintGraph.ts'
import { assignDaysByColoring } from './dayColoring.ts'
import { sequenceEventsForDay } from './daySequencing.ts'
import { validateConfig } from './validation.ts'
import { recommendStripCount, recommendRefCount, peakDeStripDemand } from './stripBudget.ts'
import { dayConsumedCapacity } from './capacity.ts'
import { peakPoolRefDemand, peakDeRefDemand } from './refs.ts'

const VALID_BOTTLENECK_CAUSES = new Set(Object.values(BottleneckCause))

/**
 * Records a constraint-relaxation bottleneck on the result and pushes it onto
 * state.bottlenecks. Used by both initial-pass and repair-loop scheduling.
 */
function recordRelaxation(
  result: { constraint_relaxation_level?: number },
  state: { bottlenecks: Bottleneck[] },
  compId: string,
  relaxLevel: number,
  severity: BottleneckSeverity,
  message: string,
): void {
  result.constraint_relaxation_level = relaxLevel
  state.bottlenecks.push({
    competition_id: compId,
    phase: Phase.DAY_ASSIGNMENT,
    cause: BottleneckCause.CONSTRAINT_RELAXED,
    severity,
    delay_mins: 0,
    message,
  })
}

// ──────────────────────────────────────────────
// scheduleAll — METHODOLOGY.md §Scheduling Algorithm
// ──────────────────────────────────────────────

interface ScheduleAllResult {
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
}

/**
 * Master orchestrator: creates global state, sorts competitions by constraint
 * priority (mandatory before optional, most constrained first), schedules each
 * competition, and returns results with bottlenecks.
 *
 * Error handling: competitions that fail to schedule are recorded as ERROR-severity
 * bottlenecks and skipped. Remaining competitions continue scheduling. Non-SchedulingError
 * exceptions are re-thrown.
 */
export function scheduleAll(
  competitions: Competition[],
  config: TournamentConfig,
): ScheduleAllResult {
  const state = createGlobalState(config)

  const validationErrors = validateConfig(config, competitions)

  // Convert validation results to bottlenecks. ERROR-severity failures abort
  // scheduling immediately; WARN-severity issues are carried forward as bottlenecks.
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
    return { schedule: state.schedule, bottlenecks: state.bottlenecks }
  }

  // ── Phase 1: Build constraint graph ──
  const graph = buildConstraintGraph(competitions)

  // ── Phase 2: Assign days by graph coloring ──
  const { dayMap, relaxations, effectiveDays } = assignDaysByColoring(graph, competitions, config)

  // ── Phase 3: Per-day scheduling loop (EVENT-MAJOR) ──
  //
  // Each event runs fully (pool → DE_PRELIMS → R16 → FINALS → BRONZE) before the
  // next event on the same day starts. `scheduleCompetition` is a thin orchestrator
  // over the phase schedulers in `phaseSchedulers.ts`.
  //
  // ATTEMPT LOG — do not re-try without addressing these first:
  //
  // Stage 6 Task 3 (2026-04-22) attempted to flip this to PHASE-MAJOR (all events'
  // pools → all events' DE_PRELIMS → ...). The attempt was reverted because:
  //   (a) `EventTxLog`-based strip rollback is order-dependent: when multiple
  //       events allocate the same strip across phases and any one fails,
  //       per-event txLogs contain stale `oldFreeAt` values. Fix requires storing
  //       strip allocations as an interval list per strip (major refactor),
  //       not a single `strip_free_at` scalar.
  //   (b) Density regressed in video-strip-constrained B-scenarios (B5: 3 → 0,
  //       B7: 4 → 0) because clustering R16/Finals across events concurrently
  //       created NO_WINDOW failures that event-major avoided via serialization.
  //       Same-day recovery via `scheduleCompetition` could not fully compensate.
  // See `__tests__/engine/scheduler.test.ts` footer for the full postmortem.
  //
  // Stage 6 Task 5 (2026-04-22) implemented the video-strips-for-pools rule
  // (METHODOLOGY.md §Video Strip Preservation). Pool phases may consume video
  // strips only during the morning wave (first 60 min) OR on single-event days.
  // This was expected to improve strip-constrained scenarios (B5) but produced
  // small regressions on most B-scenarios (B1: 14→13, B2: 11→9, B3: 7→5,
  // B4: 9→8; B5/B6/B7 unchanged). Late-starting pools that previously overflowed
  // to video strips now hit NO_WINDOW. Kept because the rule aligns with the
  // spec; if density matters more than spec compliance, tune
  // `MORNING_WAVE_WINDOW_MINS` larger or relax the multi-event exclusion.
  const failedEvents: { comp: Competition; error: SchedulingError }[] = []

  for (let day = 0; day < effectiveDays; day++) {
    const dayEvents = competitions.filter(c => dayMap.get(c.id) === day)
    if (dayEvents.length === 0) continue

    const ordered = sequenceEventsForDay(dayEvents, config)
    const isSingleEventDay = dayEvents.length === 1

    for (const comp of ordered) {
      const snapshot = snapshotState(state)
      try {
        const result = scheduleCompetition(comp, day, state, config, competitions, isSingleEventDay)

        // Flow constraint_relaxation_level from coloring
        const relaxLevel = relaxations.get(comp.id)
        if (relaxLevel !== undefined) {
          recordRelaxation(
            result, state, comp.id, relaxLevel, BottleneckSeverity.INFO,
            `${comp.id}: constraint relaxed to level ${relaxLevel} during day assignment`,
          )
        }
      } catch (err) {
        if (err instanceof SchedulingError) {
          // Restore state to prevent phantom resource allocations from partial
          // scheduling (scheduleOne may allocate strips/refs before a later phase
          // fails and throws without restoring).
          restoreState(state, snapshot)
          failedEvents.push({ comp, error: err })
        } else {
          throw err
        }
      }
    }
  }

  // ── Phase 4: Repair loop for failed events ──
  const MAX_REPAIR_ATTEMPTS = config.days_available

  for (const { comp, error: _originalError } of failedEvents) {
    const edges = graph.get(comp.id) ?? []
    const hardNeighborIds = edges
      .filter(e => e.weight === Infinity)
      .map(e => e.targetId)

    const blockedDays = new Set<number>()
    for (const neighborId of hardNeighborIds) {
      const neighborResult = state.schedule[neighborId]
      if (neighborResult) {
        blockedDays.add(neighborResult.assigned_day)
      }
    }

    const altDays = Array.from({ length: config.days_available }, (_, i) => i)
      .filter(d => !blockedDays.has(d))
      .sort((a, b) =>
        softPenaltyEstimate(comp.id, a, graph, state) -
        softPenaltyEstimate(comp.id, b, graph, state),
      )

    let repaired = false
    let attempts = 0

    for (const altDay of altDays) {
      if (attempts >= MAX_REPAIR_ATTEMPTS) break
      attempts++

      const snapshot = snapshotState(state)
      try {
        const result = scheduleCompetition(comp, altDay, state, config, competitions)

        // Apply relaxation level if present
        const relaxLevel = relaxations.get(comp.id)
        if (relaxLevel !== undefined) {
          recordRelaxation(
            result, state, comp.id, relaxLevel, BottleneckSeverity.WARN,
            `${comp.id}: repaired to day ${altDay}, constraint relaxed to level ${relaxLevel}`,
          )
        } else {
          state.bottlenecks.push({
            competition_id: comp.id,
            phase: Phase.DAY_ASSIGNMENT,
            cause: BottleneckCause.DEADLINE_BREACH,
            severity: BottleneckSeverity.WARN,
            delay_mins: 0,
            message: `${comp.id}: repaired by moving to day ${altDay} (original day lacked resources)`,
          })
        }
        repaired = true
        break
      } catch (retryErr) {
        if (retryErr instanceof SchedulingError) {
          restoreState(state, snapshot)
        } else {
          throw retryErr
        }
      }
    }

    if (!repaired) {
      // Record ERROR bottleneck (same pattern as original error handling)
      const alreadyRecorded = state.bottlenecks.some(
        (b) => b.competition_id === comp.id && b.severity === BottleneckSeverity.ERROR,
      )
      if (!alreadyRecorded) {
        const rawCause = typeof _originalError.cause === 'string' ? _originalError.cause : null
        const cause =
          rawCause && VALID_BOTTLENECK_CAUSES.has(rawCause as BottleneckCause)
            ? (rawCause as BottleneckCause)
            : BottleneckCause.RESOURCE_EXHAUSTION
        state.bottlenecks.push({
          competition_id: comp.id,
          phase: Phase.SCHEDULING,
          cause,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: _originalError.message,
        })
      }
    }
  }

  const diagnostics = postScheduleDiagnostics(competitions, config, state.bottlenecks)
  state.bottlenecks.push(...diagnostics)

  const dayBreakdown = postScheduleDayBreakdown(competitions, config, state)
  state.bottlenecks.push(...dayBreakdown)

  const postWarnings = postScheduleWarnings(state.schedule, config)
  state.bottlenecks.push(...postWarnings)

  return {
    schedule: state.schedule,
    bottlenecks: state.bottlenecks,
  }
}

// ──────────────────────────────────────────────
// softPenaltyEstimate — repair loop day ranking
// ──────────────────────────────────────────────

/**
 * Estimates the soft penalty for placing a competition on a given day,
 * used to rank alternative days in the repair loop. Sums soft-edge weights
 * for neighbors already scheduled on the same day, plus a load-balance
 * tiebreaker proportional to the number of events already on that day.
 */
function softPenaltyEstimate(
  compId: string,
  day: number,
  graph: ConstraintGraph,
  state: GlobalState,
): number {
  const edges = graph.get(compId) ?? []
  let penalty = 0
  for (const edge of edges) {
    if (edge.weight === Infinity) continue
    const neighborResult = state.schedule[edge.targetId]
    if (neighborResult && neighborResult.assigned_day === day) {
      penalty += edge.weight
    }
  }
  // Load-balance tiebreaker
  let eventsOnDay = 0
  for (const sr of Object.values(state.schedule)) {
    if (sr.assigned_day === day) eventsOnDay++
  }
  penalty += eventsOnDay * 0.1
  return penalty
}

// ──────────────────────────────────────────────
// sortWithPairs — METHODOLOGY.md §Scheduling Algorithm Phase 3
// ──────────────────────────────────────────────

/**
 * Sorts competitions by constraint_score descending (most constrained first).
 * Priority competitions are placed immediately before their flighted partner
 * so the pair is scheduled consecutively.
 */
export function sortWithPairs(
  competitions: Competition[],
  config: TournamentConfig,
): Competition[] {
  // Separate mandatory from optional — mandatory always comes first
  const mandatory = competitions.filter(c => !c.optional)
  const optional = competitions.filter(c => c.optional)

  return [
    ...sortByConstraint(mandatory, competitions, config),
    ...sortByConstraint(optional, competitions, config),
  ]
}

/**
 * Sorts a subset of competitions by constraint_score descending, keeping
 * flighting group pairs together (priority immediately before flighted).
 * Uses `allCompetitions` for constraint scoring context.
 */
function sortByConstraint(
  subset: Competition[],
  allCompetitions: Competition[],
  config: TournamentConfig,
): Competition[] {
  // Identify flighting group pairs: priority → flighted
  const priorityByGroup = new Map<string, Competition>()
  const flightedByGroup = new Map<string, Competition>()
  const ungrouped: Competition[] = []

  for (const c of subset) {
    if (c.flighting_group_id !== null) {
      if (c.is_priority) {
        priorityByGroup.set(c.flighting_group_id, c)
      } else {
        flightedByGroup.set(c.flighting_group_id, c)
      }
    } else {
      ungrouped.push(c)
    }
  }

  const scored = ungrouped.map(c => ({
    comp: c,
    score: constraintScore(c, allCompetitions, config),
  }))

  const pairedScored: { priority: Competition; flighted: Competition; score: number }[] = []
  for (const [groupId, priority] of priorityByGroup) {
    const flighted = flightedByGroup.get(groupId)
    if (flighted) {
      pairedScored.push({
        priority,
        flighted,
        score: constraintScore(priority, allCompetitions, config),
      })
    } else {
      scored.push({ comp: priority, score: constraintScore(priority, allCompetitions, config) })
    }
  }

  for (const [groupId, flighted] of flightedByGroup) {
    if (!priorityByGroup.has(groupId)) {
      scored.push({ comp: flighted, score: constraintScore(flighted, allCompetitions, config) })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  pairedScored.sort((a, b) => b.score - a.score)

  // Merge pairs into sorted ungrouped list by score position
  const result: Competition[] = []
  let pairIdx = 0
  let ungroupedIdx = 0

  while (pairIdx < pairedScored.length || ungroupedIdx < scored.length) {
    const pairScore = pairIdx < pairedScored.length ? pairedScored[pairIdx].score : -Infinity
    const ungroupedScore = ungroupedIdx < scored.length ? scored[ungroupedIdx].score : -Infinity

    // >= so pairs win ties — scheduling them together is more important than exact score order
    if (pairScore >= ungroupedScore && pairIdx < pairedScored.length) {
      result.push(pairedScored[pairIdx].priority)
      result.push(pairedScored[pairIdx].flighted)
      pairIdx++
    } else {
      result.push(scored[ungroupedIdx].comp)
      ungroupedIdx++
    }
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

  // Ref recommendation
  const rec = recommendRefCount(competitions, 1, config)
  const totalRecommended = rec.three_weapon + rec.foil_epee
  const maxConfiguredRefs = Math.max(
    ...config.referee_availability.map(d => d.foil_epee_refs + d.three_weapon_refs),
  )
  if (totalRecommended > maxConfiguredRefs) {
    results.push({
      competition_id: '',
      phase: Phase.POST_SCHEDULE,
      cause: BottleneckCause.RESOURCE_RECOMMENDATION,
      severity: BottleneckSeverity.INFO,
      delay_mins: 0,
      message: `Refs: need ${rec.three_weapon} three-weapon + ${rec.foil_epee} foil/epee (${totalRecommended} total), have ${maxConfiguredRefs} — add ${totalRecommended - maxConfiguredRefs} more.`,
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

  const refAvailByDay = new Map(config.referee_availability.map(r => [r.day, r]))

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

    // Ref summary for this day
    const dayRefConfig = refAvailByDay.get(day)
    const configuredRefs = dayRefConfig
      ? dayRefConfig.foil_epee_refs + dayRefConfig.three_weapon_refs
      : 0

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

    if (peakRefDemand > 0 || configuredRefs > 0) {
      const refDeficit = Math.max(0, peakRefDemand - configuredRefs)
      results.push({
        competition_id: '',
        phase: Phase.POST_SCHEDULE,
        cause: BottleneckCause.DAY_RESOURCE_SUMMARY,
        severity: refDeficit > 0 ? BottleneckSeverity.WARN : BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `Day ${day + 1} refs: peak demand ${peakRefDemand}, configured ${configuredRefs}${refDeficit > 0 ? ` — add ${refDeficit} more` : ''}.`,
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
        severity: videoStageSum > configuredRefs ? BottleneckSeverity.WARN : BottleneckSeverity.INFO,
        delay_mins: 0,
        message: `Day ${day + 1} video-stage DE ref demand: ${videoStageSum} refs across ${stagedCount} staged events`,
      })
    }
  }

  return results
}
