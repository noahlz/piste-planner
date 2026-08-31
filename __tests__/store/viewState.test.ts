import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadViewState,
  saveViewState,
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  RowHeightStep,
} from '../../src/store/viewState.ts'
import type { ViewState } from '../../src/store/viewState.ts'
import { serializeState } from '../../src/store/serialization.ts'
import { useStore } from '../../src/store/store.ts'

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

/**
 * A fully-populated ViewState distinct from DEFAULT_VIEW_STATE in every field,
 * so a round trip proves fidelity rather than coincidentally matching defaults.
 */
function sampleViewState(): ViewState {
  return {
    // SCHEDULE, because DEFAULT_VIEW_STATE.viewMode is MATRIX from T040 on: a
    // sample sharing a field with the defaults would let a round trip that
    // dropped it still pass.
    viewMode: ViewMode.SCHEDULE,
    rowHeightStep: RowHeightStep.TALL,
    timeZoom: 3,
    timeScroll: 165,
    rowScroll: 42,
    drawerHeight: 280,
    scorecardExpanded: true,
  }
}

/**
 * Serializes sampleViewState() to JSON text with one numeric field replaced
 * by a raw `1e999` literal — valid JSON, but it parses to +Infinity (IEEE
 * double overflow). JSON.stringify(Infinity) would serialize that field to
 * `null` instead, which isValidViewState already rejects on `typeof` alone,
 * so a round trip through JSON.stringify would fail these cases for the
 * wrong reason. Building the payload text by hand is the only way to store
 * an actual non-finite number.
 */
function jsonWithNonFiniteField(field: 'timeZoom' | 'timeScroll' | 'drawerHeight'): string {
  const sample = sampleViewState()
  const entries = (Object.keys(sample) as (keyof ViewState)[]).map((key) =>
    key === field
      ? `${JSON.stringify(key)}:1e999`
      : `${JSON.stringify(key)}:${JSON.stringify(sample[key])}`,
  )
  return `{${entries.join(',')}}`
}

/** A populated store snapshot, for the "untouched by serializeState" test. */
function populatedState() {
  const store = useStore
  store.setState(store.getInitialState())
  store.getState().setTournamentType('RYC')
  store.getState().setDays(2)
  store.getState().setStrips(12)
  store.getState().setVideoStrips(4)
  return store.getState()
}

beforeEach(() => {
  localStorage.clear()
})

// ──────────────────────────────────────────────
// Round trip
// ──────────────────────────────────────────────

describe('viewState round trip', () => {
  it('reads back exactly what was written', () => {
    const written = sampleViewState()
    saveViewState(written)
    expect(loadViewState()).toEqual(written)
  })

  it('persists under a single localStorage key', () => {
    saveViewState(sampleViewState())
    expect(Object.keys(localStorage)).toEqual([VIEW_STATE_STORAGE_KEY])
  })

  it('overwrites the previous value on a second save rather than accumulating keys', () => {
    saveViewState(sampleViewState())
    saveViewState({ ...DEFAULT_VIEW_STATE, timeZoom: 7 })
    expect(Object.keys(localStorage)).toEqual([VIEW_STATE_STORAGE_KEY])
    expect(loadViewState()).toEqual({ ...DEFAULT_VIEW_STATE, timeZoom: 7 })
  })
})

// ──────────────────────────────────────────────
// saveViewState and storage failures
// ──────────────────────────────────────────────

describe('viewState save-storage-failure handling', () => {
  it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError')
    })
    try {
      expect(() => saveViewState(DEFAULT_VIEW_STATE)).not.toThrow()
    } finally {
      setItemSpy.mockRestore()
    }
  })
})

// ──────────────────────────────────────────────
// Defaults when absent
// ──────────────────────────────────────────────

describe('viewState defaults', () => {
  it('returns DEFAULT_VIEW_STATE when the key is absent', () => {
    expect(localStorage.getItem(VIEW_STATE_STORAGE_KEY)).toBeNull()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })
})

// ──────────────────────────────────────────────
// Shared-reference safety
// ──────────────────────────────────────────────

