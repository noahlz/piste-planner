import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { useStore } from '../../../src/store/store.ts'

// 004 T006 — the shell's four regions plus the tray, the header's controls,
// and the rail's four panel triggers, each locatable by the accessible name
// contracts/ui-contract.md §Regions fixes (S2-contract.md). The last describe
// covers the Auto-assign gate that restores ActionButtons' hard-error
// scheduling block (S2-contract.md §Top bar controls).
//
// 013 T010 replaced TopBar (preset picker plus duplicate type/day/strip
// inputs and a gears disclosure) with Header (ui-contract.md §Header):
// Preset, a read-only summary, Auto-assign, and Export. The type/day/strip
// inputs and Settings now live only behind the rail's own panels (T009).

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
  it('renders the four regions plus the tray and tool rail, each locatable by its accessible name', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.getByRole('banner', { name: 'Header' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Tool rail' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Unplaced events' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Center view' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Drawer' })).toBeInTheDocument()
  })

  it('starts with no inspector panel open', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.queryByRole('complementary', { name: 'Inspector panel' })).toBeNull()
  })
})

describe('WorkbenchShell header', () => {
  it('exposes the header\'s Preset, Auto-assign and Export controls, and no type, day or strip input', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    // Scoped to the banner: T010 removed TopBar's duplicate type/day/strip
    // inputs and gears disclosure. The type/day/strip inputs now live only
    // behind the rail's own panels (T009) — this checks the header holds no
    // copy of them.
    const header = screen.getByRole('banner', { name: 'Header' })
    expect(within(header).getByRole('combobox', { name: 'Preset' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Auto-assign' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Export' })).toBeInTheDocument()
    expect(within(header).queryByRole('combobox', { name: 'Tournament type' })).toBeNull()
    expect(within(header).queryByRole('combobox', { name: 'Day count' })).toBeNull()
    expect(within(header).queryByRole('spinbutton', { name: 'Strip count' })).toBeNull()
  })

  // FR-041's "opens" half (T078 finding 3), re-targeted at the rail's own
  // Settings button (T009) now that TopBar's gears disclosure is gone. The
  // control's existence is pinned by WorkbenchShell rail's own describe below
  // and SettingsPanel's own suite renders the panel directly, so nothing
  // joined the two: a trigger that lost its handler, or a panel id that never
  // reaches `panelContent`, left both files green with an unreachable panel —
  // US4's FR-038 shape.
  it("opens the inspector panel holding the old Settings section from the rail's Settings button, and starts closed", () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull()

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    fireEvent.click(within(rail).getByRole('button', { name: 'Settings' }))

    const aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('region', { name: 'Settings' })).toBeInTheDocument()
  })
})

describe('WorkbenchShell rail', () => {
  it('exposes each of the five tool rail buttons by name', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    expect(within(rail).getByRole('button', { name: 'Tournament' })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Strips & referees' })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Events' })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Findings' })).toBeInTheDocument()
    expect(within(rail).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
  })

  it('opens the Tournament panel on press, showing the Tournament type control, and closes it on a second press', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    const trigger = within(rail).getByRole('button', { name: 'Tournament' })

    fireEvent.click(trigger)
    const aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'Tournament' })).toBeInTheDocument()
    // TournamentSetup's own type control is labelled "Type" (its <Label>,
    // not an aria-label) — unchanged here, since the section is mounted
    // unmodified until phase 2 renames it per ui-contract.md.
    expect(within(aside).getByRole('combobox', { name: 'Type' })).toBeInTheDocument()

    fireEvent.click(trigger)
    expect(screen.queryByRole('complementary', { name: 'Inspector panel' })).toBeNull()
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
