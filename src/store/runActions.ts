import { useStore, type StoreState } from './store.ts'
import { buildTournamentConfig, buildPinnedPlacements } from './buildConfig.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { placementFromResult } from '../engine/derive.ts'
import { keepRun } from './keptRun.ts'
import type { Placement, PinnedPlacement, ScheduleResult, StripAllocation } from '../engine/types.ts'

/** What `runScheduleAll` found: how many of the attempted competitions it placed. */
export interface AutoRunCounts {
  placed: number
  unplaced: number
}

/**
 * Runs the auto-scheduler and records where it put each event. The placements
 * are the only schedule state that persists – bottlenecks, ref requirements,
 * and the rest of the scheduler's output derive on read from these inputs.
 * The whole run is also kept in memory as `lastRun` (017 spec §1), written in
 * the same store update as the placements, so the canvas can draw the
 * scheduler's own times and strips. Only its pins are serialized (017 T8, as
 * `run`), so a link or file can replay it.
 *
 * A scheduling failure leaves the existing placements alone rather than
 * wiping them: the previous answer is still the best one on offer. The kept
 * run goes, though – it described a board the failed run did not reproduce.
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
  let allocations: StripAllocation[][]
  try {
    ;({ schedule, strip_allocations: allocations } = scheduleAll(competitions, config, pinned))
  } catch {
    // Existing placements are left alone (the comment above), but the run
    // still happened and still gets stamped — nothing placed, everything
    // attempted counts as unplaced — so the top bar can say a run failed
    // rather than silently doing nothing.
    const counts: AutoRunCounts = { placed: 0, unplaced: attempted }
    state.setLastRun(null)
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

  const kept = keepRun({ schedule, strip_allocations: allocations }, config, competitions, pinned)
  state.setPlacementsFromAuto(placements, pinnedIds, kept)

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

/**
 * Replays `pins` through the scheduler and keeps the run, the way a link or a
 * file rebuilds the sender's board (017 R6, P6). Writes `lastRun` only, never a
 * placement: the placements are the ones the payload carried. A scheduler that
 * throws leaves no run, so the board opens stale rather than drawing a run it
 * did not reproduce, and the reason is logged and returned for the caller to
 * report the way a refused run is. Only `scheduleAll` is guarded, so a broken
 * invariant in `keepRun` still surfaces.
 *
 * Returns the failure's reason, or null when the run was replayed.
 */
export function replayRun(state: StoreState, pins: readonly PinnedPlacement[]): string | null {
  const { config, competitions } = buildTournamentConfig(state)
  let run: ReturnType<typeof scheduleAll>
  try {
    run = scheduleAll(competitions, config, pins)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn('Could not replay the saved run, the board opens stale:', reason)
    state.setLastRun(null)
    return reason
  }
  state.setLastRun(keepRun(run, config, competitions, pins))
  return null
}
