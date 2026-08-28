import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PoolDurationSettings } from '../../../src/components/sections/PoolDurationSettings.tsx'
import { useStore } from '../../../src/store/store.ts'
import { Weapon } from '../../../src/engine/types.ts'

// T007 – TDD red tests for spec 002 US1 scenarios 1–5.
// The component (research.md D6) shows one row per weapon: a NumberInput with the
// current duration, a Default badge while the value equals the default, and a
// "default: N min" reference plus a revert control while it does not.
// Bounds per research.md D5: integer minutes, 1–999, rejected entries keep the
// last valid value – never clamped-and-committed, and never a blank input.

const DEFAULTS = [
  { weapon: Weapon.EPEE, name: /epee/i, minutes: 120 },
  { weapon: Weapon.FOIL, name: /foil/i, minutes: 105 },
  { weapon: Weapon.SABRE, name: /sabre/i, minutes: 75 },
] as const

function durationInput(name: RegExp): HTMLInputElement {
  return screen.getByRole('spinbutton', { name }) as HTMLInputElement
}

function commitValue(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

function storedTable() {
  return useStore.getState().pool_round_duration_table
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

// ──────────────────────────────────────────────
// Scenario 1: defaults visible, labeled, never blank
// ──────────────────────────────────────────────

describe('PoolDurationSettings default display', () => {
  it.each(DEFAULTS)('pre-fills the $weapon input with its default of $minutes', ({ name, minutes }) => {
    render(<PoolDurationSettings />)
    expect(durationInput(name).value).toBe(String(minutes))
  })

  it('renders exactly one duration input per weapon', () => {
    render(<PoolDurationSettings />)
    expect(screen.getAllByRole('spinbutton')).toHaveLength(DEFAULTS.length)
  })

  it('shows the Default badge on every row when nothing is overridden', () => {
    render(<PoolDurationSettings />)
    expect(screen.getAllByText('Default')).toHaveLength(DEFAULTS.length)
  })
})

// ──────────────────────────────────────────────
// Scenario 2: overriding one weapon leaves the others at default
// ──────────────────────────────────────────────

describe('PoolDurationSettings override entry', () => {
  it('committing 110 for epee updates the store and leaves foil and sabre at their defaults', () => {
    render(<PoolDurationSettings />)

    commitValue(durationInput(/epee/i), '110')

    expect(storedTable()).toEqual({ EPEE: 110, FOIL: 105, SABRE: 75 })
  })
})

// ──────────────────────────────────────────────
// Scenario 3: the default stays discoverable behind an override
// ──────────────────────────────────────────────

describe('PoolDurationSettings overridden row', () => {
  beforeEach(() => {
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, 110)
  })

  it('shows the replaced default as reference text', () => {
    render(<PoolDurationSettings />)
    expect(screen.getByText(/default:\s*120\s*min/i)).toBeInTheDocument()
  })

  it('shows a revert control', () => {
    render(<PoolDurationSettings />)
    expect(screen.getByRole('button', { name: /revert/i })).toBeInTheDocument()
  })

  it('drops the Default badge from the overridden row only', () => {
    render(<PoolDurationSettings />)
    // Foil and sabre keep theirs, so exactly one badge is gone
    expect(screen.getAllByText('Default')).toHaveLength(DEFAULTS.length - 1)
  })
})

// ──────────────────────────────────────────────
// Scenario 4: reverting restores the default
// ──────────────────────────────────────────────

describe('PoolDurationSettings revert', () => {
  beforeEach(() => {
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, 110)
  })

  it('activating the revert control restores the default in the store', () => {
    render(<PoolDurationSettings />)

    fireEvent.click(screen.getByRole('button', { name: /revert/i }))

    expect(storedTable().EPEE).toBe(120)
  })

  it('activating the revert control brings the Default badge back', () => {
    render(<PoolDurationSettings />)

    fireEvent.click(screen.getByRole('button', { name: /revert/i }))

    expect(screen.getAllByText('Default')).toHaveLength(DEFAULTS.length)
  })
})

// ──────────────────────────────────────────────
// Scenario 5: invalid entries are rejected, never clamped or committed
// ──────────────────────────────────────────────

describe('PoolDurationSettings invalid entry rejection', () => {
  // Epee starts overridden to 110 so a reject-that-resets-to-default would also fail
  beforeEach(() => {
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, 110)
  })

  it.each([
    { label: 'zero', entry: '0' },
    { label: 'a negative number', entry: '-15' },
    { label: 'a cleared field', entry: '' },
  ])('rejects $label – the store keeps the last valid value', ({ entry }) => {
    render(<PoolDurationSettings />)

    commitValue(durationInput(/epee/i), entry)

    expect(storedTable().EPEE).toBe(110)
  })

  it.each([
    { label: 'zero', entry: '0' },
    { label: 'a negative number', entry: '-15' },
    { label: 'a cleared field', entry: '' },
  ])('rejects $label – the input redisplays the last valid value', ({ entry }) => {
    render(<PoolDurationSettings />)

    const input = durationInput(/epee/i)
    commitValue(input, entry)

    expect(input.value).toBe('110')
  })
})
