/**
 * scheduleAll is a thin re-export over scheduleAllConcurrent.
 *
 * All scheduling logic lives in concurrentScheduler.ts. Post-schedule helpers
 * (postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings)
 * are defined there and re-exported here so existing consumers resolve them
 * from this module without change.
 */

import type { Competition, TournamentConfig, ScheduleResult, Bottleneck, RefRequirementsByDay, StripAllocation } from './types.ts'
import { scheduleAllConcurrent, postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings } from './concurrentScheduler.ts'

interface ScheduleAllResult {
  schedule: Record<string, ScheduleResult>
  bottlenecks: Bottleneck[]
  ref_requirements_by_day?: RefRequirementsByDay[]
  strip_allocations: StripAllocation[][]
}

export function scheduleAll(
  competitions: Competition[],
  config: TournamentConfig,
): ScheduleAllResult {
  return scheduleAllConcurrent(competitions, config)
}

export { postScheduleDiagnostics, postScheduleDayBreakdown, postScheduleWarnings }
