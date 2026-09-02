import { useStore } from '../../store/store.ts'
import { Weapon } from '../../engine/types.ts'
import type { GlobalOverrides } from '../../store/store.ts'
import {
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
} from '../../engine/constants.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { DefaultLabel } from '@/components/common/DefaultLabel'
import { PoolDurationSettings } from '../sections/PoolDurationSettings.tsx'
import { RotateCcw } from 'lucide-react'

// Every direct numeric override except DE_BOUT_DURATION, which is keyed by
// weapon and rendered by its own row kind below.
type ScalarKey = Exclude<keyof GlobalOverrides, 'DE_BOUT_DURATION'>

type SettingRowSpec =
  | { kind: 'scalar'; key: ScalarKey; label: string; default: number; unit: string; min?: number }
  | { kind: 'weapon'; weapon: Weapon; label: string; default: number; unit: string }

// Order and strings are fixed by the US5 contract (§5, FR-042) – T077's smoke
// driver and T070's tests both locate rows by this label/aria-label text.
const ROWS: SettingRowSpec[] = [
  { kind: 'scalar', key: 'ADMIN_GAP_MINS', label: 'Admin gap', default: ADMIN_GAP_MINS, unit: 'min' },
  { kind: 'scalar', key: 'FLIGHT_BUFFER_MINS', label: 'Flight buffer', default: FLIGHT_BUFFER_MINS, unit: 'min' },
  { kind: 'scalar', key: 'THRESHOLD_MINS', label: 'Flighting threshold', default: THRESHOLD_MINS, unit: 'min' },
  {
    kind: 'scalar',
    key: 'SLOT_MINS',
    label: 'Scheduling grid resolution',
    default: SLOT_MINS,
    unit: 'min',
  },
  {
    kind: 'weapon',
    weapon: Weapon.EPEE,
    label: 'Epee DE bout duration',
    default: DE_BOUT_DURATION[Weapon.EPEE],
    unit: 'min',
  },
  {
    kind: 'weapon',
    weapon: Weapon.FOIL,
    label: 'Foil DE bout duration',
    default: DE_BOUT_DURATION[Weapon.FOIL],
    unit: 'min',
  },
  {
    kind: 'weapon',
    weapon: Weapon.SABRE,
    label: 'Sabre DE bout duration',
    default: DE_BOUT_DURATION[Weapon.SABRE],
    unit: 'min',
  },
  {
    kind: 'scalar',
    key: 'YOUTH_VET_BOUT_DELTA',
    label: 'Youth and veteran bout adjustment',
    default: YOUTH_VET_BOUT_DELTA,
    unit: 'min',
    // Sabre is the shortest DE bout at 15 min – a delta past -15 would zero it
    // out or invert it, so the floor sits there rather than at NumberInput's
    // default of 0, which would block typing back the -5 default.
    min: -15,
  },
  {
    kind: 'scalar',
    key: 'DEFAULT_DE_STRIP_FOOTPRINT',
    label: 'DE strip footprint',
    default: DEFAULT_DE_STRIP_FOOTPRINT,
    unit: 'strips',
  },
]

/**
 * The gears panel (US5, FR-041/042/043/047): every engine setting the
 * organizer can retune, one row per `GlobalOverrides` key, followed by
 * `PoolDurationSettings` moved out of the rail. Rendered inside the top bar's
 * gears `CollapsibleContent` (`TopBar.tsx`).
 *
 * Every row follows `PoolDurationSettings`' settled pattern: override state
 * is derived by comparison against the imported constant, never a stored
 * flag (research D8), so setting a value back to its default through
 * `setGlobalOverrides` reads as Default with no extra bookkeeping.
 */
export function SettingsPanel() {
  const globalOverrides = useStore((s) => s.globalOverrides)
  const setGlobalOverrides = useStore((s) => s.setGlobalOverrides)

  return (
    <section aria-label="Settings" className="w-[34rem]">
      <Card className="pt-0 gap-0">
        <CardHeader className="flex flex-row items-center bg-foreground/10 rounded-t-xl py-2">
          <CardTitle>Settings</CardTitle>
        </CardHeader>
        <CardContent className="pt-3 pb-3 space-y-2">
          {ROWS.map((row) => {
            const value =
              row.kind === 'scalar' ? globalOverrides[row.key] : globalOverrides.DE_BOUT_DURATION[row.weapon]
            const isDefault = value === row.default
            const inputId = row.kind === 'scalar' ? `gear-${row.key}` : `gear-de-bout-${row.weapon}`

            function commit(next: number) {
              if (row.kind === 'scalar') {
                setGlobalOverrides({ [row.key]: next } as Partial<GlobalOverrides>)
              } else {
                setGlobalOverrides({
                  DE_BOUT_DURATION: { ...globalOverrides.DE_BOUT_DURATION, [row.weapon]: next },
                })
              }
            }

            return (
              <div key={row.label} className="flex items-center gap-2">
                <Label htmlFor={inputId} className="w-60 shrink-0 text-xs">
                  {row.label}
                </Label>
                <NumberInput
                  id={inputId}
                  value={value}
                  onChange={commit}
                  min={row.kind === 'scalar' ? row.min : undefined}
                  aria-label={row.label}
                />
                <span className="text-xs text-muted-foreground">{row.unit}</span>
                <DefaultLabel isDefault={isDefault} />
                {!isDefault && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      default: {row.default} {row.unit}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => commit(row.default)}
                      aria-label={`Revert ${row.label} to default`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )
          })}
          <PoolDurationSettings />
        </CardContent>
      </Card>
    </section>
  )
}
