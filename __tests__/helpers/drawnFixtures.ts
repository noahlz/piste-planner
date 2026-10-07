/**
 * Boards for the drawn model's unplaced answer (017 T5a, spec §4). A run, then
 * the store's own Move day, so an Unplaced row comes from an unseated derived
 * event rather than from a board that was never run.
 */
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'

/**
 * The Unplaced and stale texts, verbatim from the spec (R4/R7, P3, P4). Copied
 * from the spec, never imported from derived.ts, so a wording change has to be
 * made in both places on purpose.
 */
export const UNPLACED_WORDING = {
  RERUN: 'No room here with the current schedule – re-run Auto-assign to schedule around it.',
  PIN: 'Pinned here, but no strips are free at this time – move or unpin it, then re-run Auto-assign.',
  STALE: 'Stale – re-run Auto-assign',
} as const

/** Resets the store, loads the preset and runs Auto-assign, as boot does. */
export function runPreset(id: ScenarioId): void {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset(id)
  runScheduleAll()
}

/**
 * Resets the store, loads B1's settings (80 strips, 12 video), applies a
 * catalogue template and runs Auto-assign: the plan's template sweep
 * (Global constraints), as `tmp/measure017templates.test.ts` measured it.
 */
export function runTemplate(name: string): void {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset('B1')
  useStore.getState().applyTemplate(name)
  runScheduleAll()
}

/** Pins every placed event where it sits. */
export function pinAll(): void {
  for (const placed of Object.keys(useStore.getState().placements)) useStore.getState().setPinned(placed, true)
}

/** Runs the preset, pins every placed event where the run put it, and runs again. */
export function runAndPinAll(id: ScenarioId): void {
  runPreset(id)
  pinAll()
  runScheduleAll()
}

/** The detail strip's Move day (`DetailStrip.tsx` `moveTo`): a new day at the same start. */
export function moveDay(id: string, day: number): void {
  const { placements, updatePlacement } = useStore.getState()
  updatePlacement(id, { day, start_time: placements[id].start_time })
}

/**
 * The headline move (spec §Pass conditions): after a run, the first placed id
 * by code point moves to the next day. On B1 that is D1-M-EPEE-IND, whose POOLS
 * and DE_PRELIMS then find no free strips, so the footer reads 23/1.
 */
export function runAndMoveHeadline(scenario: ScenarioId = 'B1'): { id: string; day: number } {
  runPreset(scenario)
  const { placements, days_available } = useStore.getState()
  const id = Object.keys(placements).sort()[0]
  const day = (placements[id].day + 1) % days_available
  moveDay(id, day)
  return { id, day }
}
