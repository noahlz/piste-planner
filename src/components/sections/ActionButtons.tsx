import { ShieldCheck, Play } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useStore } from '../../store/store.ts'
import { runScheduleAll, runValidateAndAnalyze } from '../../store/runActions.ts'

export function ActionButtons() {
  const validationErrors = useStore((s) => s.validationErrors)

  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  return (
    <Card className="pt-0 gap-0">
      <CardHeader className="bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="flex gap-3">
        <Button variant="default" onClick={() => runValidateAndAnalyze()}>
          <ShieldCheck className="mr-2 h-4 w-4" />
          Validate
        </Button>
        <Button variant="success" onClick={() => runScheduleAll()} disabled={hasHardErrors}>
          <Play className="mr-2 h-4 w-4" />
          Generate Schedule
        </Button>
      </CardContent>
    </Card>
  )
}
