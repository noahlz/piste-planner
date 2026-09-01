import { describe, it, expect } from 'vitest'
import {
  serializeState,
  deserializeState,
  validateSchema,
  encodeToUrl,
  decodeFromUrl,
} from '../../src/store/serialization.ts'
import type { SerializedState } from '../../src/store/serialization.ts'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { PlacementSource } from '../../src/engine/types.ts'
import type { Placement } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// P2 types not yet on StoreState/SerializedState (T008 adds the store slices,
// T010 adds the wire shape) — local stand-ins so these tests compile against
// the target v2 contract (specs/003-p2-derived-state/contracts/serialization-v2.md)
// ahead of that work.
// ──────────────────────────────────────────────

/** StoreState plus the placements/dismissals slices T008 adds. */
type StoreStateWithPlacements = StoreState & {
  placements: Record<string, Placement>
  dismissedFindings: Record<string, true>
}

/** The v2 wire shape T010 adds to SerializedState (schemaVersion 2 plus the new keys). */
type SerializedStateV2 = {
  schemaVersion: 2
  tournament: SerializedState['tournament']
  competitions: SerializedState['competitions']
  placements: Record<string, Placement>
  dismissedFindings: string[]
}

/** deserializeState's success shape once T010 adds the lenient drop-and-report notice. */
type DeserializeSuccess = { state: Partial<StoreStateWithPlacements>; droppedPlacements: string[] }

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** The event id populatedState() selects — the fixture id used across placement tests. */
const FIXTURE_EVENT_ID = 'CDT-M-FOIL-IND'

/** Returns a store snapshot with some non-default data for meaningful round-trip tests. */
function populatedState(): StoreState {
  const store = useStore
  store.setState(store.getInitialState())
  store.getState().setTournamentType('RYC')
  store.getState().setDays(2)
  store.getState().setStrips(12)
  store.getState().setVideoStrips(4)
  store.getState().selectCompetitions([FIXTURE_EVENT_ID])
  store.getState().updateCompetition(FIXTURE_EVENT_ID, { fencer_count: 64 })
  store.getState().setGlobalOverrides({ ADMIN_GAP_MINS: 20 })
  return store.getState()
}

/** A structurally valid placement for FIXTURE_EVENT_ID, with optional field overrides. */
function validPlacement(overrides: Partial<Placement> = {}): Placement {
  return {
    day: 0,
    start_time: 480,
    strip_count: 6,
    strips: null,
    source: PlacementSource.MANUAL,
    pinned: true,
    ...overrides,
  }
}

/** populatedState() plus one placement and one dismissed finding, for round-trip coverage. */
function populatedStateWithPlacementsAndDismissals(): StoreStateWithPlacements {
  populatedState()
  useStore.setState({
    placements: { [FIXTURE_EVENT_ID]: validPlacement() },
    dismissedFindings: { 'same-population:D1-M-EPEE-IND+JR-M-EPEE-IND': true },
  } as unknown as Partial<StoreState>)
  return useStore.getState() as StoreStateWithPlacements
}

function validSerializedData(): SerializedStateV2 {
  return {
    schemaVersion: 2,
    tournament: {
      tournament_type: 'NAC',
      days_available: 3,
      dayConfigs: [
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 480, day_end_time: 1320 },
        { day_start_time: 480, day_end_time: 1320 },
      ],
      strips_total: 10,
      video_strips_total: 2,
    },
    competitions: {
      selectedCompetitions: {
        [FIXTURE_EVENT_ID]: {
          fencer_count: 32,
          ref_policy: 'AUTO',
          cut_mode: 'PERCENTAGE',
          cut_value: 80,
          de_mode: 'SINGLE_STAGE',
          de_video_policy: 'BEST_EFFORT',
          use_single_pool_override: false,
        },
      },
      globalOverrides: {
        ADMIN_GAP_MINS: 15,
        FLIGHT_BUFFER_MINS: 15,
        THRESHOLD_MINS: 10,
      },
    },
    // Non-empty by default so 'accepts valid v2 data' actually exercises a
    // populated payload — the 'accepts an empty placements map' and 'accepts
    // an empty dismissedFindings array' tests below override these to their
    // genuinely-empty case instead of duplicating this one.
    placements: { [FIXTURE_EVENT_ID]: validPlacement() },
    dismissedFindings: ['same-population:D1-M-EPEE-IND+JR-M-EPEE-IND'],
  }
}

