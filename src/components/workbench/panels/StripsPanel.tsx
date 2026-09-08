import { useEffect, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useStore } from '../../../store/store.ts'
import { TYPE_DEFAULTS, resolveVideoStrips } from '../../../store/typeDefaults.ts'
import { resolveRefsPerPool } from '../../../engine/pools.ts'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/ui/number-input'
import { DefaultLabel } from '../../common/DefaultLabel.tsx'

// 012 T013 (research.md D5, FR-008), carried over from the retired strips
// section: the search yields to the browser between candidates, so a real
// run takes 199-229ms on the largest template and well under 100ms on every
// other one (baseline.md §5). 100ms is the point at which the indicator is
// visible on the largest board for roughly a hundred milliseconds and never
// appears on a board that finishes in an instant (SC-007's second clause).
export const SUGGEST_INDICATOR_DELAY_MS = 100

// research.md D8: 012 measured 13-230ms per template. 300ms keeps a held
// stepper from queueing a run per tick.
const SEARCH_DEBOUNCE_MS = 300

/** Section caption above each Strips panel field group (standing rule 13,
 *  same convention as TournamentPanel's own local copy). */
function SectionCaption({ children }: { children: string }) {
  return (
    <div className="mb-[7px] text-[11.5px] font-semibold tracking-[.06em] text-neutral-600 uppercase">
      {children}
    </div>
  )
}

/** A strips-style stepper: NumberInput restyled through descendant arbitrary
 *  variants (the pattern `button.tsx`/`select.tsx`/`table.tsx` already use)
 *  rather than a second wrapping element — cheaper than forking NumberInput
 *  for one caller. */
function Stepper({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  ariaLabel: string
}) {
  return (
    <NumberInput
      value={value}
      onChange={onChange}
      min={min}
      max={max}
      aria-label={ariaLabel}
      className="w-full justify-between gap-0 rounded-[10px] border-[1.5px] border-chrome-border bg-white p-0 [&_button]:h-[34px] [&_button]:w-[30px] [&_button]:shrink-0 [&_button]:rounded-none [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-neutral-700 [&_input]:h-[34px] [&_input]:flex-1 [&_input]:rounded-none [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-center [&_input]:font-mono [&_input]:text-[13.5px] [&_input]:font-semibold"
    />
  )
}

/**
 * The Strips & referees inspector panel (013 T018, ui-contract.md §Strips &
 * referees, FR-016–FR-018, research D8/D9). Replaces the two retired rail
 * sections it inlines (both deleted in this task) — the strips and
 * video-strips steppers, the suggested-minimum search, and the
 * referees-per-pool figure the tournament type implies.
 *
 * D8: `computeSuggestedStrips` only answers — it never writes `strips_total`.
 * The search runs when the panel opens and again, debounced 300ms, when any
 * of strips, video strips, days, a day's hours, type, a fencer count or a
 * pool duration changes. Each run carries a token (`searchToken`); a result
 * whose token has since been superseded is discarded, so a fast second search
 * can never be overwritten by a slow first one landing after it. **Apply**
 * is the only path that writes the suggestion into `strips_total`.
 *
 * D9: referees per pool is read straight from `resolveRefsPerPool` — the same
 * factor the scheduler and `derive.ts` apply — never re-derived here.
 */
