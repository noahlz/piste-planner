import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, fireEvent, act } from '@testing-library/react'
import { SettingsPanel } from '../../../../src/components/workbench/panels/SettingsPanel.tsx'
import { useStore } from '../../../../src/store/store.ts'
import { TYPE_DEFAULTS } from '../../../../src/store/typeDefaults.ts'
import { DeMode, TournamentType } from '../../../../src/engine/types.ts'
import { buildTournamentConfig } from '../../../../src/store/buildConfig.ts'
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
  function radio(name: string): HTMLElement {
    return screen.getByRole('radio', { name })
  }

  it('renders a radiogroup with Default, Staged and Single, in that order', () => {
    render(<SettingsPanel />)

    const radios = within(deModeGroup()).getAllByRole('radio')
    expect(radios.map((r) => r.textContent)).toEqual(['Default', 'Staged', 'Single'])
    expect(radio('Default')).toBeInTheDocument()
    expect(radio('Staged')).toBeInTheDocument()
    expect(radio('Single')).toBeInTheDocument()
  })

  it('with no override, checks Default and names what it resolves to (NAC → Staged)', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    expect(TYPE_DEFAULTS[TournamentType.NAC].de_mode).toBe(DeMode.STAGED)
    expect(useStore.getState().de_mode_override).toBeNull()
    expect(radio('Default')).toHaveAttribute('aria-checked', 'true')
    expect(radio('Staged')).toHaveAttribute('aria-checked', 'false')
    expect(radio('Single')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('NAC default: Staged')).toBeInTheDocument()
  })

  it('follows a tournament type change while the override is null (ROC → Single)', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)
    expect(radio('Default')).toHaveAttribute('aria-checked', 'true')

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })

    expect(TYPE_DEFAULTS[TournamentType.ROC].de_mode).toBe(DeMode.SINGLE_STAGE)
    expect(radio('Default')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('ROC default: Single')).toBeInTheDocument()
  })

  it('choosing Single writes de_mode_override and unchecks Default', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    fireEvent.click(radio('Single'))

    expect(useStore.getState().de_mode_override).toBe(DeMode.SINGLE_STAGE)
    expect(radio('Single')).toHaveAttribute('aria-checked', 'true')
    expect(radio('Default')).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('NAC default: Staged')).toBeInTheDocument()
  })

  // An override equal to the type's own default is still an override — it
  // survives a later type change, where a `null` would not. Default must read
  // the field, not compare the resolved mode against the type default.
  it('treats an override that happens to equal the type default as an override, not Default', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    fireEvent.click(radio('Staged'))

    expect(useStore.getState().de_mode_override).toBe(DeMode.STAGED)
    expect(radio('Staged')).toHaveAttribute('aria-checked', 'true')
    expect(radio('Default')).toHaveAttribute('aria-checked', 'false')
  })

  it('pressing Default after an override writes null, and the type default then wins again', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    useStore.getState().applyTemplate('NAC Vet/Div1/Junior')
    render(<SettingsPanel />)

    fireEvent.click(radio('Staged'))
    expect(useStore.getState().de_mode_override).toBe(DeMode.STAGED)
    fireEvent.click(radio('Default'))

    expect(useStore.getState().de_mode_override).toBeNull()
    expect(radio('Default')).toHaveAttribute('aria-checked', 'true')

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })

    const { competitions } = buildTournamentConfig(useStore.getState())
    expect(competitions.length).toBeGreaterThan(0)
    for (const c of competitions) {
      expect(c.de_mode).toBe(TYPE_DEFAULTS[TournamentType.ROC].de_mode)
    }
  })

  it('describes the Default radio with the hint', () => {
    useStore.getState().setTournamentType(TournamentType.NAC)
    render(<SettingsPanel />)

    expect(radio('Default')).toHaveAccessibleDescription('NAC default: Staged')
    expect(radio('Staged')).not.toHaveAttribute('aria-describedby')
    expect(radio('Single')).not.toHaveAttribute('aria-describedby')
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
