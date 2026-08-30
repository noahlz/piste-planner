import { useStore } from '../../store/store.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from '../competitionLabels.ts'

/**
 * Every selected competition with no placement, docked above the center
 * (FR-005, S2-contract.md §Unplaced tray). Stays in the DOM with its heading
 * whether or not anything is unplaced, so the region is identifiable empty.
 */
export function UnplacedTray() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const placements = useStore((s) => s.placements)

  const unplacedIds = Object.keys(selectedCompetitions)
    .filter((id) => !(id in placements))
    .sort()

  return (
    <section aria-label="Unplaced events" className="shrink-0 border-b bg-background px-4 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Unplaced events
      </h2>
      {unplacedIds.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Every event is placed.</p>
      ) : (
        <ul className="mt-1 flex flex-wrap gap-2">
          {unplacedIds.map((id) => {
            const entry = findCompetition(id)
            const label = entry ? competitionLabel(entry) : id
            return (
              <li
                key={id}
                className="rounded-md border border-input bg-muted px-2 py-0.5 text-xs text-foreground"
              >
                {label}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
