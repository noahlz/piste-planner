import { describe, it, expect, beforeEach, vi } from 'vitest'
import { serializeState, deserializeState, validateSchema } from '../../src/store/serialization.ts'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { Weapon } from '../../src/engine/types.ts'
import {
  ADMIN_GAP_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
} from '../../src/engine/constants.ts'

// ──────────────────────────────────────────────
// US5 T071 – overrides-only settings serialization (specs/004-p3-workbench-shell,
// US5 contract §4). Written against stand-in `GlobalOverridesV2`/`StoreStateV2`
// shapes while the store still carried three keys; T072 landed the real
// seven-key `GlobalOverrides`, so those copies are gone and this file
// typechecks against `src/store/store.ts` itself (T078 finding 5). Reached
// through `as unknown as`, they would have kept compiling after a rename or an
// added key over there, with `tsc -b` silent.
// ──────────────────────────────────────────────

// Every case here reads or writes the shared store, so the reset is enforced
// rather than left to each case remembering to call freshStore() first
// (T078 finding 9). `true` replaces rather than merges, matching
// __tests__/store/globalOverrides.test.ts.
beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

/** Resets the store and returns the fresh snapshot. */
function freshStore(): StoreState {
  useStore.setState(useStore.getInitialState(), true)
  return useStore.getState()
}

/**
 * A minimal, valid v2 serialized payload. `overrides` deep-replaces the named
 * top-level keys (used here to swap in a hand-built `competitions` block) —
 * callers pass whole sections, not deep-merged fields.
 */
function baseValidPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    schemaVersion: 2,
    tournament: {
      tournament_type: 'NAC',
      days_available: 1,
      dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
      strips_total: 10,
    },
    competitions: {
      selectedCompetitions: {},
      globalOverrides: {},
    },
    placements: {},
    dismissedFindings: [],
    ...overrides,
  }
}

// ──────────────────────────────────────────────
// Case 1/2 – serializeState writes only departed keys
// ──────────────────────────────────────────────

describe('serializeState — overrides-only globalOverrides (FR-045)', () => {
  it('writes only the keys that depart from their constants.ts defaults', () => {
    const store = freshStore()
    store.setGlobalOverrides({ ADMIN_GAP_MINS: 45, YOUTH_VET_BOUT_DELTA: -8 })

    const parsed = JSON.parse(serializeState(useStore.getState()))
    const written = parsed.competitions.globalOverrides

    expect(Object.keys(written).sort()).toEqual(['ADMIN_GAP_MINS', 'YOUTH_VET_BOUT_DELTA'])
    expect(written.ADMIN_GAP_MINS).toBe(45)
    expect(written.YOUTH_VET_BOUT_DELTA).toBe(-8)
    // Absent, not merely unequal to the overridden values — the five untouched
    // keys must not appear on the wire at all.
    expect(written).not.toHaveProperty('FLIGHT_BUFFER_MINS')
    expect(written).not.toHaveProperty('THRESHOLD_MINS')
    expect(written).not.toHaveProperty('SLOT_MINS')
    expect(written).not.toHaveProperty('DE_BOUT_DURATION')
    expect(written).not.toHaveProperty('DEFAULT_DE_STRIP_FOOTPRINT')
  })

  // Choice made here (per T071 dispatch): a fully default store writes an
  // EMPTY globalOverrides object, not an absent key — `competitions` keeps
  // `globalOverrides` as a required field, it is just empty. T076 implements
  // against this choice.
  it('writes an empty globalOverrides object when every setting is at its default', () => {
    freshStore() // fully default — no overrides applied

    const parsed = JSON.parse(serializeState(useStore.getState()))

    expect(parsed.competitions.globalOverrides).toEqual({})
  })
})

// ──────────────────────────────────────────────
// Case 3 – round trip
// ──────────────────────────────────────────────

