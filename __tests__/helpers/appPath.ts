/**
 * Drives a B1–B8 scenario through the app's own route — `applyPreset` →
 * `buildTournamentConfig` → `scheduleAll` → `runScheduleAll`'s placement
 * filter — the same path `src/store/boot.ts` takes. No test-only shortcut
 * around `buildTournamentConfig`: this is the instrument the parity check
 * (contracts/day-axis.md C5) and the smoke floors read their numbers from,
 * so it has to be the real app path, not a stand-in for it.
 *
 * `runScheduleAll` only ever persists placements — `ref_requirements_by_day`
 * is a `scheduleAll` return value the store does not keep (baseline.md
 * "Referee attribution"), so this harness re-derives it by calling
 * `buildTournamentConfig` and `scheduleAll` directly rather than reading it
 * back off the store.
 */
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import type { RefRequirementsByDay } from '../../src/engine/types.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'

export interface AppPathResult {
  /** `Object.keys(store.placements).length` after `runScheduleAll()` — events with a non-null `pool_start`. */
  placedCount: number
  /** `Object.keys(store.selectedCompetitions).length` after `applyPreset`. */
  selectedCount: number
  /** From the same `scheduleAll` run, keyed by day (baseline.md "Referee attribution"). */
  refRequirementsByDay: RefRequirementsByDay[]
}

/**
 * Resets the store to its initial state, applies `id` through the store's
 * own actions, and runs the app's own scheduling route. The reset is what
 * lets sequential calls — the same scenario twice, or two different
 * scenarios in a row — each start from a clean store rather than
 * accumulating the previous call's selections and placements.
 */
export function runAppPath(id: ScenarioId): AppPathResult {
  useStore.setState(useStore.getInitialState(), true)

  applyPreset(id)
  const selectedCount = Object.keys(useStore.getState().selectedCompetitions).length

  runScheduleAll()
  const placedCount = Object.keys(useStore.getState().placements).length

  // Re-run scheduleAll directly (rather than reading the store) purely to
  // recover ref_requirements_by_day, which runScheduleAll discards. This is
  // the same config buildTournamentConfig would build for runScheduleAll —
  // buildTournamentConfig is pure over store state, so calling it again here
  // reads the identical inputs runScheduleAll just used.
  const { config, competitions } = buildTournamentConfig(useStore.getState())
  const result = scheduleAll(competitions, config)

  return {
    placedCount,
    selectedCount,
    refRequirementsByDay: result.ref_requirements_by_day ?? [],
  }
}
