import { useStore, type StoreState } from './store.ts'
import { buildTournamentConfig, buildPinnedPlacements } from './buildConfig.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { placementFromResult } from '../engine/derive.ts'
import type { Placement, ScheduleResult } from '../engine/types.ts'

/** What `runScheduleAll` found: how many of the attempted competitions it placed. */
export interface AutoRunCounts {
  placed: number
  unplaced: number
}

/**
 * Runs the auto-scheduler and records where it put each event. Only the
 * placements survive — bottlenecks, ref requirements, and the rest of the
 * scheduler's output derive on read from these inputs.
 *
 * A scheduling failure leaves the existing placements alone rather than
 * wiping them: the previous answer is still the best one on offer.
 *
 * Returns the placed/unplaced counts and stamps them onto `lastAutoRun`, so
 * the top bar can report what the run did (T006, research D12). `unplaced` is
 * `competitions.length - placed`, not "a schedule entry with a null
 * pool_start": `concurrentScheduler.ts`'s `commitEventResult` only writes a
 * competition's entry once its terminal phase completes, so a permanently-
 * failed competition (an ERROR bottleneck) never gets a `schedule` entry at
 * all rather than one with a null `pool_start` — the latter count would
 * always read zero.
 */
export function runScheduleAll(state: StoreState = useStore.getState()): AutoRunCounts {
  const { config, competitions } = buildTournamentConfig(state)

  // The events the organizer has fixed. The engine schedules around them, and
  // they never count as work this run attempted (013 FR-054, FR-061).
  const pinned = buildPinnedPlacements(state)
  const pinnedIds = new Set(pinned.map((p) => p.competition_id))
  const attempted = competitions.length - pinned.length

  let schedule: Record<string, ScheduleResult>
  try {
    schedule = scheduleAll(competitions, config, pinned).schedule
  } catch {
    // Existing placements are left alone (the comment above), but the run
    // still happened and still gets stamped — nothing placed, everything
    // attempted counts as unplaced — so the top bar can say a run failed
    // rather than silently doing nothing.
    const counts: AutoRunCounts = { placed: 0, unplaced: attempted }
    state.setLastAutoRun({ at: Date.now(), ...counts })
    return counts
  }

  const placements: Record<string, Placement> = {}
  for (const [id, result] of Object.entries(schedule)) {
    // A pinned event's placement is the organizer's, not this run's output:
    // `setPlacementsFromAuto` carries the existing one over verbatim below.
    if (pinnedIds.has(id)) continue
    // `placementFromResult` takes the scheduler-axis shift back off and gives
    // no placement to an event the scheduler left without a pool start.
    const placement = placementFromResult(result)
    if (placement !== null) placements[id] = placement
  }

  state.setPlacementsFromAuto(placements, pinnedIds)

  const placed = Object.keys(placements).length
  const counts: AutoRunCounts = {
    placed,
    // Against `attempted`, not `competitions.length`: a pin was not attempted,
    // so counting it as unplaced would report failure for an event sitting
    // exactly where the organizer put it. Every event pinned reads `{0, 0}`.
    unplaced: attempted - placed,
  }
  state.setLastAutoRun({ at: Date.now(), ...counts })
  return counts
}