describe('round-trip: overridden settings keep their values, unset settings load at defaults', () => {
  it('two overridden settings round-trip and the five unset ones load at constants.ts defaults', () => {
    const store = freshStore()
    store.setGlobalOverrides({ FLIGHT_BUFFER_MINS: 25, SLOT_MINS: 10 })

    const result = deserializeState(serializeState(useStore.getState()))
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    const loaded = result.state.globalOverrides!
    expect(loaded.FLIGHT_BUFFER_MINS).toBe(25)
    expect(loaded.SLOT_MINS).toBe(10)
    expect(loaded.ADMIN_GAP_MINS).toBe(ADMIN_GAP_MINS)
    expect(loaded.THRESHOLD_MINS).toBe(THRESHOLD_MINS)
    expect(loaded.DE_BOUT_DURATION).toEqual(DE_BOUT_DURATION)
    expect(loaded.YOUTH_VET_BOUT_DELTA).toBe(YOUTH_VET_BOUT_DELTA)
    expect(loaded.DEFAULT_DE_STRIP_FOOTPRINT).toBe(DEFAULT_DE_STRIP_FOOTPRINT)
  })
})

// ──────────────────────────────────────────────
// Case 4 – a URL saved before US5 opens at the new settings' defaults (FR-045)
// ──────────────────────────────────────────────

describe('loading a payload saved before US5 (original three keys only)', () => {
  it('is not rejected, and the four new settings load at their constants.ts defaults', () => {
    // The pre-US5 shape always wrote all three original keys, departed or not.
    // ADMIN_GAP_MINS is departed here to prove a genuine pre-existing override
    // still survives the load, not just coincides with its default.
    const payload = baseValidPayload({
      competitions: {
        selectedCompetitions: {},
        globalOverrides: { ADMIN_GAP_MINS: 45, FLIGHT_BUFFER_MINS: 15, THRESHOLD_MINS: 10 },
      },
    })

    expect(validateSchema(payload).valid).toBe(true)

    const result = deserializeState(JSON.stringify(payload))
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    const loaded = result.state.globalOverrides!
    expect(loaded.ADMIN_GAP_MINS).toBe(45)
    expect(loaded.SLOT_MINS).toBe(SLOT_MINS)
    expect(loaded.DE_BOUT_DURATION).toEqual(DE_BOUT_DURATION)
    expect(loaded.YOUTH_VET_BOUT_DELTA).toBe(YOUTH_VET_BOUT_DELTA)
    expect(loaded.DEFAULT_DE_STRIP_FOOTPRINT).toBe(DEFAULT_DE_STRIP_FOOTPRINT)
  })
})

// ──────────────────────────────────────────────
// Case 5 – an unset setting tracks a default that MOVES, not a frozen number
// ──────────────────────────────────────────────

describe('unset settings track a default that moves', () => {
  // Narrow module mock: swaps THRESHOLD_MINS in src/engine/constants.ts for one
  // dynamically re-imported copy of serialization.ts, so the merge-onto-defaults
  // is proven to read the constant live at load time rather than a value baked
  // in anywhere else. Every other export is passed through via importOriginal.
  // Scoped to this one test via resetModules() before and after — the file's
  // top-level static imports (used by every other test) are bound once at file
  // load and are unaffected by this dynamic re-import.
  it('an omitted key loads from whatever constants.ts currently exports', async () => {
    vi.resetModules()
    vi.doMock('../../src/engine/constants.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../src/engine/constants.ts')>()
      return { ...actual, THRESHOLD_MINS: 777 }
    })

    try {
      const { deserializeState: deserializeStateWithMovedDefault } = await import(
        '../../src/store/serialization.ts'
      )

      const payload = baseValidPayload({
        competitions: { selectedCompetitions: {}, globalOverrides: {} }, // THRESHOLD_MINS omitted entirely
      })
      const result = deserializeStateWithMovedDefault(JSON.stringify(payload))
      expect('state' in result).toBe(true)
      if (!('state' in result)) return

      const loaded = result.state.globalOverrides!
      expect(loaded.THRESHOLD_MINS).toBe(777)
    } finally {
      vi.doUnmock('../../src/engine/constants.ts')
      vi.resetModules()
    }
  })
})

// ──────────────────────────────────────────────
// Case 6 – DE_BOUT_DURATION departs as a whole record, not per weapon
// ──────────────────────────────────────────────

describe('DE_BOUT_DURATION departs as a whole record', () => {
  it('is written when any weapon differs from its default', () => {
    const store = freshStore()
    store.setGlobalOverrides({ DE_BOUT_DURATION: { ...DE_BOUT_DURATION, EPEE: 25 } })

    const parsed = JSON.parse(serializeState(useStore.getState()))

    expect(parsed.competitions.globalOverrides.DE_BOUT_DURATION).toEqual({
      ...DE_BOUT_DURATION,
      EPEE: 25,
    })
  })

  it('is omitted when every weapon matches its default', () => {
    const store = freshStore()
    store.setGlobalOverrides({ DE_BOUT_DURATION: { ...DE_BOUT_DURATION } })

    const parsed = JSON.parse(serializeState(useStore.getState()))

    expect(parsed.competitions.globalOverrides).not.toHaveProperty('DE_BOUT_DURATION')
  })
})

