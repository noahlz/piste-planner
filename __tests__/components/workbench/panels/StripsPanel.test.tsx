import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import {
  StripsPanel,
  SUGGEST_INDICATOR_DELAY_MS,
} from '../../../../src/components/workbench/panels/StripsPanel.tsx'
import { useStore } from '../../../../src/store/store.ts'
import { TYPE_DEFAULTS } from '../../../../src/store/typeDefaults.ts'
import { resolveRefsPerPool } from '../../../../src/engine/pools.ts'
import { TournamentType } from '../../../../src/engine/types.ts'
import { CATALOGUE } from '../../../../src/engine/catalogue.ts'

const COMP_ID = CATALOGUE[0].id

// 013 T018 (FR-016–FR-018, research.md D8/D9) — re-targets the two retired
// rail-section test files this task deletes. The strips-and-video steppers,
// the reveal-delayed searching indicator and the video-default plumbing
// carry over; the "Suggest" button is gone in favour of a search that runs
// on open and on a 300ms debounce, answering into a card the organizer
// applies by hand (D8) rather than writing the strip field itself.

const SEARCH_DEBOUNCE_MS = 300

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

/** Installs a controllable `computeSuggestedStrips` on the store. Each call
 *  gets its own resolver so overlapping searches (the stale-token case) can
 *  be resolved out of order. */
function stubSuggestStrips(): {
  resolvers: Array<(value: number | null) => void>
  rejecters: Array<(reason: unknown) => void>
  fn: ReturnType<typeof vi.fn>
} {
  const resolvers: Array<(value: number | null) => void> = []
  const rejecters: Array<(reason: unknown) => void> = []
  const fn = vi.fn(() => {
    return new Promise<number | null>((resolve, reject) => {
      resolvers.push(resolve)
      rejecters.push(reject)
    })
  })
  useStore.setState({ computeSuggestedStrips: fn })
  return { resolvers, rejecters, fn }
}

describe('StripsPanel — steppers', () => {
  it('renders the strips and video-strips spinbuttons, editing strips writes strips_total', async () => {
    stubSuggestStrips()
    useStore.getState().setStrips(20)
    render(<StripsPanel />)

    const strips = screen.getByRole('spinbutton', { name: 'Number of strips' })
    expect(strips).toHaveValue(20)

    fireEvent.click(screen.getByRole('button', { name: 'Increase Number of strips' }))
    expect(useStore.getState().strips_total).toBe(21)

    await act(async () => {
      await Promise.resolve()
    })
  })

  it('shows the video-strips field at the type-resolved count with the Default marker while unset', async () => {
    stubSuggestStrips()
    render(<StripsPanel />)

    const video = screen.getByRole('spinbutton', { name: 'Number of video strips' })
    expect(video).toHaveValue(TYPE_DEFAULTS[TournamentType.NAC].video_strips_total)
    expect(screen.getByText('Default')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Revert video strips to default' }),
    ).not.toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
    })
  })

  it('an explicit video-strips count drops the Default marker and offers a revert back to null (FR-036/037/038)', async () => {
    stubSuggestStrips()
    render(<StripsPanel />)

    act(() => {
      useStore.getState().setVideoStrips(3)
    })

    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toHaveValue(3)
    expect(screen.queryByText('Default')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Revert video strips to default' }))

    expect(useStore.getState().video_strips_total).toBeNull()
    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toHaveValue(
      TYPE_DEFAULTS[TournamentType.NAC].video_strips_total,
    )
    expect(screen.getByText('Default')).toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
    })
  })

  it('re-resolves the video-strips field at the new type\'s default (0 for ROC) while unset', async () => {
    stubSuggestStrips()
    render(<StripsPanel />)

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })

    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toHaveValue(0)

    await act(async () => {
      await Promise.resolve()
    })
  })

  it('an explicit video-strips count survives a type change', async () => {
    stubSuggestStrips()
    render(<StripsPanel />)

    act(() => {
      useStore.getState().setVideoStrips(3)
    })
    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })

    expect(screen.getByRole('spinbutton', { name: 'Number of video strips' })).toHaveValue(3)

    await act(async () => {
      await Promise.resolve()
    })
  })
})

describe('StripsPanel — suggested minimum', () => {
  it('runs the search once on mount, holds the count as text, and leaves strips_total unchanged until Apply', async () => {
    const { resolvers, fn } = stubSuggestStrips()
    useStore.getState().setStrips(5)
    render(<StripsPanel />)

    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolvers[0](18)
    })

    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('18')
    expect(useStore.getState().strips_total).toBe(5)

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(useStore.getState().strips_total).toBe(18)
  })

  it('disables Apply and shows an em-dash while no answer has resolved', async () => {
    stubSuggestStrips()
    render(<StripsPanel />)

    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('never claims a finish time — the sentence names strips to place every event', async () => {
    const { resolvers } = stubSuggestStrips()
    render(<StripsPanel />)

    await act(async () => {
      resolvers[0](18)
    })

    const section = screen.getByRole('region', { name: 'Suggested minimum' })
    expect(section).toHaveTextContent('strips to place every event')
    expect(section.textContent).not.toMatch(/finish/i)
  })

  it('a rejected search leaves the em-dash and disabled Apply, with no unhandled rejection', async () => {
    const { rejecters } = stubSuggestStrips()
    let unhandled: unknown = null
    const onUnhandledRejection = (reason: unknown) => {
      unhandled = reason
    }
    process.on('unhandledRejection', onUnhandledRejection)

    render(<StripsPanel />)

    await act(async () => {
      rejecters[0](new Error('search failed'))
      // Let the rejection's microtask settle (and any unhandled-rejection
      // check Node schedules after it) before asserting.
      await Promise.resolve()
      await Promise.resolve()
    })

    process.off('unhandledRejection', onUnhandledRejection)

    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(unhandled).toBeNull()
  })
})

