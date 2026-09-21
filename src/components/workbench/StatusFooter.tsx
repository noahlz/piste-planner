import type { ReactNode } from 'react'
import { useStore } from '../../store/store.ts'
import { selectFooterMetrics, selectPlacementCounts } from '../../store/derived.ts'
import { formatClock } from '../../lib/time.ts'
import { WEAPON_DISPLAY } from '../../lib/competitionLabels.ts'
import { Weapon } from '../../engine/types.ts'
import { ViewMode } from '../../store/viewState.ts'
import {
  canZoomIn,
  canZoomOut,
  fitDay,
  resetZoom,
  stepZoom,
  zoomReadout,
  type ZoomState,
} from '../canvas/zoomLadder.ts'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'

interface StatusFooterProps {
  viewMode: ViewMode
  onViewModeChange: (next: ViewMode) => void
  zoom: ZoomState
  onZoomChange: (next: ZoomState) => void
}

// Weapon design tokens (docs/design/mockup/, standing rule 13). T024 still
// adds weaponTokens.ts as the shared mapping module — the tokens themselves
// already live in index.css.
const LEGEND: { weapon: Weapon; swatchClass: string }[] = [
  { weapon: Weapon.FOIL, swatchClass: 'border-weapon-foil-edge bg-weapon-foil-fill' },
  { weapon: Weapon.EPEE, swatchClass: 'border-weapon-epee-edge bg-weapon-epee-fill' },
  { weapon: Weapon.SABRE, swatchClass: 'border-weapon-sabre-edge bg-weapon-sabre-fill' },
]

/**
 * The one-line status bar that replaces the retired bottom panel and its
 * scorecard (FR-049, FR-050; research D7, D18; contracts/ui-contract.md
 * §Footer).
 *
 * Three metrics only — finish, peak referees, strip use — read straight off
 * `selectFooterMetrics` with no delta against a baseline and no hover: D7
 * drops both along with the retired scorecard's disclosure and its expanded
 * tier.
 * `FindingsPanel` is already mounted behind the rail's Findings button
 * (T009, T032), so this is not a second home for it.
 *
 * The view toggle moved here verbatim from `CenterView.tsx` — the center no
 * longer owns which view is showing, only how it draws whichever one is
 * chosen (`WorkbenchShell` owns the state, `viewState.ts` persists it).
 *
 * The zoom toolbar (013 T026, FR-034) sits beside it for the same reason. The
 * canvas draws at whatever rung it is handed and owns none of the choice, so
 * the two controls that change what the center shows live together on one bar
 * rather than one of them floating over the drawing it governs — which is what
 * the retired `toolbar` "Canvas zoom controls" did.
 */
