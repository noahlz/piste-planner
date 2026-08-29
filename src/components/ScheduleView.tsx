import { useStore } from '../store/store.ts'
import { selectDerivedRefRequirements } from '../store/derived.ts'
import { runScheduleAll } from '../store/runActions.ts'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { ScheduleOutput } from './sections/ScheduleOutput.tsx'
import { SaveLoadShare } from './sections/SaveLoadShare.tsx'
import { RefRequirementsReport } from './sections/RefRequirementsReport.tsx'

export function ScheduleView() {
  const refRequirements = useStore(selectDerivedRefRequirements)

  return (
    <div className="space-y-4">
      <ScheduleOutput />
      <RefRequirementsReport requirements={refRequirements} />
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
