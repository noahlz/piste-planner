import { useState } from 'react'
import { useStore } from '../../store/store.ts'
import { selectDerivedFindings } from '../../store/derived.ts'
import { runScheduleAll } from '../../store/runActions.ts'
import { applyPreset } from '../../store/presets.ts'
import { SCENARIO_IDS, SCENARIOS, type ScenarioId } from '../../data/tournaments.ts'
import { TournamentType } from '../../engine/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { NumberInput } from '@/components/ui/number-input'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Play, Share2, Settings } from 'lucide-react'
import { SaveLoadShare } from '../sections/SaveLoadShare.tsx'
import { SettingsPanel } from './SettingsPanel.tsx'

const TOURNAMENT_TYPES = Object.values(TournamentType)
const DAY_COUNTS = [2, 3, 4]

/**
 * The top bar: preset picker, the FR-003 inline controls that duplicate a
 * subset of the rail's Tournament and Strips panels (deliberately — see
 * S2-contract.md §Top bar controls), Auto-schedule all, Save / Share, and
 * the gears control (US5, FR-041) that discloses `SettingsPanel` the same
 * way Save / Share discloses `SaveLoadShare`.
 */
export function TopBar() {
  // One slot, not two booleans (T079 finding 2). The gears and Save / Share
  // panels are sibling `absolute right-0 z-50` overlays in the same `ml-auto`
  // group, so they occupy the same space and the later one in DOM order paints
  // over — and swallows the pointer events of — the earlier. Making them
  // mutually exclusive is the fix; a Radix `Popover` is the thorough one and
  // belongs to whichever feature next reshapes this bar.
  const [openPanel, setOpenPanel] = useState<'settings' | 'saveShare' | null>(null)

  const loadedPresetId = useStore((s) => s.loadedPresetId)
  const tournamentType = useStore((s) => s.tournament_type)
  const setTournamentType = useStore((s) => s.setTournamentType)
  const daysAvailable = useStore((s) => s.days_available)
  const setDays = useStore((s) => s.setDays)
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)

  const { validationErrors } = useStore(selectDerivedFindings)
  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  function handlePresetChange(id: string) {
    applyPreset(id as ScenarioId)
    runScheduleAll()
  }

  return (
    <header
      aria-label="Top bar"
      className="flex shrink-0 items-center gap-4 border-b bg-slate-800 px-4 py-2 text-white"
    >
      <Select value={loadedPresetId ?? ''} onValueChange={handlePresetChange}>
        <SelectTrigger id="topbar-preset" aria-label="Preset" className="w-56">
          <SelectValue placeholder="Preset" />
        </SelectTrigger>
        <SelectContent>
          {SCENARIO_IDS.map((id) => (
            <SelectItem key={id} value={id}>
              {SCENARIOS[id].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={tournamentType} onValueChange={(v: string) => setTournamentType(v as TournamentType)}>
        <SelectTrigger id="topbar-tournament-type" aria-label="Tournament type">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TOURNAMENT_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(daysAvailable)} onValueChange={(v: string) => setDays(Number(v))}>
        <SelectTrigger id="topbar-days" aria-label="Day count">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DAY_COUNTS.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {d} days
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <NumberInput
        value={stripsTotal}
        onChange={setStrips}
        min={0}
        commitOnChange
        aria-label="Strip count"
      />

      <Button type="button" variant="success" onClick={() => runScheduleAll()} disabled={hasHardErrors}>
        <Play className="mr-2 h-4 w-4" />
        Auto-schedule all
      </Button>

      <div className="relative ml-auto">
        <Collapsible
          open={openPanel === 'settings'}
          onOpenChange={(open) => setOpenPanel(open ? 'settings' : null)}
        >
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="absolute right-0 z-50 mt-2">
            <SettingsPanel />
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="relative">
        <Collapsible
          open={openPanel === 'saveShare'}
          onOpenChange={(open) => setOpenPanel(open ? 'saveShare' : null)}
        >
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline">
              <Share2 className="mr-2 h-4 w-4" />
              Save / Share
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="absolute right-0 z-50 mt-2 w-[28rem]">
            <SaveLoadShare />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </header>
  )
}
