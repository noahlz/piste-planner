import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { FindingsPanel } from '../../../../src/components/workbench/panels/FindingsPanel.tsx'
import { useStore, type StoreState } from '../../../../src/store/store.ts'
import * as derivedModule from '../../../../src/store/derived.ts'
import { DeMode } from '../../../../src/engine/types.ts'
import { makePlacement } from '../../../helpers/factories.ts'
import { UNPLACED_WORDING, runAndMoveHeadline } from '../../../helpers/drawnFixtures.ts'

// 013 T030, re-targets the retired analysis-output section's test (deleted
// in T032 alongside its component), contract §3. `FindingsPanel.tsx`
// does not exist yet (T032 writes it), so every case here fails on that
// missing module. `selectFindings` (derived.ts, contract §1) does not exist
// yet either; it is read through a `* as module` cast (dismissals.test.ts's
// `findingIdentity` pattern) so tsc stays clean about that symbol, and its
// red is a runtime throw distinct from the FindingsPanel import failure.

/** One row of the unified findings list (contract §1) — the shape pinned
 *  ahead of `derived.ts`'s own `Finding` export, so this file does not
 *  depend on a type that does not exist yet. */
interface Finding {
  id: string
  severity: 'Blocking' | 'Warning' | 'Note' | 'Unplaced'
  where: string
  day: number | null
  message: string
  target: string | null
  /** 016 Task C: whether the row offers a dismiss control. */
  dismissable: boolean
}

function selectFindings(state: StoreState): Finding[] {
  const mod = derivedModule as unknown as { selectFindings?: (s: StoreState) => Finding[] }
  if (!mod.selectFindings) {
    throw new Error('derived.ts does not yet export selectFindings (013 T030)')
  }
  return mod.selectFindings(state)
}

/** `jumpNonce` (UiSlice, contract §2.1) does not exist on the store yet. */
interface FindingsUiSlice {
  jumpNonce: number
}
type FutureState = StoreState & FindingsUiSlice
function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/**
 * `threeEventsOverlappingOnDayZero` (__tests__/store/daySummaries.test.ts:114),
 * copied rather than imported — a test fixture, not a contract export. NAC, 3
 * days, 4 strips: JR-M-EPEE-IND day 0 @480, JR-W-EPEE-IND day 1 @480,
 * JR-M-FOIL-IND day 0 @500, 8 fencers each, SINGLE_STAGE. Its placements are
 * written with no run, so since 017 T5a the board is stale: JR-M-FOIL-IND's
 * DE still draws unseated, but it raises no row, and the panel shows the one
 * stale row instead (spec P4).
 */
function threeEventsOverlappingOnDayZero(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(4)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND']) {
    s.updateCompetition(id, { fencer_count: 8 })
  }
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 1, start_time: 480, strip_count: 1 }),
    'JR-M-FOIL-IND': makePlacement({ day: 0, start_time: 500, strip_count: 1 }),
  })
}

describe('FindingsPanel — empty state (contract §3)', () => {
  it('shows the empty-state text and an empty list on a valid config', () => {
    seedValidConfig()
    render(<FindingsPanel />)

    expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).queryAllByRole('listitem')).toHaveLength(0)
  })

  it('follows an edit with no run in between — a Blocking row appears once strips drop to 0', () => {
    seedValidConfig()
    render(<FindingsPanel />)

    expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()

    act(() => {
      useStore.getState().setStrips(0)
    })

    expect(screen.queryByText('Nothing to report for the current inputs.')).not.toBeInTheDocument()
    const blocking = screen
      .getAllByRole('listitem')
      .find((li) => li.getAttribute('data-severity') === 'Blocking')
    expect(blocking, 'expected a Blocking listitem once strips_total is 0').toBeDefined()
  })
})

describe('FindingsPanel — rows (contract §3)', () => {
  it('renders exactly one listitem per selectFindings row, each carrying its id, severity, where and message', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    expect(screen.getAllByRole('listitem')).toHaveLength(rows.length)

    for (const row of rows) {
      const li = container.querySelector(`[data-finding-id="${row.id}"]`)
      expect(li, `expected a listitem for finding id ${row.id}`).not.toBeNull()
      expect(li).toHaveAttribute('data-severity', row.severity)
      expect(li).toHaveTextContent(row.severity)
      expect(li).toHaveTextContent(row.where)
      expect(li).toHaveTextContent(row.message)
    }
  })
})

