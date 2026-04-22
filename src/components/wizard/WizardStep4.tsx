import { useEffect } from 'react'
import { useStore } from '../../store/store.ts'
import { runValidateAndAnalyze } from '../../store/runActions.ts'
import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'
import { ActionButtons } from '../sections/ActionButtons.tsx'

export function WizardStep4() {
  const analysisStale = useStore((s) => s.analysisStale)

  // Auto-run validate + analyze on mount and when inputs become stale
  useEffect(() => {
    runValidateAndAnalyze()
  }, [analysisStale])

  return (
    <div className="space-y-4">
      <AnalysisOutput />
      <ActionButtons />
    </div>
  )
}
