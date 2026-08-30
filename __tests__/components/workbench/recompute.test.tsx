import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FencerCounts } from '../../../src/components/sections/FencerCounts.tsx'
import { AnalysisOutput } from '../../../src/components/sections/AnalysisOutput.tsx'
import { CenterView, CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES } from '../../../src/engine/catalogue.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T009 — two-tier recompute (FR-008, S2-contract.md §Center view and the
// dimmed-invalid rule): findings follow every keystroke, the center
// relayouts only once CENTER_SETTLE_MS has elapsed with no further edit.
// vi.useFakeTimers() drives that gap deterministically instead of a real
// 150ms sleep — real timers would make this test either slow or flaky.
//
// The edit stays inside valid bounds (8 -> 90 fencers, both above
// MIN_FENCERS and below MAX_FENCERS) so the only thing crossing a threshold
// is the WARN-severity capacity bottleneck in initialAnalysis — never an
// ERROR, which would engage T008's dimmed rule and freeze the center by
// design, defeating what this test is checking.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** The rail's fencer-count edit, the drawer's findings, and the center — each
 *  wrapped so a before/after textContent snapshot can be scoped to one region. */
function RecomputeHost() {
  return (
    <>
      <div data-testid="fencer-counts">
        <FencerCounts />
      </div>
      <div data-testid="drawer">
        <AnalysisOutput />
      </div>
      <div data-testid="center">
        <CenterView />
      </div>
    </>
  )
}

function seedPlacedCompetition(fencerCount: number): string {
  const id = TEMPLATES['RYC Weekend'][0]
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: fencerCount })
  useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ strip_count: 5 }) })
  return id
}

describe('two-tier recompute', () => {
  it('a fencer-count keystroke moves the drawer immediately; the center follows only after CENTER_SETTLE_MS', () => {
    // 8 fencers -> ceil(8/7) = 2 pools, well under the 12 strips seeded
    // below: no capacity warning yet.
    const id = seedPlacedCompetition(8)
    render(<RecomputeHost />)

    const drawer = screen.getByTestId('drawer')
    const center = screen.getByTestId('center')
    expect(drawer.textContent).not.toMatch(/strips available/)
    const centerBefore = center.textContent

    const input = screen.getByRole('spinbutton', { name: /Fencer count for/ })
    act(() => {
      // 90 fencers -> ceil(90/7) = 13 pools, over the 12-strip capacity — a
      // WARN bottleneck, not a validation ERROR. commitOnChange means this
      // needs no blur to reach the store.
      fireEvent.change(input, { target: { value: '90' } })
    })

    // The store and the drawer already reflect the new value — no blur, no
    // timer advance.
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(90)
    expect(drawer.textContent).toMatch(/pools assigned but only 12 strips available/)

    // The center has not relayouted yet — same text as before the edit.
    expect(center.textContent).toBe(centerBefore)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS)
    })

    // Only now does the center pick up the new pool/DE structure.
    expect(center.textContent).not.toBe(centerBefore)
  })

  it('restarts the settle timer on a second edit rather than relayouting at the first deadline', () => {
    const id = seedPlacedCompetition(8)
    render(<RecomputeHost />)

    const center = screen.getByTestId('center')
    const centerBefore = center.textContent
    const input = screen.getByRole('spinbutton', { name: /Fencer count for/ })

    act(() => {
      fireEvent.change(input, { target: { value: '40' } })
    })
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    // Short of the deadline — still the pre-edit layout.
    expect(center.textContent).toBe(centerBefore)

    act(() => {
      fireEvent.change(input, { target: { value: '90' } })
    })
    // The second edit restarted the debounce — advancing only the remaining
    // 10ms from the first edit must not be enough to relayout.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(center.textContent).toBe(centerBefore)
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(90)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    expect(center.textContent).not.toBe(centerBefore)
  })
})
