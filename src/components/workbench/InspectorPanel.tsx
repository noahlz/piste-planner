import type { ReactNode } from 'react'
import { PanelLeft, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelId } from '../../store/viewState.ts'

// The single home for panel titles — ToolRail's button labels reuse this map
// (013 T009) so the rail and the panel it opens can never disagree about a
// panel's name. Splitting it into its own module to satisfy fast refresh
// would separate the map from the component whose header it labels.
// eslint-disable-next-line react-refresh/only-export-components
export const PANEL_TITLES: Record<PanelId, string> = {
  [PanelId.TOURNAMENT]: 'Tournament',
  [PanelId.STRIPS]: 'Strips & referees',
  [PanelId.EVENTS]: 'Events',
  [PanelId.FINDINGS]: 'Findings',
  [PanelId.SETTINGS]: 'Settings',
}

interface InspectorPanelProps {
  panel: PanelId
  docked: boolean
  onToggleDocked: () => void
  onClose: () => void
  children: ReactNode
}

/**
 * The panel host every tool rail button opens (013 T009, ui-contract.md
 * §Inspector panel). Mounts the old section components by panel id
 * (`WorkbenchShell.tsx`'s `panelContent`) until phase 2 replaces each one.
 *
 * Floating (default) positions the panel over the canvas beside the rail;
 * docked pushes it in-flow instead. This component only switches its own
 * classes on `docked` — the shell decides where the rail and the panel sit
 * relative to each other.
 */
export function InspectorPanel({ panel, docked, onToggleDocked, onClose, children }: InspectorPanelProps) {
  return (
    <aside
      aria-label="Inspector panel"
      className={cn(
        'flex w-[324px] flex-col bg-chrome',
        docked
          ? 'relative shrink-0 border-r-[1.5px] border-chrome-border'
          : 'absolute top-0 left-0 z-40 h-full border-r-[1.5px] border-chrome-border shadow-panel',
      )}
    >
      <div className="sticky top-0 z-[2] flex h-10 shrink-0 items-center justify-between gap-2 border-b-[1.5px] border-chrome-border bg-chrome pr-[7px] pl-3.5">
        <h2 className="text-[11.5px] font-semibold tracking-[.06em] whitespace-nowrap uppercase">
          {PANEL_TITLES[panel]}
        </h2>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-pressed={docked}
            aria-label={docked ? 'Float panel' : 'Dock panel'}
            title={docked ? 'Float panel' : 'Dock panel'}
            onClick={onToggleDocked}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-foreground',
              docked && 'bg-accent-200 text-accent-800 hover:bg-accent-200 hover:text-accent-800',
            )}
          >
            <PanelLeft className="h-[15px] w-[15px]" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            aria-label="Close panel"
            title="Close panel"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200 hover:text-foreground"
          >
            <X className="h-[15px] w-[15px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3.5">{children}</div>
    </aside>
  )
}
