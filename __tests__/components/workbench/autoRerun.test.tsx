/**
 * 020 T2 – the board re-runs itself, behind the flag. `useAutoRerun` debounces
 * `RERUN_DEBOUNCE_MS` on the config key while a re-run is due, re-checks the
 * rule when its timer fires and runs Auto-assign once. "Updating…" shows once
 * the board has waited `RERUN_INDICATOR_DELAY_MS` for it (R1). `CenterView`
 * holds the last fresh board while due, commits a pending settle at once when
 * due rises (R8), and hides the stale banner while due or once the live model
 * is fresh again.
 *
 * Each case starts from B1 after a run, with the switch turned on by hand:
 * only `bootstrap` turns it on in the app, and these tests never boot. The
 * engine is the real one behind a pass-through spy, so a run is counted
 * without changing what it places (`runActions.test.ts`).
 */
import { StrictMode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { CenterView, CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { EventsPanel } from '../../../src/components/workbench/panels/EventsPanel.tsx'
import { StatusFooter } from '../../../src/components/workbench/StatusFooter.tsx'
import { ToolRail } from '../../../src/components/workbench/ToolRail.tsx'
import {
  RERUN_DEBOUNCE_MS,
  RERUN_INDICATOR_DELAY_MS,
} from '../../../src/components/workbench/useAutoRerun.ts'
import { useStore } from '../../../src/store/store.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { applyLoadedState } from '../../../src/store/exportActions.ts'
import {
  RunState,
  selectAllFindings,
  selectDrawnSchedule,
  selectFindings,
  selectFooterMetrics,
  selectHasBlocking,
  selectPlacementCounts,
} from '../../../src/store/derived.ts'
import type { Finding, FooterMetric, PlacementCounts } from '../../../src/store/derived.ts'
import { VIEW_STATE_STORAGE_KEY, ViewMode } from '../../../src/store/viewState.ts'
import { scheduleAll } from '../../../src/engine/scheduler.ts'
import { findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/lib/competitionLabels.ts'
import { formatClock } from '../../../src/lib/time.ts'
import { moveDay, runAndMoveHeadline, runPreset } from '../../helpers/drawnFixtures.ts'
import { installStubResizeObserver } from '../../helpers/resizeObserver.ts'

vi.mock('../../../src/engine/scheduler.ts', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../../src/engine/scheduler.ts')>()
  return { ...mod, scheduleAll: vi.fn(mod.scheduleAll) }
})

/** B1's Veteran women's foil, 40 fencers: placed, and not the event the headline move shifts. */
const VET = 'VET-W-FOIL-IND-VCMB'
const STALE_ROW_ID = 'stale:run'
const ZOOM = { zoomStep: 2, fitting: false }
/** B1 after the headline move, fresh (T1c's premise), and the same board once the mover is re-seated. */
const MOVED_COUNTS: PlacementCounts = { placed: 23, unplaced: 1, pinned: 1 }
const RESEATED_COUNTS: PlacementCounts = { placed: 24, unplaced: 0, pinned: 1 }

let restoreResizeObserver: () => void

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState(), true)
  // A reset, not a clear: it also drops a throwing implementation test 4 left
  // unconsumed, and vitest 3 restores the pass-through `vi.fn` was given.
  vi.mocked(scheduleAll).mockReset()
  // `requestAnimationFrame` too: the late-fire path waits a frame before it runs.
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'Date',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  })
  restoreResizeObserver = installStubResizeObserver(900, 480)
})

afterEach(() => {
  restoreResizeObserver()
  vi.useRealTimers()
})

// ──────────────────────────────────────────────
// Fixtures and readers
// ──────────────────────────────────────────────

/** B1 after a run, the engine count reset, and the switch set. */
function runB1(autoRerun = true): void {
  runPreset('B1')
  vi.mocked(scheduleAll).mockClear()
  useStore.getState().setAutoRerun(autoRerun)
}

