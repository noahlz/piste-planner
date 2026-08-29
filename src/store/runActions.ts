import { useStore, type StoreState } from './store.ts'
import { buildTournamentConfig } from './buildConfig.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { PlacementSource, type Placement, type ScheduleResult } from '../engine/types.ts'

/**
 * Runs the auto-scheduler and records where it put each event. Only the
 * placements survive — bottlenecks, ref requirements, and the rest of the
 * scheduler's output derive on read from these inputs.
 *
 * A scheduling failure leaves the existing placements alone rather than
 * wiping them: the previous answer is still the best one on offer.
 */
export function runScheduleAll(state: StoreState = useStore.getState()): void {
  const { config, competitions } = buildTournamentConfig(state)

  let schedule: Record<string, ScheduleResult>
  try {
    schedule = scheduleAll(competitions, config).schedule
  } catch {
    return
  }

  const placements: Record<string, Placement> = {}
  for (const [id, result] of Object.entries(schedule)) {
    // A Placement has no way to say "somewhere on this day, time unknown", so an
    // event the scheduler left without a pool start simply gets no placement.
    if (result.pool_start === null) continue
    placements[id] = {
      day: result.assigned_day,
      start_time: result.pool_start,
      strip_count: result.pool_strip_count,
      strips: null,
      source: PlacementSource.AUTO,
      pinned: false,
    }
  }

  state.setPlacementsFromAuto(placements)
}
