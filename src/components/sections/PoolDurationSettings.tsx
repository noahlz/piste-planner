import { useStore } from '../../store/store.ts'
import { Weapon } from '../../engine/types.ts'
import {
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  POOL_DURATION_MIN,
  POOL_DURATION_MAX,
} from '../../engine/constants.ts'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { DefaultLabel } from '@/components/common/DefaultLabel'
import { RotateCcw } from 'lucide-react'

// Sabre keeps the Weapon-key spelling here rather than WEAPON_DISPLAY's
// "Saber", so the row label and the input's accessible name stay identical.
const WEAPON_ROWS: { weapon: Weapon; label: string }[] = [
  { weapon: Weapon.EPEE, label: 'Epee' },
  { weapon: Weapon.FOIL, label: 'Foil' },
  { weapon: Weapon.SABRE, label: 'Sabre' },
]

export function PoolDurationSettings() {
  const durations = useStore((s) => s.pool_round_duration_table)
  const setPoolRoundDuration = useStore((s) => s.setPoolRoundDuration)
  const resetPoolRoundDuration = useStore((s) => s.resetPoolRoundDuration)

  return (
    // The named section is the boundary a screen-reader user needs between
    // these inputs and whatever else shares the panel (T079 finding 7). It
    // carried a `CardTitle` reading "Pool Round Durations" until 013 T022,
    // where the Settings panel's own "Pool durations" caption sits directly
    // above it — the title was then the same words twice, and `CardTitle`
    // renders a `<div>`, so it was never the heading the caption is. The rows
    // and their behaviour are unchanged; only the container is the mockup's
    // card now (013 T022, mockup lines 224–250).
    <section aria-label="Pool round durations">
      <div className="overflow-hidden rounded-[12px] border-[1.5px] border-chrome-border bg-white">
        <div className="divide-y-[1.5px] divide-chrome-border">
          {WEAPON_ROWS.map(({ weapon, label }) => {
            const defaultMinutes = DEFAULT_POOL_ROUND_DURATION_TABLE[weapon]
            // Override state is derived by comparison against the default –
            // there is no stored flag (data-model.md).
            const isDefault = durations[weapon] === defaultMinutes
            return (
              <div key={weapon} className="flex items-center gap-2 px-3 py-2">
                <Label htmlFor={`pool-duration-${weapon}`} className="w-12 text-xs">
                  {label}
                </Label>
                <NumberInput
                  id={`pool-duration-${weapon}`}
                  value={durations[weapon]}
                  onChange={(minutes) => setPoolRoundDuration(weapon, minutes)}
                  min={POOL_DURATION_MIN}
                  max={POOL_DURATION_MAX}
                  rejectOutOfRange
                  aria-label={`${label} pool round duration`}
                />
                <span className="text-xs text-muted-foreground">min</span>
                <DefaultLabel isDefault={isDefault} />
                {!isDefault && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      default: {defaultMinutes} min
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => resetPoolRoundDuration(weapon)}
                      aria-label={`Revert ${label} to default`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
