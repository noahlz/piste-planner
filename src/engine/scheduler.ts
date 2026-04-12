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
import { createGlobalState } from './resources.ts'
import { scheduleCompetition } from './scheduleOne.ts'
import { constraintScore, SchedulingError } from './dayAssignment.ts'
import { validateConfig } from './validation.ts'
import { recommendStripCount, recommendRefCount } from './stripBudget.ts'
import { dayConsumedCapacity } from './capacity.ts'
import { peakPoolRefDemand, peakDeRefDemand } from './refs.ts'

const VALID_BOTTLENECK_CAUSES = new Set(Object.values(BottleneckCause))

// ──────────────────────────────────────────────
// scheduleAll — METHODOLOGY.md §Scheduling Algorithm
// ──────────────────────────────────────────────

export interface ScheduleAllResult {
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

  const allSorted = sortWithPairs(competitions, config)

  for (const comp of allSorted) {
    try {
      // Pass original `competitions` (not sorted) for crossover/proximity context
      scheduleCompetition(comp, state, config, competitions)
    } catch (err) {
      if (err instanceof SchedulingError) {
        // Only add an ERROR bottleneck if scheduleCompetition didn't already record one
        // (some throw sites in scheduleOne.ts push a bottleneck before throwing)
        const alreadyRecorded = state.bottlenecks.some(
          (b) => b.competition_id === comp.id && b.severity === BottleneckSeverity.ERROR,
        )
        if (!alreadyRecorded) {
          const rawCause = typeof err.cause === 'string' ? err.cause : null
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
            message: err.message,
          })
        }
      } else {
        throw err
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
    const dayRefConfig = config.referee_availability.find(r => r.day === day)
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
      (sum, c) => sum + Math.max(c.de_round_of_16_strips, c.de_finals_strips),
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
