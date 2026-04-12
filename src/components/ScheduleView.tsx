import { useStore } from '../store/store.ts'
import { buildTournamentConfig } from '../store/buildConfig.ts'
import { scheduleAll } from '../engine/scheduler.ts'
import { BottleneckCause, BottleneckSeverity, Phase } from '../engine/types.ts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
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
    <div className="space-y-4">
      {scheduleStale && (
        <Alert className="border-amber-200 bg-warning text-warning-text">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Results are outdated. Go back to adjust inputs or click Regenerate.
          </AlertDescription>
        </Alert>
      )}

      <ScheduleOutput />
      <SaveLoadShare />

      <div className="flex justify-center">
        <Button variant="success" onClick={handleRegenerate}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Regenerate
        </Button>
      </div>
    </div>
  )
}
