import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RefRequirementsReport } from '../../src/components/sections/RefRequirementsReport.tsx'
import type { RefRequirementsByDay } from '../../src/engine/types.ts'

const THREE_DAY_REQUIREMENTS: RefRequirementsByDay[] = [
  { day: 0, peak_total_refs: 12, peak_saber_refs: 4, peak_time: 540 },
  { day: 1, peak_total_refs: 10, peak_saber_refs: 3, peak_time: 615 },
  { day: 2, peak_total_refs: 8, peak_saber_refs: 2, peak_time: 570 },
]

describe('RefRequirementsReport', () => {
  it('renders one row per day for a 3-day requirements array', () => {
    render(<RefRequirementsReport requirements={THREE_DAY_REQUIREMENTS} />)

    expect(screen.getByText('Day 1')).toBeInTheDocument()
    expect(screen.getByText('Day 2')).toBeInTheDocument()
    expect(screen.getByText('Day 3')).toBeInTheDocument()
  })

  it('shows peak_total_refs and peak_saber_refs correctly', () => {
    render(<RefRequirementsReport requirements={THREE_DAY_REQUIREMENTS} />)

    const day1Row = screen.getByRole('row', { name: /Day 1/ })
    expect(within(day1Row).getByText('12')).toBeInTheDocument()
    expect(within(day1Row).getByText('4')).toBeInTheDocument()

    const day2Row = screen.getByRole('row', { name: /Day 2/ })
    expect(within(day2Row).getByText('10')).toBeInTheDocument()
    expect(within(day2Row).getByText('3')).toBeInTheDocument()

    const day3Row = screen.getByRole('row', { name: /Day 3/ })
    expect(within(day3Row).getByText('8')).toBeInTheDocument()
    expect(within(day3Row).getByText('2')).toBeInTheDocument()
  })

  it('formats peak_time as H:MM (540 → "9:00", 615 → "10:15")', () => {
    render(<RefRequirementsReport requirements={THREE_DAY_REQUIREMENTS} />)

    // Day 0: 540 mins = 9:00
    expect(screen.getByText('9:00')).toBeInTheDocument()
    // Day 1: 615 mins = 10:15
    expect(screen.getByText('10:15')).toBeInTheDocument()
    // Day 2: 570 mins = 9:30
    expect(screen.getByText('9:30')).toBeInTheDocument()
  })

  it('shows placeholder for empty array', () => {
    render(<RefRequirementsReport requirements={[]} />)

    expect(screen.getByText('Run Generate Schedule to see results.')).toBeInTheDocument()
    // Table should not render
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows placeholder for undefined prop', () => {
    render(<RefRequirementsReport requirements={undefined} />)

    expect(screen.getByText('Run Generate Schedule to see results.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('computes and renders FE-only column = peak_total - peak_saber', () => {
    render(<RefRequirementsReport requirements={THREE_DAY_REQUIREMENTS} />)

    // Day 0: 12 - 4 = 8 (FE-only)
    // Day 1: 10 - 3 = 7
    // Day 2: 8 - 2 = 6

    const day1Row = screen.getByRole('row', { name: /Day 1/ })
    expect(within(day1Row).getByText('8')).toBeInTheDocument()

    const day2Row = screen.getByRole('row', { name: /Day 2/ })
    expect(within(day2Row).getByText('7')).toBeInTheDocument()

    const day3Row = screen.getByRole('row', { name: /Day 3/ })
    expect(within(day3Row).getByText('6')).toBeInTheDocument()
  })
})
