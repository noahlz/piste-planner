import { useState, type ReactNode } from 'react'
import { Header } from './Header.tsx'
import { ToolRail } from './ToolRail.tsx'
import { InspectorPanel } from './InspectorPanel.tsx'
import { UnplacedDock } from './UnplacedDock.tsx'
import { CenterView } from './CenterView.tsx'
import { StatusFooter } from './StatusFooter.tsx'
import { TournamentPanel } from './panels/TournamentPanel.tsx'
import { StripsPanel } from './panels/StripsPanel.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'
import { FencerCounts } from '../sections/FencerCounts.tsx'
import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { PanelId, ViewMode, loadViewState, saveViewState } from '../../store/viewState.ts'

/**
 * Panel content by id — temporary (013 decision 1): phase 2 replaces each arm
 * with a purpose-built panel component. `tournament` (T016) and `strips`
 * (T018) are done; `events`, `findings` and `settings` are still the section
 * components the old collapsible rail mounted, unmodified, until their own
 * tasks land.
 *
 * `findings` also renders behind the rail's Findings button (T009) — its only
 * home since T011a folded the drawer into `StatusFooter`.
 */
function panelContent(id: PanelId): ReactNode {
  switch (id) {
    case PanelId.TOURNAMENT:
      return <TournamentPanel />
    case PanelId.STRIPS:
      return <StripsPanel />
    case PanelId.EVENTS:
      return (
        <div className="space-y-3">
          <CompetitionMatrix />
          <FencerCounts />
        </div>
      )
    case PanelId.FINDINGS:
      return <AnalysisOutput />
    case PanelId.SETTINGS:
      return <SettingsPanel />
  }
}

/**
 * The workbench: one full-bleed screen replacing the max-w-4xl card stack
 * (FR-002, contracts/ui-contract.md §Regions). Six regions, each locatable by
 * its accessible name:
 *
 * 1. Header across the top (T010) — brand, preset, summary, Auto-assign, Export.
 * 2. Unplaced dock (T012) — every selected event with no placement.
 * 3. Tool rail (T009) — five buttons, each opening one inspector panel.
 * 4. Inspector panel (T009) — the open panel's content, at most one at a time.
 * 5. Center view — the canvas or the schedule table (T026 replaces its contents).
 * 6. Footer along the bottom (T011a) — zoom, counts, metrics, legend, the view toggle.
 *
 * `panel`, `panelDocked` and `viewMode` are seeded from view state on mount
 * and persisted on every change. `viewMode` used to be `CenterView`'s own
 * state; the shell owns it now so `StatusFooter`'s toggle and the center it
 * drives can be two components sharing one source of truth.
 *
 * The inspector panel has two viewer states: floating (default) positions it
 * over the dock-and-center column beside the rail, docked pushes it in-flow
 * instead so the center resizes around it. `toggleDocked` is the only writer
 * of `panelDocked`; `InspectorPanel` only switches its own classes on the
 * prop.
 */
export function WorkbenchShell() {
  const [panel, setPanel] = useState<PanelId | null>(() => loadViewState().panel)
  const [panelDocked, setPanelDocked] = useState<boolean>(() => loadViewState().panelDocked)
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewState().viewMode)

  function selectPanel(id: PanelId | null): void {
    setPanel(id)
    saveViewState({ ...loadViewState(), panel: id })
  }

  function toggleDocked(): void {
    const next = !panelDocked
    setPanelDocked(next)
    saveViewState({ ...loadViewState(), panelDocked: next })
  }

  function closePanel(): void {
    selectPanel(null)
  }

  function chooseView(next: ViewMode): void {
    setViewMode(next)
    saveViewState({ ...loadViewState(), viewMode: next })
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <ToolRail panel={panel} onSelect={selectPanel} />
        <div className="relative flex flex-1 overflow-hidden">
          {panel !== null && (
            <InspectorPanel panel={panel} docked={panelDocked} onToggleDocked={toggleDocked} onClose={closePanel}>
              {panelContent(panel)}
            </InspectorPanel>
          )}
          <div className="flex flex-1 flex-col overflow-hidden">
            <UnplacedDock />
            <CenterView viewMode={viewMode} />
          </div>
        </div>
      </div>
      <StatusFooter viewMode={viewMode} onViewModeChange={chooseView} />
    </div>
  )
}
