import { useStore } from './store.ts'
import { decodeFromUrl } from './serialization.ts'
import { applyPreset } from './presets.ts'
import { runScheduleAll } from './runActions.ts'
import { applyLoadedState } from './exportActions.ts'
import { loadViewState } from './viewState.ts'
import { DEFAULT_PRESET_ID } from '../data/tournaments.ts'

export { DEFAULT_PRESET_ID }

/**
 * Decides what the app is looking at on first paint (FR-007,
 * S2-contract.md §Boot).
 *
 * A readable `#config=` fragment wins outright — the sender's tournament is
 * the tournament, so no preset is loaded over it and the auto-scheduler does
 * not run, leaving whatever placements the link carried. When the link also
 * carries the sender's `run`, boot replays it (017 R6), so the receiver's
 * board is the sender's, and a link without a valid run opens stale.
 * Everything else,
 * an unreadable fragment included, falls through to the default preset and
 * auto-schedules it, so the center shows a populated schedule with no user
 * action rather than an empty form. A refused fragment leaves its reason in
 * `loadRefusal` for the center's notice (018 R7).
 *
 * It also seeds the store's `autoRerun` flag from the viewer's stored
 * preference (on by default), the one place the feature is switched on.
 *
 * `hash` defaults to `window.location.hash` so tests drive it directly.
 */
export function bootstrap(hash: string = window.location.hash): void {
  // First, before any load or run: the app turns automatic re-run on here, from
  // this browser's stored preference, so a link's stale board is not re-run by
  // a flag that landed late (020 R3, R5, R5a).
  useStore.getState().setAutoRerun(loadViewState().autoRerun)

  let refusal: string | null = null
  if (hash.startsWith('#config=')) {
    const result = decodeFromUrl(hash)
    if ('error' in result) {
      console.error('Failed to load config from URL:', result.error)
      refusal = result.error
    } else {
      applyLoadedState(result.state, result.run)
      if (result.droppedPlacements.length > 0) {
        console.warn(
          'Dropped placements for events not in the shared configuration:',
          result.droppedPlacements.join(', '),
        )
      }
      if (result.runRefused !== null) {
        console.warn('Ignored the shared run, the board opens stale:', result.runRefused)
      }
      return
    }
  }

  applyPreset(DEFAULT_PRESET_ID)
  runScheduleAll()
  // After the preset, which clears it: the board shows B1 and the notice says why (018 R7).
  if (refusal !== null) useStore.getState().setLoadRefusal(refusal)
}
