import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { CenterView, CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  saveViewState,
} from '../../../src/store/viewState.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T008 — the dimmed-invalid rule (FR-009, S2-contract.md §Center view
// and the dimmed-invalid rule): the center never blanks. While any derived
// finding is ERROR it keeps showing the last valid layout, dimmed, under a
// "Blocking findings" overlay listing each one.
//
// ERRORs here come from strips_total and days_available, both global rules
// that touch no competition — never from a competition's own fencer_count,
// which computePoolStructure (src/engine/pools.ts) throws on below 2, and
// deriveEventSchedule would run on the placed competition regardless of the
// dimmed rule under test.
//
// T040 made the matrix the center's default view. The rule under test is the
// same in either view — the dim marker, the overlay and the suppressed commit
// all sit outside the view switch — but the evidence a case reads differs:
// a case that proves content is *held* by reading schedule rows needs the
// table, and says so by calling showScheduleTable(). The cases that read only
// the dim marker or the overlay stay on the default matrix view, and so cover
// both views between them.

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

/** Puts the center on the schedule table, for a case whose evidence is a row. */
function showScheduleTable(): void {
  saveViewState({ ...DEFAULT_VIEW_STATE, viewMode: ViewMode.SCHEDULE })
}

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** Selects one competition and places it, so the center has something derived to show. */
function seedPlacedCompetition(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  seedValidConfig()
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 30 })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

function dimmedWrapper(): HTMLElement {
  const el = document.querySelector('[data-dimmed]')
  if (!el) throw new Error('CenterView did not render a [data-dimmed] wrapper')
  return el as HTMLElement
}

describe('CenterView valid state', () => {
  it('is not dimmed and shows no blocking-findings overlay', () => {
    // The undimmed content is read as the row bearing the competition id, so
    // this case wants the table.
    showScheduleTable()
    const id = seedPlacedCompetition()
    render(<CenterView />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()
  })
})

describe('CenterView with only a WARN finding', () => {
  it('stays undimmed with no blocking-findings overlay — WARN never blocks', () => {
    seedPlacedCompetition()
    render(<CenterView />)

    // days_available=5 is outside the recommended 2-4 day range: a WARN, not
    // an ERROR, so it must never trip the dimmed-invalid rule.
    act(() => {
      useStore.getState().setDays(5)
    })

    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()
  })
})

describe('CenterView cold boot into an already-invalid config (FR-009)', () => {
  it('shows the invalid derivation itself, dimmed, when first mounted into an invalid config', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    // The fallback content is a schedule row, and its absence would be
    // ScheduleOutput's own empty state: both live in the table.
    showScheduleTable()
    // strips_total stays at the initial store's 0 — an ERROR — so there is no
    // prior valid layout for the center to fall back to on mount. Mirrors a
    // shared URL landing straight on an invalid config.
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })

    render(<CenterView />)

    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
  })
})

describe('CenterView dimmed-invalid rule', () => {
  it('dims the center but keeps the previous rows on screen once a finding turns ERROR', () => {
    // "keeps the previous rows" is literally a row assertion.
    showScheduleTable()
    const id = seedPlacedCompetition()
    render(<CenterView />)
    expect(screen.getByText(id)).toBeInTheDocument()

    act(() => {
      useStore.getState().setStrips(0)
    })

    // The row is still on screen — never blanked — but dimmed.
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')

    const overlay = screen.getByRole('region', { name: 'Blocking findings' })
    expect(
      within(overlay).getByRole('heading', { name: 'Configuration is invalid' }),
    ).toBeInTheDocument()
    expect(overlay.textContent).toContain('strips_total: strips_total must be > 0')
    // review finding C: the overlay must be announced to assistive tech the
    // instant a config goes invalid, not just visible to sighted users.
    expect(overlay).toHaveAttribute('aria-live', 'assertive')
    expect(overlay).toHaveAttribute('aria-atomic', 'true')
  })

  it('lists one line per ERROR finding when more than one is present at once', () => {
    seedPlacedCompetition()
    render(<CenterView />)

    act(() => {
      useStore.getState().setStrips(0)
      // A scalar patch, not setDays(0) — seedValidConfig's setDays(3) already
      // built 3 dayConfigs, and setDays(0) would empty that array and change
      // what deriveEventSchedule's day lookups see. This isolates the second
      // ERROR to validateConfig's own days_available bounds check.
      useStore.setState({ days_available: 0 })
    })

    const overlay = screen.getByRole('region', { name: 'Blocking findings' })
    expect(overlay.textContent).toContain('strips_total: strips_total must be > 0')
    expect(overlay.textContent).toContain('days_available: days_available must be 1–14, got 0')
    // strips_total=0 and days_available=0 don't stay isolated to their own
    // two rules against this seeded (placed, same-population) competition —
    // strips_total=0 also trips resource_precondition (n_pools > 0 strips)
    // and days_available=0 also trips same_population (1 event > 0 days), so
    // four ERRORs land at once here, not two. Distinct <li> lines for all
    // four, not one <ul> whose textContent happens to concatenate them.
    expect(within(overlay).getAllByRole('listitem')).toHaveLength(4)
  })
})

