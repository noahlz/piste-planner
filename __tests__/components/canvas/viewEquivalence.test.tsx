import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MatrixCanvas } from '../../../src/components/canvas/MatrixCanvas.tsx'
import { ScheduleOutput } from '../../../src/components/sections/ScheduleOutput.tsx'
import { CenterView } from '../../../src/components/workbench/CenterView.tsx'
import { deriveEventSchedule } from '../../../src/engine/derive.ts'
import type { DerivedEventSchedule } from '../../../src/engine/derive.ts'
import type { Competition, Placement, TournamentConfig } from '../../../src/engine/types.ts'
import { DeMode } from '../../../src/engine/types.ts'
import type { DerivedSchedule } from '../../../src/store/derived.ts'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  saveViewState,
  type ViewState,
} from '../../../src/store/viewState.ts'
import {
  makeCompetition,
  makeConfig,
  makePlacement,
  makeStrips,
} from '../../helpers/factories.ts'

// 004 T031 — view equivalence (contracts/ui-contract.md §View equivalence
// contract, FR-023).
//
// The contract: for one tournament state the set of
// (event, day, start, end, strips) tuples is identical in the matrix and in
// the schedule table. Both halves are extracted from RENDERED DOM — never from
// the derived model — because a view compared against the model it reads is
// only being compared with itself, and the failure this test exists to catch
// is the two views drifting apart.
//
// The tuple set is additionally asserted against literals. Set equality alone
// passes when both views break the same way, which is precisely what happens
// when a shared helper changes underneath them.
//
// Times: the table renders `H:MM` (src/lib/time.ts) while the matrix's markers
// carry minutes from midnight. The TABLE side is normalised to minutes by
// parsing the clock string, so the expected set below is one set of literal
// minute values rather than two parallel expectations. One case additionally
// pins the table's raw strings, so the formatter itself cannot drift unnoticed.
//
// A flighted event is built through the engine rather than through the store:
// `buildConfig.ts` sets `flighted: false` on every competition and only ever
// raises it together with a non-null `flighting_group_id`, while `derive.ts`
// splits into FLIGHT_A/FLIGHT_B only for `flighted && flighting_group_id ===
// null`. So no store state produces a flight pair, and both views are handed
// the same committed `DerivedSchedule` object instead — which is exactly the
// "one derived model, two views" arrangement the contract is about.

const VIEWPORT_WIDTH = 900
// 50 rows at the 24px normal step. The fixture's furthest block sits on flat
// row 39 (day 1, strip 15), so every block is inside the window and nothing is
// culled by FR-021's windowing.
const VIEWPORT_HEIGHT = 1200

