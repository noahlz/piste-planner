import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore, type StoreState, type GlobalOverrides } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import {
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
} from '../../src/engine/constants.ts'
import {
  TournamentType, RefPolicy, CutMode, DeMode, VideoPolicy, Weapon,
} from '../../src/engine/types.ts'

/**
 * T069 (004-p3-workbench-shell, US5) — failing tests for the widened
 * GlobalOverrides slice (contract §1-§3, us5-contract.md). GlobalOverrides
 * today only carries three keys; this file asserts the target seven-key
 * shape. Until T072 implements the widening, `globalOverrides` on the store
 * and `TournamentConfig` on the engine side do not have the four new keys
 * (DE_BOUT_DURATION, YOUTH_VET_BOUT_DELTA, DEFAULT_DE_STRIP_FOOTPRINT, and
 * SLOT_MINS moving from the "engine constants" block into overrides), so
 * this file does not typecheck yet — `tsc -b` is expected to stay red for it
 * (contract §6, constitution II). Vitest transpiles via esbuild without
 * type-checking, so the runtime assertions below still run and fail for the
 * right (assertion) reason rather than a compile error.
 */

/**
 * The full seven-key default record, read from the constants the store is
 * supposed to seed itself from — never a repeated literal (contract §1).
 * `GlobalOverrides` only has three keys until T072 widens it, so this
 * function's return type does not typecheck yet — see the module doc
 * comment above.
 */
function defaultGlobalOverrides(): GlobalOverrides {
  return {
    ADMIN_GAP_MINS,
    FLIGHT_BUFFER_MINS,
    THRESHOLD_MINS,
    SLOT_MINS,
    DE_BOUT_DURATION: { ...DE_BOUT_DURATION },
    YOUTH_VET_BOUT_DELTA,
    DEFAULT_DE_STRIP_FOOTPRINT,
  }
}

const COMP_ID = 'D1-M-FOIL-IND'

/**
 * One NAC individual foil event, 64 entries, SINGLE_STAGE DE — same shape
 * buildConfig.test.ts's minimalState uses. 64 fencers cut 20% (PERCENTAGE)
 * promotes to round(64*0.8)=51, which nextPowerOf2 rounds up to a 64
 * bracket, so deStripFootprint's cap (16, or whatever DEFAULT_DE_STRIP_FOOTPRINT
 * is overridden to) actually binds against bracketSize/2=32 — this is the
 * fixture the "changing an override changes the schedule" cases run.
 */
function minimalState(): Partial<StoreState> {
  return {
    tournament_type: TournamentType.NAC,
    days_available: 1,
    dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
    strips_total: 10,
    video_strips_total: 2,
    selectedCompetitions: {
      [COMP_ID]: {
        fencer_count: 64,
        ref_policy: RefPolicy.AUTO,
        cut_mode: CutMode.PERCENTAGE,
        cut_value: 20,
        de_mode: DeMode.SINGLE_STAGE,
        de_video_policy: VideoPolicy.BEST_EFFORT,
        use_single_pool_override: false,
      },
    },
    globalOverrides: defaultGlobalOverrides(),
    flightingSuggestionStates: [],
  }
}

/** Applies a partial onto the live store and returns the merged snapshot. */
function applyState(partial: Partial<StoreState>): StoreState {
  useStore.setState(partial)
  return useStore.getState()
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

describe('GlobalOverrides — widened to seven keys (contract §1)', () => {
  // Retitled (T078 finding 6): this compares the store against the very
  // constants it imports, so it pins the seven keys and their values and
  // cannot tell a seeded value from a hardcoded literal — `ADMIN_GAP_MINS: 30`
  // written straight into the slice passes it. The sourcing half is the case
  // below.
  it('initializes all seven keys on a fresh store at their constants.ts values', () => {
    const { globalOverrides } = useStore.getState()

    expect(globalOverrides.ADMIN_GAP_MINS).toBe(ADMIN_GAP_MINS)
    expect(globalOverrides.FLIGHT_BUFFER_MINS).toBe(FLIGHT_BUFFER_MINS)
    expect(globalOverrides.THRESHOLD_MINS).toBe(THRESHOLD_MINS)
    expect(globalOverrides.SLOT_MINS).toBe(SLOT_MINS)
    expect(globalOverrides.DE_BOUT_DURATION).toEqual(DE_BOUT_DURATION)
    expect(globalOverrides.YOUTH_VET_BOUT_DELTA).toBe(YOUTH_VET_BOUT_DELTA)
    expect(globalOverrides.DEFAULT_DE_STRIP_FOOTPRINT).toBe(DEFAULT_DE_STRIP_FOOTPRINT)
  })

  // The property the slice's own comment claims — "a default that moves in
  // constants.ts moves here with it" — and the one FR-045's merge-onto-defaults
  // depends on. Only a moved default can distinguish seeding from a literal:
  // swap ADMIN_GAP_MINS for one dynamically re-imported copy of the store and
  // see whether the fresh slice followed. Every other export passes through via
  // importOriginal, and resetModules() on both sides keeps this file's
  // top-level static imports — bound once at file load — out of it. Same idiom
  // __tests__/store/settingsSerialization.test.ts uses for the load side.
  it('seeds from the constants themselves — a moved default moves the fresh store with it', async () => {
    vi.resetModules()
    vi.doMock('../../src/engine/constants.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/engine/constants.ts')>()
      return { ...actual, ADMIN_GAP_MINS: 777 }
    })

    try {
      const { useStore: storeWithMovedDefault } = await import('../../src/store/store.ts')

      expect(storeWithMovedDefault.getState().globalOverrides.ADMIN_GAP_MINS).toBe(777)
    } finally {
      vi.doUnmock('../../src/engine/constants.ts')
      vi.resetModules()
    }
  })
})

