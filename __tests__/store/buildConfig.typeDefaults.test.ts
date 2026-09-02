import { describe, it, expect } from 'vitest'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import { TournamentType, RefPolicy, DeMode, CutMode, VideoPolicy } from '../../src/engine/types.ts'
import {
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
} from '../../src/engine/constants.ts'

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
 * One NAC competition, everything else at buildConfig.test.ts's minimalState
 * values. `de_mode` and `video_strips_total` are written against the *target*
 * shapes T060 introduces — DeModeSetting ('AUTO' | 'SINGLE_STAGE' | 'STAGED')
 * and `number | null` — not today's DeMode / number. That's expected not to
 * typecheck until T060 lands (data-model.md §Resolution rules); Vitest
 * transpiles via esbuild without type-checking, so the mismatch doesn't stop
 * the suite from running red for the right (assertion) reason.
 */
function minimalState(overrides: {
  tournamentType?: TournamentType
  refPolicy?: RefPolicy
  deMode?: DeMode | 'AUTO'
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
        ref_policy: overrides.refPolicy ?? RefPolicy.AUTO,
        cut_mode: CutMode.PERCENTAGE,
        cut_value: 20,
        // T060 target: DeModeSetting. Today's CompetitionConfig.de_mode type
        // is DeMode (no 'AUTO' member) — see module doc comment above.
        de_mode: (overrides.deMode ?? 'AUTO') as DeMode,
        de_video_policy: VideoPolicy.REQUIRED,
        use_single_pool_override: false,
      },
    },
    // T072 (004 US5): the slice's four new keys carry the constants' own
    // values — this file exercises per-type default resolution, not overrides,
    // and `SLOT_MINS` now reaches the config through the slice rather than an
    // import, so it has to be seeded from the constant to stay unchanged.
    globalOverrides: {
      ADMIN_GAP_MINS: 20,
      FLIGHT_BUFFER_MINS: 10,
      THRESHOLD_MINS: 5,
      SLOT_MINS,
      DE_BOUT_DURATION: { ...DE_BOUT_DURATION },
      YOUTH_VET_BOUT_DELTA,
      DEFAULT_DE_STRIP_FOOTPRINT,
    },
    flightingSuggestionStates: [],
  }
}

describe('buildTournamentConfig — per-type default resolution (data-model.md §Resolution rules)', () => {
  it('resolves ref_policy AUTO to the tournament type\'s referee count', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, refPolicy: RefPolicy.AUTO }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].ref_policy).toBe(RefPolicy.TWO)
  })

  it('resolves ref_policy AUTO to a different type\'s referee count (ROC, not NAC\'s)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.ROC, refPolicy: RefPolicy.AUTO }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].ref_policy).toBe(RefPolicy.ONE)
  })

  it('leaves an explicit ref_policy alone even when it disagrees with the type default (organizer beats default)', () => {
    // NAC's own default is TWO — ONE here can only survive if resolution
    // skips it rather than overwriting it.
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, refPolicy: RefPolicy.ONE }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].ref_policy).toBe(RefPolicy.ONE)
  })

  it('resolves de_mode AUTO to the tournament type\'s DE mode', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, deMode: 'AUTO' }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].de_mode).toBe(DeMode.STAGED)
  })

  it('resolves de_mode AUTO to a different type\'s DE mode (ROC, not NAC\'s)', () => {
    const state = storeWith(minimalState({ tournamentType: TournamentType.ROC, deMode: 'AUTO' }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].de_mode).toBe(DeMode.SINGLE_STAGE)
  })

  it('leaves an explicit de_mode alone even when it disagrees with the type default (organizer beats default)', () => {
    // NAC's own default is STAGED — SINGLE_STAGE here can only survive if
    // resolution skips it rather than overwriting it.
    const state = storeWith(minimalState({ tournamentType: TournamentType.NAC, deMode: DeMode.SINGLE_STAGE }))
    const { competitions } = buildTournamentConfig(state)
    expect(competitions[0].de_mode).toBe(DeMode.SINGLE_STAGE)
  })

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
  // organizer's setting. Resolution has to happen on a *copy* on the way to
  // the engine — the store's own AUTO/AUTO/null stay put so a later type
  // change still sees "unset" and re-resolves against the new type, rather
  // than seeing whatever the previous type happened to resolve to.
  it('does not write resolved values back to the store — AUTO/AUTO/null survive the call unresolved', () => {
    const state = storeWith(
      minimalState({ tournamentType: TournamentType.NAC, refPolicy: RefPolicy.AUTO, deMode: 'AUTO', videoStripsTotal: null }),
    )

    buildTournamentConfig(state)

    expect(state.selectedCompetitions[COMP_ID].ref_policy).toBe(RefPolicy.AUTO)
    expect(state.selectedCompetitions[COMP_ID].de_mode).toBe('AUTO')
    expect(state.video_strips_total).toBeNull()
  })
})
