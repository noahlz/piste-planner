import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { SettingsPanel } from '../../../src/components/workbench/SettingsPanel.tsx'
import { useStore } from '../../../src/store/store.ts'
import { Weapon } from '../../../src/engine/types.ts'
import {
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
} from '../../../src/engine/constants.ts'

// 004 T070 – TDD red tests for the gears panel (US5, contract §5). The panel
// does not exist yet; this file is its specification. Every label and
// aria-label string below is fixed by the orchestrator-issued US5 contract
// (scratchpad/us5-contract.md §5) so T073's implementation and this file
// agree without discovering each other's choices.
//
// Nine rows, each following the settled `PoolDurationSettings` pattern
// (src/components/sections/PoolDurationSettings.tsx:34-73): a Label +
// NumberInput pair, override state derived by comparison against the
// imported constant (no stored flag – research D8), a `DefaultLabel` badge
// while at default, and a `default: N` hint plus a `Revert <label> to
// default` ghost button while not. `ROWS` below is that table, driving every
// generic assertion so no case is copy-pasted nine times; `DE_BOUT_DURATION`
// rows additionally prove they don't disturb their sibling weapons (item 6).
//
// Last in the panel, `PoolDurationSettings` itself is mounted (FR-043) –
// item 8 below proves it by locating one of its own rows from inside this
// panel, without re-testing PoolDurationSettings' own behavior (that suite is
// __tests__/components/sections/PoolDurationSettings.test.tsx).

type Row = {
  label: string
  default: number
  setOverride: (value: number) => void
  storedValue: () => number
}

function overrideRecord<K extends string>(key: K) {
  return (value: number) => useStore.getState().setGlobalOverrides({ [key]: value } as never)
}

function overrideWeapon(weapon: Weapon) {
  return (value: number) => {
    const current = useStore.getState().globalOverrides.DE_BOUT_DURATION
    useStore.getState().setGlobalOverrides({ DE_BOUT_DURATION: { ...current, [weapon]: value } } as never)
  }
}

