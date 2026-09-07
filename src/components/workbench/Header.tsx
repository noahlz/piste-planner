import { useStore } from '../../store/store.ts'
import { selectDerivedFindings } from '../../store/derived.ts'
import { runScheduleAll } from '../../store/runActions.ts'
import { formatClock } from '../../lib/time.ts'
import { PresetPicker } from './PresetPicker.tsx'
import { ExportPopover } from './ExportPopover.tsx'
import { Button } from '@/components/ui/button'
import { Play } from 'lucide-react'

/**
 * The workbench header (013 T010, ui-contract.md §Header, FR-004–FR-009):
 * brand, preset picker, a read-only tournament summary, the last auto-run
 * time, Auto-assign, and Export. Replaces the old `TopBar` (preset picker
 * plus duplicate type/day/strip inputs and a gears disclosure — both now
 * live only in the tool rail's panels) and `App.tsx`'s standalone `<header>`.
 */
export function Header() {
  const tournamentType = useStore((s) => s.tournament_type)
  const daysAvailable = useStore((s) => s.days_available)
  const stripsTotal = useStore((s) => s.strips_total)
  const lastAutoRun = useStore((s) => s.lastAutoRun)

  const { validationErrors } = useStore(selectDerivedFindings)
  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  return (
    <header
      aria-label="Header"
      className="flex shrink-0 items-center gap-4 border-b bg-slate-800 px-4 py-2 text-white"
    >
      <span className="text-lg font-bold italic">Piste Planner</span>

      <PresetPicker />

      <span data-summary className="text-sm text-slate-300">
        {tournamentType} · {daysAvailable} days · {stripsTotal} strips
      </span>

      {lastAutoRun !== null && (
        <span data-last-run className="text-sm text-slate-300">
          Last run {formatClock(dateToMinutesFromMidnight(new Date(lastAutoRun.at)))}
        </span>
      )}

      <Button
        type="button"
        variant="success"
        className="ml-auto"
        onClick={() => runScheduleAll()}
        disabled={hasHardErrors}
      >
        <Play className="mr-2 h-4 w-4" />
        Auto-assign
      </Button>

      <ExportPopover />
    </header>
  )
}

/** Local wall-clock minutes-from-midnight for a Date — Header's own axis, not
 * the engine's minutes-from-midnight schedule axis (they share units, not meaning). */
function dateToMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
