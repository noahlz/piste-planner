import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { DayRefConfig } from '../../src/store/store.ts'
import { TournamentType, PodCaptainOverride, BottleneckSeverity, BottleneckCause } from '../../src/engine/types.ts'
import type { ValidationError, Bottleneck, AnalysisResult, ScheduleResult } from '../../src/engine/types.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { DEFAULT_CUT_BY_CATEGORY, DEFAULT_VIDEO_POLICY_BY_CATEGORY } from '../../src/engine/constants.ts'

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
      expect(state.pod_captain_override).toBe('AUTO')
    })
  })

  describe('setTournamentType', () => {
    it('sets tournament_type and marks both stale flags', () => {
      useStore.getState().setTournamentType(TournamentType.RYC)

      const state = useStore.getState()
      expect(state.tournament_type).toBe('RYC')
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
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

    it('marks both stale flags', () => {
      useStore.getState().setDays(2)

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('updateDayConfig', () => {
    it('updates a specific day start time', () => {
      useStore.getState().setDays(3)
      useStore.getState().clearStale()

      useStore.getState().updateDayConfig(1, { day_start_time: 540 })

      const state = useStore.getState()
      expect(state.dayConfigs[1].day_start_time).toBe(540)
      expect(state.dayConfigs[1].day_end_time).toBe(1320)
    })

    it('updates a specific day end time', () => {
      useStore.getState().setDays(3)
      useStore.getState().clearStale()

      useStore.getState().updateDayConfig(2, { day_end_time: 1200 })

      const state = useStore.getState()
      expect(state.dayConfigs[2].day_end_time).toBe(1200)
      expect(state.dayConfigs[2].day_start_time).toBe(480)
    })

    it('marks both stale flags', () => {
      useStore.getState().setDays(2)
      useStore.getState().clearStale()

      useStore.getState().updateDayConfig(0, { day_start_time: 600 })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('setStrips', () => {
    it('sets strips_total and marks both stale flags', () => {
      useStore.getState().setStrips(24)

      const state = useStore.getState()
      expect(state.strips_total).toBe(24)
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('setVideoStrips', () => {
    it('sets video_strips_total and marks both stale flags', () => {
      useStore.getState().setVideoStrips(4)

      const state = useStore.getState()
      expect(state.video_strips_total).toBe(4)
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('setPodCaptainOverride', () => {
    it('sets pod_captain_override and marks both stale flags', () => {
      useStore.getState().setPodCaptainOverride(PodCaptainOverride.FORCE_4)

      const state = useStore.getState()
      expect(state.pod_captain_override).toBe('FORCE_4')
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })
})

describe('uiSlice', () => {
  describe('initial state', () => {
    it('has correct defaults', () => {
      const state = useStore.getState()
      expect(state.layoutMode).toBe('wizard')
      expect(state.wizardStep).toBe(0)
      expect(state.analysisStale).toBe(false)
      expect(state.scheduleStale).toBe(false)
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

  describe('markStale', () => {
    it('sets analysisStale when specified', () => {
      useStore.getState().markStale({ analysisStale: true })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(false)
    })

    it('sets scheduleStale when specified', () => {
      useStore.getState().markStale({ scheduleStale: true })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(false)
      expect(state.scheduleStale).toBe(true)
    })

    it('sets both stale flags when both specified', () => {
      useStore.getState().markStale({ analysisStale: true, scheduleStale: true })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('clearStale', () => {
    it('resets both stale flags', () => {
      useStore.getState().markStale({ analysisStale: true, scheduleStale: true })
      useStore.getState().clearStale()

      const state = useStore.getState()
      expect(state.analysisStale).toBe(false)
      expect(state.scheduleStale).toBe(false)
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
      expect(cadetConfig.de_mode).toBe('SINGLE_BLOCK')
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

    it('marks both stale flags', () => {
      useStore.getState().selectCompetitions([CADET_MF])

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('updateCompetition', () => {
    it('updates a single competition config field', () => {
      useStore.getState().selectCompetitions([CADET_MF])
      useStore.getState().clearStale()

      useStore.getState().updateCompetition(CADET_MF, { fencer_count: 64 })

      const state = useStore.getState()
      expect(state.selectedCompetitions[CADET_MF].fencer_count).toBe(64)
      // Other fields remain unchanged
      expect(state.selectedCompetitions[CADET_MF].ref_policy).toBe('AUTO')
    })

    it('marks both stale flags', () => {
      useStore.getState().selectCompetitions([CADET_MF])
      useStore.getState().clearStale()

      useStore.getState().updateCompetition(CADET_MF, { fencer_count: 32 })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })

  describe('removeCompetition', () => {
    it('removes a competition from the map', () => {
      useStore.getState().selectCompetitions([CADET_MF, JUNIOR_WE])
      useStore.getState().clearStale()

      useStore.getState().removeCompetition(CADET_MF)

      const state = useStore.getState()
      expect(state.selectedCompetitions[CADET_MF]).toBeUndefined()
      expect(state.selectedCompetitions[JUNIOR_WE]).toBeDefined()
    })

    it('marks both stale flags', () => {
      useStore.getState().selectCompetitions([CADET_MF])
      useStore.getState().clearStale()

      useStore.getState().removeCompetition(CADET_MF)

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
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

    it('marks both stale flags', () => {
      useStore.getState().applyTemplate('RYC Weekend')

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
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

    it('marks both stale flags', () => {
      useStore.getState().setGlobalOverrides({ THRESHOLD_MINS: 5 })

      const state = useStore.getState()
      expect(state.analysisStale).toBe(true)
      expect(state.scheduleStale).toBe(true)
    })
  })
})

// ──────────────────────────────────────────────
// refereeSlice
// ──────────────────────────────────────────────

describe('refereeSlice', () => {
  describe('initial state', () => {
    it('dayRefs is an empty array', () => {
      expect(useStore.getState().dayRefs).toEqual([])
    })

    it('optimalRefs is an empty array', () => {
      expect(useStore.getState().optimalRefs).toEqual([])
    })
  })

  describe('setDayRefs', () => {
    it('sets ref counts for a specific day', () => {
      useStore.getState().setDayRefs(0, { foil_epee_refs: 5, saber_refs: 3 })

      const state = useStore.getState()
      expect(state.dayRefs[0].foil_epee_refs).toBe(5)
      expect(state.dayRefs[0].saber_refs).toBe(3)
    })

    it('extends array with defaults when day index exceeds current length', () => {
      useStore.getState().setDayRefs(2, { foil_epee_refs: 10 })

      const state = useStore.getState()
      expect(state.dayRefs).toHaveLength(3)
      // Indices 0 and 1 filled with defaults
      expect(state.dayRefs[0]).toEqual({ foil_epee_refs: 0, saber_refs: 0 })
      expect(state.dayRefs[1]).toEqual({ foil_epee_refs: 0, saber_refs: 0 })
      // Index 2 has the partial update merged with defaults
      expect(state.dayRefs[2].foil_epee_refs).toBe(10)
      expect(state.dayRefs[2].saber_refs).toBe(0)
    })

    it('marks only scheduleStale, NOT analysisStale', () => {
      useStore.getState().setDayRefs(0, { foil_epee_refs: 4 })

      const state = useStore.getState()
      expect(state.scheduleStale).toBe(true)
      expect(state.analysisStale).toBe(false)
    })
  })

  describe('setOptimalRefs', () => {
    it('stores calculated optimal ref counts per day', () => {
      const optimal: DayRefConfig[] = [
        { foil_epee_refs: 8, saber_refs: 4 },
        { foil_epee_refs: 6, saber_refs: 3 },
      ]
      useStore.getState().setOptimalRefs(optimal)

      expect(useStore.getState().optimalRefs).toEqual(optimal)
    })
  })
})

// ──────────────────────────────────────────────
// analysisSlice
// ──────────────────────────────────────────────

describe('analysisSlice', () => {
  describe('initial state', () => {
    it('has empty defaults', () => {
      const state = useStore.getState()
      expect(state.validationErrors).toEqual([])
      expect(state.warnings).toEqual([])
      expect(state.suggestions).toEqual([])
      expect(state.flightingSuggestionStates).toEqual([])
    })
  })

  describe('setAnalysisResults', () => {
    it('stores results from validateConfig + initialAnalysis', () => {
      const errors: ValidationError[] = [
        { field: 'strips_total', message: 'Must be > 0', severity: BottleneckSeverity.ERROR },
      ]
      const result: AnalysisResult = {
        warnings: [
          {
            competition_id: 'CDT-M-FOIL-IND',
            phase: 'pool',
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 10,
            message: 'Strip contention expected',
          },
        ],
        suggestions: ['Consider adding more strips', 'Flight the cadet events'],
        flightingSuggestions: [
          { priority_competition_id: 'A', flighted_competition_id: 'B', strips_for_priority: 6, strips_for_flighted: 4 },
          { priority_competition_id: 'C', flighted_competition_id: 'D', strips_for_priority: 5, strips_for_flighted: 5 },
        ],
      }

      useStore.getState().setAnalysisResults(errors, result)

      const state = useStore.getState()
      expect(state.validationErrors).toEqual(errors)
      expect(state.warnings).toEqual(result.warnings)
      expect(state.suggestions).toEqual(result.suggestions)
      expect(state.flightingSuggestions).toEqual(result.flightingSuggestions)
      // One state per flighting suggestion, all start as pending
      expect(state.flightingSuggestionStates).toEqual(['pending', 'pending'])
    })
  })

  describe('acceptFlightingSuggestion', () => {
    it('marks a suggestion as accepted', () => {
      const result: AnalysisResult = {
        warnings: [],
        suggestions: ['Suggestion A', 'Suggestion B'],
        flightingSuggestions: [
          { priority_competition_id: 'A', flighted_competition_id: 'B', strips_for_priority: 6, strips_for_flighted: 4 },
          { priority_competition_id: 'C', flighted_competition_id: 'D', strips_for_priority: 5, strips_for_flighted: 5 },
        ],
      }
      useStore.getState().setAnalysisResults([], result)

      useStore.getState().acceptFlightingSuggestion(0)

      const state = useStore.getState()
      expect(state.flightingSuggestionStates[0]).toBe('accepted')
      expect(state.flightingSuggestionStates[1]).toBe('pending')
    })
  })

  describe('rejectFlightingSuggestion', () => {
    it('marks a suggestion as rejected', () => {
      const result: AnalysisResult = {
        warnings: [],
        suggestions: ['Suggestion A', 'Suggestion B'],
        flightingSuggestions: [
          { priority_competition_id: 'A', flighted_competition_id: 'B', strips_for_priority: 6, strips_for_flighted: 4 },
          { priority_competition_id: 'C', flighted_competition_id: 'D', strips_for_priority: 5, strips_for_flighted: 5 },
        ],
      }
      useStore.getState().setAnalysisResults([], result)

      useStore.getState().rejectFlightingSuggestion(1)

      const state = useStore.getState()
      expect(state.flightingSuggestionStates[0]).toBe('pending')
      expect(state.flightingSuggestionStates[1]).toBe('rejected')
    })
  })

  describe('clearAnalysis', () => {
    it('resets all analysis state', () => {
      const result: AnalysisResult = {
        warnings: [
          {
            competition_id: 'X',
            phase: 'pool',
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 5,
            message: 'warning',
          },
        ],
        suggestions: ['do something'],
        flightingSuggestions: [
          { priority_competition_id: 'A', flighted_competition_id: 'B', strips_for_priority: 6, strips_for_flighted: 4 },
        ],
      }
      useStore.getState().setAnalysisResults(
        [{ field: 'f', message: 'm', severity: BottleneckSeverity.ERROR }],
        result,
      )
      useStore.getState().acceptFlightingSuggestion(0)

      useStore.getState().clearAnalysis()

      const state = useStore.getState()
      expect(state.validationErrors).toEqual([])
      expect(state.warnings).toEqual([])
      expect(state.suggestions).toEqual([])
      expect(state.flightingSuggestionStates).toEqual([])
    })
  })
})

// ──────────────────────────────────────────────
// scheduleSlice
// ──────────────────────────────────────────────

describe('scheduleSlice', () => {
  // Minimal ScheduleResult factory for testing
  function makeScheduleResult(id: string): ScheduleResult {
    return {
      competition_id: id,
      assigned_day: 0,
      use_flighting: false,
      is_priority: false,
      flighting_group_id: null,
      pool_start: null,
      pool_end: null,
      pool_strips_count: 0,
      pool_refs_count: 0,
      flight_a_start: null,
      flight_a_end: null,
      flight_a_strips: 0,
      flight_a_refs: 0,
      flight_b_start: null,
      flight_b_end: null,
      flight_b_strips: 0,
      flight_b_refs: 0,
      entry_fencer_count: 0,
      promoted_fencer_count: 0,
      bracket_size: 0,
      cut_mode: 'DISABLED',
      cut_value: 0,
      de_mode: 'SINGLE_BLOCK',
      de_video_policy: 'BEST_EFFORT',
      de_start: null,
      de_end: null,
      de_strips_count: 0,
      de_prelims_start: null,
      de_prelims_end: null,
      de_prelims_strips: 0,
      de_round_of_16_start: null,
      de_round_of_16_end: null,
      de_round_of_16_strips: 0,
      de_finals_start: null,
      de_finals_end: null,
      de_finals_strips: 0,
      de_bronze_start: null,
      de_bronze_end: null,
      de_bronze_strip_id: null,
      de_total_end: null,
      conflict_score: 0,
      pool_duration_baseline: 0,
      pool_duration_actual: 0,
      de_duration_baseline: 0,
      de_duration_actual: 0,
      constraint_relaxation_level: 0,
      accepted_warnings: [],
    }
  }

  describe('initial state', () => {
    it('scheduleResults is empty and bottlenecks is empty', () => {
      const state = useStore.getState()
      expect(state.scheduleResults).toEqual({})
      expect(state.bottlenecks).toEqual([])
    })
  })

  describe('setScheduleResults', () => {
    it('stores results from scheduleAll', () => {
      const results: Record<string, ScheduleResult> = {
        'CDT-M-FOIL-IND': makeScheduleResult('CDT-M-FOIL-IND'),
        'JR-W-EPEE-IND': makeScheduleResult('JR-W-EPEE-IND'),
      }
      const bottlenecks: Bottleneck[] = [
        {
          competition_id: 'CDT-M-FOIL-IND',
          phase: 'pool',
          cause: BottleneckCause.STRIP_CONTENTION,
          severity: BottleneckSeverity.WARN,
          delay_mins: 5,
          message: 'Strip contention',
        },
      ]

      useStore.getState().setScheduleResults(results, bottlenecks)

      const state = useStore.getState()
      expect(state.scheduleResults).toEqual(results)
      expect(state.bottlenecks).toEqual(bottlenecks)
    })
  })

  describe('clearSchedule', () => {
    it('resets schedule state', () => {
      useStore.getState().setScheduleResults(
        { 'X': makeScheduleResult('X') },
        [{ competition_id: 'X', phase: 'de', cause: BottleneckCause.DEADLINE_BREACH, severity: BottleneckSeverity.ERROR, delay_mins: 30, message: 'late' }],
      )

      useStore.getState().clearSchedule()

      const state = useStore.getState()
      expect(state.scheduleResults).toEqual({})
      expect(state.bottlenecks).toEqual([])
    })
  })
})
