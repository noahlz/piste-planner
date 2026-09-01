import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { selectScorecardMetrics, type ScorecardMetric, type ScorecardBaseline } from '../../store/derived.ts'
import { loadViewState, saveViewState } from '../../store/viewState.ts'
import { formatMinutes } from '../../lib/time.ts'
import { Button } from '@/components/ui/button'

/**
 * The metric list's id, so the disclosure button can name what it controls.
 * A constant rather than `useId`: the scorecard is mounted once, and a stable
 * id is what lets a test or the smoke driver assert the pairing.
 */
const METRIC_LIST_ID = 'scorecard-metrics'

/**
 * Renders one metric's value in its own units. `null` is a metric with no
 * value at all (nothing placed, no usable days) and reads as an em dash,
 * matching formatMinutes' own convention for the same case.
 */
function formatValue(kind: ScorecardMetric['kind'], value: number | null): string {
  if (value === null) return '—'
  switch (kind) {
    case 'time':
      return formatMinutes(value)
    case 'count':
      return String(Math.round(value))
    case 'percent':
      return `${value.toFixed(1)}%`
  }
}

/**
 * The delta against the frozen baseline, or `null` for *no delta at all*.
 *
 * A zero delta and an absent delta are different states (research D9): a
 * loaded preset shows `0` on a metric that has not moved, while a tournament
 * reached without a preset shows no delta element whatsoever. Returning 0 for
 * the second case would claim a comparison that was never captured.
 */
function computeDelta(metric: ScorecardMetric, baseline: ScorecardBaseline | null): number | null {
  if (baseline === null) return null
  if (!(metric.id in baseline)) return null
  const base = baseline[metric.id]
  if (base === null || metric.value === null) return null
  return metric.value - base
}

/**
 * Signed magnitude, formatted by the metric's own kind so a delta reads in the
 * same units as the value above it. A time delta goes through formatMinutes on
 * its absolute value — formatMinutes floors, so handing it a negative would
 * render `-2:-15` for −75 minutes; the sign is carried by the prefix instead.
 *
 * The sign is decided from the **rendered magnitude**, never from the raw
 * delta. `strips:utilization` and `days:balance-spread` are continuous and show
 * one decimal, so a small edit moves them by 0.03 points and a sign taken from
 * the raw number would render `+0.0%` — a direction the reader cannot see, and
 * a contradiction of research D9's "a zero delta renders as such".
 */
function formatDelta(kind: ScorecardMetric['kind'], delta: number): string {
  const magnitude = formatValue(kind, Math.abs(delta))
  const sign = magnitude === formatValue(kind, 0) ? '' : delta > 0 ? '+' : '−'
  return `${sign}${magnitude}`
}

/**
 * The drawer's scorecard (FR-006, FR-025, FR-029, ui-contract §Scorecard).
 *
 * Drawer-side, so it subscribes to the **live** store and follows every
 * keystroke (FR-008) rather than the committed model the canvas draws behind
 * CENTER_SETTLE_MS. That is why it reads the store directly instead of taking
 * props — the same choice AnalysisOutput makes beside it.
 *
 * There is deliberately no aggregate score in either state (FR-025): the rows
 * are the whole card, and collapsing hides the expanded tier rather than
 * summarising it.
 */
export function Scorecard() {
  const metrics = useStore(selectScorecardMetrics)
  const baseline = useStore((s) => s.scorecardBaseline)
  const setHoveredMetricId = useStore((s) => s.setHoveredMetricId)
  const hoveredMetricId = useStore((s) => s.hoveredMetricId)

  // The pointer and the keyboard are two independent sources for one scalar,
  // and neither may clear the other's highlight. Writing `null` unconditionally
  // on leave/blur desynchronizes them: with a row focused, moving the pointer
  // across a second row and off it would leave the focused row still looking
  // active while the canvas lit nothing at all. Each source holds its own value
  // and the resolved one is pushed — the pointer wins while it is on a row,
  // because that is the more recent intent.
  const pointerId = useRef<string | null>(null)
  const focusId = useRef<string | null>(null)
  function pushHover(): void {
    setHoveredMetricId(pointerId.current ?? focusId.current)
  }

  // T051: the expansion is a viewer preference, not tournament state. It seeds
  // from the persisted view state and never reaches serializeState.
  const [expanded, setExpanded] = useState<boolean>(() => loadViewState().scorecardExpanded)

  function toggle(): void {
    const next = !expanded
    setExpanded(next)
    // Merged, never rewritten: the drawer height and the canvas window live
    // under the same key and this component owns neither of them.
    saveViewState({ ...loadViewState(), scorecardExpanded: next })
  }

  const rows = expanded ? metrics : metrics.filter((metric) => metric.tier === 'collapsed')

  // FR-029's only channel to a screen-reader user. The blocks the highlight
  // lights are `role="img"` with a static accessible name (EventBlock.tsx), and
  // role="img" is not a live region — so a keyboard user could focus every row
  // in turn, light the canvas each time, and be told nothing. The count of
  // driven blocks is announced here instead of on the blocks themselves.
  const hovered =
    hoveredMetricId === null ? undefined : metrics.find((metric) => metric.id === hoveredMetricId)

  return (
    <section aria-label="Scorecard" className="mb-3 rounded-lg border bg-card p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-card-foreground">Scorecard</h3>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          // The accessible name is stable in both states — aria-expanded is
          // what changes. scripts/smoke.mjs locates the button by this name.
          aria-label="Scorecard details"
          aria-expanded={expanded}
          aria-controls={METRIC_LIST_ID}
          onClick={toggle}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          Details
        </Button>
      </div>

      <span data-highlight-status aria-live="polite" className="sr-only">
        {hovered === undefined
          ? ''
          : `${hovered.label}: ${hovered.blockKeys.length} block${
              hovered.blockKeys.length === 1 ? '' : 's'
            } highlighted`}
      </span>

      <ul id={METRIC_LIST_ID} className="space-y-0.5">
        {rows.map((metric) => {
          const delta = computeDelta(metric, baseline)
          return (
            <li
              key={metric.id}
              data-metric={metric.id}
              // tabIndex is the contract, not styling: without it the row is
              // unfocusable and FR-029's highlight has no keyboard path at all.
              tabIndex={0}
              // focus-visible, and a ring rather than a background: --muted on
              // --card is about 1.08:1, where WCAG 2.4.11 asks 3:1 of a focus
              // indicator, and `outline-none` had removed the browser default
              // that would have supplied one. --ring on --card is ~3.6:1. The
              // `focus-visible` prefix also keeps a mouse click from leaving a
              // row looking selected after the pointer has gone.
              className="flex items-baseline gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onPointerEnter={() => {
                pointerId.current = metric.id
                pushHover()
              }}
              onPointerLeave={() => {
                pointerId.current = null
                pushHover()
              }}
              onFocus={() => {
                focusId.current = metric.id
                pushHover()
              }}
              onBlur={() => {
                focusId.current = null
                pushHover()
              }}
            >
              <span data-metric-label className="flex-1 truncate text-muted-foreground">
                {metric.label}
              </span>
              <span data-metric-value className="font-mono tabular-nums text-card-foreground">
                {formatValue(metric.kind, metric.value)}
              </span>
              {delta !== null && (
                <span data-metric-delta className="font-mono tabular-nums text-muted-foreground">
                  {formatDelta(metric.kind, delta)}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
