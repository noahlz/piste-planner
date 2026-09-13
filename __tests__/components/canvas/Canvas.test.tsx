import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Canvas } from '../../../src/components/canvas/Canvas.tsx'
import { useStore } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { selectDerivedSchedule, selectDerivedFindings } from '../../../src/store/derived.ts'
import type { DerivedFindings, DerivedSchedule } from '../../../src/store/derived.ts'
import { assignStripLanes } from '../../../src/layout/lanes.ts'
import { BottleneckCause, BottleneckSeverity } from '../../../src/engine/types.ts'
import { Phase } from '../../../src/engine/types.ts'
import type { DayConfig } from '../../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeScheduleResult, makeStrips } from '../../helpers/factories.ts'
import { installStubResizeObserver, NeverFiringResizeObserver } from '../../helpers/resizeObserver.ts'

// 013 T025 (part a) — red tests for the redesigned canvas (D2, D3, FR-032 to
// FR-043, contracts/ui-contract.md §Canvas). Canvas.tsx does not exist yet
// (T026 writes it); every case here fails on that missing module.
//
// B1 (specs/013-workbench-redesign scratchpad phase3-contract.md) is the
// default fixture: 4 days, 80 strips, 24 real NAC events, scheduled through
// the store's own actions rather than a hand-built DerivedSchedule, so the
// row/day-group counts below are the real invariant (320 = 4 x 80) rather
// than an artifact of a fixture built to make the number come out even.

// jsdom implements no ResizeObserver. The shared stub (__tests__/helpers/
// resizeObserver.ts) reports a fixed, non-zero content width on every
// observe() call, exercising the real measurement path (Canvas.tsx §"a
// ResizeObserver on the plot measures its width for label-fitting") rather
// than routing around it. The fit-fallback case below swaps in
// NeverFiringResizeObserver instead, for jsdom offering no measurement at
// all rather than a delayed one.

let restoreResizeObserver: () => void

beforeEach(() => {
  restoreResizeObserver = installStubResizeObserver(900, 1200)
  useStore.setState(useStore.getInitialState())
})

afterEach(() => {
  restoreResizeObserver()
  cleanup()
})

const DEFAULT_ZOOM = { zoomStep: 2, fitting: false }

/** Preset B1, run through the auto-scheduler, read back as the committed model. */
function b1Board(): { schedule: DerivedSchedule; findings: DerivedFindings; dayConfigs: DayConfig[] } {
  applyPreset('B1')
  runScheduleAll()
  const state = useStore.getState()
  return {
    schedule: selectDerivedSchedule(state),
    findings: selectDerivedFindings(state),
    dayConfigs: state.dayConfigs,
  }
}

function stripRowsInDay(day: number): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(`[data-day-group="${day}"] [data-strip-row]`),
  )
}

function allStripRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-strip-row]'))
}

function hourTicks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-hour-tick]'))
}

