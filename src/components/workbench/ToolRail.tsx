import { Trophy, Rows3, CalendarDays, AlertTriangle, Settings as SettingsIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PanelId } from '../../store/viewState.ts'
import { PANEL_TITLES } from './InspectorPanel.tsx'

interface ToolRailButtonSpec {
  id: PanelId
  icon: typeof Trophy
}

// Order is fixed by ui-contract.md §Tool rail — the same five panels
// WorkbenchShell mounts by id (decision 1), replacing the collapsible Rail's
// four headings plus Advanced. Labels come from InspectorPanel's
// `PANEL_TITLES` so the rail and the panel it opens can never disagree about
// a panel's name.
const BUTTONS: ToolRailButtonSpec[] = [
  { id: PanelId.TOURNAMENT, icon: Trophy },
  { id: PanelId.STRIPS, icon: Rows3 },
  { id: PanelId.EVENTS, icon: CalendarDays },
  { id: PanelId.FINDINGS, icon: AlertTriangle },
  { id: PanelId.SETTINGS, icon: SettingsIcon },
]

interface ToolRailProps {
  panel: PanelId | null
  onSelect: (id: PanelId | null) => void
}

/**
 * The tool rail: five buttons, each opening one inspector panel at a time
 * (013 T009, ui-contract.md §Tool rail). Controlled — `WorkbenchShell` owns
 * `panel` so it can persist it to view state.
 *
 * The visible label under each icon *is* the accessible name (no `aria-label`
 * alongside it — that would give the button two competing names). Pressing
 * the open button closes the rail; pressing any other opens it.
 */
export function ToolRail({ panel, onSelect }: ToolRailProps) {
  return (
    <nav aria-label="Tool rail" className="flex w-16 shrink-0 flex-col border-r bg-background">
      {BUTTONS.map(({ id, icon: Icon }) => {
        const pressed = panel === id
        const label = PANEL_TITLES[id]
        return (
          <button
            key={id}
            type="button"
            aria-pressed={pressed}
            onClick={() => onSelect(pressed ? null : id)}
            className={cn(
              'flex flex-col items-center gap-1 px-1 py-3 text-center text-[0.65rem] leading-tight text-muted-foreground hover:bg-foreground/5 hover:text-foreground',
              pressed && 'bg-foreground/10 text-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </button>
        )
      })}
    </nav>
  )
}
