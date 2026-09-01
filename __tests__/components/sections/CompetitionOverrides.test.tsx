import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { CompetitionOverrides } from '../../../src/components/sections/CompetitionOverrides.tsx'
import { useStore } from '../../../src/store/store.ts'
import { CATALOGUE, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { Category, CutMode, EventType } from '../../../src/engine/types.ts'

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
