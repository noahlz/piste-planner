import { describe, it, expect, beforeEach } from 'vitest'
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
    viewMode: ViewMode.MATRIX,
    rowHeightStep: RowHeightStep.TALL,
    timeZoom: 3,
    timeScroll: 165,
    rowScroll: 42,
    drawerHeight: 280,
    scorecardExpanded: true,
  }
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
// Defaults when absent
// ──────────────────────────────────────────────

describe('viewState defaults', () => {
  it('returns DEFAULT_VIEW_STATE when the key is absent', () => {
    expect(localStorage.getItem(VIEW_STATE_STORAGE_KEY)).toBeNull()
    expect(loadViewState()).toEqual(DEFAULT_VIEW_STATE)
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
})

// ──────────────────────────────────────────────
// Untouched by serializeState (research D10)
// ──────────────────────────────────────────────

describe('viewState is absent from the serialized tournament payload', () => {
  it('never appears in serializeState output, under default or non-default view state', () => {
    saveViewState(sampleViewState())
    const state = populatedState()
    const json = serializeState(state)

    for (const field of Object.keys(DEFAULT_VIEW_STATE)) {
      expect(json).not.toContain(`"${field}"`)
    }
  })
})
