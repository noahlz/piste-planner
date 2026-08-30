import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within, act } from '@testing-library/react'
import { CenterView } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T008 — the dimmed-invalid rule (FR-009, S2-contract.md §Center view
// and the dimmed-invalid rule): the center never blanks. While any derived
// finding is ERROR it keeps showing the last valid layout, dimmed, under a
// "Blocking findings" overlay listing each one.
//
// ERRORs here come from strips_total and days_available, both global rules
// that touch no competition — never from a competition's own fencer_count,
// which computePoolStructure (src/engine/pools.ts) throws on below 2, and
// deriveEventSchedule would run on the placed competition regardless of the
// dimmed rule under test.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** Selects one competition and places it, so the center has something derived to show. */
function seedPlacedCompetition(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  seedValidConfig()
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 30 })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

function dimmedWrapper(): HTMLElement {
  const el = document.querySelector('[data-dimmed]')
  if (!el) throw new Error('CenterView did not render a [data-dimmed] wrapper')
  return el as HTMLElement
}

describe('CenterView valid state', () => {
  it('is not dimmed and shows no blocking-findings overlay', () => {
    const id = seedPlacedCompetition()
    render(<CenterView />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()
  })
})

describe('CenterView dimmed-invalid rule', () => {
  it('dims the center but keeps the previous rows on screen once a finding turns ERROR', () => {
    const id = seedPlacedCompetition()
    render(<CenterView />)
    expect(screen.getByText(id)).toBeInTheDocument()

    act(() => {
      useStore.getState().setStrips(0)
    })

    // The row is still on screen — never blanked — but dimmed.
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')

    const overlay = screen.getByRole('region', { name: 'Blocking findings' })
    expect(
      within(overlay).getByRole('heading', { name: 'Configuration is invalid' }),
    ).toBeInTheDocument()
    expect(overlay.textContent).toContain('strips_total: strips_total must be > 0')
  })

  it('lists one line per ERROR finding when more than one is present at once', () => {
    seedPlacedCompetition()
    render(<CenterView />)

    act(() => {
      useStore.getState().setStrips(0)
      // A scalar patch, not setDays(0) — seedValidConfig's setDays(3) already
      // built 3 dayConfigs, and setDays(0) would empty that array and change
      // what deriveEventSchedule's day lookups see. This isolates the second
      // ERROR to validateConfig's own days_available bounds check.
      useStore.setState({ days_available: 0 })
    })

    const overlay = screen.getByRole('region', { name: 'Blocking findings' })
    expect(overlay.textContent).toContain('strips_total: strips_total must be > 0')
    expect(overlay.textContent).toContain('days_available: days_available must be 1–14, got 0')
  })
})

describe('CenterView across an edit sequence', () => {
  it('holds content at every step of valid -> invalid -> valid, and never blanks', () => {
    const id = seedPlacedCompetition()
    render(<CenterView />)

    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')

    act(() => {
      useStore.getState().setStrips(0)
    })
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'true')

    act(() => {
      useStore.getState().setStrips(12)
    })
    expect(screen.getByText(id)).toBeInTheDocument()
    expect(dimmedWrapper()).toHaveAttribute('data-dimmed', 'false')
    expect(screen.queryByRole('region', { name: 'Blocking findings' })).not.toBeInTheDocument()
  })
})
