import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'
import { ActionButtons } from '../sections/ActionButtons.tsx'

/**
 * No run-on-mount effect: AnalysisOutput reads derived findings, so simply
 * rendering the step shows analysis current with the inputs behind it.
 */
export function WizardStep4() {
  return (
    <div className="space-y-4">
      <AnalysisOutput />
      <ActionButtons />
    </div>
  )
}