const ROWS: Row[] = [
  {
    label: 'Admin gap',
    default: ADMIN_GAP_MINS,
    setOverride: overrideRecord('ADMIN_GAP_MINS'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['ADMIN_GAP_MINS'],
  },
  {
    label: 'Flight buffer',
    default: FLIGHT_BUFFER_MINS,
    setOverride: overrideRecord('FLIGHT_BUFFER_MINS'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['FLIGHT_BUFFER_MINS'],
  },
  {
    label: 'Flighting threshold',
    default: THRESHOLD_MINS,
    setOverride: overrideRecord('THRESHOLD_MINS'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['THRESHOLD_MINS'],
  },
  {
    label: 'Scheduling grid resolution',
    default: SLOT_MINS,
    setOverride: overrideRecord('SLOT_MINS'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['SLOT_MINS'],
  },
  {
    label: 'Epee DE bout duration',
    default: DE_BOUT_DURATION[Weapon.EPEE],
    setOverride: overrideWeapon(Weapon.EPEE),
    storedValue: () => useStore.getState().globalOverrides.DE_BOUT_DURATION[Weapon.EPEE],
  },
  {
    label: 'Foil DE bout duration',
    default: DE_BOUT_DURATION[Weapon.FOIL],
    setOverride: overrideWeapon(Weapon.FOIL),
    storedValue: () => useStore.getState().globalOverrides.DE_BOUT_DURATION[Weapon.FOIL],
  },
  {
    label: 'Sabre DE bout duration',
    default: DE_BOUT_DURATION[Weapon.SABRE],
    setOverride: overrideWeapon(Weapon.SABRE),
    storedValue: () => useStore.getState().globalOverrides.DE_BOUT_DURATION[Weapon.SABRE],
  },
  {
    label: 'Youth and veteran bout adjustment',
    default: YOUTH_VET_BOUT_DELTA,
    setOverride: overrideRecord('YOUTH_VET_BOUT_DELTA'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['YOUTH_VET_BOUT_DELTA'],
  },
  {
    label: 'DE strip footprint',
    default: DEFAULT_DE_STRIP_FOOTPRINT,
    setOverride: overrideRecord('DEFAULT_DE_STRIP_FOOTPRINT'),
    storedValue: () => (useStore.getState().globalOverrides as never as Record<string, number>)['DEFAULT_DE_STRIP_FOOTPRINT'],
  },
]

// PoolDurationSettings contributes one spinbutton and one Default badge per
// weapon (its own settled contract) once mounted inside this panel.
const POOL_DURATION_ROW_COUNT = Object.keys(DEFAULT_POOL_ROUND_DURATION_TABLE).length

function settingsPanel(): HTMLElement {
  return screen.getByRole('region', { name: 'Settings' })
}

function numberInput(name: string): HTMLInputElement {
  return within(settingsPanel()).getByRole('spinbutton', { name }) as HTMLInputElement
}

/** Matches "default: <value>" without also matching a longer number that starts with it. */
function defaultHintPattern(value: number): RegExp {
  const literal = String(value).replace('-', '\\-')
  return new RegExp(`default:\\s*${literal}(?!\\d)`, 'i')
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

// ──────────────────────────────────────────────
// Item 1: every row renders with its default value
// ──────────────────────────────────────────────

describe('SettingsPanel default display', () => {
  it.each(ROWS)('pre-fills $label with its default of $default', ({ label, default: def }) => {
    render(<SettingsPanel />)
    expect(numberInput(label).value).toBe(String(def))
  })

  it('renders exactly one spinbutton per row, plus PoolDurationSettings’ three, and nothing else', () => {
    render(<SettingsPanel />)
    expect(within(settingsPanel()).getAllByRole('spinbutton')).toHaveLength(ROWS.length + POOL_DURATION_ROW_COUNT)
  })
})

// ──────────────────────────────────────────────
// Item 2: a row at its default is marked Default, with no revert affordance
// ──────────────────────────────────────────────

describe('SettingsPanel all-default state', () => {
  it('marks every row Default and offers no revert control or default hint', () => {
    render(<SettingsPanel />)
    const panel = settingsPanel()

    expect(within(panel).getAllByText('Default')).toHaveLength(ROWS.length + POOL_DURATION_ROW_COUNT)
    expect(within(panel).queryByRole('button', { name: /revert/i })).toBeNull()
    expect(within(panel).queryByText(/default:/i)).toBeNull()
  })
})

// ──────────────────────────────────────────────
// Items 3 & 4: an overridden row loses its badge, shows the default it
// departs from, offers a revert, and reverting restores both the value and
// the badge.
// ──────────────────────────────────────────────

describe('SettingsPanel overridden row', () => {
  it.each(ROWS)(
    'shows a revert control and the default $label departs from, and drops exactly one Default badge',
    (row) => {
      row.setOverride(row.default + 1)
      render(<SettingsPanel />)
      const panel = settingsPanel()

      expect(within(panel).getByRole('button', { name: `Revert ${row.label} to default` })).toBeInTheDocument()
      expect(within(panel).getByText(defaultHintPattern(row.default))).toBeInTheDocument()
      expect(within(panel).getAllByText('Default')).toHaveLength(ROWS.length - 1 + POOL_DURATION_ROW_COUNT)
    },
  )
})

describe('SettingsPanel revert', () => {
  it.each(ROWS)('reverting $label restores its default value and its Default badge', (row) => {
    row.setOverride(row.default + 1)
    render(<SettingsPanel />)
    const panel = settingsPanel()

    fireEvent.click(within(panel).getByRole('button', { name: `Revert ${row.label} to default` }))

    expect(row.storedValue()).toBe(row.default)
    expect(numberInput(row.label).value).toBe(String(row.default))
    expect(within(panel).getAllByText('Default')).toHaveLength(ROWS.length + POOL_DURATION_ROW_COUNT)
  })
})

// ──────────────────────────────────────────────
// Item 5: override state is derived by comparison, never a stored flag
// (research D8). Writing a value that happens to equal the default must
// still read as Default – a stored boolean flipped by any setGlobalOverrides
// call would fail this, even though a plain comparison passes it.
// ──────────────────────────────────────────────

describe('SettingsPanel override state is derived, not stored (research D8)', () => {
  const casesToCheck = ROWS.filter(
    (row) => row.label === 'Admin gap' || row.label === 'Epee DE bout duration',
  )

  it.each(casesToCheck)(
    'setting $label to its own default through setGlobalOverrides still reads as Default',
    (row) => {
      row.setOverride(row.default)
      render(<SettingsPanel />)
      const panel = settingsPanel()

      expect(within(panel).queryByRole('button', { name: `Revert ${row.label} to default` })).toBeNull()
      expect(within(panel).getAllByText('Default')).toHaveLength(ROWS.length + POOL_DURATION_ROW_COUNT)
    },
  )
})

// ──────────────────────────────────────────────
// Item 6: DE_BOUT_DURATION is per weapon – overriding one leaves its
// siblings at their own defaults.
// ──────────────────────────────────────────────

describe('SettingsPanel DE bout duration is per weapon', () => {
  it('changing epee leaves foil and sabre at their defaults, still marked Default', () => {
    const epee = ROWS.find((row) => row.label === 'Epee DE bout duration')!
    epee.setOverride(epee.default + 1)
    render(<SettingsPanel />)
    const panel = settingsPanel()

    expect(numberInput('Foil DE bout duration').value).toBe(String(DE_BOUT_DURATION[Weapon.FOIL]))
    expect(numberInput('Sabre DE bout duration').value).toBe(String(DE_BOUT_DURATION[Weapon.SABRE]))
    expect(within(panel).queryByRole('button', { name: 'Revert Foil DE bout duration to default' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Revert Sabre DE bout duration to default' })).toBeNull()
  })
})

// ──────────────────────────────────────────────
// Item 7 (FR-047): the panel exposes nothing beyond its nine rows. Terms
// chosen are ones a scheduling-weight, penalty, category-start-preference,
// or earliest-start-offset control would actually surface by, not a
// made-up id – so a future accidental addition would be caught here.
// ──────────────────────────────────────────────

describe('SettingsPanel exposes nothing it must not (FR-047)', () => {
  it.each([/weight/i, /penalt/i, /category start/i, /earliest.?start/i, /start preference/i])(
    'has no control or text matching %s',
    (term) => {
      render(<SettingsPanel />)
      const panel = settingsPanel()

      expect(within(panel).queryByText(term)).toBeNull()
      expect(within(panel).queryByRole('spinbutton', { name: term })).toBeNull()
      expect(within(panel).queryByRole('textbox', { name: term })).toBeNull()
      expect(within(panel).queryByRole('checkbox', { name: term })).toBeNull()
    },
  )
})

// ──────────────────────────────────────────────
// Item 8 (FR-043): PoolDurationSettings is mounted inside this panel.
// ──────────────────────────────────────────────

describe('SettingsPanel composition', () => {
  it('renders PoolDurationSettings, reachable by one of its own rows', () => {
    render(<SettingsPanel />)
    expect(
      within(settingsPanel()).getByRole('spinbutton', { name: 'Epee pool round duration' }),
    ).toBeInTheDocument()
  })
})
