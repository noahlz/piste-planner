import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MatrixCanvas } from '../../../src/components/canvas/MatrixCanvas.tsx'
import { useStore } from '../../../src/store/store.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../../../src/store/viewState.ts'

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
  it('renders only the rows the viewport holds, not every row in the tournament', () => {
    render(<MatrixCanvas />)

    expect(stripRows()).toHaveLength(NORMAL_ROWS_VISIBLE)
    expect(NORMAL_ROWS_VISIBLE).toBeLessThan(TOTAL_ROWS)
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

  it('stops the axis at the end of the configured day rather than running past midnight', () => {
    // At 4 min/px the 828px plot spans 3312 minutes — more than two days. The
    // axis belongs to a day group, so it clips to that day's configured hours
    // and never labels an hour that does not exist.
    seedViewState({ timeScroll: 480, timeZoom: 4 })
    render(<MatrixCanvas />)

    for (const label of tickLabelsIn(dayGroups()[0])) {
      const hour = Number(label.split(':')[0])
      expect(hour).toBeLessThan(24)
    }
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

  it('persists a row scroll driven by the wheel', () => {
    render(<MatrixCanvas />)

    // 240px of wheel travel at the 24px normal row height is ten rows.
    fireEvent.wheel(viewport(), { deltaY: 240 })

    expect(loadViewState().rowScroll).toBe(10)
    expect(stripRows()[0].textContent).toBe('Strip 11')
  })

  it('zooms at the pointer rather than the centre on a modified wheel', () => {
    seedViewState({ timeScroll: 480 })
    render(<MatrixCanvas />)

    // clientX 172 is 100px into the plot, past the 72px gutter, reading minute
    // 580. Zooming out to 2 min/px must keep 580 at that pixel: 580 - 200 = 380.
    fireEvent.wheel(viewport(), { deltaY: 100, ctrlKey: true, clientX: 172, clientY: 0 })

    const stored = loadViewState()
    expect(stored.timeZoom).toBe(2)
    expect(stored.timeScroll).toBe(380)
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

  it('disables fit-to-tournament while nothing is placed', () => {
    render(<MatrixCanvas />)

    expect(screen.getByRole('button', { name: 'Fit to tournament' })).toBeDisabled()
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
