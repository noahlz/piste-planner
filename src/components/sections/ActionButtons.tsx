import { Play } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '../../store/store.ts'
import { selectDerivedFindings } from '../../store/derived.ts'
import { runScheduleAll } from '../../store/runActions.ts'

/**
 * Only auto-scheduling is an action now. Validation and analysis derive from
 * the current inputs on every render, so there is nothing left for a
 * "Validate" button to trigger.
 */
export function ActionButtons() {
  const { validationErrors } = useStore(selectDerivedFindings)

  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Button variant="success" onClick={() => runScheduleAll()} disabled={hasHardErrors}>
          <Play className="mr-2 h-4 w-4" />
          Generate Schedule
        </Button>
      </CardContent>
    </Card>
  )
}
