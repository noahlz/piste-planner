import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { StatusFooter } from '../../../src/components/workbench/StatusFooter.tsx'
import { useStore } from '../../../src/store/store.ts'
import { selectFooterMetrics, selectPlacementCounts } from '../../../src/store/derived.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { formatClock } from '../../../src/lib/time.ts'
import { WEAPON_DISPLAY } from '../../../src/lib/competitionLabels.ts'
import { Weapon } from '../../../src/engine/types.ts'
import { ViewMode } from '../../../src/store/viewState.ts'

// 013 T011a — the retired bottom panel and its scorecard collapse into a
// one-line StatusFooter (FR-049, FR-050; research D7, D18; contracts/
// ui-contract.md §Footer). Three metrics read from the live selector, a
// weapon legend, and the view toggle moved verbatim from CenterView. No
// delta, no disclosure, no hover — those belonged to the retired scorecard,
// which is gone (research D7).
//
// 013 T025 (phase-3 contract) — StatusFooter gains a zoom toolbar
// (FR-034, SC-005; contracts/ui-contract.md §Footer), so every render below
// now carries `zoom` and `onZoomChange` alongside the existing props.

function metricText(id: string): string {
  return document.querySelector(`[data-metric="${id}"]`)?.textContent ?? ''
}

/** The default zoom prop every pre-existing case renders with — step 2 (100%), not fitting. */
const ZOOM = { zoomStep: 2, fitting: false }

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

    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    // formatClock, not formatMinutes (FR-041): every time is 24-hour HH:MM.
    expect(metricText('finish')).toContain(formatClock(finish!))
    expect(metricText('refs')).toContain(String(Math.round(refs!)))
    expect(metricText('strips')).toContain(`${strips!.toFixed(1)}%`)
  })

  it('shows an em dash for finish on an empty store', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(metricText('finish')).toContain('—')
  })
})

describe('StatusFooter counts (data-model.md §10)', () => {
  it('renders placed, unplaced and pinned from selectPlacementCounts, against the B1 preset', () => {
    applyPreset('B1')
    runScheduleAll()
    const counts = selectPlacementCounts(useStore.getState())

    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(document.querySelector('[data-counts]')?.textContent).toBe(
      `${counts.placed} placed · ${counts.unplaced} unplaced · ${counts.pinned} pinned`,
    )
  })

  it('renders zero counts on an empty store', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(document.querySelector('[data-counts]')?.textContent).toBe('0 placed · 0 unplaced · 0 pinned')
  })
})

describe('StatusFooter legend (FR-050)', () => {
  it('names all three weapons', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    const legend = document.querySelector('[data-legend]')
    expect(legend).not.toBeNull()
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.FOIL])
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.EPEE])
    expect(legend!.textContent).toContain(WEAPON_DISPLAY[Weapon.SABRE])
  })
})

describe('StatusFooter view toggle (moved verbatim from CenterView)', () => {
  it('is a landmark named "Status bar"', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(screen.getByRole('contentinfo', { name: 'Status bar' })).toBeInTheDocument()
  })

  it('checks the radio matching the viewMode prop and calls onViewModeChange with the other value on click', () => {
    const onViewModeChange = vi.fn()
    const { rerender } = render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={onViewModeChange}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(screen.getByRole('radiogroup', { name: 'Center view mode' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Matrix' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Schedule' })).not.toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Schedule' }))
    expect(onViewModeChange).toHaveBeenCalledOnce()
    expect(onViewModeChange).toHaveBeenCalledWith(ViewMode.SCHEDULE)

    // The component itself does not own viewMode — the caller does, so a
    // rerender with the new value is what proves the checked state follows it.
    rerender(
      <StatusFooter
        viewMode={ViewMode.SCHEDULE}
        onViewModeChange={onViewModeChange}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: 'Schedule' })).toBeChecked()
  })

  it('treats a click on the already-checked radio as a no-op (Radix reports "" for it)', () => {
    const onViewModeChange = vi.fn()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={onViewModeChange}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Matrix' }))

    expect(onViewModeChange).not.toHaveBeenCalled()
  })
})

