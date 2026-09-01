import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../../store/store.ts'
import type { DayConfig } from '../../engine/types.ts'
import {
  selectDerivedFindings,
  selectDerivedSchedule,
  selectScorecardMetrics,
  type DerivedFindings,
  type DerivedSchedule,
} from '../../store/derived.ts'
import { ScheduleOutput } from '../sections/ScheduleOutput.tsx'
import { MatrixCanvas } from '../canvas/MatrixCanvas.tsx'
import { ViewMode, loadViewState, saveViewState } from '../../store/viewState.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AlertCircle } from 'lucide-react'

/** How long an edit must settle before the center relayouts (FR-008). */
export const CENTER_SETTLE_MS = 150

/** The derived model the center is currently drawing, whichever view is up. */
interface CommittedModel {
  schedule: DerivedSchedule
  findings: DerivedFindings
  /**
   * The store's clock-time day hours (contracts/day-axis.md C4), committed in
   * the same settle as `schedule`/`findings` so the matrix's axis and "Fit to
   * day" never run ahead of the blocks they bound (RCR-T009 finding 1).
   */
  dayConfigs: DayConfig[]
}

/**
 * The center region: the committed schedule, in one of two views, plus the
 * dimmed-invalid overlay.
 *
 * ## One model, two views (FR-023)
 *
 * The matrix and the schedule table are handed the *same* committed
 * `DerivedSchedule`, so they cannot disagree about when an event runs — the
 * contract `contracts/ui-contract.md` §View equivalence states and
 * `viewEquivalence.test.tsx` holds. Neither view is given a live store
 * subscription of its own here: that would put one of them ahead of the other
 * by a settle, and ahead of the dimmed-invalid rule entirely. The findings
 * travel with the schedule for the same reason — a block's tooltip must
 * describe the tournament state its geometry came from, not a later one.
 *
 * Which view is showing is a viewer preference, so it persists through
 * `viewState.ts` to `localStorage` and never to the URL (research D10). The
 * matrix is the default (FR-023); US1 shipped with the table because the canvas
 * did not exist yet (research D11).
 *
 * The committed model also carries the store's `dayConfigs` (contracts/
 * day-axis.md C4) alongside `schedule`/`findings`, for the same reason: the
 * matrix's day axis is drawn from it, and committing it separately from the
 * schedule would let the axis settle a render ahead of the blocks it bounds
 * (RCR-T009 finding 1).
 *
 * ## Two rules run here at once
 *
 * (S2-contract.md §Center view and the dimmed-invalid rule), and they compose:
 *
 * 1. Two-tier recompute (FR-008). Findings and metrics follow the store per
 *    keystroke — the drawer reads it directly and is not debounced — while the
 *    center renders a *committed* copy that a `CENTER_SETTLE_MS` timer
 *    replaces once an edit stops arriving. A debounce, deliberately, and not
 *    `useDeferredValue`: React flushes a deferred value inside `act()`, which
 *    would make the test proving the center did *not* relayout vacuous.
 * 2. Dimmed invalid (FR-009). While any derived finding is ERROR the commit is
 *    suppressed outright, so the center goes on showing whatever it last
 *    committed — the last valid layout once an edit has broken a config that
 *    was valid, or the invalid derivation itself on a cold boot into an
 *    already-invalid config (e.g. a shared URL), since there is no valid
 *    layout yet to fall back to. Dimmed, never blanked, either way, under any
 *    sequence of edits. The dim itself tracks the *live* findings, so it
 *    lands on the keystroke that broke the config rather than a settle later.
 *
 * Both rules apply to whichever view is up: the toggle chooses how the
 * committed model is drawn, never which model is drawn.
 *
 * ## The one thing that crosses the settle without waiting for it
 *
 * The scorecard's hover highlight (FR-029). The scorecard is drawer-side and
 * follows the live store per keystroke; the canvas draws the committed model.
 * A highlight routed through `committed` would leave the pointer resting on a
 * metric row with nothing lit for `CENTER_SETTLE_MS`, which is not a hover cue.
 * So the block-key set is resolved live here and handed to the canvas
 * undebounced (S6 design §2). The canvas matches the keys against the blocks it
 * has actually committed, and a `${competitionId}:${phase}` key names the same
 * block wherever it currently sits — so mid-settle the worst case is *fewer*
 * blocks lit, never a wrong one. Rule 2 is untouched by this: an invalid config
 * still commits nothing and the highlight lands on the last valid layout.
 */
