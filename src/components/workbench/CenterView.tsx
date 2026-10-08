import { useEffect, useState } from 'react'
import { useStore } from '../../store/store.ts'
import type { DayConfig, Placement } from '../../engine/types.ts'
import {
  selectDerivedFindings,
  selectDrawnSchedule,
  selectFindings,
  RunState,
  type DerivedFindings,
  type DrawnSchedule,
  type Finding,
} from '../../store/derived.ts'
import { ScheduleOutput } from '../sections/ScheduleOutput.tsx'
import { Canvas } from '../canvas/Canvas.tsx'
import { DetailStrip } from './DetailStrip.tsx'
import { ViewMode } from '../../store/viewState.ts'
import type { ZoomState } from '../canvas/zoomLadder.ts'
import { AlertCircle, X } from 'lucide-react'
import { DEFAULT_PRESET_ID } from '../../data/tournaments.ts'

/** How long an edit must settle before the center relayouts (FR-008). */
export const CENTER_SETTLE_MS = 150

/**
 * The ids of the pinned placements. Pure and called from the state initializer
 * and the settle timer, so the set is built from the same render's placements
 * as the schedule it commits with and no memo identity is relied upon.
 */
function pinnedIdsOf(placements: Record<string, Placement>): ReadonlySet<string> {
  return new Set(
    Object.entries(placements)
      .filter(([, placement]) => placement.pinned)
      .map(([id]) => id),
  )
}

/**
 * The model the center is currently drawing, whichever view is up. `schedule`
 * is the drawn model (`selectDrawnSchedule`, 017 spec §2): right after a run it
 * carries the run's own times and strips, so the canvas, its day bands, the
 * schedule table and the detail strip all describe the schedule the engine
 * built, and they settle and freeze together.
 */
interface CommittedModel {
  schedule: DrawnSchedule
  findings: DerivedFindings
  /**
   * The unified findings list (`selectFindings`, contract §1), committed
   * alongside `schedule`/`findings`/`dayConfigs` (013 T032, contract §4.1,
   * FR-042, finding 11) so the day bands and the gutter flags the matrix
   * draws from it can never run a settle ahead of the blocks they describe.
   */
  findingRows: Finding[]
  /**
   * The store's clock-time day hours (specs/006-day-axis-parity/contracts/day-axis.md C4 (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/contracts/day-axis.md)), committed in
   * the same settle as `schedule`/`findings` so the matrix's axis and "Fit to
   * day" never run ahead of the blocks they bound (RCR-T009 finding 1).
   */
  dayConfigs: DayConfig[]
  /**
   * The ids of the competitions pinned when this model committed (FR-042,
   * finding 25, 013 T046), so the pin badge on a block can never describe a
   * schedule the grid is not drawing – a pin lands on the next settle with the
   * blocks, or once a blocking ERROR clears and the next settle passes.
   */
  pinnedIds: ReadonlySet<string>
}

/**
 * The center region: the committed schedule, in one of two views, plus the
 * dimmed-invalid overlay.
 *
 * ## One model, two views (FR-023)
 *
 * The matrix and the schedule table are handed the *same* committed
 * `DrawnSchedule`, so they cannot disagree about when an event runs — the
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
 * did not exist yet (research D11). Since 013 T011a the center no longer owns
 * that choice — `WorkbenchShell` does, the same way it owns `panel` — and
 * hands it down as the `viewMode` prop; the toggle that changes it moved to
 * `StatusFooter`.
 *
 * The committed model also carries the store's `dayConfigs` (specs/006-day-axis-parity/contracts/day-axis.md C4 (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/contracts/day-axis.md)) alongside `schedule`/`findings`, for the same reason: the
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
 * ## What used to cross the settle without waiting for it
 *
 * The retired scorecard's hover highlight (FR-029) did, undebounced, so a
 * hover cue would not arrive a settle late. 013 T011a deletes it along with
 * the scorecard it lived on (research D7), and T013 removed the `highlight`
 * prop the canvas and its blocks drew it through.
 *
 * ## Zoom is not part of the committed model
 *
 * `zoom` is a viewer preference `WorkbenchShell` owns, the same way `viewMode`
 * is, and it passes straight through: changing the rung changes how the
 * committed schedule is drawn, never which schedule is drawn, so it is not
 * debounced and nothing about the settle applies to it.
 */
