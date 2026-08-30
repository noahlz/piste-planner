import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { UnplacedTray } from '../../../src/components/workbench/UnplacedTray.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T010 — the unplaced tray (FR-005, S2-contract.md §Unplaced tray): every
// selected competition with no placement is listed by its display label, a
// placed one drops off the list, and the region stays identifiable — with
// its heading and its own text — whether or not anything is unplaced.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('UnplacedTray empty state', () => {
  it('stays identifiable, with its heading and "Every event is placed.", when nothing is unplaced', () => {
    render(<UnplacedTray />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(within(region).getByRole('heading', { name: 'Unplaced events' })).toBeInTheDocument()
    expect(within(region).getByText('Every event is placed.')).toBeInTheDocument()
  })
})

describe('UnplacedTray populated state', () => {
  it('lists every selected competition with no placement, by its display label, in sorted-id order', () => {
    const ids = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')

    render(<UnplacedTray />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    expect(within(region).queryByText('Every event is placed.')).not.toBeInTheDocument()

    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(ids.length)

    const sortedIds = [...ids].sort()
    sortedIds.forEach((id, i) => {
      const entry = findCompetition(id)
      const label = entry ? competitionLabel(entry) : id
      expect(items[i]).toHaveTextContent(label)
    })
  })

  it('drops a competition from the list as soon as it has a placement', () => {
    const ids = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    const placedId = ids[0]
    useStore.getState().setPlacementsFromAuto({ [placedId]: makePlacement({ strip_count: 5 }) })

    render(<UnplacedTray />)

    const region = screen.getByRole('region', { name: 'Unplaced events' })
    const entry = findCompetition(placedId)
    const placedLabel = entry ? competitionLabel(entry) : placedId
    expect(within(region).queryByText(placedLabel)).not.toBeInTheDocument()

    const items = within(region).getAllByRole('listitem')
    expect(items).toHaveLength(ids.length - 1)
  })
})
