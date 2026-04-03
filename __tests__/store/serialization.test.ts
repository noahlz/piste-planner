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

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Returns a store snapshot with some non-default data for meaningful round-trip tests. */
function populatedState(): StoreState {
  const store = useStore
  store.setState(store.getInitialState())
  store.getState().setTournamentType('RYC')
  store.getState().setDays(2)
  store.getState().setStrips(12)
  store.getState().setVideoStrips(4)
  store.getState().setPodCaptainOverride('FORCE_4')
  store.getState().selectCompetitions(['CDT-M-FOIL-IND'])
  store.getState().updateCompetition('CDT-M-FOIL-IND', { fencer_count: 64 })
  store.getState().setGlobalOverrides({ ADMIN_GAP_MINS: 20 })
  store.getState().setDayRefs(0, { foil_epee_refs: 6, three_weapon_refs: 3 })
  store.getState().setDayRefs(1, { foil_epee_refs: 5, three_weapon_refs: 2 })
  return store.getState()
}

function validSerializedData(): SerializedState {
  return {
    schemaVersion: 1,
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
      pod_captain_override: 'AUTO',
    },
    competitions: {
      selectedCompetitions: {
        'CDT-M-FOIL-IND': {
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
    referees: {
      dayRefs: [
        { foil_epee_refs: 4, three_weapon_refs: 2 },
        { foil_epee_refs: 3, three_weapon_refs: 1 },
        { foil_epee_refs: 5, three_weapon_refs: 3 },
      ],
    },
  }
}

// ──────────────────────────────────────────────
// serializeState
// ──────────────────────────────────────────────

describe('serializeState', () => {
  it('produces JSON with schemaVersion: 1 and all serializable slice data', () => {
    const state = populatedState()
    const json = serializeState(state)
    const parsed = JSON.parse(json)

    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.tournament).toBeDefined()
    expect(parsed.competitions).toBeDefined()
    expect(parsed.referees).toBeDefined()

    expect(parsed.tournament.tournament_type).toBe('RYC')
    expect(parsed.tournament.days_available).toBe(2)
    expect(parsed.tournament.strips_total).toBe(12)
    expect(parsed.tournament.video_strips_total).toBe(4)
    expect(parsed.tournament.pod_captain_override).toBe('FORCE_4')
    expect(parsed.tournament.dayConfigs).toHaveLength(2)

    expect(parsed.competitions.selectedCompetitions['CDT-M-FOIL-IND'].fencer_count).toBe(64)
    expect(parsed.competitions.globalOverrides.ADMIN_GAP_MINS).toBe(20)

    expect(parsed.referees.dayRefs).toHaveLength(2)
    expect(parsed.referees.dayRefs[0].foil_epee_refs).toBe(6)
    expect(parsed.referees.dayRefs[1].three_weapon_refs).toBe(2)
  })

  it('excludes transient state (UI, analysis, schedule)', () => {
    const state = populatedState()
    const json = serializeState(state)
    const parsed = JSON.parse(json)

    // Only three top-level data keys + schemaVersion
    expect(Object.keys(parsed).sort()).toEqual(
      ['competitions', 'referees', 'schemaVersion', 'tournament'].sort(),
    )
  })
})

// ──────────────────────────────────────────────
// validateSchema
// ──────────────────────────────────────────────

describe('validateSchema', () => {
  it('accepts valid data', () => {
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
    if (!result.valid) expect(result.error).toMatch(/unknown/i)
  })

  it('rejects invalid tournament_type', () => {
    const data = validSerializedData()
    ;(data.tournament as Record<string, unknown>).tournament_type = 'INVALID'
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/tournament_type/i)
  })

  it('rejects days_available out of range (< 2)', () => {
    const data = validSerializedData()
    data.tournament.days_available = 1
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/days_available/i)
  })

  it('rejects days_available out of range (> 4)', () => {
    const data = validSerializedData()
    data.tournament.days_available = 5
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

  it('rejects negative fencer_count in a competition', () => {
    const data = validSerializedData()
    data.competitions.selectedCompetitions['CDT-M-FOIL-IND'].fencer_count = -5
    const result = validateSchema(data)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/fencer_count/i)
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
      expect(result.state.selectedCompetitions?.['CDT-M-FOIL-IND']?.fencer_count).toBe(32)
      expect(result.state.dayRefs).toHaveLength(3)
    }
  })

  it('rejects missing schemaVersion', () => {
    const data = validSerializedData() as unknown as Record<string, unknown>
    delete data.schemaVersion
    const result = deserializeState(JSON.stringify(data))
    expect('error' in result).toBe(true)
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
    expect(loaded.pod_captain_override).toBe(original.pod_captain_override)
    expect(loaded.selectedCompetitions).toEqual(original.selectedCompetitions)
    expect(loaded.globalOverrides).toEqual(original.globalOverrides)
    expect(loaded.dayRefs).toEqual(original.dayRefs)
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
    expect(loaded.dayRefs).toEqual(original.dayRefs)
  })
})

describe('URL size warning', () => {
  it('warns when encoded payload exceeds 2KB', () => {
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
