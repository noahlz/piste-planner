import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { FencerCounts } from '../../../src/components/sections/FencerCounts.tsx'
import { AnalysisOutput } from '../../../src/components/sections/AnalysisOutput.tsx'
import { CenterView, CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  ViewMode,
  saveViewState,
} from '../../../src/store/viewState.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T009 — two-tier recompute (FR-008, S2-contract.md §Center view and the
// dimmed-invalid rule): findings follow every keystroke, the center
// relayouts only once CENTER_SETTLE_MS has elapsed with no further edit.
// vi.useFakeTimers() drives that gap deterministically instead of a real
// 150ms sleep — real timers would make this test either slow or flaky.
//
// Every edit here must leave the config *valid*, or T008's dimmed rule
// engages and freezes the center by design, making this test vacuous. That
// rules out driving one competition over the strip count: validateConfig's
// resource_precondition rule (src/engine/validation.ts) is a `policy` finding,
// which is ERROR in BINDING mode as soon as a single competition's n_pools
// exceeds strips_total. So the WARN under test is reached the other way — two
// competitions sharing day 1, each individually within the 12 strips, summing
// past them. initialAnalysis's pass-0 capacity bottleneck sums pools per day
// and is only ever WARN.
//
// Pool counts, at 12 strips and the 0.80 max_pool_strip_pct that gives a
// 9-strip pass-1 cap:
//   60 fencers -> 9 pools   (the companion: at the cap, so silent throughout)
//    8 fencers -> 1 pool    (day total 10 — no warning yet)
//   40 fencers -> 6 pools   (day total 15 — pass-0 WARN, no ERROR)
//   45 fencers -> 7 pools   (day total 16 — pass-0 WARN, no ERROR)

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
  vi.useFakeTimers()
})

/** Puts the center on the schedule table, whose cells are the two tiers'
 *  evidence in the first two cases below. On T040's default matrix view those
 *  cases could not tell a deferred relayout from no relayout at all: with no
 *  ResizeObserver the canvas measures 0x0, draws nothing, and its textContent
 *  is the toolbar's — constant across every edit, so the "has not relayouted
 *  yet" half would pass without the debounce existing. The third case installs
 *  an observer and asserts on the matrix instead. */
function showScheduleTable(): void {
  saveViewState({ ...DEFAULT_VIEW_STATE, viewMode: ViewMode.SCHEDULE })
}

afterEach(() => {
  vi.useRealTimers()
})

/** The rail's fencer-count edit, the drawer's findings, and the center — each
 *  wrapped so a before/after textContent snapshot can be scoped to one region. */
function RecomputeHost() {
  return (
    <>
      <div data-testid="fencer-counts">
        <FencerCounts />
      </div>
      <div data-testid="drawer">
        <AnalysisOutput />
      </div>
      <div data-testid="center">
        <CenterView />
      </div>
    </>
  )
}

/** The competition under test, plus a fixed companion sharing its day so the
 *  day's pool total can cross the strip count without either event alone
 *  tripping validateConfig's per-competition ERROR. */
function seedPlacedCompetitions(fencerCount: number): string {
  const id = TEMPLATES['RYC Weekend'][0]
  const companionId = TEMPLATES['RYC Weekend'][1]
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: fencerCount })
  useStore.getState().addCompetition(companionId)
  useStore.getState().updateCompetition(companionId, { fencer_count: 60 })
  useStore.getState().setPlacementsFromAuto({
    [id]: makePlacement({ strip_count: 5 }),
    [companionId]: makePlacement({ strip_count: 5 }),
  })
  return id
}

/** The one fencer-count input belonging to `id` — FencerCounts renders one per
 *  selected competition, so the shared /Fencer count for/ regex is ambiguous here. */
function fencerInput(id: string): HTMLElement {
  const entry = findCompetition(id)
  const label = entry ? competitionLabel(entry) : id
  return screen.getByRole('spinbutton', { name: `Fencer count for ${label}` })
}

/** `id`'s row in the center's schedule table: id, day, pool start, pool end,
 *  DE start, DE end, strips, finish — the same cell order CenterView's own
 *  suite reads. */
function centerRowCells(id: string): string[] {
  const row = screen.getByText(id).closest('tr')
  if (!row) throw new Error(`no <tr> found for ${id}`)
  return within(row).getAllByRole('cell').map((cell) => cell.textContent ?? '')
}

