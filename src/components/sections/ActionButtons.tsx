import { ShieldCheck, Play } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '../../store/store.ts'
import { buildTournamentConfig } from '../../store/buildConfig.ts'
import { validateConfig } from '../../engine/validation.ts'
import { initialAnalysis } from '../../engine/analysis.ts'
import { scheduleAll } from '../../engine/scheduler.ts'
import { BottleneckCause, BottleneckSeverity, Phase } from '../../engine/types.ts'

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
          phase: Phase.SCHEDULING,
          cause: BottleneckCause.STRIP_CONTENTION,
          severity: BottleneckSeverity.ERROR,
          delay_mins: 0,
          message: `Scheduling failed: ${message}`,
        },
      ])
    }
  }

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Button variant="default" onClick={handleValidate}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Validate
        </Button>
        <Button variant="success" onClick={handleSchedule} disabled={hasHardErrors}>
          <Play className="mr-2 h-4 w-4" />
          Generate Schedule
        </Button>
      </CardContent>
    </Card>
  )
}
