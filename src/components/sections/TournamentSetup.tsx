import { useStore } from '../../store/store.ts'
import { TournamentType, PodCaptainOverride } from '../../engine/types.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// 6:00 AM (360) through 11:00 PM (1380) in 30-minute increments
const TIME_OPTIONS: number[] = Array.from({ length: 35 }, (_, i) => 360 + i * 30)

function formatTime(mins: number): string {
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

const TOURNAMENT_TYPES = Object.values(TournamentType)
const POD_CAPTAIN_OPTIONS = Object.values(PodCaptainOverride)

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
  const podCaptainOverride = useStore((s) => s.pod_captain_override)
  const setPodCaptainOverride = useStore((s) => s.setPodCaptainOverride)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tournament Setup</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="tournament-type">Tournament Type</Label>
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
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="days-available">Days Available</Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="strips-total">Strip Count</Label>
            <Input
              id="strips-total"
              type="number"
              min={0}
              value={stripsTotal}
              onChange={(e) => setStrips(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="video-strips">Video Strip Count</Label>
            <Input
              id="video-strips"
              type="number"
              min={0}
              value={videoStripsTotal}
              onChange={(e) => setVideoStrips(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pod-captain">Pod Captain Override</Label>
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
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {dayConfigs.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold text-card-foreground">Day Schedule</h3>
            <div className="space-y-2">
              {dayConfigs.map((dc, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-14 text-sm font-medium text-foreground">Day {i + 1}</span>
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
