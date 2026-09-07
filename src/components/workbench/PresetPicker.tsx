import { useStore } from '../../store/store.ts'
import { runScheduleAll } from '../../store/runActions.ts'
import { applyPreset } from '../../store/presets.ts'
import { SCENARIO_IDS, SCENARIOS, type ScenarioId } from '../../data/tournaments.ts'
import { TEMPLATES } from '../../engine/catalogue.ts'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const TEMPLATE_NAMES = Object.keys(TEMPLATES)

function isScenarioId(value: string): value is ScenarioId {
  return (SCENARIO_IDS as readonly string[]).includes(value)
}

interface PresetPickerProps {
  /** Test-only: Radix's Select needs pointer capture jsdom doesn't implement
   * to open on a click, so tests render it open instead (src/components/ui/__tests__/select.test.tsx). */
  defaultOpen?: boolean
}

/**
 * The Header's preset picker (013 T010, ui-contract.md §Header, FR-004–FR-009):
 * one Select grouping the eight B1–B8 tournament fixtures above the ten
 * invented-figure templates. Choosing a tournament applies its fixture and
 * re-runs the auto-scheduler the same way the old top bar's picker did;
 * choosing a template only replaces the selected competitions — `applyTemplate`
 * leaves `tournament_type` untouched — so it does not re-run the scheduler.
 */
export function PresetPicker({ defaultOpen }: PresetPickerProps) {
  const loadedPresetId = useStore((s) => s.loadedPresetId)

  function handleChange(value: string) {
    if (isScenarioId(value)) {
      applyPreset(value)
      runScheduleAll()
    } else {
      useStore.getState().applyTemplate(value)
    }
  }

  return (
    <Select value={loadedPresetId ?? ''} onValueChange={handleChange} defaultOpen={defaultOpen}>
      <SelectTrigger id="header-preset" aria-label="Preset" className="w-64">
        <SelectValue placeholder="Preset" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Tournaments</SelectLabel>
          {SCENARIO_IDS.map((id) => (
            <SelectItem key={id} value={id}>
              {SCENARIOS[id].label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Templates – invented figures</SelectLabel>
          {TEMPLATE_NAMES.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
