import { StrictMode, type ComponentProps } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { Canvas } from '../../../src/components/canvas/Canvas.tsx'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import {
  drawnScheduleFrom,
  selectDrawnSchedule,
  selectDerivedFindings,
  selectFindings,
  FindingSeverity,
  RunState,
} from '../../../src/store/derived.ts'
import type { DerivedFindings, DerivedSchedule, DrawnEventSchedule, DrawnSchedule } from '../../../src/store/derived.ts'
import { rungAt } from '../../../src/components/canvas/zoomLadder.ts'
import type { DayConfig } from '../../../src/engine/types.ts'
import { BottleneckRule, Phase } from '../../../src/engine/types.ts'
import { makeBottleneck, makeCompetition, makeConfig, makeScheduleResult, makeStrips } from '../../helpers/factories.ts'
import { installStubResizeObserver, NeverFiringResizeObserver } from '../../helpers/resizeObserver.ts'
import { NO_PINS } from '../../helpers/canvasQueries.ts'
import { drawnFromDerived, runAndMoveHeadline } from '../../helpers/drawnFixtures.ts'

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

type CanvasProps = ComponentProps<typeof Canvas>

/** Mounts the Canvas with the file's usual props; `overrides` replaces any of them. */
function renderCanvas(
  board: Pick<CanvasProps, 'schedule' | 'findings' | 'dayConfigs'>,
  overrides: Partial<CanvasProps> = {},
) {
  return render(
    <Canvas zoom={DEFAULT_ZOOM} findingRows={[]} pinnedIds={NO_PINS} {...board} {...overrides} />,
  )
}

// 013 T028 (part b) — selection (contract §6). selectedCompetitionId/
// selectCompetition are not yet on the store (T029 adds them), so this cast
// is a deliberate, typed reference to a slice that does not exist yet — the
// same pattern __tests__/store/placements.test.ts uses.
interface SelectionSlice {
  selectedCompetitionId: string | null
  selectCompetition: (id: string | null) => void
}
type FutureState = StoreState & SelectionSlice
function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

/** Preset B1, run through the auto-scheduler, read back as the committed model. */
function b1Board(): { schedule: DrawnSchedule; findings: DerivedFindings; dayConfigs: DayConfig[] } {
  applyPreset('B1')
  runScheduleAll()
  const state = useStore.getState()
  return {
    schedule: selectDrawnSchedule(state),
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
  it('renders every strip row of every day, with no culling', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    expect(allStripRows()).toHaveLength(320)
    for (const day of [0, 1, 2, 3]) {
      expect(stripRowsInDay(day)).toHaveLength(80)
    }
  })

  it('scrolls from exactly one native container', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    const scrollers = document.querySelectorAll<HTMLElement>('[data-canvas-scroller]')
    expect(scrollers).toHaveLength(1)
    expect(scrollers[0].style.overflow).toContain('auto')
  })

  it('pins the time axis, every day band and every gutter, and labels ticks 24-hour', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

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
    renderCanvas({ schedule, findings, dayConfigs })

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
    renderCanvas({ schedule, findings, dayConfigs })

    const bandFormat = /^Day \d · \d+ events · finishes (\d\d:\d\d|—) · \d+ of 80 strips at peak · \d+ findings$/
    for (const day of [0, 1, 2, 3]) {
      const text = dayBand(day).textContent ?? ''
      expect(text).toMatch(bandFormat)
      expect(text.startsWith(`Day ${day + 1} ·`)).toBe(true)
    }
  })

  // 017 T6a: the bands read the committed model's blocks and count the strips
  // a block holds, so no band claims more strips than the day has (spec §4).
  it('never states more strips at peak than the board has, after a run or after the headline move', () => {
    const peaks = (): number[] =>
      [0, 1, 2, 3].map((day) => Number(/· (\d+) of 80 strips at peak/.exec(dayBand(day).textContent ?? '')?.[1]))

    renderCanvas(b1Board())
    for (const peak of peaks()) expect(peak).toBeLessThanOrEqual(80)
    cleanup()

    runAndMoveHeadline('B1')
    const state = useStore.getState()
    renderCanvas({ schedule: selectDrawnSchedule(state), findings: selectDerivedFindings(state), dayConfigs: state.dayConfigs })
    for (const peak of peaks()) expect(peak).toBeLessThanOrEqual(80)
  })

  // The band the canvas renders from its committed model, not the live
  // selector: D1-M-EPEE-IND's unseated POOLS (45 asked) and DE_PRELIMS (16)
  // add nothing on the day it moved to, which holds all 80 strips at its
  // busiest instant. The band shows no unplaced count (an owner question at
  // T6a review), so peak strips is the band fact the move changes.
  it('reads "80 of 80 strips at peak" on the day the headline move lands on', () => {
    const { day } = runAndMoveHeadline('B1')
    const state = useStore.getState()
    renderCanvas({ schedule: selectDrawnSchedule(state), findings: selectDerivedFindings(state), dayConfigs: state.dayConfigs })

    expect(day).toBe(1)
    expect(dayBand(day).textContent).toContain('· 80 of 80 strips at peak ·')
  })
})

