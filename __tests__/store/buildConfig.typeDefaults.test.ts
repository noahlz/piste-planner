import { describe, it, expect } from 'vitest'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import { TournamentType, RefPolicy, DeMode } from '../../src/engine/types.ts'

/**
 * Same snapshot-then-reset convention as buildConfig.test.ts's storeWith:
 * merge a partial onto the live store, read back the merged snapshot, then
 * restore the store so tests don't leak into each other. Duplicated here
 * (rather than imported) because buildConfig.test.ts doesn't export it —
 * this file is small enough that a second copy costs less than a shared
 * test-helper module for one function.
 */
function storeWith(partial: Partial<StoreState>): StoreState {
  const initial = useStore.getState()
  useStore.setState(partial)
  const state = useStore.getState()
  useStore.setState(initial)
  return state
}

const COMP_ID = 'D1-M-FOIL-IND'

/**
 * 013 T019 (research D7): re-targeted from the pre-shrink shape. `ref_policy`
 * and `de_mode` used to be per-competition overrides carrying an `AUTO`
 * sentinel that beat or deferred to the tournament type's default
 * (data-model.md, pre-013). T020's shrink removes both fields from
 * `CompetitionConfig` entirely — the store keeps only `fencer_count` and
 * `flighted`, and `buildConfig.ts` derives `ref_policy`/`de_mode`
 * unconditionally off `TYPE_DEFAULTS[type]` (data-model.md §4, FR-021: no
 * per-event control survives for either field). So this file's fixture no
 * longer has an override to set — only `tournamentType` and
 * `videoStripsTotal` remain real inputs; `video_strips_total` stays a
 * `TournamentSlice` field, untouched by the shrink.
 */
function minimalState(overrides: {
  tournamentType?: TournamentType
  videoStripsTotal?: number | null
} = {}): Partial<StoreState> {
  return {
    tournament_type: overrides.tournamentType ?? TournamentType.NAC,
    days_available: 1,
    dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
    strips_total: 10,
    // T060 target: `number | null`. Today's store type is `number` — see
    // module doc comment above.
    video_strips_total: (overrides.videoStripsTotal === undefined ? null : overrides.videoStripsTotal) as number,
    selectedCompetitions: {
      [COMP_ID]: {
        fencer_count: 64,
        flighted: false,
      },
    },
    // The seven-key override record this fixture seeded left with its slice
    // (013 T022). Nothing here changes: this file's assertions never read
    // those keys, so removing them changes no expected value below —
    // several of the removed keys did not in fact match constants.ts.
    flightingSuggestionStates: [],
  }
}

describe('buildTournamentConfig — per-type default resolution (data-model.md §Resolution rules)', () => {
  it('resolves ref_policy to the tournament type\'s referee count (NAC)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].ref_policy).toBe(RefPolicy.TWO)
  })

  it('resolves ref_policy to a different type\'s referee count (ROC, not NAC\'s)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.ROC }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].ref_policy).toBe(RefPolicy.ONE)
  })

  // Dropped without successor (013 T019, research D7): "an explicit
  // ref_policy beats the type default" — no per-event ref_policy control
  // survives the shrink (FR-021), so there is nothing left to be explicit
  // about. The two tests above already prove the type-default resolution
  // itself; this case's only content was the override winning, which no
  // longer exists.

  it('resolves de_mode to the tournament type\'s DE mode (NAC)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].de_mode).toBe(DeMode.STAGED)
  })

  it('resolves de_mode to a different type\'s DE mode (ROC, not NAC\'s)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.ROC }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].de_mode).toBe(DeMode.SINGLE_STAGE)
  })

  // Dropped without successor (013 T019, research D7): "an explicit de_mode
  // beats the type default" — same reasoning as ref_policy above. T022 later
  // adds a *tournament-level* de_mode_override (the Settings panel's
  // Staged/Single pills), which is a different mechanism than the retired
  // per-competition field this case exercised, and gets its own coverage
  // when T022 lands.

  it('resolves video_strips_total null to the tournament type\'s video strip count', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, videoStripsTotal: null }))
    const { config } = buildTournamentConfig(state)
    expect(config.video_strips_total).toBe(8)
  })

  it('resolves video_strips_total null to a different type\'s video strip count (ROC, not NAC\'s)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.ROC, videoStripsTotal: null }))
    const { config } = buildTournamentConfig(state)
    expect(config.video_strips_total).toBe(0)
  })

  it('leaves an explicit video_strips_total of 0 alone rather than resolving it to the type default', () => {
    // NAC's own default is 8 — 0 here can only survive if resolution treats
    // it as a real, explicit value rather than a falsy stand-in for null.
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, videoStripsTotal: 0 }))
    const { config } = buildTournamentConfig(state)
    expect(config.video_strips_total).toBe(0)
  })

  it('leaves an explicit non-zero video_strips_total alone', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, videoStripsTotal: 3 }))
    const { config } = buildTournamentConfig(state)
    expect(config.video_strips_total).toBe(3)
  })

  // FR-036: a tournament type change must not be able to destroy an
  // organizer's video_strips_total setting. Resolution has to happen on a
  // *copy* on the way to the engine — the store's own `null` stays put so a
  // later type change still sees "unset" and re-resolves against the new
  // type. Re-targeted (013 T019): the ref_policy/de_mode halves of this case
  // are gone with the fields themselves — there is nothing in the store left
  // to "not write back".
  it('does not write video_strips_total back to the store — null survives the call unresolved', () => {
    const state = storeWith(
      minimalState({ tournamentType: TournamentType.NAC, videoStripsTotal: null }),
    )

    buildTournamentConfig(state)

    expect(state.video_strips_total).toBeNull()
  })
})