describe('FindingsPanel — Show on grid (contract §3)', () => {
  it('appears iff the row has a target, across every row', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    for (const row of rows) {
      const li = container.querySelector(`[data-finding-id="${row.id}"]`) as HTMLElement
      const button = within(li).queryByRole('button', { name: 'Show on grid' })
      expect(
        button !== null,
        `finding ${row.id} (target ${row.target}) Show on grid mismatch`,
      ).toBe(row.target !== null)
    }
  })

  it('the strips_total Blocking row (no target) has no Show on grid button', () => {
    seedValidConfig()
    useStore.getState().setStrips(0)
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    const stripsRow = rows.find((r) => r.where === 'strips_total')
    expect(stripsRow, 'expected a strips_total finding').toBeDefined()
    expect(stripsRow!.target).toBeNull()

    const li = container.querySelector(`[data-finding-id="${stripsRow!.id}"]`) as HTMLElement
    expect(within(li).queryByRole('button', { name: 'Show on grid' })).toBeNull()
  })
})

describe('FindingsPanel — jump to grid (contract §2.1, §3)', () => {
  it('clicking Show on grid on the Unplaced row selects its target and increments jumpNonce', () => {
    const { id } = runAndMoveHeadline('B1')
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    const unplacedRow = rows.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow?.id, 'expected the headline move\'s Unplaced row').toBe(`unplaced:${id}:room`)
    expect(unplacedRow!.target).toBe(id)

    const li = container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`) as HTMLElement
    const button = within(li).getByRole('button', { name: 'Show on grid' })

    act(() => {
      fireEvent.click(button)
    })

    expect(useStore.getState().selectedCompetitionId).toBe(unplacedRow!.target)
    expect(futureState().jumpNonce).toBe(1)
  })
})

describe('FindingsPanel — dismiss finding (contract §3)', () => {
  // 016 Task C: the row's own `dismissable` decides the control, not its severity.
  it('appears exactly on the rows marked dismissable, across every row', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    for (const row of rows) {
      expect(typeof row.dismissable, `finding ${row.id} carries dismissable`).toBe('boolean')
      const li = container.querySelector(`[data-finding-id="${row.id}"]`) as HTMLElement
      const button = within(li).queryByRole('button', { name: 'Dismiss finding' })
      expect(
        button !== null,
        `finding ${row.id} (severity ${row.severity}, dismissable ${row.dismissable}) Dismiss finding mismatch`,
      ).toBe(row.dismissable)
    }
  })

  // 016 R1: a hand-made hard same-day pair is a Warning the organizer cannot dismiss.
  it('offers no dismiss control on a hard-separation Warning, but still offers Show on grid', () => {
    useStore.setState(useStore.getInitialState(), true)
    const s = useStore.getState()
    s.setTournamentType('NAC')
    s.setDays(3)
    s.setStrips(40)
    s.setVideoStrips(8)
    s.selectCompetitions(['JR-M-FOIL-IND', 'CDT-M-FOIL-IND'])
    s.updateCompetition('JR-M-FOIL-IND', { fencer_count: 24 })
    s.updateCompetition('CDT-M-FOIL-IND', { fencer_count: 24 })
    s.setPlacementsFromAuto({
      'JR-M-FOIL-IND': makePlacement({ day: 0, start_time: 540, strip_count: 4 }),
      'CDT-M-FOIL-IND': makePlacement({ day: 0, start_time: 540, strip_count: 4 }),
    })
    const { container } = render(<FindingsPanel />)

    const id = 'analysis:hard-separation-violated:CDT-M-FOIL-IND:CDT-M-FOIL-IND+JR-M-FOIL-IND:0'
    const li = container.querySelector(`[data-finding-id="${id}"]`) as HTMLElement | null
    expect(li, `expected a listitem for ${id}`).not.toBeNull()
    expect(li).toHaveAttribute('data-severity', 'Warning')
    expect(within(li!).queryByRole('button', { name: 'Dismiss finding' })).toBeNull()
    expect(within(li!).getByRole('button', { name: 'Show on grid' })).toBeInTheDocument()
  })

  it('clicking Dismiss finding on the Unplaced row removes it from the list and records the dismissal', () => {
    const { id } = runAndMoveHeadline('B1')
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    const unplacedRow = rows.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow?.id, 'expected the headline move\'s Unplaced row').toBe(`unplaced:${id}:room`)
    expect(within(container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`) as HTMLElement)
      .getByText(UNPLACED_WORDING.RERUN)).toBeInTheDocument()

    const li = container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`) as HTMLElement
    const button = within(li).getByRole('button', { name: 'Dismiss finding' })

    act(() => {
      fireEvent.click(button)
    })

    expect(container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`)).toBeNull()
    expect(useStore.getState().dismissedFindings[unplacedRow!.id]).toBe(true)
  })
})

describe('FindingsPanel — a board that was never run (017 T5a, spec P4)', () => {
  it('lists no unseated row, only the stale row, with neither Show on grid nor Dismiss', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const unplaced = [...container.querySelectorAll('[data-severity="Unplaced"]')] as HTMLElement[]
    expect(unplaced.map((li) => li.getAttribute('data-finding-id'))).toEqual(['stale:run'])
    expect(unplaced[0]).toHaveTextContent(UNPLACED_WORDING.STALE)
    expect(within(unplaced[0]).queryByRole('button')).toBeNull()
  })
})
