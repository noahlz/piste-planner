import { useStore } from '../../store/store.ts'
import { FindingSeverity, selectFindings } from '../../store/derived.ts'
import { runScheduleAll } from '../../store/runActions.ts'
import { formatClock } from '../../lib/time.ts'
import { PresetPicker } from './PresetPicker.tsx'
import { ExportPopover } from './ExportPopover.tsx'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

/**
 * The workbench header (013 T010, ui-contract.md §Header, FR-004–FR-009):
 * brand, preset picker, a read-only tournament summary, the last auto-run
 * time, Auto-assign, and Export. Replaces the retired top bar (preset picker
 * plus duplicate type/day/strip inputs and a gears disclosure — both now
 * live only in the tool rail's panels) and `App.tsx`'s standalone `<header>`.
 */
export function Header() {
  const tournamentType = useStore((s) => s.tournament_type)
  const daysAvailable = useStore((s) => s.days_available)
  const stripsTotal = useStore((s) => s.strips_total)
  const lastAutoRun = useStore((s) => s.lastAutoRun)

  // 013 T032, contract §6: Auto-assign reads the unified findings list rather
  // than validationErrors directly, so its disabled state agrees with what
  // the Findings panel and the rail badge show.
  const findings = useStore(selectFindings)
  const hasBlockingFinding = findings.some((f) => f.severity === FindingSeverity.BLOCKING)

  return (
    <header
      aria-label="Header"
      className="print-hidden flex h-11 shrink-0 items-center gap-3.5 border-b bg-chrome px-3.5 text-foreground"
    >
      <div className="flex flex-none items-center gap-[9px]">
        <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
          P
        </span>
        <span className="text-[19px] font-bold whitespace-nowrap">Piste Planner</span>
      </div>

      <div className="h-6 w-[1.5px] flex-none rounded-sm bg-chrome-border" />

      <PresetPicker />

      <span data-summary className="font-mono text-[11.5px] font-semibold text-neutral-700">
        {tournamentType} · {daysAvailable} days · {stripsTotal} strips
      </span>

      <div className="ml-auto flex flex-none items-center gap-2.5">
        {lastAutoRun !== null && (
          <span data-last-run className="font-mono text-[11px] font-semibold text-neutral-500">
            Last run {formatClock(dateToMinutesFromMidnight(new Date(lastAutoRun.at)))}
          </span>
        )}

        <Button
          type="button"
          onClick={() => runScheduleAll()}
          disabled={hasBlockingFinding}
          className="h-8 gap-2 rounded-[10px] px-[15px] text-[13.5px] font-bold tracking-[.03em] uppercase shadow-sm hover:bg-accent-hover"
        >
          <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          Auto-assign
        </Button>

        <ExportPopover />
      </div>
    </header>
  )
}

/** Local wall-clock minutes-from-midnight for a Date — Header's own axis, not
 * the engine's minutes-from-midnight schedule axis (they share units, not meaning). */
function dateToMinutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
