import { describe, it, expect } from 'vitest'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import {
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
} from '../../src/engine/constants.ts'
import type { DayConfig } from '../../src/engine/types.ts'
import {
  CutMode, DeMode, VideoPolicy, RefPolicy, TournamentType,
} from '../../src/engine/types.ts'

/**
 * Assertions for contracts/day-axis.md C1: the config handed to `scheduleAll`
 * must carry scheduler-axis day windows — day d at
 * [d*1440 + start_d, d*1440 + end_d) — disjoint, ordered, congruent to the
 * store's clock-axis day mod 1440, and slot-aligned.
 *
 * Today `buildTournamentConfig` passes `state.dayConfigs` straight through
 * with no offset (buildConfig.ts:52), so every day's window is identical to
 * its clock-axis window and all days coincide on the same span. These
 * assertions are red for that reason until T006 adds the offset.
 */

/** Helper: reset store and apply partial state, returning the full state snapshot. */
function storeWith(partial: Partial<StoreState>): StoreState {
  const initial = useStore.getState()
  useStore.setState(partial)
  const state = useStore.getState()
  // Reset after snapshot so tests don't leak
  useStore.setState(initial)
  return state
}

/** Minimal store state that produces a valid config, parameterized on day hours. */
function stateWithDayConfigs(dayConfigs: DayConfig[]): Partial<StoreState> {
  return {
    tournament_type: TournamentType.NAC,
    days_available: dayConfigs.length,
    dayConfigs,
    strips_total: 10,
    video_strips_total: 2,
    selectedCompetitions: {
      'D1-M-FOIL-IND': {
        fencer_count: 64,
        ref_policy: RefPolicy.AUTO,
        cut_mode: CutMode.PERCENTAGE,
        cut_value: 20,
        de_mode: DeMode.SINGLE_STAGE,
        de_video_policy: VideoPolicy.REQUIRED,
        use_single_pool_override: false,
      },
    },
    globalOverrides: {
      ADMIN_GAP_MINS: 20,
      FLIGHT_BUFFER_MINS: 10,
      THRESHOLD_MINS: 5,
      // T072 (004 US5): the four keys the slice gained, at the constants' own
      // values. This file asserts on day-window arithmetic, and `SLOT_MINS` —
      // which buildConfig now reads from the slice instead of importing — has
      // to stay the constant or every snapped boundary here would shift.
      SLOT_MINS,
      DE_BOUT_DURATION: { ...DE_BOUT_DURATION },
      YOUTH_VET_BOUT_DELTA,
      DEFAULT_DE_STRIP_FOOTPRINT,
    },
    flightingSuggestionStates: [],
  }
}

/** C1.1 — no two windows in the list overlap. */
function assertPairwiseDisjoint(windows: DayConfig[]): void {
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i]
      const b = windows[j]
      const overlaps = a.day_start_time < b.day_end_time && b.day_start_time < a.day_end_time
      expect(
        overlaps,
        `day ${i} [${a.day_start_time},${a.day_end_time}) overlaps day ${j} [${b.day_start_time},${b.day_end_time})`,
      ).toBe(false)
    }
  }
}

/** C1.2 — window d ends at or before window d+1 begins. */
function assertStrictlyOrdered(windows: DayConfig[]): void {
  for (let d = 0; d < windows.length - 1; d++) {
    expect(
      windows[d].day_end_time,
      `day ${d} does not end before day ${d + 1} begins`,
    ).toBeLessThanOrEqual(windows[d + 1].day_start_time)
  }
}

/** C1.3 — window d reduces to the store's clock-axis day d modulo 1440. */
function assertCongruentToStoreDay(windows: DayConfig[], storeDayConfigs: DayConfig[]): void {
  windows.forEach((w, d) => {
    expect(((w.day_start_time % 1440) + 1440) % 1440).toBe(storeDayConfigs[d].day_start_time)
    expect(((w.day_end_time % 1440) + 1440) % 1440).toBe(storeDayConfigs[d].day_end_time)
  })
}

/** C1.4 — every boundary is a multiple of SLOT_MINS. */
function assertSlotAligned(windows: DayConfig[]): void {
  for (const w of windows) {
    expect(w.day_start_time % SLOT_MINS).toBe(0)
    expect(w.day_end_time % SLOT_MINS).toBe(0)
  }
}

/**
 * Anchors day 0 to a zero offset: its emitted window equals the store's own
 * clock-axis day-0 window exactly, not just congruent to it modulo 1440.
 *
 * None of C1.1-C1.4 pin the axis's absolute origin — disjointness and
 * ordering only constrain the windows' spacing relative to each other, and
 * congruence-mod-1440 is blind by construction to a shift by a whole number
 * of days. An off-by-one day index (emitting (d+1)*1440 + start_d instead of
 * d*1440 + start_d for every d) passes all four of them. This assertion is
 * what a shift like that fails.
 */
function assertDayZeroUnshifted(windows: DayConfig[], storeDayConfigs: DayConfig[]): void {
  expect(windows[0], 'day 0 must equal the store\'s own day-0 window, unshifted').toEqual(
    storeDayConfigs[0],
  )
}

