import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { SettingsPanel } from '../../../../src/components/workbench/panels/SettingsPanel.tsx'
import { useStore } from '../../../../src/store/store.ts'
import { TYPE_DEFAULTS } from '../../../../src/store/typeDefaults.ts'
import { DeMode, TournamentType } from '../../../../src/engine/types.ts'
import { DEFAULT_POOL_ROUND_DURATION_TABLE } from '../../../../src/engine/constants.ts'

// 013 T022 (FR-029–FR-031, FR-063, research D7). Re-targets
// __tests__/components/workbench/SettingsPanel.test.tsx, deleted in this task
// with the two gears rows it specified. What survives that deletion:
//
//   - the `PoolDurationSettings` mount (old item 8, FR-043) — the component
//     itself is unchanged, so its own suite still owns its behaviour and this
//     file only proves it is reachable from inside this panel;
//   - the negative cases (old items 7, 9 and 11, FR-046/FR-047) — a control
//     that cannot move the schedule, or that desyncs `de_duration_table` from
//     its calibration, still gets no row, and nothing but these cases stops
//     one drifting back in;
//   - and they gain `Admin gap`, `Flight buffer` and `Video strips`, which are
//     newly forbidden here: the first two because the global-overrides slice is gone
//     (D7), the third because video strips live in the Strips panel (T018) and
//     a second control writing the same field would let the app state one
//     count and schedule another.
//
// What is new is the DE mode radiogroup: a *tournament-level*
// `de_mode_override`, not the per-competition `de_mode` the shrink retired
// (T019 / buildConfig.typeDefaults.test.ts). `null` follows
// `TYPE_DEFAULTS[type].de_mode`, so the panel reads its checked pill from the
// tournament type until the organizer departs from it.

const POOL_DURATION_ROW_COUNT = Object.keys(DEFAULT_POOL_ROUND_DURATION_TABLE).length

function poolDurations(): HTMLElement {
  return screen.getByRole('region', { name: 'Pool round durations' })
}

function deModeGroup(): HTMLElement {
  return screen.getByRole('radiogroup', { name: 'DE mode' })
}

/** The Default marker, wherever the panel puts it (one badge, for DE mode's
 *  followed default) — scoped to the DE mode group's own container so the
 *  three pool-duration badges cannot satisfy it. */
