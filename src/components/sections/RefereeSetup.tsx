import { useStore } from '../../store/store.ts'

const INLINE_INPUT = 'w-20 rounded-md border border-slate-200 px-2 py-0.5 text-right text-body focus:ring-2 focus:ring-accent focus:outline-none'

export function RefereeSetup() {
  const daysAvailable = useStore((s) => s.days_available)
  const dayRefs = useStore((s) => s.dayRefs)
  const setDayRefs = useStore((s) => s.setDayRefs)
  const toggleSabreFillin = useStore((s) => s.toggleSabreFillin)
  const suggestAllRefs = useStore((s) => s.suggestAllRefs)

  if (daysAvailable === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-header">Referee Setup</h2>
        <p className="text-sm text-muted">Set tournament days above to configure referees.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-card p-3 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-header">Referee Setup</h2>
        <div className="group relative">
          <button
            type="button"
            onClick={suggestAllRefs}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none"
          >
            Suggest
          </button>
          <div className="pointer-events-none absolute right-0 top-full z-10 mt-1 hidden w-64 rounded-md border border-slate-200 bg-card p-2 text-xs text-body shadow-md group-hover:block">
            Estimates referee counts based on selected competitions, strip count, and weapon mix. One ref per strip in use, split proportionally between sabre and foil/epee.
          </div>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs text-muted">
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
              <tr key={i} className="border-b border-slate-100 even:bg-slate-50">
                <td className="py-1.5 text-body">Day {i + 1}</td>
                <td className="py-1.5 text-right">
                  <input
                    type="number"
                    min={0}
                    className={INLINE_INPUT}
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
                    className={INLINE_INPUT}
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
                    className="accent-accent"
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
