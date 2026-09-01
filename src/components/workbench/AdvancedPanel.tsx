import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { useStore } from '../../store/store.ts'
import { TYPE_DEFAULTS } from '../../store/typeDefaults.ts'
import { findCompetition } from '../../engine/catalogue.ts'
import { RefPolicy } from '../../engine/types.ts'
import { competitionLabel } from '../competitionLabels.ts'
import { DE_MODE_LABELS } from '../deModeLabels.ts'
import { DefaultLabel } from '../common/DefaultLabel.tsx'

/** Referees per pool for a resolved policy — the same single branch the engine
 *  scales its demand by (`peakPoolRefDemand`, src/engine/refs.ts:22). */
function refereesPerPool(policy: RefPolicy): number {
  return policy === RefPolicy.ONE ? 1 : 2
}

/**
 * The rail's Advanced panel: the three settings a tournament type defaults for
 * its events (FR-031), and the per-event referee override that departs from one
 * (FR-039).
 *
 * It owns its own `Collapsible` rather than sitting inside `RailPanel`, because
 * `RailPanel` unmounts its `CollapsibleContent` on close and FR-035 needs the
 * applied defaults readable while the panel is collapsed. The summary below is
 * therefore a sibling of the trigger, outside `CollapsibleContent`.
 *
 * Only referees are editable here. DE mode's control already lives in
 * `CompetitionOverrides` and the video strip count in `StripSetup` — a second
 * control for either would give two elements the same accessible name whenever
 * both panels mount. FR-040 keeps handbook policy out entirely: the regional cut
 * override wins over the organizer rather than losing to them, so it is not a
 * default and has no control in this panel.
 */
export function AdvancedPanel() {
  const [open, setOpen] = useState(false)
  const tournamentType = useStore((s) => s.tournament_type)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const selectedCompetitions = useStore((s) => s.selectedCompetitions)
  const updateCompetition = useStore((s) => s.updateCompetition)

  const typeDefaults = TYPE_DEFAULTS[tournamentType]
  const defaultReferees = refereesPerPool(typeDefaults.ref_policy)
  // The resolution `buildConfig.ts:60` performs: a null count follows the type,
  // and any number, 0 included, is the organizer's own.
  const videoStrips = videoStripsTotal ?? typeDefaults.video_strips_total

  const refPolicyOptions: { value: RefPolicy; label: string }[] = [
    { value: RefPolicy.AUTO, label: `Auto (${defaultReferees})` },
    { value: RefPolicy.ONE, label: '1 referee' },
    { value: RefPolicy.TWO, label: '2 referees' },
  ]

  const sortedIds = Object.keys(selectedCompetitions).sort()

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-b">
      <CollapsibleTrigger asChild>
        {/* Same trigger shape as `RailPanel`'s, repeated rather than shared:
            this panel cannot be a RailPanel child (see above). */}
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm font-semibold text-foreground hover:bg-foreground/5"
        >
          <ChevronRight
            className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open && 'rotate-90')}
          />
          Advanced
        </button>
      </CollapsibleTrigger>

      {/* FR-035 — dim, and outside CollapsibleContent so closing the panel does
          not unmount it. */}
      <div className="flex flex-col gap-0.5 pb-2 pl-8 pr-3 text-xs text-muted-foreground">
        <span>Referees per pool: {defaultReferees}</span>
        <span>Video strips: {videoStrips}</span>
        <span>DE mode: {DE_MODE_LABELS[typeDefaults.de_mode]}</span>
      </div>

      <CollapsibleContent className="px-3 pb-3">
        <p className="mb-2 text-xs text-muted-foreground">
          An event follows the type's referee count until it is set here. DE mode is set per
          event under Per-event overrides, and the video strip count under Strips.
        </p>
        {sortedIds.length === 0 ? (
          <p className="text-xs text-muted-foreground">No events selected.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Referees per pool</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedIds.map((id) => {
                const entry = findCompetition(id)
                const label = entry ? competitionLabel(entry) : id
                const config = selectedCompetitions[id]
                // FR-039 — the stored AUTO is the marker, never a comparison of
                // the resolved count against the default (data-model.md
                // §Settings override state). An event explicitly set to TWO at a
                // NAC resolves to the same 2 an unset event does, and only the
                // stored value tells them apart.
                const followsTypeDefault = config.ref_policy === RefPolicy.AUTO

                return (
                  <TableRow key={id}>
                    <TableCell className="text-foreground">{label}</TableCell>
                    <TableCell>
                      <Select
                        value={config.ref_policy}
                        onValueChange={(value) =>
                          updateCompetition(id, { ref_policy: value as RefPolicy })
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]" aria-label={`Referees for ${label}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {refPolicyOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <DefaultLabel isDefault={followsTypeDefault} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}