/** validSerializedData() with one placement entry for eventId (default: FIXTURE_EVENT_ID). */
function withPlacement(overrides: Partial<Placement> = {}, eventId = FIXTURE_EVENT_ID): SerializedStateV2 {
  const data = validSerializedData()
  data.placements = { [eventId]: validPlacement(overrides) }
  return data
}

/** The default table as it appears in serialized form – the engine's `Weapon` keys (research D4). */
function validPoolDurationTable(): Record<string, number> {
  return { EPEE: 120, FOIL: 105, SABRE: 75 }
}

/** The single override used by the mixed-table fixtures and their expectations. */
const EPEE_OVERRIDE = 110

/** validPoolDurationTable() with the epee override applied – the expected mixed table. */
function mixedPoolDurationTable(): Record<string, number> {
  return { ...validPoolDurationTable(), EPEE: EPEE_OVERRIDE }
}

/** validSerializedData() with a pool_round_duration_table injected into tournament. */
function serializedDataWithTable(table: unknown): Record<string, unknown> {
  const data = validSerializedData() as unknown as { tournament: Record<string, unknown> }
  data.tournament.pool_round_duration_table = table
  return data as unknown as Record<string, unknown>
}

/** populatedState() plus one duration override – epee overridden while foil and sabre keep their defaults. */
function populatedStateWithMixedTable(): StoreState {
  populatedState()
  useStore.getState().setPoolRoundDuration('EPEE', EPEE_OVERRIDE)
  return useStore.getState()
}

// ──────────────────────────────────────────────
// serializeState
// ──────────────────────────────────────────────

describe('serializeState', () => {
  it('produces JSON with schemaVersion: 2 and all serializable slice data', () => {
    const state = populatedState()
    const json = serializeState(state)
    const parsed = JSON.parse(json)

    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.tournament).toBeDefined()
    expect(parsed.competitions).toBeDefined()

    expect(parsed.tournament.tournament_type).toBe('RYC')
    expect(parsed.tournament.days_available).toBe(2)
    expect(parsed.tournament.strips_total).toBe(12)
    expect(parsed.tournament.video_strips_total).toBe(4)
    expect(parsed.tournament.dayConfigs).toHaveLength(2)

    expect(parsed.competitions.selectedCompetitions[FIXTURE_EVENT_ID].fencer_count).toBe(64)
    expect(parsed.competitions.globalOverrides.ADMIN_GAP_MINS).toBe(20)
  })

  it('excludes transient state (UI, analysis, schedule) and referees', () => {
    const state = populatedState()
    const json = serializeState(state)
    const parsed = JSON.parse(json)

    // Five top-level keys: schemaVersion + tournament + competitions + the v2 additions
    expect(Object.keys(parsed).sort()).toEqual(
      ['competitions', 'dismissedFindings', 'placements', 'schemaVersion', 'tournament'].sort(),
    )
  })

  it('always writes the full pool_round_duration_table from an untouched store', () => {
    const store = useStore
    store.setState(store.getInitialState())
    const parsed = JSON.parse(serializeState(store.getState()))

    expect(parsed.tournament.pool_round_duration_table).toEqual({
      EPEE: 120,
      FOIL: 105,
      SABRE: 75,
    })
  })

  it('writes all three weapon keys when one duration is overridden', () => {
    const state = populatedStateWithMixedTable()
    const parsed = JSON.parse(serializeState(state))

    expect(parsed.tournament.pool_round_duration_table).toEqual(mixedPoolDurationTable())
  })

  it('writes placements keyed by event id, matching the store map exactly', () => {
    const state = populatedStateWithPlacementsAndDismissals()
    const parsed = JSON.parse(serializeState(state))

    expect(parsed.placements).toEqual({ [FIXTURE_EVENT_ID]: validPlacement() })
  })

  it('writes an empty placements object when the store has no placements', () => {
    const state = populatedState()
    const parsed = JSON.parse(serializeState(state))

    expect(parsed.placements).toEqual({})
  })

  it('writes dismissedFindings as an array of finding identities', () => {
    const state = populatedStateWithPlacementsAndDismissals()
    const parsed = JSON.parse(serializeState(state))

    expect(parsed.dismissedFindings).toEqual(['same-population:D1-M-EPEE-IND+JR-M-EPEE-IND'])
  })

  it('writes an empty dismissedFindings array when nothing is dismissed', () => {
    const state = populatedState()
    const parsed = JSON.parse(serializeState(state))

    expect(parsed.dismissedFindings).toEqual([])
  })
})

// ──────────────────────────────────────────────
// validateSchema
// ──────────────────────────────────────────────

