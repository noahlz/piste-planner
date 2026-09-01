import { useStore } from '../../store/store.ts'
import { resolveVideoStrips } from '../../store/typeDefaults.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NumberInput } from '@/components/ui/number-input'
import { Lightbulb } from 'lucide-react'

export function StripSetup() {
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const tournamentType = useStore((s) => s.tournament_type)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)
  const suggestStripsFn = useStore((s) => s.suggestStrips)

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Strips</CardTitle>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="default" size="sm" onClick={suggestStripsFn}>
                <Lightbulb className="mr-1.5 h-4 w-4" />
                Suggest
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="w-64 text-xs">
              Suggests enough strips to run all pools of the largest competition in a single flight.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pt-3 pb-3">
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-1">
            <Label className="text-xs"># of Strips</Label>
            <NumberInput
              value={stripsTotal}
              onChange={setStrips}
              min={0}
              aria-label="Number of strips"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs"># with Video</Label>
            <NumberInput
              // `NumberInput` has no unset state, so an unresolved `null` shows
              // as the count the type resolves to and the first edit commits it
              // as the organizer's own. This field does not distinguish unset
              // from explicit — the `Default` marker and the way back to `null`
              // are the Advanced panel's (T065, T068). What it must not do is
              // show a different number from the one the panel a few rows up
              // states and the engine schedules, which is why the resolution is
              // `resolveVideoStrips` and not a local `?? 0`.
              value={resolveVideoStrips(videoStripsTotal, tournamentType)}
              onChange={setVideoStrips}
              min={0}
              max={stripsTotal}
              aria-label="Number of video strips"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
