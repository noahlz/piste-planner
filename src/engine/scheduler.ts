/**
 * scheduleAll is a thin re-export over scheduleAllConcurrent.
 *
 * All scheduling logic lives in concurrentScheduler.ts. Post-schedule helpers
 * (postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings)
 * are defined there and re-exported here so existing consumers resolve them
 * from this module without change.
 */

import type { Competition, TournamentConfig, ScheduleResult, Bottleneck, RefRequirementsByDay, StripAllocation, PinnedPlacement } from './types.ts'
import { scheduleAllConcurrent, postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings } from './concurrentScheduler.ts'

interface ScheduleAllResult {
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
  ref_requirements_by_day?: RefRequirementsByDay[]
  strip_allocations: StripAllocation[][]
}

/**
 * `pinned` defaults to a shared frozen empty array, so `scheduleAll(c, cfg)`
 * and `scheduleAll(c, cfg, [])` are the same call (013 FR-058).
 */
const NO_PINS: readonly PinnedPlacement[] = Object.freeze([])

export function scheduleAll(
  competitions: Competition[],
  config: TournamentConfig,
  pinned: readonly PinnedPlacement[] = NO_PINS,
): ScheduleAllResult {
  return scheduleAllConcurrent(competitions, config, pinned)
}

export { postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings }
