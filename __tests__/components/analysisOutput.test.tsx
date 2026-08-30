import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AnalysisOutput } from '../../src/components/sections/AnalysisOutput.tsx'
import { useStore } from '../../src/store/store.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'

// 005 T010: 9 findings-display cases moved out of KitchenSinkPage.test.tsx
// (triage-record.md rows 11, 12, 20, 28, 43-47), each mounting AnalysisOutput
// alone instead of the departing page.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

/** Config with no hard validation errors: strips set, no competitions to over-subscribe them. */
function seedValidConfig(): void {
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
}

/** One large event on a single strip: a strip deficit that raises warnings and one flighting suggestion. */
function seedStripDeficit(): string {
  const id = TEMPLATES['RYC Weekend'][0]
  useStore.getState().setDays(3)
  useStore.getState().setStrips(1)
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: 60 })
  return id
}

it('shows findings on first render with no validate run', () => {
  // strips_total is 0 in the initial store — a hard error the derived findings
  // surface immediately.
  render(<AnalysisOutput />)
  expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
  expect(screen.getByText(/strips_total must be > 0/)).toBeInTheDocument()
})

it('shows the analysis empty state when the inputs raise nothing', () => {
  seedValidConfig()
  render(<AnalysisOutput />)
  expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()
})

it('analysis output follows an input change with no run in between', async () => {
  seedValidConfig()
  render(<AnalysisOutput />)

  expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()

  // Drop strips to 0 — the derived findings pick it up on the re-render alone
  await act(async () => {
    useStore.getState().setStrips(0)
  })

  expect(screen.queryByText('Nothing to report for the current inputs.')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
})

it('applying a template immediately changes what the analysis shows', async () => {
  seedValidConfig()
  render(<AnalysisOutput />)

  expect(screen.getByText('Nothing to report for the current inputs.')).toBeInTheDocument()

  await act(async () => {
    useStore.getState().applyTemplate('RYC Weekend')
  })

  // No stale flag, no validate run — 18 more events change the findings on the spot
  expect(screen.queryByText('Nothing to report for the current inputs.')).not.toBeInTheDocument()
})

it('shows Validation heading when the inputs produce validation errors', () => {
  useStore.getState().applyTemplate('RYC Weekend')

  render(<AnalysisOutput />)

  expect(screen.getByRole('heading', { name: 'Validation' })).toBeInTheDocument()
})

it('shows Warnings heading when the analysis raises warnings', () => {
  seedStripDeficit()

  render(<AnalysisOutput />)

  expect(screen.getByRole('heading', { name: 'Warnings' })).toBeInTheDocument()
})

it('shows Flighting Suggestions heading with Accept/Reject buttons', () => {
  seedStripDeficit()

  render(<AnalysisOutput />)

  expect(screen.getByRole('heading', { name: 'Flighting Suggestions' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument()
})

it('clicking Accept changes suggestion state to Accepted', () => {
  seedStripDeficit()

  render(<AnalysisOutput />)

  fireEvent.click(screen.getByRole('button', { name: 'Accept' }))

  expect(screen.getByText('Accepted')).toBeInTheDocument()
  expect(useStore.getState().flightingSuggestionStates[0]).toBe('accepted')
})

it('clicking Reject changes suggestion state to Rejected', () => {
  seedStripDeficit()

  render(<AnalysisOutput />)

  fireEvent.click(screen.getByRole('button', { name: 'Reject' }))

  expect(screen.getByText('Rejected')).toBeInTheDocument()
  expect(useStore.getState().flightingSuggestionStates[0]).toBe('rejected')
})
