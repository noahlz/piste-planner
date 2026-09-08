import { Fragment } from 'react'
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
 * Icon-only (mockup `railLabels:false`) — the accessible name is `aria-label`
 * (mirrored onto `title`), not a visible label, so no button carries two
 * competing names. Pressing the open button closes the rail; pressing any
 * other opens it. A decorative rule (`aria-hidden`) separates Settings from
 * the four panel buttons above it — a styling addition, not a DOM-order
 * change of any control.
 */
export function ToolRail({ panel, onSelect }: ToolRailProps) {
  return (
    <nav
      aria-label="Tool rail"
      className="flex w-[62px] shrink-0 flex-col items-center gap-[7px] border-r-[1.5px] border-chrome-border bg-chrome py-[11px]"
    >
      {BUTTONS.map(({ id, icon: Icon }, index) => {
        const pressed = panel === id
        const label = PANEL_TITLES[id]
        return (
          <Fragment key={id}>
            {index === BUTTONS.length - 1 && (
              <span aria-hidden="true" className="my-[3px] h-[1.5px] w-[31px] rounded-sm bg-chrome-border" />
            )}
            <button
              type="button"
              aria-pressed={pressed}
              aria-label={label}
              title={label}
              onClick={() => onSelect(pressed ? null : id)}
              className={cn(
                'flex h-[46px] w-[46px] items-center justify-center rounded-[13px] border-[1.5px] border-chrome-border bg-secondary text-neutral-700 shadow-[0_1px_2px_rgba(43,43,45,.05)] hover:border-accent-400 hover:bg-hover-tint',
                pressed &&
                  'border-primary bg-accent-100 text-accent-800 shadow-[0_1px_3px_rgba(43,43,45,.1)] hover:border-primary hover:bg-accent-100',
              )}
            >
              <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            </button>
          </Fragment>
        )
      })}
    </nav>
  )
}
