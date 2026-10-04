import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule } from '../../store/derived.ts'
import type { DerivedSchedule } from '../../store/derived.ts'
import type { DerivedEventSchedule } from '../../engine/derive.ts'
import { formatMinutes } from '../../lib/time.ts'
import type { ScheduleResult } from '../../engine/types.ts'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const HEAD = 'text-[11.5px] font-semibold tracking-[.06em] text-neutral-600 uppercase'

/**
 * The DE's first scheduled minute. A single-piece DE carries it in `de_start`;
 * a staged one leaves that null and splits into prelims and a round of 16
 * (`derive.ts`), which is what the matrix draws as two blocks. Reading only
 * `de_start` renders an em dash for every staged event, so the two views
 * disagree about an event the matrix has drawn (FR-023).
 */
function deStartMinutes(r: ScheduleResult): number | null {
  return r.de_start ?? r.de_prelims_start ?? r.de_round_of_16_start
}

/**
 * The DE's last *scheduled* minute — where the matrix's last block ends.
 * `de_total_end` is later: it adds `tailEstimateMins()` for medal bouts the
 * scheduler deliberately never places, so it belongs in the Finish column
 * rather than here, where it would put the table past the matrix.
 */
function deEndMinutes(r: ScheduleResult): number | null {
  return r.de_end ?? r.de_round_of_16_end
}

/** Row order within a day: pool start ascending, ties broken by id. */
function byPoolStartThenId(a: DerivedEventSchedule, b: DerivedEventSchedule): number {
  const byStart = (a.result.pool_start ?? 0) - (b.result.pool_start ?? 0)
  if (byStart !== 0) return byStart
  return a.result.competition_id.localeCompare(b.result.competition_id)
}

/**
 * The schedule as one printable page per day (FR-051, FR-052; research D11),
 * after USA Fencing's own published tournament schedules — a plain document
 * rather than a card. Day used to be a table column (`data-cell="day"`); it
 * is now the section heading (`data-day-section`) each day's table sits
 * under, so `@media print` (`src/index.css`) can break a page there and a
 * reader can tell days apart without decoding a column.
 *
 * `schedule` is the committed model `CenterView` hands down while a debounce
 * or the dimmed-invalid rule holds the center behind the live store
 * (S2-contract.md §Center view). The hook still runs unconditionally — hook
 * rules — so mounted with no props this behaves exactly as it always has.
 */
export function ScheduleOutput({ schedule: committed }: { schedule?: DerivedSchedule } = {}) {
  const live = useStore(selectDerivedSchedule)
  const schedule = committed ?? live

  const entries = Object.values(schedule.events)

  const printButton = (
    <button
      type="button"
      onClick={() => window.print()}
      className="print-hidden flex h-8 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[10px] border-[1.5px] border-chrome-border bg-secondary px-[13px] text-[12.5px] font-semibold text-foreground hover:border-accent-400 hover:bg-accent-100"
    >
      Print
    </button>
  )

  const toolbar = (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">Schedule</h2>
      {printButton}
    </div>
  )

  if (entries.length === 0) {
    return (
      <section aria-label="Schedule" data-schedule-view className="space-y-4">
        {toolbar}
        <p className="text-[12.5px] text-neutral-600">No events placed yet.</p>
      </section>
    )
  }

  const byDay = new Map<number, DerivedEventSchedule[]>()
  for (const entry of entries) {
    const day = entry.result.assigned_day
    const list = byDay.get(day)
    if (list) {
      list.push(entry)
    } else {
      byDay.set(day, [entry])
    }
  }
  const days = [...byDay.keys()].sort((a, b) => a - b)

  return (
    <section aria-label="Schedule" data-schedule-view className="space-y-4">
      {toolbar}
      {days.map((day) => {
        const rows = [...byDay.get(day)!].sort(byPoolStartThenId)
        const dayOutOfRange = rows.some((entry) => entry.day_out_of_range)
        const dayLabel = `Day ${day + 1}`

        return (
          <section
            key={day}
            aria-label={dayLabel}
            data-day-section={day + 1}
            className="print-page overflow-hidden rounded-[12px] border-[1.5px] border-chrome-border bg-secondary print:overflow-visible"
          >
            <div className="flex items-center gap-2 border-b-[1.5px] border-chrome-border bg-chrome-soft px-3 py-1.5 print:bg-transparent">
              <h3 className="text-base font-bold tracking-[.03em] text-foreground uppercase">
                {dayLabel}
              </h3>
              {dayOutOfRange && (
                <Badge
                  variant="destructive"
                  className="h-auto rounded-full bg-conflict-chip px-2 text-[10.5px] font-semibold text-finding-link uppercase"
                >{`${dayLabel} out of range`}</Badge>
              )}
            </div>
            <Table>
              <TableHeader>
                <TableRow className="border-row-line">
                  <TableHead className={HEAD}>Competition</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Pool Start</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Pool End</TableHead>
                  <TableHead className={`${HEAD} text-right`}>DE Start</TableHead>
                  <TableHead className={`${HEAD} text-right`}>DE End</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Strips</TableHead>
                  <TableHead className={`${HEAD} text-right`}>Finish</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(({ result: r, day_out_of_range }) => (
                  <TableRow
                    key={r.competition_id}
                    data-schedule-row={r.competition_id}
                    data-out-of-range={day_out_of_range ? 'true' : undefined}
                    className="border-row-line"
                  >
                    <TableCell
                      data-cell="competition"
                      className="font-mono text-xs text-foreground"
                    >
                      {r.competition_id}
                    </TableCell>
                    <TableCell
                      data-cell="poolStart"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {formatMinutes(r.pool_start)}
                    </TableCell>
                    <TableCell
                      data-cell="poolEnd"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {formatMinutes(r.pool_end)}
                    </TableCell>
                    <TableCell
                      data-cell="deStart"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {formatMinutes(deStartMinutes(r))}
                    </TableCell>
                    <TableCell
                      data-cell="deEnd"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {formatMinutes(deEndMinutes(r))}
                    </TableCell>
                    <TableCell
                      data-cell="strips"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {r.pool_strip_count}
                    </TableCell>
                    <TableCell
                      data-cell="finish"
                      className="text-right font-mono text-[11.5px] font-semibold text-foreground"
                    >
                      {formatMinutes(r.de_total_end)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </section>
  )
}
