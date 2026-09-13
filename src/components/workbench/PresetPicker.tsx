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
 * invented-figure templates. Choosing either a tournament or a template
 * applies it and re-runs the auto-scheduler the same way (research D12,
 * FR-005) — `applyTemplate` still leaves `tournament_type` untouched, but
 * both branches now call `runScheduleAll` so a chosen template shows placed
 * events immediately instead of only its empty selection.
 */
export function PresetPicker({ defaultOpen }: PresetPickerProps) {
  const loadedPresetId = useStore((s) => s.loadedPresetId)

  function handleChange(value: string) {
    if (isScenarioId(value)) {
      applyPreset(value)
    } else {
      useStore.getState().applyTemplate(value)
    }
    runScheduleAll()
  }

  return (
    <Select value={loadedPresetId ?? ''} onValueChange={handleChange} defaultOpen={defaultOpen}>
      <SelectTrigger
        id="header-preset"
        aria-label="Preset"
        className="w-64 gap-[9px] border-[1.5px] border-chrome-border bg-secondary px-3 text-[13px] text-foreground hover:border-accent-400 hover:bg-hover-tint"
      >
        <span
          aria-hidden="true"
          className="text-[10.5px] font-semibold tracking-[.05em] text-neutral-600 uppercase"
        >
          Preset
        </span>
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
