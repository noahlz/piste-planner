import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { WizardShell } from '../../src/components/wizard/WizardShell.tsx'
import { ScheduleView } from '../../src/components/ScheduleView.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { makePlacement } from '../helpers/factories.ts'
import App from '../../src/App.tsx'

// Reset store before each test
beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** Selects one competition and places it, so the schedule view has something derived to show. */
function seedPlacedCompetition(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  seedValidConfig()
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 30 })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

// ──────────────────────────────────────────────
// Step 13.1: Wizard navigation tests
// ──────────────────────────────────────────────

describe('WizardShell navigation', () => {
  it('renders step 1 (Tournament) by default', () => {
    render(<WizardShell />)
    expect(useStore.getState().wizardStep).toBe(0)
    // Tournament Setup section title should be visible (from WizardStep1 content)
    expect(screen.getByText('Tournament Setup')).toBeInTheDocument()
  })

  it('Forward button advances to the next step', () => {
    render(<WizardShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Next' }))

    expect(useStore.getState().wizardStep).toBe(1)
    // UI reflects step 2 (Fencers) — step indicator should show it active
    expect(screen.getByText('Fencers')).toBeInTheDocument()
  })

  it('Back button retreats to the previous step', () => {
    useStore.getState().setStep(2)
    render(<WizardShell />)

    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(useStore.getState().wizardStep).toBe(1)
    // UI reflects step 2 (Fencers)
    expect(screen.getByText('Fencers')).toBeInTheDocument()
  })

  it('Back button is disabled on Step 1 (index 0)', () => {
    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled()
  })

  it('Back button is enabled when not on Step 1', () => {
    useStore.getState().setStep(1)
    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'Back' })).not.toBeDisabled()
  })

  it('clicking Back on Step 1 does not go below step 0', () => {
    render(<WizardShell />)

    // Back is disabled, so clicking it should have no effect
    const backBtn = screen.getByRole('button', { name: 'Back' })
    fireEvent.click(backBtn)

    expect(useStore.getState().wizardStep).toBe(0)
  })

  it('Forward button shows "Next" on steps 0–2', () => {
    useStore.getState().setStep(1)
    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument()
  })

  it('Forward button shows "View Schedule" on Step 4 (Analysis, index 3)', () => {
    seedValidConfig()
    useStore.getState().setStep(3)

    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'View Schedule' })).toBeInTheDocument()
  })

  it('Forward button is not rendered on Step 5 (Schedule, index 4)', () => {
    useStore.getState().setStep(4)
    render(<WizardShell />)

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View Schedule' })).not.toBeInTheDocument()
  })

  it('Forward blocked on Step 4 (Analysis) when hard ERROR validation errors exist', () => {
    // strips_total is 0 in the initial store — a hard error the derived findings
    // report on first render, with no validate run to wait for.
    useStore.getState().setStep(3)

    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'View Schedule' })).toBeDisabled()
  })

  it('Forward blocked on Step 4 does not advance step when clicked', () => {
    useStore.getState().setStep(3)
    render(<WizardShell />)

    fireEvent.click(screen.getByRole('button', { name: 'View Schedule' }))

    // Step remains at 3 (Analysis)
    expect(useStore.getState().wizardStep).toBe(3)
  })

  it('Forward allowed on Step 4 when no hard errors', () => {
    seedValidConfig()
    useStore.getState().setStep(3)

    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'View Schedule' })).not.toBeDisabled()
  })

  it('fixing strips re-enables Forward without any validate run', async () => {
    useStore.getState().setStep(3)
    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'View Schedule' })).toBeDisabled()

    await act(async () => {
      useStore.getState().setStrips(12)
    })

    expect(screen.getByRole('button', { name: 'View Schedule' })).not.toBeDisabled()
  })

  it('step indicator renders all 5 step labels', () => {
    render(<WizardShell />)

    expect(screen.getByText('Tournament')).toBeInTheDocument()
    expect(screen.getByText('Fencers')).toBeInTheDocument()
    expect(screen.getByText('Strips')).toBeInTheDocument()
    expect(screen.getByText('Analysis')).toBeInTheDocument()
    expect(screen.getByText('Schedule')).toBeInTheDocument()
  })
})

// ──────────────────────────────────────────────
// Step 13.2: Layout toggle tests
// ──────────────────────────────────────────────

