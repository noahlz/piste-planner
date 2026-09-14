import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { UnplacedDock } from '../../../src/components/workbench/UnplacedDock.tsx'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import { selectDerivedSchedule } from '../../../src/store/derived.ts'
import { TEMPLATES, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { estimateEventFootprint } from '../../../src/engine/derive.ts'
import { formatMinutes } from '../../../src/lib/time.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 013 T012 — the unplaced dock (FR-010, FR-011, ui-contract.md §Unplaced
// dock): every selected competition with no placement is a button chip
// carrying its label and estimated footprint, a placed one drops off, and
// the region stays identifiable — with its heading and its own text —
// whether or not anything is unplaced.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

// 013 T028 (part b) — selection (contract §7). selectedCompetitionId/
// selectCompetition are not yet on the store (T029 adds them); this cast is a
// deliberate, typed reference to a slice that does not exist yet — the same
// pattern __tests__/store/placements.test.ts uses.
interface SelectionSlice {
  selectedCompetitionId: string | null
  selectCompetition: (id: string | null) => void
}
type FutureState = StoreState & SelectionSlice
function futureState(): FutureState {
  return useStore.getState() as unknown as FutureState
}

function needText(id: string): string {
  const { config, competitions } = selectDerivedSchedule(useStore.getState())
  const competition = competitions.find((c) => c.id === id)
  if (!competition) throw new Error(`no competition for ${id}`)
  const footprint = estimateEventFootprint(competition, config)
  return `${footprint.strips} strips · ${formatMinutes(footprint.poolMinutes)} · DE ${formatMinutes(footprint.deMinutes)}`
}

describe('UnplacedDock empty state', () => {
  it('stays identifiable, with its heading and "Every event has a slot.", when nothing is unplaced', () => {
    render(<UnplacedDock />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(within(region).getByRole('heading', { name: 'Unplaced events' })).toBeInTheDocument()
    expect(within(region).getByText('Every event has a slot.')).toBeInTheDocument()
    expect(within(region).queryAllByRole('button')).toHaveLength(0)
  })
})

describe('UnplacedDock populated state', () => {
  it('renders one chip per selected competition with no placement, by label and need, in sorted-id order', () => {
    const ids = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')

    render(<UnplacedDock />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(within(region).queryByText('Every event has a slot.')).not.toBeInTheDocument()

    const chips = within(region).getAllByRole('button')
    expect(chips).toHaveLength(ids.length)

    const sortedIds = [...ids].sort()
    sortedIds.forEach((id, i) => {
      const entry = findCompetition(id)
      const label = entry ? competitionLabel(entry) : id
      expect(chips[i]).toHaveAttribute('data-unplaced-chip')
      expect(chips[i]).toHaveAttribute('data-event-id', id)
      expect(chips[i]).toHaveAttribute('data-weapon', entry?.weapon)
      expect(chips[i]).toHaveTextContent(label)
      expect(chips[i]).toHaveTextContent(needText(id))
    })
  })

  it('drops a chip from the dock as soon as its event has a placement', () => {
    const ids = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    const placedId = ids[0]
    const entry = findCompetition(placedId)
    const placedLabel = entry ? competitionLabel(entry) : placedId

    render(<UnplacedDock />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(within(region).getByText(placedLabel)).toBeInTheDocument()
    expect(within(region).getAllByRole('button')).toHaveLength(ids.length)

    // The transition under test: a placement arriving after the dock is
    // already mounted, not baked into the seed before render.
    act(() => {
      useStore.getState().setPlacementsFromAuto({ [placedId]: makePlacement({ strip_count: 5 }) })
    })

    expect(within(region).queryByText(placedLabel)).not.toBeInTheDocument()
    expect(within(region).getAllByRole('button')).toHaveLength(ids.length - 1)
  })

  it('shows the run note when Auto-assign left events unplaced, and omits it when lastAutoRun is null', () => {
    // B4 measures 18 placed / 12 unplaced in __tests__/store/store.test.ts
    // ("counts events the scheduler drops entirely as unplaced..."), not the
    // stale drift-baseline figure — standing rule 11, measurements win.
    applyPreset('B4')

    render(<UnplacedDock />)
    const regionBeforeRun = screen.getByRole('region', { name: 'Unplaced events' })
    expect(
      within(regionBeforeRun).queryByText(/could not be placed/),
    ).not.toBeInTheDocument()

    act(() => {
      runScheduleAll()
    })

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(
      within(region).getByText('Placed 18 events, 12 could not be placed.'),
    ).toBeInTheDocument()
  })

  it('sets selectedCompetitionId to the clicked chip\'s event id (013 T028, contract §7)', () => {
    useStore.getState().applyTemplate('RYC Weekend')

    render(<UnplacedDock />)

    const chip = screen.getAllByRole('button')[0]
    const eventId = chip.getAttribute('data-event-id')
    if (!eventId) throw new Error('chip has no data-event-id')

    fireEvent.click(chip)

    expect(futureState().selectedCompetitionId).toBe(eventId)
  })

  it('renders a chip without need text, and does not throw, for a fencer_count of 1', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ids = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    const targetId = ids[0]
    const entry = findCompetition(targetId)
    const label = entry ? competitionLabel(entry) : targetId

    act(() => {
      useStore.getState().updateCompetition(targetId, { fencer_count: 1 })
    })

    expect(() => render(<UnplacedDock />)).not.toThrow()

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    const chip = within(region).getByText(label).closest('button')
    expect(chip).toHaveTextContent(label)
    expect(chip).not.toHaveTextContent('strips')
    expect(chip).not.toHaveTextContent('DE')

    consoleError.mockRestore()
  })
})
