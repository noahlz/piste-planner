import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { AdvancedPanel } from '../../../src/components/workbench/AdvancedPanel.tsx'
import { StripSetup } from '../../../src/components/sections/StripSetup.tsx'
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

// 004 T068 finding 1. FR-037, FR-038 and FR-039 name three settings; T065 gave
// referees and DE mode an `Auto (…)` option and left video strips with no way
// back. `NumberInput.onChange` is typed `(value: number) => void` and
// `StripSetup` passes `setVideoStrips` straight in, so the wizard field is
// physically incapable of writing the `null` that means "follow the type" — the
// panel that owns the distinction has to carry the revert.
describe('AdvancedPanel video strip default marker', () => {
  function videoStripsLine(): HTMLElement {
    // The summary line itself, not an ancestor: `getNodeText` joins only direct
    // text-node children, so the badge and revert control nested inside it do
    // not change what this matches.
    return screen.getByText(/^Video strips: \d+$/)
  }

  it('marks an unset count as default and an explicit 8 as the organizer\'s own, though both resolve to 8 at a NAC', () => {
    // The same trap the referee case guards (FR-039, data-model.md §Settings
    // override state): at a NAC the stored `null` and an explicit `8` resolve
    // to the identical number, so a marker derived by comparing the resolved
    // count against the type's row cannot tell them apart.
    render(<AdvancedPanel />)

    expect(
      within(videoStripsLine()).queryByText('Default'),
      'video_strips_total is null — following NAC\'s row of 8 — but does not read as default',
    ).not.toBeNull()

    act(() => {
      useStore.getState().setVideoStrips(8)
    })

    expect(
      within(videoStripsLine()).queryByText('Default'),
      'video_strips_total is explicitly 8 but still reads as default because it equals NAC\'s row',
    ).toBeNull()
    expect(
      videoStripsLine(),
      'explicit 8 does not display 8, so the two states differ by more than the marker',
    ).toHaveTextContent('Video strips: 8')
  })

  it('returns an explicit count to following the type default (FR-038)', () => {
    useStore.getState().setVideoStrips(3)

    render(<AdvancedPanel />)
    expect(videoStripsLine()).toHaveTextContent('Video strips: 3')
    expect(
      within(videoStripsLine()).queryByText('Default'),
      'an explicit 3 at a NAC reads as default',
    ).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Revert video strips to default' }))

    expect(
      useStore.getState().video_strips_total,
      'the revert control did not write null back to the store, so the count is still the organizer\'s own',
    ).toBeNull()
    expect(videoStripsLine()).toHaveTextContent('Video strips: 8')
    expect(
      within(videoStripsLine()).queryByText('Default'),
      'returned to null but no longer reads as default',
    ).not.toBeNull()
  })

  it('offers no revert control while the count already follows the type', () => {
    // The idiom PoolDurationSettings established: the control appears only for
    // a value that has something to revert. A control that is always present
    // would let a null be "reverted" to itself and make the marker above the
    // only evidence the two states differ at all.
    render(<AdvancedPanel />)

    expect(
      screen.queryByRole('button', { name: 'Revert video strips to default' }),
      'a revert control is offered for a count that is already the type default',
    ).not.toBeInTheDocument()
  })

  // Regression pin rather than a red-first case: the panel already resolved
  // `null` against the type before T068. It is here because finding 3 moves
  // that resolution behind `resolveVideoStrips`, and FR-036/FR-037 are what
  // the move must not disturb.
  it('follows a type change while unset and holds an explicit count through one (FR-036, FR-037)', () => {
    render(<AdvancedPanel />)
    expect(videoStripsLine()).toHaveTextContent('Video strips: 8')

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })
    expect(videoStripsLine(), 'an unset count did not follow the type change').toHaveTextContent(
      'Video strips: 0',
    )
    expect(
      useStore.getState().video_strips_total,
      'the type change wrote a resolved number into stored state (FR-036 forbids it)',
    ).toBeNull()

    act(() => {
      useStore.getState().setVideoStrips(3)
      useStore.getState().setTournamentType(TournamentType.NAC)
    })
    expect(videoStripsLine(), 'an explicit count did not survive a type change').toHaveTextContent(
      'Video strips: 3',
    )
  })
})

// 004 T068 finding 2. `Strips` is `defaultOpen` in the rail and the Advanced
// summary sits outside `CollapsibleContent`, so both counts are on screen a few
// rows apart. Before finding 3 they read from the same store field through two
// different resolutions — `?? typeDefaults` and `?? 0`.
describe('rail agreement on the video strip count', () => {
  it('states the same count in StripSetup and the Advanced summary while the field is unset', () => {
    useStore.getState().setStrips(20)

    render(
      <>
        <StripSetup />
        <AdvancedPanel />
      </>,
    )

    expect(
      screen.getByRole('spinbutton', { name: 'Number of video strips' }),
      'StripSetup and the Advanced summary disagree about one store field',
    ).toHaveValue(8)
    expect(screen.getByText(/^Video strips: \d+$/)).toHaveTextContent('Video strips: 8')
  })

  it('agrees at a type whose row is 0 as well, so the agreement is not NAC-only', () => {
    useStore.getState().setStrips(20)
    useStore.getState().setTournamentType(TournamentType.ROC)

    render(
      <>
        <StripSetup />
        <AdvancedPanel />
      </>,
    )

    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toHaveValue(0)
    expect(screen.getByText(/^Video strips: \d+$/)).toHaveTextContent('Video strips: 0')
  })
})

// 004 T068 finding 5. The summary is in the DOM and reachable in browse mode,
// but nothing tied it to the trigger, so a screen-reader user tabbing the rail
// heard "Advanced, collapsed" and none of the three applied defaults FR-035
// puts there for them.
describe('AdvancedPanel collapsed summary announcement', () => {
  it('names the summary as the trigger\'s description without changing its accessible name', () => {
    render(<AdvancedPanel />)

    const describedBy = advancedTrigger().getAttribute('aria-describedby')
    expect(describedBy, 'the Advanced trigger names no description').toBeTruthy()

    const summary = document.getElementById(describedBy as string)
    expect(summary, `aria-describedby names "${describedBy}" but no element carries that id`).not.toBeNull()
    expect(summary).toHaveTextContent('Referees per pool: 2')
    expect(summary).toHaveTextContent('Video strips: 8')
    expect(summary).toHaveTextContent('DE mode: Staged DE Blocks')

    // The description must not leak into the name — every existing case finds
    // this trigger by `{ name: 'Advanced' }`.
    expect(advancedTrigger()).toHaveAccessibleName('Advanced')
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
