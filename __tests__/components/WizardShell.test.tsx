import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { WizardShell } from '../../src/components/wizard/WizardShell.tsx'
import { ScheduleView } from '../../src/components/ScheduleView.tsx'
import { useStore } from '../../src/store/store.ts'
import App from '../../src/App.tsx'

// Reset store before each test
beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

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
    // Bypass step 3 auto-analysis by setting step directly then clearing stale
    useStore.getState().setStep(3)
    // Pre-set empty analysis results so WizardStep4's useEffect doesn't create hard errors
    useStore.getState().setAnalysisResults([], { warnings: [], suggestions: [] })

    render(<WizardShell />)

    expect(screen.getByRole('button', { name: 'View Schedule' })).toBeInTheDocument()
  })

  it('Forward button is not rendered on Step 5 (Schedule, index 4)', () => {
    useStore.getState().setStep(4)
    render(<WizardShell />)

    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'View Schedule' })).not.toBeInTheDocument()
  })

  it('Forward blocked on Step 4 (Analysis) when hard ERROR validation errors exist', async () => {
    useStore.getState().setStep(3)
    // WizardStep4 auto-runs validate on mount; with empty store it produces errors.
    // We wait for the store to reflect validation errors from WizardStep4's useEffect.

    render(<WizardShell />)

    await waitFor(() => {
      const state = useStore.getState()
      const hasHardErrors = state.validationErrors.some((e) => e.severity === 'ERROR')
      expect(hasHardErrors).toBe(true)
    })

    const viewScheduleBtn = screen.getByRole('button', { name: 'View Schedule' })
    expect(viewScheduleBtn).toBeDisabled()
  })

  it('Forward blocked on Step 4 does not advance step when clicked', async () => {
    useStore.getState().setStep(3)
    render(<WizardShell />)

    await waitFor(() => {
      const hasHardErrors = useStore.getState().validationErrors.some((e) => e.severity === 'ERROR')
      expect(hasHardErrors).toBe(true)
    })

    fireEvent.click(screen.getByRole('button', { name: 'View Schedule' }))

    // Step remains at 3 (Analysis)
    expect(useStore.getState().wizardStep).toBe(3)
  })

  it('Forward allowed on Step 4 when no hard errors', async () => {
    useStore.getState().setStep(3)
    render(<WizardShell />)

    // WizardStep4 auto-runs validate+analyze on mount; wait for the effect to populate errors
    await waitFor(() => {
      expect(useStore.getState().validationErrors.length).toBeGreaterThan(0)
    })

    // Override validation results with warnings only (no hard ERRORs) to simulate valid config.
    // Wrap in act so React processes the resulting re-render synchronously.
    await act(async () => {
      useStore.getState().setAnalysisResults(
        [{ field: 'note', message: 'Just a warning', severity: 'WARN' as const }],
        { warnings: [], suggestions: [] },
      )
    })

    // View Schedule button should now be enabled (no hard ERROR-severity errors)
    expect(screen.getByRole('button', { name: 'View Schedule' })).not.toBeDisabled()
  })

  it('step indicator renders all 5 step labels', () => {
    render(<WizardShell />)

    expect(screen.getByText('Tournament')).toBeInTheDocument()
    expect(screen.getByText('Fencers')).toBeInTheDocument()
    expect(screen.getByText('Refs & Strips')).toBeInTheDocument()
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

  it('switching to wizard layout renders wizard content', async () => {
    useStore.getState().setLayoutMode('kitchen-sink')
    render(<App />)

    // Radix Tabs doesn't reliably fire onValueChange with fireEvent in jsdom;
    // call the store action directly and let React process the re-render inside act().
    await act(() => {
      useStore.getState().setLayoutMode('wizard')
    })

    expect(useStore.getState().layoutMode).toBe('wizard')
    // Wizard step labels should now be visible in the UI
    expect(screen.getByText('Tournament')).toBeInTheDocument()
  })

  it('switching to kitchen-sink layout hides wizard content', async () => {
    useStore.getState().setLayoutMode('wizard')
    render(<App />)

    // Radix Tabs doesn't reliably fire onValueChange with fireEvent in jsdom;
    // call the store action directly and let React process the re-render inside act().
    await act(() => {
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
// Step 13.3: Stale banner tests
// ──────────────────────────────────────────────

describe('Stale banner', () => {
  it('stale banner not shown when scheduleStale is false', () => {
    render(<ScheduleView />)

    expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
  })

  it('stale banner appears when scheduleStale is true', () => {
    useStore.getState().markStale({ scheduleStale: true })
    render(<ScheduleView />)

    expect(screen.getByText(/Results are outdated/)).toBeInTheDocument()
  })

  it('stale banner appears when navigating to Schedule step (index 4) after config change', () => {
    useStore.getState().setStep(4)
    useStore.getState().markStale({ scheduleStale: true })
    render(<WizardShell />)

    expect(screen.getByText(/Results are outdated/)).toBeInTheDocument()
  })

  it('Regenerate button re-runs engine and produces output', async () => {
    // Set up config so the engine has something to process
    useStore.getState().setDays(2)
    useStore.getState().setStrips(12)
    useStore.getState().applyTemplate('RYC Weekend')
    useStore.getState().setDayRefs(0, { foil_epee_refs: 8, three_weapon_refs: 4 })
    useStore.getState().setDayRefs(1, { foil_epee_refs: 8, three_weapon_refs: 4 })
    useStore.getState().markStale({ scheduleStale: true })

    // Verify no prior output
    expect(Object.keys(useStore.getState().scheduleResults).length).toBe(0)
    expect(useStore.getState().bottlenecks.length).toBe(0)

    render(<ScheduleView />)
    expect(screen.getByText(/Results are outdated/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    // Engine should have re-run — schedule results or bottleneck messages populated
    await waitFor(() => {
      const state = useStore.getState()
      const hasOutput = Object.keys(state.scheduleResults).length > 0 || state.bottlenecks.length > 0
      expect(hasOutput).toBe(true)
    })
  })

  it('stale banner disappears after Regenerate clears stale flag', async () => {
    useStore.getState().markStale({ scheduleStale: true })
    render(<ScheduleView />)

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }))

    await waitFor(() => {
      expect(screen.queryByText(/Results are outdated/)).not.toBeInTheDocument()
    })
  })
})
