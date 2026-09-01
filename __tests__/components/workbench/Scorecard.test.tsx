import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Scorecard } from '../../../src/components/workbench/Scorecard.tsx'
import { Drawer } from '../../../src/components/workbench/Drawer.tsx'
import { useStore } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { serializeState } from '../../../src/store/serialization.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  loadViewState,
  saveViewState,
} from '../../../src/store/viewState.ts'

// 004 T046 — the scorecard (US3, FR-025/FR-029, ui-contract.md §Scorecard,
// research D9). The rules this file exists to hold:
//
//   - collapsed shows two metrics and expanded shows all of them, so the set
//     of rendered `data-metric` ids is asserted exactly, in contract order,
//     in both states — never "at least two exist";
//   - a loaded preset gives every metric a delta from the frozen baseline,
//     and no preset gives *no delta element at all* (research D9), which is
//     not the same as a zero delta;
//   - there is no aggregate score in either state (FR-025);
//   - hover and keyboard focus both name the driving blocks (FR-029).
//
// Every value below is a literal taken from the B1 preset through the
// *existing* selectors (selectDerivedSchedule / selectDerivedRefRequirements /
// selectDerivedFindings), not recomputed from the component's own arithmetic.
// Where each came from is recorded beside it.

// ── B1, auto-scheduled: 4 days, 80 strips, 24 events, all 24 placed in range.
const B1_FINISH_TOURNAMENT = '17:17' // max de_total_end = 1037 → formatMinutes
const B1_FINISH_BY_DAY = ['16:02', '17:17', '16:17', '15:43'] // 962 / 1037 / 977 / 943
const B1_PEAK_TOTAL = '220' // max peak_total_refs over the four ref rows
const B1_PEAK_SABRE = '76' // max peak_saber_refs (day 2), from the same rows
const B1_UTILIZATION = '41.4%' // 111196 strip-min used ÷ 268800 available
const B1_BALANCE_SPREAD = '9.8%' // day utilizations 46.857 (max) − 37.021 (min)
const B1_FINDINGS = { ERROR: '0', WARN: '16', INFO: '12' }
// 0 validation errors; 12 WARN de_video_policy + 4 WARN STRIP_CONTENTION;
// 12 INFO CUT_SUMMARY.

// ── B1 with strips cut to 20, placements unchanged: the findings move.
const B1_STRIPS20_FINDINGS = { ERROR: '10', WARN: '29', INFO: '12' }
// +10 ERROR resource_precondition, +13 WARN (STRIP_DEFICIT_NO_FLIGHTING),
// INFO unchanged — so the deltas are +10, +13 and zero respectively.

const COLLAPSED_IDS = ['finish:tournament', 'refs:peak-total']

const B1_EXPANDED_IDS = [
  'finish:tournament',
  'refs:peak-total',
  'finish:day:0',
  'finish:day:1',
  'finish:day:2',
  'finish:day:3',
  'refs:peak-sabre',
  'strips:utilization',
  'days:balance-spread',
  'findings:ERROR',
  'findings:WARN',
  'findings:INFO',
]

/** Loads B1 the way boot() does: applyPreset then runScheduleAll (the point
 *  at which the baseline freezes — see the S6 brief §1). */
function loadB1(): void {
  applyPreset('B1')
  runScheduleAll()
}

/** A placed tournament reached without applyPreset — the shared-link case
 *  D9 calls "no preset". 2 days, so the per-day rows cannot be 4 by accident. */
function loadWithoutPreset(): void {
  const state = useStore.getState()
  state.setDays(2)
  state.setStrips(24)
  state.setVideoStrips(4)
  state.applyTemplate('RYC Weekend')
  runScheduleAll()
}

function scorecard(): HTMLElement {
  return screen.getByRole('region', { name: 'Scorecard' })
}

function disclosure(): HTMLElement {
  return screen.getByRole('button', { name: 'Scorecard details' })
}

function metricIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-metric]')].map((el) => el.getAttribute('data-metric') ?? '')
}

function row(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`[data-metric="${id}"]`)
  if (!el) throw new Error(`no metric row ${id}; present: ${metricIds(root).join(', ')}`)
  return el as HTMLElement
}

/** Collapses the whitespace a formatter may or may not put around a value. */
function norm(el: Element | null): string | null {
  if (!el) return null
  return (el.textContent ?? '').replace(/\s+/g, '')
}

function valueOf(root: HTMLElement, id: string): string | null {
  return norm(row(root, id).querySelector('[data-metric-value]'))
}

function deltaOf(root: HTMLElement, id: string): string | null {
  return norm(row(root, id).querySelector('[data-metric-delta]'))
}

// jsdom 26 ships no PointerEvent constructor, and React 19 does not listen for
// `pointerenter` at all: onPointerEnter/onPointerLeave are synthesised from
// delegated `pointerover`/`pointerout`. A probe component built before this
// file confirmed it — dispatching a bare `pointerenter` MouseEvent fired no
// handler, while `pointerover` with a null relatedTarget fired onPointerEnter.
// So drive the events React actually attaches, not the ones the prop is named
// after. (@testing-library/react's fireEvent.pointerEnter does the same
// remapping internally; doing it here keeps the reason visible.)
function pointerEnter(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: null }))
  })
}

