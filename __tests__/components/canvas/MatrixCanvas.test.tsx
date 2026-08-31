import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import {
  MatrixCanvas,
  PERSIST_DEBOUNCE_MS,
} from '../../../src/components/canvas/MatrixCanvas.tsx'
import { useStore } from '../../../src/store/store.ts'
import type { DerivedSchedule } from '../../../src/store/derived.ts'
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

// 004 T034/T035/T036/T039 — the matrix canvas grid.
//
// The fixture is 3 days x 30 strips = 90 flat rows in a 900x480 viewport. At
// the NORMAL row height of 24px that viewport holds ceil(480/24) = 20 rows, so
// every "only the visible window renders" assertion below is 20 against 90
// rather than "some rows exist" (FR-021).
//
// The plot is the viewport minus the frozen gutter: 900 - 72 = 828px. At the
// default 1 minute per pixel that is a 828-minute time window, which is where
// the hour-tick counts come from.

const DAYS = 3
const STRIPS = 30
const TOTAL_ROWS = DAYS * STRIPS
const VIEWPORT_WIDTH = 900
const VIEWPORT_HEIGHT = 480
const PLOT_WIDTH = VIEWPORT_WIDTH - 72
const NORMAL_ROWS_VISIBLE = 20
const TALL_ROWS_VISIBLE = 14 // ceil(480 / 36)
const NORMAL_ROW_PX = 24
// The furthest scroll that still fills the viewport: 90 rows less the 20 that
// fit. Scrolling past it would only add blank space below the last row.
const MAX_ROW_SCROLL = TOTAL_ROWS - NORMAL_ROWS_VISIBLE

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
  it('renders the first twenty rows the viewport holds, not an arbitrary twenty', () => {
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

describe('MatrixCanvas day bands (FR-019)', () => {
  it('renders a band only for the days the visible rows reach', () => {
    render(<MatrixCanvas />)

    // Rows 0..19 are all inside day 0, whose 30 strips run to row 29.
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