describe('validateSchema', () => {
  it('accepts valid v2 data', () => {
    const result = validateSchema(validSerializedData())
    expect(result.valid).toBe(true)
  })

  it('rejects missing schemaVersion', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete data.schemaVersion
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/schemaVersion/i)
  })

  it('rejects schemaVersion 1 – v1 payloads are no longer accepted, no migration (research D5)', () => {
    const data = { ...validSerializedData(), schemaVersion: 1 }
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/schemaVersion/i)
  })

  it('rejects unsupported schemaVersion', () => {
    const data = { ...validSerializedData(), schemaVersion: 99 }
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/schemaVersion/i)
  })

  it('rejects unknown top-level fields', () => {
    const data = { ...validSerializedData(), extraField: 'nope' }
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/extraField/)
  })

  it('rejects a legacy top-level "referees" key – the v1 leniency for it does not carry over', () => {
    const data = { ...validSerializedData(), referees: { dayRefs: [] } }
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/referees/)
  })

  it('rejects invalid tournament_type', () => {
    const data = validSerializedData()
    ;(data.tournament as Record<string, unknown>).tournament_type = 'INVALID'
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/tournament_type/i)
  })

  it('rejects days_available out of range (< 1)', () => {
    const data = validSerializedData()
    data.tournament.days_available = 0
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/days_available/i)
  })

  it('accepts days_available at the widened v2 lower boundary (1) – rejected under v1', () => {
    const data = validSerializedData()
    data.tournament.days_available = 1
    data.tournament.dayConfigs = [{ day_start_time: 480, day_end_time: 1320 }]
    const result = validateSchema(data)
    expect(result.valid).toBe(true)
  })

  it('accepts days_available at the widened v2 upper boundary (14) – rejected under v1', () => {
    const data = validSerializedData()
    data.tournament.days_available = 14
    data.tournament.dayConfigs = Array.from({ length: 14 }, () => ({
      day_start_time: 480,
      day_end_time: 1320,
    }))
    const result = validateSchema(data)
    expect(result.valid).toBe(true)
  })

  it('rejects days_available out of range (> 14)', () => {
    const data = validSerializedData()
    data.tournament.days_available = 15
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/days_available/i)
  })

  it('rejects negative strips_total', () => {
    const data = validSerializedData()
    data.tournament.strips_total = -1
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/strips_total/i)
  })

  it('rejects video_strips_total > strips_total', () => {
    const data = validSerializedData()
    data.tournament.video_strips_total = 20
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/video_strips_total/i)
  })

  it('accepts video_strips_total absent from the payload (schema leniency, research D8)', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete (data.tournament as Record<string, unknown>).video_strips_total
    const result = validateSchema(data)
    expect(result.valid).toBe(true)
  })

  it('rejects negative fencer_count in a competition', () => {
    const data = validSerializedData()
    data.competitions.selectedCompetitions[FIXTURE_EVENT_ID].fencer_count = -5
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/fencer_count/i)
  })

  it('rejects an invalid de_mode value in a competition', () => {
    const data = validSerializedData()
    ;(data.competitions.selectedCompetitions[FIXTURE_EVENT_ID] as unknown as Record<string, unknown>).de_mode =
      'BOGUS'
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/de_mode/i)
  })

  it('accepts de_mode: AUTO in a competition', () => {
    const data = validSerializedData()
    data.competitions.selectedCompetitions[FIXTURE_EVENT_ID].de_mode = 'AUTO'
    const result = validateSchema(data)
    expect(result.valid).toBe(true)
  })

  // 004 T068 finding 4. The same hole T064 closed for de_mode, one field over:
  // an unrecognized ref_policy reaches buildConfig.ts's AUTO branch — where it
  // is neither AUTO nor a resolved policy — and then the engine's referee
  // demand scaling. In the UI it drops the `Referees for …` Select into the
  // no-selection state T065 had to repair.
  it('rejects an invalid ref_policy value in a competition', () => {
    const data = validSerializedData()
    ;(data.competitions.selectedCompetitions[FIXTURE_EVENT_ID] as unknown as Record<string, unknown>).ref_policy =
      'BOGUS'
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/ref_policy/i)
  })

  it.each(['ONE', 'TWO', 'AUTO'])('accepts ref_policy: %s in a competition', (policy) => {
    // AUTO is the unset marker and belongs on the wire alongside the two
    // resolved policies (research D5) — a validator that admitted only ONE and
    // TWO would reject every link an unset event is saved into.
    const data = validSerializedData()
    ;(data.competitions.selectedCompetitions[FIXTURE_EVENT_ID] as unknown as Record<string, unknown>).ref_policy =
      policy
    const result = validateSchema(data)
    expect(result.valid, `ref_policy "${policy}" rejected`).toBe(true)
  })

  it('rejects missing required fields', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete data.tournament
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/tournament/i)
  })

  it('returns descriptive error message on invalid input', () => {
    const result = validateSchema('not an object')
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error.length).toBeGreaterThan(0)
  })

  it('accepts a valid pool_round_duration_table', () => {
    const result = validateSchema(serializedDataWithTable(validPoolDurationTable()))
    expect(result.valid).toBe(true)
  })

  it('accepts durations at the range boundaries and far from the defaults', () => {
    // 1 and 999 pin the exact bounds against off-by-one regressions, and 600 is
    // the extreme-but-valid value the spec's edge case names.
    const result = validateSchema(serializedDataWithTable({ EPEE: 1, FOIL: 999, SABRE: 600 }))
    expect(result.valid).toBe(true)
  })

  it('rejects pool_round_duration_table of the wrong type (FR-008)', () => {
    // null is a separate case – typeof null === 'object' would slip past a naive typeof check
    for (const bad of ['fast', null]) {
      const result = validateSchema(serializedDataWithTable(bad))
      expect(result.valid, `table ${JSON.stringify(bad)}`).toBe(false)
      if (!result.valid) expect(result.error).toMatch(/pool_round_duration_table.*object/i)
    }
  })

  it('rejects pool_round_duration_table missing a weapon key (FR-008)', () => {
    const table = validPoolDurationTable()
    delete table.SABRE
    const result = validateSchema(serializedDataWithTable(table))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toMatch(/pool_round_duration_table/i)
      expect(result.error).toMatch(/SABRE/)
    }
  })

  it('rejects pool_round_duration_table with an extra key (FR-008)', () => {
    const table = validPoolDurationTable()
    table.DAGGER = 90
    const result = validateSchema(serializedDataWithTable(table))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toMatch(/pool_round_duration_table/i)
      expect(result.error).toMatch(/DAGGER/)
    }
  })

  it('rejects a non-integer pool round duration (FR-008)', () => {
    const table = validPoolDurationTable()
    table.EPEE = 110.5
    const result = validateSchema(serializedDataWithTable(table))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toMatch(/pool_round_duration_table/i)
      expect(result.error).toMatch(/EPEE/)
    }
  })

  it('rejects pool round durations below 1 (FR-008)', () => {
    for (const bad of [0, -5]) {
      const table = validPoolDurationTable()
      table.EPEE = bad
      const result = validateSchema(serializedDataWithTable(table))
      expect(result.valid, `value ${bad}`).toBe(false)
      if (!result.valid) {
        expect(result.error).toMatch(/pool_round_duration_table/i)
        expect(result.error).toMatch(/EPEE/)
      }
    }
  })

  it('rejects a pool round duration above 999 (FR-008)', () => {
    const table = validPoolDurationTable()
    table.EPEE = 1000
    const result = validateSchema(serializedDataWithTable(table))
    expect(result.valid).toBe(false)
    if (!result.valid) {
      expect(result.error).toMatch(/pool_round_duration_table/i)
      expect(result.error).toMatch(/EPEE/)
    }
  })

  // ──────────────────────────────────────────────
  // placements (NEW in v2)
  // ──────────────────────────────────────────────

  describe('placements', () => {
    it('rejects a missing placements key', () => {
      const data = validSerializedData() as unknown as Record<string, unknown>
      delete data.placements
      const result = validateSchema(data)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.error).toMatch(/placements/i)
    })

    it('accepts an empty placements map', () => {
      const data = { ...validSerializedData(), placements: {} }
      const result = validateSchema(data)
      expect(result.valid).toBe(true)
    })

    it('rejects placements that is not an object', () => {
      for (const bad of ['nope', 42, null, []]) {
        const data = { ...validSerializedData(), placements: bad }
        const result = validateSchema(data)
        expect(result.valid, `placements ${JSON.stringify(bad)}`).toBe(false)
        if (!result.valid) expect(result.error).toMatch(/placements.*object/i)
      }
    })

    it('accepts a day beyond days_available - 1 (stored intent, surfaces as a finding elsewhere)', () => {
      const data = withPlacement({ day: 5 })
      data.tournament.days_available = 2
      const result = validateSchema(data)
      expect(result.valid).toBe(true)
    })

    it('accepts strips: null', () => {
      const result = validateSchema(withPlacement({ strips: null }))
      expect(result.valid).toBe(true)
    })

    it('accepts strips: number[]', () => {
      const result = validateSchema(withPlacement({ strips: [0, 1, 2] }))
      expect(result.valid).toBe(true)
    })

    const invalidPlacementCases: Array<[string, Partial<Placement>, RegExp]> = [
      ['day is negative', { day: -1 }, /day/],
      ['day is not an integer', { day: 1.5 }, /day/],
      ['start_time is negative', { start_time: -1 }, /start_time/],
      ['start_time is not an integer', { start_time: 480.5 }, /start_time/],
      ['strip_count is zero', { strip_count: 0 }, /strip_count/],
      ['strip_count is negative', { strip_count: -2 }, /strip_count/],
      ['strip_count is not an integer', { strip_count: 2.5 }, /strip_count/],
      ['source is not "auto" or "manual"', { source: 'guess' as unknown as Placement['source'] }, /source/],
      ['pinned is not a boolean', { pinned: 'yes' as unknown as boolean }, /pinned/],
      ['strips contains a negative index', { strips: [-1] }, /strips/],
      ['strips contains a non-integer', { strips: [1.5] }, /strips/],
      ['strips is neither null nor an array', { strips: 'none' as unknown as number[] }, /strips/],
    ]

    it.each(invalidPlacementCases)('rejects a placement where %s', (_label, overrides, fieldPattern) => {
      const data = withPlacement(overrides)
      const result = validateSchema(data)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.error).toMatch(fieldPattern)
    })
  })

  // ──────────────────────────────────────────────
  // dismissedFindings (NEW in v2)
  // ──────────────────────────────────────────────

  describe('dismissedFindings', () => {
    it('rejects a missing dismissedFindings key', () => {
      const data = validSerializedData() as unknown as Record<string, unknown>
      delete data.dismissedFindings
      const result = validateSchema(data)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.error).toMatch(/dismissedFindings/i)
    })

    it('accepts an empty dismissedFindings array', () => {
      const data = { ...validSerializedData(), dismissedFindings: [] }
      const result = validateSchema(data)
      expect(result.valid).toBe(true)
    })

    it('rejects dismissedFindings that is not an array', () => {
      for (const bad of ['nope', 42, null, {}]) {
        const data = { ...validSerializedData(), dismissedFindings: bad }
        const result = validateSchema(data)
        expect(result.valid, `dismissedFindings ${JSON.stringify(bad)}`).toBe(false)
        if (!result.valid) expect(result.error).toMatch(/dismissedFindings/i)
      }
    })

    it('rejects a dismissedFindings array containing a non-string entry', () => {
      const data = { ...validSerializedData(), dismissedFindings: ['valid-id', 42] }
      const result = validateSchema(data)
      expect(result.valid).toBe(false)
      if (!result.valid) expect(result.error).toMatch(/dismissedFindings/i)
    })

    it('accepts unknown finding identities – they are sticky records, not validated against current findings', () => {
      const data = {
        ...validSerializedData(),
        dismissedFindings: ['no-such-rule:UNKNOWN-EVENT-ID'],
      }
      const result = validateSchema(data)
      expect(result.valid).toBe(true)
    })
  })
})

