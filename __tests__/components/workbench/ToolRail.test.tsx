import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { ToolRail } from '../../../src/components/workbench/ToolRail.tsx'
import { PanelId } from '../../../src/store/viewState.ts'
import { useStore, type StoreState } from '../../../src/store/store.ts'
import * as derivedModule from '../../../src/store/derived.ts'

// 013 T009 — re-targets the retired collapsible rail's own "Rail panel
// order" test file (deleted here). The collapsible rail's five headings
// become five buttons that select one inspector panel at a time
// (ui-contract.md §Tool rail).

const NAMES = ['Tournament', 'Strips & referees', 'Events', 'Findings', 'Settings']
const IDS = [PanelId.TOURNAMENT, PanelId.STRIPS, PanelId.EVENTS, PanelId.FINDINGS, PanelId.SETTINGS]

// 013 T030, contract §5. `selectFindings` (derived.ts) does not exist yet —
// read through a `* as module` cast (dismissals.test.ts's `findingIdentity`
// pattern) so tsc stays clean about this symbol and the red is a runtime
// throw, not a compile error.
function selectFindingsCount(state: StoreState): number {
  const mod = derivedModule as unknown as { selectFindings?: (s: StoreState) => unknown[] }
  if (!mod.selectFindings) {
    throw new Error('derived.ts does not yet export selectFindings (013 T030)')
  }
  return mod.selectFindings(state).length
}

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

describe('ToolRail findings badge (013 T030, contract §5)', () => {
  beforeEach(() => {
    useStore.setState(useStore.getInitialState())
  })

  it('carries data-badge equal to the findings count, shown as text, when at least one Blocking row exists', () => {
    useStore.getState().setStrips(0)
    render(<ToolRail panel={null} onSelect={() => {}} />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    const findingsButton = within(rail).getByRole('button', { name: 'Findings' })

    const count = selectFindingsCount(useStore.getState())
    expect(count).toBeGreaterThanOrEqual(1)
    expect(findingsButton).toHaveAttribute('data-badge', String(count))
    expect(findingsButton).toHaveTextContent(String(count))
  })

  it('carries data-badge="0" on a clean seeded store', () => {
    useStore.getState().setDays(3)
    useStore.getState().setStrips(12)
    useStore.getState().setVideoStrips(2)
    render(<ToolRail panel={null} onSelect={() => {}} />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    const findingsButton = within(rail).getByRole('button', { name: 'Findings' })

    expect(findingsButton).toHaveAttribute('data-badge', '0')
  })

  it('gives the other four buttons no data-badge', () => {
    useStore.getState().setStrips(0)
    render(<ToolRail panel={null} onSelect={() => {}} />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    for (const name of NAMES.filter((n) => n !== 'Findings')) {
      expect(within(rail).getByRole('button', { name })).not.toHaveAttribute('data-badge')
    }
  })

  it('keeps the accessible name exactly "Findings"', () => {
    useStore.getState().setStrips(0)
    render(<ToolRail panel={null} onSelect={() => {}} />)

    const rail = screen.getByRole('navigation', { name: 'Tool rail' })
    expect(within(rail).getByRole('button', { name: 'Findings' })).toBeInTheDocument()
  })
})