describe('viewState shared-reference safety', () => {
  it('does not leak a mutation of one loadViewState() result into a later call', () => {
    const first = loadViewState()
    const originalRowScroll = first.rowScroll
    first.rowScroll = originalRowScroll + 1
    try {
      const second = loadViewState()
      expect(second.rowScroll).toBe(originalRowScroll)
    } finally {
      // Restore in case loadViewState() handed back a shared reference (the
      // defect this case targets) — keeps this case's failure from cascading
      // into unrelated cases later in the file.
      first.rowScroll = originalRowScroll
    }
  })

  // The case above only exercises the "key absent" fallback branch.
  // loadViewState() has three other fallback sites that return the same
  // `{ ...DEFAULT_VIEW_STATE }` copy — getItem throwing, malformed JSON, and
  // failed shape validation — and each is a separate line of source that
  // could regress to returning the shared DEFAULT_VIEW_STATE reference
  // without any of the existing toEqual-only corrupt-storage cases noticing,
  // since toEqual compares values, not identity.

  it('does not leak a mutation of one loadViewState() result into a later call when localStorage.getItem throws', () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })
    try {
      const first = loadViewState()
      const originalRowScroll = first.rowScroll
      first.rowScroll = originalRowScroll + 1
      const second = loadViewState()
      expect(second.rowScroll).toBe(originalRowScroll)
    } finally {
      getItemSpy.mockRestore()
    }
  })

  it('does not leak a mutation of one loadViewState() result into a later call when the stored value is malformed JSON', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, '{not valid json')
    const first = loadViewState()
    const originalRowScroll = first.rowScroll
    first.rowScroll = originalRowScroll + 1
    try {
      const second = loadViewState()
      expect(second.rowScroll).toBe(originalRowScroll)
    } finally {
      first.rowScroll = originalRowScroll
    }
  })

  it('does not leak a mutation of one loadViewState() result into a later call when the stored value fails shape validation', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    const first = loadViewState()
    const originalRowScroll = first.rowScroll
    first.rowScroll = originalRowScroll + 1
    try {
      const second = loadViewState()
      expect(second.rowScroll).toBe(originalRowScroll)
    } finally {
      first.rowScroll = originalRowScroll
    }
  })
})

// ──────────────────────────────────────────────
// Defaults when the stored value cannot be trusted
// ──────────────────────────────────────────────

describe('viewState corrupt-storage handling', () => {
  it('returns defaults and does not throw when the stored value is malformed JSON', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, '{not valid json')
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults and does not throw when the stored value is an empty string', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, '')
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when the stored value is valid JSON of the wrong shape (array)', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify([1, 2, 3]))
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when the stored value is valid JSON of the wrong shape (unrelated object)', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when the stored value is a bare JSON primitive', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify('hello'))
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when a union field carries an unknown enum value (viewMode)', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), viewMode: 'bogus-mode' }),
    )
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when a union field carries an unknown enum value (rowHeightStep)', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), rowHeightStep: 'giant' }),
    )
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when a required field is missing entirely', () => {
    const { timeZoom: _timeZoom, ...partial } = sampleViewState()
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(partial))
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults when the stored value is the JSON literal null', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, 'null')
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults and does not throw when localStorage.getItem itself throws (e.g. Safari private mode)', () => {
    const getItemSpy = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage access denied', 'SecurityError')
    })
    try {
      expect(() => loadViewState()).not.toThrow()
      expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
    } finally {
      getItemSpy.mockRestore()
    }
  })
})

// ──────────────────────────────────────────────
// Numeric fields are range-checked, not just type-checked
// ──────────────────────────────────────────────

describe('viewState range validation', () => {
  it('returns defaults wholesale when timeZoom is not greater than zero', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), timeZoom: 0 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when timeScroll is negative', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), timeScroll: -30 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when rowScroll is not an integer', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), rowScroll: 2.5 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when drawerHeight is negative', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), drawerHeight: -240 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  // typeof Infinity === 'number' and Infinity satisfies both `> 0` and
  // `>= 0`, so only an explicit finiteness check rejects it — a bound check
  // alone is not enough. (rowScroll is exempt: Number.isInteger(Infinity)
  // is false, so the integer rule already catches it.)

  it('returns defaults wholesale when timeZoom is +Infinity', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, jsonWithNonFiniteField('timeZoom'))
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when timeScroll is +Infinity', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, jsonWithNonFiniteField('timeScroll'))
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when drawerHeight is +Infinity', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, jsonWithNonFiniteField('drawerHeight'))
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })
})

// ──────────────────────────────────────────────
// Untouched by serializeState (research D10)
// ──────────────────────────────────────────────

describe('viewState is absent from the serialized tournament payload', () => {
  it('no ViewState field name appears as a key in the serialized payload', () => {
    // saveViewState here is not exercising loadViewState/serializeState wiring
    // (serializeState only ever reads its `state` parameter) — it guards
    // against a future serializeState that starts reading loadViewState() as
    // a side channel instead. If that ever happened, these field names would
    // leak into the payload and the assertion below would catch it.
    saveViewState(sampleViewState())
    const state = populatedState()
    const json = serializeState(state)

    for (const field of Object.keys(DEFAULT_VIEW_STATE)) {
      expect(json).not.toContain(`"${field}"`)
    }
  })
})
