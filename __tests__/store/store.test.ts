import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { TournamentType, Weapon } from '../../src/engine/types.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
} from '../../src/engine/constants.ts'

// Reset store to initial state before each test
beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('tournamentSlice', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useStore.getState()
      expect(state.tournament_type).toBe('NAC')
      expect(state.days_available).toBe(3)
      expect(state.dayConfigs).toEqual([])
      expect(state.strips_total).toBe(0)
      expect(state.video_strips_total).toBe(0)
    })

    it('seeds pool_round_duration_table from the engine defaults', () => {
      const state = useStore.getState()
      expect(state.pool_round_duration_table).toEqual(DEFAULT_POOL_ROUND_DURATION_TABLE)
      // A copy, never an alias – store mutations must not corrupt the engine constant
      expect(state.pool_round_duration_table).not.toBe(DEFAULT_POOL_ROUND_DURATION_TABLE)
    })
  })

  describe('setTournamentType', () => {
    it('sets tournament_type', () => {
      useStore.getState().setTournamentType(TournamentType.RYC)

      expect(useStore.getState().tournament_type).toBe('RYC')
    })
  })

  describe('setDays', () => {
    it('sets days_available and initializes dayConfigs with default times', () => {
      useStore.getState().setDays(4)

      const state = useStore.getState()
      expect(state.days_available).toBe(4)
      expect(state.dayConfigs).toHaveLength(4)
      for (const dc of state.dayConfigs) {
        expect(dc.day_start_time).toBe(480)
        expect(dc.day_end_time).toBe(1320)
      }
    })
  })

  describe('updateDayConfig', () => {
    it('updates a specific day start time', () => {
      useStore.getState().setDays(3)

      useStore.getState().updateDayConfig(1, { day_start_time: 540 })

      const state = useStore.getState()
      expect(state.dayConfigs[1].day_start_time).toBe(540)
      expect(state.dayConfigs[1].day_end_time).toBe(1320)
    })

    it('updates a specific day end time', () => {
      useStore.getState().setDays(3)

      useStore.getState().updateDayConfig(2, { day_end_time: 1200 })

      const state = useStore.getState()
      expect(state.dayConfigs[2].day_end_time).toBe(1200)
      expect(state.dayConfigs[2].day_start_time).toBe(480)
    })
  })

  describe('setStrips', () => {
    it('sets strips_total', () => {
      useStore.getState().setStrips(24)

      expect(useStore.getState().strips_total).toBe(24)
    })
  })

  describe('setVideoStrips', () => {
    it('sets video_strips_total', () => {
      useStore.getState().setVideoStrips(4)

      expect(useStore.getState().video_strips_total).toBe(4)
    })
  })

  describe('setPoolRoundDuration', () => {
    it('updates only the given weapon', () => {
      useStore.getState().setPoolRoundDuration(Weapon.EPEE, 110)

      const state = useStore.getState()
      expect(state.pool_round_duration_table[Weapon.EPEE]).toBe(110)
      expect(state.pool_round_duration_table[Weapon.FOIL]).toBe(DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.FOIL])
      expect(state.pool_round_duration_table[Weapon.SABRE]).toBe(DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.SABRE])
    })

    it('accepts a value equal to the weapon default', () => {
      useStore.getState().setPoolRoundDuration(Weapon.SABRE, 90)

      useStore.getState().setPoolRoundDuration(Weapon.SABRE, DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.SABRE])

      expect(useStore.getState().pool_round_duration_table[Weapon.SABRE]).toBe(
        DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.SABRE],
      )
    })
  })

  describe('resetPoolRoundDuration', () => {
    it('restores only the given weapon default after an override', () => {
      useStore.getState().setPoolRoundDuration(Weapon.EPEE, 110)
      useStore.getState().setPoolRoundDuration(Weapon.FOIL, 90)

      useStore.getState().resetPoolRoundDuration(Weapon.EPEE)

      const state = useStore.getState()
      expect(state.pool_round_duration_table[Weapon.EPEE]).toBe(DEFAULT_POOL_ROUND_DURATION_TABLE[Weapon.EPEE])
      expect(state.pool_round_duration_table[Weapon.FOIL]).toBe(90)
    })
  })
})

describe('uiSlice', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useStore.getState()
      expect(state.layoutMode).toBe('wizard')
      expect(state.wizardStep).toBe(0)
    })
  })

  describe('setLayoutMode', () => {
    it('sets layout mode to wizard', () => {
      useStore.getState().setLayoutMode('wizard')
      expect(useStore.getState().layoutMode).toBe('wizard')
    })

    it('sets layout mode to kitchen-sink', () => {
      useStore.getState().setLayoutMode('wizard')
      useStore.getState().setLayoutMode('kitchen-sink')
      expect(useStore.getState().layoutMode).toBe('kitchen-sink')
    })
  })

  describe('setStep', () => {
    it('sets wizardStep', () => {
      useStore.getState().setStep(3)
      expect(useStore.getState().wizardStep).toBe(3)
    })
  })

})

