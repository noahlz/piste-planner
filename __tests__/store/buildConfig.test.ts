import { describe, it, expect } from 'vitest'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import type { Strip, Competition } from '../../src/engine/types.ts'
import {
  DAY_START_MINS, DAY_END_MINS, LATEST_START_MINS, LATEST_START_OFFSET,
  SLOT_MINS, DAY_LENGTH_MINS, DE_REFS, DE_FINALS_MIN_MINS,
  SAME_TIME_WINDOW_MINS, INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD, MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS, MIN_FENCERS,
  DEFAULT_POOL_ROUND_DURATION_TABLE, DEFAULT_DE_DURATION_TABLE,
} from '../../src/engine/constants.ts'
import {
  Category, Gender, Weapon, EventType,
  CutMode, DeMode, VideoPolicy, RefPolicy, DeStripRequirement,
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
    tournament_type: 'NAC',
    days_available: 2,
    dayConfigs: [
      { day_start_time: 480, day_end_time: 1320 },
      { day_start_time: 480, day_end_time: 1320 },
    ],
    strips_total: 10,
    video_strips_total: 2,
    pod_captain_override: 'AUTO',
    selectedCompetitions: {
      'D1-M-FOIL-IND': {
        fencer_count: 64,
        ref_policy: 'AUTO',
        cut_mode: 'PERCENTAGE',
        cut_value: 20,
        de_mode: 'SINGLE_BLOCK',
        de_video_policy: 'REQUIRED',
        use_single_pool_override: false,
      },
    },
    globalOverrides: {
      ADMIN_GAP_MINS: 20,
      FLIGHT_BUFFER_MINS: 10,
      THRESHOLD_MINS: 5,
    },
    dayRefs: [
      { foil_epee_refs: 12, sabre_refs: 6, allow_sabre_ref_fillin: false },
      { foil_epee_refs: 10, sabre_refs: 5, allow_sabre_ref_fillin: true },
    ],
    flightingSuggestionStates: [],
  }
}

describe('buildTournamentConfig', () => {
  it('produces a valid TournamentConfig from store state', () => {
    const state = storeWith(minimalState())
    const { config, competitions } = buildTournamentConfig(state)

    expect(config.tournament_type).toBe('NAC')
    expect(config.days_available).toBe(2)
    expect(config.strips_total).toBe(10)
    expect(config.video_strips_total).toBe(2)
    expect(config.pod_captain_override).toBe('AUTO')
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
    it('passes dayConfigs through from store', () => {
      const dayConfigs = [
        { day_start_time: 480, day_end_time: 1200 },
        { day_start_time: 540, day_end_time: 1320 },
      ]
      const state = storeWith({ ...minimalState(), dayConfigs })
      const { config } = buildTournamentConfig(state)

      expect(config.dayConfigs).toEqual(dayConfigs)
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
      expect(comp.ref_policy).toBe(RefPolicy.AUTO)
      expect(comp.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp.cut_value).toBe(20)
      expect(comp.de_mode).toBe(DeMode.SINGLE_BLOCK)
      expect(comp.de_video_policy).toBe(VideoPolicy.REQUIRED)
      expect(comp.use_single_pool_override).toBe(false)
    })

    it('sets sensible defaults for remaining Competition fields', () => {
      const state = storeWith(minimalState())
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions[0]

      expect(comp.earliest_start).toBe(0)
      expect(comp.latest_end).toBe(9999)
      expect(comp.optional).toBe(false)
      expect(comp.de_finals_strip_id).toBeNull()
      expect(comp.de_finals_strip_requirement).toBe(DeStripRequirement.HARD)
      expect(comp.de_round_of_16_strips).toBe(4)
      expect(comp.de_round_of_16_requirement).toBe(DeStripRequirement.HARD)
      expect(comp.de_finals_strips).toBe(2)
      expect(comp.de_finals_requirement).toBe(DeStripRequirement.HARD)
      expect(comp.flighted).toBe(false)
      expect(comp.flighting_group_id).toBeNull()
      expect(comp.is_priority).toBe(false)
      expect(comp.strips_allocated).toBe(0)
    })

    it('skips unknown catalogue IDs without throwing', () => {
      const state = storeWith({
        ...minimalState(),
        selectedCompetitions: {
          'BOGUS-ID': {
            fencer_count: 10,
            ref_policy: 'AUTO',
            cut_mode: 'DISABLED',
            cut_value: 100,
            de_mode: 'SINGLE_BLOCK',
            de_video_policy: 'BEST_EFFORT',
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
            ref_policy: 'AUTO',
            cut_mode: 'PERCENTAGE',
            cut_value: 20,
            de_mode: 'SINGLE_BLOCK',
            de_video_policy: 'REQUIRED',
            use_single_pool_override: false,
          },
          'CDT-W-EPEE-IND': {
            fencer_count: 32,
            ref_policy: 'ONE',
            cut_mode: 'DISABLED',
            cut_value: 100,
            de_mode: 'SINGLE_BLOCK',
            de_video_policy: 'BEST_EFFORT',
            use_single_pool_override: false,
          },
        },
      })
      const { competitions } = buildTournamentConfig(state)
      expect(competitions).toHaveLength(2)

      const ids = competitions.map((c: Competition) => c.id).sort()
      expect(ids).toEqual(['CDT-W-EPEE-IND', 'D1-M-FOIL-IND'])
    })
  })

  describe('referee availability', () => {
    it('maps dayRefs to DayRefereeAvailability with source ACTUAL', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)

      expect(config.referee_availability).toHaveLength(2)
      expect(config.referee_availability[0]).toEqual({
        day: 0,
        foil_epee_refs: 12,
        sabre_refs: 6,
        source: 'ACTUAL',
      })
      expect(config.referee_availability[1]).toEqual({
        day: 1,
        foil_epee_refs: 10,
        sabre_refs: 5,
        source: 'ACTUAL',
      })
    })

    it('produces empty referee_availability when dayRefs is empty', () => {
      const state = storeWith({ ...minimalState(), dayRefs: [] })
      const { config } = buildTournamentConfig(state)

      expect(config.referee_availability).toEqual([])
    })
  })

  describe('allow_sabre_ref_fillin', () => {
    it('is true when any day has allow_sabre_ref_fillin', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)
      // Day 1 has allow_sabre_ref_fillin: true
      expect(config.allow_sabre_ref_fillin).toBe(true)
    })

    it('is false when no day has allow_sabre_ref_fillin', () => {
      const state = storeWith({
        ...minimalState(),
        dayRefs: [
          { foil_epee_refs: 12, sabre_refs: 6, allow_sabre_ref_fillin: false },
          { foil_epee_refs: 10, sabre_refs: 5, allow_sabre_ref_fillin: false },
        ],
      })
      const { config } = buildTournamentConfig(state)
      expect(config.allow_sabre_ref_fillin).toBe(false)
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
      expect(config.DE_FINALS_MIN_MINS).toBe(DE_FINALS_MIN_MINS)
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
})
