import { useStore, type StoreState } from './store.ts'
import { SCENARIOS, type ScenarioId } from '../data/tournaments.ts'

/**
 * Applies a B1–B8 fixture through the store's own actions rather than a raw
 * setState, so their invariants hold — setDays builds dayConfigs,
 * selectCompetitions builds a default CompetitionConfig per id — the same as
 * they would for hand-entered input (S2-contract.md §Presets). Defaults to
 * useStore.getState() when no state is passed, mirroring runScheduleAll in
 * src/store/runActions.ts.
 */
export function applyPreset(id: ScenarioId, state: StoreState = useStore.getState()): void {
  const fixture = SCENARIOS[id]

  state.setTournamentType(fixture.tournamentType)
  state.setDays(fixture.days)
  state.setStrips(fixture.strips)
  state.setVideoStrips(fixture.videoStrips)

  state.selectCompetitions(Object.keys(fixture.fencerCounts))
  for (const [competitionId, fencerCount] of Object.entries(fixture.fencerCounts)) {
    state.updateCompetition(competitionId, { fencer_count: fencerCount })
  }

  // Records which preset is loaded so the top bar's picker reflects it even
  // when boot(), not a picker interaction, is what loaded it (review finding B).
  state.setLoadedPresetId(id)
}
