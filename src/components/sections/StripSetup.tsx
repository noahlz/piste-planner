import { useEffect, useRef, useState } from 'react'
import { useStore } from '../../store/store.ts'
import { resolveVideoStrips } from '../../store/typeDefaults.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { NumberInput } from '@/components/ui/number-input'
import { Lightbulb } from 'lucide-react'

// 012 T013 (research.md D5, FR-008): the search yields to the browser between
// candidates, so a real press takes 199-229ms on the largest template and well
// under 100ms on every other one (baseline.md §5 — the widest non-largest
// figure measured is 63.89ms, on ROC Mega). 100ms is the point at which the
// indicator is visible on the largest board for roughly a hundred
// milliseconds and never appears on a board that finishes in an instant
// (SC-007's second clause). Raising it toward 200ms would let the largest
// board's own search finish before the indicator could ever show.
export const SUGGEST_INDICATOR_DELAY_MS = 100

export function StripSetup() {
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const tournamentType = useStore((s) => s.tournament_type)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)
  const suggestStripsFn = useStore((s) => s.suggestStrips)

  const [pending, setPending] = useState(false)
  const [showIndicator, setShowIndicator] = useState(false)
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel a pending reveal if the component unmounts mid-search — never lets
  // the timer fire setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (revealTimer.current !== null) clearTimeout(revealTimer.current)
    }
  }, [])

  async function runSuggest(): Promise<void> {
    setPending(true)
    revealTimer.current = setTimeout(() => setShowIndicator(true), SUGGEST_INDICATOR_DELAY_MS)
    try {
      await suggestStripsFn()
    } finally {
      if (revealTimer.current !== null) clearTimeout(revealTimer.current)
      setPending(false)
      setShowIndicator(false)
    }
  }

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center justify-between bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Strips</CardTitle>
        <div className="flex items-center gap-2">
          {showIndicator && (
            <span role="status" className="text-xs text-muted-foreground">
              Searching for the smallest strip count that places every event…
            </span>
          )}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => void runSuggest()}
                  disabled={pending}
                >
                  <Lightbulb className="mr-1.5 h-4 w-4" />
                  Suggest
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="w-64 text-xs">
                Finds the smallest number of strips that places every event on the board.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
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
