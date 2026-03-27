import { useStore } from '../../store/store.ts'
import { buildTournamentConfig } from '../../store/buildConfig.ts'
import { validateConfig } from '../../engine/validation.ts'
import { initialAnalysis } from '../../engine/analysis.ts'
import { scheduleAll } from '../../engine/scheduler.ts'
import { BottleneckCause, BottleneckSeverity } from '../../engine/types.ts'

export function ActionButtons() {
  const validationErrors = useStore((s) => s.validationErrors)

  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  function handleValidate() {
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const errors = validateConfig(config, competitions)

    // Round-robin day assignments for initial analysis
    const dayAssignments: Record<string, number> = {}
    competitions.forEach((c, i) => {
      dayAssignments[c.id] = i % config.days_available
    })

    const analysisResult = initialAnalysis(config, competitions, dayAssignments)
    state.setAnalysisResults(errors, analysisResult)
  }

  function handleSchedule() {
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)

    try {
      const result = scheduleAll(competitions, config)
      state.setScheduleResults(result.schedule, result.bottlenecks)
      state.clearStale()
    } catch (err) {
      // Surface scheduling errors as a single ERROR-level validation message
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
    <div className="rounded-lg border border-slate-200 bg-card p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-header">Actions</h2>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleValidate}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:outline-none"
        >
          Validate
        </button>
        <button
          type="button"
          onClick={handleSchedule}
          disabled={hasHardErrors}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          Generate Schedule
        </button>
      </div>
    </div>
  )
}
