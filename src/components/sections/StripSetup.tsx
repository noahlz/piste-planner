import { useStore } from '../../store/store.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NumberInput } from '@/components/ui/number-input'
import { Lightbulb } from 'lucide-react'

export function StripSetup() {
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)
  const includeFinalsStrip = useStore((s) => s.include_finals_strip)
  const setIncludeFinalsStrip = useStore((s) => s.setIncludeFinalsStrip)
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
              value={videoStripsTotal}
              onChange={setVideoStrips}
              min={0}
              max={stripsTotal}
              aria-label="Number of video strips"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="finals-strip"
              checked={includeFinalsStrip}
              onCheckedChange={(checked) => setIncludeFinalsStrip(checked === true)}
            />
            <Label htmlFor="finals-strip" className="text-xs cursor-pointer">
              Include Finals Strip
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
