import { useStore } from '../../store/store.ts'
import { BottleneckSeverity } from '../../engine/types.ts'

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: 'text-error-text bg-error border-red-200',
  WARN: 'text-warning-text bg-warning border-amber-200',
  INFO: 'text-info-text bg-info border-blue-200',
}

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
      <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-muted">Schedule Output</h2>
        <p className="text-sm text-muted">Run Generate Schedule to see results.</p>
      </div>
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
    <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Schedule Output</h2>

      {entries.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-muted">
                <th className="px-2 pb-2 text-left font-medium">Competition</th>
                <th className="px-2 pb-2 text-right font-medium">Day</th>
                <th className="px-2 pb-2 text-right font-medium">Pool Start</th>
                <th className="px-2 pb-2 text-right font-medium">Pool End</th>
                <th className="px-2 pb-2 text-right font-medium">DE Start</th>
                <th className="px-2 pb-2 text-right font-medium">DE End</th>
                <th className="px-2 pb-2 text-right font-medium">Strips</th>
                <th className="px-2 pb-2 text-right font-medium">Bottlenecks</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.competition_id}
                  className={`border-b border-slate-100 last:border-b-0 ${rowTintClass(r.competition_id, worstSeverity)}`}
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-body">{r.competition_id}</td>
                  <td className="px-2 py-1.5 text-right text-body">{r.assigned_day + 1}</td>
                  <td className="px-2 py-1.5 text-right text-body">{formatMinutes(r.pool_start)}</td>
                  <td className="px-2 py-1.5 text-right text-body">{formatMinutes(r.pool_end)}</td>
                  <td className="px-2 py-1.5 text-right text-body">{formatMinutes(r.de_start)}</td>
                  <td className="px-2 py-1.5 text-right text-body">{formatMinutes(r.de_total_end)}</td>
                  <td className="px-2 py-1.5 text-right text-body">{r.pool_strips_count}</td>
                  <td className="px-2 py-1.5 text-right text-body">
                    {bottleneckCounts[r.competition_id] ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bottlenecks.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-header">Bottlenecks</h3>
          <ul className="space-y-1">
            {bottlenecks.map((b, i) => (
              <li
                key={`${b.competition_id}-${b.cause}-${i}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${SEVERITY_STYLES[b.severity] ?? ''}`}
              >
                <span className="font-mono text-xs">{b.competition_id || 'global'}</span>{' '}
                <span className="font-medium">[{b.phase}]</span>{' '}
                <span className="text-xs uppercase">{b.cause}</span>: {b.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
