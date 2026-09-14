import { Check, GripVertical } from 'lucide-react'
import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule } from '../../store/derived.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { competitionLabel } from '../../lib/competitionLabels.ts'
import { estimateEventFootprint } from '../../engine/derive.ts'
import { formatMinutes } from '../../lib/time.ts'
import { Weapon } from '../../engine/types.ts'
import type { Competition, TournamentConfig } from '../../engine/types.ts'
import { cn } from '@/lib/utils'

// Weapon-tinted chip tokens (docs/design/mockup/, standing rule 13). A chip
// whose id has no catalogue entry (shouldn't happen, but the dock reads
// `entry?.weapon`) falls back to the neutral ramp rather than guessing a
// weapon.
const WEAPON_CHIP_TOKENS: Record<Weapon, string> = {
  [Weapon.FOIL]: 'border-weapon-foil-edge bg-weapon-foil-fill text-weapon-foil-ink',
  [Weapon.EPEE]: 'border-weapon-epee-edge bg-weapon-epee-fill text-weapon-epee-ink',
  [Weapon.SABRE]: 'border-weapon-sabre-edge bg-weapon-sabre-fill text-weapon-sabre-ink',
}
const NEUTRAL_CHIP_TOKENS = 'border-neutral-400 bg-neutral-200 text-foreground'

/**
 * Every selected competition with no placement, docked above the center
 * (FR-010, FR-011, ui-contract.md §Unplaced dock). Each chip is a button
 * whose click selects the event (013 T029), carrying the event's label and its
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
  const selectCompetition = useStore((s) => s.selectCompetition)
  const { config, competitions } = useStore(selectDerivedSchedule)

  const unplacedIds = Object.keys(selectedCompetitions)
    .filter((id) => !(id in placements))
    .sort()

  return (
    <section
      aria-label="Unplaced events"
      className="print-hidden flex max-h-16 min-h-8 shrink-0 items-start gap-2.5 overflow-y-auto border-b-[1.5px] border-chrome-border bg-chrome px-3.5 py-[5px]"
    >
      <h2 className="shrink-0 text-[11px] font-semibold tracking-[.06em] whitespace-nowrap text-neutral-600 uppercase">
        Unplaced events
      </h2>
      {unplacedIds.length === 0 ? (
        <p className="flex min-w-0 items-center gap-[7px] overflow-hidden text-[11.5px] whitespace-nowrap text-ellipsis text-neutral-600">
          <Check aria-hidden="true" className="h-[13px] w-[13px] shrink-0 text-ok" strokeWidth={2} />
          Every event has a slot.
        </p>
      ) : (
        <>
          {lastAutoRun !== null && (
            <p className="flex min-w-0 items-center gap-[7px] overflow-hidden text-[11.5px] whitespace-nowrap text-ellipsis text-neutral-600">
              <Check aria-hidden="true" className="h-[13px] w-[13px] shrink-0 text-ok" strokeWidth={2} />
              {`Placed ${lastAutoRun.placed} events, ${lastAutoRun.unplaced} could not be placed.`}
            </p>
          )}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {unplacedIds.map((id) => {
              const entry = findCompetition(id)
              const label = entry ? competitionLabel(entry) : id
              const need = footprintNeed(id, competitions, config)
              const chipTokens = entry ? WEAPON_CHIP_TOKENS[entry.weapon] : NEUTRAL_CHIP_TOKENS
              return (
                <button
                  key={id}
                  type="button"
                  data-unplaced-chip
                  data-event-id={id}
                  data-weapon={entry?.weapon}
                  onClick={() => selectCompetition(id)}
                  className={cn(
                    'inline-flex h-[26px] shrink-0 items-center gap-[7px] rounded-full border-[1.5px] px-[11px] text-[11.5px] font-semibold whitespace-nowrap',
                    chipTokens,
                  )}
                >
                  <GripVertical aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 max-w-[200px] overflow-hidden text-ellipsis">{label}</span>
                  {need !== null && (
                    <span className="font-mono text-[10px] font-semibold opacity-[.62]">{need}</span>
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
