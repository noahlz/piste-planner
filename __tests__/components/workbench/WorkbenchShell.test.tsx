import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent, cleanup } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { useStore } from '../../../src/store/store.ts'
import { loadViewState } from '../../../src/store/viewState.ts'

// 013 T013 — the shell proven whole, as the six regions
// contracts/ui-contract.md §Regions names: Header, Unplaced dock, Tool rail,
// Inspector panel, Canvas (inside Center view), Footer. Phase 1 leaves the
// canvas and detail strip for T026, so this file pins Center view as a
// landmark, not its contents.
//
// This replaces the four-region 004 T006 suite piece by piece (T009-T012)
// finished here: every retired surface — the old top bar, the drawer and its
// scorecard — is asserted gone by name, and the type/day/strip inputs are
// pinned to exist in exactly one place at a time as the inspector panel
// opens and closes.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

describe('WorkbenchShell regions', () => {
  it('renders exactly one of each of the five always-present regions, with no inspector panel open', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.getAllByRole('banner', { name: 'Header' })).toHaveLength(1)
    expect(screen.getAllByRole('region', { name: 'Unplaced events' })).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: 'Tool rail' })).toHaveLength(1)
    expect(screen.getAllByRole('main', { name: 'Center view' })).toHaveLength(1)
    expect(screen.getAllByRole('contentinfo', { name: 'Status bar' })).toHaveLength(1)
    expect(screen.queryAllByRole('complementary', { name: 'Inspector panel' })).toHaveLength(0)
  })

  it('mounts exactly one inspector panel once a rail button is pressed', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Tournament' }))

    expect(screen.getAllByRole('complementary', { name: 'Inspector panel' })).toHaveLength(1)
  })
})

describe('WorkbenchShell retired surfaces', () => {
  // No check here names the retired bottom panel or the comparison surface
  // it carried: neither component exists anywhere in the tree any more
  // (T009-T011a deleted them), and the phase's own retired-name grep bans
  // the words themselves — an assertion naming them would be the last place
  // they appear. Case 1 above already bounds the landmark count either would
  // have had to squeeze into.
  it('shows nothing from the retired top bar or its collapsible controls', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.queryByText('Work in Progress')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Top bar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save / Share' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Auto-schedule all' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Presets…' })).toBeNull()
  })
})

describe('WorkbenchShell single source of type, days and strips', () => {
  it('holds no copy of the type, day or strip controls, and no input in the header summary, with no panel open', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.queryAllByRole('combobox', { name: 'Tournament type' })).toHaveLength(0)
    expect(screen.queryAllByRole('combobox', { name: 'Day count' })).toHaveLength(0)
    expect(screen.queryAllByRole('spinbutton', { name: 'Strip count' })).toHaveLength(0)
    expect(screen.queryAllByRole('spinbutton', { name: 'Number of strips' })).toHaveLength(0)

    const header = screen.getByRole('banner', { name: 'Header' })
    const summary = header.querySelector('[data-summary]')
    expect(summary).not.toBeNull()
    expect(summary?.querySelector('input')).toBeNull()
  })

  it('mounts exactly one "Number of strips" spinbutton, inside the inspector panel, once Strips & referees opens', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Strips & referees' }))

    expect(screen.getAllByRole('spinbutton', { name: 'Number of strips' })).toHaveLength(1)
    const aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('spinbutton', { name: 'Number of strips' })).toBeInTheDocument()
  })
})

describe('WorkbenchShell rail', () => {
  it('opens one panel at a time, swapping the heading rather than adding a second aside, and closes on a second press', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Tournament' }))
    let aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'Tournament' })).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: 'Events' }))
    expect(screen.getAllByRole('complementary', { name: 'Inspector panel' })).toHaveLength(1)
    aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'Events' })).toBeInTheDocument()

    fireEvent.click(within(rail).getByRole('button', { name: 'Events' }))
    expect(screen.queryByRole('complementary', { name: 'Inspector panel' })).toBeNull()
  })
})

describe('WorkbenchShell panel docking', () => {
  it('floats by default, docks on request, and the choice survives a remount', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Tournament' }))

    let aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('button', { name: 'Dock panel' })).toBeInTheDocument()

    fireEvent.click(within(aside).getByRole('button', { name: 'Dock panel' }))
    expect(within(aside).getByRole('button', { name: 'Float panel' })).toBeInTheDocument()
    expect(loadViewState().panelDocked).toBe(true)

    // The open panel is itself a viewer preference (WorkbenchShell.tsx's own
    // docblock) — this click already left "tournament" persisted alongside
    // panelDocked, so the remount below opens straight into it. Pressing the
    // rail again here would close what is already open rather than open it.
    cleanup()
    render(<WorkbenchShell />)
    aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('button', { name: 'Float panel' })).toBeInTheDocument()
  })
})

describe('WorkbenchShell Auto-assign gating', () => {
  it('is enabled with no ERROR finding, disabled once one appears, and re-enabled once it is fixed', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const button = screen.getByRole('button', { name: 'Auto-assign' })
    expect(button).toBeEnabled()

    // strips_total === 0 is a structural ERROR ('strips_total must be > 0')
    // under BINDING mode — cheaper to trigger than a competition-level rule,
    // and it touches no competition, so it carries no pool-structure risk.
    act(() => {
      useStore.getState().setStrips(0)
    })
    expect(button).toBeDisabled()

    act(() => {
      useStore.getState().setStrips(12)
    })
    expect(button).toBeEnabled()

    // days_available=5 is outside the recommended 2-4 day range: a WARN, not
    // an ERROR, so it must never gate the button.
    act(() => {
      useStore.getState().setDays(5)
    })
    expect(button).toBeEnabled()
  })
})