function deModeDefaultMarkers(): HTMLElement[] {
  const container = deModeGroup().parentElement as HTMLElement
  return within(container).queryAllByText('Default')
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

// ──────────────────────────────────────────────
// Pool durations (FR-043, old item 8)
// ──────────────────────────────────────────────

describe('SettingsPanel — pool durations', () => {
  it('mounts PoolDurationSettings, with one input per weapon', () => {
    render(<SettingsPanel />)

    expect(within(poolDurations()).getAllByRole('spinbutton')).toHaveLength(POOL_DURATION_ROW_COUNT)
    expect(
      within(poolDurations()).getByRole('spinbutton', { name: 'Epee pool round duration' }),
    ).toBeInTheDocument()
  })

  it('offers a revert control for an overridden weapon, and reverting restores the default', () => {
    useStore.getState().setPoolRoundDuration('EPEE', DEFAULT_POOL_ROUND_DURATION_TABLE.EPEE - 5)
    render(<SettingsPanel />)

    const revert = within(poolDurations()).getByRole('button', { name: 'Revert Epee to default' })
    fireEvent.click(revert)

    expect(useStore.getState().pool_round_duration_table.EPEE).toBe(
      DEFAULT_POOL_ROUND_DURATION_TABLE.EPEE,
    )
  })
})

// ──────────────────────────────────────────────
// DE mode (FR-029–FR-031, research D7)
// ──────────────────────────────────────────────

describe('SettingsPanel — DE mode', () => {
  it('renders a radiogroup with exactly the two engine modes', () => {
    render(<SettingsPanel />)

    expect(within(deModeGroup()).getAllByRole('radio')).toHaveLength(2)
    expect(screen.getByRole('radio', { name: 'Staged' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Single' })).toBeInTheDocument()
  })

  it('with no override, checks the tournament type’s own default and marks it Default (NAC → Staged)', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    expect(TYPE_DEFAULTS[TournamentType.NAC].de_mode).toBe(DeMode.STAGED)
    expect(useStore.getState().de_mode_override).toBeNull()
    expect(screen.getByRole('radio', { name: 'Staged' })).toHaveAttribute('aria-checked', 'true')
    expect(deModeDefaultMarkers()).toHaveLength(1)
  })

  it('follows a tournament type change while the override is null (ROC → Single)', () => {
    render(<SettingsPanel />)
    expect(screen.getByRole('radio', { name: 'Staged' })).toHaveAttribute('aria-checked', 'true')

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })

    expect(TYPE_DEFAULTS[TournamentType.ROC].de_mode).toBe(DeMode.SINGLE_STAGE)
    expect(screen.getByRole('radio', { name: 'Single' })).toHaveAttribute('aria-checked', 'true')
    expect(deModeDefaultMarkers()).toHaveLength(1)
  })

  it('choosing a mode writes de_mode_override and drops the Default marker', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('radio', { name: 'Single' }))

    expect(useStore.getState().de_mode_override).toBe(DeMode.SINGLE_STAGE)
    expect(screen.getByRole('radio', { name: 'Single' })).toHaveAttribute('aria-checked', 'true')
    expect(deModeDefaultMarkers()).toHaveLength(0)
  })

  // An override equal to the type's own default is still an override — it
  // survives a later type change, where a `null` would not. The marker has to
  // read the field, not compare the resolved mode against the type default.
  it('marks an override that happens to equal the type default as an override, not a default', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    fireEvent.click(screen.getByRole('radio', { name: 'Staged' }))

    expect(useStore.getState().de_mode_override).toBe(DeMode.STAGED)
    expect(deModeDefaultMarkers()).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// The retired controls (FR-063, D7) and the ones that never earned a row
// (FR-046/FR-047, old items 7, 9, 11)
// ──────────────────────────────────────────────

describe('SettingsPanel exposes nothing it must not', () => {
  it.each([
    // Retired with the global-overrides slice (013 T022, D7).
    'Admin gap',
    'Flight buffer',
    // Never earned a row: measured byte-identical schedules (old item 9).
    'Flighting threshold',
    'Scheduling grid resolution',
    'Youth and veteran bout adjustment',
    'Epee DE bout duration',
    'Foil DE bout duration',
    'Sabre DE bout duration',
    // Moves the schedule, but off a table calibrated against its default
    // (old item 11).
    'DE strip footprint',
    // Lives in the Strips panel (T018) — one writer per field.
    'Video strips',
  ])('has no %s control', (label) => {
    render(<SettingsPanel />)

    expect(screen.queryByRole('spinbutton', { name: label })).toBeNull()
    expect(screen.queryByText(label)).toBeNull()
    expect(screen.queryByRole('button', { name: `Revert ${label} to default` })).toBeNull()
  })

  it.each([/weight/i, /penalt/i, /category start/i, /earliest.?start/i, /start preference/i])(
    'has no control or text matching %s',
    (term) => {
      render(<SettingsPanel />)

      expect(screen.queryByText(term)).toBeNull()
      expect(screen.queryByRole('spinbutton', { name: term })).toBeNull()
      expect(screen.queryByRole('textbox', { name: term })).toBeNull()
      expect(screen.queryByRole('checkbox', { name: term })).toBeNull()
    },
  )

  it('renders no spinbutton beyond the three pool-duration inputs', () => {
    render(<SettingsPanel />)

    expect(screen.getAllByRole('spinbutton')).toHaveLength(POOL_DURATION_ROW_COUNT)
  })
})
