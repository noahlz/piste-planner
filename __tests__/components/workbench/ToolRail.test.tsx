import { describe, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { ToolRail } from '../../../src/components/workbench/ToolRail.tsx'
import { PanelId } from '../../../src/store/viewState.ts'

// 013 T009 — re-targets RailPanel.test.tsx's "Rail panel order" cases
// (deleted here). The collapsible rail's five headings become five buttons
// that select one inspector panel at a time (ui-contract.md §Tool rail).

const NAMES = ['Tournament', 'Strips & referees', 'Events', 'Findings', 'Settings']
const IDS = [PanelId.TOURNAMENT, PanelId.STRIPS, PanelId.EVENTS, PanelId.FINDINGS, PanelId.SETTINGS]

describe('ToolRail', () => {
  it('holds exactly five buttons in the stated visual order', () => {
    render(<ToolRail panel={null} onSelect={() => {}} />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    expect(within(rail).getAllByRole('button')).toHaveLength(5)

    const buttons = NAMES.map((name) => within(rail).getByRole('button', { name }))
    for (let i = 1; i < buttons.length; i++) {
      expect(
        buttons[i - 1].compareDocumentPosition(buttons[i]) & Node.DOCUMENT_POSITION_FOLLOWING,
        `"${NAMES[i]}" does not follow "${NAMES[i - 1]}" in the DOM`,
      ).toBeTruthy()
    }
  })

  it('marks the open panel pressed and every other button unpressed', () => {
    render(<ToolRail panel={PanelId.EVENTS} onSelect={() => {}} />)
    const rail = screen.getByRole('navigation', { name: 'Tool rail' })

    for (const name of NAMES) {
      const expected = name === 'Events' ? 'true' : 'false'
      expect(within(rail).getByRole('button', { name })).toHaveAttribute('aria-pressed', expected)
    }
  })

  it('closes the open panel when its own button is pressed again', () => {
    const onSelect = vi.fn()
    render(<ToolRail panel={PanelId.STRIPS} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Strips & referees' }))

    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('opens a different panel when a closed button is pressed', () => {
    const onSelect = vi.fn()
    render(<ToolRail panel={PanelId.STRIPS} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Findings' }))

    expect(onSelect).toHaveBeenCalledWith(PanelId.FINDINGS)
  })

  it('opens a panel from a fully closed rail', () => {
    const onSelect = vi.fn()
    render(<ToolRail panel={null} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole('button', { name: 'Tournament' }))

    expect(onSelect).toHaveBeenCalledWith(PanelId.TOURNAMENT)
  })

  it('gives no button a positive tabindex, so tab order stays visual order', () => {
    render(<ToolRail panel={null} onSelect={() => {}} />)
    const rail = screen.getByRole('navigation', { name: 'Tool rail' })

    for (const name of NAMES) {
      const attr = within(rail).getByRole('button', { name }).getAttribute('tabindex')
      expect(
        attr === null || Number(attr) <= 0,
        `"${name}" has tabindex="${attr}", which pulls it out of visual tab order`,
      ).toBe(true)
    }
  })

  it('presses at most one button for any panel value', () => {
    const { rerender } = render(<ToolRail panel={null} onSelect={() => {}} />)
    const rail = screen.getByRole('navigation', { name: 'Tool rail' })

    for (const panel of [null, ...IDS]) {
      rerender(<ToolRail panel={panel} onSelect={() => {}} />)
      const pressed = within(rail)
        .getAllByRole('button')
        .filter((b) => b.getAttribute('aria-pressed') === 'true')
      expect(pressed.length).toBeLessThanOrEqual(1)
    }
  })
})
