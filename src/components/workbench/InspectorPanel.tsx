import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
        'flex w-96 flex-col bg-background',
        docked ? 'relative shrink-0 border-r' : 'absolute top-0 left-0 z-40 h-full border-r shadow-xl',
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-semibold text-foreground">{PANEL_TITLES[panel]}</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={docked}
            onClick={onToggleDocked}
          >
            {docked ? 'Float panel' : 'Dock panel'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Close panel
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">{children}</div>
    </aside>
  )
}
