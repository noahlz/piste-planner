import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, act, fireEvent } from '@testing-library/react'
import { Header } from '../../../src/components/workbench/Header.tsx'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { PresetPicker } from '../../../src/components/workbench/PresetPicker.tsx'
import { SCENARIO_IDS, SCENARIOS } from '../../../src/data/tournaments.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import * as derivedModule from '../../../src/store/derived.ts'

// 013 T010 — the header replacing the retired top bar and App.tsx's
// standalone <header> (ui-contract.md §Header, FR-004–FR-009): brand, preset
// picker, a read-only summary, the last auto-run time, Auto-assign, and
// Export.

// 013 T030, contract §6. `selectFindings` (derived.ts) does not exist yet —
// read through a `* as module` cast (dismissals.test.ts's `findingIdentity`
// pattern) so tsc stays clean about this symbol and the red is a runtime
// throw, not a compile error.
function hasBlockingFinding(state: StoreState): boolean {
  const mod = derivedModule as unknown as {
    selectFindings?: (s: StoreState) => { severity: string }[]
  }
  if (!mod.selectFindings) {
    throw new Error('derived.ts does not yet export selectFindings (013 T030)')
  }
  return mod.selectFindings(state).some((f) => f.severity === 'Blocking')
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/**
 * Renders the real `PresetPicker` (pre-opened — jsdom has no pointer capture
 * for Radix Select to open on a click) and drives its combobox, the same path
 * a user takes, rather than calling `applyPreset`/`runScheduleAll` directly.
 */
function choosePreset(optionName: string): void {
  render(<PresetPicker defaultOpen />)
  fireEvent.keyDown(screen.getByRole('option', { name: optionName }), { key: 'Enter' })
}

describe('Header regions', () => {
  it('renders the banner landmark', () => {
    seedValidConfig()
    render(<Header />)
    expect(screen.getByRole('banner', { name: 'Header' })).toBeInTheDocument()
  })
})

describe('Header preset picker', () => {
  it('groups Tournaments (8) and Templates – invented figures (10) under the Preset combobox', () => {
    // Rendered pre-opened (select.test.tsx's pattern) — jsdom has no pointer
    // capture for Radix Select to open on a click.
    render(<PresetPicker defaultOpen />)

    const tournamentsGroup = screen.getByRole('group', { name: 'Tournaments' })
    expect(within(tournamentsGroup).getAllByRole('option')).toHaveLength(SCENARIO_IDS.length)

    const templatesGroup = screen.getByRole('group', { name: 'Templates – invented figures' })
    expect(within(templatesGroup).getAllByRole('option')).toHaveLength(Object.keys(TEMPLATES).length)
  })

  it('choosing a tournament applies its fixture, runs Auto-assign, and records loadedPresetId', () => {
    seedValidConfig()
    choosePreset(SCENARIOS.B2.label)

    expect(useStore.getState().strips_total).toBe(SCENARIOS.B2.strips)
    expect(useStore.getState().loadedPresetId).toBe('B2')
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)
    expect(useStore.getState().lastAutoRun).not.toBeNull()
  })

  it('choosing a template records its name, runs Auto-assign, and leaves tournament_type unchanged', () => {
    // RJCC Weekend's 12 competitions run 50-130 fencers each (REGIONAL_FENCER_DEFAULTS)
    // — seedValidConfig's 12 strips schedule none of them, so this needs enough
    // capacity to actually place something (measured: 40 strips places all 12).
    seedValidConfig()
    useStore.getState().setStrips(40)
    useStore.getState().setVideoStrips(12)
    useStore.getState().setTournamentType('RYC')
    choosePreset('RJCC Weekend')

    expect(useStore.getState().loadedPresetId).toBe('RJCC Weekend')
    expect(useStore.getState().tournament_type).toBe('RYC')
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)
    expect(useStore.getState().lastAutoRun).not.toBeNull()
  })
})

describe('Header summary', () => {
  it('reads "NAC · 4 days · 80 strips" after applying B1, with no input element inside it', () => {
    applyPreset('B1')
    render(<Header />)

    const summary = screen.getByText(/NAC · 4 days · 80 strips/)
    expect(summary).toBeInTheDocument()
    expect(summary.querySelector('input')).toBeNull()
    expect(SCENARIOS.B1.days).toBe(4)
    expect(SCENARIOS.B1.strips).toBe(80)
  })
})

describe('Header last run', () => {
  it('shows no last-run text on a fresh store', () => {
    seedValidConfig()
    render(<Header />)
    expect(screen.queryByText(/Last run/)).not.toBeInTheDocument()
  })

  it('reads "Last run HH:MM" once runScheduleAll has run', () => {
    seedValidConfig()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T14:07:00'))

    act(() => {
      runScheduleAll()
    })
    render(<Header />)

    expect(screen.getByText('Last run 14:07')).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('Header Auto-assign', () => {
  it('is enabled on a valid store and disabled once a Blocking finding exists (contract §6, 013 T030 — reads Blocking rows from the unified findings list, not validationErrors directly)', () => {
    seedValidConfig()
    render(<Header />)

    expect(screen.getByRole('button', { name: 'Auto-assign' })).toBeEnabled()
    expect(hasBlockingFinding(useStore.getState())).toBe(false)

    // strips_total === 0 is a structural ERROR under BINDING mode (WorkbenchShell.test.tsx precedent).
    act(() => {
      useStore.getState().setStrips(0)
    })
    expect(screen.getByRole('button', { name: 'Auto-assign' })).toBeDisabled()
    expect(hasBlockingFinding(useStore.getState())).toBe(true)
  })
})

describe('Header export', () => {
  it('opens the Export popover, showing Save to File', () => {
    render(<Header />)

    fireEvent.click(screen.getByRole('button', { name: 'Export' }))

    expect(screen.getByRole('button', { name: 'Save to File' })).toBeInTheDocument()
  })
})
