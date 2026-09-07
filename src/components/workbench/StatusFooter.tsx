import { useStore } from '../../store/store.ts'
import { selectFooterMetrics, selectPlacementCounts } from '../../store/derived.ts'
import { formatClock } from '../../lib/time.ts'
import { WEAPON_DISPLAY } from '../competitionLabels.ts'
import { Weapon } from '../../engine/types.ts'
import { ViewMode } from '../../store/viewState.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

interface StatusFooterProps {
  viewMode: ViewMode
  onViewModeChange: (next: ViewMode) => void
}

// Plain Tailwind colours for now — T024 swaps these for the weapon design
// tokens once they exist.
const LEGEND: { weapon: Weapon; swatchClass: string }[] = [
  { weapon: Weapon.FOIL, swatchClass: 'bg-sky-200' },
  { weapon: Weapon.EPEE, swatchClass: 'bg-emerald-200' },
  { weapon: Weapon.SABRE, swatchClass: 'bg-orange-200' },
]

/**
 * The one-line status bar that replaces the Drawer and its Scorecard
 * (FR-049, FR-050; research D7, D18; contracts/ui-contract.md §Footer).
 *
 * Three metrics only — finish, peak referees, strip use — read straight off
 * `selectFooterMetrics` with no delta against a baseline and no hover: D7
 * drops both along with the Scorecard's disclosure and its expanded tier.
 * `AnalysisOutput` is already mounted behind the rail's Findings button
 * (T009), so this is not a second home for it.
 *
 * The view toggle moved here verbatim from `CenterView.tsx` — the center no
 * longer owns which view is showing, only how it draws whichever one is
 * chosen (`WorkbenchShell` owns the state, `viewState.ts` persists it).
 */
export function StatusFooter({ viewMode, onViewModeChange }: StatusFooterProps) {
  const metrics = useStore(selectFooterMetrics)
  const counts = useStore(selectPlacementCounts)
  const finish = metrics.find((m) => m.id === 'finish:tournament')?.value ?? null
  const refs = metrics.find((m) => m.id === 'refs:peak-total')?.value ?? null
  const strips = metrics.find((m) => m.id === 'strips:utilization')?.value ?? null

  return (
    <footer
      aria-label="Status bar"
      className="flex shrink-0 items-center gap-4 border-t bg-background px-3 py-1 text-xs"
    >
      <span data-counts className="text-muted-foreground">
        {`${counts.placed} placed · ${counts.unplaced} unplaced · ${counts.pinned} pinned`}
      </span>
      <span data-metric="finish" className="flex items-baseline gap-1">
        <span className="text-muted-foreground">Finish</span>
        {/* FR-041: every time is 24-hour HH:MM — formatClock, not formatMinutes. */}
        <span className="font-mono tabular-nums">{finish === null ? '—' : formatClock(finish)}</span>
      </span>
      <span data-metric="refs" className="flex items-baseline gap-1">
        <span className="text-muted-foreground">Peak referees</span>
        <span className="font-mono tabular-nums">{refs === null ? '—' : String(Math.round(refs))}</span>
      </span>
      <span data-metric="strips" className="flex items-baseline gap-1">
        <span className="text-muted-foreground">Strip use</span>
        <span className="font-mono tabular-nums">{strips === null ? '—' : `${strips.toFixed(1)}%`}</span>
      </span>

      <span data-legend className="flex items-center gap-2">
        {LEGEND.map(({ weapon, swatchClass }) => (
          <span key={weapon} className="flex items-center gap-1">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${swatchClass}`} />
            {WEAPON_DISPLAY[weapon]}
          </span>
        ))}
      </span>

      <ToggleGroup
        type="single"
        // Radix's Root is role="group"; the two items are already role="radio"
        // in single mode, so the group they belong to is a radiogroup.
        role="radiogroup"
        aria-label="Center view mode"
        variant="outline"
        size="sm"
        value={viewMode}
        // Radix reports '' when the pressed item is the selected one. There
        // is no "no view" state to fall into, so that clears nothing.
        onValueChange={(next) => next && onViewModeChange(next as ViewMode)}
        className="ml-auto"
      >
        <ToggleGroupItem value={ViewMode.MATRIX}>Matrix</ToggleGroupItem>
        <ToggleGroupItem value={ViewMode.SCHEDULE}>Schedule</ToggleGroupItem>
      </ToggleGroup>
    </footer>
  )
}
