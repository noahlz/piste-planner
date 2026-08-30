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
import { Play, Share2 } from 'lucide-react'
import { SaveLoadShare } from '../sections/SaveLoadShare.tsx'

const TOURNAMENT_TYPES = Object.values(TournamentType)
const DAY_COUNTS = [2, 3, 4]

/**
 * The top bar: preset picker, the FR-003 inline controls that duplicate a
 * subset of the rail's Tournament and Strips panels (deliberately — see
 * S2-contract.md §Top bar controls), Auto-schedule all, and Save / Share.
 * The gears control is US5's; no placeholder for it here.
 */
export function TopBar() {
  const [presetId, setPresetId] = useState<string>('')
  const [saveShareOpen, setSaveShareOpen] = useState(false)

  const tournamentType = useStore((s) => s.tournament_type)
  const setTournamentType = useStore((s) => s.setTournamentType)
  const daysAvailable = useStore((s) => s.days_available)
  const setDays = useStore((s) => s.setDays)
  const stripsTotal = useStore((s) => s.strips_total)
  const setStrips = useStore((s) => s.setStrips)

  const { validationErrors } = useStore(selectDerivedFindings)
  const hasHardErrors = validationErrors.some((e) => e.severity === 'ERROR')

  function handlePresetChange(id: string) {
    setPresetId(id)
    applyPreset(id as ScenarioId)
    runScheduleAll()
  }

  return (
    <header
      aria-label="Top bar"
      className="flex shrink-0 items-center gap-4 border-b bg-slate-800 px-4 py-2 text-white"
    >
      <Select value={presetId} onValueChange={handlePresetChange}>
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
        <Collapsible open={saveShareOpen} onOpenChange={setSaveShareOpen}>
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
