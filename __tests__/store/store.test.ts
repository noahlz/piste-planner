import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { suggestStripCount } from '../../src/engine/analysis.ts'
import { searchStripCount } from '../../src/engine/stripSearch.ts'
import { Category, TournamentType, Weapon } from '../../src/engine/types.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
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
      // null, not 0 — "follow the tournament type's default" (research D7).
      // 0 stays available as the real value it is: a tournament with no video strips.
      expect(state.video_strips_total).toBeNull()
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

  // The **Suggest** button's action (`StripSetup.tsx:25`). 012 T007 replaced
  // the ceiling-only rule with the search from `stripSearch.ts`: the button
  // now drives `scanStripCounts` to the smallest strip count that places every
  // event, asynchronously so the browser can paint between candidates
  // (research.md D5). What is pinned here is the wiring, the async contract,
  // the single terminal write (FR-010), and the `null` cases — the search's
  // own arithmetic belongs to `__tests__/engine/stripSearch.test.ts`.
  describe('suggestStrips', () => {
    it("returns a promise that resolves with the search's own answer", async () => {
      useStore.getState().setDays(2)
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND'])
      useStore.getState().updateCompetition('D1-M-FOIL-IND', { fencer_count: 70 })

      const pending = useStore.getState().suggestStrips()
      expect(pending).toBeInstanceOf(Promise)
      await pending

      // `buildTournamentConfig` is read after the promise resolves so its
      // `strips_total` reflects the write the action just made — the search's
      // answer does not depend on that field either way.
      const { config, competitions } = buildTournamentConfig(useStore.getState())
      expect(useStore.getState().strips_total).toBe(searchStripCount(competitions, config))
      // `[M]` measured directly against the fixture: 70 fencers → 10 pools is
      // the smallest count that places every event. 13 was the old rule's
      // ceiling — `suggestStripCount` sizes for the busiest day running at
      // once, not for placing everything, and asserted as the upper bound below.
      expect(useStore.getState().strips_total).toBe(10)
    })

    it('never suggests above the old ceiling rule (FR-007)', async () => {
      useStore.getState().setDays(2)
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND'])
      useStore.getState().updateCompetition('D1-M-FOIL-IND', { fencer_count: 70 })

      await useStore.getState().suggestStrips()

      const { config, competitions } = buildTournamentConfig(useStore.getState())
      const ceiling = suggestStripCount(competitions, config.days_available, config.max_pool_strip_pct)
      // This fixture always has a sizeable competition selected, so the
      // ceiling is a real number here — narrowed for `toBeLessThanOrEqual`,
      // which does not accept `number | null`.
      expect(ceiling).not.toBeNull()
      expect(useStore.getState().strips_total).toBeLessThanOrEqual(ceiling as number)
    })

    it('leaves strips_total alone when no competition is selected — never writes 0', async () => {
      useStore.getState().setStrips(24)

      await useStore.getState().suggestStrips()

      // FR-010: the absence of an answer is not the number zero. A 0 here
      // would read as a deliberate configuration and fail validation.
      expect(useStore.getState().strips_total).toBe(24)
    })

    it('leaves strips_total alone when every selected event has no fencers entered', async () => {
      useStore.getState().setStrips(24)
      // `selectCompetitions` seeds `fencer_count: 0` — the state the button is
      // in the moment an organizer picks events and has not typed counts yet.
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND', 'D1-W-FOIL-IND'])

      await useStore.getState().suggestStrips()

      expect(useStore.getState().strips_total).toBe(24)
    })

    it('writes strips_total exactly once, at the end (FR-010)', async () => {
      useStore.getState().setDays(2)
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND'])
      useStore.getState().updateCompetition('D1-M-FOIL-IND', { fencer_count: 70 })
      useStore.getState().setStrips(24)

      const seen: number[] = []
      const unsubscribe = useStore.subscribe((state, prev) => {
        if (state.strips_total !== prev.strips_total) seen.push(state.strips_total)
      })

      const pending = useStore.getState().suggestStrips()
      // Checked synchronously, before any await: nothing has written yet, no
      // matter how many candidates the search evaluates.
      expect(seen).toEqual([])
      expect(useStore.getState().strips_total).toBe(24)

      await pending

      expect(seen).toEqual([useStore.getState().strips_total])
      unsubscribe()
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

describe('competitionSlice', () => {
  // Known catalogue IDs for testing — Cadet Men's Foil and Junior Women's Epee
  const CADET_MF = 'CDT-M-FOIL-IND'
  const JUNIOR_WE = 'JR-W-EPEE-IND'
  // Cadet Men's Foil TEAM — deliberately not a Veteran team entry. Veteran's
  // category default is already DISABLED/100, so it would pass this
  // assertion whether or not the store special-cased team events at all.
  // Cadet's category default is PERCENTAGE/20, so this only passes if
  // defaultConfigForId actually applies the team override (008).
  const CADET_MF_TEAM = 'CDT-M-FOIL-TEAM'

  describe('initial state', () => {
    it('selectedCompetitions is an empty object', () => {
      const state = useStore.getState()
      expect(state.selectedCompetitions).toEqual({})
    })

    // Re-baselined by T072 (004 US5): the slice widened from three keys to the
    // seven the gears panel exposes (FR-042), so a three-key literal no longer
    // describes it. Asserted against the `constants.ts` exports rather than
    // literals — the store is required to seed itself from those constants
    // (contract §1), so a default that moves in constants.ts must move here
    // with it, and a hardcoded 30/15/10 would hide exactly that break.
    it('globalOverrides has default values', () => {
      const state = useStore.getState()
      expect(state.globalOverrides).toEqual({
        ADMIN_GAP_MINS,
        FLIGHT_BUFFER_MINS,
        THRESHOLD_MINS,
        SLOT_MINS,
        DE_BOUT_DURATION,
        YOUTH_VET_BOUT_DELTA,
        DEFAULT_DE_STRIP_FOOTPRINT,
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
      // 'AUTO', not 'SINGLE_STAGE' — a new event follows its tournament type's
      // DE mode until an organizer picks one (research D6). buildConfig resolves it.
      expect(cadetConfig.de_mode).toBe('AUTO')
      expect(cadetConfig.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[cadetEntry.category])
      expect(cadetConfig.use_single_pool_override).toBe(false)

      // Junior defaults
      const juniorConfig = state.selectedCompetitions[JUNIOR_WE]
      expect(juniorConfig).toBeDefined()
      expect(juniorConfig.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[juniorEntry.category])
    })

    it('defaults a team competition to all-advance regardless of its category default', () => {
      useStore.getState().selectCompetitions([CADET_MF_TEAM])

      const state = useStore.getState()
      const teamConfig = state.selectedCompetitions[CADET_MF_TEAM]

      expect(teamConfig).toBeDefined()
      // Cadet's own category default is PERCENTAGE/20 (asserted above for the
      // individual entry) — the team override must win over it.
      expect(DEFAULT_CUT_BY_CATEGORY[Category.CADET].mode).toBe('PERCENTAGE')
      expect(teamConfig.cut_mode).toBe('DISABLED')
      expect(teamConfig.cut_value).toBe(100)
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