function runs(): number {
  return vi.mocked(scheduleAll).mock.calls.length
}

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function edit(change: () => void): void {
  act(change)
}

function setVet(count: number): void {
  edit(() => useStore.getState().updateCompetition(VET, { fencer_count: count }))
}

/**
 * After an edit, a late debounce taken up to its last wait: the clock jumps
 * 600 ms with no timer firing, the debounce reveals "Updating…" and requests a
 * frame, and the frame fires and arms the `setTimeout(0)`, which has not run.
 * The fake clock gives a zero delay armed inside a tick 1 ms, so `advance(1)`
 * fires it.
 */
function intoLateYield(): void {
  vi.setSystemTime(Date.now() + 600)
  advance(RERUN_DEBOUNCE_MS)
  expect(indicator(), 'premise: in the late-fire wait').not.toBeNull()
  act(() => {
    vi.advanceTimersToNextTimer()
  })
}

function centerView(viewMode: ViewMode = ViewMode.MATRIX) {
  return (
    <CenterView viewMode={viewMode} zoom={ZOOM} detailCollapsed={false} onToggleDetailCollapsed={() => {}} />
  )
}

function centerMain(): HTMLElement {
  return screen.getByRole('main', { name: 'Center view' })
}

function rerunAttr(): string | null {
  return centerMain().getAttribute('data-rerun')
}

function settledAttr(): string | null {
  return centerMain().getAttribute('data-settled')
}

function banner(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-stale-banner]')
}

function indicator(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-rerun-indicator]')
}

/** What the board itself draws, banner and notices left out. */
function boardText(): string {
  return document.querySelector('[data-dimmed]')?.textContent ?? ''
}

function hasStaleRow(): boolean {
  return selectFindings(useStore.getState()).some((row) => row.id === STALE_ROW_ID)
}

function isUnplacedRow(row: Finding): boolean {
  return row.id.startsWith('unplaced:')
}

function unplacedRowIds(): string[] {
  return selectFindings(useStore.getState()).filter(isUnplacedRow).map((row) => row.id)
}

function countsText(counts: PlacementCounts): string {
  return `${counts.placed} placed · ${counts.unplaced} unplaced · ${counts.pinned} pinned`
}

function footerCounts(): string {
  return document.querySelector('[data-counts]')?.textContent ?? ''
}

const METRIC_IDS = { finish: 'finish:tournament', refs: 'refs:peak-total', strips: 'strips:utilization' } as const

/** The three metric values as the footer prints them, from the selector's own rows. */
function metricTexts(metrics: FooterMetric[]): string[] {
  const value = (id: string) => metrics.find((m) => m.id === id)?.value ?? null
  const finish = value(METRIC_IDS.finish)
  const refs = value(METRIC_IDS.refs)
  const strips = value(METRIC_IDS.strips)
  return [
    finish === null ? '—' : formatClock(finish),
    refs === null ? '—' : String(Math.round(refs)),
    strips === null ? '—' : `${strips.toFixed(1)}%`,
  ]
}

/** The three metric values the footer shows. */
function footerMetrics(): string[] {
  return (['finish', 'refs', 'strips'] as const).map(
    (name) => document.querySelector(`[data-metric="${name}"] .font-mono`)?.textContent ?? '',
  )
}

function badge(): string | null {
  return screen.getByRole('button', { name: 'Findings' }).getAttribute('data-badge')
}

/** The mover's drawn blocks inside a No room lane. */
function moverInNoRoomLane(mover: string): boolean {
  return document.querySelector(`[data-overflow-lane] [data-event-id="${mover}"]`) !== null
}

function fencerInput(id: string): HTMLInputElement {
  const entry = findCompetition(id)
  const label = entry ? competitionLabel(entry) : id
  return screen.getByRole('spinbutton', { name: `Fencer count for ${label}` }) as HTMLInputElement
}