// ──────────────────────────────────────────────
// Case 7 – validation, following the de_mode/ref_policy idiom (serialization.ts:41-50)
// ──────────────────────────────────────────────

describe('validateSchema — globalOverrides', () => {
  it('rejects a non-number value for a numeric override key', () => {
    const payload = baseValidPayload({
      competitions: {
        selectedCompetitions: {},
        globalOverrides: { ADMIN_GAP_MINS: 'fast' },
      },
    })

    const result = validateSchema(payload)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/ADMIN_GAP_MINS/i)
  })

  it('rejects a DE_BOUT_DURATION record containing an unrecognized weapon key', () => {
    const payload = baseValidPayload({
      competitions: {
        selectedCompetitions: {},
        globalOverrides: { DE_BOUT_DURATION: { EPEE: 20, FOIL: 20, SABRE: 15, DAGGER: 10 } },
      },
    })

    const result = validateSchema(payload)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.error).toMatch(/DE_BOUT_DURATION/i)
  })
})

// ──────────────────────────────────────────────
// Case 8 (T078 finding 4) – a DE_BOUT_DURATION record naming only some weapons
// ──────────────────────────────────────────────

describe('a truncated DE_BOUT_DURATION on the wire', () => {
  // Unlike pool_round_duration_table, validateSchema does not require this
  // record to be complete – it only rejects unknown weapons and non-numbers.
  // No UI writes a partial record, but a hand-edited share URL can, and an
  // absent weapon must fill from constants.ts rather than reach buildConfig
  // (and then capacity.ts's boutDurations[weapon]) as `undefined`. FR-045's
  // "unset settings continue to track their defaults", applied per weapon.
  it('fills the weapons it omits from constants.ts, never undefined', () => {
    const payload = baseValidPayload({
      competitions: {
        selectedCompetitions: {},
        globalOverrides: { DE_BOUT_DURATION: { EPEE: 25 } },
      },
    })

    expect(validateSchema(payload).valid).toBe(true)

    const result = deserializeState(JSON.stringify(payload))
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    const loaded = result.state.globalOverrides!
    expect(loaded.DE_BOUT_DURATION).toEqual({ ...DE_BOUT_DURATION, EPEE: 25 })
  })
})

// ──────────────────────────────────────────────
// Case 9 (T078 finding 7) – the pool round durations get FR-045's treatment too
// ──────────────────────────────────────────────

describe('serializeState — overrides-only pool_round_duration_table (FR-045)', () => {
  // FR-042 names the pool round durations as one of the gears panel's
  // settings, so FR-045 governs them: only a departed setting travels. The
  // read side already tolerates absence (schema leniency), and an absent key
  // leaves the store's own constants-seeded default in place – so a table
  // saved today follows a retuned DEFAULT_POOL_ROUND_DURATION_TABLE instead of
  // pinning the numbers that were current when the URL was made.
  it('omits the table entirely when every weapon is at its default', () => {
    freshStore()

    const parsed = JSON.parse(serializeState(useStore.getState()))

    expect(parsed.tournament).not.toHaveProperty('pool_round_duration_table')
  })

  // Whole-table-or-absent, never a per-weapon partial: validateSchema rejects
  // a present table that is missing a weapon, so a departure has to carry the
  // untouched weapons with it.
  it('writes the whole table and round-trips it when one weapon is retuned', () => {
    const store = freshStore()
    store.setPoolRoundDuration(Weapon.EPEE, 111)

    const json = serializeState(useStore.getState())
    const parsed = JSON.parse(json)

    expect(parsed.tournament.pool_round_duration_table).toEqual({
      ...DEFAULT_POOL_ROUND_DURATION_TABLE,
      [Weapon.EPEE]: 111,
    })

    const result = deserializeState(json)
    expect('state' in result).toBe(true)
    if (!('state' in result)) return

    expect(result.state.pool_round_duration_table).toEqual({
      ...DEFAULT_POOL_ROUND_DURATION_TABLE,
      [Weapon.EPEE]: 111,
    })
  })
})