describe('each override reaches buildTournamentConfig (contract §2)', () => {
  it('ADMIN_GAP_MINS -> config.ADMIN_GAP_MINS', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), ADMIN_GAP_MINS: 45 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.ADMIN_GAP_MINS).toBe(45)
  })

  it('FLIGHT_BUFFER_MINS -> config.FLIGHT_BUFFER_MINS', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), FLIGHT_BUFFER_MINS: 25 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.FLIGHT_BUFFER_MINS).toBe(25)
  })

  it('THRESHOLD_MINS -> config.THRESHOLD_MINS', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), THRESHOLD_MINS: 20 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.THRESHOLD_MINS).toBe(20)
  })

  // buildConfig.ts today feeds config.SLOT_MINS from the imported constant in
  // its "Engine constants" block (buildConfig.ts:87), not from the slice —
  // this is the one case the contract explicitly calls out as needing to move
  // (contract §3). Asserting against the slice value here is what pins that.
  it('SLOT_MINS -> config.SLOT_MINS, sourced from the slice rather than the imported constant', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), SLOT_MINS: 2 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.SLOT_MINS).toBe(2)
  })

  it('DE_BOUT_DURATION -> config.DE_BOUT_DURATION', () => {
    const overridden = { ...DE_BOUT_DURATION, [Weapon.SABRE]: 99 }
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), DE_BOUT_DURATION: overridden },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.DE_BOUT_DURATION).toEqual(overridden)
  })

  it('YOUTH_VET_BOUT_DELTA -> config.YOUTH_VET_BOUT_DELTA', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), YOUTH_VET_BOUT_DELTA: -8 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.YOUTH_VET_BOUT_DELTA).toBe(-8)
  })

  it('DEFAULT_DE_STRIP_FOOTPRINT -> config.DEFAULT_DE_STRIP_FOOTPRINT', () => {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), DEFAULT_DE_STRIP_FOOTPRINT: 8 },
    })
    const { config } = buildTournamentConfig(state)
    expect(config.DEFAULT_DE_STRIP_FOOTPRINT).toBe(8)
  })
})