export function CenterView() {
  const live = useStore(selectDerivedSchedule)
  const liveFindings = useStore(selectDerivedFindings)
  const liveDayConfigs = useStore((s) => s.dayConfigs)

  const blocking = liveFindings.validationErrors.filter((e) => e.severity === 'ERROR')
  const hasBlocking = blocking.length > 0

  const [committed, setCommitted] = useState<CommittedModel>(() => ({
    schedule: live,
    findings: liveFindings,
    dayConfigs: liveDayConfigs,
  }))
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewState().viewMode)

  // FR-029. The scorecard names the blocks; this only resolves the hovered id
  // against them and hands the result on. Memoized so a keystroke that leaves
  // both inputs alone cannot reconcile every block on the canvas with a fresh
  // Set — and returning the same `undefined` while nothing is hovered, which is
  // the case the canvas is in almost all of the time.
  const hoveredMetricId = useStore((s) => s.hoveredMetricId)
  const metrics = useStore(selectScorecardMetrics)
  const highlight = useMemo<ReadonlySet<string> | undefined>(() => {
    if (hoveredMetricId === null) return undefined
    const hovered = metrics.find((metric) => metric.id === hoveredMetricId)
    return hovered && new Set(hovered.blockKeys)
  }, [hoveredMetricId, metrics])

  useEffect(() => {
    // An invalid config commits nothing at all — rule 2 above. The last valid
    // layout stays on screen until the config is valid again and settles.
    if (hasBlocking) return

    const timer = setTimeout(
      () => setCommitted({ schedule: live, findings: liveFindings, dayConfigs: liveDayConfigs }),
      CENTER_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [live, liveFindings, liveDayConfigs, hasBlocking])

  /** One discrete choice, so it stores at once — as the canvas's own buttons
   *  do. Merged into the stored state rather than written over it, so the
   *  window and row height this component does not own survive. */
  function chooseView(next: ViewMode): void {
    setViewMode(next)
    saveViewState({ ...loadViewState(), viewMode: next })
  }

  const showingMatrix = viewMode === ViewMode.MATRIX

  return (
    <main aria-label="Center view" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1">
        <ToggleGroup
          type="single"
          // Radix's Root is role="group"; the two items are already role="radio"
          // in single mode, so the group they belong to is a radiogroup. The
          // name differs from the <main> landmark's own "Center view" — one
          // accessible name shared by two things makes both ambiguous.
          role="radiogroup"
          aria-label="Center view mode"
          variant="outline"
          size="sm"
          value={viewMode}
          // Radix reports '' when the pressed item is the selected one. There
          // is no "no view" state to fall into, so that clears nothing.
          onValueChange={(next) => next && chooseView(next as ViewMode)}
        >
          <ToggleGroupItem value={ViewMode.MATRIX}>Matrix</ToggleGroupItem>
          <ToggleGroupItem value={ViewMode.SCHEDULE}>Schedule</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* The view fills this region absolutely rather than sizing to its
          content: the canvas measures its own viewport through a
          ResizeObserver and needs a height that does not depend on what it
          draws, while the table keeps its own scroll inside the same box. */}
      <div className="relative min-h-0 flex-1">
        <div
          data-dimmed={hasBlocking ? 'true' : 'false'}
          className={`absolute inset-0 ${showingMatrix ? 'flex flex-col' : 'overflow-auto p-4'} ${
            hasBlocking ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          {showingMatrix ? (
            <MatrixCanvas
              schedule={committed.schedule}
              findings={committed.findings}
              dayConfigs={committed.dayConfigs}
              // Live, deliberately — the one prop here that is not committed.
              highlight={highlight}
            />
          ) : (
            <ScheduleOutput schedule={committed.schedule} />
          )}
        </div>

        {hasBlocking && (
          <section
            aria-label="Blocking findings"
            aria-live="assertive"
            aria-atomic="true"
            className="absolute inset-x-4 top-4 rounded-md border border-red-200 bg-error p-4 text-error-text shadow-lg"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <AlertCircle className="h-4 w-4" />
              Configuration is invalid
            </h2>
            <ul className="mt-2 space-y-1 text-sm">
              {blocking.map((e, i) => (
                <li key={`${e.field}-${i}`}>
                  {e.field}: {e.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  )
}
