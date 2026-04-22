import { useStore } from '../store/store.ts'
import { runScheduleAll } from '../store/runActions.ts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { ScheduleOutput } from './sections/ScheduleOutput.tsx'
import { SaveLoadShare } from './sections/SaveLoadShare.tsx'

export function ScheduleView() {
  const scheduleStale = useStore((s) => s.scheduleStale)

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
        <Button variant="success" onClick={() => runScheduleAll()}>
          <RefreshCw className="mr-1.5 h-4 w-4" />
          Regenerate
        </Button>
      </div>
    </div>
  )
}
