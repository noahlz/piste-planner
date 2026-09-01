import { TournamentSetup } from '../sections/TournamentSetup.tsx'
import { StripSetup } from '../sections/StripSetup.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'
import { FencerCounts } from '../sections/FencerCounts.tsx'
import { CompetitionOverrides } from '../sections/CompetitionOverrides.tsx'
import { PoolDurationSettings } from '../sections/PoolDurationSettings.tsx'
import { RailPanel } from './RailPanel.tsx'
import { AdvancedPanel } from './AdvancedPanel.tsx'

/**
 * The left rail: five collapsible panels over existing section components,
 * mounted unmodified (FR-004, S2-contract.md §Rail panels), plus the Advanced
 * panel. Scrolls independently of the center.
 *
 * `AdvancedPanel` renders its own `RailPanel` rather than being wrapped here,
 * because it supplies that panel's `summary` as well as its content. It stays
 * last, so tab order matches the visual order it has always had.
 */
export function Rail() {
  return (
    <aside aria-label="Left rail" className="w-80 shrink-0 overflow-y-auto border-r bg-background">
      <RailPanel heading="Tournament" defaultOpen>
        <TournamentSetup />
      </RailPanel>
      <RailPanel heading="Strips" defaultOpen>
        <StripSetup />
      </RailPanel>
      <RailPanel heading="Events" defaultOpen>
        <div className="space-y-3">
          <CompetitionMatrix />
          <FencerCounts />
        </div>
      </RailPanel>
      <RailPanel heading="Per-event overrides">
        <CompetitionOverrides />
      </RailPanel>
      <RailPanel heading="Pool durations">
        <PoolDurationSettings />
      </RailPanel>
      <AdvancedPanel />
    </aside>
  )
}
