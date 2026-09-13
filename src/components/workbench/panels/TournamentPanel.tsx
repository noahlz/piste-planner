import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useStore } from '../../../store/store.ts'
import { TournamentType } from '../../../engine/types.ts'
import { daysAvailableRangeMessage } from '../../../engine/validation.ts'
import { TIME_OPTIONS, formatClock } from '../../../lib/time.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const TOURNAMENT_TYPE_LABELS: Record<TournamentType, string> = {
  [TournamentType.NAC]: 'NAC',
  [TournamentType.RYC]: 'RYC',
  [TournamentType.RJCC]: 'RJCC',
  [TournamentType.ROC]: 'ROC',
  [TournamentType.SYC]: 'SYC',
  [TournamentType.SJCC]: 'SJCC',
}

const TOURNAMENT_TYPES = Object.values(TournamentType)

/** Standing rule 13 pill: selected fills primary, unselected is a bordered white pill. */
const PILL_CLASSES =
  'rounded-full px-[13px] py-1.5 text-[12.5px] border-[1.5px] border-chrome-border bg-white ' +
  'data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

/** Section caption above each Tournament panel field group (standing rule 13). */
function SectionCaption({ children }: { children: string }) {
  return (
    <div className="mb-[7px] text-[11.5px] font-semibold tracking-[.06em] text-neutral-600 uppercase">
      {children}
    </div>
  )
}

function DayHoursSelect({
  ariaLabel,
  value,
  onChange,
}: {
  ariaLabel: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <Select value={String(value)} onValueChange={(v: string) => onChange(Number(v))}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-auto flex-1 rounded-[9px] border-[1.5px] border-chrome-border bg-white px-2.5 py-1.5 font-mono text-[11.5px] font-semibold"
      >
        <SelectValue>{formatClock(value)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {TIME_OPTIONS.map((t) => (
          <SelectItem key={t} value={String(t)}>
            {formatClock(t)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The Tournament inspector panel (013 T016, ui-contract.md §Inspector panel
 * — Tournament, FR-013–FR-015): type, day count and per-day hours. Replaces
 * `TournamentSetup` (deleted in this task) — same store fields, restyled to
 * the mockup's pill controls instead of two `Select`s.
 */
export function TournamentPanel() {
  const tournamentType = useStore((s) => s.tournament_type)
  const setTournamentType = useStore((s) => s.setTournamentType)
  const daysAvailable = useStore((s) => s.days_available)
  const setDays = useStore((s) => s.setDays)
  const dayConfigs = useStore((s) => s.dayConfigs)
  const updateDayConfig = useStore((s) => s.updateDayConfig)

  // The engine's own advisory notice text (validation.ts,
  // 'days-available-range') — reused rather than restated so the panel's
  // wording never drifts from the rule that decides whether it shows
  // (FR-014). Computed directly from `daysAvailable` (already subscribed
  // above) instead of subscribing to the whole derived-findings memo, which
  // is keyed on the schedule and would re-render this panel on any edit
  // anywhere.
  const dayRangeMessage = daysAvailableRangeMessage(daysAvailable)
  const isOutOfRange = daysAvailable !== 2 && daysAvailable !== 3 && daysAvailable !== 4

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <SectionCaption>Type</SectionCaption>
        <RadioGroupPrimitive.Root
          aria-label="Tournament type"
          value={tournamentType}
          onValueChange={(value: string) => setTournamentType(value as TournamentType)}
          className="flex flex-wrap gap-[5px]"
        >
          {TOURNAMENT_TYPES.map((t) => (
            <RadioGroupPrimitive.Item key={t} value={t} className={PILL_CLASSES}>
              {TOURNAMENT_TYPE_LABELS[t]}
            </RadioGroupPrimitive.Item>
          ))}
        </RadioGroupPrimitive.Root>
        <p className="mt-2 text-[12.5px] leading-normal text-neutral-700">
          Affects event grouping rules, rest-day requirements, and scheduling priorities.
        </p>
      </div>

      <div>
        <SectionCaption>Days</SectionCaption>
        <RadioGroupPrimitive.Root
          aria-label="Day count"
          value={String(daysAvailable)}
          onValueChange={(value: string) => setDays(Number(value))}
          className="flex flex-wrap gap-[5px]"
        >
          {[2, 3, 4].map((d) => (
            <RadioGroupPrimitive.Item key={d} value={String(d)} className={PILL_CLASSES}>
              {d}
            </RadioGroupPrimitive.Item>
          ))}
          {isOutOfRange && (
            <RadioGroupPrimitive.Item
              value={String(daysAvailable)}
              disabled
              className={PILL_CLASSES}
            >
              {daysAvailable}
            </RadioGroupPrimitive.Item>
          )}
        </RadioGroupPrimitive.Root>
        {isOutOfRange && dayRangeMessage !== null && (
          <p className="mt-2 text-[12.5px] leading-normal text-neutral-700">{dayRangeMessage}</p>
        )}
      </div>

      {dayConfigs.length > 0 && (
        <div>
          <SectionCaption>Day hours</SectionCaption>
          <div className="flex flex-col gap-[7px]">
            {dayConfigs.map((dc, i) => (
              <div key={i} className={cn('flex items-center gap-2 text-[12.5px]')}>
                <span className="w-11 text-neutral-700">Day {i + 1}</span>
                <DayHoursSelect
                  ariaLabel={`Day ${i + 1} start`}
                  value={dc.day_start_time}
                  onChange={(v) => updateDayConfig(i, { day_start_time: v })}
                />
                <span className="text-neutral-500">–</span>
                <DayHoursSelect
                  ariaLabel={`Day ${i + 1} end`}
                  value={dc.day_end_time}
                  onChange={(v) => updateDayConfig(i, { day_end_time: v })}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
