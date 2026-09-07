import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule } from '../../store/derived.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from '../competitionLabels.ts'
import { estimateEventFootprint } from '../../engine/derive.ts'
import { formatMinutes } from '../../lib/time.ts'
import type { Competition, TournamentConfig } from '../../engine/types.ts'

/**
 * Every selected competition with no placement, docked above the center
 * (FR-010, FR-011, ui-contract.md §Unplaced dock). Each chip is a button —
 * T030 wires its click to selection — carrying the event's label and its
 * estimated footprint from `estimateEventFootprint`, the same helper the
 * canvas block's placed geometry derives from (research D10, D17), so the
 * chip's need and a placed block's geometry never disagree.
 *
 * Stays in the DOM with its heading whether or not anything is unplaced, so
 * the region is identifiable empty.
 */
export function UnplacedDock() {
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const placements = useStore((s) => s.placements)
  const lastAutoRun = useStore((s) => s.lastAutoRun)
  const { config, competitions } = useStore(selectDerivedSchedule)

  const unplacedIds = Object.keys(selectedCompetitions)
    .filter((id) => !(id in placements))
    .sort()

  return (
    <section aria-label="Unplaced events" className="shrink-0 border-b bg-background px-4 py-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Unplaced events
      </h2>
      {unplacedIds.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Every event has a slot.</p>
      ) : (
        <>
          {lastAutoRun !== null && (
            <p className="mt-1 text-sm text-muted-foreground">
              {`Placed ${lastAutoRun.placed} events, ${lastAutoRun.unplaced} could not be placed.`}
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {unplacedIds.map((id) => {
              const entry = findCompetition(id)
              const label = entry ? competitionLabel(entry) : id
              const need = footprintNeed(id, competitions, config)
              return (
                <button
                  key={id}
                  type="button"
                  data-unplaced-chip
                  data-event-id={id}
                  data-weapon={entry?.weapon}
                  className="flex flex-col items-start rounded-md border border-input bg-muted px-2 py-1 text-left text-xs text-foreground hover:bg-accent"
                >
                  <span>{label}</span>
                  {need !== null && (
                    <span className="text-[10px] text-muted-foreground">{need}</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

/**
 * `estimateEventFootprint` throws for `fencer_count <= 1` — `computePoolStructure`
 * can't form a pool of one — so a chip for such an event renders its label
 * without a need rather than the dock being the thing that throws. The
 * Events panel gets a minimum in phase 2; the error boundary is the backstop
 * elsewhere in the meantime.
 */
function footprintNeed(
  id: string,
  competitions: Competition[],
  config: TournamentConfig,
): string | null {
  const competition = competitions.find((c) => c.id === id)
  if (!competition || competition.fencer_count < 2) return null
  const footprint = estimateEventFootprint(competition, config)
  return `${footprint.strips} strips · ${formatMinutes(footprint.poolMinutes)} · DE ${formatMinutes(footprint.deMinutes)}`
}
