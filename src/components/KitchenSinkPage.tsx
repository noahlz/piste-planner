import { TournamentSetup } from './sections/TournamentSetup.tsx'
import { TemplateSelector } from './sections/TemplateSelector.tsx'
import { CompetitionMatrix } from './sections/CompetitionMatrix.tsx'
import { FencerCounts } from './sections/FencerCounts.tsx'
import { CompetitionOverrides } from './sections/CompetitionOverrides.tsx'
import { StripSetup } from './sections/StripSetup.tsx'
import { RefereeSetup } from './sections/RefereeSetup.tsx'
import { ActionButtons } from './sections/ActionButtons.tsx'
import { AnalysisOutput } from './sections/AnalysisOutput.tsx'
import { ScheduleOutput } from './sections/ScheduleOutput.tsx'
import { SaveLoadShare } from './sections/SaveLoadShare.tsx'

export function KitchenSinkPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <TournamentSetup />
      <TemplateSelector />
      <CompetitionMatrix />
      <FencerCounts />
      <CompetitionOverrides />
      <StripSetup />
      <RefereeSetup />
      <ActionButtons />
      <AnalysisOutput />
      <ScheduleOutput />

      <SaveLoadShare />
    </div>
  )
}
