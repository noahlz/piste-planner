import { useStore } from '../../store/store.ts'

export function RefereeSetup() {
  const daysAvailable = useStore((s) => s.days_available)
  const dayRefs = useStore((s) => s.dayRefs)
  const setDayRefs = useStore((s) => s.setDayRefs)
  const toggleSabreFillin = useStore((s) => s.toggleSabreFillin)

  if (daysAvailable === 0) {
    return (
      <div className="rounded border border-border bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Referee Setup</h2>
        <p className="text-sm text-slate-400">Set tournament days above to configure referees.</p>
      </div>
    )
  }

  return (
    <div className="rounded border border-border bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Referee Setup</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-slate-500">
            <th className="pb-2 text-left font-medium">Day</th>
            <th className="pb-2 text-right font-medium">Foil/Epee Refs</th>
            <th className="pb-2 text-right font-medium">Sabre Refs</th>
            <th className="pb-2 text-center font-medium">Sabre Fill-in</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: daysAvailable }, (_, i) => {
            const ref = dayRefs[i] ?? {
              foil_epee_refs: 0,
              sabre_refs: 0,
              allow_sabre_ref_fillin: false,
            }
            return (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-1.5 text-slate-600">Day {i + 1}</td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded border border-border px-2 py-0.5 text-right"
                    value={ref.foil_epee_refs}
                    onChange={(e) =>
                      setDayRefs(i, { foil_epee_refs: Number(e.target.value) })
                    }
                    aria-label={`Foil/Epee refs for Day ${i + 1}`}
                  />
                </td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded border border-border px-2 py-0.5 text-right"
                    value={ref.sabre_refs}
                    onChange={(e) =>
                      setDayRefs(i, { sabre_refs: Number(e.target.value) })
                    }
                    aria-label={`Sabre refs for Day ${i + 1}`}
                  />
                </td>
                <td className="py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={ref.allow_sabre_ref_fillin}
                    onChange={() => toggleSabreFillin(i)}
                    aria-label={`Sabre fill-in for Day ${i + 1}`}
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
