import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { FindingsPanel } from '../../../../src/components/workbench/panels/FindingsPanel.tsx'
import { useStore, type StoreState } from '../../../../src/store/store.ts'
import * as derivedModule from '../../../../src/store/derived.ts'
import { DeMode } from '../../../../src/engine/types.ts'
import { makePlacement } from '../../../helpers/factories.ts'

// 013 T030, re-targets __tests__/components/analysisOutput.test.tsx (deleted
// in T032 alongside AnalysisOutput.tsx), contract §3. `FindingsPanel.tsx`
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
 * JR-M-FOIL-IND day 0 @500, 8 fencers each, SINGLE_STAGE. Measured to overflow
 * exactly JR-M-EPEE-IND:DE (contract §8 fixture notes).
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
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    const unplacedRow = rows.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow, 'expected an Unplaced row from the overflow fixture').toBeDefined()
    expect(unplacedRow!.target).not.toBeNull()

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
  it('appears only on Warning/Unplaced rows, across every row', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    for (const row of rows) {
      const li = container.querySelector(`[data-finding-id="${row.id}"]`) as HTMLElement
      const button = within(li).queryByRole('button', { name: 'Dismiss finding' })
      const expected = row.severity === 'Warning' || row.severity === 'Unplaced'
      expect(
        button !== null,
        `finding ${row.id} (severity ${row.severity}) Dismiss finding mismatch`,
      ).toBe(expected)
    }
  })

  it('clicking Dismiss finding on the Unplaced row removes it from the list and records the dismissal', () => {
    threeEventsOverlappingOnDayZero()
    const { container } = render(<FindingsPanel />)

    const rows = selectFindings(useStore.getState())
    const unplacedRow = rows.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow, 'expected an Unplaced row from the overflow fixture').toBeDefined()

    const li = container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`) as HTMLElement
    const button = within(li).getByRole('button', { name: 'Dismiss finding' })

    act(() => {
      fireEvent.click(button)
    })

    expect(container.querySelector(`[data-finding-id="${unplacedRow!.id}"]`)).toBeNull()
    expect(useStore.getState().dismissedFindings[unplacedRow!.id]).toBe(true)
  })
})