describe('CenterView across an edit sequence', () => {
  it('holds content at every step of valid -> invalid -> valid, and never blanks', () => {
    // The held content is the id's row, checked at each of the three steps.
    showScheduleTable()
    const id = seedPlacedCompetition()
    render(<CenterView />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')

    act(() => {
      useStore.getState().setStrips(0)
    })
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')

    act(() => {
      useStore.getState().setStrips(12)
    })
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()
  })
})

// The suite above proves the dim and the overlay, both of which are driven by
// *live* findings and land synchronously. The suppression rule itself — that
// the CENTER_SETTLE_MS timer never replaces `committed` while a finding is
// ERROR — only shows up once that timer is given a chance to fire, which
// needs fake timers: on real timers (as above) the debounce simply never
// elapses inside the test, so a version of CenterView with the suppression
// guard deleted would pass every case above unnoticed.
describe('CenterView suppresses the settle-timer commit while blocking (FR-009)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  /** The row's cells in table order: id, day, pool start, pool end, DE start, DE end, strips. */
  function rowCells(id: string): string[] {
    const row = screen.getByText(id).closest('tr')
    if (!row) throw new Error(`no <tr> found for ${id}`)
    return within(row).getAllByRole('cell').map((cell) => cell.textContent ?? '')
  }

  it('still shows the pre-edit row after the settle timer elapses, not the ERROR-state one', () => {
    // rowCells compares the pre-edit and post-settle cell strings, which the
    // table is the only view that renders.
    showScheduleTable()
    const id = seedPlacedCompetition()
    render(<CenterView />)

    const before = rowCells(id)
    expect(before[3]).toBe('9:45') // pool end at strips_total=12
    expect(before[6]).toBe('5') // pool_strip_count at strips_total=12

    act(() => {
      // strips_total 12 -> 3: n_pools (5) > strips_total raises
      // resource_precondition, and also lowers the pool strip cap, so the
      // derived pool geometry actually changes (5 strips -> 2, pool end
      // 9:45 -> 13:15) — a dirty edit, not one the debounce would have
      // reproduced unchanged anyway.
      useStore.getState().setStrips(3)
    })

    // Dim + overlay track live findings and land on this same render.
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')
    const overlay = screen.getByRole('region', { name: 'Blocking findings' })
    expect(overlay.textContent).toContain('resource_precondition')
    expect(overlay.textContent).toContain('requires 5 strips for pools but only 3 total strips configured')

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS + 10)
    })

    // Past the settle point, still the pre-edit row — never replaced by the
    // ERROR-state derived values (pool_strip_count 2, pool end 13:15).
    expect(rowCells(id)).toEqual(before)
  })

  it('catches up once the config is valid again, so the freeze above is not permanent', () => {
    // Same cell-by-cell evidence as the case above.
    showScheduleTable()
    const id = seedPlacedCompetition()
    render(<CenterView />)

    const before = rowCells(id)

    act(() => {
      useStore.getState().setStrips(3)
    })
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS + 10)
    })
    expect(rowCells(id)).toEqual(before) // still suppressed, as above

    act(() => {
      // A different valid strip count than the seeded 12 (not a round trip
      // back to `before`'s own numbers), so a center that is simply frozen
      // forever on the first committed row cannot satisfy this case.
      useStore.getState().setStrips(6)
    })
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS + 10)
    })

    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()

    const after = rowCells(id)
    expect(after).not.toEqual(before)
    expect(after[3]).toBe('11:30') // pool end at strips_total=6
    expect(after[6]).toBe('4') // pool_strip_count at strips_total=6
  })
})
