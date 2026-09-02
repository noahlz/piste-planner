import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { SettingsPanel } from '../../../src/components/workbench/SettingsPanel.tsx'
import { useStore } from '../../../src/store/store.ts'
import {
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  DEFAULT_DE_STRIP_FOOTPRINT,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
} from '../../../src/engine/constants.ts'

// 004 T070 – the gears panel's specification (US5, contract §5). Every label
// and aria-label string below is fixed by the orchestrator-issued US5 contract
// so the implementation and this file agree without discovering each other's
// choices.
//
// Three rows, each following the settled `PoolDurationSettings` pattern
// (src/components/sections/PoolDurationSettings.tsx:34-73): a Label +
// NumberInput pair, override state derived by comparison against the
// imported constant (no stored flag – research D8), a `DefaultLabel` badge
// while at default, and a `default: N` hint plus a `Revert <label> to
// default` ghost button while not. `ROWS` below is that table, driving every
// generic assertion so no case is copy-pasted three times.
//
// T078/T079 finding 1 cut this table from nine rows to three. `THRESHOLD_MINS`,
// `SLOT_MINS`, `YOUTH_VET_BOUT_DELTA` and the three `DE_BOUT_DURATION` weapons
// were each measured to produce a byte-identical `ScheduleResult` when changed,
// which FR-046 forbids a control from doing. Item 9 below is the assertion that
// holds that decision. Two cases went with them: the per-weapon independence
// case (item 6), whose subject – `DE_BOUT_DURATION` – no longer has rows here,
// and the 'Epee DE bout duration' half of item 5, replaced by a second
// surviving row so that case keeps testing two rows rather than one.
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

function storedNumber(key: string) {
  return () => (useStore.getState().globalOverrides as never as Record<string, number>)[key]
}

const ROWS: Row[] = [
  {
    label: 'Admin gap',
    default: ADMIN_GAP_MINS,
    setOverride: overrideRecord('ADMIN_GAP_MINS'),
    storedValue: storedNumber('ADMIN_GAP_MINS'),
  },
  {
    label: 'Flight buffer',
    default: FLIGHT_BUFFER_MINS,
    setOverride: overrideRecord('FLIGHT_BUFFER_MINS'),
    storedValue: storedNumber('FLIGHT_BUFFER_MINS'),
  },
  {
    label: 'DE strip footprint',
    default: DEFAULT_DE_STRIP_FOOTPRINT,
    setOverride: overrideRecord('DEFAULT_DE_STRIP_FOOTPRINT'),
    storedValue: storedNumber('DEFAULT_DE_STRIP_FOOTPRINT'),
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
// Item 10 (SC-009 "editable", T078 finding 2): a row commits what is typed
// into it. Every other case in this file reaches the store either through
// `setGlobalOverrides` directly or through the revert button, which is its own
// call site (`onClick={() => commit(row.default)}`) — so deleting
// `onChange={commit}` from the row's NumberInput left the whole file green
// with a panel that was readable and resettable but not typeable.
//
// Change *then blur*: the gears rows do not pass `commitOnChange`, so
// NumberInput keeps the typed text local and commits on blur.
// ──────────────────────────────────────────────

describe('SettingsPanel is editable (SC-009)', () => {
  it.each(ROWS)('typing into $label commits to the store and drops its Default badge', (row) => {
    render(<SettingsPanel />)
    const input = numberInput(row.label)

    fireEvent.change(input, { target: { value: String(row.default + 1) } })
    fireEvent.blur(input)

    expect(row.storedValue()).toBe(row.default + 1)
    expect(within(settingsPanel()).getAllByText('Default')).toHaveLength(
      ROWS.length - 1 + POOL_DURATION_ROW_COUNT,
    )
  })

  // T079 finding 6: the gears rows used to clamp an out-of-range entry and
  // commit the clamped number, while PoolDurationSettings' rows — three rows
  // further down the same panel — rejected it. They now share the pool rows'
  // answer, and this is what stops `rejectOutOfRange` from being dropped again
  // without a failure.
  it.each(ROWS)('rejects an out-of-range entry in $label rather than clamping it', (row) => {
    render(<SettingsPanel />)
    const input = numberInput(row.label)

    fireEvent.change(input, { target: { value: '9999' } })
    fireEvent.blur(input)

    expect(row.storedValue()).toBe(row.default)
    expect(input.value).toBe(String(row.default))
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
    (row) => row.label === 'Admin gap' || row.label === 'DE strip footprint',
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
// Item 7 (FR-047): the panel exposes nothing beyond its three rows and
// PoolDurationSettings. Terms chosen are ones a scheduling-weight, penalty,
// category-start-preference, or earliest-start-offset control would actually
// surface by, not a made-up id – so a future accidental addition would be
// caught here.
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

// ──────────────────────────────────────────────
// Item 9 (FR-046, T078/T079 finding 1): the settings measured to leave the
// derived schedule byte-identical get no control. Their values still travel
// through the store, buildConfig and the share URL – only the editing surface
// is withdrawn – so nothing but this test and the `NOT_SURFACED` table in
// SettingsPanel.tsx stops a row from drifting back in ahead of the engine
// work that would make it act.
// ──────────────────────────────────────────────

describe('SettingsPanel offers no control that cannot move the schedule (FR-046)', () => {
  it.each([
    'Flighting threshold',
    'Scheduling grid resolution',
    'Youth and veteran bout adjustment',
    'Epee DE bout duration',
    'Foil DE bout duration',
    'Sabre DE bout duration',
  ])('has no %s control', (label) => {
    render(<SettingsPanel />)
    const panel = settingsPanel()

    expect(within(panel).queryByRole('spinbutton', { name: label })).toBeNull()
    expect(within(panel).queryByText(label)).toBeNull()
  })
})