function pointerLeave(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: null }))
  })
}

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

describe('Scorecard collapsed and expanded sets (ui-contract §Scorecard)', () => {
  it('renders exactly the two collapsed-tier metrics, in contract order, and none of the expanded ones', () => {
    loadB1()
    render(<Scorecard />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    // Exact and ordered: "two rows exist" would still pass if the collapsed
    // tier leaked a third metric or swapped one for another.
    expect(metricIds(scorecard())).toEqual(COLLAPSED_IDS)

    for (const id of COLLAPSED_IDS) {
      expect(row(scorecard(), id).querySelector('[data-metric-label]')).not.toBeNull()
      expect(row(scorecard(), id).querySelector('[data-metric-value]')).not.toBeNull()
    }
  })

  it('expands to every metric, one finish row per day, in contract order, under a stable button name', () => {
    loadB1()
    render(<Scorecard />)

    fireEvent.click(disclosure())

    // The accessible name does not change with the state — aria-expanded does
    // (S6 brief §4). getByRole would throw here if the label flipped to
    // "Collapse scorecard".
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(metricIds(scorecard())).toEqual(B1_EXPANDED_IDS)
  })

  it('renders no aggregate score in either state (FR-025)', () => {
    loadB1()
    render(<Scorecard />)

    expect(new Set(metricIds(scorecard()))).toEqual(new Set(COLLAPSED_IDS))
    expect(scorecard().textContent).not.toMatch(/\bscore\b/i)
    expect(scorecard().textContent).not.toMatch(/\boverall\b/i)

    fireEvent.click(disclosure())

    expect(new Set(metricIds(scorecard()))).toEqual(new Set(B1_EXPANDED_IDS))
    expect(scorecard().textContent).not.toMatch(/\bscore\b/i)
    expect(scorecard().textContent).not.toMatch(/\boverall\b/i)
  })
})

describe('Scorecard values against the B1 preset', () => {
  it('renders each metric formatted by its kind, from the derived schedule', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())
    const card = scorecard()

    expect(valueOf(card, 'finish:tournament')).toBe(B1_FINISH_TOURNAMENT)
    B1_FINISH_BY_DAY.forEach((expected, day) => {
      expect(valueOf(card, `finish:day:${day}`)).toBe(expected)
    })
    expect(valueOf(card, 'refs:peak-total')).toBe(B1_PEAK_TOTAL)
    expect(valueOf(card, 'refs:peak-sabre')).toBe(B1_PEAK_SABRE)
    expect(valueOf(card, 'strips:utilization')).toBe(B1_UTILIZATION)
    expect(valueOf(card, 'days:balance-spread')).toBe(B1_BALANCE_SPREAD)
    expect(valueOf(card, 'findings:ERROR')).toBe(B1_FINDINGS.ERROR)
    expect(valueOf(card, 'findings:WARN')).toBe(B1_FINDINGS.WARN)
    expect(valueOf(card, 'findings:INFO')).toBe(B1_FINDINGS.INFO)
  })
})

describe('Scorecard deltas (research D9)', () => {
  it('gives every metric a delta once a preset is loaded, and moves it when the numbers move', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())

    // First frame: the baseline is the state that was just captured, so every
    // delta is present and zero. Presence alone proves nothing about the
    // arithmetic — the edit below is what does.
    for (const id of B1_EXPANDED_IDS) {
      expect(deltaOf(scorecard(), id)).not.toBeNull()
    }

    // Cutting strips leaves the placements alone (no re-schedule) and moves
    // the findings: 10 resource_precondition errors and 13 more warnings
    // appear, while the 12 CUT_SUMMARY infos do not move.
    act(() => {
      useStore.getState().setStrips(20)
    })
    const card = scorecard()

    expect(valueOf(card, 'findings:ERROR')).toBe(B1_STRIPS20_FINDINGS.ERROR)
    expect(valueOf(card, 'findings:WARN')).toBe(B1_STRIPS20_FINDINGS.WARN)
    expect(valueOf(card, 'findings:INFO')).toBe(B1_STRIPS20_FINDINGS.INFO)

    // The baseline is frozen at load, so these are deltas against 0 and 16,
    // not against the previous render.
    expect(deltaOf(card, 'findings:ERROR')).toBe('+10')
    expect(deltaOf(card, 'findings:WARN')).toBe('+13')
    // A metric that did not move still shows a delta, and it reads zero. The
    // sign a zero carries is not fixed by the contract, so only the magnitude
    // is asserted.
    expect((deltaOf(card, 'findings:INFO') ?? '').replace(/^[+−-]/, '')).toBe('0')
  })

  it('renders no delta element at all when no preset was loaded, collapsed or expanded', () => {
    loadWithoutPreset()
    // Precondition, not the assertion: this fixture reached a placed schedule
    // without applyPreset, which is what leaves the baseline uncaptured.
    expect(useStore.getState().loadedPresetId).toBeNull()
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)

    render(<Scorecard />)

    // Absent, not zero (D9). jsdom does no layout, so this is asserted as the
    // elements not being in the DOM — a hidden or zero-width delta would still
    // be found by querySelectorAll.
    expect(scorecard().querySelectorAll('[data-metric-delta]')).toHaveLength(0)

    fireEvent.click(disclosure())

    expect(scorecard().querySelectorAll('[data-metric-delta]')).toHaveLength(0)
    // Two days here, four in B1: the per-day rows follow days_available.
    expect(metricIds(scorecard())).toEqual([
      'finish:tournament',
      'refs:peak-total',
      'finish:day:0',
      'finish:day:1',
      'refs:peak-sabre',
      'strips:utilization',
      'days:balance-spread',
      'findings:ERROR',
      'findings:WARN',
      'findings:INFO',
    ])
  })
})

