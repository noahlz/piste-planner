import { useStore } from './store.ts'
import { decodeFromUrl } from './serialization.ts'
import { applyPreset } from './presets.ts'
import { runScheduleAll } from './runActions.ts'
import type { ScenarioId } from '../data/tournaments.ts'

/** The preset the app opens on when no shared link says otherwise. */
export const DEFAULT_PRESET_ID: ScenarioId = 'B1'

/**
 * Decides what the app is looking at on first paint (FR-007,
 * S2-contract.md §Boot).
 *
 * A readable `#config=` fragment wins outright — the sender's tournament is
 * the tournament, so no preset is loaded over it and the auto-scheduler does
 * not run, leaving whatever placements the link carried. Everything else,
 * an unreadable fragment included, falls through to the default preset and
 * auto-schedules it, so the center shows a populated schedule with no user
 * action rather than an empty form.
 *
 * `hash` defaults to `window.location.hash` so tests drive it directly.
 */
export function bootstrap(hash: string = window.location.hash): void {
  if (hash.startsWith('#config=')) {
    const result = decodeFromUrl(hash)
    if ('error' in result) {
      console.error('Failed to load config from URL:', result.error)
    } else {
      useStore.setState(result.state)
      if (result.droppedPlacements.length > 0) {
        console.warn(
          'Dropped placements for events not in the shared configuration:',
          result.droppedPlacements.join(', '),
        )
      }
      return
    }
  }

  applyPreset(DEFAULT_PRESET_ID)
  runScheduleAll()
}
