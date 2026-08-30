import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TournamentSetup } from '../../src/components/sections/TournamentSetup.tsx'
import { StripSetup } from '../../src/components/sections/StripSetup.tsx'
import { FencerCounts } from '../../src/components/sections/FencerCounts.tsx'
import { CompetitionMatrix } from '../../src/components/sections/CompetitionMatrix.tsx'
import { AnalysisOutput } from '../../src/components/sections/AnalysisOutput.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'

// 005 T012: 11 config-editing cases moved out of KitchenSinkPage.test.tsx
// (triage-record.md rows 2, 3, 4, 5, 14, 15, 18, 19, 23, 26, 27), each mounting
// one section component alone instead of the departing page. Row 23's case
// mounts a small composed host, the one genuinely cross-section case.

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
      useStore.getState().setStrips(12)
    })

    const fencerInputs = screen.getAllByRole('spinbutton', { name: /Fencer count for/ })
    fencerInputs.forEach((input) => {
      fireEvent.change(input, { target: { value: '30' } })
    })

    // 18 events across 3 days on 12 strips still raises findings — and they are
    // on screen without a validate step.
    expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  })
})