// ──────────────────────────────────────────────
// deserializeState
// ──────────────────────────────────────────────

describe('deserializeState', () => {
  it('valid JSON hydrates store slices correctly', () => {
    const json = JSON.stringify(validSerializedData())
    const result = deserializeState(json)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.tournament_type).toBe('NAC')
      expect(result.state.strips_total).toBe(10)
      expect(result.state.selectedCompetitions?.[FIXTURE_EVENT_ID]?.fencer_count).toBe(32)
    }
  })

  it('rejects a schemaVersion 1 payload outright – no migration (research D5)', () => {
    const v1 = {
      schemaVersion: 1,
      tournament: {
        tournament_type: 'NAC',
        days_available: 3,
        dayConfigs: [],
        strips_total: 10,
        video_strips_total: 2,
      },
      competitions: { selectedCompetitions: {}, globalOverrides: { ADMIN_GAP_MINS: 15, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 } },
    }
    const result = deserializeState(JSON.stringify(v1))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toMatch(/schemaVersion/i)
  })

  it('rejects missing schemaVersion', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete data.schemaVersion
    const result = deserializeState(JSON.stringify(data))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toMatch(/schemaVersion/i)
  })

  it('rejects invalid JSON', () => {
    const result = deserializeState('not json at all')
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error.length).toBeGreaterThan(0)
  })

  it('returns descriptive error message on invalid input', () => {
    const data = validSerializedData()
    data.tournament.days_available = -1
    const result = deserializeState(JSON.stringify(data))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toMatch(/days_available/i)
  })

  it('load: legacy pod_captain_override field in tournament is silently ignored (FR-010) – nested leniency, unaffected by v2', () => {
    const legacy = JSON.stringify({
      schemaVersion: 2,
      tournament: {
        tournament_type: 'NAC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 20,
        video_strips_total: 4,
        pod_captain_override: 'FORCE_4',
      },
      competitions: { selectedCompetitions: {}, globalOverrides: { ADMIN_GAP_MINS: 30, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 } },
      placements: {},
      dismissedFindings: [],
    })
    const result = deserializeState(legacy)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.tournament_type).toBe('NAC')
      expect(result.state.strips_total).toBe(20)
      // The removed field is not present on the returned state
      expect((result.state as Record<string, unknown>)['pod_captain_override']).toBeUndefined()
    }
  })

  it('load: legacy de_capacity_estimation field in tournament is silently ignored (FR-010) – nested leniency, unaffected by v2', () => {
    const legacy = JSON.stringify({
      schemaVersion: 2,
      tournament: {
        tournament_type: 'NAC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 20,
        video_strips_total: 4,
        de_capacity_estimation: 'pod_packed',
      },
      competitions: { selectedCompetitions: {}, globalOverrides: { ADMIN_GAP_MINS: 30, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 } },
      placements: {},
      dismissedFindings: [],
    })
    const result = deserializeState(legacy)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.tournament_type).toBe('NAC')
      expect(result.state.strips_total).toBe(20)
      // The removed field is not present on the returned state
      expect((result.state as Record<string, unknown>)['de_capacity_estimation']).toBeUndefined()
    }
  })

  it('load: a present valid pool_round_duration_table is included in the returned state (FR-006)', () => {
    const data = serializedDataWithTable(mixedPoolDurationTable())
    const result = deserializeState(JSON.stringify(data))
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.pool_round_duration_table).toEqual(mixedPoolDurationTable())
    }
  })

  it('load: a malformed pool_round_duration_table fails the whole load (FR-008)', () => {
    const result = deserializeState(JSON.stringify(serializedDataWithTable('fast')))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toMatch(/pool_round_duration_table/i)
  })

  it('load: JSON without pool_round_duration_table omits the key from the returned state entirely (FR-007)', () => {
    const json = JSON.stringify(validSerializedData())
    const result = deserializeState(json)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      // The key must be absent, not present-as-undefined – a present-but-undefined key
      // would clobber the store's seeded defaults through useStore.setState merge.
      expect('pool_round_duration_table' in result.state).toBe(false)
    }
  })

  it('load: JSON without video_strips_total omits the key from the returned state entirely, letting the store default (null) fill in (research D8)', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete (data.tournament as Record<string, unknown>).video_strips_total
    const result = deserializeState(JSON.stringify(data))
    expect('state' in result).toBe(true)
    if ('state' in result) {
      // The key must be absent, not present-as-undefined – a present-but-undefined key
      // would clobber the store's seeded `null` default through useStore.setState merge.
      expect('video_strips_total' in result.state).toBe(false)
    }
  })

  // ──────────────────────────────────────────────
  // placements – lenient drop-and-report (spec edge case, contract "Acceptance rules")
  // ──────────────────────────────────────────────

  it('load: placements for known event ids hydrate into state.placements', () => {
    const data = withPlacement({ day: 1, pinned: false, source: PlacementSource.AUTO })
    const result = deserializeState(JSON.stringify(data)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return
    expect(result.state.placements).toEqual({
      [FIXTURE_EVENT_ID]: validPlacement({ day: 1, pinned: false, source: PlacementSource.AUTO }),
    })
  })

  it('load: a placement day beyond days_available - 1 is accepted, not rejected (stored intent)', () => {
    const data = withPlacement({ day: 9 })
    data.tournament.days_available = 2
    const result = deserializeState(JSON.stringify(data))
    expect('state' in result).toBe(true)
  })

  it('load: a placement referencing an event id absent from selectedCompetitions is dropped and reported, not an error', () => {
    const data = withPlacement()
    data.placements['GHOST-EVENT'] = validPlacement()
    const result = deserializeState(JSON.stringify(data)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return
    expect(Object.keys(result.state.placements ?? {})).toEqual([FIXTURE_EVENT_ID])
    expect(result.droppedPlacements).toEqual(['GHOST-EVENT'])
  })

  it('load: reports every dropped placement id when several are unknown', () => {
    const data = withPlacement()
    data.placements['GHOST-ONE'] = validPlacement()
    data.placements['GHOST-TWO'] = validPlacement()
    const result = deserializeState(JSON.stringify(data)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return
    expect([...result.droppedPlacements].sort()).toEqual(['GHOST-ONE', 'GHOST-TWO'])
  })

  it('load: droppedPlacements is an empty array when every placement matches a selected competition', () => {
    const data = withPlacement()
    const result = deserializeState(JSON.stringify(data)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return
    expect(result.droppedPlacements).toEqual([])
  })

  it('load: an invalid placement field fails the whole load with a descriptive error', () => {
    const data = withPlacement({ strip_count: -3 })
    const result = deserializeState(JSON.stringify(data))
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toMatch(/strip_count/i)
  })

  // ──────────────────────────────────────────────
  // dismissedFindings – sticky, not filtered against anything (contract "Acceptance rules")
  // ──────────────────────────────────────────────

  it('load: dismissedFindings hydrates into the store as a Record keyed by identity', () => {
    const data = { ...validSerializedData(), dismissedFindings: ['same-population:A+B'] }
    const result = deserializeState(JSON.stringify(data))
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect((result.state as Partial<StoreStateWithPlacements>).dismissedFindings).toEqual({
        'same-population:A+B': true,
      })
    }
  })

  it('load: an unknown dismissed-finding identity loads fine – sticky record for a future recompute', () => {
    const data = { ...validSerializedData(), dismissedFindings: ['no-such-rule:UNKNOWN-EVENT-ID'] }
    const result = deserializeState(JSON.stringify(data))
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect((result.state as Partial<StoreStateWithPlacements>).dismissedFindings).toEqual({
        'no-such-rule:UNKNOWN-EVENT-ID': true,
      })
    }
  })
})

