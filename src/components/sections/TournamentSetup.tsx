import { useStore } from '../../store/store.ts'
import { TournamentType, PodCaptainOverride } from '../../engine/types.ts'

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
    <div className="rounded border border-border bg-white p-4">
      <h2 className="mb-4 text-lg font-semibold text-slate-800">Tournament Setup</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="tournament-type">
            Tournament Type
          </label>
          <select
            id="tournament-type"
            className="mt-1 w-full rounded border border-border px-2 py-1"
            value={tournamentType}
            onChange={(e) => setTournamentType(e.target.value as TournamentType)}
          >
            {TOURNAMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="days-available">
            Days Available
          </label>
          <input
            id="days-available"
            type="number"
            min={2}
            max={4}
            className="mt-1 w-full rounded border border-border px-2 py-1"
            value={daysAvailable}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v >= 2 && v <= 4) setDays(v)
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="strips-total">
            Strip Count
          </label>
          <input
            id="strips-total"
            type="number"
            min={0}
            className="mt-1 w-full rounded border border-border px-2 py-1"
            value={stripsTotal}
            onChange={(e) => setStrips(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="video-strips">
            Video Strip Count
          </label>
          <input
            id="video-strips"
            type="number"
            min={0}
            className="mt-1 w-full rounded border border-border px-2 py-1"
            value={videoStripsTotal}
            onChange={(e) => setVideoStrips(Number(e.target.value))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="pod-captain">
            Pod Captain Override
          </label>
          <select
            id="pod-captain"
            className="mt-1 w-full rounded border border-border px-2 py-1"
            value={podCaptainOverride}
            onChange={(e) => setPodCaptainOverride(e.target.value as PodCaptainOverride)}
          >
            {POD_CAPTAIN_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {dayConfigs.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Day Schedule</h3>
          <div className="space-y-2">
            {dayConfigs.map((dc, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="w-14 text-sm font-medium text-slate-600">Day {i + 1}</span>
                <label className="text-xs text-slate-500" htmlFor={`day-${i}-start`}>
                  Start
                </label>
                <select
                  id={`day-${i}-start`}
                  className="rounded border border-border px-2 py-1 text-sm"
                  value={dc.day_start_time}
                  onChange={(e) =>
                    updateDayConfig(i, { day_start_time: Number(e.target.value) })
                  }
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
                <label className="text-xs text-slate-500" htmlFor={`day-${i}-end`}>
                  End
                </label>
                <select
                  id={`day-${i}-end`}
                  className="rounded border border-border px-2 py-1 text-sm"
                  value={dc.day_end_time}
                  onChange={(e) =>
                    updateDayConfig(i, { day_end_time: Number(e.target.value) })
                  }
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {formatTime(t)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