describe('Canvas zoom (FR-034, D3)', () => {
  it('coarsens tick density at the bottom rung relative to the top rung', () => {
    const { schedule, findings, dayConfigs } = b1Board()

    renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 0, fitting: false } })
    const rung0Ticks = hourTicks().length
    cleanup()

    renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 5, fitting: false } })
    const rung5Ticks = hourTicks().length

    expect(rung0Ticks).toBeGreaterThan(0)
    expect(rung5Ticks).toBeGreaterThan(rung0Ticks)
  })

  it('positions blocks in percent under fitting and in pixels on the ladder', () => {
    const { schedule, findings, dayConfigs } = b1Board()

    renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 2, fitting: true } })
    const fittingBlocks = eventBlocks()
    expect(fittingBlocks.length).toBeGreaterThan(0)
    for (const block of fittingBlocks) {
      expect(block.style.left.endsWith('%')).toBe(true)
      expect(block.style.width.endsWith('%')).toBe(true)
    }
    cleanup()

    renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 2, fitting: false } })
    const laddderBlocks = eventBlocks()
    expect(laddderBlocks.length).toBeGreaterThan(0)
    for (const block of laddderBlocks) {
      expect(block.style.left.endsWith('px')).toBe(true)
      expect(block.style.width.endsWith('px')).toBe(true)
    }
  })

  describe('axis span', () => {
    // A lone one-day block from `start` to `end`, drawn under fitting so its
    // left and width read as percentages of the axis span.
    function blockExtent(days: DayConfig[], start: number, end: number) {
      const config = makeConfig({ days_available: days.length, strips: makeStrips(4, 0) })
      const schedule = drawnFromDerived({
        config,
        competitions: [makeCompetition({ id: 'late' })],
        events: {
          late: {
            result: { ...makeScheduleResult('late', 0), pool_start: start, pool_end: end, pool_strip_count: 2 },
            day_out_of_range: false,
          },
        },
      })
      const findings: DerivedFindings = { validationErrors: [], analysis: { warnings: [], suggestions: [] } }
      const dayConfigs = days

      renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 2, fitting: true } })

      const [block] = eventBlocks()
      return { left: parseFloat(block.style.left), width: parseFloat(block.style.width) }
    }

    // Ops Manual 2026-27 p.17: the soft target is 19:00, but work may run to
    // the 22:00 hard end (METHODOLOGY.md §Same-Day Completion, 024 D7).
    it('spans 09:00 to the 22:00 hard end at the default hours', () => {
      const { left, width } = blockExtent([{ day_start_time: 540, day_end_time: 1140 }], 540, 1320)

      expect(left).toBeCloseTo(0, 1)
      expect(width).toBeCloseTo(100, 1)
    })

    it('runs to 23:00 when the organizer ends the day there, past the hard end', () => {
      const { left, width } = blockExtent([{ day_start_time: 540, day_end_time: 1380 }], 540, 1380)

      expect(left).toBeCloseTo(0, 1)
      expect(width).toBeCloseTo(100, 1)
    })

    it('takes the earliest start and the latest hard end across unequal days', () => {
      const { left, width } = blockExtent(
        [
          { day_start_time: 540, day_end_time: 1380 },
          { day_start_time: 600, day_end_time: 1140 },
        ],
        540,
        1380,
      )

      expect(left).toBeCloseTo(0, 1)
      expect(width).toBeCloseTo(100, 1)
    })
  })

  it('still draws every block at the fit fallback when the plot is never measured', () => {
    globalThis.ResizeObserver = NeverFiringResizeObserver as unknown as typeof ResizeObserver

    const config = makeConfig({ days_available: 1, strips: makeStrips(4, 0) })
    const schedule = drawnFromDerived({
      config,
      competitions: [makeCompetition({ id: 'flagged' })],
      events: {
        flagged: {
          result: { ...makeScheduleResult('flagged', 0), pool_start: 600, pool_end: 700, pool_strip_count: 2 },
          day_out_of_range: false,
        },
      },
    })
    const findings: DerivedFindings = { validationErrors: [], analysis: { warnings: [], suggestions: [] } }
    const dayConfigs: DayConfig[] = [{ day_start_time: 480, day_end_time: 1320 }]
    const expectedBlocks = schedule.blocks.length

    renderCanvas({ schedule, findings, dayConfigs }, { zoom: { zoomStep: 2, fitting: true } })

    expect(eventBlocks()).toHaveLength(expectedBlocks)
  })
})

describe('Canvas selection (013 T028, contract §6)', () => {
  it('calls selectCompetition with the clicked block\'s competition id', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    const block = eventBlocks()[0]
    const competitionId = block.dataset.eventId
    if (!competitionId) throw new Error('block has no data-event-id')

    fireEvent.click(block)

    expect(futureState().selectedCompetitionId).toBe(competitionId)
  })

  it('marks every block of the selected event data-selected="true" and every other block "false"', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    const selectedId = schedule.competitions[0].id
    futureState().selectCompetition(selectedId)

    renderCanvas({ schedule, findings, dayConfigs })

    const blocks = eventBlocks()
    expect(blocks.some((block) => block.dataset.eventId === selectedId)).toBe(true)
    for (const block of blocks) {
      expect(block.dataset.selected).toBe(block.dataset.eventId === selectedId ? 'true' : 'false')
    }
  })
})

// 013 T030 — local mirror of contract phase5-contract.md §1's Finding shape.
// src/store/derived.ts does not export it until T032; the literal below only
// needs to satisfy CanvasProps.findingRows's element type once T032 adds it.
interface Finding {
  id: string
  severity: 'Blocking' | 'Warning' | 'Note' | 'Unplaced'
  where: string
  day: number | null
  message: string
  target: string | null
  dismissable: boolean
  /** 016 Task D: every on-board competition the row names. */
  subjects: string[]
}

