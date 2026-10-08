import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { ScheduleOutput } from '../../src/components/sections/ScheduleOutput.tsx'
import { WorkbenchShell } from '../../src/components/workbench/WorkbenchShell.tsx'
import { CenterView } from '../../src/components/workbench/CenterView.tsx'
import { ViewMode } from '../../src/store/viewState.ts'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { Category, Gender, Weapon } from '../../src/engine/types.ts'
import type { Competition, Placement } from '../../src/engine/types.ts'
import type { DrawnSchedule } from '../../src/store/derived.ts'
import { selectDerivedSchedule } from '../../src/store/derived.ts'
import type { ScheduleResult } from '../../src/engine/types.ts'
import { formatMinutes } from '../../src/lib/time.ts'
import { makeCompetition, makeConfig, makePlacement, makeStrips } from '../helpers/factories.ts'
import { drawnFromDerived, runPreset, UNPLACED_WORDING } from '../helpers/drawnFixtures.ts'
import { deriveSized } from '../helpers/derive.ts'

// 005 T011: schedule-output rows moved out of the two departing layout test
// files (specs/005-consolidate-domain-logic/triage-record.md (removed; git show 0ab5bd2dc9:specs/005-consolidate-domain-logic/triage-record.md) rows: one departing file's rows 22, 23, 24, 25, 26,
// 27; the other departing file's row 41).
//
// 2026-09-01: the three cases that mounted `ScheduleView` were deleted with it.
// It was the pre-workbench "Regenerate" page, unreachable from `main.tsx`, and
// its only job here was wiring selectDerivedRefRequirements into
// RefRequirementsReport. Both components are gone — the status footer
// (`__tests__/components/workbench/StatusFooter.test.tsx`) carries the referee
// numbers now, and the derive-not-rerun property the deleted cases asserted is
// covered by `__tests__/store/derived.test.ts`.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  // 4 video strips: the default NAC makes every individual event STAGED with video REQUIRED,
  // a video stage asks min(4, bracketSize/2) = 4 strips, and fewer raises
  // video-r16-strip-shortfall (024 D9).
  useStore.getState().setVideoStrips(4)
}

/** Selects one competition and places it, so the schedule view has something derived to show. */
function seedPlacedCompetition(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  seedValidConfig()
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 30 })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

/**
 * Seeds N competitions from `TEMPLATES['RYC Weekend']`, each placed via one
 * `setPlacementsFromAuto` call at the given day/start_time (strip_count 5).
 * Returns the ids in the same order as `specs`, so a case can name which id
 * landed where.
 */
function seedScheduled(specs: Array<{ day: number; start_time: number }>): string[] {
  seedValidConfig()
  const ids = TEMPLATES['RYC Weekend'].slice(0, specs.length)
  ids.forEach((id) => {
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
  })
  const placements = Object.fromEntries(
    ids.map((id, i) => [
      id,
      makePlacement({ day: specs[i].day, start_time: specs[i].start_time, strip_count: 5 }),
    ]),
  )
  useStore.getState().setPlacementsFromAuto(placements)
  return ids
}

const TEAM_VET_ID = 'VET-M-FOIL-TEAM'

/** The text of one row's Competition cell, found by row id rather than by the cell's own text. */
function competitionCell(rowId: string): string {
  const cell = document.querySelector(`[data-schedule-row="${rowId}"] [data-cell="competition"]`)
  if (!cell) throw new Error(`no competition cell in schedule row ${rowId}`)
  return cell.textContent ?? ''
}

/**
 * A committed model handed to `ScheduleOutput` as its `schedule` prop. Each
 * event is derived from its competition, but `listed` decides which
 * competitions the model's `competitions` array carries, so a case can leave
 * an event's competition out of it. It is the drawn model the prop takes:
 * seated with every event's own competition (the strip assigner needs each
 * one), then `competitions` replaced by `listed`.
 */
