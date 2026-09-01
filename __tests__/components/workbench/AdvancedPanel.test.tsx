import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { AdvancedPanel } from '../../../src/components/workbench/AdvancedPanel.tsx'
import { useStore } from '../../../src/store/store.ts'
import { CATALOGUE, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { RefPolicy } from '../../../src/engine/types.ts'

// 004 T058 — TDD red tests for the Advanced panel (FR-031, FR-035, FR-039,
// FR-040). The panel shows, per data-model.md §Per-type default table, the
// three settings a tournament type defaults for its events — referees per
// pool, video strips, and DE mode — and lets an event's referee setting
// depart from that default explicitly (data-model.md §Settings override
// state: `ref_policy` holds AUTO as an explicit unset marker precisely
// because the resolved count alone can't distinguish "following default"
// from "set to the same number the default happens to be").
//
// The default store state is tournament_type NAC, whose per-type row
// (data-model.md line 61) is 2 referees / 8 video strips / Staged. "Staged
// DE Blocks" and "Single Block" are DE_MODE_OPTIONS' existing display labels
// (src/components/sections/CompetitionOverrides.tsx) — reused here rather
// than inventing a second label set for the same two values.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

const COMP_ID = CATALOGUE[0].id

function competitionLabelFor(id: string): string {
  const entry = findCompetition(id)
  if (!entry) throw new Error(`${id}: not found in CATALOGUE`)
  return competitionLabel(entry)
}

function advancedTrigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Advanced' })
}

describe('AdvancedPanel collapsed summary', () => {
  it('shows the current type\'s three resolved defaults as text, without expanding the panel', () => {
    render(<AdvancedPanel />)

    // Collapsed — Radix has not mounted the trigger's CollapsibleContent.
    expect(advancedTrigger()).toHaveAttribute('aria-expanded', 'false')

    // Still readable: this text lives outside CollapsibleContent (FR-035).
    expect(screen.getByText('Referees per pool: 2')).toBeInTheDocument()
    expect(screen.getByText('Video strips: 8')).toBeInTheDocument()
    expect(screen.getByText('DE mode: Staged DE Blocks')).toBeInTheDocument()
  })
})

describe('AdvancedPanel per-event referee override marker', () => {
  it('marks a TWO-referee event as explicit, not default, even though NAC\'s default is also 2', () => {
    useStore.getState().addCompetition(COMP_ID) // ref_policy starts AUTO
    const label = competitionLabelFor(COMP_ID)

    render(<AdvancedPanel />)
    fireEvent.click(advancedTrigger())

    function refereesCell(): HTMLElement {
      const control = screen.getByRole('combobox', { name: `Referees for ${label}` })
      const cell = control.closest('td')
      if (!cell) throw new Error(`Referees control for "${label}" is not inside a table cell`)
      return cell
    }

    // AUTO — following NAC's default of 2 — reads as default.
    expect(
      within(refereesCell()).queryByText('Default'),
      `${label}: ref_policy AUTO resolves to NAC's default of 2 but does not read as default`,
    ).not.toBeNull()

    // Explicitly set to TWO — the same resolved count (2) as the AUTO case,
    // which a comparison-based marker could not tell apart from AUTO.
    act(() => {
      useStore.getState().updateCompetition(COMP_ID, { ref_policy: RefPolicy.TWO })
    })

    expect(
      within(refereesCell()).queryByText('Default'),
      `${label}: ref_policy is explicitly TWO but still reads as default because it equals NAC's default count`,
    ).toBeNull()
  })
})

describe('AdvancedPanel hard policy exclusion', () => {
  it('renders no cut-mode control, even expanded with a competition selected', () => {
    useStore.getState().addCompetition(COMP_ID)

    render(<AdvancedPanel />)
    fireEvent.click(advancedTrigger())

    // The regional cut override (FR-040) is handbook policy, not an
    // organizer-adjustable per-type default — it has no place in this panel.
    expect(screen.queryByRole('combobox', { name: /cut/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /cut/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/cut/i)).not.toBeInTheDocument()
  })
})
