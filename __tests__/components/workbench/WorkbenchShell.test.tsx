import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { WorkbenchShell } from '../../../src/components/workbench/WorkbenchShell.tsx'
import { useStore } from '../../../src/store/store.ts'

// 004 T006 — the shell's four regions plus the tray, the top bar's six
// controls, and the rail's five panel triggers, each locatable by the
// accessible name contracts/ui-contract.md §Regions fixes (S2-contract.md).
// The last describe covers the Auto-schedule all gate that restores
// ActionButtons' hard-error scheduling block (S2-contract.md §Top bar
// controls).

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
  it('renders the four regions plus the tray, each locatable by its accessible name', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.getByRole('banner', { name: 'Top bar' })).toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Left rail' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Unplaced events' })).toBeInTheDocument()
    expect(screen.getByRole('main', { name: 'Center view' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Drawer' })).toBeInTheDocument()
  })
})

describe('WorkbenchShell top bar', () => {
  it('exposes each of the six controls by role and accessible name', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.getByRole('combobox', { name: 'Preset' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tournament type' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Day count' })).toBeInTheDocument()
    expect(screen.getByRole('spinbutton', { name: 'Strip count' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Auto-schedule all' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save / Share' })).toBeInTheDocument()
  })
})

describe('WorkbenchShell rail', () => {
  it('exposes each of the five panel triggers by its heading, whether open or collapsed', () => {
    seedValidConfig()
    render(<WorkbenchShell />)

    expect(screen.getByRole('button', { name: 'Tournament' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Strips' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Per-event overrides' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pool durations' })).toBeInTheDocument()
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
