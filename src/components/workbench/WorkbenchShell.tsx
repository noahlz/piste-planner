import { useState, type ReactNode } from 'react'
import { Header } from './Header.tsx'
import { ToolRail } from './ToolRail.tsx'
import { InspectorPanel } from './InspectorPanel.tsx'
import { UnplacedTray } from './UnplacedTray.tsx'
import { CenterView } from './CenterView.tsx'
import { StatusFooter } from './StatusFooter.tsx'
import { TournamentSetup } from '../sections/TournamentSetup.tsx'
import { StripSetup } from '../sections/StripSetup.tsx'
import { CompetitionMatrix } from '../sections/CompetitionMatrix.tsx'
import { FencerCounts } from '../sections/FencerCounts.tsx'
import { CompetitionOverrides } from '../sections/CompetitionOverrides.tsx'
import { AnalysisOutput } from '../sections/AnalysisOutput.tsx'
import { AdvancedPanel } from './AdvancedPanel.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'
import { PanelId, ViewMode, loadViewState, saveViewState } from '../../store/viewState.ts'

/**
 * Panel content by id — temporary (013 decision 1): phase 2 replaces each arm
 * with a purpose-built panel component. Until then these are the same section
 * components the old collapsible rail mounted, unmodified.
 *
 * `findings` also renders behind the rail's Findings button (T009) — its only
 * home since T011a folded the drawer into `StatusFooter`.
 */
function panelContent(id: PanelId): ReactNode {
  switch (id) {
    case PanelId.TOURNAMENT:
      return <TournamentSetup />
    case PanelId.STRIPS:
      return (
        <div className="space-y-3">
          <StripSetup />
          <AdvancedPanel />
        </div>
      )
    case PanelId.EVENTS:
      return (
        <div className="space-y-3">
          <CompetitionMatrix />
          <FencerCounts />
          <CompetitionOverrides />
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
 * (FR-002, S2-contract.md §Regions). Header across the top; below it the
 * tool rail beside the inspector panel host (013 T009, ui-contract.md §Tool
 * rail, §Inspector panel) and a column holding the unplaced tray docked above
 * the center; the status bar along the bottom (T011a, FR-049/FR-050).
 *
 * `panel`, `panelDocked` and `viewMode` are seeded from view state on mount
 * and persisted on every change — the same idiom `Drawer.tsx` used for
 * `drawerHeight` before T011a removed it. `viewMode` used to be `CenterView`'s
 * own state; the shell owns it now so `StatusFooter`'s toggle and the center
 * it drives can be two components sharing one source of truth.
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
      <div className="flex flex-1 overflow-hidden">
        <ToolRail panel={panel} onSelect={selectPanel} />
        <div className="relative flex flex-1 overflow-hidden">
          {panel !== null && (
            <InspectorPanel panel={panel} docked={panelDocked} onToggleDocked={toggleDocked} onClose={closePanel}>
              {panelContent(panel)}
            </InspectorPanel>
          )}
          <div className="flex flex-1 flex-col overflow-hidden">
            <UnplacedTray />
            <CenterView viewMode={viewMode} />
          </div>
        </div>
      </div>
      <StatusFooter viewMode={viewMode} onViewModeChange={chooseView} />
    </div>
  )
}
