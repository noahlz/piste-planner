import { Fragment } from 'react'
import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule } from '../../store/derived.ts'
import type { DerivedSchedule } from '../../store/derived.ts'
import { formatMinutes } from '../../lib/time.ts'
import type { ScheduleResult } from '../../engine/types.ts'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

/** Eight columns, so a day header cell has to span all of them. */
const COLUMN_COUNT = 8

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

/**
 * The schedule table, grouped by day (FR-024).
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

  if (entries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Schedule Output</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No events placed yet.</p>
        </CardContent>
      </Card>
    )
  }

  const sorted = [...entries].sort((a, b) => {
    if (a.result.assigned_day !== b.result.assigned_day) {
      return a.result.assigned_day - b.result.assigned_day
    }
    return (a.result.pool_start ?? 0) - (b.result.pool_start ?? 0)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Output</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Competition</TableHead>
                <TableHead className="text-right">Day</TableHead>
                <TableHead className="text-right">Pool Start</TableHead>
                <TableHead className="text-right">Pool End</TableHead>
                <TableHead className="text-right">DE Start</TableHead>
                <TableHead className="text-right">DE End</TableHead>
                <TableHead className="text-right">Strips</TableHead>
                <TableHead className="text-right">Finish</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(({ result: r, day_out_of_range }, i) => (
                <Fragment key={r.competition_id}>
                  {(i === 0 || sorted[i - 1].result.assigned_day !== r.assigned_day) && (
                    <TableRow className="bg-muted/50">
                      {/* Never a time string here — scheduleOutput.test.tsx asserts
                          no stale '8:00' survives a moved placement. */}
                      <TableCell colSpan={COLUMN_COUNT} className="font-semibold text-foreground">
                        Day {r.assigned_day + 1}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow
                    data-schedule-row={r.competition_id}
                    className={day_out_of_range ? 'bg-warning' : ''}
                  >
                    <TableCell data-cell="competition" className="font-mono text-xs text-foreground">{r.competition_id}</TableCell>
                    <TableCell data-cell="day" className="text-right text-foreground">
                      {day_out_of_range ? (
                        <Badge variant="destructive">Day {r.assigned_day + 1} out of range</Badge>
                      ) : (
                        r.assigned_day + 1
                      )}
                    </TableCell>
                    <TableCell data-cell="poolStart" className="text-right text-foreground">{formatMinutes(r.pool_start)}</TableCell>
                    <TableCell data-cell="poolEnd" className="text-right text-foreground">{formatMinutes(r.pool_end)}</TableCell>
                    <TableCell data-cell="deStart" className="text-right text-foreground">{formatMinutes(deStartMinutes(r))}</TableCell>
                    <TableCell data-cell="deEnd" className="text-right text-foreground">{formatMinutes(deEndMinutes(r))}</TableCell>
                    <TableCell data-cell="strips" className="text-right text-foreground">{r.pool_strip_count}</TableCell>
                    <TableCell data-cell="finish" className="text-right text-foreground">{formatMinutes(r.de_total_end)}</TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
