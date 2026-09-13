import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  loadViewState,
  saveViewState,
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  PanelId,
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
 *
 * 013 T025 (phase-3 contract, data-model.md §2): `rowHeightStep`, `timeZoom`,
 * `timeScroll` and `rowScroll` are gone, replaced by `zoomStep` and `fitting`
 * (the six-rung zoom ladder, contracts/ui-contract.md §Footer).
 */
function sampleViewState(): ViewState {
  return {
    // SCHEDULE, because DEFAULT_VIEW_STATE.viewMode is MATRIX from T040 on: a
    // sample sharing a field with the defaults would let a round trip that
    // dropped it still pass.
    viewMode: ViewMode.SCHEDULE,
    // 4, distinct from DEFAULT_VIEW_STATE.zoomStep (2).
    zoomStep: 4,
    // false, distinct from DEFAULT_VIEW_STATE.fitting (true, data-model §2:
    // the opening view is fit-to-day).
    fitting: false,
    // EVENTS and true, both distinct from DEFAULT_VIEW_STATE's null/false, so
    // a round trip that dropped either field would not coincidentally match.
    panel: PanelId.EVENTS,
    panelDocked: true,
  }
}

/**
 * Serializes sampleViewState() to JSON text with `zoomStep` replaced by a raw
 * `1e999` literal — valid JSON, but it parses to +Infinity (IEEE double
 * overflow). JSON.stringify(Infinity) would serialize that field to `null`
 * instead, which isValidViewState already rejects on `typeof` alone, so a
 * round trip through JSON.stringify would fail this case for the wrong
 * reason. Building the payload text by hand is the only way to store an
 * actual non-finite number.
 */
function jsonWithNonFiniteZoomStep(): string {
  const sample = sampleViewState()
  const entries = (Object.keys(sample) as (keyof ViewState)[]).map((key) =>
    key === 'zoomStep'
      ? `"zoomStep":1e999`
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
    saveViewState({ ...DEFAULT_VIEW_STATE, zoomStep: 0 })
    expect(Object.keys(localStorage)).toEqual([VIEW_STATE_STORAGE_KEY])
    expect(loadViewState()).toEqual({ ...DEFAULT_VIEW_STATE, zoomStep: 0 })
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

  // data-model.md §2: the opening view is fit-to-day at the 100% rung
  // (contracts/ui-contract.md §Footer, `zoomLadder.ts`'s DEFAULT_ZOOM = 2).
  it('defaults to zoomStep 2 (the 100% rung) and fitting true', () => {
    expect(DEFAULT_VIEW_STATE.zoomStep).toBe(2)
    expect(DEFAULT_VIEW_STATE.fitting).toBe(true)
  })
})

// ──────────────────────────────────────────────
// Shared-reference safety
// ──────────────────────────────────────────────

describe('viewState shared-reference safety', () => {
  it('does not leak a mutation of one loadViewState() result into a later call', () => {
    const first = loadViewState()
    const originalZoomStep = first.zoomStep
    first.zoomStep = originalZoomStep + 1
    try {
      const second = loadViewState()
      expect(second.zoomStep).toBe(originalZoomStep)
    } finally {
      // Restore in case loadViewState() handed back a shared reference (the
      // defect this case targets) — keeps this case's failure from cascading
      // into unrelated cases later in the file.
      first.zoomStep = originalZoomStep
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
      const originalZoomStep = first.zoomStep
      first.zoomStep = originalZoomStep + 1
      const second = loadViewState()
      expect(second.zoomStep).toBe(originalZoomStep)
    } finally {
      getItemSpy.mockRestore()
    }
  })

  it('does not leak a mutation of one loadViewState() result into a later call when the stored value is malformed JSON', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, '{not valid json')
    const first = loadViewState()
    const originalZoomStep = first.zoomStep
    first.zoomStep = originalZoomStep + 1
    try {
      const second = loadViewState()
      expect(second.zoomStep).toBe(originalZoomStep)
    } finally {
      first.zoomStep = originalZoomStep
    }
  })

  it('does not leak a mutation of one loadViewState() result into a later call when the stored value fails shape validation', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    const first = loadViewState()
    const originalZoomStep = first.zoomStep
    first.zoomStep = originalZoomStep + 1
    try {
      const second = loadViewState()
      expect(second.zoomStep).toBe(originalZoomStep)
    } finally {
      first.zoomStep = originalZoomStep
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

  it('returns defaults wholesale when zoomStep is missing entirely', () => {
    const { zoomStep: _zoomStep, ...partial } = sampleViewState()
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(partial))
    expect(() => loadViewState()).not.toThrow()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when panel carries an unknown value', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), panel: 'bogus-panel' }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when panel is missing entirely', () => {
    const { panel: _panel, ...partial } = sampleViewState()
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, JSON.stringify(partial))
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when panelDocked is not a boolean', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), panelDocked: 'yes' }),
    )
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
// zoomStep / fitting are range- and type-checked, not just present
// ──────────────────────────────────────────────

describe('viewState range validation (zoomStep, fitting)', () => {
  it('returns defaults wholesale when zoomStep is not an integer', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), zoomStep: 2.5 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when zoomStep is negative', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), zoomStep: -1 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when zoomStep is 6 (one past the ladder\'s last rung)', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), zoomStep: 6 }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  // Number.isInteger(Infinity) is false, so the integer check above already
  // rejects it — this case is kept anyway (matching the old timeZoom/
  // timeScroll non-finite cases this file used to carry) so a future rewrite
  // of the integer check cannot silently stop covering it.
  it('returns defaults wholesale when zoomStep is +Infinity', () => {
    localStorage.setItem(VIEW_STATE_STORAGE_KEY, jsonWithNonFiniteZoomStep())
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when zoomStep is a string', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), zoomStep: '2' }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })

  it('returns defaults wholesale when fitting is not a boolean', () => {
    localStorage.setItem(
      VIEW_STATE_STORAGE_KEY,
      JSON.stringify({ ...sampleViewState(), fitting: 'true' }),
    )
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
  })
})

// ──────────────────────────────────────────────
// Round trip keeps the zoom fields specifically
// ──────────────────────────────────────────────

describe('viewState round trip keeps zoomStep and fitting', () => {
  it('reads back the same zoomStep and fitting that were written', () => {
    const written = { ...DEFAULT_VIEW_STATE, zoomStep: 5, fitting: false }
    saveViewState(written)
    const read = loadViewState()
    expect(read.zoomStep).toBe(5)
    expect(read.fitting).toBe(false)
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
