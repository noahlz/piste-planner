import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StatusFooter } from '../../../src/components/workbench/StatusFooter.tsx'
import { useStore } from '../../../src/store/store.ts'
import { selectFooterMetrics, selectPlacementCounts } from '../../../src/store/derived.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { formatClock } from '../../../src/lib/time.ts'
import { WEAPON_DISPLAY } from '../../../src/components/competitionLabels.ts'
import { Weapon } from '../../../src/engine/types.ts'
import { ViewMode } from '../../../src/store/viewState.ts'

// 013 T011a — the drawer's Scorecard and Drawer collapse into a one-line
// StatusFooter (FR-049, FR-050; research D7, D18; contracts/ui-contract.md
// §Footer). Three metrics read from the live selector, a weapon legend, and
// the view toggle moved verbatim from CenterView. No delta, no disclosure, no
// hover — those were the Scorecard's, and the Scorecard is gone (research D7).

function metricText(id: string): string {
  return document.querySelector(`[data-metric="${id}"]`)?.textContent ?? ''
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('StatusFooter metrics (FR-049)', () => {
  it('renders finish, peak referees and strip use from the live selector, against the B1 preset', () => {
    applyPreset('B1')
    runScheduleAll()
    const metrics = selectFooterMetrics(useStore.getState())
    const finish = metrics.find((m) => m.id === 'finish:tournament')!.value
    const refs = metrics.find((m) => m.id === 'refs:peak-total')!.value
    const strips = metrics.find((m) => m.id === 'strips:utilization')!.value
    expect(finish).not.toBeNull()
    expect(refs).not.toBeNull()
    expect(strips).not.toBeNull()

    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    // formatClock, not formatMinutes (FR-041): every time is 24-hour HH:MM.
    expect(metricText('finish')).toContain(formatClock(finish!))
    expect(metricText('refs')).toContain(String(Math.round(refs!)))
    expect(metricText('strips')).toContain(`${strips!.toFixed(1)}%`)
  })

  it('shows an em dash for finish on an empty store', () => {
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    expect(metricText('finish')).toContain('—')
  })
})

describe('StatusFooter counts (data-model.md §10)', () => {
  it('renders placed, unplaced and pinned from selectPlacementCounts, against the B1 preset', () => {
    applyPreset('B1')
    runScheduleAll()
    const counts = selectPlacementCounts(useStore.getState())

    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    expect(document.querySelector('[data-counts]')?.textContent).toBe(
      `${counts.placed} placed · ${counts.unplaced} unplaced · ${counts.pinned} pinned`,
    )
  })

  it('renders zero counts on an empty store', () => {
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    expect(document.querySelector('[data-counts]')?.textContent).toBe('0 placed · 0 unplaced · 0 pinned')
  })
})

describe('StatusFooter legend (FR-050)', () => {
  it('names all three weapons', () => {
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    const legend = document.querySelector('[data-legend]')
    expect(legend).not.toBeNull()
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.FOIL])
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.EPEE])
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.SABRE])
  })
})

describe('StatusFooter view toggle (moved verbatim from CenterView)', () => {
  it('is a landmark named "Status bar"', () => {
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    expect(screen.getByRole('contentinfo', { name: 'Status bar' })).toBeInTheDocument()
  })

  it('checks the radio matching the viewMode prop and calls onViewModeChange with the other value on click', () => {
    const onViewModeChange = vi.fn()
    const { rerender } = render(
      <StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={onViewModeChange} />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Center view mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Schedule' })).not.toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(onViewModeChange).toHaveBeenCalledOnce()
    expect(onViewModeChange).toHaveBeenCalledWith(ViewMode.SCHEDULE)

    // The component itself does not own viewMode — the caller does, so a
    // rerender with the new value is what proves the checked state follows it.
    rerender(<StatusFooter viewMode={ViewMode.SCHEDULE} onViewModeChange={onViewModeChange} />)
    expect(screen.getByRole('radio', { name: 'Schedule' })).toBeChecked()
  })

  it('treats a click on the already-checked radio as a no-op (Radix reports "" for it)', () => {
    const onViewModeChange = vi.fn()
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={onViewModeChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Matrix' }))

    expect(onViewModeChange).not.toHaveBeenCalled()
  })
})

describe('StatusFooter drops the scorecard and drawer surface (FR-066)', () => {
  it('renders no delta, no disclosure button, and no Scorecard or Drawer region', () => {
    applyPreset('B1')
    runScheduleAll()
    render(<StatusFooter viewMode={ViewMode.MATRIX} onViewModeChange={() => {}} />)

    expect(document.querySelectorAll('[data-metric-delta]')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Scorecard details' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Scorecard' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Drawer' })).not.toBeInTheDocument()
  })
})
