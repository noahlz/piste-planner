import { useStore } from '../../store/store.ts'
import { PodCaptainOverride } from '../../engine/types.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NumberInput } from '@/components/ui/number-input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Lightbulb, CircleHelp } from 'lucide-react'

const POD_CAPTAIN_LABELS: Record<PodCaptainOverride, string> = {
  [PodCaptainOverride.AUTO]: 'Auto',
  [PodCaptainOverride.DISABLED]: 'Disabled',
  [PodCaptainOverride.FORCE_4]: 'Force 4-person pods',
}

const POD_CAPTAIN_OPTIONS = Object.values(PodCaptainOverride)

export function RefereeSetup() {
  const daysAvailable = useStore((s) => s.days_available)
  const dayRefs = useStore((s) => s.dayRefs)
  const optimalRefs = useStore((s) => s.optimalRefs)
  const setDayRefs = useStore((s) => s.setDayRefs)
  const suggestAllRefs = useStore((s) => s.suggestAllRefs)
  const podCaptainOverride = useStore((s) => s.pod_captain_override)
  const setPodCaptainOverride = useStore((s) => s.setPodCaptainOverride)

  // Pre-compute per-day deficits for row styling
  const deficits = Array.from({ length: daysAvailable }, (_, i) => {
    const ref = dayRefs[i] ?? { foil_epee_refs: 0, saber_refs: 0 }
    const optimal = optimalRefs[i]
    return {
      fe: optimal != null && ref.foil_epee_refs < optimal.foil_epee_refs,
      saber: optimal != null && ref.saber_refs < optimal.saber_refs,
    }
  })

  if (daysAvailable === 0) {
    return (
      <Card className="pt-0 gap-0">
        <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
          <CardTitle>Referee Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Set tournament days above to configure referees.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Referee Setup</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="default" size="sm" onClick={suggestAllRefs}>
                <Lightbulb className="mr-1.5 h-4 w-4" />
                Suggest
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-64 text-xs">
              Estimates referee counts based on selected competitions, strip count, and weapon mix. One ref per strip in use, split proportionally between saber and foil/epee.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              <TableHead className="text-right">Foil/Epee Refs</TableHead>
              <TableHead className="text-right">Saber Refs</TableHead>
              {optimalRefs.length > 0 && (
                <>
                  <TableHead className="text-right font-medium">Optimal F/E</TableHead>
                  <TableHead className="text-right font-medium">Optimal S</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: daysAvailable }, (_, i) => {
              const ref = dayRefs[i] ?? {
                foil_epee_refs: 0,
                saber_refs: 0,
              }
              const optimal = optimalRefs[i]
              const deficitWarning = 'bg-amber-100 dark:bg-amber-900/30 rounded border-l-2 border-amber-500'
              return (
                <TableRow key={i}>
                  <TableCell>Day {i + 1}</TableCell>
                  <TableCell className={`text-right ${deficits[i].fe ? deficitWarning : ''}`}>
                    <NumberInput
                      value={ref.foil_epee_refs}
                      onChange={(v) => setDayRefs(i, { foil_epee_refs: v })}
                      min={0}
                      aria-label={`Foil/Epee refs for Day ${i + 1}`}
                    />
                  </TableCell>
                  <TableCell className={`text-right ${deficits[i].saber ? deficitWarning : ''}`}>
                    <NumberInput
                      value={ref.saber_refs}
                      onChange={(v) => setDayRefs(i, { saber_refs: v })}
                      min={0}
                      aria-label={`Saber refs for Day ${i + 1}`}
                    />
                  </TableCell>
                  {optimalRefs.length > 0 && (
                    <>
                      <TableCell className="py-1.5 text-right text-muted-foreground text-xs tabular-nums">
                        {optimal?.foil_epee_refs ?? '—'}
                      </TableCell>
                      <TableCell className="py-1.5 text-right text-muted-foreground text-xs tabular-nums">
                        {optimal?.saber_refs ?? '—'}
                      </TableCell>
                    </>
                  )}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="mt-3 max-w-xs space-y-1">
          <Label htmlFor="pod-captain" className="flex items-center gap-1 text-xs">
            Pod Captain Override
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CircleHelp className="inline h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  Controls whether DE phases use a dedicated pod captain to assign bouts on a group of 4 or 8 strips. Does not apply to the final rounds (round of 16 onward). Auto decides based on bracket size.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Select
            value={podCaptainOverride}
            onValueChange={(value: string) => setPodCaptainOverride(value as PodCaptainOverride)}
          >
            <SelectTrigger id="pod-captain">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {POD_CAPTAIN_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {POD_CAPTAIN_LABELS[opt]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  )
}