describe('Canvas gutter flags (FR-037, 013 T030 contract §4.2)', () => {
  /** One event on two of four strips, so the day also has rows with no
   *  block on them at all — the "another row is not flagged" half of both
   *  cases below. */
  function flaggedFixture(): { schedule: DrawnSchedule; findings: DerivedFindings; dayConfigs: DayConfig[] } {
    const config = makeConfig({ days_available: 1, strips: makeStrips(4, 0) })
    const schedule = drawnFromDerived({
      config,
      competitions: [makeCompetition({ id: 'flagged' })],
      events: {
        flagged: {
          result: { ...makeScheduleResult('flagged', 0), pool_start: 600, pool_end: 700, pool_strip_count: 2 },
          day_out_of_range: false,
        },
      },
    })
    const findings: DerivedFindings = {
      validationErrors: [],
      analysis: {
        warnings: [
          makeBottleneck({ competition_id: 'flagged', message: 'flagged waited for strips' }),
        ],
        suggestions: [],
      },
    }
    const dayConfigs: DayConfig[] = [{ day_start_time: 480, day_end_time: 1320 }]
    return { schedule, findings, dayConfigs }
  }

  const row: Finding = {
    // 016 Task C row id: analysis:<rule>:<owner>:<subjects>:<day or ->.
    id: 'analysis:strip-contention-deferral:flagged:flagged:-',
    severity: 'Warning',
    where: 'Day 1 · flagged',
    day: 0,
    message: 'flagged waited for strips',
    target: 'flagged',
    dismissable: true,
    subjects: ['flagged'],
  }

  it('flags the strip row a findingRows entry targets, and leaves an uninvolved row alone', () => {
    const { schedule, findings, dayConfigs } = flaggedFixture()

    renderCanvas({ schedule, findings, dayConfigs }, { findingRows: [row] })

    // The only phase is derived onto the lowest free strips, 0 and 1, so
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

  it('flags nothing from findings alone once findingRows no longer names the target (red: today\'s flaggedCompetitions(findings) still flags it)', () => {
    const { schedule, findings, dayConfigs } = flaggedFixture()

    renderCanvas({ schedule, findings, dayConfigs })

    const rows = stripRowsInDay(0)
    expect(rows).toHaveLength(4)
    expect(rows[0].dataset.flagged).not.toBe('true')
    expect(rows[1].dataset.flagged).not.toBe('true')
    expect(rows[2].dataset.flagged).not.toBe('true')
    expect(rows[3].dataset.flagged).not.toBe('true')
  })
})

// 013 T030 — jump (contract §4.4). jumpNonce/jumpToCompetition are not yet on
// the store (T032 adds them, per §2.1), so FutureState below is a deliberate,
// typed reference to a slice that does not exist yet, same pattern as
// SelectionSlice above.
interface JumpSlice {
  jumpNonce: number
  jumpToCompetition: (id: string) => void
}
type JumpFutureState = FutureState & JumpSlice
function jumpFutureState(): JumpFutureState {
  return useStore.getState() as unknown as JumpFutureState
}

describe('Canvas jump (013 T030, contract §4.4)', () => {
  let scrollIntoViewMock: ReturnType<typeof vi.fn>
  let originalScrollIntoView: typeof Element.prototype.scrollIntoView

  beforeEach(() => {
    vi.useFakeTimers()
    originalScrollIntoView = Element.prototype.scrollIntoView
    scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock as unknown as typeof Element.prototype.scrollIntoView
  })

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView
    vi.useRealTimers()
  })

  it("scrolls the target's block into view and flashes every block of that event once", () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    const targetId = schedule.competitions[0].id
    act(() => {
      jumpFutureState().jumpToCompetition(targetId)
    })

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(1)
    const scrolledEl = scrollIntoViewMock.mock.contexts[0] as HTMLElement
    expect(scrolledEl.dataset.eventId).toBe(targetId)

    for (const block of eventBlocks()) {
      expect(block.dataset.flash).toBe(block.dataset.eventId === targetId ? 'true' : 'false')
    }

    act(() => {
      vi.advanceTimersByTime(900)
    })

    for (const block of eventBlocks()) {
      expect(block.dataset.flash).not.toBe('true')
    }
  })

  it('flashes again on the next jump', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    const targetId = schedule.competitions[0].id
    act(() => {
      jumpFutureState().jumpToCompetition(targetId)
    })
    act(() => {
      vi.advanceTimersByTime(900)
    })
    act(() => {
      jumpFutureState().jumpToCompetition(targetId)
    })

    expect(scrollIntoViewMock).toHaveBeenCalledTimes(2)
  })

  it('a jump to an event with no drawn block scrolls nothing', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    act(() => {
      jumpFutureState().jumpToCompetition('NOT-ON-THE-BOARD')
    })

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
    for (const block of eventBlocks()) {
      expect(block.dataset.flash).not.toBe('true')
    }
  })

  it('mounting with a nonzero nonce does not scroll', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    // A real, drawn competition so an unguarded implementation has something
    // to scroll to — the prior version of this case left
    // selectedCompetitionId null, so no element could ever match and the
    // assertion passed regardless of whether the guard worked.
    const targetId = schedule.competitions[0].id
    useStore.setState({
      jumpNonce: 3,
      selectedCompetitionId: targetId,
    } as unknown as Partial<StoreState>)

    renderCanvas({ schedule, findings, dayConfigs })

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
  })

  it('mounting under StrictMode with a nonzero nonce does not scroll or flash (013 T032 follow-up)', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    const targetId = schedule.competitions[0].id
    useStore.setState({
      jumpNonce: 3,
      selectedCompetitionId: targetId,
    } as unknown as Partial<StoreState>)

    render(
      <StrictMode>
        <Canvas schedule={schedule} findings={findings} dayConfigs={dayConfigs} zoom={DEFAULT_ZOOM} findingRows={[]} pinnedIds={NO_PINS} />
      </StrictMode>,
    )

    expect(scrollIntoViewMock).not.toHaveBeenCalled()
    for (const block of eventBlocks()) {
      expect(block.dataset.flash).not.toBe('true')
    }
  })
})