export function StatusFooter({
  viewMode,
  onViewModeChange,
  zoom,
  onZoomChange,
}: StatusFooterProps) {
  const metrics = useStore(selectFooterMetrics)
  const counts = useStore(selectPlacementCounts)
  const finish = metrics.find((m) => m.id === 'finish:tournament')?.value ?? null
  const refs = metrics.find((m) => m.id === 'refs:peak-total')?.value ?? null
  const strips = metrics.find((m) => m.id === 'strips:utilization')?.value ?? null

  return (
    <footer
      aria-label="Status bar"
      className="print-hidden flex h-8 shrink-0 items-center gap-0 overflow-hidden border-t-[1.5px] border-chrome-border bg-chrome-deep text-[11.5px] whitespace-nowrap"
    >
      <span data-counts className="px-4 text-neutral-700">
        {`${counts.placed} placed · ${counts.unplaced} unplaced · ${counts.pinned} pinned`}
      </span>
      <Rule />
      <span data-metric="finish" className="flex items-baseline gap-1.5 px-4">
        <span className="text-neutral-500">Finish</span>
        {/* FR-041: every time is 24-hour HH:MM — formatClock, not formatMinutes. */}
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {finish === null ? '—' : formatClock(finish)}
        </span>
      </span>
      <Rule />
      <span data-metric="refs" className="flex items-baseline gap-1.5 px-4">
        <span className="text-neutral-500">Peak referees</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {refs === null ? '—' : String(Math.round(refs))}
        </span>
      </span>
      <Rule />
      <span data-metric="strips" className="flex items-baseline gap-1.5 px-4">
        <span className="text-neutral-500">Strip use</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {strips === null ? '—' : `${strips.toFixed(1)}%`}
        </span>
      </span>
      <Rule />

      <span data-legend className="ml-auto flex items-center gap-1.5 px-4">
        <span className="text-neutral-500">Weapon</span>
        {LEGEND.map(({ weapon, swatchClass }) => (
          <span key={weapon} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-[4px] border-[1.5px]', swatchClass)} />
            {WEAPON_DISPLAY[weapon]}
          </span>
        ))}
      </span>

      <Rule />

      {/* Zoom (FR-034, SC-005). `aria-pressed` on Fit day only: it is the one
          control with a state to report — the other three are actions. */}
      <div
        role="toolbar"
        aria-label="Zoom"
        aria-orientation="horizontal"
        className="mr-3 flex items-center gap-1 px-3"
      >
        <ZoomButton
          label="Zoom out"
          disabled={!canZoomOut(zoom.zoomStep)}
          onClick={() => onZoomChange(stepZoom(zoom, -1))}
        >
          <Minus className="h-3 w-3" />
        </ZoomButton>
        <span
          data-zoom-readout
          className="w-9 text-center font-mono text-[11px] font-semibold tabular-nums text-neutral-700"
        >
          {zoomReadout(zoom.zoomStep)}
        </span>
        <ZoomButton
          label="Zoom in"
          disabled={!canZoomIn(zoom.zoomStep)}
          onClick={() => onZoomChange(stepZoom(zoom, 1))}
        >
          <Plus className="h-3 w-3" />
        </ZoomButton>
        <ZoomButton label="Reset zoom" onClick={() => onZoomChange(resetZoom())}>
          <RotateCcw className="h-3 w-3" />
        </ZoomButton>
        <ZoomButton
          label="Fit day"
          pressed={zoom.fitting}
          onClick={() => onZoomChange(fitDay(zoom))}
        >
          <Maximize2 className="h-3 w-3" />
        </ZoomButton>
      </div>

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
        className="mr-3.5 gap-0 rounded-[7px]"
      >
        <ToggleGroupItem
          value={ViewMode.MATRIX}
          className="h-6 min-w-0 rounded-[7px] border-[1.5px] border-chrome-border bg-secondary px-3 text-[11.5px] font-semibold text-neutral-700 data-[state=on]:border-accent-400 data-[state=on]:bg-accent-100 data-[state=on]:text-accent-800"
        >
          Matrix
        </ToggleGroupItem>
        <ToggleGroupItem
          value={ViewMode.SCHEDULE}
          className="h-6 min-w-0 rounded-[7px] border-[1.5px] border-chrome-border bg-secondary px-3 text-[11.5px] font-semibold text-neutral-700 data-[state=on]:border-accent-400 data-[state=on]:bg-accent-100 data-[state=on]:text-accent-800"
        >
          Schedule
        </ToggleGroupItem>
      </ToggleGroup>
    </footer>
  )
}

function Rule() {
  return <span aria-hidden="true" className="h-[15px] w-[1.5px] shrink-0 rounded-sm bg-chrome-border" />
}

/**
 * One zoom control, styled as the mockup's footer buttons are: a real bordered
 * box at rest rather than a bare glyph, in the chrome ramp from `index.css`.
 * The glyph is `aria-hidden` by lucide's own default and the name comes from
 * `aria-label`, so the four controls are distinguishable to a screen reader
 * without four visible captions crowding a 32px bar.
 */
function ZoomButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-6 min-w-6 items-center justify-center rounded-[7px] border-[1.5px] border-chrome-border bg-secondary px-1.5 text-neutral-700',
        'hover:bg-hover-tint disabled:opacity-40 disabled:hover:bg-secondary',
        pressed && 'border-accent-400 bg-accent-100 text-accent-800',
      )}
    >
      {children}
    </button>
  )
}