/** The rail, the center and the footer, side by side as the shell lays them out. */
function BoardHost() {
  return (
    <>
      <ToolRail panel={null} onSelect={() => {}} />
      {centerView()}
      <StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} zoom={ZOOM} onZoomChange={() => {}} />
    </>
  )
}

/** B1 after the headline move, switch set, with T1c's premise asserted (one `:room` row, 23 / 1 / 1). */
function movedB1(autoRerun: boolean): string {
  const { id } = runAndMoveHeadline('B1')
  vi.mocked(scheduleAll).mockClear()
  useStore.getState().setAutoRerun(autoRerun)
  const rows = unplacedRowIds()
  expect(rows, 'premise: the move leaves one Unplaced row').toHaveLength(1)
  expect(rows[0], 'premise: the row is the mover\'s No room row').toBe(`unplaced:${id}:room`)
  expect(selectPlacementCounts(useStore.getState()), 'premise: T1c\'s fresh counts').toEqual(MOVED_COUNTS)
  return id
}

// ──────────────────────────────────────────────
// The cases
// ──────────────────────────────────────────────

describe('the board re-runs itself (020 T2)', () => {
  it('1. a single edit runs once at the debounce, with no banner, indicator or stale row on the way', () => {
    runB1()
    render(centerView(ViewMode.SCHEDULE))
    const before = boardText()
    let t = 0
    const step = (ms: number) => {
      advance(ms)
      t += ms
    }
    const quiet = () => {
      expect(banner(), `banner at ${t} ms`).toBeNull()
      expect(indicator(), `indicator at ${t} ms`).toBeNull()
      expect(hasStaleRow(), `stale row at ${t} ms`).toBe(false)
    }
    const waiting = () => {
      quiet()
      expect(runs(), `runs at ${t} ms`).toBe(0)
      expect(rerunAttr(), `data-rerun at ${t} ms`).toBe('due')
      expect(boardText(), `board at ${t} ms`).toBe(before)
      expect(settledAttr(), `data-settled at ${t} ms`).toBe('false')
    }

    // 80 fencers changes VET's pools and bracket, so the run redraws its row.
    // Literal 299 and 300, not `RERUN_DEBOUNCE_MS`: they pin R2's value, so a
    // change to the constant fails here instead of moving the test with it.
    setVet(80)
    waiting()
    while (t < 290) {
      step(10)
      waiting()
    }
    step(9)
    expect(t).toBe(299)
    waiting()

    step(1)
    expect(runs()).toBe(1)
    expect(rerunAttr()).toBe('idle')
    expect(selectDrawnSchedule(useStore.getState()).runState).toBe(RunState.FRESH)

    let after: string | null = null
    while (t < 700) {
      step(10)
      quiet()
      expect(runs(), `runs at ${t} ms`).toBe(1)
      expect(rerunAttr(), `data-rerun at ${t} ms`).toBe('idle')
      if (t < RERUN_DEBOUNCE_MS + CENTER_SETTLE_MS) {
        expect(boardText(), `board at ${t} ms`).toBe(before)
        expect(settledAttr(), `data-settled at ${t} ms`).toBe('false')
      } else {
        after ??= boardText()
        expect(after, 'the run redraws the board').not.toBe(before)
        expect(boardText(), `board at ${t} ms changes once`).toBe(after)
        expect(settledAttr(), `data-settled at ${t} ms`).toBe('true')
      }
    }
  })

  it('2. five edits 200 ms apart run once, and "Updating…" shows from 500 ms until the run lands', () => {
    runB1()
    render(centerView())

    setVet(41)
    advance(200)
    setVet(42)
    advance(200)
    setVet(43)
    // Literal steps, not the constants: 499 and 500 ms after the first edit pin
    // R1's value, and 299 and 300 ms after the last pin R2's.
    advance(99)
    expect(indicator(), 'absent at 499 ms').toBeNull()

    advance(1)
    const shown = indicator()
    expect(shown, 'present at 500 ms').not.toBeNull()
    expect(shown?.closest('[role="status"]')).not.toBeNull()
    expect(shown?.textContent).toBe('Updating…')

    advance(100)
    setVet(44)
    advance(200)
    setVet(45)
    advance(299)
    expect(runs()).toBe(0)
    expect(indicator()).not.toBeNull()

    advance(1)
    expect(runs()).toBe(1)
    expect(indicator(), 'gone on the render the run lands').toBeNull()

    advance(1000)
    expect(runs()).toBe(1)
  })

  it('3. a late debounce reveals "Updating…" and waits a frame before it runs; an unmount in that wait runs nothing', () => {
    runB1()
    const { unmount } = render(centerView())

    setVet(41)
    // The main thread was busy: the clock is 600 ms on while no timer has fired.
    vi.setSystemTime(Date.now() + 600)
    advance(RERUN_DEBOUNCE_MS)
    expect(indicator(), 'revealed before the run').not.toBeNull()
    expect(runs(), 'the engine waits for a frame').toBe(0)

    advance(16)
    expect(runs()).toBe(1)
    expect(indicator()).toBeNull()

    setVet(42)
    vi.setSystemTime(Date.now() + 600)
    advance(RERUN_DEBOUNCE_MS)
    expect(indicator(), 'premise: in the late-fire wait').not.toBeNull()
    expect(runs()).toBe(1)

    unmount()
    advance(1000)
    expect(runs()).toBe(1)
  })

  it('3. boundary: a debounce 499 ms after due began runs at once, and one at 500 ms waits a frame', () => {
    runB1()
    render(centerView())

    // 199 + 300 = 499 ms since due began: not late.
    setVet(41)
    vi.setSystemTime(Date.now() + 199)
    advance(300)
    expect(runs(), 'at 499 ms the run does not wait').toBe(1)
    expect(indicator()).toBeNull()

    // 200 + 300 = 500 ms: late (R1's `>=`).
    setVet(42)
    vi.setSystemTime(Date.now() + 200)
    advance(300)
    expect(indicator(), 'at 500 ms revealed before the run').not.toBeNull()
    expect(runs(), 'at 500 ms the engine waits for a frame').toBe(1)
    advance(16)
    expect(runs()).toBe(2)
  })

  it('3. stage two: an unmount after the frame, before its `setTimeout(0)`, runs nothing', () => {
    runB1()
    const { unmount } = render(centerView())

    setVet(41)
    intoLateYield()
    expect(runs(), 'the frame alone does not run').toBe(0)
    advance(1)
    expect(runs(), 'the yield runs').toBe(1)

    setVet(42)
    intoLateYield()
    unmount()
    advance(1000)
    expect(runs()).toBe(1)
  })

  it('3. stage two: the yield re-checks the rule, so a switch-off React has not rendered yet runs nothing', () => {
    runB1()
    render(centerView())

    setVet(41)
    intoLateYield()
    advance(1)
    expect(runs(), 'the yield runs').toBe(1)

    setVet(42)
    intoLateYield()
    // Outside `act`: React has not re-rendered, so no effect cleanup has
    // cleared the pending yield, and only its own re-check can stop the run.
    useStore.getState().setAutoRerun(false)
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(runs()).toBe(1)
  })

  it('the debounce re-checks the rule when it fires, so a switch-off React has not rendered yet runs nothing', () => {
    runB1()
    render(centerView())

    setVet(41)
    advance(RERUN_DEBOUNCE_MS)
    expect(runs(), 'an edit left alone runs').toBe(1)

    setVet(42)
    advance(100)
    // Outside `act`: React has not re-rendered, so no effect cleanup has
    // cleared the armed debounce, and only its re-check can stop the run.
    useStore.getState().setAutoRerun(false)
    act(() => {
      vi.advanceTimersByTime(RERUN_DEBOUNCE_MS)
    })
    expect(runs()).toBe(1)
  })

  it('4. a run that throws is attempted once, then the board reads stale', () => {
    runB1()
    render(centerView())
    vi.mocked(scheduleAll).mockImplementationOnce(() => {
      throw new Error('engine failure')
    })

    setVet(41)
    // Two steps: `act` flushes the render the throw causes only when it ends,
    // so the settle that render arms needs an advance of its own.
    advance(RERUN_DEBOUNCE_MS)
    advance(10_000 - RERUN_DEBOUNCE_MS)

    expect(runs()).toBe(1)
    expect(banner()).not.toBeNull()
    expect(hasStaleRow()).toBe(true)
  })

  it('5. with the switch off an edit goes stale as today, and turning it on runs and drops the banner', () => {
    runB1(false)
    render(centerView())

    setVet(41)
    advance(1000)
    expect(runs()).toBe(0)
    expect(banner()).not.toBeNull()

    edit(() => useStore.getState().setAutoRerun(true))
    expect(banner(), 'hidden while due').toBeNull()
    advance(RERUN_DEBOUNCE_MS - 1)
    expect(runs()).toBe(0)
    advance(1)
    expect(runs()).toBe(1)
    advance(CENTER_SETTLE_MS)
    expect(banner()).toBeNull()
  })

  it('6. a Blocking edit never runs, restoring it makes nothing due, and the next edit runs once', () => {
    runB1()
    render(centerView())

    edit(() => useStore.getState().setStrips(0))
    advance(RERUN_INDICATOR_DELAY_MS + 100)
    expect(runs()).toBe(0)
    expect(indicator()).toBeNull()
    expect(rerunAttr()).toBe('idle')
    expect(document.querySelector('[data-dimmed]')).toHaveAttribute('data-dimmed', 'true')

    edit(() => useStore.getState().setStrips(80))
    advance(1000)
    expect(runs()).toBe(0)
    expect(rerunAttr()).toBe('idle')

    setVet(41)
    advance(RERUN_DEBOUNCE_MS)
    expect(runs()).toBe(1)
  })

  it('7. moves and pins never run, an edit runs once, and a click inside the window cancels the pending run', () => {
    runB1()
    render(centerView())
    const [first, second] = Object.keys(useStore.getState().placements).sort()

    edit(() => moveDay(first, (useStore.getState().placements[first].day + 1) % useStore.getState().days_available))
    edit(() => useStore.getState().setPinned(second, true))
    expect(rerunAttr()).toBe('idle')
    advance(1000)
    expect(runs()).toBe(0)
    expect(rerunAttr()).toBe('idle')

    setVet(41)
    advance(RERUN_DEBOUNCE_MS)
    expect(runs(), 'the edit after them runs').toBe(1)

    setVet(42)
    advance(RERUN_DEBOUNCE_MS)
    expect(runs(), 'left alone, the edit runs at 300 ms').toBe(2)

    setVet(43)
    advance(100)
    act(() => {
      runScheduleAll()
    })
    expect(runs(), 'the click runs at once').toBe(3)
    advance(RERUN_DEBOUNCE_MS - 100)
    expect(runs(), 'one run in total at +300 ms').toBe(3)
    advance(1000 - RERUN_DEBOUNCE_MS)
    expect(runs(), 'still one at +1 s').toBe(3)
  })

  it('8. a load with no run opens stale and never re-runs; the next edit runs with no banner flash; a load mid-window cancels the run', () => {
    runB1()
    render(centerView())

    act(() => {
      applyLoadedState({ strips_total: 79 }, null)
    })
    advance(1000)
    expect(runs()).toBe(0)
    expect(banner()).not.toBeNull()

    setVet(41)
    for (let t = 10; t <= 1000; t += 10) {
      advance(10)
      expect(banner(), `banner at ${t} ms`).toBeNull()
    }
    expect(runs()).toBe(1)

    // The in-app file load is async (`ExportPopover.tsx`), so it can land inside the window.
    setVet(42)
    advance(100)
    act(() => {
      applyLoadedState({ strips_total: 78 }, null)
    })
    advance(1000)
    expect(runs()).toBe(1)
    expect(banner()).not.toBeNull()
  })

  it('9. an inverted day window runs (R7)', () => {
    runB1()
    render(centerView())

    edit(() => useStore.getState().updateDayConfig(0, { day_start_time: 21 * 60, day_end_time: 8 * 60 }))
    expect(selectHasBlocking(useStore.getState()), 'premise: an inverted window is not Blocking').toBe(false)
    advance(RERUN_DEBOUNCE_MS)

    expect(runs()).toBe(1)
  })
})

