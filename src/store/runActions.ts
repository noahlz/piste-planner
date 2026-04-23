import { useStore, type StoreState } from './store.ts'
import { buildTournamentConfig } from './buildConfig.ts'
import { validateConfig } from '../engine/validation.ts'
import { initialAnalysis } from '../engine/analysis.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { BottleneckCause, BottleneckSeverity, Phase } from '../engine/types.ts'

export function runValidateAndAnalyze(state: StoreState = useStore.getState()): void {
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

export function runScheduleAll(state: StoreState = useStore.getState()): void {
  const { config, competitions } = buildTournamentConfig(state)

  try {
    const result = scheduleAll(competitions, config)
    state.setScheduleResults(result.schedule, result.bottlenecks, result.ref_requirements_by_day ?? [])
    state.clearStale()
  } catch (err) {
    // Surface scheduling errors as a single ERROR-level validation message
    const message = err instanceof Error ? err.message : String(err)
    state.setScheduleResults(
      {},
      [
        {
          competition_id: '',
          phase: Phase.SCHEDULING,
          cause: BottleneckCause.STRIP_CONTENTION,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `Scheduling failed: ${message}`,
        },
      ],
      [],
    )
  }
}
