import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { selectScorecardMetrics, type ScorecardMetric, type ScorecardBaseline } from '../../store/derived.ts'
import { loadViewState, saveViewState } from '../../store/viewState.ts'
import { formatMinutes } from '../../lib/time.ts'
import { Button } from '@/components/ui/button'

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
 */
function formatDelta(kind: ScorecardMetric['kind'], delta: number): string {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : ''
  return `${sign}${formatValue(kind, Math.abs(delta))}`
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
          onClick={toggle}
        >
          {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
          Details
        </Button>
      </div>

      <ul className="space-y-0.5">
        {rows.map((metric) => {
          const delta = computeDelta(metric, baseline)
          return (
            <li
              key={metric.id}
              data-metric={metric.id}
              // tabIndex is the contract, not styling: without it the row is
              // unfocusable and FR-029's highlight has no keyboard path at all.
              tabIndex={0}
              className="flex items-baseline gap-2 rounded px-1 py-0.5 text-xs hover:bg-muted focus:bg-muted focus:outline-none"
              onPointerEnter={() => setHoveredMetricId(metric.id)}
              onPointerLeave={() => setHoveredMetricId(null)}
              onFocus={() => setHoveredMetricId(metric.id)}
              onBlur={() => setHoveredMetricId(null)}
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
