import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  MatrixCanvas,
  PERSIST_DEBOUNCE_MS,
} from '../../../src/components/canvas/MatrixCanvas.tsx'
import { useStore } from '../../../src/store/store.ts'
import type { DerivedFindings, DerivedSchedule } from '../../../src/store/derived.ts'
import { BottleneckCause, BottleneckSeverity, Phase } from '../../../src/engine/types.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../../../src/store/viewState.ts'
import {
  makeCompetition,
  makeConfig,
  makeScheduleResult,
  makeStrips,
} from '../../helpers/factories.ts'

// 004 T034/T035/T036/T037/T039 — the matrix canvas grid and the blocks on it.
//
// The fixture is 3 days x 30 strips = 90 flat rows in a 900x480 viewport. The
// day band is a 38px overlay pinned at the top of its day group, and the rows
// start below it rather than underneath it (T037), so they get 480 - 38 = 442
// vertical pixels. At the NORMAL row height of 24px that holds
// ceil(442/24) = 19 rows, so every "only the visible window renders" assertion
// below is 19 against 90 rather than "some rows exist" (FR-021).
//
// The plot is the viewport minus the frozen gutter: 900 - 72 = 828px. At the
// default 1 minute per pixel that is a 828-minute time window, which is where
// the hour-tick counts come from.

const DAYS = 3
const STRIPS = 30
const TOTAL_ROWS = DAYS * STRIPS
const VIEWPORT_WIDTH = 900
const VIEWPORT_HEIGHT = 480
const GUTTER_WIDTH = 72
// The 20px day band and the 18px hour axis pinned under it.
const HEADER_HEIGHT = 38
const PLOT_WIDTH = VIEWPORT_WIDTH - GUTTER_WIDTH
const PLOT_HEIGHT = VIEWPORT_HEIGHT - HEADER_HEIGHT // 442
const NORMAL_ROWS_VISIBLE = 19 // ceil(442 / 24)
const TALL_ROWS_VISIBLE = 13 // ceil(442 / 36)
const NORMAL_ROW_PX = 24
// The furthest scroll that still fills the viewport: 90 rows less the 19 that
// fit. Scrolling past it would only add blank space below the last row.
const MAX_ROW_SCROLL = TOTAL_ROWS - NORMAL_ROWS_VISIBLE // 71

// jsdom implements no ResizeObserver, and the canvas measures its own viewport
// through one. A stub that reports a fixed size on observe() exercises the
// component's real measurement path rather than routing around it — the
// alternative, passing the size in as a prop, would leave that path untested.
let observerSize = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }
const liveObservers: Array<() => void> = []

class StubResizeObserver {
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(): void {
    const fire = (): void => {
      this.callback(
        [{ contentRect: { ...observerSize } } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      )
    }
    liveObservers.push(fire)
    fire()
  }

  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  observerSize = { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }
  liveObservers.length = 0
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
  useStore.getState().setDays(DAYS)
  useStore.getState().setStrips(STRIPS)
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
  vi.useRealTimers()
})

/** Seeds persisted view state, so a case can start from a chosen window. */
function seedViewState(overrides: Partial<ViewState>): void {
  saveViewState({ ...DEFAULT_VIEW_STATE, ...overrides })
}

function stripRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-strip-row]'))
}

function dayGroups(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-day-group]'))
}

function rowLines(): SVGLineElement[] {
  return Array.from(document.querySelectorAll<SVGLineElement>('[data-row-line]'))
}

function gridSvg(): SVGSVGElement {
  const svg = document.querySelector<SVGSVGElement>('svg')
  if (!svg) throw new Error('canvas grid not rendered')
  return svg
}

function firstTickIn(group: HTMLElement): HTMLElement {
  const tick = group.querySelector<HTMLElement>('[data-hour-tick]')
  if (!tick) throw new Error('day group has no hour ticks')
  return tick
}

/**
 * A committed schedule with one placed event that has both a pool block and a
 * DE block, so a fit action has a union of spans to cover rather than one span.
 */
function scheduleWithPlacedEvent(): DerivedSchedule {
  return {
    config: makeConfig({ days_available: DAYS, strips: makeStrips(STRIPS, 4) }),
    competitions: [makeCompetition({ id: 'c1' })],
    events: {
      c1: {
        result: {
          ...makeScheduleResult('c1', 0),
          pool_start: 600,
          pool_end: 700,
          pool_strip_count: 4,
          de_start: 760,
          de_end: 900,
          de_strip_count: 4,
        },
        day_out_of_range: false,
      },
    },
  }
}