function dayBand(day: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-day-band="${day}"]`)
  if (!el) throw new Error(`no day band for day ${day}`)
  return el
}

function eventBlocks(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-event-block]'))
}

describe('Canvas scrolling and structure (FR-032, FR-033, D2)', () => {
  it('renders every strip row of every day, with no windowing', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    expect(allStripRows()).toHaveLength(320)
    for (const day of [0, 1, 2, 3]) {
      expect(stripRowsInDay(day)).toHaveLength(80)
    }
  })

  it('scrolls from exactly one native container', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    const scrollers = document.querySelectorAll<HTMLElement>('[data-canvas-scroller]')
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].style.overflow).toContain('auto')
  })

  it('pins the time axis, every day band and every gutter, and labels ticks 24-hour', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    const axis = document.querySelector<HTMLElement>('[data-time-axis]')
    if (!axis) throw new Error('no time axis rendered')
    expect(axis.style.position).toBe('sticky')

    const ticks = hourTicks()
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) {
      expect(tick.textContent ?? '').toMatch(/^\d{2}:\d{2}$/)
    }

    for (const day of [0, 1, 2, 3]) {
      expect(dayBand(day).style.position).toBe('sticky')
    }

    // The gutter is the direct parent of a day's strip rows (ui-contract
    // §Canvas: "a sticky gutter ... with one [data-strip-row] per strip").
    const gutter = stripRowsInDay(0)[0].parentElement
    if (!gutter) throw new Error('strip row has no parent gutter')
    expect(gutter.style.position).toBe('sticky')
  })

  it('removes every retired region and control', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    expect(document.querySelector('[data-canvas-viewport]')).toBeNull()
    expect(document.querySelector('[data-block-layer]')).toBeNull()
    expect(document.querySelector('[data-row-line]')).toBeNull()
    expect(document.querySelector('[data-day-grid]')).toBeNull()
    expect(document.querySelector('[data-category]')).toBeNull()
    expect(document.querySelector('[data-highlighted]')).toBeNull()
    expect(screen.queryByRole('toolbar', { name: 'Canvas zoom controls' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Matrix grid' })).not.toBeInTheDocument()
  })
})

describe('Canvas day bands (FR-039)', () => {
  it('states each day band as Day N, events, finish, peak strips and findings, with no date', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    const bandFormat = /^Day \d · \d+ events · finishes (\d\d:\d\d|—) · \d+ of 80 strips at peak · \d+ findings$/
    for (const day of [0, 1, 2, 3]) {
      const text = dayBand(day).textContent ?? ''
      expect(text).toMatch(bandFormat)
      expect(text.startsWith(`Day ${day + 1} ·`)).toBe(true)
    }
  })
})

describe('Canvas zoom (FR-034, D3)', () => {
  it('coarsens tick density at the bottom rung relative to the top rung', () => {
    const { schedule, findings, dayConfigs } = b1Board()

    render(
      <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={{ zoomStep: 0, fitting: false }} />,
    )
    const rung0Ticks = hourTicks().length
    cleanup()

    render(
      <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={{ zoomStep: 5, fitting: false }} />,
    )
    const rung5Ticks = hourTicks().length

    expect(rung0Ticks).toBeGreaterThan(0)
    expect(rung5Ticks).toBeGreaterThan(rung0Ticks)
  })

  it('positions blocks in percent under fitting and in pixels on the ladder', () => {
    const { schedule, findings, dayConfigs } = b1Board()

    render(
      <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={{ zoomStep: 2, fitting: true }} />,
    )
    const fittingBlocks = eventBlocks()
    expect(fittingBlocks.length).toBeGreaterThan(0)
    for (const block of fittingBlocks) {
      expect(block.style.left.endsWith('%')).toBe(true)
      expect(block.style.width.endsWith('%')).toBe(true)
    }
    cleanup()

    render(
      <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={{ zoomStep: 2, fitting: false }} />,
    )
    const laddderBlocks = eventBlocks()
    expect(laddderBlocks.length).toBeGreaterThan(0)
    for (const block of laddderBlocks) {
      expect(block.style.left.endsWith('px')).toBe(true)
      expect(block.style.width.endsWith('px')).toBe(true)
    }
  })

  it('still draws every block at the fit fallback when the plot is never measured', () => {
    globalThis.ResizeObserver = NeverFiringResizeObserver as unknown as typeof ResizeObserver

    const config = makeConfig({ days_available: 1, strips: makeStrips(4, 0) })
    const schedule: DerivedSchedule = {
      config,
      competitions: [makeCompetition({ id: 'flagged' })],
      events: {
        flagged: {
          result: { ...makeScheduleResult('flagged', 0), pool_start: 600, pool_end: 700, pool_strip_count: 2 },
          day_out_of_range: false,
        },
      },
    }
    const findings: DerivedFindings = { validationErrors: [], analysis: { warnings: [], suggestions: [] } }
    const dayConfigs: DayConfig[] = [{ day_start_time: 480, day_end_time: 1320 }]
    const expectedBlocks = assignStripLanes(schedule.events, config.strips_total).length

    render(
      <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={{ zoomStep: 2, fitting: true }} />,
    )

    expect(eventBlocks()).toHaveLength(expectedBlocks)
  })
})

describe('Canvas gutter flags (FR-037)', () => {
  it('flags the strip row a finding targets, and leaves an uninvolved row alone', () => {
    const config = makeConfig({ days_available: 1, strips: makeStrips(4, 0) })
    const schedule: DerivedSchedule = {
      config,
      competitions: [makeCompetition({ id: 'flagged' })],
      events: {
        flagged: {
          // Two strips of four, so the day has rows with no block on them at
          // all — the "another row is not flagged" half of this case.
          result: { ...makeScheduleResult('flagged', 0), pool_start: 600, pool_end: 700, pool_strip_count: 2 },
          day_out_of_range: false,
        },
      },
    }
    const findings: DerivedFindings = {
      validationErrors: [],
      analysis: {
        warnings: [
          {
            competition_id: 'flagged',
            phase: Phase.POOLS,
            cause: BottleneckCause.STRIP_CONTENTION,
            severity: BottleneckSeverity.WARN,
            delay_mins: 10,
            message: 'flagged waited for strips',
          },
        ],
        suggestions: [],
      },
    }
    const dayConfigs: DayConfig[] = [{ day_start_time: 480, day_end_time: 1320 }]

    render(<Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} />)

    // assignStripLanes gives the only candidate firstStrip 0 over 2 strips, so
    // rows are located by document position (strip index order) rather than
    // by any particular attribute value — the contract does not fix what
    // data-strip-row's value carries, only that it marks a row.
    const rows = stripRowsInDay(0)
    expect(rows).toHaveLength(4)
    expect(rows[0].dataset.flagged).toBe('true')
    expect(rows[1].dataset.flagged).toBe('true')
    expect(rows[2].dataset.flagged).not.toBe('true')
    expect(rows[3].dataset.flagged).not.toBe('true')
  })
})
