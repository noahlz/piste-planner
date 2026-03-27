import { useEffect } from 'react'
import { useStore } from '../../store/store.ts'
import { buildTournamentConfig } from '../../store/buildConfig.ts'
import { validateConfig } from '../../engine/validation.ts'
import { initialAnalysis } from '../../engine/analysis.ts'
import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'
import { ActionButtons } from '../sections/ActionButtons.tsx'

export function WizardStep4() {
  const analysisStale = useStore((s) => s.analysisStale)

  // Auto-run validate + analyze on mount and when inputs become stale
  useEffect(() => {
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const errors = validateConfig(config, competitions)

    const dayAssignments: Record<string, number> = {}
    competitions.forEach((c, i) => {
      dayAssignments[c.id] = i % config.days_available
    })

    const analysisResult = initialAnalysis(config, competitions, dayAssignments)
    state.setAnalysisResults(errors, analysisResult)
  }, [analysisStale])

  return (
    <div className="space-y-4">
      <AnalysisOutput />
      <ActionButtons />
    </div>
  )
}