export function StripsPanel() {
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const tournamentType = useStore((s) => s.tournament_type)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)
  const computeSuggestedStrips = useStore((s) => s.computeSuggestedStrips)
  const daysAvailable = useStore((s) => s.days_available)
  // Serialized rather than watched by reference — `dayConfigs`,
  // `selectedCompetitions` and `pool_round_duration_table` are all replaced
  // wholesale on every store write (immutable updates), so a reference
  // dependency would re-fire the search on any edit to *any* competition
  // field, not only the ones D8 names.
  const dayHoursKey = useStore((s) =>
    s.dayConfigs.map((d) => `${d.day_start_time}-${d.day_end_time}`).join(','),
  )
  const fencerCountsKey = useStore((s) =>
    Object.entries(s.selectedCompetitions)
      .map(([id, c]) => `${id}:${c.fencer_count}`)
      .sort()
      .join(','),
  )
  const poolDurationsKey = useStore((s) => JSON.stringify(s.pool_round_duration_table))

  const [suggested, setSuggested] = useState<number | null>(null)
  const [showIndicator, setShowIndicator] = useState(false)

  const searchToken = useRef(0)
  const activeRevealTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRun = useRef(true)

  async function runSearch(): Promise<void> {
    const token = ++searchToken.current
    const revealTimer = setTimeout(() => {
      if (token === searchToken.current) setShowIndicator(true)
    }, SUGGEST_INDICATOR_DELAY_MS)
    activeRevealTimers.current.add(revealTimer)
    try {
      const result = await computeSuggestedStrips()
      // A stale token means a fresher search has started since this one did
      // — its answer is superseded and must not overwrite what the fresher
      // search already returned (D8).
      if (token === searchToken.current) setSuggested(result)
    } finally {
      clearTimeout(revealTimer)
      activeRevealTimers.current.delete(revealTimer)
      if (token === searchToken.current) setShowIndicator(false)
    }
  }

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false
      void runSearch()
      return
    }
    const timer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS)
    debounceTimer.current = timer
    // Cleanup runs before the next dependency change (or on unmount) and
    // clears this timer, so two edits inside the debounce window coalesce
    // into the one search the later edit schedules.
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stripsTotal, videoStripsTotal, daysAvailable, dayHoursKey, tournamentType, fencerCountsKey, poolDurationsKey])

  // Every timer this component ever starts is cleared on unmount
  // (constitution IV) — including a reveal timer whose search is still
  // in flight, so a resolve after unmount cannot call setState.
  useEffect(() => {
    // Captured once per mount: the cleanup below runs after unmount, by
    // which point a fresh mount could already have replaced the ref's
    // contents — this closes over the same Set the running searches add to.
    const revealTimers = activeRevealTimers.current
    return () => {
      for (const timer of revealTimers) clearTimeout(timer)
      revealTimers.clear()
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
    }
  }, [])

  const resolvedVideoStrips = resolveVideoStrips(videoStripsTotal, tournamentType)
  const videoFollowsTypeDefault = videoStripsTotal === null
  const refsPerPool = resolveRefsPerPool(TYPE_DEFAULTS[tournamentType].ref_policy, 1).refs_per_pool

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <SectionCaption>Strips</SectionCaption>
          <Stepper value={stripsTotal} onChange={setStrips} min={0} ariaLabel="Number of strips" />
        </div>
        <div>
          <SectionCaption>With video</SectionCaption>
          <Stepper
            // `NumberInput` has no unset state, so an unresolved `null` shows
            // as the count the type resolves to and the first edit commits
            // it as the organizer's own (FR-036/037) — the same resolution
            // `buildConfig.ts` schedules against, so this field never states
            // a count the engine does not use.
            value={resolvedVideoStrips}
            onChange={setVideoStrips}
            min={0}
            max={stripsTotal}
            ariaLabel="Number of video strips"
          />
          <div className="mt-[5px] flex items-center gap-1">
            <DefaultLabel isDefault={videoFollowsTypeDefault} />
            {!videoFollowsTypeDefault && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1"
                onClick={() => setVideoStrips(null)}
                aria-label="Revert video strips to default"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <section
        aria-label="Suggested minimum"
        className="rounded-xl border-[1.5px] border-chrome-border bg-white p-[13px]"
      >
        <div className="flex items-center justify-between gap-2">
          <SectionCaption>Suggested minimum</SectionCaption>
          {showIndicator && (
            <span role="status" className="text-right text-[11px] text-neutral-500">
              Searching for the smallest strip count that places every event…
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-[9px]">
          <span data-suggested-strips className="text-[32px] leading-none text-foreground">
            {suggested === null ? '—' : suggested}
          </span>
          <span className="text-[12.5px] text-neutral-700">strips to place every event</span>
        </div>
        <button
          type="button"
          disabled={suggested === null}
          onClick={() => {
            if (suggested !== null) setStrips(suggested)
          }}
          className="mt-[10px] rounded-[9px] bg-primary px-[15px] py-[7px] text-[12.5px] font-semibold tracking-[.04em] text-primary-foreground uppercase hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          Apply
        </button>
      </section>

      <div>
        <SectionCaption>Referees per pool</SectionCaption>
        <div className="flex items-center gap-[9px] text-[12.5px] text-neutral-700">
          <span
            data-refs-per-pool
            className="rounded-[9px] border-[1.5px] border-chrome-border bg-white px-3 py-[5px] font-mono font-semibold text-foreground"
          >
            {refsPerPool}
          </span>
          default for all events
        </div>
      </div>
    </div>
  )
}
