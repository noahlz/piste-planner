import { useStore } from '../../store/store.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Lightbulb } from 'lucide-react'

export function RefereeSetup() {
  const daysAvailable = useStore((s) => s.days_available)
  const dayRefs = useStore((s) => s.dayRefs)
  const setDayRefs = useStore((s) => s.setDayRefs)
  const toggleSabreFillin = useStore((s) => s.toggleSabreFillin)
  const suggestAllRefs = useStore((s) => s.suggestAllRefs)

  if (daysAvailable === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Referee Setup</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Set tournament days above to configure referees.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
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
              Estimates referee counts based on selected competitions, strip count, and weapon mix. One ref per strip in use, split proportionally between sabre and foil/epee.
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
              <TableHead className="text-right">Sabre Refs</TableHead>
              <TableHead className="text-center">Sabre Fill-in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: daysAvailable }, (_, i) => {
              const ref = dayRefs[i] ?? {
                foil_epee_refs: 0,
                sabre_refs: 0,
                allow_sabre_ref_fillin: false,
              }
              return (
                <TableRow key={i}>
                  <TableCell>Day {i + 1}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      className="ml-auto w-20 text-right"
                      value={ref.foil_epee_refs}
                      onChange={(e) =>
                        setDayRefs(i, { foil_epee_refs: Number(e.target.value) })
                      }
                      aria-label={`Foil/Epee refs for Day ${i + 1}`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min={0}
                      className="ml-auto w-20 text-right"
                      value={ref.sabre_refs}
                      onChange={(e) =>
                        setDayRefs(i, { sabre_refs: Number(e.target.value) })
                      }
                      aria-label={`Sabre refs for Day ${i + 1}`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={ref.allow_sabre_ref_fillin}
                      onCheckedChange={() => toggleSabreFillin(i)}
                      aria-label={`Sabre fill-in for Day ${i + 1}`}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
