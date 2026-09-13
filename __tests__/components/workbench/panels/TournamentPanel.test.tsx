import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { TournamentPanel } from '../../../../src/components/workbench/panels/TournamentPanel.tsx'
import { Header } from '../../../../src/components/workbench/Header.tsx'
import { useStore } from '../../../../src/store/store.ts'
import { TournamentType } from '../../../../src/engine/types.ts'

// 013 T016 (FR-013–FR-015, ui-contract.md §Inspector panel — Tournament):
// takes over the tournament-setup section's type, day-count and day-hours cases from
// configEditing.test.tsx now that the panel replaces that section component.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('TournamentPanel — type', () => {
  it('renders a radiogroup with all six tournament types, the current one checked', () => {
    render(<TournamentPanel />)

    const group = screen.getByRole('radiogroup', { name: 'Tournament type' })
    const names = Object.values(TournamentType)
    for (const name of names) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument()
    }
    expect(names).toHaveLength(6)

    // Initial store type is NAC (getInitialState default) — that pill starts checked.
    expect(screen.getByRole('radio', { name: useStore.getState().tournament_type })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    void group
  })

  it('clicking a type pill calls setTournamentType and updates the header summary', () => {
    render(
      <>
        <Header />
        <TournamentPanel />
      </>,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'ROC' }))

    expect(useStore.getState().tournament_type).toBe(TournamentType.ROC)
    expect(document.querySelector('[data-summary]')?.textContent).toContain('ROC')
  })
})

describe('TournamentPanel — day count', () => {
  it('renders a radiogroup with 2, 3 and 4, the current count checked', () => {
    useStore.getState().setDays(3)
    render(<TournamentPanel />)

    const group = screen.getByRole('radiogroup', { name: 'Day count' })
    expect(screen.getByRole('radio', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '4' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '3' })).toHaveAttribute('aria-checked', 'true')
    void group
  })

  it('clicking a day-count pill calls setDays', () => {
    useStore.getState().setDays(3)
    render(<TournamentPanel />)

    fireEvent.click(screen.getByRole('radio', { name: '4' }))

    expect(useStore.getState().days_available).toBe(4)
  })

  it('renders a disabled fourth pill with the existing out-of-range notice when days_available is 5', () => {
    useStore.getState().setDays(5)
    render(<TournamentPanel />)

    const fifth = screen.getByRole('radio', { name: '5' })
    expect(fifth).toBeDisabled()
    expect(fifth).toHaveAttribute('aria-checked', 'true')
    expect(
      screen.getByText(
        'days_available outside the recommended 2–4 day range, got 5 — the schedule can still be computed',
      ),
    ).toBeInTheDocument()
  })
})

describe('TournamentPanel — day hours', () => {
  it('shows each day\'s start and end as a combobox in 24-hour form, options drawn from the time options', () => {
    useStore.getState().setDays(2)
    render(<TournamentPanel />)

    const day1Start = screen.getByRole('combobox', { name: 'Day 1 start' })
    const day1End = screen.getByRole('combobox', { name: 'Day 1 end' })
    const day2Start = screen.getByRole('combobox', { name: 'Day 2 start' })
    const day2End = screen.getByRole('combobox', { name: 'Day 2 end' })

    expect(day1Start).toHaveTextContent('08:00')
    expect(day1End).toHaveTextContent('22:00')
    expect(day2Start).toHaveTextContent('08:00')
    expect(day2End).toHaveTextContent('22:00')
  })

  it('reflects a store edit to a day\'s hours in 24-hour form', () => {
    useStore.getState().setDays(1)
    render(<TournamentPanel />)

    act(() => {
      useStore.getState().updateDayConfig(0, { day_start_time: 420, day_end_time: 1260 })
    })

    expect(screen.getByRole('combobox', { name: 'Day 1 start' })).toHaveTextContent('07:00')
    expect(screen.getByRole('combobox', { name: 'Day 1 end' })).toHaveTextContent('21:00')
  })
})
