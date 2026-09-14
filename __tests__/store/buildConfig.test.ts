import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'
import { TYPE_DEFAULTS } from '../../src/store/typeDefaults.ts'
import { defaultCutForEntry } from '../../src/store/competitionDefaults.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import type { Strip, Competition } from '../../src/engine/types.ts'
import {
  DAY_START_MINS, DAY_END_MINS, LATEST_START_MINS, LATEST_START_OFFSET,
  ADMIN_GAP_MINS, FLIGHT_BUFFER_MINS, THRESHOLD_MINS,
  SLOT_MINS, DAY_LENGTH_MINS, DE_REFS,
  SAME_TIME_WINDOW_MINS, INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD, MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS, MIN_FENCERS,
  DEFAULT_POOL_ROUND_DURATION_TABLE, DEFAULT_DE_DURATION_TABLE,
  DE_BOUT_DURATION, YOUTH_VET_BOUT_DELTA, DEFAULT_DE_STRIP_FOOTPRINT,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY, REGIONAL_CUT_OVERRIDES, REGIONAL_CUT_TOURNAMENT_TYPES,
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
        flighted: false,
      },
    },
    // The seven-key override record this fixture seeded left with its slice
    // (013 T022): `buildConfig` reads those constants from `constants.ts` now,
    // so there is nothing for a fixture to state.
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

      // From the store — the two fields the record still carries
      expect(comp.fencer_count).toBe(64)
      expect(comp.flighted).toBe(false)

      // Derived here, not carried (013 T020, data-model §4). The fixture's type
      // is NAC, so ref_policy and de_mode read the NAC row of TYPE_DEFAULTS;
      // the cut pair and the video policy read DIV1's rows of the two default
      // tables. The rules themselves are pinned by the derivation describe at
      // the end of this file and by buildConfig.typeDefaults.test.ts — these
      // lines record that nothing passes through from the store any more.
      expect(comp.ref_policy).toBe(RefPolicy.TWO)
      expect(comp.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp.cut_value).toBe(20)
      expect(comp.de_mode).toBe(DeMode.STAGED)
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
            flighted: false,
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
            flighted: false,
          },
          'CDT-W-EPEE-IND': {
            fencer_count: 32,
            flighted: false,
          },
        } as const,
      })
      const { competitions } = buildTournamentConfig(state)
      expect(competitions).toHaveLength(2)

      const ids = competitions.map((c: Competition) => c.id).sort()
      expect(ids).toEqual(['CDT-W-EPEE-IND', 'D1-M-FOIL-IND'])
    })
  })

  // Re-baselined by 013 T022 (research D7, data-model §4). This describe used
  // to assert the three values `minimalState()` seeded into the store's
  // global-overrides slice — 20/10/5 rather than the constants' 30/15/10 —
  // which is what made it a test of the slice. The slice is deleted, no
  // control writes any of these seven any more, and `buildConfig` reads them
  // from `constants.ts` directly: the assertion is now that the config tracks
  // the constant rather than a frozen literal, so a retuned constant moves the
  // config with it instead of silently disagreeing.
  describe('the seven retuned settings come from constants.ts (013 T022)', () => {
    it('reads each one from its constants.ts export, with no store indirection', () => {
      const state = storeWith(minimalState())
      const { config } = buildTournamentConfig(state)

      expect(config.ADMIN_GAP_MINS).toBe(ADMIN_GAP_MINS)
      expect(config.FLIGHT_BUFFER_MINS).toBe(FLIGHT_BUFFER_MINS)
      expect(config.THRESHOLD_MINS).toBe(THRESHOLD_MINS)
      expect(config.SLOT_MINS).toBe(SLOT_MINS)
      expect(config.DE_BOUT_DURATION).toEqual(DE_BOUT_DURATION)
      expect(config.YOUTH_VET_BOUT_DELTA).toBe(YOUTH_VET_BOUT_DELTA)
      expect(config.DEFAULT_DE_STRIP_FOOTPRINT).toBe(DEFAULT_DE_STRIP_FOOTPRINT)
    })
  })

  // The tournament-level override the Settings panel writes (T022, FR-029).
  // A different mechanism from the per-competition `de_mode` the shrink
  // retired (T019): one value applied to every competition alike, with `null`
  // meaning "follow the type".
  describe('de_mode from the tournament-level override (013 T022)', () => {
    it('follows the tournament type when the override is null (NAC → STAGED)', () => {
      const state = storeWith({
        ...minimalState(),
        tournament_type: TournamentType.NAC,
        de_mode_override: null,
      })
      const { competitions } = buildTournamentConfig(state)

      expect(competitions[0].de_mode).toBe(TYPE_DEFAULTS[TournamentType.NAC].de_mode)
      expect(competitions[0].de_mode).toBe(DeMode.STAGED)
    })

    it('follows a different type when the override is null (ROC → SINGLE_STAGE)', () => {
      const state = storeWith({
        ...minimalState(),
        tournament_type: TournamentType.ROC,
        de_mode_override: null,
      })
      const { competitions } = buildTournamentConfig(state)

      expect(competitions[0].de_mode).toBe(DeMode.SINGLE_STAGE)
    })

    it('an explicit override beats the type default (STAGED on ROC)', () => {
      const state = storeWith({
        ...minimalState(),
        tournament_type: TournamentType.ROC,
        de_mode_override: DeMode.STAGED,
      })
      const { competitions } = buildTournamentConfig(state)

      expect(TYPE_DEFAULTS[TournamentType.ROC].de_mode).toBe(DeMode.SINGLE_STAGE)
      expect(competitions[0].de_mode).toBe(DeMode.STAGED)
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
    // No cut arguments since 013 T020: the store record carries no cut pair, so
    // the competition reaches this loop holding `defaultCutForEntry`'s answer
    // for its category and the only variable left is the tournament type.
    function regionalCutState(tournamentType: TournamentType, compId: string): Partial<StoreState> {
      return {
        ...minimalState(),
        tournament_type: tournamentType,
        selectedCompetitions: {
          [compId]: {
            fencer_count: 40,
            flighted: false,
          },
        },
      }
    }

    it('overrides cut to DISABLED/100 for JUNIOR at ROC tournament', () => {
      const state = storeWith(regionalCutState(TournamentType.ROC, 'JR-M-FOIL-IND'))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'JR-M-FOIL-IND')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.DISABLED)
      expect(comp!.cut_value).toBe(100)
    })

    // The discriminating pair: JUNIOR's catalogue default is PERCENTAGE/20, so
    // the ROC case above can only read DISABLED/100 if the override loop fired.
    it('does NOT override cut for JUNIOR at NAC tournament', () => {
      const state = storeWith(regionalCutState(TournamentType.NAC, 'JR-M-FOIL-IND'))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'JR-M-FOIL-IND')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.PERCENTAGE)
      expect(comp!.cut_value).toBe(20)
    })

    // VETERAN is not in REGIONAL_CUT_OVERRIDES, and its catalogue default is
    // already DISABLED/100 — as is every category the override table omits. So
    // this case records the value a veteran band reaches the engine with at a
    // regional type, and no longer distinguishes "untouched" from "overridden":
    // with the store's explicit cut gone (013 T020) the two answers coincide.
    // The ordering itself is pinned by the derivation describe at the end of
    // this file, across all 66 competitions of the fixture template.
    it('leaves VETERAN at its catalogue default at a ROC tournament (category not in REGIONAL_CUT_OVERRIDES)', () => {
      const state = storeWith(regionalCutState(TournamentType.ROC, 'VET-M-FOIL-IND-V40'))
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'VET-M-FOIL-IND-V40')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.DISABLED)
      expect(comp!.cut_value).toBe(100)
    })
  })

  // Since 013 T020 the pair arrives from `defaultCutForEntry`, which already
  // answers DISABLED/100 for a TEAM entry, so the coercion loop is a backstop
  // rather than the producer and this case can no longer prove it fires. What
  // it still proves is the behavior FR-010 and the engine's `cut-on-team` rule
  // need: a team event reaches the engine with its cut disabled, by whichever
  // of the two rules got there first.
  describe('team event cut_mode coercion (R3, cut-on-team, FR-010)', () => {
    it('a TEAM competition reaches the engine with cut_mode DISABLED', () => {
      const state = storeWith({
        ...minimalState(),
        tournament_type: TournamentType.NAC,
        selectedCompetitions: {
          'JR-M-FOIL-TEAM': {
            fencer_count: 40,
            flighted: false,
          },
        },
      })
      const { competitions } = buildTournamentConfig(state)
      const comp = competitions.find((c: Competition) => c.id === 'JR-M-FOIL-TEAM')

      expect(comp).toBeDefined()
      expect(comp!.cut_mode).toBe(CutMode.DISABLED)
    })
  })

  describe('flighted defaults (no suggestions engine)', () => {
    function twoCompState() {
      return {
        ...minimalState(),
        selectedCompetitions: {
          'D1-M-FOIL-IND': {
            fencer_count: 64,
            flighted: false,
          },
          'CDT-W-EPEE-IND': {
            fencer_count: 32,
            flighted: false,
          },
        } as const,
      }
    }

    it('leaves competitions unflighted', () => {
      const state = storeWith(twoCompState())
      const { competitions } = buildTournamentConfig(state)

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
  })

  // 013 T019 (research D7, FR-062/FR-064/FR-071): once the per-event record
  // shrinks to { fencer_count, flighted } (T020), every field a control used
  // to set becomes a pure derivation off the catalogue entry and the
  // tournament type. This describe pins that derivation two ways: a frozen
  // pre-shrink baseline (must stay byte-identical through the refactor — a
  // drift guard, not a red case) and per-field assertions against the
  // derivation rules themselves (data-model.md §4). Only the `flighted` case
  // is red today — everything else already matches because the store's
  // current per-event defaults (all `AUTO`, all `defaultCutForEntry`, all
  // `DEFAULT_VIDEO_POLICY_BY_CATEGORY`) happen to equal what T020 hard-codes;
  // no UI has ever set them to anything else.
  describe('the per-event shrink (T020) — derivation, not override', () => {
    const FIXTURE_TEMPLATE = 'NAC Vet/Div1/Junior' // DIV1 + JUNIOR individual/team, veteran bands + team
    const FIXTURE_FENCER_COUNT = 40

    /** The pre-shrink baseline JSON captured by __tests__/fixtures — see that
     *  file's header comment (now deleted) for how it was generated: a
     *  one-off vitest test at this same HEAD that called buildTournamentConfig
     *  on this fixture and wrote its `competitions` array to disk. `Infinity`
     *  has no JSON form, so the capture replaced it with the sentinel string
     *  below — `liveCompetitions` applies the same substitution before the
     *  deep-equal so both sides compare like for like. */
    const FIXTURE: { NAC: Competition[]; ROC: Competition[] } = JSON.parse(
      readFileSync(
        `${process.cwd()}/__tests__/fixtures/buildConfig-preShrink-nac-vet-div1-junior.json`,
        'utf-8',
      ),
    )

    function liveCompetitions(type: TournamentType): Competition[] {
      useStore.setState(useStore.getInitialState(), true)
      useStore.getState().applyTemplate(FIXTURE_TEMPLATE)
      useStore.getState().setTournamentType(type)
      for (const id of Object.keys(useStore.getState().selectedCompetitions)) {
        useStore.getState().updateCompetition(id, { fencer_count: FIXTURE_FENCER_COUNT })
      }
      const { competitions } = buildTournamentConfig(useStore.getState())
      const sorted = [...competitions].sort((a, b) => a.id.localeCompare(b.id))
      return JSON.parse(
        JSON.stringify(sorted, (_key, value) => (value === Infinity ? '__Infinity__' : value)),
      )
    }

    it('matches the pre-shrink baseline at NAC', () => {
      expect(liveCompetitions(TournamentType.NAC)).toEqual(FIXTURE.NAC)
    })

    it('matches the pre-shrink baseline at a regional type (ROC)', () => {
      expect(liveCompetitions(TournamentType.ROC)).toEqual(FIXTURE.ROC)
    })

    describe('per-field derivation, asserted directly against every fixture competition', () => {
      function derivedState(type: TournamentType): StoreState {
        useStore.setState(useStore.getInitialState(), true)
        useStore.getState().applyTemplate(FIXTURE_TEMPLATE)
        useStore.getState().setTournamentType(type)
        return useStore.getState()
      }

      it.each([TournamentType.NAC, TournamentType.ROC])(
        'ref_policy is TYPE_DEFAULTS[type].ref_policy for every competition at %s',
        (type) => {
          const { competitions } = buildTournamentConfig(derivedState(type))
          for (const comp of competitions) {
            expect(comp.ref_policy, comp.id).toBe(TYPE_DEFAULTS[type].ref_policy)
          }
        },
      )

      // `expected` below calls defaultCutForEntry, the same function
      // production calls, so this case proves the three rules apply in the
      // stated order — it cannot catch a wrong value returned by
      // defaultCutForEntry itself. The cut table's actual values are pinned
      // elsewhere: the frozen pre-shrink fixture deep-equal
      // (__tests__/fixtures/buildConfig-preShrink-nac-vet-div1-junior.json)
      // and the explicit JUNIOR-at-ROC/NAC literal cases earlier in this file.
      it.each([TournamentType.NAC, TournamentType.ROC])(
        'cut_mode/cut_value follow defaultCutForEntry, then the regional override, then the team coercion, at %s',
        (type) => {
          const { competitions } = buildTournamentConfig(derivedState(type))
          for (const comp of competitions) {
            const entry = findCompetition(comp.id)
            if (!entry) throw new Error(`${comp.id}: not found in CATALOGUE`)

            let expected = defaultCutForEntry(entry)
            if (REGIONAL_CUT_TOURNAMENT_TYPES.has(type)) {
              const override = REGIONAL_CUT_OVERRIDES[entry.category]
              if (override) expected = override
            }
            if (entry.event_type === EventType.TEAM) {
              expected = { mode: CutMode.DISABLED, value: 100 }
            }

            expect(comp.cut_mode, `${comp.id}: cut_mode`).toBe(expected.mode)
            expect(comp.cut_value, `${comp.id}: cut_value`).toBe(expected.value)
          }
        },
      )

      it('de_video_policy is DEFAULT_VIDEO_POLICY_BY_CATEGORY[category] for every competition', () => {
        const { competitions } = buildTournamentConfig(derivedState(TournamentType.NAC))
        for (const comp of competitions) {
          expect(comp.de_video_policy, comp.id).toBe(DEFAULT_VIDEO_POLICY_BY_CATEGORY[comp.category])
        }
      })

      it('use_single_pool_override, flighting_group_id and is_priority default false/null/false for every competition', () => {
        const { competitions } = buildTournamentConfig(derivedState(TournamentType.NAC))
        for (const comp of competitions) {
          expect(comp.use_single_pool_override, comp.id).toBe(false)
          expect(comp.flighting_group_id, comp.id).toBeNull()
          expect(comp.is_priority, comp.id).toBe(false)
        }
      })

      it("flighted mirrors the store's flag, set through updateCompetition", () => {
        useStore.setState(useStore.getInitialState(), true)
        useStore.getState().applyTemplate(FIXTURE_TEMPLATE)
        const [firstId] = Object.keys(useStore.getState().selectedCompetitions).sort()

        useStore.getState().updateCompetition(firstId, { flighted: true })

        const { competitions } = buildTournamentConfig(useStore.getState())
        const flaggedOn = competitions.find((c) => c.id === firstId)
        const flaggedOff = competitions.find((c) => c.id !== firstId)

        expect(flaggedOn?.flighted, firstId).toBe(true)
        expect(flaggedOff?.flighted, flaggedOff?.id).toBe(false)
      })
    })
  })
})