describe('competitionSlice', () => {
  // Known catalogue IDs for testing — Cadet Men's Foil and Junior Women's Epee
  const CADET_MF = 'CDT-M-FOIL-IND'
  const JUNIOR_WE = 'JR-W-EPEE-IND'

  describe('initial state', () => {
    it('selectedCompetitions is an empty object', () => {
      const state = useStore.getState()
      expect(state.selectedCompetitions).toEqual({})
    })

    it('globalOverrides has default values', () => {
      const state = useStore.getState()
      expect(state.globalOverrides).toEqual({
        ADMIN_GAP_MINS: 30,
        FLIGHT_BUFFER_MINS: 15,
        THRESHOLD_MINS: 10,
      })
    })
  })

  describe('selectCompetitions', () => {
    it('adds competitions with default per-competition config derived from catalogue', () => {
      useStore.getState().selectCompetitions([CADET_MF, JUNIOR_WE])

      const state = useStore.getState()
      const cadetEntry = findCompetition(CADET_MF)!
      const juniorEntry = findCompetition(JUNIOR_WE)!

      // Cadet defaults
      const cadetConfig = state.selectedCompetitions[CADET_MF]
      expect(cadetConfig).toBeDefined()
      expect(cadetConfig.fencer_count).toBe(0)
      expect(cadetConfig.ref_policy).toBe('AUTO')
      expect(cadetConfig.cut_mode).toBe(DEFAULT_CUT_BY_CATEGORY[cadetEntry.category].mode)
      expect(cadetConfig.cut_value).toBe(DEFAULT_CUT_BY_CATEGORY[cadetEntry.category].value)
      expect(cadetConfig.de_mode).toBe('SINGLE_STAGE')
      expect(cadetConfig.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[cadetEntry.category])
      expect(cadetConfig.use_single_pool_override).toBe(false)

      // Junior defaults
      const juniorConfig = state.selectedCompetitions[JUNIOR_WE]
      expect(juniorConfig).toBeDefined()
      expect(juniorConfig.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[juniorEntry.category])
    })

    it('skips unknown catalogue IDs without error', () => {
      useStore.getState().selectCompetitions(['NONEXISTENT-ID', CADET_MF])

      const state = useStore.getState()
      expect(Object.keys(state.selectedCompetitions)).toEqual([CADET_MF])
    })
  })

  describe('updateCompetition', () => {
    it('updates a single competition config field', () => {
      useStore.getState().selectCompetitions([CADET_MF])

      useStore.getState().updateCompetition(CADET_MF, { fencer_count: 64 })

      const state = useStore.getState()
      expect(state.selectedCompetitions[CADET_MF].fencer_count).toBe(64)
      // Other fields remain unchanged
      expect(state.selectedCompetitions[CADET_MF].ref_policy).toBe('AUTO')
    })
  })

  describe('removeCompetition', () => {
    it('removes a competition from the map', () => {
      useStore.getState().selectCompetitions([CADET_MF, JUNIOR_WE])

      useStore.getState().removeCompetition(CADET_MF)

      const state = useStore.getState()
      expect(state.selectedCompetitions[CADET_MF]).toBeUndefined()
      expect(state.selectedCompetitions[JUNIOR_WE]).toBeDefined()
    })
  })

  describe('applyTemplate', () => {
    it('selects competitions from a named template', () => {
      useStore.getState().applyTemplate('RYC Weekend')

      const state = useStore.getState()
      const templateIds = TEMPLATES['RYC Weekend']
      expect(Object.keys(state.selectedCompetitions).sort()).toEqual([...templateIds].sort())
    })

    it('replaces previous selections', () => {
      useStore.getState().selectCompetitions([CADET_MF])
      useStore.getState().applyTemplate('RYC Weekend')

      const state = useStore.getState()
      const templateIds = TEMPLATES['RYC Weekend']
      expect(Object.keys(state.selectedCompetitions).sort()).toEqual([...templateIds].sort())
    })
  })

  describe('setGlobalOverrides', () => {
    it('updates global override values', () => {
      useStore.getState().setGlobalOverrides({ ADMIN_GAP_MINS: 20 })

      const state = useStore.getState()
      expect(state.globalOverrides.ADMIN_GAP_MINS).toBe(20)
      // Unchanged fields preserved
      expect(state.globalOverrides.FLIGHT_BUFFER_MINS).toBe(15)
      expect(state.globalOverrides.THRESHOLD_MINS).toBe(10)
    })
  })
})

// ──────────────────────────────────────────────
// analysisSlice — accept/reject intent only, the suggestions themselves derive
// ──────────────────────────────────────────────

describe('analysisSlice', () => {
  describe('initial state', () => {
    it('has no recorded accept/reject intent', () => {
      expect(useStore.getState().flightingSuggestionStates).toEqual([])
    })
  })

  describe('acceptFlightingSuggestion', () => {
    it('marks the suggestion at that index accepted, leaving its neighbour alone', () => {
      useStore.setState({ flightingSuggestionStates: ['pending', 'pending'] })

      useStore.getState().acceptFlightingSuggestion(0)

      const state = useStore.getState()
      expect(state.flightingSuggestionStates[0]).toBe('accepted')
      expect(state.flightingSuggestionStates[1]).toBe('pending')
    })
  })

  describe('rejectFlightingSuggestion', () => {
    it('marks the suggestion at that index rejected, leaving its neighbour alone', () => {
      useStore.setState({ flightingSuggestionStates: ['pending', 'pending'] })

      useStore.getState().rejectFlightingSuggestion(1)

      const state = useStore.getState()
      expect(state.flightingSuggestionStates[0]).toBe('pending')
      expect(state.flightingSuggestionStates[1]).toBe('rejected')
    })
  })
})
