import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { useStore } from '../../../src/store/store.ts'

// 004 T006 — the shell's four regions plus the tray, the top bar's seven
// controls, and the rail's four panel triggers, each locatable by the
// accessible name contracts/ui-contract.md §Regions fixes (S2-contract.md).
// The last describe covers the Auto-schedule all gate that restores
// ActionButtons' hard-error scheduling block (S2-contract.md §Top bar
// controls).
//
// US5 (T075) added the gears control beside Save / Share, and moved Pool
// durations out of the rail behind it (T074, FR-043).

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

    expect(screen.getByRole('banner', { name: 'Top bar' })).toBeInTheDocument()
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

describe('WorkbenchShell top bar', () => {
  it('exposes each of the seven controls by role and accessible name', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    // Scoped to the banner: the tool rail (T009) has its own "Settings"
    // button now, so the top bar's gears button is no longer unambiguous by
    // name alone. Untouched otherwise — T010 deletes this whole describe.
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    expect(within(topBar).getByRole('combobox', { name: 'Preset' })).toBeInTheDocument()
    expect(within(topBar).getByRole('combobox', { name: 'Tournament type' })).toBeInTheDocument()
    expect(within(topBar).getByRole('combobox', { name: 'Day count' })).toBeInTheDocument()
    expect(within(topBar).getByRole('spinbutton', { name: 'Strip count' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Auto-schedule all' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(within(topBar).getByRole('button', { name: 'Save / Share' })).toBeInTheDocument()
  })

  // FR-041's "opens" half (T078 finding 3). The control's existence is pinned
  // above and SettingsPanel's own suite renders the panel directly, so nothing
  // joined the two: a trigger that lost `asChild`, a panel dropped out of
  // `CollapsibleContent`, or an `open`/`onOpenChange` pair on the wrong state
  // left both files green with an unreachable panel — US4's FR-038 shape.
  it('opens the settings panel from the gears control, and starts closed', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.queryByRole('region', { name: 'Settings' })).toBeNull()

    // Scoped to the banner for the same reason as above — the tool rail's
    // own "Settings" button until T010.
    const topBar = screen.getByRole('banner', { name: 'Top bar' })
    fireEvent.click(within(topBar).getByRole('button', { name: 'Settings' }))

    // Only one Settings panel is open at a time, so this stays unscoped.
    expect(screen.getByRole('region', { name: 'Settings' })).toBeInTheDocument()
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

describe('WorkbenchShell top bar strip count', () => {
  it('commits a typed value to the store on change, with no blur', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const input = screen.getByRole('spinbutton', { name: 'Strip count' })
    act(() => {
      fireEvent.change(input, { target: { value: '20' } })
    })

    expect(useStore.getState().strips_total).toBe(20)
  })
})

describe('WorkbenchShell Auto-schedule all gating', () => {
  it('is enabled with no ERROR finding, disabled once one appears, and re-enabled once it is fixed', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    const button = screen.getByRole('button', { name: 'Auto-schedule all' })
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