describe('FR-046: changing an override changes the derived schedule', () => {
  function runSchedule(overrides: Partial<GlobalOverrides>) {
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), ...overrides },
    })
    const { config, competitions } = buildTournamentConfig(state)
    const { schedule } = scheduleAll(competitions, config)
    return schedule[COMP_ID]
  }

  // Settings tried for this pair, and why the two kept were kept:
  // - ADMIN_GAP_MINS: already threaded end-to-end today (derive.ts:203,
  //   concurrentScheduler.ts:684 both add config.ADMIN_GAP_MINS to a phase
  //   boundary), so it is a same-file sanity check that this fixture and
  //   this harness can detect a schedule difference at all.
  // - DEFAULT_DE_STRIP_FOOTPRINT: the pair member the contract flags as
  //   actually new (contract §2, de.ts:88 deStripFootprint). Chosen over
  //   YOUTH_VET_BOUT_DELTA/DE_BOUT_DURATION because this fixture's event is
  //   neither youth nor veteran, so the delta would never apply, and a raw
  //   per-bout duration change is a smaller, easier-to-miss shift than the
  //   footprint capping how many strips a 64-bracket DE phase is granted.
  // - FLIGHT_BUFFER_MINS/THRESHOLD_MINS: this single-competition fixture
  //   never flights, so neither setting is reachable here.

  it('ADMIN_GAP_MINS shifts the DE start later', () => {
    const baseline = runSchedule({})
    const withLargerGap = runSchedule({ ADMIN_GAP_MINS: ADMIN_GAP_MINS + 60 })

    expect(baseline.de_start).not.toBeNull()
    expect(withLargerGap.de_start).not.toBe(baseline.de_start)
    expect(withLargerGap.de_start).toBeGreaterThan(baseline.de_start!)
  })

  // Verified by hand against this exact fixture (buildTournamentConfig +
  // scheduleAll run directly, footprint threading simulated by reading
  // the printed ScheduleResult): this fixture's DE phase is granted 8
  // strips (de_strip_count: 8 — from max_de_strip_pct 0.80 * strips_total
  // 10, unrelated to the footprint), while deStripFootprint(64)=16 asks
  // for 16. de.ts's deSingleStageDuration ratio is
  // min(granted/desired, 1) = min(8/16, 1) = 0.5, giving
  // ceil(116.25/0.5) = 233 — the baseline value below. Once
  // DEFAULT_DE_STRIP_FOOTPRINT is threaded and overridden to 4 (below the
  // 8-strip grant), desired drops to 4, granted becomes min(4,8)=4, the
  // ratio reaches 1.0 (fully satisfied), and duration drops to
  // round(116.25) = 116 — a real, legible difference, not a rounding
  // fluctuation. Today this override does not reach deStripFootprint at
  // all (contract §2), so both runs use the unthreaded module constant
  // (16) and produce the same 233 — the RED reason below is a same-value
  // failure, not an `undefined`, because nothing throws; the config field
  // is simply not read yet.
  it('DEFAULT_DE_STRIP_FOOTPRINT changes the DE phase duration for a strip-constrained 64-bracket', () => {
    const baseline = runSchedule({})
    const withSmallerFootprint = runSchedule({ DEFAULT_DE_STRIP_FOOTPRINT: 4 })

    expect(withSmallerFootprint.de_duration_actual).not.toBe(baseline.de_duration_actual)
  })
})

describe('DE_BOUT_DURATION — setGlobalOverrides merges shallowly (contract §1, §4)', () => {
  it('replaces the whole record when the caller passes a partial one without spreading', () => {
    useStore.getState().setGlobalOverrides({
      DE_BOUT_DURATION: { [Weapon.EPEE]: 99 } as Record<Weapon, number>,
    })

    // The top-level merge is shallow: DE_BOUT_DURATION as a whole is
    // replaced, so FOIL/SABRE are gone, not preserved at their defaults.
    expect(useStore.getState().globalOverrides.DE_BOUT_DURATION).toEqual({ [Weapon.EPEE]: 99 })
  })

  // Deliberately reads `current` off the live store rather than seeding it
  // via minimalState()/defaultGlobalOverrides() — this is meant to exercise
  // the same default the "slice defaults" describe block above pins. Until
  // T072 widens the store's own initial globalOverrides, `current` here is
  // `undefined` (the slice has no DE_BOUT_DURATION key at all yet), so
  // spreading it can't preserve FOIL/SABRE — that is the expected RED
  // reason. Once the slice is widened, `current` becomes the real 3-weapon
  // default and this starts exercising the intended spread semantics.
  it('preserves all three weapons when the caller spreads the current record before overwriting one', () => {
    const current = useStore.getState().globalOverrides.DE_BOUT_DURATION
    useStore.getState().setGlobalOverrides({
      DE_BOUT_DURATION: { ...current, [Weapon.EPEE]: 99 },
    })

    expect(useStore.getState().globalOverrides.DE_BOUT_DURATION).toEqual({
      ...DE_BOUT_DURATION,
      [Weapon.EPEE]: 99,
    })
  })

  it('a spread-overwritten DE_BOUT_DURATION reaches buildTournamentConfig with all three weapons', () => {
    const overridden = { ...DE_BOUT_DURATION, [Weapon.EPEE]: 99 }
    const state = applyState({
      ...minimalState(),
      globalOverrides: { ...defaultGlobalOverrides(), DE_BOUT_DURATION: overridden },
    })
    const { config } = buildTournamentConfig(state)

    expect(config.DE_BOUT_DURATION).toEqual(overridden)
    expect(Object.keys(config.DE_BOUT_DURATION as Record<Weapon, number>).sort()).toEqual(
      [Weapon.EPEE, Weapon.FOIL, Weapon.SABRE].sort(),
    )
  })
})