describe('the re-run across mounts (020 T2 test 10)', () => {
  it('a StrictMode mount while due runs exactly once at the debounce', () => {
    runB1()
    setVet(41)
    render(<StrictMode>{centerView()}</StrictMode>)

    // Literal 299 then 1: R2's 300 ms, not the constant.
    advance(299)
    expect(runs()).toBe(0)
    advance(1)
    expect(runs()).toBe(1)
    advance(1000)
    expect(runs()).toBe(1)
  })

  it('a StrictMode mount while due starts the reveal clock: continuous edits show "Updating…" at 500 ms', () => {
    runB1()
    setVet(41)
    render(<StrictMode>{centerView()}</StrictMode>)

    advance(200)
    setVet(42)
    advance(200)
    setVet(43)
    // Literal, as in test 2: 499 and 500 ms after the first edit (R1).
    advance(99)
    expect(indicator()).toBeNull()
    advance(1)
    expect(indicator()).not.toBeNull()
    expect(runs()).toBe(0)
  })

  it('an unmount with the debounce pending runs nothing', () => {
    runB1()
    const { unmount } = render(<StrictMode>{centerView()}</StrictMode>)

    setVet(41)
    advance(RERUN_DEBOUNCE_MS)
    expect(runs(), 'an edit while mounted runs').toBe(1)

    setVet(42)
    advance(100)
    unmount()
    advance(1000)
    expect(runs()).toBe(1)
  })
})

