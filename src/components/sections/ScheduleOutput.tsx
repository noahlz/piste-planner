import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { BottleneckSeverity } from '../../engine/types.ts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const SEVERITY_CLASSES: Record<string, string> = {
  ERROR: 'border-red-200 bg-error text-error-text',
  WARN: 'border-amber-200 bg-warning text-warning-text',
  INFO: 'border-blue-200 bg-info text-info-text',
}

const SEVERITY_ICON = {
  ERROR: AlertCircle,
  WARN: AlertTriangle,
  INFO: Info,
} as const

function formatMinutes(mins: number | null): string {
  if (mins === null) return '\u2014'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Returns a row tint class based on the worst bottleneck severity for a competition.
 * ERROR -> pastel pink-red, WARN -> pastel yellow, INFO/none -> no tint.
 */
function rowTintClass(
  competitionId: string,
  severityMap: Record<string, string>,
): string {
  const worst = severityMap[competitionId]
  if (worst === BottleneckSeverity.ERROR) return 'bg-error'
  if (worst === BottleneckSeverity.WARN) return 'bg-warning'
  return ''
}

export function ScheduleOutput() {
  const scheduleResults = useStore((s) => s.scheduleResults)
  const bottlenecks = useStore((s) => s.bottlenecks)

  const entries = Object.values(scheduleResults)

  if (entries.length === 0 && bottlenecks.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Schedule Output</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Run Generate Schedule to see results.</p>
        </CardContent>
      </Card>
    )
  }

  // Track worst severity per competition for row tinting
  const worstSeverity: Record<string, string> = {}
  for (const b of bottlenecks) {
    const current = worstSeverity[b.competition_id]
    if (!current || b.severity === BottleneckSeverity.ERROR) {
      worstSeverity[b.competition_id] = b.severity
    } else if (b.severity === BottleneckSeverity.WARN && current !== BottleneckSeverity.ERROR) {
      worstSeverity[b.competition_id] = b.severity
    }
  }

  // Count bottlenecks per competition for the table
  const bottleneckCounts: Record<string, number> = {}
  for (const b of bottlenecks) {
    bottleneckCounts[b.competition_id] = (bottleneckCounts[b.competition_id] ?? 0) + 1
  }

  // Sort by day then pool start
  const sorted = [...entries].sort((a, b) => {
    if (a.assigned_day !== b.assigned_day) return a.assigned_day - b.assigned_day
    return (a.pool_start ?? 0) - (b.pool_start ?? 0)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schedule Output</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length > 0 && (
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
                  <TableHead className="text-right">Bottlenecks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((r) => (
                  <TableRow
                    key={r.competition_id}
                    className={rowTintClass(r.competition_id, worstSeverity)}
                  >
                    <TableCell className="font-mono text-xs text-foreground">{r.competition_id}</TableCell>
                    <TableCell className="text-right text-foreground">{r.assigned_day + 1}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.pool_start)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.pool_end)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.de_start)}</TableCell>
                    <TableCell className="text-right text-foreground">{formatMinutes(r.de_total_end)}</TableCell>
                    <TableCell className="text-right text-foreground">{r.pool_strip_count}</TableCell>
                    <TableCell className="text-right text-foreground">
                      {bottleneckCounts[r.competition_id] ?? 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {bottlenecks.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">Bottlenecks</h3>
            <div className="space-y-1">
              {bottlenecks.map((b, i) => {
                const Icon = SEVERITY_ICON[b.severity as keyof typeof SEVERITY_ICON] ?? Info
                return (
                  <Alert
                    key={`${b.competition_id}-${b.cause}-${i}`}
                    className={SEVERITY_CLASSES[b.severity] ?? ''}
                  >
                    <Icon className="h-4 w-4" />
                    <AlertDescription>
                      <span className="font-mono text-xs">{b.competition_id || 'global'}</span>{' '}
                      <span className="font-medium">[{b.phase}]</span>{' '}
                      <span className="text-xs uppercase">{b.cause}</span>: {b.message}
                    </AlertDescription>
                  </Alert>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
