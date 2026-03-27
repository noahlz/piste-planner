import { TournamentSetup } from '../sections/TournamentSetup.tsx'
import { TemplateSelector } from '../sections/TemplateSelector.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'

export function WizardStep1() {
  return (
    <div className="space-y-6">
      <TournamentSetup />
      <TemplateSelector />
      <CompetitionMatrix />
    </div>
  )
}