describe('StripsPanel — debounced re-search', () => {
  it('re-runs the search 300ms after the strip count changes, not sooner', async () => {
    const { resolvers, fn } = stubSuggestStrips()
    render(<StripsPanel />)
    expect(fn).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolvers[0](null)
    })

    act(() => {
      useStore.getState().setStrips(9)
    })
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    })
    expect(fn).toHaveBeenCalledTimes(1)

    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('clears the previous answer the moment an input changes, so a stale number can never be applied', async () => {
    const { resolvers, fn } = stubSuggestStrips()
    render(<StripsPanel />)

    await act(async () => {
      resolvers[0](18)
    })
    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('18')
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled()

    act(() => {
      useStore.getState().setStrips(9)
    })
    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(fn).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolvers[1](21)
    })
    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('21')
    expect(screen.getByRole('button', { name: 'Apply' })).not.toBeDisabled()
  })

  it('coalesces two changes inside the debounce window into one more search', async () => {
    const { resolvers, fn } = stubSuggestStrips()
    render(<StripsPanel />)
    await act(async () => {
      resolvers[0](null)
    })

    act(() => {
      useStore.getState().setStrips(9)
    })
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 50)
    })
    expect(fn).toHaveBeenCalledTimes(1)

    act(() => {
      useStore.getState().setVideoStrips(4)
    })

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['days', () => useStore.getState().setDays(4)],
    ['a day\'s hours', () => useStore.getState().updateDayConfig(0, { day_start_time: 420 })],
    ['type', () => useStore.getState().setTournamentType(TournamentType.ROC)],
    ['a pool duration', () => useStore.getState().setPoolRoundDuration('EPEE', 7)],
  ])('re-searches 300ms after %s changes', async (_label, mutate) => {
    const { resolvers, fn } = stubSuggestStrips()
    useStore.getState().setDays(3)
    render(<StripsPanel />)
    await act(async () => {
      resolvers[0](null)
    })

    act(() => {
      mutate()
    })

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('re-searches 300ms after a fencer count changes', async () => {
    useStore.getState().addCompetition(COMP_ID)
    const { resolvers, fn } = stubSuggestStrips()
    render(<StripsPanel />)
    await act(async () => {
      resolvers[0](null)
    })

    act(() => {
      useStore.getState().updateCompetition(COMP_ID, { fencer_count: 40 })
    })

    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })

    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('StripsPanel — stale search tokens', () => {
  it('discards a slow first search resolved after a faster second one', async () => {
    const { resolvers, fn } = stubSuggestStrips()
    render(<StripsPanel />)
    expect(fn).toHaveBeenCalledTimes(1) // the mount search — call index 0

    act(() => {
      useStore.getState().setStrips(9)
    })
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    })
    expect(fn).toHaveBeenCalledTimes(2) // the debounced search — call index 1

    // The second (fresher) search resolves first, with 12.
    await act(async () => {
      resolvers[1](12)
    })
    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('12')

    // The stale first search now resolves, with 7 — must not overwrite 12.
    await act(async () => {
      resolvers[0](7)
    })
    expect(document.querySelector('[data-suggested-strips]')?.textContent).toBe('12')
  })
})

describe('StripsPanel — searching indicator', () => {
  it('a search that outlasts the reveal delay shows an indicator naming the search, then clears it', async () => {
    const { resolvers } = stubSuggestStrips()
    render(<StripsPanel />)

    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS)
    })

    const indicator = screen.getByRole('status')
    expect(indicator.textContent).toBe('Searching for the smallest strip count that places every event…')

    await act(async () => {
      resolvers[0](null)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('a search shorter than the reveal delay never shows the indicator', async () => {
    const { resolvers } = stubSuggestStrips()
    render(<StripsPanel />)

    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS - 1)
    })
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      resolvers[0](null)
    })
    expect(screen.queryByRole('status')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('cancels the reveal timer on unmount so a still-pending search never renders', async () => {
    const { resolvers } = stubSuggestStrips()
    const { unmount } = render(<StripsPanel />)

    unmount()

    expect(vi.getTimerCount()).toBe(0)

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(SUGGEST_INDICATOR_DELAY_MS + 1)
      })
    }).not.toThrow()
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      resolvers[0](null)
    })
  })
})

describe('StripsPanel — referees per pool', () => {
  it('reads the same factor the engine applies, and re-reads after a type change', async () => {
    const { resolvers } = stubSuggestStrips()
    render(<StripsPanel />)
    await act(async () => {
      resolvers[0](null)
    })

    expect(document.querySelector('[data-refs-per-pool]')?.textContent).toBe(
      String(resolveRefsPerPool(TYPE_DEFAULTS[TournamentType.NAC].ref_policy, 1).refs_per_pool),
    )

    act(() => {
      useStore.getState().setTournamentType(TournamentType.ROC)
    })
    await act(async () => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
      const pending = resolvers[resolvers.length - 1]
      if (pending) pending(null)
    })

    expect(document.querySelector('[data-refs-per-pool]')?.textContent).toBe(
      String(resolveRefsPerPool(TYPE_DEFAULTS[TournamentType.ROC].ref_policy, 1).refs_per_pool),
    )
  })
})

describe('StripsPanel — retired controls', () => {
  it('offers no Suggest button, no referees-available input, and no cut-mode control', async () => {
    const { resolvers } = stubSuggestStrips()
    render(<StripsPanel />)
    await act(async () => {
      resolvers[0](null)
    })

    expect(screen.queryByRole('button', { name: /suggest/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /referees available/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /cut/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton', { name: /cut/i })).not.toBeInTheDocument()
  })
})