class StubResizeObserver {
  callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(): void {
    this.callback(
      [{ contentRect: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }

  unobserve(): void {}
  disconnect(): void {}
}

const originalResizeObserver = globalThis.ResizeObserver

beforeEach(() => {
  globalThis.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
  // 828px of plot from 08:00 at 1 min/px spans [480, 1308) — past the 1030 the
  // last block ends at.
  seedViewState({ timeScroll: 480, timeZoom: 1, rowScroll: 0 })
})

afterEach(() => {
  globalThis.ResizeObserver = originalResizeObserver
  vi.useRealTimers()
})

function seedViewState(overrides: Partial<ViewState>): void {
  saveViewState({ ...DEFAULT_VIEW_STATE, ...overrides })
}

const CONFIG: TournamentConfig = makeConfig({
  days_available: 3,
  strips: makeStrips(24, 4),
})

interface Shape {
  competition: Competition
  placement: Placement
}

/**
 * Three shapes the derived model produces, each reaching the two views by a
 * different field of `ScheduleResult`:
 *
 *  - plain   POOLS + a single DE
 *  - flighted FLIGHT_A + FLIGHT_B, with `pool_start`/`pool_end` spanning both
 *  - staged  POOLS + DE_PRELIMS + DE_ROUND_OF_16, with `de_start` null
 */
const SHAPES: Record<string, Shape> = {
  plain: {
    competition: makeCompetition({ id: 'plain' }),
    placement: makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
  },
  flighted: {
    competition: makeCompetition({ id: 'flighted', flighted: true }),
    placement: makePlacement({ day: 1, start_time: 480, strip_count: 4 }),
  },
  staged: {
    competition: makeCompetition({ id: 'staged', de_mode: DeMode.STAGED, fencer_count: 64 }),
    placement: makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
  },
}

function derivedModel(shapes: Record<string, Shape>): DerivedSchedule {
  const events: Record<string, DerivedEventSchedule> = {}
  for (const [id, shape] of Object.entries(shapes)) {
    events[id] = deriveEventSchedule(shape.placement, shape.competition, CONFIG)
  }
  return {
    config: CONFIG,
    competitions: Object.values(shapes).map((s) => s.competition),
    events,
  }
}

/** `H:MM` back to minutes from midnight — the table's half of the normalisation. */
function minutesFromClock(text: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
  if (!match) throw new Error(`not an H:MM time: "${text}"`)
  return Number(match[1]) * 60 + Number(match[2])
}

/** One event's tuple, rendered as a comparable line. */
function tuple(
  id: string,
  day: number,
  poolStart: number,
  poolEnd: number,
  deStart: number,
  deEnd: number,
  strips: number,
): string {
  return `${id} day=${day} pool=${poolStart}-${poolEnd} de=${deStart}-${deEnd} strips=${strips}`
}

function cellText(rowId: string, cell: string): string {
  const el = document.querySelector(`[data-schedule-row="${rowId}"] [data-cell="${cell}"]`)
  if (!el) throw new Error(`no "${cell}" cell in schedule row ${rowId}`)
  return el.textContent ?? ''
}

function tableRowIds(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-schedule-row]')).map(
    (el) => el.dataset.scheduleRow ?? '',
  )
}

/** The table's tuples, with its 1-based day and `H:MM` times normalised. */
function tableTuples(): string[] {
  return tableRowIds()
    .map((id) =>
      tuple(
        id,
        Number(cellText(id, 'day').replace(/\D+/g, '')) - 1,
        minutesFromClock(cellText(id, 'poolStart')),
        minutesFromClock(cellText(id, 'poolEnd')),
        minutesFromClock(cellText(id, 'deStart')),
        minutesFromClock(cellText(id, 'deEnd')),
        Number(cellText(id, 'strips')),
      ),
    )
    .sort()
}

interface Block {
  day: number
  start: number
  end: number
  strips: number
}

function blocksFor(id: string): Map<string, Block> {
  const found = new Map<string, Block>()
  for (const el of document.querySelectorAll<HTMLElement>(`[data-event-id="${id}"]`)) {
    found.set(el.dataset.phase ?? '', {
      day: Number(el.dataset.day),
      start: Number(el.dataset.start),
      end: Number(el.dataset.end),
      strips: Number(el.dataset.strips),
    })
  }
  return found
}

function requireBlock(blocks: Map<string, Block>, phase: string, id: string): Block {
  const found = blocks.get(phase)
  if (!found) throw new Error(`no ${phase} block drawn for ${id}`)
  return found
}

/**
 * The matrix's tuples, assembled from the blocks it drew. A flighted event's
 * pool interval spans flight A's start to flight B's end and its strips are
 * the two flights summed, matching what `derive.ts` puts in
 * `pool_start`/`pool_end`/`pool_strip_count`; a staged event's DE interval runs
 * from the prelims to the end of the round of 16.
 */
function matrixTuples(): string[] {
  const ids = new Set(
    Array.from(document.querySelectorAll<HTMLElement>('[data-event-id]')).map(
      (el) => el.dataset.eventId ?? '',
    ),
  )

  return Array.from(ids)
    .map((id) => {
      const blocks = blocksFor(id)

      const flightA = blocks.get('FLIGHT_A')
      const pool = flightA
        ? {
            day: flightA.day,
            start: flightA.start,
            end: requireBlock(blocks, 'FLIGHT_B', id).end,
            strips: flightA.strips + requireBlock(blocks, 'FLIGHT_B', id).strips,
          }
        : requireBlock(blocks, 'POOLS', id)

      const single = blocks.get('DE')
      const de = single
        ? single
        : {
            day: requireBlock(blocks, 'DE_PRELIMS', id).day,
            start: requireBlock(blocks, 'DE_PRELIMS', id).start,
            end: requireBlock(blocks, 'DE_ROUND_OF_16', id).end,
            strips: requireBlock(blocks, 'DE_PRELIMS', id).strips,
          }

      return tuple(id, pool.day, pool.start, pool.end, de.start, de.end, pool.strips)
    })
    .sort()
}

/**
 * The literal tuple set. Every number here was read once from the engine's own
 * output and written down — never recomputed here from the same expressions
 * either view uses, which is the shape of assertion that cannot fail.
 */
const EXPECTED_TUPLES = [
  tuple('flighted', 1, 480, 720, 750, 834, 4),
  tuple('plain', 0, 480, 585, 615, 699, 4),
  tuple('staged', 0, 480, 846, 880, 1030, 4),
].sort()

function renderBothViews(model: DerivedSchedule): void {
  render(
    <>
      <ScheduleOutput schedule={model} />
      <MatrixCanvas schedule={model} />
    </>,
  )
}

describe('the matrix and the schedule table cannot disagree (FR-023)', () => {
  it('reports the same tuples in both views, and the tuples the engine derived', () => {
    renderBothViews(derivedModel(SHAPES))

    const fromTable = tableTuples()
    const fromMatrix = matrixTuples()

    expect(fromTable).toHaveLength(3)
    expect(fromMatrix).toEqual(fromTable)
    // Both views breaking in the same direction still fails here.
    expect(fromTable).toEqual(EXPECTED_TUPLES)
  })

  it('spans both flights in the pool interval rather than drawing over the gap between them', () => {
    renderBothViews(derivedModel(SHAPES))

    const blocks = blocksFor('flighted')
    expect(Array.from(blocks.keys()).sort()).toEqual(['DE', 'FLIGHT_A', 'FLIGHT_B'])
    expect(blocks.get('FLIGHT_A')).toEqual({ day: 1, start: 480, end: 585, strips: 2 })
    expect(blocks.get('FLIGHT_B')).toEqual({ day: 1, start: 615, end: 720, strips: 2 })
    // No single POOLS block covering 480-720: that would paint the 585-615 gap
    // between the flights as pool time.
    expect(blocks.get('POOLS')).toBeUndefined()
  })

  it('draws a staged event as prelims and a round of 16, never as one DE block', () => {
    renderBothViews(derivedModel(SHAPES))

    const blocks = blocksFor('staged')
    expect(Array.from(blocks.keys()).sort()).toEqual(['DE_PRELIMS', 'DE_ROUND_OF_16', 'POOLS'])
    expect(blocks.get('DE_PRELIMS')).toEqual({ day: 0, start: 880, end: 885, strips: 16 })
    expect(blocks.get('DE_ROUND_OF_16')).toEqual({ day: 0, start: 915, end: 1030, strips: 4 })
    expect(blocks.get('DE')).toBeUndefined()
  })

  it('stops the last block at the last scheduled minute, not at the medal-tail estimate', () => {
    renderBothViews(derivedModel(SHAPES))

    // de_total_end is 729 on the plain event while its DE block ends at 699 —
    // tailEstimateMins() covers bouts the scheduler deliberately never places.
    // The table keeps that estimate in its own column; neither view may put it
    // in the DE End cell or in a block.
    expect(requireBlock(blocksFor('plain'), 'DE', 'plain').end).toBe(699)
    expect(cellText('plain', 'deEnd')).toBe('11:39')
    expect(cellText('plain', 'finish')).toBe('12:09')
  })

  it('writes the table cells as clock strings, so the normalisation above has something to parse', () => {
    renderBothViews(derivedModel(SHAPES))

    expect(cellText('plain', 'competition')).toBe('plain')
    expect(cellText('plain', 'day')).toBe('1')
    expect(cellText('plain', 'poolStart')).toBe('8:00')
    expect(cellText('plain', 'poolEnd')).toBe('9:45')
    expect(cellText('plain', 'deStart')).toBe('10:15')
    expect(cellText('plain', 'deEnd')).toBe('11:39')
    expect(cellText('plain', 'strips')).toBe('4')
  })

  it('shows a staged event’s DE times rather than the em dash a null de_start renders', () => {
    renderBothViews(derivedModel(SHAPES))

    expect(cellText('staged', 'deStart')).toBe('14:40')
    expect(cellText('staged', 'deEnd')).toBe('17:10')
    expect(cellText('staged', 'finish')).toBe('17:40')
  })
})

describe('the one place the two views deliberately differ', () => {
  it('flags an out-of-range day in the table and draws no block for it', () => {
    const model = derivedModel({
      plain: SHAPES.plain,
      // days_available is 3, so day 3 addresses no row in the matrix.
      stray: {
        competition: makeCompetition({ id: 'stray' }),
        placement: makePlacement({ day: 3, start_time: 480, strip_count: 4 }),
      },
    })
    renderBothViews(model)

    // The table carries it, flagged.
    expect(tableRowIds()).toContain('stray')
    expect(screen.getByText('Day 4 out of range')).toBeInTheDocument()

    // The matrix has no row for day 3, so it draws nothing — while still
    // drawing the in-range event beside it, which is what makes this an
    // assertion about the stray placement rather than about an empty canvas.
    expect(blocksFor('stray').size).toBe(0)
    expect(blocksFor('plain').size).toBe(2)
  })
})

describe('the Matrix ⇄ Schedule toggle (FR-023)', () => {
  /** A valid config with two placed events — no ERROR finding, so the center
   *  neither dims nor suppresses its commit. Same seed recompute.test.tsx uses. */
  function seedPlacedCompetitions(): void {
    const id = TEMPLATES['RYC Weekend'][0]
    const companionId = TEMPLATES['RYC Weekend'][1]
    useStore.getState().setDays(3)
    useStore.getState().setStrips(12)
    useStore.getState().setVideoStrips(2)
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 8 })
    useStore.getState().addCompetition(companionId)
    useStore.getState().updateCompetition(companionId, { fencer_count: 60 })
    useStore.getState().setPlacementsFromAuto({
      [id]: makePlacement({ strip_count: 5 }),
      [companionId]: makePlacement({ strip_count: 5 }),
    })
  }

  it('opens on the matrix, with the schedule table out of the document', () => {
    seedPlacedCompetitions()
    render(<CenterView />)

    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeChecked()
    expect(screen.getByRole('region', { name: 'Matrix canvas' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('swaps the canvas out for the table, and back', () => {
    seedPlacedCompetitions()
    render(<CenterView />)

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Matrix canvas' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Matrix' }))

    expect(screen.getByRole('region', { name: 'Matrix canvas' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('names the toggle so both views are reachable by name', () => {
    seedPlacedCompetitions()
    render(<CenterView />)

    const group = screen.getByRole('radiogroup', { name: 'Center view' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Schedule' })).toBeInTheDocument()
  })

  it('defaults the stored view state to the matrix at an 08:00 window', () => {
    // T040 flips both: S1 shipped SCHEDULE at midnight for US1's shell, and
    // the matrix opening at midnight would show eight hours of empty grid.
    expect(DEFAULT_VIEW_STATE.viewMode).toBe('matrix')
    expect(DEFAULT_VIEW_STATE.timeScroll).toBe(480)
  })
})