export function CenterView({
  viewMode,
  zoom,
  detailCollapsed,
  onToggleDetailCollapsed,
}: {
  viewMode: ViewMode
  zoom: ZoomState
  detailCollapsed: boolean
  onToggleDetailCollapsed: () => void
}) {
  const live = useStore(selectDrawnSchedule)
  const liveFindings = useStore(selectDerivedFindings)
  const liveFindingRows = useStore(selectFindings)
  const liveDayConfigs = useStore((s) => s.dayConfigs)
  const livePlacements = useStore((s) => s.placements)
  const loadRefusal = useStore((s) => s.loadRefusal)
  const setLoadRefusal = useStore((s) => s.setLoadRefusal)

  const refused = loadRefusal !== null

  const blocking = liveFindings.validationErrors.filter((e) => e.severity === 'ERROR')
  const hasBlocking = blocking.length > 0

  const [committed, setCommitted] = useState<CommittedModel>(() => ({
    schedule: live,
    findings: liveFindings,
    findingRows: liveFindingRows,
    dayConfigs: liveDayConfigs,
    pinnedIds: pinnedIdsOf(livePlacements),
  }))

  useEffect(() => {
    // An invalid config commits nothing at all — rule 2 above. The last valid
    // layout stays on screen until the config is valid again and settles.
    if (hasBlocking) return

    const timer = setTimeout(
      () =>
        setCommitted({
          schedule: live,
          findings: liveFindings,
          findingRows: liveFindingRows,
          dayConfigs: liveDayConfigs,
          pinnedIds: pinnedIdsOf(livePlacements),
        }),
      CENTER_SETTLE_MS,
    )
    return () => clearTimeout(timer)
  }, [live, liveFindings, liveFindingRows, liveDayConfigs, livePlacements, hasBlocking])

  const showingMatrix = viewMode === ViewMode.MATRIX

  return (
    <main aria-label="Center view" className="print-unclip flex min-h-0 flex-1 flex-col">
      {/* The stale notice (017 spec §6, P4) reads the *committed* model's run
          state, so it lands with the board it describes and a Blocking
          finding that freezes the model freezes it too. The live region stays
          mounted so its text arrives inside a region that already exists –
          screen readers often miss a region that appears with its text. */}
      <div role="status" className="contents">
        {committed.schedule.runState === RunState.STALE && (
          <div
            data-stale-banner
            className="flex flex-none items-center gap-2 border-b-[1.5px] border-finding-border bg-finding-bg px-4 py-2 text-[12.5px] font-semibold text-finding-link"
          >
            <AlertCircle aria-hidden="true" className="h-4 w-4 flex-none" />
            Stale – re-run Auto-assign
          </div>
        )}
      </div>
      {/* Why the link this page opened on was refused (018 R7). It reads the
          live store, not the committed model: it describes the load, not the
          schedule, so it has no settle to wait for. Its own live region, kept
          mounted for the same reason as the stale notice's, and beside it
          rather than inside it so either can come and go on its own. */}
      <div
        data-load-refusal={refused ? '' : undefined}
        className={
          refused
            ? 'print-hidden flex flex-none items-start gap-2 border-b-[1.5px] border-finding-border bg-finding-bg px-4 py-2 text-[12.5px] font-semibold text-finding-link'
            : 'contents'
        }
      >
        {refused && <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-none" />}
        {/* Only the message sits in the live region – a button inside one is
            read out with it, and Dismiss is not part of the news. */}
        <div role="status" className={refused ? 'min-w-0 flex-1' : 'contents'}>
          {refused && (
            <span>
              This link couldn't be opened – {loadRefusal}. Showing {DEFAULT_PRESET_ID} instead.
            </span>
          )}
        </div>
        {refused && (
          <button
            type="button"
            aria-label="Dismiss notice"
            onClick={() => setLoadRefusal(null)}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md hover:bg-neutral-200"
          >
            <X aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {/* The view fills this region absolutely rather than sizing to its
          content: the canvas measures its own viewport through a
          ResizeObserver and needs a height that does not depend on what it
          draws, while the table keeps its own scroll inside the same box. */}
      <div className="print-unclip relative min-h-0 flex-1">
        <div
          data-dimmed={hasBlocking ? 'true' : 'false'}
          // The frozen board is inert, not just unclickable: its blocks are
          // buttons, and pointer-events-none leaves them in the tab order and
          // the accessibility tree.
          inert={hasBlocking}
          className={`print-unclip absolute inset-0 ${showingMatrix ? 'flex flex-col' : 'overflow-auto p-4'} ${
            hasBlocking ? 'opacity-40 pointer-events-none' : ''
          }`}
        >
          {showingMatrix ? (
            <Canvas
              schedule={committed.schedule}
              findings={committed.findings}
              findingRows={committed.findingRows}
              dayConfigs={committed.dayConfigs}
              zoom={zoom}
              pinnedIds={committed.pinnedIds}
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
            className="absolute inset-x-4 top-4 rounded-[12px] border-[1.5px] border-finding-border bg-finding-bg p-4 text-finding-link shadow-lg"
          >
            <h2 className="flex items-center gap-2 text-[11.5px] font-semibold tracking-[.06em] uppercase">
              <AlertCircle className="h-4 w-4" />
              Configuration is invalid
            </h2>
            <ul className="mt-2 space-y-1 text-[12.5px] leading-[1.5]">
              {blocking.map((e, i) => (
                <li key={`${e.field}-${i}`}>
                  {e.field}: {e.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <DetailStrip
        schedule={committed.schedule}
        detailCollapsed={detailCollapsed}
        onToggleDetailCollapsed={onToggleDetailCollapsed}
      />
    </main>
  )
}