describe('two-tier recompute', () => {
  it('a fencer-count keystroke moves the drawer immediately; the center follows only after CENTER_SETTLE_MS', () => {
    showScheduleTable()
    // 8 fencers -> 1 pool, and 9 for the companion: 10 pools on day 1, under
    // the 12 strips seeded below, so no capacity warning yet.
    const id = seedPlacedCompetitions(8)
    render(<RecomputeHost />)

    const drawer = screen.getByTestId('drawer')
    const center = screen.getByTestId('center')
    expect(drawer.textContent).not.toMatch(/strips available/)
    const centerBefore = center.textContent

    const input = fencerInput(id)
    act(() => {
      // 45 fencers -> ceil(45/7) = 7 pools, taking day 1 to 16 against 12
      // strips — a WARN bottleneck, not a validation ERROR, since neither
      // competition alone exceeds 12. commitOnChange means this needs no blur
      // to reach the store.
      fireEvent.change(input, { target: { value: '45' } })
    })

    // The store and the drawer already reflect the new value — no blur, no
    // timer advance.
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(45)
    expect(drawer.textContent).toMatch(/pools assigned but only 12 strips available/)

    // The center has not relayouted yet — same text as before the edit.
    expect(center.textContent).toBe(centerBefore)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS)
    })

    // Only now does the center pick up the new pool/DE structure — not just
    // any change, but the 7-pool structure 45 fencers actually derives to
    // (pool end 12:06, DE 12:40-16:37, 5 strips, up from 1 at 8 fencers).
    expect(center.textContent).not.toBe(centerBefore)
    const cells = centerRowCells(id)
    expect(cells[3]).toBe('12:06') // pool end
    expect(cells[4]).toBe('12:40') // DE start
    // T040 split the old single DE End column in two: de_end, the last minute
    // the scheduler actually places, and de_total_end with the 30-minute medal
    // tail on top of it. 16:37 was the old column's value and is now Finish's.
    expect(cells[5]).toBe('16:07') // DE end
    expect(cells[6]).toBe('5') // pool_strip_count
    expect(cells[7]).toBe('16:37') // finish, de_total_end
  })

  it('restarts the settle timer on a second edit rather than relayouting at the first deadline', () => {
    showScheduleTable()
    const id = seedPlacedCompetitions(8)
    render(<RecomputeHost />)

    const center = screen.getByTestId('center')
    const centerBefore = center.textContent
    const input = fencerInput(id)

    act(() => {
      fireEvent.change(input, { target: { value: '40' } })
    })
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    // Short of the deadline — still the pre-edit layout.
    expect(center.textContent).toBe(centerBefore)

    act(() => {
      fireEvent.change(input, { target: { value: '45' } })
    })
    // The second edit restarted the debounce — advancing only the remaining
    // 10ms from the first edit must not be enough to relayout.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(center.textContent).toBe(centerBefore)
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(45)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    // Settles on the second edit's value (45), the same 7-pool structure the
    // first case lands on — never the first edit's (40) intermediate one.
    expect(center.textContent).not.toBe(centerBefore)
    const cells = centerRowCells(id)
    expect(cells[3]).toBe('12:06') // pool end
    expect(cells[4]).toBe('12:40') // DE start
    expect(cells[5]).toBe('16:07') // DE end, as above
    expect(cells[6]).toBe('5') // pool_strip_count
    expect(cells[7]).toBe('16:37') // finish, de_total_end
  })
})

/**
 * T040 — the same two tiers, with the matrix in the center.
 *
 * The cases above prove the debounce through the schedule table, which reaches
 * `CenterView`'s committed model by `ScheduleOutput`'s own prop. The canvas
 * reaches it by a second prop, and it has a live store subscription of its own
 * to fall back on when that prop is absent — so a `CenterView` handing it
 * `live` instead of `committed` would keep every case above green while the
 * default view relayouted on every keystroke.
 */
