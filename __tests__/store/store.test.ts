import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useStore, type PresetId } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { suggestStripCount } from '../../src/engine/analysis.ts'
import { searchStripCount } from '../../src/engine/stripSearch.ts'
import { Category, DeMode, TournamentType, Weapon } from '../../src/engine/types.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { serializeState } from '../../src/store/serialization.ts'
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

  // The strip search action, called from the Tournament panel (research.md
  // D8, FR-017). 012 T007 replaced the ceiling-only rule with the search from
  // `stripSearch.ts`; 013 T017 split writing out of it — the action now only
  // answers the question, and the panel's Apply is what calls `setStrips` with
  // the resolved number (FR-017). What is pinned here is the wiring, the
  // async contract, that the field is never written by the search itself, and
  // the `null` cases — the search's own arithmetic belongs to
  // `__tests__/engine/stripSearch.test.ts`.
  describe('computeSuggestedStrips', () => {
    // Shared by every test below that needs a board the search can size: 2
    // days, one 70-fencer event selected. The `[M]` comment below documents
    // what this fixture measures to — 10 strips.
    function seedLargeFoilEvent() {
      useStore.getState().setDays(2)
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND'])
      useStore.getState().updateCompetition('D1-M-FOIL-IND', { fencer_count: 70 })
    }

    it("resolves to the search's own answer for the current config", async () => {
      seedLargeFoilEvent()

      const pending = useStore.getState().computeSuggestedStrips()
      expect(pending).toBeInstanceOf(Promise)
      const result = await pending

      const { config, competitions } = buildTournamentConfig(useStore.getState())
      expect(result).toBe(searchStripCount(competitions, config))
      // `[M]` measured directly against the fixture: 70 fencers → 10 pools is
      // the smallest count that places every event. 13 was the old rule's
      // ceiling — `suggestStripCount` sizes for the busiest day running at
      // once, not for placing everything, and asserted as the upper bound below.
      expect(result).toBe(10)
    })

    it('never suggests above the old ceiling rule (FR-007)', async () => {
      seedLargeFoilEvent()

      const result = await useStore.getState().computeSuggestedStrips()

      const { config, competitions } = buildTournamentConfig(useStore.getState())
      const ceiling = suggestStripCount(competitions, config.days_available, config.max_pool_strip_pct)
      // This fixture always has a sizeable competition selected, so the
      // ceiling is a real number here — narrowed for `toBeLessThanOrEqual`,
      // which does not accept `number | null`.
      expect(ceiling).not.toBeNull()
      expect(result).toBeLessThanOrEqual(ceiling as number)
    })

    it('resolves null when no competition is selected — never writes 0', async () => {
      useStore.getState().setStrips(24)

      const result = await useStore.getState().computeSuggestedStrips()

      // FR-010: the absence of an answer is not the number zero. A 0 here
      // would read as a deliberate configuration and fail validation.
      expect(result).toBeNull()
      expect(useStore.getState().strips_total).toBe(24)
    })

    it('resolves null when every selected event has no fencers entered', async () => {
      useStore.getState().setStrips(24)
      // `selectCompetitions` seeds `fencer_count: 0` — the state the button is
      // in the moment an organizer picks events and has not typed counts yet.
      useStore.getState().selectCompetitions(['D1-M-FOIL-IND', 'D1-W-FOIL-IND'])

      const result = await useStore.getState().computeSuggestedStrips()

      expect(result).toBeNull()
      expect(useStore.getState().strips_total).toBe(24)
    })

    it('never writes strips_total itself (FR-017) — the caller writes through setStrips', async () => {
      seedLargeFoilEvent()
      useStore.getState().setStrips(24)

      const seen: number[] = []
      const unsubscribe = useStore.subscribe((state, prev) => {
        if (state.strips_total !== prev.strips_total) seen.push(state.strips_total)
      })

      // Guarded so a failing assertion below can never leak this subscription
      // into later tests — `beforeEach` resets the store but not this listener.
      try {
        await useStore.getState().computeSuggestedStrips()

        expect(seen).toEqual([])
        expect(useStore.getState().strips_total).toBe(24)
      } finally {
        unsubscribe()
      }
    })

    it('setStrips is what changes strips_total', () => {
      useStore.getState().setStrips(10)

      expect(useStore.getState().strips_total).toBe(10)
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

  // 013 T022 (FR-029, research D7). The store keeps the organizer's intent,
  // not a resolved mode: `null` is "follow the type", and `buildConfig.ts`
  // resolves it per render. Which is why the setter has to accept `null` back
  // — without that there is no way to return to following the type.
  describe('setDeModeOverride', () => {
    it('starts null, takes a mode, and takes null back', () => {
      expect(useStore.getState().de_mode_override).toBeNull()

      useStore.getState().setDeModeOverride(DeMode.SINGLE_STAGE)
      expect(useStore.getState().de_mode_override).toBe(DeMode.SINGLE_STAGE)

      useStore.getState().setDeModeOverride(null)
      expect(useStore.getState().de_mode_override).toBeNull()
    })

    it('survives a tournament type change — an override is not re-resolved', () => {
      useStore.getState().setDeModeOverride(DeMode.STAGED)
      useStore.getState().setTournamentType(TournamentType.ROC)

      expect(useStore.getState().de_mode_override).toBe(DeMode.STAGED)
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

    // Dropped without successor (013 T022, research D7): the seven-key
    // override record this asserted the defaults of is deleted, and
    // `buildConfig.ts` reads those seven from `constants.ts` directly.
    // `buildConfig.test.ts` holds the successor claim — that the config
    // tracks each constant — because the config is where they are now
    // observable.
  })

  describe('selectCompetitions', () => {
    // Since 013 T020 the store record is the two fields below and nothing else,
    // so the cut and video-policy defaults this case used to read off the store
    // are asserted where they now live: the competition `buildTournamentConfig`
    // hands the engine. Cadet is not in the derivation describe's fixture
    // template (Vet/Div1/Junior), so these two categories are checked here
    // rather than dropped as covered.
    it('adds competitions carrying only a fencer count and a flighted flag', () => {
      useStore.getState().selectCompetitions([CADET_MF, JUNIOR_WE])

      const state = useStore.getState()

      for (const id of [CADET_MF, JUNIOR_WE]) {
        const config = state.selectedCompetitions[id]
        expect(config, id).toBeDefined()
        expect(Object.keys(config).sort(), id).toEqual(['fencer_count', 'flighted'])
        expect(config.fencer_count, id).toBe(0)
        expect(config.flighted, id).toBe(false)
      }
    })

    it('derives the cut and video-policy defaults from the catalogue on the way to the engine', () => {
      useStore.getState().selectCompetitions([CADET_MF, JUNIOR_WE])
      const cadetEntry = findCompetition(CADET_MF)!
      const juniorEntry = findCompetition(JUNIOR_WE)!

      const { competitions } = buildTournamentConfig(useStore.getState())

      const cadet = competitions.find((c) => c.id === CADET_MF)!
      expect(cadet).toBeDefined()
      expect(cadet.cut_mode).toBe(DEFAULT_CUT_BY_CATEGORY[cadetEntry.category].mode)
      expect(cadet.cut_value).toBe(DEFAULT_CUT_BY_CATEGORY[cadetEntry.category].value)
      expect(cadet.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[cadetEntry.category])
      expect(cadet.use_single_pool_override).toBe(false)

      const junior = competitions.find((c) => c.id === JUNIOR_WE)!
      expect(junior).toBeDefined()
      expect(junior.de_video_policy).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[juniorEntry.category])
    })

    it('sends a team competition to the engine all-advance regardless of its category default', () => {
      useStore.getState().selectCompetitions([CADET_MF_TEAM])

      const { competitions } = buildTournamentConfig(useStore.getState())
      const team = competitions.find((c) => c.id === CADET_MF_TEAM)!

      expect(team).toBeDefined()
      // Cadet's own category default is PERCENTAGE/20 (asserted above for the
      // individual entry) — the team rule must win over it.
      expect(DEFAULT_CUT_BY_CATEGORY[Category.CADET].mode).toBe('PERCENTAGE')
      expect(team.cut_mode).toBe('DISABLED')
      expect(team.cut_value).toBe(100)
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
      // The other field remains unchanged
      expect(state.selectedCompetitions[CADET_MF].flighted).toBe(false)
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

    it('records the template name as loadedPresetId, so a template-loaded config reads back like a preset-loaded one', () => {
      useStore.getState().applyTemplate('RYC Weekend')

      expect(useStore.getState().loadedPresetId).toBe('RYC Weekend')
    })
  })

  // PresetId admits both a fixture ScenarioId and a template name — a
  // compile-time check, not a runtime assertion (T006, research D12/D17).
  const _presetIdAdmitsBoth: PresetId[] = ['B1', 'RYC Weekend']
  void _presetIdAdmitsBoth

  // `setGlobalOverrides` was tested here until 013 T022 deleted it with its
  // slice (research D7). Its successor is `setDeModeOverride`, which belongs
  // to the tournament slice — its cases are with that slice above.
})

// ──────────────────────────────────────────────
// runScheduleAll's return value and lastAutoRun stamp (T006, research D12)
// ──────────────────────────────────────────────

describe('lastAutoRun', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is null on the initial state', () => {
    expect(useStore.getState().lastAutoRun).toBeNull()
  })

  it('is stamped with the placed/unplaced counts runScheduleAll returns', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T14:07:00'))
    applyPreset('B1')

    const result = runScheduleAll()

    expect(result).toEqual({ placed: 24, unplaced: 0 })
    const lastAutoRun = useStore.getState().lastAutoRun
    expect(lastAutoRun?.at).toBe(Date.now())
    expect(lastAutoRun).toEqual(expect.objectContaining({ placed: 24, unplaced: 0 }))
  })

  // B4 is one of drift-baseline.md's two named "has unplaced events" fixtures
  // (the other, B5, places all 12 of its events, so it can't demonstrate this).
  // Its scheduledCount there (17 of 30) was measured before other 013 phase-1
  // tasks landed in this worktree; standing rule 11 says measurements win, so
  // this pins the number this test file actually observes today (18 placed,
  // 12 unplaced) rather than the stale baseline figure.
  //
  // unplaced is `competitions.length - placed`, not "entries in schedule with
  // a null pool_start" — concurrentScheduler.ts's commitEventResult only ever
  // writes a schedule entry once an event's terminal phase completes, so a
  // permanently-failed event (BottleneckSeverity.ERROR, event.permanently_failed)
  // never gets a schedule entry at all rather than getting one with a null
  // pool_start. The latter reading would make unplaced always 0.
  it('counts events the scheduler drops entirely as unplaced, for a preset that does not place everything', () => {
    applyPreset('B4')

    const result = runScheduleAll()

    expect(result).toEqual({ placed: 18, unplaced: 12 })
    expect(useStore.getState().lastAutoRun).toEqual(
      expect.objectContaining({ placed: 18, unplaced: 12 }),
    )
  })
})

describe('runScheduleAll — serialization', () => {
  it('never appears in the serialized wire shape', () => {
    applyPreset('B1')
    runScheduleAll()

    const json = serializeState(useStore.getState())

    expect(json).not.toContain('lastAutoRun')
  })
})