describe('Scorecard hover names the driving blocks (FR-029)', () => {
  it('sets the hovered metric id on pointer enter and clears it on leave', () => {
    loadB1()
    render(<Scorecard />)

    const finish = row(scorecard(), 'finish:tournament')
    pointerEnter(finish)
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')

    pointerLeave(finish)
    expect(useStore.getState().hoveredMetricId).toBeNull()

    // A second, different row: a handler that wrote one hard-coded id would
    // pass the first half of this case.
    const refs = row(scorecard(), 'refs:peak-total')
    pointerEnter(refs)
    expect(useStore.getState().hoveredMetricId).toBe('refs:peak-total')

    pointerLeave(refs)
    expect(useStore.getState().hoveredMetricId).toBeNull()
  })

  it('does the same on focus and blur, which is what makes it reachable by keyboard', () => {
    loadB1()
    render(<Scorecard />)

    const refs = row(scorecard(), 'refs:peak-total')
    // Without a tabindex the row is not focusable at all and FR-029 has no
    // keyboard path, so the attribute is part of the contract, not styling.
    expect(refs).toHaveAttribute('tabindex', '0')

    act(() => {
      refs.focus()
    })
    expect(document.activeElement).toBe(refs)
    expect(useStore.getState().hoveredMetricId).toBe('refs:peak-total')

    act(() => {
      refs.blur()
    })
    expect(useStore.getState().hoveredMetricId).toBeNull()

    const finish = row(scorecard(), 'finish:tournament')
    act(() => {
      finish.focus()
    })
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')
  })
})

describe('Scorecard expansion is a viewer preference (T051, research D10)', () => {
  it('opens in the expansion the viewer last stored', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, scorecardExpanded: true })
    loadB1()
    render(<Scorecard />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(metricIds(scorecard())).toEqual(B1_EXPANDED_IDS)
  })

  it('writes the expansion back merged with the view state it does not own', () => {
    // Drawer.tsx's precedent: read the whole stored state, spread it, change
    // one field. Writing a fresh object would silently reset every one of
    // these, none of which the scorecard owns.
    saveViewState({
      ...DEFAULT_VIEW_STATE,
      viewMode: 'schedule',
      rowHeightStep: 'tall',
      timeZoom: 3,
      timeScroll: 900,
      rowScroll: 7,
      drawerHeight: 321,
      scorecardExpanded: false,
    })
    loadB1()
    render(<Scorecard />)

    fireEvent.click(disclosure())

    const stored = loadViewState()
    expect(stored.scorecardExpanded).toBe(true)
    expect(stored.viewMode).toBe('schedule')
    expect(stored.rowHeightStep).toBe('tall')
    expect(stored.timeZoom).toBe(3)
    expect(stored.timeScroll).toBe(900)
    expect(stored.rowScroll).toBe(7)
    expect(stored.drawerHeight).toBe(321)

    // And collapsing again writes the other way, rather than only ever
    // latching to true.
    fireEvent.click(disclosure())
    expect(loadViewState().scorecardExpanded).toBe(false)
    expect(loadViewState().drawerHeight).toBe(321)
  })

  it('keeps the expansion out of a shared link (ui-contract §Serialization)', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())
    expect(loadViewState().scorecardExpanded).toBe(true)

    const serialized = JSON.parse(serializeState(useStore.getState())) as unknown
    expect(JSON.stringify(serialized)).not.toContain('scorecardExpanded')
    expect(JSON.stringify(serialized)).not.toContain('scorecardBaseline')
    expect(JSON.stringify(serialized)).not.toContain('hoveredMetricId')
  })
})

describe('the drawer holds the scorecard and the findings list (FR-006)', () => {
  it('renders both at a small drawer height', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, drawerHeight: 96 })
    loadB1()
    render(<Drawer />)

    const drawer = screen.getByRole('region', { name: 'Drawer' })
    expect(drawer).toContainElement(scorecard())
    expect(screen.getByText('Analysis Output')).toBeInTheDocument()
  })

  it('renders both at a large drawer height', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, drawerHeight: 640 })
    loadB1()
    render(<Drawer />)

    const drawer = screen.getByRole('region', { name: 'Drawer' })
    expect(drawer).toContainElement(scorecard())
    expect(screen.getByText('Analysis Output')).toBeInTheDocument()
  })
})