function committedModel(
  events: Array<{ competition: Competition; placement: Placement }>,
  listed: Competition[],
): DrawnSchedule {
  const config = makeConfig({ days_available: 3, strips: makeStrips(24, 4) })
  const drawn = drawnFromDerived({
    config,
    competitions: events.map((e) => e.competition),
    events: Object.fromEntries(
      events.map((e) => [e.competition.id, deriveSized(e.placement, e.competition, config)]),
    ),
  })
  return { ...drawn, competitions: listed }
}

/** Places the catalogue's team veteran event in the live store. */
function seedPlacedTeamVet(): void {
  seedValidConfig()
  useStore.getState().addCompetition(TEAM_VET_ID)
  useStore.getState().updateCompetition(TEAM_VET_ID, { fencer_count: 10 })
  useStore.getState().setPlacementsFromAuto({ [TEAM_VET_ID]: makePlacement({ strip_count: 5 }) })
}

describe('Competition cell names the event (T050)', () => {
  it('names a store-placed catalogue event by its readable label, not its id', () => {
    seedPlacedTeamVet()
    render(<ScheduleOutput />)

    expect(competitionCell(TEAM_VET_ID)).toBe("Veteran Men's Foil Team")
  })

  it('shows the id, not a catalogue name, when the schedule carries no competition for the row', () => {
    // A real catalogue id left out of `listed`: a catalogue fallback would print the label.
    const orphan = makeCompetition({ id: TEAM_VET_ID })
    const model = committedModel([{ competition: orphan, placement: makePlacement({ strip_count: 4 }) }], [])
    render(<ScheduleOutput schedule={model} />)

    expect(competitionCell(TEAM_VET_ID)).toBe(TEAM_VET_ID)
  })

  it('breaks start-time ties by id, not by the label the reader sees', () => {
    // 'a-event' is a Y12 event ("Y12 ...") and sorts after 'b-event' (Cadet) by label.
    const a = makeCompetition({ id: 'a-event', category: Category.Y12 })
    const b = makeCompetition({ id: 'b-event', category: Category.CADET })
    const placement = makePlacement({ day: 0, start_time: 480, strip_count: 4 })
    const model = committedModel(
      [
        { competition: b, placement },
        { competition: a, placement },
      ],
      [a, b],
    )
    render(<ScheduleOutput schedule={model} />)

    const rowIds = Array.from(document.querySelectorAll('[data-schedule-row]')).map((el) =>
      el.getAttribute('data-schedule-row'),
    )
    expect(rowIds).toEqual(['a-event', 'b-event'])
  })

  it('reads the committed schedule prop, not the live store', () => {
    seedPlacedTeamVet()
    // Same id as the store's event, different event: the label must follow the prop.
    const committed = makeCompetition({
      id: TEAM_VET_ID,
      category: Category.JUNIOR,
      gender: Gender.WOMEN,
      weapon: Weapon.SABRE,
    })
    const model = committedModel([{ competition: committed, placement: makePlacement({ strip_count: 4 }) }], [committed])
    render(<ScheduleOutput schedule={model} />)

    expect(competitionCell(TEAM_VET_ID)).toBe("Junior Women's Saber Individual")
  })
})

/** The center in its table view: the banner lives above the view, so ScheduleOutput alone cannot show it. */
function renderCenterTable(): void {
  render(
    <CenterView
      viewMode={ViewMode.SCHEDULE}
      zoom={{ zoomStep: 2, fitting: false }}
      detailCollapsed={false}
      onToggleDetailCollapsed={() => {}}
    />,
  )
}