// ──────────────────────────────────────────────
// Round-trip: save → load → state matches
// ──────────────────────────────────────────────

describe('round-trip: serializeState → deserializeState', () => {
  it('produces matching state after save then load', () => {
    const original = populatedState()
    const json = serializeState(original)
    const result = deserializeState(json)
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    const loaded = result.state
    expect(loaded.tournament_type).toBe(original.tournament_type)
    expect(loaded.days_available).toBe(original.days_available)
    expect(loaded.dayConfigs).toEqual(original.dayConfigs)
    expect(loaded.strips_total).toBe(original.strips_total)
    expect(loaded.video_strips_total).toBe(original.video_strips_total)
    expect(loaded.selectedCompetitions).toEqual(original.selectedCompetitions)
    expect(loaded.globalOverrides).toEqual(original.globalOverrides)
  })

  it('restores a mixed pool_round_duration_table exactly (one override, two defaults)', () => {
    const original = populatedStateWithMixedTable()
    const result = deserializeState(serializeState(original))
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    expect(result.state.pool_round_duration_table).toEqual(mixedPoolDurationTable())
  })

  it('reproduces placements and dismissedFindings exactly (SC-001)', () => {
    const original = populatedStateWithPlacementsAndDismissals()
    const result = deserializeState(serializeState(original)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    expect(result.state.placements).toEqual(original.placements)
    expect(result.state.dismissedFindings).toEqual(original.dismissedFindings)
    expect(result.droppedPlacements).toEqual([])
  })
})

// ──────────────────────────────────────────────
// URL encode / decode
// ──────────────────────────────────────────────

describe('encodeToUrl', () => {
  it('produces base64url string prefixed with #config=', () => {
    const state = populatedState()
    const url = encodeToUrl(state)
    expect(url).toMatch(/^#config=/)
    // base64url chars only after the prefix
    const payload = url.slice('#config='.length)
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('decodeFromUrl', () => {
  it('valid hash hydrates store', () => {
    const state = populatedState()
    const hash = encodeToUrl(state)
    const result = decodeFromUrl(hash)
    expect('state' in result).toBe(true)
  })

  it('malformed base64 returns error', () => {
    const result = decodeFromUrl('#config=!!!invalid!!!')
    expect('error' in result).toBe(true)
  })

  it('invalid JSON in decoded payload returns error', () => {
    // Encode something that is valid base64url but not valid JSON
    const notJson = btoa('this is not json').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeFromUrl(`#config=${notJson}`)
    expect('error' in result).toBe(true)
  })

  it('missing #config= prefix returns error', () => {
    const result = decodeFromUrl('no-prefix')
    expect('error' in result).toBe(true)
  })

  it('shared URL carrying legacy pod_captain_override loads successfully (FR-010)', () => {
    const legacy = {
      schemaVersion: 2,
      tournament: {
        tournament_type: 'NAC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 20,
        video_strips_total: 4,
        pod_captain_override: 'FORCE_4',
      },
      competitions: { selectedCompetitions: {}, globalOverrides: { ADMIN_GAP_MINS: 30, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 } },
      placements: {},
      dismissedFindings: [],
    }
    const b64url = btoa(JSON.stringify(legacy)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeFromUrl(`#config=${b64url}`)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.tournament_type).toBe('NAC')
      expect((result.state as Record<string, unknown>)['pod_captain_override']).toBeUndefined()
    }
  })

  it('shared URL carrying legacy de_capacity_estimation loads successfully (FR-010)', () => {
    const legacy = {
      schemaVersion: 2,
      tournament: {
        tournament_type: 'NAC',
        days_available: 2,
        dayConfigs: [],
        strips_total: 20,
        video_strips_total: 4,
        de_capacity_estimation: 'pod_packed',
      },
      competitions: { selectedCompetitions: {}, globalOverrides: { ADMIN_GAP_MINS: 30, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 } },
      placements: {},
      dismissedFindings: [],
    }
    const b64url = btoa(JSON.stringify(legacy)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeFromUrl(`#config=${b64url}`)
    expect('state' in result).toBe(true)
    if ('state' in result) {
      expect(result.state.tournament_type).toBe('NAC')
      expect((result.state as Record<string, unknown>)['de_capacity_estimation']).toBeUndefined()
    }
  })

  it('shared URL carrying a placement for a since-removed event id loads, dropping and reporting it', () => {
    const data = withPlacement()
    data.placements['GHOST-EVENT'] = validPlacement()
    const b64url = btoa(JSON.stringify(data)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const result = decodeFromUrl(`#config=${b64url}`) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return
    expect(Object.keys(result.state.placements ?? {})).toEqual([FIXTURE_EVENT_ID])
    expect(result.droppedPlacements).toEqual(['GHOST-EVENT'])
  })
})

describe('URL round-trip: encodeToUrl → decodeFromUrl', () => {
  it('encode then decode produces matching state', () => {
    const original = populatedState()
    const hash = encodeToUrl(original)
    const result = decodeFromUrl(hash)
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    const loaded = result.state
    expect(loaded.tournament_type).toBe(original.tournament_type)
    expect(loaded.days_available).toBe(original.days_available)
    expect(loaded.strips_total).toBe(original.strips_total)
    expect(loaded.selectedCompetitions).toEqual(original.selectedCompetitions)
  })

  it('restores a mixed pool_round_duration_table exactly through encode then decode', () => {
    const original = populatedStateWithMixedTable()
    const result = decodeFromUrl(encodeToUrl(original))
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    expect(result.state.pool_round_duration_table).toEqual(mixedPoolDurationTable())
  })

  it('restores placements and dismissedFindings exactly through encode then decode', () => {
    const original = populatedStateWithPlacementsAndDismissals()
    const result = decodeFromUrl(encodeToUrl(original)) as DeserializeSuccess | { error: string }
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    expect(result.state.placements).toEqual(original.placements)
    expect(result.state.dismissedFindings).toEqual(original.dismissedFindings)
  })
})

describe('URL size warning', () => {
  it('encoded payload can exceed 2KB', () => {
    // Create a state with many competitions to inflate size
    const store = useStore
    store.setState(store.getInitialState())
    store.getState().setDays(4)
    store.getState().setStrips(40)

    // Select many competitions to push payload size over 2KB
    const ids = Array.from({ length: 50 }, (_, i) => `COMP-${i}`)
    const bigComps: Record<string, unknown> = {}
    for (const id of ids) {
      bigComps[id] = {
        fencer_count: 100,
        ref_policy: 'AUTO',
        cut_mode: 'PERCENTAGE',
        cut_value: 80,
        de_mode: 'SINGLE_STAGE',
        de_video_policy: 'BEST_EFFORT',
        use_single_pool_override: false,
      }
    }

    // Manually set the store to have many competitions
    store.setState({ selectedCompetitions: bigComps as Record<string, import('../../src/store/store.ts').CompetitionConfig> })
    const state = store.getState()
    const hash = encodeToUrl(state)

    // The payload (after #config=) should exceed 2KB
    const payload = hash.slice('#config='.length)
    expect(payload.length).toBeGreaterThan(2048)
  })
})
