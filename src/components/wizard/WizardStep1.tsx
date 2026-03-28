import { TournamentSetup } from '../sections/TournamentSetup.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'

export function WizardStep1() {
  return (
    <div className="space-y-4">
      <TournamentSetup />
      <CompetitionMatrix />
    </div>
  )
}
