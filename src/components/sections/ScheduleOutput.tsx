import { Fragment } from 'react'
import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule } from '../../store/derived.ts'
import type { DerivedSchedule } from '../../store/derived.ts'
import { formatMinutes } from '../../lib/time.ts'
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

/** Seven columns, so a day header cell has to span all of them. */
const COLUMN_COUNT = 7

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
                    className={day_out_of_range ? 'bg-warning' : ''}
                  >
                    <TableCell className="font-mono text-xs text-foreground">{r.competition_id}</TableCell>
                    <TableCell className="text-right text-foreground">
                      {day_out_of_range ? (
                        <Badge variant="destructive">Day {r.assigned_day + 1} out of range</Badge>
                      ) : (
                        r.assigned_day + 1
                      )}
                    </TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.pool_start)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.pool_end)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.de_start)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.de_total_end)}</TableCell>
                    <TableCell className="text-right text-foreground">{r.pool_strip_count}</TableCell>
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
