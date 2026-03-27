import { useStore } from '../store/store.ts'
import { buildTournamentConfig } from '../store/buildConfig.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { BottleneckCause, BottleneckSeverity } from '../engine/types.ts'
import { ScheduleOutput } from './sections/ScheduleOutput.tsx'
import { SaveLoadShare } from './sections/SaveLoadShare.tsx'

export function ScheduleView() {
  const scheduleStale = useStore((s) => s.scheduleStale)

  function handleRegenerate() {
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)

    try {
      const result = scheduleAll(competitions, config)
      state.setScheduleResults(result.schedule, result.bottlenecks)
      state.clearStale()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      state.setScheduleResults({}, [
        {
          competition_id: '',
          phase: 'SCHEDULE',
          cause: BottleneckCause.STRIP_CONTENTION,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `Scheduling failed: ${message}`,
        },
      ])
    }
  }

  return (
    <div className="space-y-4">
      {scheduleStale && (
        <div className="rounded-md border border-amber-200 bg-warning px-4 py-3 text-sm text-warning-text">
          Results are outdated. Go back to adjust inputs or click Regenerate.
        </div>
      )}

      <ScheduleOutput />
      <SaveLoadShare />

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleRegenerate}
          className="rounded-md bg-success px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-success-hover focus:ring-2 focus:ring-success focus:ring-offset-2 focus:outline-none"
        >
          Regenerate
        </button>
      </div>
    </div>
  )
}