describe('two-tier recompute with the matrix in the center (FR-008, FR-023)', () => {
  const VIEWPORT_WIDTH = 900
  const VIEWPORT_HEIGHT = 480

  class StubResizeObserver {
    callback: ResizeObserverCallback

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback
    }

    observe(): void {
      this.callback(
        [
          {
            contentRect: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
          } as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      )
    }

    unobserve(): void {}
    disconnect(): void {}
  }

  const originalResizeObserver = globalThis.ResizeObserver

  beforeEach(() => {
    // jsdom ships no ResizeObserver, and an unmeasured canvas draws no blocks
    // at all — every assertion below would then read `undefined` both before
    // and after the settle.
    globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
    // 828px of plot from 08:00 at 1 min/px spans [480, 1308), past every block
    // the fixture places. The view stays MATRIX, which is the default.
    saveViewState({ ...DEFAULT_VIEW_STATE, timeScroll: 480 })
  })

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver
  })

  /** The last minute of one drawn block, or null when it is not drawn. */
  function blockEnd(id: string, phase: string): number | null {
    const el = document.querySelector<HTMLElement>(
      `[data-event-id="${id}"][data-phase="${phase}"]`,
    )
    return el ? Number(el.dataset.end) : null
  }

  it('holds the drawn blocks at their pre-edit geometry until the settle, then moves them', () => {
    const id = seedPlacedCompetitions(8)
    render(<CenterView />)

    const poolEndBefore = blockEnd(id, 'POOLS')
    expect(poolEndBefore, 'the canvas drew nothing to compare').not.toBeNull()

    act(() => {
      useStore.getState().updateCompetition(id, { fencer_count: 45 })
    })

    // The edit reached the store, so what follows is about the canvas holding
    // its geometry rather than about the edit not having landed. (No drawer is
    // rendered here — this case mounts CenterView alone.)
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(45)
    expect(blockEnd(id, 'POOLS')).toBe(poolEndBefore)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS)
    })

    // 726 is 12:06 and 967 is 16:07 — the same pool end and DE end the table
    // cases above read off this fixture, so the two views agree (FR-023).
    expect(poolEndBefore).not.toBe(726)
    expect(blockEnd(id, 'POOLS')).toBe(726)
    expect(blockEnd(id, 'DE')).toBe(967)
  })

  /**
   * jsdom 26 ships no `PointerEvent` constructor, so testing-library's
   * `pointerMove` degrades to a bare `Event` and drops the coordinates. The
   * event name is what React dispatches on, so a `MouseEvent` carries them.
   */
  function firePointerMove(el: Element, clientX: number, clientY: number): void {
    el.dispatchEvent(
      new MouseEvent('pointermove', { clientX, clientY, bubbles: true, cancelable: true }),
    )
  }

  it('holds a block’s findings at the committed model too, not just its geometry', () => {
    // The case above covers the `schedule` prop. The findings travel by a
    // second prop and the canvas has a live subscription to fall back on when
    // one is absent, so a CenterView handing it `liveFindings` would keep every
    // other case green while a block's tooltip described a tournament state its
    // own rectangle did not come from.
    //
    // The warning has to be one that attaches to a block: analysis.ts's
    // day-level capacity warning carries an empty competition_id and reaches no
    // block at all. This is the per-competition STRIP_DEFICIT_NO_FLIGHTING —
    // 70 fencers is 10 pools against the 9-strip cap 12 strips gives, and 10 is
    // still inside strips_total, so validateConfig raises no ERROR and the
    // center goes on committing.
    const id = seedPlacedCompetitions(8)
    render(<CenterView />)

    const block = document.querySelector<HTMLElement>(
      `[data-event-id="${id}"][data-phase="POOLS"]`,
    )
    if (!block) throw new Error('the canvas drew no pool block to hover')
    const centreX = 72 + parseFloat(block.style.left) + parseFloat(block.style.width) / 2
    const centreY = 38 + parseFloat(block.style.top) + parseFloat(block.style.height) / 2
    const viewport = document.querySelector('[data-canvas-viewport]')
    if (!viewport) throw new Error('the canvas rendered no viewport')

    act(() => {
      firePointerMove(viewport, centreX, centreY)
    })
    const findings = (): string =>
      document.querySelector('[data-tooltip-field="findings"]')?.textContent ?? ''
    expect(findings()).toBe('No findings')

    act(() => {
      useStore.getState().updateCompetition(id, { fencer_count: 70 })
    })

    expect(findings(), 'the tooltip must not run ahead of its own geometry').toBe('No findings')

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS)
    })

    expect(findings()).toContain('10 pools but only 9 strips available')
  })
})
