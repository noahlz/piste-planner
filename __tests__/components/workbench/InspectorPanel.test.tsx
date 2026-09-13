import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InspectorPanel, PANEL_TITLES } from '../../../src/components/workbench/InspectorPanel.tsx'
import { PanelId } from '../../../src/store/viewState.ts'

// 013 T009 — the panel host each tool-rail button opens (ui-contract.md
// §Inspector panel). Phase 2 replaces the section components it wraps one at
// a time; this suite pins only the host's own chrome.

describe('InspectorPanel', () => {
  it.each(Object.values(PanelId))('names itself in an h2 inside the Inspector panel landmark (%s)', (panel) => {
    render(
      <InspectorPanel panel={panel} docked={false} onToggleDocked={() => {}} onClose={() => {}}>
        <p>content</p>
      </InspectorPanel>,
    )

    const aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(aside.querySelector('h2')).toHaveTextContent(PANEL_TITLES[panel])
  })

  it('renders its children inside the landmark', () => {
    render(
      <InspectorPanel panel={PanelId.TOURNAMENT} docked={false} onToggleDocked={() => {}} onClose={() => {}}>
        <p>panel body</p>
      </InspectorPanel>,
    )

    const aside = screen.getByRole('complementary', { name: 'Inspector panel' })
    expect(aside).toHaveTextContent('panel body')
  })

  it('offers "Dock panel" while floating and calls onToggleDocked', () => {
    const onToggleDocked = vi.fn()
    render(
      <InspectorPanel panel={PanelId.TOURNAMENT} docked={false} onToggleDocked={onToggleDocked} onClose={() => {}}>
        <p>content</p>
      </InspectorPanel>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dock panel' }))
    expect(onToggleDocked).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Float panel' })).not.toBeInTheDocument()
  })

  it('reads "Float panel" once docked and calls onToggleDocked', () => {
    const onToggleDocked = vi.fn()
    render(
      <InspectorPanel panel={PanelId.TOURNAMENT} docked onToggleDocked={onToggleDocked} onClose={() => {}}>
        <p>content</p>
      </InspectorPanel>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Float panel' }))
    expect(onToggleDocked).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Dock panel' })).not.toBeInTheDocument()
  })

  it('calls onClose when Close panel is pressed', () => {
    const onClose = vi.fn()
    render(
      <InspectorPanel panel={PanelId.TOURNAMENT} docked={false} onToggleDocked={() => {}} onClose={onClose}>
        <p>content</p>
      </InspectorPanel>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close panel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