describe('Layout toggle', () => {
  it('default layout mode is wizard', () => {
    expect(useStore.getState().layoutMode).toBe('wizard')
  })

  it('switching to wizard layout renders wizard content', () => {
    useStore.getState().setLayoutMode('kitchen-sink')
    render(<App />)

    // Radix Tabs doesn't reliably fire onValueChange with fireEvent in jsdom;
    // call the store action directly and let React process the re-render inside act().
    act(() => {
      useStore.getState().setLayoutMode('wizard')
    })

    expect(useStore.getState().layoutMode).toBe('wizard')
    // Wizard step labels should now be visible in the UI
    expect(screen.getByText('Tournament')).toBeInTheDocument()
  })

  it('switching to kitchen-sink layout hides wizard content', () => {
    useStore.getState().setLayoutMode('wizard')
    render(<App />)

    // Radix Tabs doesn't reliably fire onValueChange with fireEvent in jsdom;
    // call the store action directly and let React process the re-render inside act().
    act(() => {
      useStore.getState().setLayoutMode('kitchen-sink')
    })

    expect(useStore.getState().layoutMode).toBe('kitchen-sink')
    // Wizard step labels should no longer be visible
    expect(screen.queryByText('Fencers')).not.toBeInTheDocument()
  })

  it('wizard layout renders WizardShell step indicator labels', () => {
    useStore.getState().setLayoutMode('wizard')
    render(<App />)

    expect(screen.getByText('Tournament')).toBeInTheDocument()
    expect(screen.getByText('Fencers')).toBeInTheDocument()
  })

  it('kitchen-sink layout does not render wizard step indicators', () => {
    useStore.getState().setLayoutMode('kitchen-sink')
    render(<App />)

    // Step indicators (numbered circles with step labels) are wizard-only
    expect(screen.queryByText('Tournament')).not.toBeInTheDocument()
    expect(screen.queryByText('Fencers')).not.toBeInTheDocument()
  })

  it('state (strips_total) is preserved when switching layouts', () => {
    useStore.getState().setLayoutMode('kitchen-sink')
    useStore.getState().setStrips(18)

    // Switch to wizard mode via store action
    useStore.getState().setLayoutMode('wizard')
    expect(useStore.getState().strips_total).toBe(18)

    // Switch back to kitchen-sink
    useStore.getState().setLayoutMode('kitchen-sink')
    expect(useStore.getState().strips_total).toBe(18)
  })

  it('wizard step is preserved when switching layouts', () => {
    useStore.getState().setLayoutMode('wizard')
    useStore.getState().setStep(2)

    // Switch to kitchen-sink and back to wizard via store actions
    useStore.getState().setLayoutMode('kitchen-sink')
    useStore.getState().setLayoutMode('wizard')

    // Wizard step is still 2
    expect(useStore.getState().wizardStep).toBe(2)
  })
})

// ──────────────────────────────────────────────
// Step 13.3: Schedule view reads placements, never cached results
// ──────────────────────────────────────────────

describe('ScheduleView derived output', () => {
  it('renders no staleness banner — placements are always current', () => {
    seedPlacedCompetition()
    render(<ScheduleView />)

    expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
    expect(screen.queryByText(/out of date/i)).not.toBeInTheDocument()
  })

  it('a placement seeded into the store renders as a schedule row', () => {
    const id = seedPlacedCompetition()
    render(<ScheduleView />)

    expect(screen.getByText(id)).toBeInTheDocument()
    // Pool start derives straight from the placement's start_time (480 = 8:00)
    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)
    expect(screen.queryByText('No events placed yet.')).not.toBeInTheDocument()
  })

  it('shows the empty state when nothing is placed', () => {
    seedValidConfig()
    render(<ScheduleView />)

    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()
    expect(screen.getByText('No referee demand — nothing is placed yet.')).toBeInTheDocument()
  })

  it('referee requirements derive from the placement, not from a scheduler run', () => {
    seedPlacedCompetition()
    render(<ScheduleView />)

    expect(screen.getByText('Referee Requirements')).toBeInTheDocument()
    expect(screen.getByText('Peak Total Refs')).toBeInTheDocument()
    expect(screen.queryByText('No referee demand — nothing is placed yet.')).not.toBeInTheDocument()
  })

  it('Regenerate writes placements and the derived table follows', async () => {
    const id = TEMPLATES['RYC Weekend'][0]
    seedValidConfig()
    useStore.getState().addCompetition(id)
    useStore.getState().updateCompetition(id, { fencer_count: 30 })

    expect(Object.keys(useStore.getState().placements)).toHaveLength(0)

    render(<ScheduleView />)
    expect(screen.getByText('No events placed yet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => {
      expect(useStore.getState().placements[id]).toBeDefined()
      expect(screen.getByText(id)).toBeInTheDocument()
    })
  })

  it('editing a placement changes the rendered schedule with no re-run', async () => {
    const id = seedPlacedCompetition()
    render(<ScheduleView />)

    expect(screen.getAllByText('8:00').length).toBeGreaterThan(0)

    await act(async () => {
      useStore.getState().updatePlacement(id, { start_time: 600 })
    })

    // 600 minutes = 10:00 — the derived row moved without touching Regenerate
    expect(screen.getAllByText('10:00').length).toBeGreaterThan(0)
    expect(screen.queryAllByText('8:00')).toHaveLength(0)
  })
})