describe('ScheduleOutput', () => {
  it('shows no stale notice on a board that was just run', () => {
    runPreset('B1')
    renderCenterTable()

    expect(document.querySelector('[data-schedule-row]')).toBeInTheDocument()
    expect(document.querySelector('[data-stale-banner]')).toBeNull()
    expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument()
  })

  it('shows the stale notice on a board with placements and no run behind them', () => {
    const id = seedPlacedCompetition()
    renderCenterTable()

    expect(document.querySelector(`[data-schedule-row="${id}"]`)).toBeInTheDocument()
    const banner = document.querySelector('[data-stale-banner]')
    expect(banner?.closest('[role="status"]')).not.toBeNull()
    expect(banner?.textContent).toBe(UNPLACED_WORDING.STALE)
    // The notice is the stale state's only wording: the retired phrasing stays retired.
    expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument()
  })

  it('a placement seeded into the store renders as a schedule row', () => {
    const id = seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(document.querySelector(`[data-schedule-row="${id}"]`)).toBeInTheDocument()
    // Pool start derives straight from the placement's start_time. makePlacement
    // defaults to the 2026-27 Ops Manual p.17 day start (540 = 9:00).
    expect(screen.getAllByText('9:00').length).toBeGreaterThan(0)
    expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing is placed', () => {
    seedValidConfig()
    render(<ScheduleOutput />)

    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })

  it('editing a placement changes the rendered schedule with no re-run', async () => {
    const id = seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.getAllByText('9:00').length).toBeGreaterThan(0)

    await act(async () => {
      useStore.getState().updatePlacement(id, { start_time: 600 })
    })

    // 600 minutes = 10:00 — the derived row moved without touching Regenerate
    expect(screen.getAllByText('10:00').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('9:00')).toHaveLength(0)
  })

  it('a placement on a day past days_available is flagged, not hidden', () => {
    const id = TEMPLATES['RYC Weekend'][0]
    const inRangeId = TEMPLATES['RYC Weekend'][1]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })
    useStore.getState().addCompetition(inRangeId)
    useStore.getState().updateCompetition(inRangeId, { fencer_count: 30 })
    useStore.getState().setPlacementsFromAuto({
      [id]: makePlacement({ day: 7, strip_count: 5 }),
      [inRangeId]: makePlacement({ day: 0, strip_count: 5 }),
    })

    render(<ScheduleOutput />)

    expect(document.querySelector(`[data-schedule-row="${id}"]`)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 8' })).toBeInTheDocument()
    expect(screen.getByText('Day 8 out of range')).toBeInTheDocument()

    const outOfRangeRow = document.querySelector(`[data-schedule-row="${id}"]`)
    expect(outOfRangeRow).toHaveAttribute('data-out-of-range', 'true')

    const inRangeRow = document.querySelector(`[data-schedule-row="${inRangeId}"]`)
    expect(inRangeRow).not.toHaveAttribute('data-out-of-range')
  })

  it('renders one region per day with events, none for an empty day, inside the Schedule region', () => {
    seedScheduled([
      { day: 0, start_time: 480 },
      { day: 0, start_time: 540 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    expect(screen.getByRole('region', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 1' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Day 1' })).getByRole('heading', { name: 'Day 1' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Day 2' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Day 3' })).not.toBeInTheDocument()
  })

  it('orders rows within a day by pool start, regardless of placement order', () => {
    // Scoped to `[data-schedule-row]` order directly, not to a day region —
    // the region markup is what T036 adds, and this case is about row order,
    // which the current sort already gets right (contract §3 case 2:
    // predicted green).
    const ids = seedScheduled([
      { day: 0, start_time: 600 },
      { day: 0, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    const rowIds = Array.from(document.querySelectorAll('[data-schedule-row]')).map((el) =>
      el.getAttribute('data-schedule-row'),
    )
    expect(rowIds).toEqual([ids[1], ids[0]])
  })

  it('has no Day columnheader and keeps the seven remaining columns in order', () => {
    seedPlacedCompetition()
    render(<ScheduleOutput />)

    expect(screen.queryByRole('columnheader', { name: 'Day' })).not.toBeInTheDocument()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual([
      'Competition',
      'Pool Start',
      'Pool End',
      'DE Start',
      'DE End',
      'Strips',
      'Finish',
    ])
  })

  it('renders every placed event exactly once across all day sections', () => {
    const ids = seedScheduled([
      { day: 0, start_time: 480 },
      { day: 0, start_time: 540 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    const rowIds = Array.from(document.querySelectorAll('[data-schedule-row]'))
      .map((el) => el.getAttribute('data-schedule-row') ?? '')
      .sort()
    expect(rowIds).toEqual([...ids].sort())
  })

  it('the Print button calls window.print once per press', () => {
    seedPlacedCompetition()
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<ScheduleOutput />)

    fireEvent.click(screen.getByRole('button', { name: 'Print' }))

    expect(printSpy).toHaveBeenCalledTimes(1)
    printSpy.mockRestore()
  })

  it('gives every day section the print-page class', () => {
    seedScheduled([
      { day: 0, start_time: 480 },
      { day: 1, start_time: 480 },
    ])

    render(<ScheduleOutput />)

    expect(screen.getByRole('region', { name: 'Day 1' })).toHaveClass('print-page')
    expect(screen.getByRole('region', { name: 'Day 2' })).toHaveClass('print-page')
  })

  it('renders the Print button and the empty-state text with nothing placed', () => {
    seedValidConfig()
    render(<ScheduleOutput />)

    expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument()
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
  })
})

/** One row's cell text, found by row id and the cell's `data-cell`. */
function cellText(rowId: string, cell: string): string {
  const el = document.querySelector(`[data-schedule-row="${rowId}"] [data-cell="${cell}"]`)
  if (!el) throw new Error(`no ${cell} cell in schedule row ${rowId}`)
  return el.textContent ?? ''
}

/** The four time cells a result fills, in the table's own text. */
function timeCells(r: ScheduleResult): Record<string, string> {
  return {
    poolStart: formatMinutes(r.pool_start),
    poolEnd: formatMinutes(r.pool_end),
    deStart: formatMinutes(r.de_start ?? r.de_prelims_start ?? r.de_round_of_16_start),
    deEnd: formatMinutes(r.de_end ?? r.de_round_of_16_end),
  }
}

describe('the table reads the drawn model (017 T6a, spec §6)', () => {
  it('shows the run\'s own times for every event right after a run, DE waits included', () => {
    runPreset('B1')
    const state = useStore.getState()
    const kept = state.lastRun?.events ?? {}
    const derived = selectDerivedSchedule(state).events
    const ids = Object.keys(kept).sort()
    expect(
      ids.some((id) => timeCells(kept[id].result).deStart !== timeCells(derived[id].result).deStart),
      'premise: some B1 DE starts later than the derived layout puts it',
    ).toBe(true)

    render(<ScheduleOutput />)

    for (const id of ids) {
      const shown = Object.fromEntries(
        ['poolStart', 'poolEnd', 'deStart', 'deEnd'].map((cell) => [cell, cellText(id, cell)]),
      )
      expect(shown, id).toEqual(timeCells(kept[id].result))
    }
  })
})

describe('print (FR-052)', () => {
  it('marks the six always-present regions print-hidden, including the detail strip once a selection exists', () => {
    seedValidConfig()
    const id = TEMPLATES['RYC Weekend'][0]
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })

    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Tournament' }))

    const dock = screen.getByRole('region', { name: 'Unplaced events' })
    fireEvent.click(within(dock).getByRole('button'))

    expect(screen.getByRole('banner', { name: 'Header' })).toHaveClass('print-hidden')
    expect(dock).toHaveClass('print-hidden')
    expect(rail).toHaveClass('print-hidden')
    expect(screen.getByRole('complementary', { name: 'Inspector panel' })).toHaveClass('print-hidden')
    expect(screen.getByRole('region', { name: 'Selected event' })).toHaveClass('print-hidden')
    expect(screen.getByRole('contentinfo', { name: 'Status bar' })).toHaveClass('print-hidden')
  })
})