describe('day axis invariants (contracts/day-axis.md C1)', () => {
  describe('uniform hours (three identical days)', () => {
    const storeDayConfigs: DayConfig[] = [
      { day_start_time: 480, day_end_time: 1320 },
      { day_start_time: 480, day_end_time: 1320 },
      { day_start_time: 480, day_end_time: 1320 },
    ]

    function buildWindows(): DayConfig[] {
      const state = storeWith(stateWithDayConfigs(storeDayConfigs))
      const { config } = buildTournamentConfig(state)
      return config.dayConfigs
    }

    // Load-bearing: this is the only assertion in the file that pins the
    // full array to absolute values. The property checks below it (disjoint,
    // ordered, congruent, slot-aligned) do not — see assertDayZeroUnshifted's
    // comment. Do not replace this with the property checks alone.
    it('emits the exact scheduler-axis windows (literal expectation)', () => {
      const windows = buildWindows()
      expect(windows).toEqual([
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 1920, day_end_time: 2760 },
        { day_start_time: 3360, day_end_time: 4200 },
      ])
    })

    it('is pairwise disjoint', () => {
      assertPairwiseDisjoint(buildWindows())
    })

    it('is strictly ordered', () => {
      assertStrictlyOrdered(buildWindows())
    })

    it('is congruent to the store day modulo 1440', () => {
      assertCongruentToStoreDay(buildWindows(), storeDayConfigs)
    })

    it('is slot-aligned', () => {
      assertSlotAligned(buildWindows())
    })

    it('anchors day 0 to a zero offset', () => {
      assertDayZeroUnshifted(buildWindows(), storeDayConfigs)
    })
  })

  describe('per-day hours (three days, different start/end times)', () => {
    const storeDayConfigs: DayConfig[] = [
      { day_start_time: 480, day_end_time: 1200 }, // 08:00-20:00
      { day_start_time: 540, day_end_time: 1320 }, // 09:00-22:00
      { day_start_time: 420, day_end_time: 1080 }, // 07:00-18:00
    ]

    function buildWindows(): DayConfig[] {
      const state = storeWith(stateWithDayConfigs(storeDayConfigs))
      const { config } = buildTournamentConfig(state)
      return config.dayConfigs
    }

    // Load-bearing: this is the only assertion in the file that pins the
    // full array to absolute values. The property checks below it (disjoint,
    // ordered, congruent, slot-aligned) do not — see assertDayZeroUnshifted's
    // comment. Do not replace this with the property checks alone.
    it('emits the exact scheduler-axis windows (literal expectation)', () => {
      const windows = buildWindows()
      expect(windows).toEqual([
        { day_start_time: 480, day_end_time: 1200 },
        { day_start_time: 1980, day_end_time: 2760 },
        { day_start_time: 3300, day_end_time: 3960 },
      ])
    })

    it('is pairwise disjoint', () => {
      assertPairwiseDisjoint(buildWindows())
    })

    it('is strictly ordered', () => {
      assertStrictlyOrdered(buildWindows())
    })

    it('is congruent to the store day modulo 1440, preserving each day\'s own hours', () => {
      assertCongruentToStoreDay(buildWindows(), storeDayConfigs)
    })

    it('is slot-aligned', () => {
      assertSlotAligned(buildWindows())
    })

    it('anchors day 0 to a zero offset', () => {
      assertDayZeroUnshifted(buildWindows(), storeDayConfigs)
    })
  })

  describe('single-day case', () => {
    // Day index 0 carries no offset (0*1440 = 0), so this window equals the
    // store's clock-axis window exactly. There is no pair to be disjoint or
    // ordered against — what this pins is that day 0 gets no spurious shift
    // and that congruence/alignment hold even at the identity case.
    const storeDayConfigs: DayConfig[] = [
      { day_start_time: 540, day_end_time: 1260 }, // 09:00-21:00
    ]

    function buildWindows(): DayConfig[] {
      const state = storeWith(stateWithDayConfigs(storeDayConfigs))
      const { config } = buildTournamentConfig(state)
      return config.dayConfigs
    }

    // Load-bearing: this is the only assertion in the file that pins the
    // full array to absolute values. The property checks below it (congruent,
    // slot-aligned) do not — see assertDayZeroUnshifted's comment. Do not
    // replace this with the property checks alone.
    it('emits the store\'s own window unshifted (literal expectation)', () => {
      const windows = buildWindows()
      expect(windows).toEqual([
        { day_start_time: 540, day_end_time: 1260 },
      ])
    })

    it('is congruent to the store day modulo 1440', () => {
      assertCongruentToStoreDay(buildWindows(), storeDayConfigs)
    })

    it('is slot-aligned', () => {
      assertSlotAligned(buildWindows())
    })

    it('anchors day 0 to a zero offset', () => {
      assertDayZeroUnshifted(buildWindows(), storeDayConfigs)
    })
  })
})
