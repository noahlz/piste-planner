import { useStore } from '../../store/store.ts'
import { TournamentType } from '../../engine/types.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { CircleHelp } from 'lucide-react'

// 6:00 AM (360) through 11:00 PM (1380) in 30-minute increments
const TIME_OPTIONS: number[] = Array.from({ length: 35 }, (_, i) => 360 + i * 30)

function formatTime(mins: number): string {
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  [TournamentType.NAC]: 'NAC',
  [TournamentType.RYC]: 'RYC',
  [TournamentType.RJCC]: 'RJCC',
  [TournamentType.ROC]: 'ROC',
  [TournamentType.SYC]: 'SYC',
  [TournamentType.SJCC]: 'SJCC',
}

const TOURNAMENT_TYPES = Object.values(TournamentType)

function HelpTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <CircleHelp className="inline h-3.5 w-3.5 text-muted-foreground cursor-help" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export function TournamentSetup() {
  const tournamentType = useStore((s) => s.tournament_type)
  const setTournamentType = useStore((s) => s.setTournamentType)
  const daysAvailable = useStore((s) => s.days_available)
  const setDays = useStore((s) => s.setDays)
  const dayConfigs = useStore((s) => s.dayConfigs)
  const updateDayConfig = useStore((s) => s.updateDayConfig)
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)
  const videoStripsTotal = useStore((s) => s.video_strips_total)
  const setVideoStrips = useStore((s) => s.setVideoStrips)

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Tournament Setup</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 pb-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="space-y-1">
            <Label htmlFor="tournament-type" className="flex items-center gap-1 text-xs">
              Tournament Type
              <HelpTip text="The type of USA Fencing tournament determines scheduling constraints like mandatory same-day pairings and rest-day requirements." />
            </Label>
            <Select
              value={tournamentType}
              onValueChange={(value: string) => setTournamentType(value as TournamentType)}
            >
              <SelectTrigger id="tournament-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOURNAMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {TOURNAMENT_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="days-available" className="flex items-center gap-1 text-xs">
              Tournament Length (Days)
              <HelpTip text="Number of competition days (2–4). Events will be distributed across these days." />
            </Label>
            <Input
              id="days-available"
              type="number"
              min={2}
              max={4}
              value={daysAvailable}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 2 && v <= 4) setDays(v)
              }}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="strips-total" className="flex items-center gap-1 text-xs">
              # of Strips
              <HelpTip text="Total number of fencing strips available at the venue. Determines how many bouts can run simultaneously." />
            </Label>
            <Input
              id="strips-total"
              type="number"
              min={0}
              value={stripsTotal}
              onChange={(e) => setStrips(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="video-strips" className="flex items-center gap-1 text-xs">
              # with Video
              <HelpTip text="Number of strips equipped with video replay. Events with video requirements will be scheduled on these strips." />
            </Label>
            <Input
              id="video-strips"
              type="number"
              min={0}
              value={videoStripsTotal}
              onChange={(e) => setVideoStrips(Number(e.target.value))}
            />
          </div>
        </div>

        {dayConfigs.length > 0 && (
          <div className="mt-3">
            <h3 className="mb-1.5 text-xs font-semibold text-card-foreground">Day Schedule</h3>
            <div className="space-y-1.5">
              {dayConfigs.map((dc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-14 text-xs font-medium text-foreground">Day {i + 1}</span>
                  <Label className="text-xs text-muted-foreground" htmlFor={`day-${i}-start`}>
                    Start
                  </Label>
                  <Select
                    value={String(dc.day_start_time)}
                    onValueChange={(v: string) =>
                      updateDayConfig(i, { day_start_time: Number(v) })
                    }
                  >
                    <SelectTrigger id={`day-${i}-start`} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={String(t)}>
                          {formatTime(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Label className="text-xs text-muted-foreground" htmlFor={`day-${i}-end`}>
                    End
                  </Label>
                  <Select
                    value={String(dc.day_end_time)}
                    onValueChange={(v: string) =>
                      updateDayConfig(i, { day_end_time: Number(v) })
                    }
                  >
                    <SelectTrigger id={`day-${i}-end`} className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_OPTIONS.map((t) => (
                        <SelectItem key={t} value={String(t)}>
                          {formatTime(t)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
