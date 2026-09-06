import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { StripSetup, SUGGEST_INDICATOR_DELAY_MS } from '../../../src/components/sections/StripSetup.tsx'
import { useStore } from '../../../src/store/store.ts'

// 012 T013 (US2, FR-008/FR-009/FR-010) — the Suggest button's search
// (research.md D5) yields to the browser between candidates, so a search on
// the largest template takes 199-229ms (baseline.md §5) while every other
// template finishes in well under 100ms. An indicator revealed only after a
// fixed delay tells the organizer the app is working on the slow boards
// without ever flashing into view on the fast ones. `suggestStrips` is
// replaced on the store with a promise the test controls, so these tests pin
// the component's own timing contract independent of how long a real search
// takes.

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Installs a controllable `suggestStrips` on the store and returns the
 *  resolver the test calls to finish the "search". */
function stubSuggestStrips(): () => void {
  let resolveSearch!: () => void
  const search = new Promise<void>((resolve) => {
    resolveSearch = resolve
  })
  useStore.setState({ suggestStrips: vi.fn(() => search) })
  return resolveSearch
}

describe('StripSetup — the searching indicator (T013)', () => {
  it('a search that outlasts the reveal delay shows an indicator naming the search, then clears it', async () => {
    const resolveSearch = stubSuggestStrips()
    render(<StripSetup />)

    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))

    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS)
    })

    const indicator = screen.getByRole('status')
    expect(indicator.textContent).toMatch(/search/i)
    // FR-009: names what the app is doing, not merely that it is busy.
    expect(indicator.textContent).not.toMatch(/loading/i)
    // Standing rule 6 / FR-005 / FR-017: no number reaches the indicator.
    expect(indicator.textContent).not.toMatch(/\d/)

    await act(async () => {
      resolveSearch()
    })

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a search shorter than the reveal delay never shows the indicator', async () => {
    const resolveSearch = stubSuggestStrips()
    render(<StripSetup />)

    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))

    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS - 1)
    })
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      resolveSearch()
    })
    expect(screen.queryByRole('status')).toBeNull()

    // The reveal timer must have been cancelled, not merely outrun — advancing
    // past the delay after resolution must not bring the indicator back.
    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('disables the Suggest button while a search runs and leaves the strip field unchanged until it resolves', async () => {
    const resolveSearch = stubSuggestStrips()
    render(<StripSetup />)

    const field = screen.getByRole('spinbutton', { name: 'Number of strips' })
    const valueBefore = (field as HTMLInputElement).value

    const button = screen.getByRole('button', { name: /suggest/i })
    fireEvent.click(button)

    expect(button).toBeDisabled()
    expect((field as HTMLInputElement).value).toBe(valueBefore)

    await act(async () => {
      resolveSearch()
    })

    expect(button).not.toBeDisabled()
  })

  it('cancels the reveal timer on unmount so a still-pending search never renders', async () => {
    const resolveSearch = stubSuggestStrips()
    const { unmount } = render(<StripSetup />)

    fireEvent.click(screen.getByRole('button', { name: /suggest/i }))

    unmount()

    // The cleanup effect must clear the reveal timer synchronously on
    // unmount. Without this the test below cannot fail: unmount() already
    // tears down the DOM tree, so queryByRole('status') reads null either
    // way, and React 19 silently no-ops a setState on an unmounted
    // component rather than throwing.
    expect(vi.getTimerCount()).toBe(0)

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS + 1)
      })
    }).not.toThrow()
    expect(screen.queryByRole('status')).toBeNull()

    // The suggestStrips call is still pending after unmount — resolve it so
    // the `finally` handler's setState calls no-op instead of throwing.
    await act(async () => {
      resolveSearch()
    })
  })
})