describe('StatusFooter drops the retired comparison surface (FR-066)', () => {
  it('renders no metric delta', () => {
    applyPreset('B1')
    runScheduleAll()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    expect(document.querySelectorAll('[data-metric-delta]')).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// Zoom toolbar (013 T025 phase-3 contract; FR-034, SC-005;
// contracts/ui-contract.md §Footer)
// ──────────────────────────────────────────────

describe('StatusFooter zoom toolbar (FR-034, SC-005)', () => {
  // zoomReadout(step) for the six-rung ladder, contracts/phase3-contract.md
  // §zoomLadder.ts: rung ppm / ZOOM_BASE_PPM (rung 2's 3.2) as a percentage,
  // rounded. Hardcoded here rather than imported from zoomLadder.ts — that
  // module is T026's to create, and this file must fail for "the toolbar does
  // not exist" (or the readout is wrong), never for a missing import.
  const READOUTS: { step: number; readout: string }[] = [
    { step: 0, readout: '47%' },
    { step: 1, readout: '69%' },
    { step: 2, readout: '100%' },
    { step: 3, readout: '144%' },
    { step: 4, readout: '203%' },
    { step: 5, readout: '281%' },
  ]

  it.each(READOUTS)('shows a $readout readout at zoom step $step', ({ step, readout }) => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: step, fitting: false }}
        onZoomChange={() => {}}
      />,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Zoom' })
    expect(toolbar).toBeInTheDocument()
    expect(toolbar.querySelector('[data-zoom-readout]')?.textContent).toBe(readout)
  })

  it('shows the readout as a percentage even while fitting', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 3, fitting: true }}
        onZoomChange={() => {}}
      />,
    )

    expect(
      screen.getByRole('toolbar', { name: 'Zoom' }).querySelector('[data-zoom-readout]')?.textContent,
    ).toBe('144%')
  })

  it('contains the four zoom buttons, enabled in the middle of the ladder', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={() => {}}
      />,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Zoom' })
    for (const name of ['Zoom out', 'Zoom in', 'Reset zoom', 'Fit day']) {
      expect(within(toolbar).getByRole('button', { name })).toBeInTheDocument()
    }
    expect(within(toolbar).getByRole('button', { name: 'Zoom in' })).not.toBeDisabled()
    expect(within(toolbar).getByRole('button', { name: 'Zoom out' })).not.toBeDisabled()
  })

  it('disables "Zoom in" at the top rung (step 5)', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 5, fitting: false }}
        onZoomChange={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zoom out' })).not.toBeDisabled()
  })

  it('disables "Zoom out" at the bottom rung (step 0)', () => {
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 0, fitting: false }}
        onZoomChange={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Zoom in' })).not.toBeDisabled()
  })

  it('clicking "Zoom in" calls onZoomChange with the next step, fitting cleared', () => {
    const onZoomChange = vi.fn()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={onZoomChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))

    expect(onZoomChange).toHaveBeenCalledOnce()
    expect(onZoomChange).toHaveBeenCalledWith({ zoomStep: 3, fitting: false })
  })

  it('clicking "Zoom out" calls onZoomChange with the previous step, fitting cleared', () => {
    const onZoomChange = vi.fn()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={onZoomChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))

    expect(onZoomChange).toHaveBeenCalledOnce()
    expect(onZoomChange).toHaveBeenCalledWith({ zoomStep: 1, fitting: false })
  })

  it('clicking "Reset zoom" calls onZoomChange with step 2, fitting cleared', () => {
    const onZoomChange = vi.fn()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 5, fitting: true }}
        onZoomChange={onZoomChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reset zoom' }))

    expect(onZoomChange).toHaveBeenCalledOnce()
    expect(onZoomChange).toHaveBeenCalledWith({ zoomStep: 2, fitting: false })
  })

  it('clicking "Fit day" calls onZoomChange with fitting set, zoomStep unchanged', () => {
    const onZoomChange = vi.fn()
    render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={ZOOM}
        onZoomChange={onZoomChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Fit day' }))

    expect(onZoomChange).toHaveBeenCalledOnce()
    expect(onZoomChange).toHaveBeenCalledWith({ zoomStep: 2, fitting: true })
  })

  it('"Fit day" is aria-pressed=true when zoom.fitting is true, false otherwise', () => {
    const { rerender } = render(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 2, fitting: false }}
        onZoomChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fit day' })).toHaveAttribute('aria-pressed', 'false')

    rerender(
      <StatusFooter
        viewMode={ViewMode.MATRIX}
        onViewModeChange={() => {}}
        zoom={{ zoomStep: 2, fitting: true }}
        onZoomChange={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Fit day' })).toHaveAttribute('aria-pressed', 'true')
  })
})