describe('Canvas findings edge (FR-042, 013 T048)', () => {
  function findingRow(severity: Finding['severity'], target: string): Finding {
    return {
      id: `test:${severity}:${target}`,
      severity,
      where: `Day 1 · ${target}`,
      day: 0,
      message: `${severity} for ${target}`,
      target,
      dismissable: severity === 'Warning' || severity === 'Unplaced',
      subjects: [target],
    }
  }

  function blocksOf(id: string): HTMLElement[] {
    return eventBlocks().filter((b) => b.dataset.eventId === id)
  }

  /** B1 run, then the headline Move day: the moved event keeps a seated phase and has unseated ones. */
  function movedBoard(): { schedule: DrawnSchedule; findings: DerivedFindings; dayConfigs: DayConfig[] } {
    runAndMoveHeadline('B1')
    const state = useStore.getState()
    return {
      schedule: selectDrawnSchedule(state),
      findings: selectDerivedFindings(state),
      dayConfigs: state.dayConfigs,
    }
  }

  /** An event the moved board draws with both a seated block and an unseated one. */
  function eventWithUnseated(): string {
    const unseated = eventBlocks().find((b) => b.dataset.unseated === 'true')
    if (!unseated?.dataset.eventId) throw new Error('fixture has no unseated block')
    return unseated.dataset.eventId
  }

  /** Every block reports 'true' only if it belongs to `targetId`, the overflow lane's included (spec §6). */
  function expectWarnedOnly(targetId: string | null): void {
    for (const b of eventBlocks()) {
      const expected = b.dataset.eventId === targetId
      expect(b.dataset.warned, b.dataset.eventBlock).toBe(expected ? 'true' : 'false')
    }
  }

  function guardTarget(targetId: string): void {
    const blocks = blocksOf(targetId)
    expect(blocks.some((b) => b.dataset.unseated !== 'true')).toBe(true)
    expect(blocks.some((b) => b.dataset.unseated === 'true')).toBe(true)
  }

  /** The id of a B1 event that is not `id`. */
  function otherThan(competitions: { id: string }[], id: string): string {
    const other = competitions.find((c) => c.id !== id)
    if (!other) throw new Error('fixture has one event')
    return other.id
  }

  it.each(['Warning', 'Unplaced', 'Blocking'] as const)(
    'marks every block of the event a committed %s row targets, its unseated block included, and no other event',
    (severity) => {
      const { schedule, findings, dayConfigs } = movedBoard()
      // Learn the target from a first render, since only a drawn board shows which event is unseated.
      const probe = renderCanvas({ schedule, findings, dayConfigs })
      const targetId = eventWithUnseated()
      probe.unmount()
      const otherId = otherThan(schedule.competitions, targetId)

      // A mixed list: a Note on another event must not mark it.
      renderCanvas(
        { schedule, findings, dayConfigs },
        { findingRows: [findingRow('Note', otherId), findingRow(severity, targetId)] },
      )

      guardTarget(targetId)
      expect(blocksOf(otherId).length).toBeGreaterThan(0)
      expectWarnedOnly(targetId)
    },
  )

  it('leaves the event alone when only a Note targets it', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    const targetId = schedule.competitions[0].id

    renderCanvas({ schedule, findings, dayConfigs }, { findingRows: [findingRow('Note', targetId)] })

    expect(blocksOf(targetId).length).toBeGreaterThan(0)
    expectWarnedOnly(null)
  })

  it('follows the committed findingRows prop, not the store', () => {
    // 017 T5a: a run leaves B1 with no Unplaced row, so the live one comes from
    // the headline Move day, whose moved event finds no free strips.
    runAndMoveHeadline('B1')
    const state = useStore.getState()
    const schedule = selectDrawnSchedule(state)
    const findings = selectDerivedFindings(state)
    const dayConfigs = state.dayConfigs
    // The live store rates this event Unplaced, but the committed list does not.
    const live = selectFindings(useStore.getState()).find(
      (r) => r.severity === FindingSeverity.UNPLACED && r.target !== null,
    )
    if (!live?.target) throw new Error('fixture has no live Unplaced row')
    const liveTarget = live.target

    const canvasWith = (findingRows: Finding[]) => (
      <Canvas
        schedule={schedule}
        findings={findings}
        dayConfigs={dayConfigs}
        zoom={DEFAULT_ZOOM}
        findingRows={findingRows}
        pinnedIds={NO_PINS}
      />
    )
    const { rerender } = render(canvasWith([]))
    expect(blocksOf(liveTarget).length).toBeGreaterThan(0)
    expectWarnedOnly(null)

    // Only the prop can turn it on.
    const propTarget = schedule.competitions[0].id
    rerender(canvasWith([findingRow('Warning', propTarget)]))
    expect(placedBlocksOfNonEmpty(propTarget)).toBe(true)
    expectWarnedOnly(propTarget)

    rerender(canvasWith([]))
    expectWarnedOnly(null)
  })

  function placedBlocksOfNonEmpty(id: string): boolean {
    return blocksOf(id).some((b) => b.dataset.unseated !== 'true')
  }
})

