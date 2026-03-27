import { FencerCounts } from '../sections/FencerCounts.tsx'
import { CompetitionOverrides } from '../sections/CompetitionOverrides.tsx'

export function WizardStep2() {
  return (
    <div className="space-y-6">
      <FencerCounts />
      <CompetitionOverrides />
    </div>
  )
}
