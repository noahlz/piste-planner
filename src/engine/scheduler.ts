/**
 * Master Scheduler — PRD Section 14
 *
 * Top-level orchestrator: sorts competitions by constraint priority,
 * schedules each via scheduleCompetition, and collects results + bottlenecks.
 */

import type {
  Competition,
  TournamentConfig,
  ScheduleResult,
  Bottleneck,
} from './types.ts'
import {
  BottleneckCause,
  BottleneckSeverity,
  dayStart,
} from './types.ts'
import { createGlobalState } from './resources.ts'
import { scheduleCompetition } from './scheduleOne.ts'
import { constraintScore, SchedulingError } from './dayAssignment.ts'

// ──────────────────────────────────────────────
// scheduleAll — PRD Section 14
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
 * Error handling: mandatory events that fail to schedule re-throw SchedulingError
 * (fail-fast). Optional events that fail are silently skipped — the bottleneck is
 * still recorded in state. On re-throw, partial results are lost since state is
 * not returned; callers needing partial results should wrap this call.
 */
export function scheduleAll(
  competitions: Competition[],
  config: TournamentConfig,
): ScheduleAllResult {
  const state = createGlobalState(config)

  // TODO: validate(competitions, config) — Task 5A

  const allSorted = sortWithPairs(competitions, config)

  for (const comp of allSorted) {
    try {
      // Pass original `competitions` (not sorted) for crossover/proximity context
      scheduleCompetition(comp, state, config, competitions)
    } catch (err) {
      if (err instanceof SchedulingError) {
        // Already recorded as bottleneck by scheduleCompetition/dayAssignment;
        // optional events that fail to schedule are silently skipped.
        if (!comp.optional) {
          // Re-throw for mandatory events — caller must handle
          throw err
        }
      } else {
        throw err
      }
    }
  }

  return {
    schedule: state.schedule,
    bottlenecks: state.bottlenecks,
  }
}

// ──────────────────────────────────────────────
// sortWithPairs — PRD Section 14
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
// postScheduleWarnings — PRD Section 14
// ──────────────────────────────────────────────

/**
 * Generates post-schedule warnings per PRD Section 14 (Ops Manual Group 2).
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

  if (firstDayDur > avgMiddle) {
    warnings.push({
      competition_id: '',
      phase: 'POST_SCHEDULE',
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `First day (${firstDayDur} min) is longer than average middle day (${Math.round(avgMiddle)} min)`,
    })
  }

  if (lastDayDur > avgMiddle) {
    warnings.push({
      competition_id: '',
      phase: 'POST_SCHEDULE',
      cause: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `Last day (${lastDayDur} min) is longer than average middle day (${Math.round(avgMiddle)} min)`,
    })
  }

  return warnings
}