describe('Canvas pin badge (FR-042, 013 T046)', () => {
  it('reads the pinned set it is handed, not the store’s placements', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    const pinnedId = schedule.competitions[0].id
    const otherId = schedule.competitions[1].id
    // The store pins `otherId` while the prop pins only `pinnedId`, so a Canvas
    // that reads the store at all marks the wrong block.
    useStore.getState().setPinned(otherId, true)
    expect(useStore.getState().placements[otherId]?.pinned).toBe(true)

    renderCanvas({ schedule, findings, dayConfigs }, { pinnedIds: new Set([pinnedId]) })

    const pinnedBlocks = eventBlocks().filter((b) => b.dataset.eventId === pinnedId)
    const otherBlocks = eventBlocks().filter((b) => b.dataset.eventId === otherId)
    expect(pinnedBlocks.length).toBeGreaterThan(0)
    expect(otherBlocks.length).toBeGreaterThan(0)
    expect(pinnedBlocks.every((b) => b.dataset.pinned === 'true')).toBe(true)
    expect(otherBlocks.every((b) => b.dataset.pinned === 'false')).toBe(true)
  })
})

describe('Canvas two-event findings (016 spec §4, R3, Task D)', () => {
  const OWNER = 'owner'
  const PARTNER = 'partner'
  const BYSTANDER = 'bystander'
  const PAIR_MESSAGE = 'owner and partner may never share a day'

  /** Three events with a pool and a DE block each, on separate strips of one day. */
  function pairBoard(bottlenecks: ReturnType<typeof makeBottleneck>[]): {
    schedule: DrawnSchedule
    findings: DerivedFindings
    dayConfigs: DayConfig[]
  } {
    const config = makeConfig({ days_available: 1, strips: makeStrips(12, 0) })
    const events: DerivedSchedule['events'] = {}
    const ids = [OWNER, PARTNER, BYSTANDER]
    ids.forEach((id, i) => {
      events[id] = {
        result: {
          ...makeScheduleResult(id, 0),
          pool_start: 480 + i * 10,
          pool_end: 600 + i * 10,
          pool_strip_count: 2,
          de_start: 660 + i * 10,
          de_end: 780 + i * 10,
          de_strip_count: 2,
        },
        day_out_of_range: false,
      }
    })
    return {
      schedule: drawnFromDerived({ config, competitions: ids.map((id) => makeCompetition({ id })), events }),
      findings: { validationErrors: [], analysis: { warnings: bottlenecks, suggestions: [] } },
      dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
    }
  }

  function pairBottleneck(
    rule: string,
    message: string,
    phase: Phase = Phase.POOLS,
    owner: string = OWNER,
  ): ReturnType<typeof makeBottleneck> {
    return makeBottleneck({
      competition_id: owner,
      subjects: [OWNER, PARTNER],
      phase,
      rule,
      message,
    })
  }

  function pairRow(rule: string, message: string): Finding {
    return {
      id: `analysis:${rule}:${OWNER}:${OWNER}+${PARTNER}:0`,
      severity: 'Warning',
      where: `Day 1 · ${OWNER}`,
      day: 0,
      message,
      target: OWNER,
      dismissable: false,
      subjects: [OWNER, PARTNER],
    }
  }

  function blocksOf(id: string): HTMLElement[] {
    return eventBlocks().filter((b) => b.dataset.eventId === id)
  }

  /** Opens the tooltip on one block and returns the text of its findings field. */
  function findingsText(block: HTMLElement): string {
    fireEvent.pointerEnter(block)
    const el = document.querySelector('[data-tooltip-field="findings"]')
    if (!el) throw new Error('no findings field rendered')
    const text = el.textContent ?? ''
    fireEvent.pointerLeave(block)
    return text
  }

  function occurrences(text: string, needle: string): number {
    return text.split(needle).length - 1
  }

  it.each([
    { rule: BottleneckRule.HARD_SEPARATION_VIOLATED, phase: Phase.DAY_ASSIGNMENT, owner: OWNER },
    { rule: BottleneckRule.FLIGHTING_GROUP_BOTH_VIDEO, phase: Phase.DE, owner: PARTNER },
  ])('shows a $rule finding on every block of both events, in every phase', ({ rule, phase, owner }) => {
    const { schedule, findings, dayConfigs } = pairBoard([pairBottleneck(rule, PAIR_MESSAGE, phase, owner)])
    renderCanvas({ schedule, findings, dayConfigs })

    for (const id of [OWNER, PARTNER]) {
      const blocks = blocksOf(id)
      expect(new Set(blocks.map((b) => b.dataset.phase)).size, `${id} phases`).toBeGreaterThan(1)
      for (const block of blocks) {
        expect(findingsText(block), `${id} ${block.dataset.phase}`).toContain(PAIR_MESSAGE)
      }
    }
    for (const block of blocksOf(BYSTANDER)) {
      expect(findingsText(block)).not.toContain(PAIR_MESSAGE)
    }
  })

  it("keeps the pair message on the owner's blocks when the owner also has a single-subject finding", () => {
    const { schedule, findings, dayConfigs } = pairBoard([
      pairBottleneck(BottleneckRule.HARD_SEPARATION_VIOLATED, PAIR_MESSAGE),
      makeBottleneck({ competition_id: OWNER, phase: Phase.DE, message: 'de only' }),
    ])
    renderCanvas({ schedule, findings, dayConfigs })

    for (const block of blocksOf(OWNER)) {
      expect(findingsText(block), block.dataset.phase).toContain(PAIR_MESSAGE)
    }
    const de = blocksOf(OWNER).find((b) => b.dataset.phase === Phase.DE)
    if (!de) throw new Error('fixture lacks a DE block')
    expect(findingsText(de)).toContain('de only')
  })

  it.each([2, 3])('lists a shared message once per block when %i mirrored warnings carry it', (count) => {
    const ids = [OWNER, PARTNER, BYSTANDER].slice(0, count)
    const mirrored = ids.map((id) =>
      makeBottleneck({
        competition_id: id,
        subjects: ids,
        phase: Phase.DE,
        rule: BottleneckRule.MULTIPLE_FLIGHTED_SAME_DAY,
        message: PAIR_MESSAGE,
      }),
    )
    const { schedule, findings, dayConfigs } = pairBoard(mirrored)
    renderCanvas({ schedule, findings, dayConfigs })

    for (const id of ids) {
      for (const block of blocksOf(id)) {
        expect(occurrences(findingsText(block), PAIR_MESSAGE), `${id} ${block.dataset.phase}`).toBe(1)
      }
    }
  })

  it('lists a two-event message once per block, even when the event also owns a matching phase', () => {
    const { schedule, findings, dayConfigs } = pairBoard([
      pairBottleneck(BottleneckRule.HARD_SEPARATION_VIOLATED, PAIR_MESSAGE),
    ])
    renderCanvas({ schedule, findings, dayConfigs })

    for (const block of [...blocksOf(OWNER), ...blocksOf(PARTNER)]) {
      expect(occurrences(findingsText(block), PAIR_MESSAGE), block.dataset.eventId).toBe(1)
    }
  })

  it('draws the findings edge on every block of both events a two-event row names', () => {
    const { schedule, findings, dayConfigs } = pairBoard([])
    renderCanvas(
      { schedule, findings, dayConfigs },
      { findingRows: [pairRow(BottleneckRule.HARD_SEPARATION_VIOLATED, PAIR_MESSAGE)] },
    )

    for (const id of [OWNER, PARTNER]) {
      for (const block of blocksOf(id)) {
        expect(block.dataset.warned, `${id} ${block.dataset.phase}`).toBe('true')
      }
    }
    for (const block of blocksOf(BYSTANDER)) expect(block.dataset.warned).toBe('false')
  })

  it('flags exactly the strip rows of both events a two-event row names', () => {
    const { schedule, findings, dayConfigs } = pairBoard([])
    renderCanvas(
      { schedule, findings, dayConfigs },
      { findingRows: [pairRow(BottleneckRule.HARD_SEPARATION_VIOLATED, PAIR_MESSAGE)] },
    )

    const stripsOf = (id: string): string[] =>
      blocksOf(id).flatMap((block) => (block.dataset.strips ?? '').split(',').filter((strip) => strip !== ''))
    const expected = [...new Set([...stripsOf(OWNER), ...stripsOf(PARTNER)])].sort()
    const flagged = stripRowsInDay(0)
      .filter((r) => r.dataset.flagged === 'true')
      .map((r) => r.dataset.stripRow as string)
      .sort()

    expect(flagged).toEqual(expected)
    for (const strip of stripsOf(BYSTANDER)) {
      expect(flagged, `bystander strip ${strip}`).not.toContain(strip)
    }
  })

  it('still narrows a single-subject bottleneck to the block phase', () => {
    const { schedule, findings, dayConfigs } = pairBoard([
      makeBottleneck({ competition_id: OWNER, phase: Phase.POOLS, message: 'pools only' }),
      makeBottleneck({ competition_id: OWNER, phase: Phase.DE, message: 'de only' }),
    ])
    renderCanvas({ schedule, findings, dayConfigs })

    const pool = blocksOf(OWNER).find((b) => b.dataset.phase === Phase.POOLS)
    const de = blocksOf(OWNER).find((b) => b.dataset.phase === Phase.DE)
    if (!pool || !de) throw new Error('fixture lacks a pool or DE block')
    expect(findingsText(pool)).toContain('pools only')
    expect(findingsText(pool)).not.toContain('de only')
    expect(findingsText(de)).toContain('de only')
    expect(findingsText(de)).not.toContain('pools only')
  })
})

