import { describe, it, expect } from 'vitest'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import type { Strip, Competition, FlightingGroup } from '../../src/engine/types.ts'
import {
  DAY_START_MINS, DAY_END_MINS, LATEST_START_MINS, LATEST_START_OFFSET,
  SLOT_MINS, DAY_LENGTH_MINS, DE_REFS,
  SAME_TIME_WINDOW_MINS, INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD, MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS, MIN_FENCERS,
  DEFAULT_POOL_ROUND_DURATION_TABLE, DEFAULT_DE_DURATION_TABLE,
  DE_BOUT_DURATION, YOUTH_VET_BOUT_DELTA, DEFAULT_DE_STRIP_FOOTPRINT,
} from '../../src/engine/constants.ts'
import {
  Category, Gender, Weapon, EventType,
  CutMode, DeMode, VideoPolicy, RefPolicy, DeStripRequirement,
  TournamentType,
} from '../../src/engine/types.ts'

/** Helper: reset store and apply partial state, returning the full state snapshot. */
function storeWith(partial: Partial<StoreState>): StoreState {
  const initial = useStore.getState()
  useStore.setState(partial)
  const state = useStore.getState()
  // Reset after snapshot so tests don't leak
  useStore.setState(initial)
  return state
}

/** Minimal store state that produces a valid config. */
function minimalState(): Partial<StoreState> {
  return {
    tournament_type: TournamentType.NAC,
    days_available: 2,
    dayConfigs: [
      { day_start_time: 480, day_end_time: 1320 },
      { day_start_time: 480, day_end_time: 1320 },
    ],
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
      // T072 (004 US5) widened the slice to seven keys. These four carry the
      // constants' own values because this fixture exercises the three above,
      // not them — and `SLOT_MINS` especially: buildConfig now reads it from
      // the slice rather than importing it, so seeding it from the constant is
      // what keeps every config this file builds identical to its pre-T072 self.
      SLOT_MINS,
      DE_BOUT_DURATION: { ...DE_BOUT_DURATION },
      YOUTH_VET_BOUT_DELTA,
      DEFAULT_DE_STRIP_FOOTPRINT,
    },
    flightingSuggestionStates: [],
  }
}

