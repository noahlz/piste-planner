import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { CompetitionOverrides } from '../../../src/components/sections/CompetitionOverrides.tsx'
import { useStore } from '../../../src/store/store.ts'
import { CATALOGUE, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { Category, CutMode, DeMode, EventType } from '../../../src/engine/types.ts'

// 008 T013 — TDD red tests for spec 008 US3's three acceptance scenarios
// (spec.md US3; contracts/competition-defaults.md C4). T005 made the store
// default a team event's cut to DISABLED/100 (src/store/competitionDefaults.ts),
// but CompetitionOverrides.tsx still decides "default" by comparing the
// current value against DEFAULT_CUT_BY_CATEGORY[entry.category] directly — a
// table keyed only by category, with no branch for event type. That makes
// every team competition read as user-modified the instant it exists.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/**
 * CADET is chosen over Veteran deliberately (research.md D1/D3): Veteran's
 * category default is already DISABLED/100 — the same value team events
 * need — so a Veteran team row would read as "default" whether or not the
 * marker is fixed, hiding exactly the bug this task closes. CADET's category
 * default is PERCENTAGE/20 (constants.ts DEFAULT_CUT_BY_CATEGORY), so its
 * team cut (DISABLED/100) genuinely diverges from what the buggy comparison
 * expects.
 */
const CADET_TEAM_ID = CATALOGUE.find(
  (e) => e.category === Category.CADET && e.event_type === EventType.TEAM,
)!.id

const CADET_INDIVIDUAL_ID = CATALOGUE.find(
  (e) => e.category === Category.CADET && e.event_type === EventType.INDIVIDUAL,
)!.id

function labelFor(id: string): string {
  const entry = findCompetition(id)
  if (!entry) throw new Error(`${id}: not found in CATALOGUE`)
  return competitionLabel(entry)
}

/** Only one competition is ever selected per test, so its label uniquely names both cells below. */
function cutModeCell(label: string): HTMLElement {
  const trigger = screen.getByRole('combobox', { name: `Cut mode for ${label}` })
  const cell = trigger.closest('td')
  if (!cell) throw new Error(`Cut mode select for "${label}" is not inside a table cell`)
  return cell
}

function cutValueCell(label: string): HTMLElement {
  const input = screen.getByRole('spinbutton', { name: `Cut value for ${label}` })
  const cell = input.closest('td')
  if (!cell) throw new Error(`Cut value input for "${label}" is not inside a table cell`)
  return cell
}

describe('CompetitionOverrides cut default marker (spec 008 US3)', () => {
  it('scenario 1: a newly added team competition marks its cut mode as default', () => {
    useStore.getState().addCompetition(CADET_TEAM_ID)
    const label = labelFor(CADET_TEAM_ID)

    render(<CompetitionOverrides />)

    expect(
      within(cutModeCell(label)).queryByText('Default'),
      `${label}: cut mode is DISABLED (the team all-advance default) but the overrides table reads it as user-modified`,
    ).not.toBeNull()
  })

  it('scenario 2: a team competition whose cut the user changed is not marked as default', () => {
    useStore.getState().addCompetition(CADET_TEAM_ID)
    // Deliberately set to CADET's *individual* default (PERCENTAGE/20) rather
    // than an arbitrary value — this is the trap the buggy comparison falls
    // into. DEFAULT_CUT_BY_CATEGORY[CADET] is PERCENTAGE/20, so a marker that
    // still reads that table directly, ignoring event type, would call this
    // "default" even though the team's own default is DISABLED/100 and the
    // user has clearly overridden it.
    useStore.getState().updateCompetition(CADET_TEAM_ID, {
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const label = labelFor(CADET_TEAM_ID)

    render(<CompetitionOverrides />)

    expect(
      within(cutModeCell(label)).queryByText('Default'),
      `${label}: cut mode PERCENTAGE was set by the user but reads as default`,
    ).toBeNull()
    expect(
      within(cutValueCell(label)).queryByText('Default'),
      `${label}: cut value 20 was set by the user but reads as default`,
    ).toBeNull()
  })

  it('scenario 3: an untouched individual competition still marks its cut mode and value as default', () => {
    useStore.getState().addCompetition(CADET_INDIVIDUAL_ID)
    const label = labelFor(CADET_INDIVIDUAL_ID)

    render(<CompetitionOverrides />)

    expect(
      within(cutModeCell(label)).queryByText('Default'),
      `${label}: cut mode PERCENTAGE is the CADET individual default but reads as user-modified`,
    ).not.toBeNull()
    expect(
      within(cutValueCell(label)).queryByText('Default'),
      `${label}: cut value 20 is the CADET individual default but reads as user-modified`,
    ).not.toBeNull()
  })
})

// 004 T065/T067 — DE mode's per-type default lives here, where its control
// already lives, rather than in the Advanced panel: a second control named
// `DE mode for ${label}` would collide with this one wherever both panels mount.
// A new event stores `'AUTO'` (data-model.md §Settings override state), so the
// option list has to offer it — without an AUTO entry the Select matched no
// option and rendered no selection at all.
describe('CompetitionOverrides DE mode follow-default marker (spec 004 FR-038, FR-039)', () => {
  function deModeControl(label: string): HTMLElement {
    return screen.getByRole('combobox', { name: `DE mode for ${label}` })
  }

  function deModeCell(label: string): HTMLElement {
    const cell = deModeControl(label).closest('td')
    if (!cell) throw new Error(`DE mode select for "${label}" is not inside a table cell`)
    return cell
  }

  it('marks a stored AUTO as default, an explicit STAGED as not, and returns the explicit one to AUTO', () => {
    useStore.getState().addCompetition(CADET_INDIVIDUAL_ID) // de_mode starts 'AUTO'
    const label = labelFor(CADET_INDIVIDUAL_ID)

    render(<CompetitionOverrides />)

    expect(
      within(deModeCell(label)).queryByText('Default'),
      `${label}: de_mode AUTO follows the type default but does not read as default`,
    ).not.toBeNull()
    expect(
      deModeControl(label),
      `${label}: de_mode AUTO shows no selection — the option list is missing its AUTO entry`,
    ).toHaveTextContent('Staged DE Blocks')

    // Explicit STAGED resolves to the same mode AUTO does at a NAC, so only the
    // stored value tells them apart — the marker cannot be a comparison.
    act(() => {
      useStore.getState().updateCompetition(CADET_INDIVIDUAL_ID, { de_mode: DeMode.STAGED })
    })
    expect(
      within(deModeCell(label)).queryByText('Default'),
      `${label}: de_mode is explicitly STAGED but still reads as default because NAC's default is also STAGED`,
    ).toBeNull()

    // FR-038: an explicit value must be returnable to following the type
    // default, or AUTO is write-once through the UI.
    fireEvent.keyDown(deModeControl(label), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('option', { name: 'Auto (Staged DE Blocks)' }), {
      key: 'Enter',
    })

    expect(
      useStore.getState().selectedCompetitions[CADET_INDIVIDUAL_ID].de_mode,
      `${label}: the follow-default option did not write AUTO back to the store`,
    ).toBe('AUTO')
    expect(
      within(deModeCell(label)).queryByText('Default'),
      `${label}: returned to AUTO but no longer reads as default`,
    ).not.toBeNull()
  })
})