describe('Canvas draws the scheduler\'s strips (017 T6b, spec §6)', () => {
  const ROW = rungAt(DEFAULT_ZOOM.zoomStep).row
  const PPM = rungAt(DEFAULT_ZOOM.zoomStep).ppm
  const DAY_START = 480
  const DAY_CONFIGS: DayConfig[] = [
    { day_start_time: DAY_START, day_end_time: 1320 },
    { day_start_time: DAY_START, day_end_time: 1320 },
  ]
  const NO_FINDINGS: DerivedFindings = { validationErrors: [], analysis: { warnings: [], suggestions: [] } }

  type Entry = [id: string, start: number, end: number, stripCount: number, kept: number[] | null, day?: number]

  /** A hand-built drawn model: `kept` entries keep their strip indices, the rest are derived around them. */
  function board(entries: Entry[], runState: RunState = RunState.FRESH, stripsTotal = 8): DrawnSchedule {
    const config = makeConfig({ days_available: 2, strips: makeStrips(stripsTotal, 0) })
    const events: Record<string, DrawnEventSchedule> = {}
    for (const [id, start, end, stripCount, kept, day = 0] of entries) {
      events[id] = {
        result: {
          ...makeScheduleResult(id, day),
          pool_start: start,
          pool_end: end,
          pool_strip_count: stripCount,
        },
        day_out_of_range: false,
        keptStrips: kept === null ? null : { [Phase.POOLS]: kept },
        source: kept === null ? 'derived' : 'kept',
      }
    }
    const competitions = entries.map(([id]) => makeCompetition({ id }))
    return drawnScheduleFrom(config, competitions, events, runState)
  }

  function draw(schedule: DrawnSchedule): void {
    renderCanvas({ schedule, findings: NO_FINDINGS, dayConfigs: DAY_CONFIGS })
  }

  /** Every rect of one phase, the first run first. */
  function rectsOf(id: string): HTMLElement[] {
    return Array.from(
      document.querySelectorAll<HTMLElement>(`[data-event-block="${id}:POOLS"], [data-block-run="${id}:POOLS"]`),
    )
  }

  it('draws a kept phase with a split index set as one rect per run, at those strips, under one event block', () => {
    draw(board([['K', 600, 700, 4, [0, 1, 5, 6]]]))

    const rects = rectsOf('K')
    expect(document.querySelectorAll('[data-event-block]')).toHaveLength(1)
    expect(rects).toHaveLength(2)
    expect(rects.map((rect) => rect.style.top)).toEqual([`${0 * ROW + 2}px`, `${5 * ROW + 2}px`])
    expect(rects.map((rect) => rect.style.height)).toEqual([`${2 * ROW - 4}px`, `${2 * ROW - 4}px`])
    for (const rect of rects) expect(rect.style.left).toBe(`${(600 - DAY_START) * PPM}px`)
    expect(rects[0].dataset.strips).toBe('0,1,5,6')
    expect(rects[0].dataset.stripCount).toBe('4')
    expect(rects[0].dataset.unseated).toBe('false')
  })

  it('draws a phase held on one run as a single rect', () => {
    draw(board([['K', 600, 700, 3, [2, 3, 4]]]))

    expect(rectsOf('K')).toHaveLength(1)
    expect(document.querySelector('[data-overflow-lane]')).toBeNull()
  })

  it('draws an unseated phase in its day\'s overflow lane at its time, holding no strip', () => {
    draw(board([
      ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
      ['A', 630, 690, 2, null],
    ]))

    const lane = document.querySelector<HTMLElement>('[data-overflow-lane][data-day="0"]')
    expect(lane).not.toBeNull()
    const [rect] = rectsOf('A')
    expect(lane?.contains(rect)).toBe(true)
    expect(rect.dataset.unseated).toBe('true')
    expect(rect.dataset.strips).toBe('')
    expect(rect.dataset.start).toBe('630')
    expect(rect.style.left).toBe(`${(630 - DAY_START) * PPM}px`)
    expect(document.querySelector('[data-day-plot="0"]')?.contains(rect)).toBe(false)
    // The seated phase stays in the strip plot.
    expect(lane?.contains(rectsOf('K')[0])).toBe(false)
  })

  it('opens an overflow lane only on a day that has an unseated phase', () => {
    // Day 1 is empty, so B finds room there and draws on strips.
    draw(board([
      ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
      ['A', 630, 690, 2, null],
      ['B', 630, 690, 2, null, 1],
    ]))

    expect(document.querySelectorAll('[data-overflow-lane]')).toHaveLength(1)
    expect(document.querySelector('[data-overflow-lane][data-day="0"]')).not.toBeNull()
    expect(rectsOf('B')[0].dataset.unseated).toBe('false')
  })

  it('stacks unseated phases that overlap in time on separate lane rows and reuses a row once its phase has ended', () => {
    // C starts exactly when A ends, so it takes A's row back (the interval is half-open).
    draw(board([
      ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
      ['A', 630, 690, 2, null],
      ['B', 650, 710, 2, null],
      ['C', 690, 750, 2, null],
    ]))

    const lane = document.querySelector<HTMLElement>('[data-overflow-lane][data-day="0"]')
    const tops = ['A', 'B', 'C'].map((id) => rectsOf(id)[0].style.top)
    expect(tops).toEqual(['2px', `${ROW + 2}px`, '2px'])
    for (const id of ['A', 'B', 'C']) expect(lane?.contains(rectsOf(id)[0])).toBe(true)
    // Two rows, so the second cannot spill into the next day group.
    expect(lane?.style.height).toBe(`${2 * ROW}px`)
  })

  it('still draws an unseated phase in the lane on a stale board, where it counts as nothing', () => {
    const schedule = board([
      ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
      ['A', 630, 690, 2, null],
    ], RunState.STALE)
    draw(schedule)

    const lane = document.querySelector<HTMLElement>('[data-overflow-lane][data-day="0"]')
    const [rect] = rectsOf('A')
    expect(lane?.contains(rect)).toBe(true)
    expect(rect.dataset.unseated).toBe('true')
    expect(schedule.unplacedIds.size).toBe(0)
    expect(schedule.blocks.filter((block) => block.unseated).every((block) => !block.countsAsUnplaced)).toBe(true)
  })

  it('runs the plot\'s hour lines on through the overflow lane', () => {
    draw(board([
      ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
      ['A', 630, 690, 2, null],
    ]))

    const lane = document.querySelector<HTMLElement>('[data-overflow-lane][data-day="0"]')
    const plot = document.querySelector<HTMLElement>('[data-day-plot="0"]')
    expect(plot?.style.backgroundImage).not.toBe('')
    expect(lane?.style.backgroundImage).toBe(plot?.style.backgroundImage)
  })

  it('flags the strip rows of every run of a flagged phase and no row between them', () => {
    const schedule = board([['K', 600, 700, 4, [0, 1, 5, 6]]])
    const row: Finding = {
      id: 'test:Warning:K', severity: 'Warning', where: 'Day 1 · K', day: 0,
      message: 'K', target: 'K', dismissable: true, subjects: ['K'],
    }
    renderCanvas({ schedule, findings: NO_FINDINGS, dayConfigs: DAY_CONFIGS }, { findingRows: [row] })

    const flagged = stripRowsInDay(0).map((strip) => strip.dataset.flagged === 'true')
    expect(flagged).toEqual([true, true, false, false, false, true, true, false])
  })

  describe('a continuation run', () => {
    const SPLIT = board([['K', 600, 700, 4, [0, 1, 5, 6]]])
    const warnedRow: Finding = {
      id: 'test:Warning:K', severity: 'Warning', where: 'Day 1 · K', day: 0,
      message: 'K', target: 'K', dismissable: true, subjects: ['K'],
    }

    it('draws the findings edge, as the first run does', () => {
      renderCanvas({ schedule: SPLIT, findings: NO_FINDINGS, dayConfigs: DAY_CONFIGS }, { findingRows: [warnedRow] })

      const continuation = rectsOf('K')[1]
      expect({
        width: continuation.style.borderWidth,
        style: continuation.style.borderStyle,
        color: continuation.style.borderColor,
      }).toEqual({ width: '2px', style: 'solid', color: 'var(--flash)' })
    })

    it('selects its competition on click, and both rects wear the selection ring', () => {
      draw(SPLIT)

      fireEvent.click(rectsOf('K')[1])

      expect(useStore.getState().selectedCompetitionId).toBe('K')
      const [first, continuation] = rectsOf('K')
      expect(first.dataset.selected).toBe('true')
      expect(first.querySelector('[data-ring]')).not.toBeNull()
      expect(continuation.querySelector('[data-ring]')).not.toBeNull()
    })

    it('opens its phase\'s tooltip on hover, naming every run of the strips', () => {
      draw(SPLIT)

      fireEvent.pointerEnter(rectsOf('K')[1])

      expect(document.querySelector('[data-tooltip-field="strips"]')?.textContent).toBe('Strips 1–2, 6–7')
    })
  })

  describe('blocks are keyboard buttons (017 T7, spec §6)', () => {
    /** Every element a Tab press can land on, in document order. */
    function tabStops(): HTMLElement[] {
      return Array.from(document.querySelectorAll<HTMLElement>('button, [tabindex]')).filter(
        (el) => el.tabIndex >= 0,
      )
    }

    it('offers one button per phase and none for a continuation run', () => {
      draw(board([
        ['K', 600, 700, 4, [0, 1, 5, 6]],
        ['A', 630, 690, 8, null],
      ]))

      const [first, continuation] = rectsOf('K')
      expect(rectsOf('K')).toHaveLength(2)
      expect(screen.getAllByRole('button')).toHaveLength(2)
      // The accessible name is the phase's own, found by the exact string a driver passes.
      const name = first.getAttribute('aria-label') ?? ''
      expect(screen.getAllByRole('button', { name })).toEqual([first])
      expect(continuation.tagName).not.toBe('BUTTON')
      expect(continuation.tabIndex).toBe(-1)
      expect(tabStops()).not.toContain(continuation)
    })

    it('makes an overflow-lane block a button too', () => {
      draw(board([
        ['K', 600, 700, 8, [0, 1, 2, 3, 4, 5, 6, 7]],
        ['A', 630, 690, 2, null],
      ]))

      const [lane] = rectsOf('A')
      expect(lane.dataset.unseated).toBe('true')
      expect(lane.tagName).toBe('BUTTON')
      expect(tabStops()).toContain(lane)
    })

    it('tabs through every phase of a run board, day by day, and through nothing else', () => {
      const { schedule, findings, dayConfigs } = b1Board()
      renderCanvas({ schedule, findings, dayConfigs })

      const stops = tabStops()
      expect(stops).toEqual(eventBlocks())
      expect(stops).toHaveLength(schedule.blocks.length)
      const days = stops.map((stop) => Number(stop.dataset.day))
      expect(days).toEqual([...days].sort((a, b) => a - b))
      for (const stop of stops) expect(stop.tagName).toBe('BUTTON')
    })
  })

  it('draws no overflow lane for a board that was run', () => {
    const { schedule, findings, dayConfigs } = b1Board()
    renderCanvas({ schedule, findings, dayConfigs })

    expect(document.querySelectorAll('[data-overflow-lane]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-event-block][data-unseated="true"]')).toHaveLength(0)
  })
})