describe('focus survives a re-run (020 T2 test 11)', () => {
  it('the fencer-count input keeps focus and its text', () => {
    runB1()
    render(
      <>
        <EventsPanel />
        {centerView()}
      </>,
    )
    const input = fencerInput(VET)
    act(() => input.focus())

    fireEvent.change(input, { target: { value: '41' } })
    advance(RERUN_DEBOUNCE_MS)

    expect(runs(), 'premise: the edit ran').toBe(1)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('41')
    advance(CENTER_SETTLE_MS)
    expect(document.activeElement).toBe(input)
    expect(input.value).toBe('41')
  })

  it('the DetailStrip Flight button keeps focus after the run its toggle triggers', () => {
    runB1()
    useStore.getState().selectCompetition(VET)
    render(centerView())
    const flight = screen.getByRole('button', { name: 'Flight' })
    act(() => flight.focus())

    fireEvent.click(flight)
    expect(useStore.getState().selectedCompetitions[VET].flighted, 'premise: the toggle landed').toBe(true)
    advance(RERUN_DEBOUNCE_MS)

    expect(runs(), 'premise: the toggle ran').toBe(1)
    expect(document.activeElement).toBe(flight)
    advance(CENTER_SETTLE_MS)
    expect(document.activeElement).toBe(flight)
  })
})

