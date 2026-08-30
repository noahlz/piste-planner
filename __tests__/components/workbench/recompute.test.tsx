import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { FencerCounts } from '../../../src/components/sections/FencerCounts.tsx'
import { AnalysisOutput } from '../../../src/components/sections/AnalysisOutput.tsx'
import { CenterView, CENTER_SETTLE_MS } from '../../../src/components/workbench/CenterView.tsx'
import { useStore } from '../../../src/store/store.ts'
import { TEMPLATES, findCompetition } from '../../../src/engine/catalogue.ts'
import { competitionLabel } from '../../../src/components/competitionLabels.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T009 — two-tier recompute (FR-008, S2-contract.md §Center view and the
// dimmed-invalid rule): findings follow every keystroke, the center
// relayouts only once CENTER_SETTLE_MS has elapsed with no further edit.
// vi.useFakeTimers() drives that gap deterministically instead of a real
// 150ms sleep — real timers would make this test either slow or flaky.
//
// Every edit here must leave the config *valid*, or T008's dimmed rule
// engages and freezes the center by design, making this test vacuous. That
// rules out driving one competition over the strip count: validateConfig's
// resource_precondition rule (src/engine/validation.ts) is a `policy` finding,
// which is ERROR in BINDING mode as soon as a single competition's n_pools
// exceeds strips_total. So the WARN under test is reached the other way — two
// competitions sharing day 1, each individually within the 12 strips, summing
// past them. initialAnalysis's pass-0 capacity bottleneck sums pools per day
// and is only ever WARN.
//
// Pool counts, at 12 strips and the 0.80 max_pool_strip_pct that gives a
// 9-strip pass-1 cap:
//   60 fencers -> 9 pools   (the companion: at the cap, so silent throughout)
//    8 fencers -> 1 pool    (day total 10 — no warning yet)
//   40 fencers -> 6 pools   (day total 15 — pass-0 WARN, no ERROR)
//   45 fencers -> 7 pools   (day total 16 — pass-0 WARN, no ERROR)

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

/** The competition under test, plus a fixed companion sharing its day so the
 *  day's pool total can cross the strip count without either event alone
 *  tripping validateConfig's per-competition ERROR. */
function seedPlacedCompetitions(fencerCount: number): string {
  const id = TEMPLATES['RYC Weekend'][0]
  const companionId = TEMPLATES['RYC Weekend'][1]
  useStore.getState().setDays(3)
  useStore.getState().setStrips(12)
  useStore.getState().setVideoStrips(2)
  useStore.getState().addCompetition(id)
  useStore.getState().updateCompetition(id, { fencer_count: fencerCount })
  useStore.getState().addCompetition(companionId)
  useStore.getState().updateCompetition(companionId, { fencer_count: 60 })
  useStore.getState().setPlacementsFromAuto({
    [id]: makePlacement({ strip_count: 5 }),
    [companionId]: makePlacement({ strip_count: 5 }),
  })
  return id
}

/** The one fencer-count input belonging to `id` — FencerCounts renders one per
 *  selected competition, so the shared /Fencer count for/ regex is ambiguous here. */
function fencerInput(id: string): HTMLElement {
  const entry = findCompetition(id)
  const label = entry ? competitionLabel(entry) : id
  return screen.getByRole('spinbutton', { name: `Fencer count for ${label}` })
}

describe('two-tier recompute', () => {
  it('a fencer-count keystroke moves the drawer immediately; the center follows only after CENTER_SETTLE_MS', () => {
    // 8 fencers -> 1 pool, and 9 for the companion: 10 pools on day 1, under
    // the 12 strips seeded below, so no capacity warning yet.
    const id = seedPlacedCompetitions(8)
    render(<RecomputeHost />)

    const drawer = screen.getByTestId('drawer')
    const center = screen.getByTestId('center')
    expect(drawer.textContent).not.toMatch(/strips available/)
    const centerBefore = center.textContent

    const input = fencerInput(id)
    act(() => {
      // 45 fencers -> ceil(45/7) = 7 pools, taking day 1 to 16 against 12
      // strips — a WARN bottleneck, not a validation ERROR, since neither
      // competition alone exceeds 12. commitOnChange means this needs no blur
      // to reach the store.
      fireEvent.change(input, { target: { value: '45' } })
    })

    // The store and the drawer already reflect the new value — no blur, no
    // timer advance.
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(45)
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
    const id = seedPlacedCompetitions(8)
    render(<RecomputeHost />)

    const center = screen.getByTestId('center')
    const centerBefore = center.textContent
    const input = fencerInput(id)

    act(() => {
      fireEvent.change(input, { target: { value: '40' } })
    })
    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    // Short of the deadline — still the pre-edit layout.
    expect(center.textContent).toBe(centerBefore)

    act(() => {
      fireEvent.change(input, { target: { value: '45' } })
    })
    // The second edit restarted the debounce — advancing only the remaining
    // 10ms from the first edit must not be enough to relayout.
    act(() => {
      vi.advanceTimersByTime(10)
    })
    expect(center.textContent).toBe(centerBefore)
    expect(useStore.getState().selectedCompetitions[id].fencer_count).toBe(45)

    act(() => {
      vi.advanceTimersByTime(CENTER_SETTLE_MS - 10)
    })
    expect(center.textContent).not.toBe(centerBefore)
  })
})
