import { useStore } from '../../store/store.ts'
import { Weapon } from '../../engine/types.ts'
import { DEFAULT_POOL_ROUND_DURATION_TABLE } from '../../engine/constants.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    <Card className="pt-0 gap-0">
      <CardHeader className="flex flex-row items-center bg-foreground/10 rounded-t-xl py-2">
        <CardTitle>Pool Round Durations</CardTitle>
      </CardHeader>
      <CardContent className="pt-3 pb-3 space-y-2">
        {WEAPON_ROWS.map(({ weapon, label }) => {
          const defaultMinutes = DEFAULT_POOL_ROUND_DURATION_TABLE[weapon]
          // Override state is derived by comparison against the default –
          // there is no stored flag (data-model.md).
          const isDefault = durations[weapon] === defaultMinutes
          return (
            <div key={weapon} className="flex items-center gap-2">
              <Label className="w-12 text-xs">{label}</Label>
              <NumberInput
                value={durations[weapon]}
                onChange={(minutes) => setPoolRoundDuration(weapon, minutes)}
                min={1}
                max={999}
                rejectOutOfRange
                aria-label={`${label} pool round duration`}
              />
              <span className="text-xs text-muted-foreground">min</span>
              {isDefault ? (
                <DefaultLabel isDefault />
              ) : (
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
      </CardContent>
    </Card>
  )
}
