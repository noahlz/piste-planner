import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { AdvancedPanel } from '../../../src/components/workbench/AdvancedPanel.tsx'
import { useStore } from '../../../src/store/store.ts'
import { CATALOGUE, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { RefPolicy, TournamentType } from '../../../src/engine/types.ts'

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

  // 004 T067 hardening. The case above pins the summary only at
  // getInitialState()'s NAC, so three hardcoded string literals satisfy it —
  // and FR-031 and FR-035 are both *per tournament type*. ROC differs from NAC
  // in all three cells (typeDefaults.ts: ONE / 0 / SINGLE_STAGE), so a second
  // type is enough to force a real lookup. "Single Block" is DE_MODE_OPTIONS'
  // existing label for SINGLE_STAGE, the same source as "Staged DE Blocks".
  it("re-reads the summary from the tournament type — ROC's row differs in every cell", () => {
    useStore.getState().setTournamentType(TournamentType.ROC)

    render(<AdvancedPanel />)

    expect(advancedTrigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('Referees per pool: 1')).toBeInTheDocument()
    expect(screen.getByText('Video strips: 0')).toBeInTheDocument()
    expect(screen.getByText('DE mode: Single Block')).toBeInTheDocument()
  })
})

describe('AdvancedPanel per-event referee override marker', () => {
  it('marks a TWO-referee event as explicit, not default, even though NAC\'s default is also 2', () => {
    useStore.getState().addCompetition(COMP_ID) // ref_policy starts AUTO
    const label = competitionLabelFor(COMP_ID)

    render(<AdvancedPanel />)
    fireEvent.click(advancedTrigger())

    function refereesControl(): HTMLElement {
      return screen.getByRole('combobox', { name: `Referees for ${label}` })
    }

    function refereesCell(): HTMLElement {
      const cell = refereesControl().closest('td')
      if (!cell) throw new Error(`Referees control for "${label}" is not inside a table cell`)
      return cell
    }

    // AUTO — following NAC's default of 2 — reads as default.
    expect(
      within(refereesCell()).queryByText('Default'),
      `${label}: ref_policy AUTO resolves to NAC's default of 2 but does not read as default`,
    ).not.toBeNull()

    // 004 T067 hardening. The premise of this whole case is that both states
    // resolve to 2, and nothing below asserted the AUTO row actually *shows*
    // that 2. A panel rendering the stored value — blank, a placeholder, a bare
    // "Auto" — would make the two states trivially distinguishable, pass both
    // badge assertions, and fail FR-031 with no red test.
    expect(
      refereesControl(),
      `${label}: ref_policy AUTO does not display the 2 referees it resolves to`,
    ).toHaveTextContent('2')

    // Explicitly set to TWO — the same resolved count (2) as the AUTO case,
    // which a comparison-based marker could not tell apart from AUTO.
    act(() => {
      useStore.getState().updateCompetition(COMP_ID, { ref_policy: RefPolicy.TWO })
    })

    expect(
      within(refereesCell()).queryByText('Default'),
      `${label}: ref_policy is explicitly TWO but still reads as default because it equals NAC's default count`,
    ).toBeNull()
    expect(
      refereesControl(),
      `${label}: explicit TWO does not display 2, so the two states differ by more than the marker`,
    ).toHaveTextContent('2')

    // 004 T067 hardening, FR-038: an explicit value must be returnable to
    // following the type default. Without this the control could offer ONE and
    // TWO only, `AUTO` would be write-once through the UI, and the resolution
    // machinery behind it would be unreachable with a green suite.
    fireEvent.keyDown(refereesControl(), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: `Auto (2)` }), { key: 'Enter' })

    expect(
      useStore.getState().selectedCompetitions[COMP_ID].ref_policy,
      `${label}: the follow-default option did not write AUTO back to the store`,
    ).toBe(RefPolicy.AUTO)
    expect(
      within(refereesCell()).queryByText('Default'),
      `${label}: returned to AUTO but no longer reads as default`,
    ).not.toBeNull()
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
    // 004 T067 hardening: `queryByText` throws on multiple matches, so a panel
    // rendering two cut-bearing nodes would report "found multiple elements"
    // and send the reader after the wrong defect. `\b` also stops the match
    // from firing on a word that merely contains the substring.
    expect(screen.queryAllByText(/\bcut\b/i)).toHaveLength(0)
  })
})
