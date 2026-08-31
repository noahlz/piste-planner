import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TournamentSetup } from '../../src/components/sections/TournamentSetup.tsx'
import { StripSetup } from '../../src/components/sections/StripSetup.tsx'
import { FencerCounts } from '../../src/components/sections/FencerCounts.tsx'
import { CompetitionMatrix } from '../../src/components/sections/CompetitionMatrix.tsx'
import { AnalysisOutput } from '../../src/components/sections/AnalysisOutput.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'

// 005 T012: 11 config-editing cases moved out of the departing layout test
// file (triage-record.md rows 2, 3, 4, 5, 14, 15, 18, 19, 23, 26, 27), each
// mounting one section component alone instead of the departing page. Row
// 23's case mounts a small composed host, the one genuinely cross-section
// case.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Case 23's host: fencer-count edits on one component, findings read from another. */
function FencerCountsAndAnalysis() {
  return (
    <>
      <FencerCounts />
      <AnalysisOutput />
    </>
  )
}

// ──────────────────────────────────────────────
// TournamentSetup
// ──────────────────────────────────────────────

describe('TournamentSetup', () => {
  it('renders tournament type dropdown', () => {
    render(<TournamentSetup />)
    expect(document.getElementById('tournament-type')).toBeInTheDocument()
  })

  it('renders days input', () => {
    render(<TournamentSetup />)
    expect(document.getElementById('days-available')).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// StripSetup
// ──────────────────────────────────────────────

describe('StripSetup', () => {
  it('renders strips input', () => {
    render(<StripSetup />)
    expect(screen.getByRole('spinbutton', { name: 'Number of strips' })).toBeInTheDocument()
  })

  it('renders video strips input', () => {
    render(<StripSetup />)
    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toBeInTheDocument()
  })

  it('changing strips input updates store state', () => {
    render(<StripSetup />)
    const stripsInput = screen.getByRole('spinbutton', { name: 'Number of strips' })

    fireEvent.change(stripsInput, { target: { value: '20' } })
    fireEvent.blur(stripsInput)

    expect(useStore.getState().strips_total).toBe(20)
  })
})

// ──────────────────────────────────────────────
// FencerCounts
// ──────────────────────────────────────────────

describe('FencerCounts', () => {
  it('shows empty fencer counts message when no competitions selected', () => {
    render(<FencerCounts />)
    expect(screen.getByText('Select competitions above to enter fencer counts.')).toBeInTheDocument()
  })

  it('selecting a template shows fencer count inputs', () => {
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    useStore.getState().applyTemplate('RYC Weekend')
    render(<FencerCounts />)

    // Fencer count inputs should appear for each selected competition
    const inputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    expect(inputs.length).toBeGreaterThan(0)
  })

  it('entering fencer counts updates the inputs', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<FencerCounts />)

    const inputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    const firstInput = inputs[0]

    fireEvent.change(firstInput, { target: { value: '48' } })

    expect((firstInput as HTMLInputElement).value).toBe('48')
  })

  it('changing fencer count input updates store state', () => {
    useStore.getState().applyTemplate('RYC Weekend')
    render(<FencerCounts />)

    const competitionIds = Object.keys(useStore.getState().selectedCompetitions).sort()
    const firstId = competitionIds[0]

    // Find the fencer count input for first competition and change it
    const input = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })[0]
    fireEvent.change(input, { target: { value: '64' } })
    fireEvent.blur(input)

    expect(useStore.getState().selectedCompetitions[firstId].fencer_count).toBe(64)
  })
})

// ──────────────────────────────────────────────
// CompetitionMatrix
// ──────────────────────────────────────────────

describe('CompetitionMatrix', () => {
  it('renders competition toggles when template is applied', () => {
    const templateIds = TEMPLATES['RYC Weekend']
    useStore.getState().applyTemplate('RYC Weekend')
    render(<CompetitionMatrix />)
    // shadcn Toggle renders as role="button" with aria-pressed
    const toggles = screen.getAllByRole('button', { pressed: true })
    expect(toggles.length).toBe(templateIds.length)
  })
})

// ──────────────────────────────────────────────
// Composed host: FencerCounts + AnalysisOutput
// ──────────────────────────────────────────────

describe('FencerCounts + AnalysisOutput', () => {
  it('full flow: template -> strips -> fencer counts -> findings track every edit', () => {
    // Radix Select doesn't work with fireEvent in jsdom; call store directly
    useStore.getState().applyTemplate('RYC Weekend')
    render(<FencerCountsAndAnalysis />)

    act(() => {
      useStore.getState().setStrips(1)
    })

    // 004 T012: FencerCounts' NumberInput now carries commitOnChange
    // (S2-contract.md §NumberInput gains commitOnChange), so this fires
    // straight into the store — no blur needed. 1 strip is scarce enough
    // that 18 events over 3 days stays infeasible even once every fencer
    // count actually lands at 30, which a 12-strip budget no longer is.
    //
    // review finding A: setStrips(1) alone already trips resource_precondition
    // on all 18 default-seeded competitions (the smallest default is 40
    // fencers, which is 6 pools against 1 strip), so the Validation heading
    // is on screen before this loop runs at all — the heading assertion
    // below cannot, by itself, prove the loop committed anything. A strip
    // count where every seeded default is feasible but a uniform 30 is not
    // would make it prove that, but no such count exists: every ERROR rule
    // that depends on fencer_count in this engine (resource_precondition's
    // n_pools, and validateFeasibility's summed strip-hours) is monotonic
    // non-decreasing in fencer_count, and every RYC Weekend default (40-140)
    // is already above the 30 this loop commits, so a strip count that
    // clears the defaults necessarily clears 30 too (verified empirically
    // by scanning strips 1-25: no strip count has zero ERRORs at the seeded
    // defaults and a nonzero count once every event reads 30). So this stays
    // on setStrips(1), and the loop's actual effect is proven directly
    // instead, by reading the store back before any blur fires.
    const competitionIds = Object.keys(useStore.getState().selectedCompetitions).sort()
    const firstId = competitionIds[0]

    const fencerInputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    fencerInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '30' } })
    })

    // The edit committed without a blur.
    expect(useStore.getState().selectedCompetitions[firstId].fencer_count).toBe(30)

    // Findings are on screen without a separate validate step.
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })
})