function tickLabelsIn(group: HTMLElement): string[] {
  return Array.from(group.querySelectorAll<HTMLElement>('[data-hour-tick]')).map(
    (el) => el.textContent ?? '',
  )
}

function viewport(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-canvas-viewport]')
  if (!el) throw new Error('canvas viewport not rendered')
  return el
}

function blockLayer(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-block-layer]')
  if (!el) throw new Error('canvas block layer not rendered')
  return el
}

/** Every block in the document, by `id:PHASE`. */
function blockIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-event-block]'))
    .map((el) => el.dataset.eventBlock ?? '')
    .sort()
}

function blockFor(id: string, phase: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-event-block="${id}:${phase}"]`)
  if (!el) throw new Error(`no ${phase} block drawn for ${id}`)
  return el
}

describe('MatrixCanvas regions', () => {
  it('names the canvas, the frozen strip gutter and the zoom toolbar', () => {
    render(<MatrixCanvas />)

    expect(screen.getByRole('region', { name: 'Matrix canvas' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Strip labels' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Canvas zoom controls' })).toBeInTheDocument()
  })

  it('offers every zoom action FR-020 requires', () => {
    render(<MatrixCanvas />)

    for (const name of [
      'Zoom in',
      'Zoom out',
      'Fit to day',
      'Fit to tournament',
      'Zoom to selection',
      'Taller rows',
      'Shorter rows',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })
})

describe('MatrixCanvas row windowing (FR-021)', () => {
  it('renders the nineteen rows the viewport holds, not an arbitrary nineteen', () => {
    render(<MatrixCanvas />)

    const rows = stripRows()
    expect(rows).toHaveLength(NORMAL_ROWS_VISIBLE)
    expect(rows[0].dataset.stripRow).toBe('0')
    expect(rows[rows.length - 1].dataset.stripRow).toBe(String(NORMAL_ROWS_VISIBLE - 1))
  })

  it('draws a stale scroll position from the clamped window, not from the stored value', () => {
    // A rowScroll saved against a far larger tournament survives into a
    // smaller one: isValidViewState accepts any non-negative integer, and
    // nothing re-clamps it when setDays or setStrips shrinks the layout. Every
    // row, and every grid line under it, must still land in the viewport.
    seedViewState({ rowScroll: 500 })
    render(<MatrixCanvas />)

    const rows = stripRows()
    expect(rows[0].dataset.stripRow).toBe(String(MAX_ROW_SCROLL))
    expect(rows[0].style.top).toBe('0px')
    expect(rows[rows.length - 1].style.top).toBe(`${(NORMAL_ROWS_VISIBLE - 1) * NORMAL_ROW_PX}px`)

    const lines = rowLines()
    expect(lines[0].getAttribute('y1')).toBe('0')
    expect(lines[lines.length - 1].getAttribute('y1')).toBe(
      String((NORMAL_ROWS_VISIBLE - 1) * NORMAL_ROW_PX),
    )
  })

  it('renders the strips the scroll position lands on, not always the first ones', () => {
    seedViewState({ rowScroll: 10 })
    render(<MatrixCanvas />)

    const labels = stripRows().map((el) => el.textContent)
    expect(labels[0]).toBe('Strip 11')
    expect(labels).toHaveLength(NORMAL_ROWS_VISIBLE)
    expect(labels).not.toContain('Strip 1')
  })

  it('renders fewer rows at the tall step, because each row takes more of the viewport', () => {
    seedViewState({ rowHeightStep: 'tall' })
    render(<MatrixCanvas />)

    expect(stripRows()).toHaveLength(TALL_ROWS_VISIBLE)
  })

  it('renders nothing at all before the viewport has been measured', () => {
    observerSize = { width: 0, height: 0 }
    render(<MatrixCanvas />)

    expect(stripRows()).toHaveLength(0)
  })
})

describe('MatrixCanvas grid (FR-012, FR-017)', () => {
  // The gutter <li>s and the band <span>s are the label layers. These cases
  // are about the SVG under them, which is what T034 and T035 actually draw:
  // an <svg> returning null, or emitting no <line> children at all, is
  // invisible to every assertion that reads a label.
  it('rules a line across the plot for every visible row', () => {
    render(<MatrixCanvas />)

    const lines = Array.from(gridSvg().querySelectorAll(':scope > line'))
    expect(lines).toHaveLength(NORMAL_ROWS_VISIBLE)
    expect(lines[0].getAttribute('y1')).toBe('0')
    // The plot is the viewport less the frozen gutter, never the whole width.
    expect(lines[0].getAttribute('x2')).toBe(String(PLOT_WIDTH))
  })

  it('rules a line down the day group for every hour the axis labels', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    const labels = tickLabelsIn(dayGroups()[0])
    expect(labels.length).toBeGreaterThan(0)
    expect(gridSvg().querySelectorAll('[data-day-grid] line')).toHaveLength(labels.length)
  })

  it('stops a day’s lines where the rows stop, not where the viewport does', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    // Day 0 is 30 strips deep, past the 19 on screen, so its lines run the
    // whole plot rather than stopping at a day boundary — and the plot is the
    // viewport less the day band's own space.
    const line = gridSvg().querySelector('[data-day-grid] line')
    expect(line?.getAttribute('y1')).toBe('0')
    expect(line?.getAttribute('y2')).toBe(String(PLOT_HEIGHT))
  })

  it('runs a day group’s lines only down the rows belonging to that day', () => {
    seedViewState({ rowScroll: 25, timeScroll: 480 })
    render(<MatrixCanvas />)

    // Day 0 holds rows 25..29 — the first five of the nineteen on screen — and
    // day 1 takes the rest, so their lines meet at 5 * 24 = 120px.
    const [dayZero, dayOne] = Array.from(
      gridSvg().querySelectorAll<SVGGElement>('[data-day-grid]'),
    )
    expect(dayZero.querySelector('line')?.getAttribute('y2')).toBe('120')
    expect(dayOne.querySelector('line')?.getAttribute('y1')).toBe('120')
  })
})

describe('MatrixCanvas day bands (FR-019)', () => {
  it('renders a band only for the days the visible rows reach', () => {
    render(<MatrixCanvas />)

    // Rows 0..18 are all inside day 0, whose 30 strips run to row 29.
    expect(dayGroups()).toHaveLength(1)
    expect(screen.getByText('Day 1')).toBeInTheDocument()
    expect(screen.queryByText('Day 2')).not.toBeInTheDocument()
  })

  it('renders both bands when the window straddles a day boundary', () => {
    seedViewState({ rowScroll: 25 })
    render(<MatrixCanvas />)

    expect(dayGroups()).toHaveLength(2)
    expect(screen.getByText('Day 1')).toBeInTheDocument()
    expect(screen.getByText('Day 2')).toBeInTheDocument()
  })

  it('pins a band scrolled past to the top of the viewport rather than letting it leave', () => {
    seedViewState({ rowScroll: 25 })
    render(<MatrixCanvas />)

    const [dayZero, dayOne] = dayGroups()
    expect(dayZero.style.top).toBe('0px')
    // Day 1 starts at flat row 30, five rows below a scroll of 25.
    expect(dayOne.style.top).toBe('120px')
  })

  it('pushes a pinned band out of the way once the next day reaches the top', () => {
    // Day 1 starts one row (24px) below a scroll of 29, closer than the 38px
    // header. Day 0's pinned band must give way instead of overlapping it.
    seedViewState({ rowScroll: 29 })
    render(<MatrixCanvas />)

    const [dayZero, dayOne] = dayGroups()
    expect(dayOne.style.top).toBe('24px')
    expect(dayZero.style.top).toBe('-14px')
  })
})

describe('MatrixCanvas day band layout space (FR-019)', () => {
  // The band is a 38px overlay pinned at the top of its day group. Given no
  // compensating offset it covers the first strip of every day group outright
  // and cuts the second in half, on every day, at every scroll position.
  it('starts the rows below the day band rather than underneath it', () => {
    render(<MatrixCanvas />)

    const gutter = screen.getByRole('list', { name: 'Strip labels' })
    const firstRow = stripRows()[0]

    expect(dayGroups()[0].style.top).toBe('0px')
    expect(firstRow.dataset.stripRow).toBe('0')
    // The row's viewport coordinate is the gutter's own offset plus its offset
    // inside the gutter — jsdom lays nothing out, so neither can be measured.
    expect(gutter.style.top).toBe(`${HEADER_HEIGHT}px`)
    expect(firstRow.style.top).toBe('0px')
    expect(
      Number.parseFloat(gutter.style.top) + Number.parseFloat(firstRow.style.top),
    ).toBeGreaterThanOrEqual(HEADER_HEIGHT)
  })

  it('offsets the grid and the block layer by exactly the same amount', () => {
    // A layer left behind at the top of the viewport would shear away from the
    // rows by 38px, which reads as blocks sitting one and a half strips high.
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    expect(gridSvg().style.top).toBe(`${HEADER_HEIGHT}px`)
    expect(gridSvg().getAttribute('height')).toBe(String(PLOT_HEIGHT))
    expect(blockLayer().style.top).toBe(`${HEADER_HEIGHT}px`)
    expect(blockLayer().style.height).toBe(`${PLOT_HEIGHT}px`)
  })
})

describe('MatrixCanvas blocks (FR-012, FR-013, FR-021)', () => {
  it('draws each phase of a placed event at the geometry the window implies', () => {
    // The midnight window this case's arithmetic is written against, stated
    // rather than inherited: DEFAULT_VIEW_STATE.timeScroll is 08:00 from T040
    // on, so a case that needs a particular window has to seed it.
    seedViewState({ timeScroll: 0 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    expect(blockIds()).toEqual(['c1:DE', 'c1:POOLS'])

    // The window opens at midnight at 1 minute per pixel, so the 600-700 pool
    // block starts 600px into the plot and is 100px wide. It holds four
    // strips from flat row 0, which is the top of the window: 4 * 24 = 96px.
    const pool = blockFor('c1', 'POOLS')
    expect(pool.style.left).toBe('600px')
    expect(pool.style.width).toBe('100px')
    expect(pool.style.top).toBe('0px')
    expect(pool.style.height).toBe('96px')

    // The DE runs 760-900 on the same four strips, which are free again by
    // then, so it lands on the same rows rather than below the pool block.
    const de = blockFor('c1', 'DE')
    expect(de.style.left).toBe('760px')
    expect(de.style.width).toBe('140px')
    expect(de.style.top).toBe('0px')
  })

  it('leaves a block outside the time window out of the DOM entirely', () => {
    seedViewState({ timeScroll: 800 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    // The window is [800, 1628): the pool block ended at 700, before it
    // opened, while the DE block runs to 900 and reaches into it.
    expect(blockIds()).toEqual(['c1:DE'])
  })

  it('leaves a block outside the row window out of the DOM entirely', () => {
    seedViewState({ rowScroll: 30 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    // Both blocks sit on day 0's first four strips, flat rows 0-3. A scroll of
    // 30 puts the window on day 1, so neither has a row on screen — while the
    // grid still renders, which is what makes this about the blocks.
    expect(blockIds()).toEqual([])
    expect(stripRows()).toHaveLength(NORMAL_ROWS_VISIBLE)
  })

  it('slides a block only partly on screen under the top edge rather than clamping it', () => {
    seedViewState({ rowScroll: 3 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    // The pool block spans rows 0-3 and only its last row is still on screen.
    // Neither axis clamps, so it is drawn three rows above the window.
    expect(blockFor('c1', 'POOLS').style.top).toBe('-72px')
  })

  it('redraws a block’s geometry from the new window rather than from a stored one', () => {
    // From midnight, so the zoom lands the block inside the plot: from the
    // 08:00 default it would zoom to a scroll of 687 and put the 600-700 block
    // 174px off the left edge, which proves the same arithmetic less legibly.
    seedViewState({ timeScroll: 0 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    // Centre of the 828px plot is x=414, reading minute 414 at 1 min/px, so
    // halving the zoom leaves the scroll at 207. The 600-700 pool block is
    // then (600 - 207) * 2 = 786px in and twice as wide (FR-013).
    const pool = blockFor('c1', 'POOLS')
    expect(pool.style.left).toBe('786px')
    expect(pool.style.width).toBe('200px')
  })

  it('names a block for a screen reader with the facts it draws', () => {
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    expect(blockFor('c1', 'POOLS')).toHaveAttribute(
      'aria-label',
      "Div 1 Men's Foil Individual, Pools, Day 1, 10:00–11:40, Strips 1–4",
    )
  })
})

describe('MatrixCanvas hour axis (FR-017)', () => {
  it('pins an hour axis inside each visible day group', () => {
    seedViewState({ rowScroll: 25, timeScroll: 480 })
    render(<MatrixCanvas />)

    const groups = dayGroups()
    expect(groups).toHaveLength(2)
    for (const group of groups) {
      expect(tickLabelsIn(group)[0]).toBe('8:00')
    }
  })

  it('ticks every hour of the visible window at the default zoom', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    // [480, 480 + 828) clipped to the day's 08:00-22:00: 08:00 through 21:00.
    const labels = tickLabelsIn(dayGroups()[0])
    expect(labels).toHaveLength(14)
    expect(labels[0]).toBe('8:00')
    expect(labels[13]).toBe('21:00')
  })

  it('coarsens the step when an hour is too narrow to label', () => {
    seedViewState({ timeScroll: 480, timeZoom: 4 })
    render(<MatrixCanvas />)

    // 4 min/px puts an hour at 15px, so the axis steps to six hours.
    expect(tickLabelsIn(dayGroups()[0])).toEqual(['12:00', '18:00'])
  })

  it('clips each band to its own configured hours, not to a span the days share', () => {
    // At 2 min/px the 828px plot spans 1656 minutes — more than a day — so an
    // axis drawn over the window would label hours no day has. Each band
    // belongs to a day group and stops at that day's own hours: day 0 keeps
    // the seeded 08:00-22:00 while day 1 is shortened to 10:00-14:00.
    useStore.getState().updateDayConfig(1, { day_start_time: 600, day_end_time: 840 })
    seedViewState({ rowScroll: 25, timeScroll: 480, timeZoom: 2 })
    render(<MatrixCanvas />)

    const [dayZero, dayOne] = dayGroups()
    expect(tickLabelsIn(dayZero)).toEqual([
      '8:00',
      '10:00',
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
    ])
    expect(tickLabelsIn(dayOne)).toEqual(['10:00', '12:00'])
  })
})

describe('MatrixCanvas zoom persistence (FR-017, FR-018)', () => {
  it('anchors a zoom-in click at the centre of the plot and stores the result', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    // Centre of the 828px plot is x=414, reading minute 894 at 1 min/px. After
    // halving the zoom that minute must still sit at x=414, so scroll = 687.
    const stored = loadViewState()
    expect(stored.timeZoom).toBe(0.5)
    expect(stored.timeScroll).toBe(687)
  })

  it('reads the stored window back on remount', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    cleanup()

    render(<MatrixCanvas />)

    // [687, 687 + 414) at 0.5 min/px: hourly ticks from 12:00 to 18:00.
    const labels = tickLabelsIn(dayGroups()[0])
    expect(labels[0]).toBe('12:00')
    expect(labels).toHaveLength(7)
  })

  it('leaves view-state fields the canvas does not own alone', () => {
    seedViewState({ timeScroll: 480, drawerHeight: 321, scorecardExpanded: true })
    render(<MatrixCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

    const stored = loadViewState()
    expect(stored.drawerHeight).toBe(321)
    expect(stored.scorecardExpanded).toBe(true)
  })

  it('persists a row-height step and honours it on remount', () => {
    render(<MatrixCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Taller rows' }))
    expect(loadViewState().rowHeightStep).toBe('tall')

    cleanup()
    render(<MatrixCanvas />)
    expect(stripRows()).toHaveLength(TALL_ROWS_VISIBLE)
  })

  it('moves the rows on the wheel at once and stores the position once it settles', () => {
    vi.useFakeTimers()
    render(<MatrixCanvas />)

    // 240px of wheel travel at the 24px normal row height is ten rows.
    fireEvent.wheel(viewport(), { deltaY: 240 })

    expect(stripRows()[0].textContent).toBe('Strip 11')
    expect(loadViewState().rowScroll, 'written mid-gesture').toBe(0)

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    expect(loadViewState().rowScroll).toBe(10)
  })

  it('zooms at the pointer rather than the centre on a modified wheel', () => {
    vi.useFakeTimers()
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    // clientX 172 is 100px into the plot, past the 72px gutter, reading minute
    // 580. Zooming out to 2 min/px must keep 580 at that pixel: 580 - 200 = 380.
    fireEvent.wheel(viewport(), { deltaY: 100, ctrlKey: true, clientX: 172, clientY: 0 })
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    const stored = loadViewState()
    expect(stored.timeZoom).toBe(2)
    expect(stored.timeScroll).toBe(380)
  })

  it('writes a whole pan once rather than once per wheel event', () => {
    vi.useFakeTimers()
    render(<MatrixCanvas />)

    for (let i = 0; i < 5; i++) fireEvent.wheel(viewport(), { deltaY: 24 })
    expect(loadViewState().rowScroll, 'written mid-gesture').toBe(0)

    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)
    expect(loadViewState().rowScroll).toBe(5)
  })

  it('leaves a pan out of storage entirely when the canvas unmounts mid-gesture', () => {
    vi.useFakeTimers()
    render(<MatrixCanvas />)

    fireEvent.wheel(viewport(), { deltaY: 240 })
    cleanup()
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    expect(loadViewState().rowScroll).toBe(0)
  })
})

describe('MatrixCanvas wheel deltas', () => {
  it('pans by lines on a browser that reports lines, not by a fraction of a pixel', () => {
    render(<MatrixCanvas />)

    // Firefox on Windows and Linux: DOM_DELTA_LINE, three lines per notch.
    // Read as pixels that is an eighth of a row and moves nothing at all.
    fireEvent.wheel(viewport(), { deltaY: 3, deltaMode: 1 })

    // 3 lines x 16px is 48px, two rows at the normal height.
    expect(stripRows()[0].textContent).toBe('Strip 3')
  })

  it('accumulates sub-row deltas instead of discarding them', () => {
    render(<MatrixCanvas />)

    // 8px is a third of a row: on its own each of these rounds to no rows.
    fireEvent.wheel(viewport(), { deltaY: 8 })
    expect(stripRows()[0].textContent, 'a third of a row is not a row').toBe('Strip 1')

    fireEvent.wheel(viewport(), { deltaY: 8 })
    fireEvent.wheel(viewport(), { deltaY: 8 })
    expect(stripRows()[0].textContent).toBe('Strip 2')
  })

  it('pans time on a horizontal wheel, scaled by the zoom', () => {
    vi.useFakeTimers()
    seedViewState({ timeScroll: 480, timeZoom: 2 })
    render(<MatrixCanvas />)

    fireEvent.wheel(viewport(), { deltaX: 100 })
    vi.advanceTimersByTime(PERSIST_DEBOUNCE_MS)

    // 100px of travel at 2 minutes per pixel is 200 minutes.
    expect(loadViewState().timeScroll).toBe(680)
  })

  it('stops the time pan at midnight rather than scrolling before it', () => {
    seedViewState({ timeScroll: 480, timeZoom: 2 })
    render(<MatrixCanvas />)

    fireEvent.wheel(viewport(), { deltaX: -10000 })

    // Read off the axis rather than out of storage: a negative timeScroll is
    // rejected wholesale on load, so loadViewState would answer 0 either way.
    // At a window starting at midnight the 08:00 tick sits 240px into the plot.
    const tick = firstTickIn(dayGroups()[0])
    expect(tick.dataset.hourTick).toBe('480')
    expect(tick.style.left).toBe(`${GUTTER_WIDTH + 240}px`)
  })

  it('takes back the ctrl+wheel gesture the browser would spend on page zoom', () => {
    render(<MatrixCanvas />)

    const event = new WheelEvent('wheel', {
      deltaY: 100,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    fireEvent(viewport(), event)

    expect(event.defaultPrevented).toBe(true)
  })
})

describe('MatrixCanvas keyboard panning (WCAG 2.1.1)', () => {
  // The viewport is overflow-hidden and both scroll positions are view state,
  // so there is no scrollbar and no native key handling: without these the
  // rows cannot be reached at all without a wheel.
  it('offers the grid as a focusable, named target', () => {
    render(<MatrixCanvas />)

    expect(screen.getByRole('group', { name: 'Matrix grid' })).toHaveAttribute('tabindex', '0')
  })

  it('steps one row per arrow press and stores it immediately', () => {
    render(<MatrixCanvas />)

    fireEvent.keyDown(viewport(), { key: 'ArrowDown' })
    fireEvent.keyDown(viewport(), { key: 'ArrowDown' })

    expect(stripRows()[0].textContent).toBe('Strip 3')
    expect(loadViewState().rowScroll).toBe(2)
  })

  it('steps a whole window of rows per page press', () => {
    render(<MatrixCanvas />)

    fireEvent.keyDown(viewport(), { key: 'PageDown' })

    expect(stripRows()[0].dataset.stripRow).toBe(String(NORMAL_ROWS_VISIBLE))
  })

  it('stops at the last full window rather than paging into blank space', () => {
    seedViewState({ rowScroll: 65 })
    render(<MatrixCanvas />)

    fireEvent.keyDown(viewport(), { key: 'PageDown' })

    expect(loadViewState().rowScroll).toBe(MAX_ROW_SCROLL)
    expect(stripRows()[NORMAL_ROWS_VISIBLE - 1].dataset.stripRow).toBe(String(TOTAL_ROWS - 1))
  })

  it('stops at the first row rather than scrolling above it', () => {
    render(<MatrixCanvas />)

    fireEvent.keyDown(viewport(), { key: 'ArrowUp' })

    expect(stripRows()[0].textContent).toBe('Strip 1')
  })

  it('pans the time axis by the same distance on screen at any zoom', () => {
    seedViewState({ timeScroll: 480, timeZoom: 2 })
    render(<MatrixCanvas />)

    fireEvent.keyDown(viewport(), { key: 'ArrowRight' })

    // 48px of travel at 2 minutes per pixel is 96 minutes.
    expect(loadViewState().timeScroll).toBe(576)
  })

  it('leaves a key it does not handle to the browser', () => {
    render(<MatrixCanvas />)

    const handled = fireEvent.keyDown(viewport(), { key: 'ArrowDown' })
    const ignored = fireEvent.keyDown(viewport(), { key: 'a' })

    expect(handled, 'a handled key must not also scroll the page').toBe(false)
    expect(ignored).toBe(true)
  })
})

describe('MatrixCanvas fit actions (FR-020)', () => {
  it('fits the configured day span into the plot', () => {
    render(<MatrixCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Fit to day' }))

    const stored = loadViewState()
    expect(stored.timeScroll).toBe(480)
    expect(stored.timeZoom).toBeCloseTo(840 / PLOT_WIDTH, 10)
  })

  it('fits the day the window is on, at the hours that day is configured for', () => {
    // Day 1 runs 09:00-13:00 rather than the 08:00-22:00 every day is seeded
    // with, and rows 35..54 are all inside it.
    useStore.getState().updateDayConfig(1, { day_start_time: 540, day_end_time: 780 })
    seedViewState({ rowScroll: 35 })
    render(<MatrixCanvas />)

    fireEvent.click(screen.getByRole('button', { name: 'Fit to day' }))

    const stored = loadViewState()
    expect(stored.timeScroll).toBe(540)
    expect(stored.timeZoom).toBeCloseTo(240 / PLOT_WIDTH, 10)
  })

  it('disables fit-to-tournament while nothing is placed', () => {
    render(<MatrixCanvas />)

    expect(screen.getByRole('button', { name: 'Fit to tournament' })).toBeDisabled()
  })

  it('fits the union of a placed event’s spans, not just its first block', () => {
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    const button = screen.getByRole('button', { name: 'Fit to tournament' })
    expect(button).toBeEnabled()
    fireEvent.click(button)

    // Pools run 600-700 and the DE 760-900, so the union is 600-900: 300
    // minutes. Covering only the pool block would fit 100.
    const stored = loadViewState()
    expect(stored.timeScroll).toBe(600)
    expect(stored.timeZoom).toBeCloseTo(300 / PLOT_WIDTH, 10)
  })

  it('disables zoom-to-selection until a selection is offered', () => {
    render(<MatrixCanvas />)

    expect(screen.getByRole('button', { name: 'Zoom to selection' })).toBeDisabled()
  })

  it('fits a padded selection when one is offered', () => {
    render(<MatrixCanvas selection={{ startMinutes: 600, endMinutes: 1200 }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Zoom to selection' }))

    // 600 minutes padded by 5% on each side is 570..1230, 660 minutes.
    const stored = loadViewState()
    expect(stored.timeScroll).toBe(570)
    expect(stored.timeZoom).toBeCloseTo(660 / PLOT_WIDTH, 10)
  })
})

/**
 * jsdom 26 ships no `PointerEvent` constructor, so testing-library's
 * `pointerMove` helper degrades to a bare `Event` and drops clientX/clientY. The
 * event *name* is what React dispatches on, so a `MouseEvent` under that name
 * delivers the coordinates to `onPointerMove`.
 */
function firePointerMove(el: Element, clientX: number, clientY: number): void {
  el.dispatchEvent(
    new MouseEvent('pointermove', { clientX, clientY, bubbles: true, cancelable: true }),
  )
}

function tooltipField(key: string): Element | null {
  return document.querySelector(`[data-tooltip-field="${key}"]`)
}

/**
 * T038 — the two facts about the hover handler that
 * `CanvasTooltip.test.tsx`'s own hit-test cases cannot pin.
 *
 * Those cases aim at the vertical *centre* of a 96px block. The block layer
 * starts 38px down, and 38 is well inside 96, so a handler that forgot the
 * header offset entirely still lands inside the block and every one of them
 * passes. The offset is only load-bearing within 38px of an edge, which is
 * where the first case below aims. The second covers the attribution in
 * `findingsForBlock`, which no test reaches through the component at all —
 * `CanvasTooltip.test.tsx` hands the tooltip a findings array directly.
 *
 * The fixture is `scheduleWithPlacedEvent`: from a midnight window the pool
 * block occupies plot x 600-700 and plot y 0-96, so a client coordinate is
 * that plus the 72px gutter and the 38px header. Both cases seed that window —
 * `DEFAULT_VIEW_STATE.timeScroll` is 08:00 from T040 on, which would slide the
 * block 480px left of where these coordinates aim.
 */
describe('MatrixCanvas hover hit test (FR-022, research D3)', () => {
  it('measures the pointer down the block layer, which starts below the day band', () => {
    seedViewState({ timeScroll: 0 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} />)

    // Plot y 95 — inside the block by one pixel. Read without the header
    // offset the same client point is plot y 133, past the block's 96px.
    firePointerMove(viewport(), GUTTER_WIDTH + 650, HEADER_HEIGHT + 95)
    expect(tooltipField('phase')?.textContent).toBe('Pools')

    // And plot y -1, one pixel above the block. Read without the offset it
    // would be plot y 37, well inside it.
    firePointerMove(viewport(), GUTTER_WIDTH + 650, HEADER_HEIGHT - 1)
    expect(tooltipField('phase')).toBeNull()
  })

  it('carries only the findings that name this competition, narrowed to this phase', () => {
    const findings: DerivedFindings = {
      validationErrors: [
        {
          field: 'competitions',
          message: 'c1 shares a population with another event',
          severity: BottleneckSeverity.WARN,
          subjects: ['c1'],
        },
        {
          field: 'competitions',
          message: 'c2 is the one with the problem',
          severity: BottleneckSeverity.WARN,
          subjects: ['c2'],
        },
      ],
      analysis: {
        warnings: [
          {
            competition_id: 'c1',
            phase: Phase.POOLS,
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 30,
            message: 'the pools waited for strips',
          },
          {
            competition_id: 'c1',
            phase: Phase.DE,
            cause: BottleneckCause.REFEREE_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 15,
            message: 'the DE waited for referees',
          },
          // Same phase as the block hovered first, and a different event: only
          // the competition id keeps it out.
          {
            competition_id: 'c2',
            phase: Phase.POOLS,
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 5,
            message: 'a different event waited for strips',
          },
        ],
        suggestions: [],
      },
    }
    seedViewState({ timeScroll: 0 })
    render(<MatrixCanvas schedule={scheduleWithPlacedEvent()} findings={findings} />)

    firePointerMove(viewport(), GUTTER_WIDTH + 650, HEADER_HEIGHT + 48)

    const onPools = tooltipField('findings')?.textContent ?? ''
    expect(onPools).toContain('c1 shares a population with another event')
    expect(onPools).toContain('the pools waited for strips')
    // Another event's error, and this event's other phase, are both somebody
    // else's business.
    expect(onPools).not.toContain('c2 is the one with the problem')
    expect(onPools).not.toContain('a different event waited for strips')
    expect(onPools).not.toContain('the DE waited for referees')

    // The DE block runs 760-900 on the same rows, so the narrowing swaps over.
    firePointerMove(viewport(), GUTTER_WIDTH + 800, HEADER_HEIGHT + 48)

    const onDe = tooltipField('findings')?.textContent ?? ''
    expect(onDe).toContain('c1 shares a population with another event')
    expect(onDe).toContain('the DE waited for referees')
    expect(onDe).not.toContain('the pools waited for strips')
  })
})
