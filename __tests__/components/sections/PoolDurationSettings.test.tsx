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

/** The single override value used by every overridden-state fixture. */
const EPEE_OVERRIDE = 110

// Non-numeric text like "abc" is sanitized to '' by number inputs, so the
// cleared-field entry also stands in for the spec's non-numeric case.
const INVALID_ENTRIES = [
  { label: 'zero', entry: '0' },
  { label: 'a negative number', entry: '-15' },
  { label: 'a value above the maximum', entry: '1000' },
  { label: 'a fractional number', entry: '110.5' },
  { label: 'a cleared field', entry: '' },
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

  it('shows no override affordances while everything is default', () => {
    render(<PoolDurationSettings />)
    // Badge XOR reference-plus-revert (research.md D6) – the all-default state
    // must not render the override side at all
    expect(screen.queryByText(/default:/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /revert/i })).toBeNull()
  })
})

// ──────────────────────────────────────────────
// Scenario 2: overriding one weapon leaves the others at default
// ──────────────────────────────────────────────

describe('PoolDurationSettings override entry', () => {
  it('committing 110 for epee updates the store and leaves foil and sabre at their defaults', () => {
    render(<PoolDurationSettings />)

    commitValue(durationInput(/epee/i), String(EPEE_OVERRIDE))

    expect(storedTable()).toEqual({ EPEE: EPEE_OVERRIDE, FOIL: 105, SABRE: 75 })
  })

  it('accepts an extreme but valid value – the spec edge case names 600', () => {
    render(<PoolDurationSettings />)

    const input = durationInput(/epee/i)
    commitValue(input, '600')

    expect(storedTable().EPEE).toBe(600)
    expect(input.value).toBe('600')
  })

  it('a blur with no change commits nothing and marks nothing stale', () => {
    render(<PoolDurationSettings />)
    useStore.getState().clearStale()

    fireEvent.blur(durationInput(/epee/i))

    expect(useStore.getState().analysisStale).toBe(false)
    expect(useStore.getState().scheduleStale).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Scenario 3: the default stays discoverable behind an override
// ──────────────────────────────────────────────

describe('PoolDurationSettings overridden row', () => {
  beforeEach(() => {
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, EPEE_OVERRIDE)
  })

  it('shows the replaced default as reference text', () => {
    render(<PoolDurationSettings />)
    expect(screen.getByText(/default:\s*120\s*min/i)).toBeInTheDocument()
  })

  it('shows a revert control on the overridden row', () => {
    render(<PoolDurationSettings />)
    expect(screen.getByRole('button', { name: /revert epee/i })).toBeInTheDocument()
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
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, EPEE_OVERRIDE)
  })

  it('activating the revert control restores the default in the store', () => {
    render(<PoolDurationSettings />)

    fireEvent.click(screen.getByRole('button', { name: /revert epee/i }))

    expect(storedTable().EPEE).toBe(120)
  })

  it('reverts only its own weapon when two are overridden', () => {
    useStore.getState().setPoolRoundDuration(Weapon.FOIL, 100)
    render(<PoolDurationSettings />)

    fireEvent.click(screen.getByRole('button', { name: /revert epee/i }))

    expect(storedTable()).toEqual({ EPEE: 120, FOIL: 100, SABRE: 75 })
  })

  it('activating the revert control brings the Default badge back', () => {
    render(<PoolDurationSettings />)

    fireEvent.click(screen.getByRole('button', { name: /revert epee/i }))

    expect(screen.getAllByText('Default')).toHaveLength(DEFAULTS.length)
  })
})

// ──────────────────────────────────────────────
// Scenario 5: invalid entries are rejected, never clamped or committed
// ──────────────────────────────────────────────

describe('PoolDurationSettings invalid entry rejection', () => {
  // Epee starts overridden so a reject-that-resets-to-default would also fail.
  // The visible snap-back to the last valid value is the current reading of the
  // spec's "rejected with feedback" – recorded pending spec-owner confirmation.
  beforeEach(() => {
    useStore.getState().setPoolRoundDuration(Weapon.EPEE, EPEE_OVERRIDE)
  })

  it.each(INVALID_ENTRIES)('rejects $label – the store keeps the last valid value', ({ entry }) => {
    render(<PoolDurationSettings />)

    commitValue(durationInput(/epee/i), entry)

    expect(storedTable().EPEE).toBe(EPEE_OVERRIDE)
  })

  it.each(INVALID_ENTRIES)('rejects $label – the input redisplays the last valid value', ({ entry }) => {
    render(<PoolDurationSettings />)

    const input = durationInput(/epee/i)
    commitValue(input, entry)

    expect(input.value).toBe(String(EPEE_OVERRIDE))
  })
})
