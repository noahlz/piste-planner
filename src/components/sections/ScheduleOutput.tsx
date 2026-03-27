import { useStore } from '../../store/store.ts'

const SEVERITY_STYLES: Record<string, string> = {
  ERROR: 'text-red-700 bg-red-50 border-red-200',
  WARN: 'text-amber-700 bg-amber-50 border-amber-200',
  INFO: 'text-slate-600 bg-slate-50 border-slate-200',
}

function formatMinutes(mins: number | null): string {
  if (mins === null) return '\u2014'
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return `${hours}:${minutes.toString().padStart(2, '0')}`
}

export function ScheduleOutput() {
  const scheduleResults = useStore((s) => s.scheduleResults)
  const bottlenecks = useStore((s) => s.bottlenecks)

  const entries = Object.values(scheduleResults)

  if (entries.length === 0 && bottlenecks.length === 0) {
    return (
      <div className="rounded border border-border bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-400">Schedule Output</h2>
        <p className="text-sm text-slate-300">Run Generate Schedule to see results.</p>
      </div>
    )
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
    <div className="rounded border border-border bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Schedule Output</h2>

      {entries.length > 0 && (
        <div className="mb-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="pb-2 text-left font-medium">Competition</th>
                <th className="pb-2 text-right font-medium">Day</th>
                <th className="pb-2 text-right font-medium">Pool Start</th>
                <th className="pb-2 text-right font-medium">Pool End</th>
                <th className="pb-2 text-right font-medium">DE Start</th>
                <th className="pb-2 text-right font-medium">DE End</th>
                <th className="pb-2 text-right font-medium">Strips</th>
                <th className="pb-2 text-right font-medium">Bottlenecks</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.competition_id}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="py-1.5 font-mono text-xs">{r.competition_id}</td>
                  <td className="py-1.5 text-right">{r.assigned_day + 1}</td>
                  <td className="py-1.5 text-right">{formatMinutes(r.pool_start)}</td>
                  <td className="py-1.5 text-right">{formatMinutes(r.pool_end)}</td>
                  <td className="py-1.5 text-right">{formatMinutes(r.de_start)}</td>
                  <td className="py-1.5 text-right">{formatMinutes(r.de_total_end)}</td>
                  <td className="py-1.5 text-right">{r.pool_strips_count}</td>
                  <td className="py-1.5 text-right">
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
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Bottlenecks</h3>
          <ul className="space-y-1">
            {bottlenecks.map((b, i) => (
              <li
                key={`${b.competition_id}-${b.cause}-${i}`}
                className={`rounded border px-3 py-1.5 text-sm ${SEVERITY_STYLES[b.severity] ?? ''}`}
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
