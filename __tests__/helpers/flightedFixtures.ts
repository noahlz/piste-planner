/**
 * The two flighted events no scenario or template contains (017 plan, Global
 * constraints). Each loads the B1 preset and edits one competition before any
 * run, so every other event stays as B1 sets it.
 *
 * - `MANY_POOLS`: D1 men's epee at 310 fencers, flighted. Many pools, so both
 *   FLIGHT_A and FLIGHT_B run.
 * - `ONE_POOL`: a veteran sabre event at 6 fencers, flighted. One pool, so
 *   FLIGHT_B is empty and must never become a phase.
 */
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import type { CompetitionConfig } from '../../src/store/store.ts'

export const FLIGHTED_FIXTURES = {
  MANY_POOLS: { id: 'D1-M-EPEE-IND', partial: { flighted: true } },
  ONE_POOL: { id: 'VET-M-SABRE-IND-VCMB', partial: { fencer_count: 6, flighted: true } },
} as const satisfies Record<string, { id: string; partial: Partial<CompetitionConfig> }>

export type FlightedFixtureName = keyof typeof FLIGHTED_FIXTURES

/** Resets the store, loads B1, applies the fixture's edit and returns the edited event's id. */
export function loadFlightedFixture(name: FlightedFixtureName): string {
  const { id, partial } = FLIGHTED_FIXTURES[name]
  useStore.setState(useStore.getInitialState(), true)
  applyPreset('B1')
  useStore.getState().updateCompetition(id, partial)
  return id
}