describe('buildTournamentConfig', () => {
  it('produces a valid TournamentConfig from store state', () => {
    const state = storeWith(minimalState())
    const { config, competitions } = buildTournamentConfig(state)

    expect(config.tournament_type).toBe(TournamentType.NAC)
    expect(config.days_available).toBe(2)
    expect(config.strips_total).toBe(10)
    expect(config.video_strips_total).toBe(2)
    expect(competitions).toHaveLength(1)
  })

  describe('strips generation', () => {
    it('generates strip array with first N strips video-capable', () => {
      const state = storeWith({ ...minimalState(), strips_total: 6, video_strips_total: 3 })
      const { config } = buildTournamentConfig(state)

      expect(config.strips).toHaveLength(6)
      expect(config.strips[0]).toEqual({ id: 'strip-1', video_capable: true })
      expect(config.strips[1]).toEqual({ id: 'strip-2', video_capable: true })
      expect(config.strips[2]).toEqual({ id: 'strip-3', video_capable: true })
      expect(config.strips[3]).toEqual({ id: 'strip-4', video_capable: false })
      expect(config.strips[4]).toEqual({ id: 'strip-5', video_capable: false })
      expect(config.strips[5]).toEqual({ id: 'strip-6', video_capable: false })
    })

    it('handles zero video strips', () => {
      const state = storeWith({ ...minimalState(), strips_total: 4, video_strips_total: 0 })
      const { config } = buildTournamentConfig(state)

      expect(config.strips).toHaveLength(4)
      expect(config.strips.every((s: Strip) => !s.video_capable)).toBe(true)
    })

    it('handles all strips video-capable', () => {
      const state = storeWith({ ...minimalState(), strips_total: 3, video_strips_total: 3 })
      const { config } = buildTournamentConfig(state)

      expect(config.strips.every((s: Strip) => s.video_capable)).toBe(true)
    })
  })

  describe('dayConfigs', () => {
    // Before T006 this seam had no coverage at all: buildTournamentConfig
    // passed state.dayConfigs straight through with no offset, and nothing
    // here asserted what the engine config's dayConfigs actually contained.
    // That absence is what let the day-axis defect (research.md D1) survive
    // three features — see research.md D4's closing note and
    // contracts/day-axis.md. `dayAxis.test.ts` carries the full C1 invariant
    // suite (disjoint, ordered, congruent, slot-aligned); this test pins the
    // specific shift buildTournamentConfig applies.
    it('shifts each day onto the scheduler axis by day_index * 1440, leaving the store\'s own dayConfigs untouched', () => {
      const dayConfigs = [
        { day_start_time: 480, day_end_time: 1200 },
        { day_start_time: 540, day_end_time: 1320 },
      ]
      const state = storeWith({ ...minimalState(), dayConfigs })
      const { config } = buildTournamentConfig(state)

      expect(config.dayConfigs).toEqual([
        { day_start_time: 480, day_end_time: 1200 },
        { day_start_time: 1980, day_end_time: 2760 },
      ])
      // The store's own state (read back independently of the config we just
      // built) is clock axis and unshifted — buildTournamentConfig must not
      // mutate what it was handed.
      expect(state.dayConfigs).toEqual(dayConfigs)
    })

    it('leaves day 0 unshifted (0 * 1440 = 0, the identity case)', () => {
      const dayConfigs = [{ day_start_time: 540, day_end_time: 1260 }]
      const state = storeWith({ ...minimalState(), dayConfigs, days_available: 1 })
      const { config } = buildTournamentConfig(state)

      expect(config.dayConfigs).toEqual([{ day_start_time: 540, day_end_time: 1260 }])
    })
  })

  describe('competitions', () => {
    it('merges catalogue entry with store overrides', () => {
      const state = storeWith(minimalState())
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions[0]

      // From catalogue entry (D1-M-FOIL-IND)
      expect(comp.id).toBe('D1-M-FOIL-IND')
      expect(comp.gender).toBe(Gender.MEN)
      expect(comp.category).toBe(Category.DIV1)
      expect(comp.weapon).toBe(Weapon.FOIL)
      expect(comp.event_type).toBe(EventType.INDIVIDUAL)
      expect(comp.vet_age_group).toBeNull()

      // From store overrides
      expect(comp.fencer_count).toBe(64)
      // Stored as AUTO (line 43), resolved on the way out: after T061 the
      // engine never receives `AUTO`, and this fixture's type is NAC, whose
      // default is TWO. The resolution contract itself — every type's default,
      // explicit values beating it, and nothing written back to the store —
      // belongs to buildConfig.typeDefaults.test.ts; this line only records
      // that the pass-through is gone.
      expect(comp.ref_policy).toBe(RefPolicy.TWO)
      expect(comp.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp.cut_value).toBe(20)
      expect(comp.de_mode).toBe(DeMode.SINGLE_STAGE)
      expect(comp.de_video_policy).toBe(VideoPolicy.REQUIRED)
      expect(comp.use_single_pool_override).toBe(false)
    })

    it('sets sensible defaults for remaining Competition fields', () => {
      const state = storeWith(minimalState())
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions[0]

      expect(comp.earliest_start).toBe(0)
      expect(comp.latest_end).toBe(Infinity)
      expect(comp.optional).toBe(false)
      expect(comp.de_round_of_16_strips).toBe(4)
      expect(comp.de_round_of_16_requirement).toBe(DeStripRequirement.HARD)
      expect(comp.flighted).toBe(false)
      expect(comp.flighting_group_id).toBeNull()
      expect(comp.is_priority).toBe(false)
      // T061a: the app pre-allocates `max(2, ceil(fencer_count / 7))`, matching
      // the ledger factory (`__tests__/helpers/scenarios.ts:69`). 64 fencers
      // gives 10. The old `0` here was the fourth app-path seam
      // `specs/006-day-axis-parity/parity-exceptions.md` names — it zeroed the
      // DE term of the feasibility estimate for every individual event.
      expect(comp.strips_allocated).toBe(10)
    })

    it('leaves latest_end unbinding at a day count beyond the UI\'s current maximum of 4 (research.md D6)', () => {
      // The old 9999 sentinel started truncating at day 7: 7 * 1440 + 1320 =
      // 11400 > 9999. Use an 8-day tournament (day indices 0-7) so day 7's
      // scheduler-axis end actually exceeds that old bound.
      const dayConfigs = Array.from({ length: 8 }, () => ({ day_start_time: 480, day_end_time: 1320 }))
      const state = storeWith({ ...minimalState(), days_available: 8, dayConfigs })
      const { config, competitions } = buildTournamentConfig(state)
      const comp = competitions[0]

      const day7End = config.dayConfigs![7].day_end_time
      expect(day7End).toBe(11400)
      // This is concurrentScheduler.ts's own clamp expression: it must return
      // dayEnd unchanged, never the latest_end sentinel.
      expect(Math.min(day7End, comp.latest_end)).toBe(day7End)
    })

    it('skips unknown catalogue IDs without throwing', () => {
      const state = storeWith({
        ...minimalState(),
        selectedCompetitions: {
          'BOGUS-ID': {
            fencer_count: 10,
            ref_policy: RefPolicy.AUTO,
            cut_mode: CutMode.DISABLED,
            cut_value: 100,
            de_mode: DeMode.SINGLE_STAGE,
            de_video_policy: VideoPolicy.BEST_EFFORT,
            use_single_pool_override: false,
          },
        },
      })
      const { competitions } = buildTournamentConfig(state)
      expect(competitions).toHaveLength(0)
    })

    it('builds multiple competitions from selectedCompetitions map', () => {
      const state = storeWith({
        ...minimalState(),
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
          'CDT-W-EPEE-IND': {
            fencer_count: 32,
            ref_policy: RefPolicy.ONE,
            cut_mode: CutMode.DISABLED,
            cut_value: 100,
            de_mode: DeMode.SINGLE_STAGE,
            de_video_policy: VideoPolicy.BEST_EFFORT,
            use_single_pool_override: false,
          },
        } as const,
      })
      const { competitions } = buildTournamentConfig(state)
      expect(competitions).toHaveLength(2)

      const ids = competitions.map((c: Competition) => c.id).sort()
      expect(ids).toEqual(['CDT-W-EPEE-IND', 'D1-M-FOIL-IND'])
    })
  })

  describe('global overrides', () => {
    it('applies global overrides from competitionSlice', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)

      expect(config.ADMIN_GAP_MINS).toBe(20)
      expect(config.FLIGHT_BUFFER_MINS).toBe(10)
      expect(config.THRESHOLD_MINS).toBe(5)
    })
  })

  describe('engine constants', () => {
    it('includes all engine constants with correct values', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)

      expect(config.DAY_START_MINS).toBe(DAY_START_MINS)
      expect(config.DAY_END_MINS).toBe(DAY_END_MINS)
      expect(config.LATEST_START_MINS).toBe(LATEST_START_MINS)
      expect(config.LATEST_START_OFFSET).toBe(LATEST_START_OFFSET)
      expect(config.SLOT_MINS).toBe(SLOT_MINS)
      expect(config.DAY_LENGTH_MINS).toBe(DAY_LENGTH_MINS)
      expect(config.DE_REFS).toBe(DE_REFS)
      expect(config.SAME_TIME_WINDOW_MINS).toBe(SAME_TIME_WINDOW_MINS)
      expect(config.INDIV_TEAM_MIN_GAP_MINS).toBe(INDIV_TEAM_MIN_GAP_MINS)
      expect(config.EARLY_START_THRESHOLD).toBe(EARLY_START_THRESHOLD)
      expect(config.MAX_RESCHEDULE_ATTEMPTS).toBe(MAX_RESCHEDULE_ATTEMPTS)
      expect(config.MAX_FENCERS).toBe(MAX_FENCERS)
      expect(config.MIN_FENCERS).toBe(MIN_FENCERS)
      expect(config.pool_round_duration_table).toEqual(DEFAULT_POOL_ROUND_DURATION_TABLE)
      expect(config.de_duration_table).toEqual(DEFAULT_DE_DURATION_TABLE)
    })
  })

  describe('pool round durations', () => {
    it('passes the store pool_round_duration_table through to the engine config', () => {
      // All three values off-default so a partial merge with the constant cannot pass
      const table = { [Weapon.EPEE]: 111, [Weapon.FOIL]: 91, [Weapon.SABRE]: 61 }
      const state = storeWith({ ...minimalState(), pool_round_duration_table: table })
      const { config } = buildTournamentConfig(state)

      expect(config.pool_round_duration_table).toEqual(table)
    })

    it('uses the seeded default table when the store is untouched', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)

      expect(config.pool_round_duration_table).toEqual(DEFAULT_POOL_ROUND_DURATION_TABLE)
    })
  })

  describe('regional cut overrides', () => {
    function regionalCutState(
      tournamentType: TournamentType,
      compId: string,
      cutMode: string,
      cutValue: number,
    ): Partial<StoreState> {
      return {
        ...minimalState(),
        tournament_type: tournamentType,
        selectedCompetitions: {
          [compId]: {
            fencer_count: 40,
            ref_policy: RefPolicy.AUTO,
            cut_mode: cutMode as CutMode,
            cut_value: cutValue,
            de_mode: DeMode.SINGLE_STAGE,
            de_video_policy: VideoPolicy.BEST_EFFORT,
            use_single_pool_override: false,
          },
        },
      }
    }

    it('overrides cut to DISABLED/100 for JUNIOR at ROC tournament', () => {
      const state = storeWith(regionalCutState(TournamentType.ROC, 'JR-M-FOIL-IND', 'PERCENTAGE', 20))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'JR-M-FOIL-IND')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.DISABLED)
      expect(comp!.cut_value).toBe(100)
    })

    it('does NOT override cut for JUNIOR at NAC tournament', () => {
      const state = storeWith(regionalCutState(TournamentType.NAC, 'JR-M-FOIL-IND', 'PERCENTAGE', 20))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'JR-M-FOIL-IND')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp!.cut_value).toBe(20)
    })

    it('does NOT override cut for VETERAN at ROC tournament (category not in REGIONAL_CUT_OVERRIDES)', () => {
      const state = storeWith(regionalCutState(TournamentType.ROC, 'VET-M-FOIL-IND-V40', 'PERCENTAGE', 20))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'VET-M-FOIL-IND-V40')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp!.cut_value).toBe(20)
    })
  })

  describe('flighting suggestions', () => {
    function twoCompState() {
      return {
        ...minimalState(),
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
          'CDT-W-EPEE-IND': {
            fencer_count: 32,
            ref_policy: RefPolicy.ONE,
            cut_mode: CutMode.DISABLED,
            cut_value: 100,
            de_mode: DeMode.SINGLE_STAGE,
            de_video_policy: VideoPolicy.BEST_EFFORT,
            use_single_pool_override: false,
          },
        } as const,
      }
    }

    it('leaves competitions unflighted when no suggestions are passed in', () => {
      const state = storeWith({ ...twoCompState(), flightingSuggestionStates: [] })
      const { competitions } = buildTournamentConfig(state, [])

      for (const comp of competitions) {
        expect(comp.flighted).toBe(false)
        expect(comp.flighting_group_id).toBeNull()
        expect(comp.is_priority).toBe(false)
      }

      // T061a: the app pre-allocates `max(2, ceil(fencer_count / 7))`, matching
      // the ledger factory (`__tests__/helpers/scenarios.ts:69`), where it used
      // to send `0` — the fourth app-path seam
      // `specs/006-day-axis-parity/parity-exceptions.md` names.
      //
      // Asserted per competition and outside the loop, because the value now
      // differs between the two fixtures (64 fencers -> 10, 32 -> 5) where the
      // old `0` was uniform. The literals are deliberate: re-deriving
      // `Math.max(2, Math.ceil(comp.fencer_count / 7))` inside the assertion
      // would pass against any implementation of that shape, including a wrong
      // one, which restates the code instead of pinning its output.
      const sixtyFour = competitions.find((c: Competition) => c.id === 'D1-M-FOIL-IND')
      const thirtyTwo = competitions.find((c: Competition) => c.id === 'CDT-W-EPEE-IND')
      expect(sixtyFour!.strips_allocated).toBe(10)
      expect(thirtyTwo!.strips_allocated).toBe(5)
    })

    it('leaves competitions unflighted when suggestion state is pending', () => {
      const suggestion: FlightingGroup = {
        priority_competition_id: 'D1-M-FOIL-IND',
        flighted_competition_id: 'CDT-W-EPEE-IND',
        strips_for_priority: 6,
        strips_for_flighted: 4,
      }
      const state = storeWith({
        ...twoCompState(),
        flightingSuggestionStates: ['pending'],
      })
      const { competitions } = buildTournamentConfig(state, [suggestion])

      for (const comp of competitions) {
        expect(comp.flighted).toBe(false)
      }
    })

    it('leaves competitions unflighted when suggestion state is rejected', () => {
      const suggestion: FlightingGroup = {
        priority_competition_id: 'D1-M-FOIL-IND',
        flighted_competition_id: 'CDT-W-EPEE-IND',
        strips_for_priority: 6,
        strips_for_flighted: 4,
      }
      const state = storeWith({
        ...twoCompState(),
        flightingSuggestionStates: ['rejected'],
      })
      const { competitions } = buildTournamentConfig(state, [suggestion])

      for (const comp of competitions) {
        expect(comp.flighted).toBe(false)
      }
    })

    it('applies accepted flighting suggestion to both competitions', () => {
      const suggestion: FlightingGroup = {
        priority_competition_id: 'D1-M-FOIL-IND',
        flighted_competition_id: 'CDT-W-EPEE-IND',
        strips_for_priority: 6,
        strips_for_flighted: 4,
      }
      const state = storeWith({
        ...twoCompState(),
        flightingSuggestionStates: ['accepted'],
      })
      const { competitions } = buildTournamentConfig(state, [suggestion])

      const expectedGroupId = 'D1-M-FOIL-IND+CDT-W-EPEE-IND'
      const priority = competitions.find((c: Competition) => c.id === 'D1-M-FOIL-IND')
      const flighted = competitions.find((c: Competition) => c.id === 'CDT-W-EPEE-IND')

      // The two strips_allocated assertions below pin the override, and since
      // T061a they do real work: the accepted suggestion's 6 and 4 must beat
      // the pre-allocated defaults these same fixtures would otherwise carry
      // (10 for 64 fencers, 5 for 32). Both differ from their default, so
      // either would fail if the flighting loop stopped winning — under the
      // old uniform `0` default only the fact of a non-zero value was pinned.
      expect(priority).toBeDefined()
      expect(priority!.flighted).toBe(true)
      expect(priority!.is_priority).toBe(true)
      expect(priority!.flighting_group_id).toBe(expectedGroupId)
      expect(priority!.strips_allocated).toBe(6)

      expect(flighted).toBeDefined()
      expect(flighted!.flighted).toBe(true)
      expect(flighted!.is_priority).toBe(false)
      expect(flighted!.flighting_group_id).toBe(expectedGroupId)
      expect(flighted!.strips_allocated).toBe(4)
    })

    it('only applies accepted suggestions, leaving rejected ones unchanged', () => {
      const accepted: FlightingGroup = {
        priority_competition_id: 'D1-M-FOIL-IND',
        flighted_competition_id: 'CDT-W-EPEE-IND',
        strips_for_priority: 6,
        strips_for_flighted: 4,
      }
      const state = storeWith({
        ...twoCompState(),
        flightingSuggestionStates: ['accepted'],
      })
      const { competitions } = buildTournamentConfig(state, [accepted])

      const priority = competitions.find((c: Competition) => c.id === 'D1-M-FOIL-IND')
      expect(priority!.flighted).toBe(true)

      // A second scenario: same suggestions but both rejected
      const stateRejected = storeWith({
        ...twoCompState(),
        flightingSuggestionStates: ['rejected'],
      })
      const { competitions: compsRejected } = buildTournamentConfig(stateRejected, [accepted])
      const priorityRejected = compsRejected.find((c: Competition) => c.id === 'D1-M-FOIL-IND')
      expect(priorityRejected!.flighted).toBe(false)
    })
  })
})