describe('what describes the board holds with it (020 T2 tests 12 and 13, R8)', () => {
  it('12. the Unplaced rows, the footer and the badge hold their pre-edit values until the run lands', () => {
    movedB1(true)
    render(<BoardHost />)
    const heldRows = unplacedRowIds()
    const heldCounts = footerCounts()
    const heldMetrics = footerMetrics()
    expect(heldCounts).toBe(countsText(MOVED_COUNTS))

    setVet(41)
    let t = 0
    while (t < RERUN_DEBOUNCE_MS) {
      const state = useStore.getState()
      const liveOthers = selectAllFindings(state).filter((row) => !isUnplacedRow(row) && row.id !== STALE_ROW_ID)
      expect(runs(), `runs at ${t} ms`).toBe(0)
      expect(unplacedRowIds(), `rows at ${t} ms`).toEqual(heldRows)
      expect(footerCounts(), `counts at ${t} ms`).toBe(heldCounts)
      expect(footerMetrics(), `metrics at ${t} ms`).toEqual(heldMetrics)
      expect(badge(), `badge at ${t} ms`).toBe(String(heldRows.length + liveOthers.length))
      advance(10)
      t += 10
    }

    // The render the run lands on.
    expect(runs()).toBe(1)
    const state = useStore.getState()
    expect(selectPlacementCounts(state), 'premise: the run re-seats the mover').toEqual(RESEATED_COUNTS)
    expect(unplacedRowIds(), 'premise: no :room row after the run').toEqual([])
    expect(footerCounts()).toBe(countsText(RESEATED_COUNTS))
    expect(footerMetrics()).toEqual(metricTexts(selectFooterMetrics(state)))
    expect(badge()).toBe(String(selectFindings(state).length))

    while (t < RERUN_DEBOUNCE_MS + CENTER_SETTLE_MS) {
      advance(10)
      t += 10
      expect(footerCounts(), `counts at ${t} ms`).toBe(countsText(RESEATED_COUNTS))
      expect(unplacedRowIds(), `rows at ${t} ms`).toEqual([])
    }
  })

  it('12. guard: with the switch off the same edit drops the row and the footer reads live, with no run', () => {
    movedB1(false)
    render(<BoardHost />)

    setVet(41)

    expect(unplacedRowIds()).toEqual([])
    expect(footerCounts()).toBe('24 placed · 0 unplaced · 1 pinned')
    expect(footerMetrics()).toEqual(metricTexts(selectFooterMetrics(useStore.getState())))
    advance(RERUN_DEBOUNCE_MS + CENTER_SETTLE_MS + 100)
    expect(runs()).toBe(0)
  })

  it('13. an edit inside a run\'s settle commits that run\'s board at once, matching the held footer', () => {
    const mover = movedB1(true)
    render(<BoardHost />)
    expect(moverInNoRoomLane(mover), 'premise: the moved board draws the mover in No room').toBe(true)

    act(() => {
      runScheduleAll()
    })
    expect(selectPlacementCounts(useStore.getState()), 'premise: the run re-seats the mover').toEqual(RESEATED_COUNTS)
    expect(unplacedRowIds(), 'premise: no Unplaced row after the run').toEqual([])
    expect(moverInNoRoomLane(mover), 'premise: the run\'s settle is still pending').toBe(true)
    vi.mocked(scheduleAll).mockClear()

    advance(100)
    setVet(41)
    let t = 100
    while (t < 100 + RERUN_DEBOUNCE_MS) {
      expect(runs(), `runs at ${t} ms`).toBe(0)
      expect(moverInNoRoomLane(mover), `center at ${t} ms draws the first run's board`).toBe(false)
      expect(document.querySelector(`[data-event-id="${mover}"]`), `mover drawn at ${t} ms`).not.toBeNull()
      expect(footerCounts(), `counts at ${t} ms`).toBe(countsText(RESEATED_COUNTS))
      expect(unplacedRowIds(), `rows at ${t} ms`).toEqual([])
      advance(10)
      t += 10
    }
    expect(runs(), 'the next run lands at the debounce').toBe(1)

    advance(CENTER_SETTLE_MS)
    const state = useStore.getState()
    const drawn = selectDrawnSchedule(state)
    expect(settledAttr()).toBe('true')
    expect(moverInNoRoomLane(mover)).toBe(drawn.unplacedIds.has(mover))
    expect(footerCounts()).toBe(countsText(selectPlacementCounts(state)))
    expect(unplacedRowIds()).toEqual(selectAllFindings(state).filter(isUnplacedRow).map((row) => row.id))
  })
})
