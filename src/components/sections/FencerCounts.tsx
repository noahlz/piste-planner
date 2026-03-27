import { useStore } from '../../store/store.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from './CompetitionMatrix.tsx'

export function FencerCounts() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const sortedIds = Object.keys(selectedCompetitions).sort()

  if (sortedIds.length === 0) {
    return (
      <div className="rounded border border-border bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Fencer Counts</h2>
        <p className="text-sm text-slate-400">Select competitions above to enter fencer counts.</p>
      </div>
    )
  }

  return (
    <div className="rounded border border-border bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Fencer Counts</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="pb-2 text-left font-medium">Competition</th>
            <th className="pb-2 text-right font-medium">Fencer Count</th>
          </tr>
        </thead>
        <tbody>
          {sortedIds.map((id) => {
            const entry = findCompetition(id)
            const label = entry ? competitionLabel(entry) : id
            return (
              <tr key={id} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-600">{label}</td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded border border-border px-2 py-0.5 text-right"
                    value={selectedCompetitions[id].fencer_count}
                    onChange={(e) =>
                      updateCompetition(id, { fencer_count: Number(e.target.value) })
                    }
                    aria-label={`Fencer count for ${label}`}
                  />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
