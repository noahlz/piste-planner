import { useStore } from '../../store/store.ts'
import type { GlobalOverrides } from '../../store/store.ts'
import { ADMIN_GAP_MINS, FLIGHT_BUFFER_MINS, DEFAULT_DE_STRIP_FOOTPRINT } from '../../engine/constants.ts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { NumberInput } from '@/components/ui/number-input'
import { DefaultLabel } from '@/components/common/DefaultLabel'
import { PoolDurationSettings } from '../sections/PoolDurationSettings.tsx'
import { RotateCcw } from 'lucide-react'

/**
 * Every `GlobalOverrides` key that holds a plain number. Derived from the value
 * types rather than by excluding `DE_BOUT_DURATION` by name (T079 finding 4):
 * an exclusion admits a future non-number key – `SOME_FLAG: boolean` – into a
 * row that writes a number into it, and typechecks.
 */
type ScalarKey = {
  [K in keyof GlobalOverrides]: GlobalOverrides[K] extends number ? K : never
}[keyof GlobalOverrides]

/**
 * `min`/`max` are per-row and required, matching `PoolDurationSettings`'
 * bounded rows (T079 finding 6). Every row is rendered `rejectOutOfRange`, so
 * one panel has one answer to an out-of-range entry – restore the last
 * committed value – rather than rejecting in the pool half and silently
 * committing a clamped number the organizer never typed in the gears half.
 */
type SettingRowSpec = {
  key: ScalarKey
  label: string
  default: number
  unit: string
  min: number
  max: number
}

// Order and strings are fixed by the US5 contract (§5, FR-042) – the smoke
// driver and this panel's tests both locate rows by this label/aria-label text.
const ROWS = [
  // Both gaps are minutes inserted at a phase boundary, so the ceiling is a
  // fraction of a competition day rather than an engine limit – 240 leaves a
  // fat-fingered 500 rejected at the input instead of pushing DE phases off
  // the day window with no feedback.
  { key: 'ADMIN_GAP_MINS', label: 'Admin gap', default: ADMIN_GAP_MINS, unit: 'min', min: 0, max: 240 },
  {
    key: 'FLIGHT_BUFFER_MINS',
    label: 'Flight buffer',
    default: FLIGHT_BUFFER_MINS,
    unit: 'min',
    min: 0,
    max: 240,
  },
  {
    key: 'DEFAULT_DE_STRIP_FOOTPRINT',
    label: 'DE strip footprint',
    default: DEFAULT_DE_STRIP_FOOTPRINT,
    unit: 'strips',
    // A DE phase always asks for at least one strip (`deStripFootprint` floors
    // at 1), and 64 is bracketSize/2 for the largest bracket the engine builds.
    min: 1,
    max: 64,
  },
] as const satisfies readonly SettingRowSpec[]

/**
 * Keys deliberately given no row, each with the reason it cannot act on the
 * derived schedule today (T078 measured each one: changing it produces a
 * byte-identical `ScheduleResult`). FR-046 requires a setting to move the
 * schedule, and a control that silently does nothing is worse than an absent
 * one, so the editing surface is withdrawn while the store, `buildConfig` and
 * serialization keep carrying the value. The engine work that would earn these
 * rows back is in `docs/design/backlog.md` under "Global settings".
 */
type NotSurfacedKey =
  // No reader anywhere in `src/engine/`. `flighting.ts` decides by pool count
  // against `strips_total`, never by minutes – nothing consumes this.
  | 'THRESHOLD_MINS'
  // `config.SLOT_MINS` is read nowhere. The only slot consumer is `snapToSlot`
  // (`src/engine/resources.ts`), which closes over the module constant.
  | 'SLOT_MINS'
  // Only read by `perBoutDuration` (`src/engine/de.ts`), which has no caller.
  | 'YOUTH_VET_BOUT_DELTA'
  // Read once, in `capacity.ts`'s `EventType.TEAM` branch. Individual DE
  // duration comes from `config.de_duration_table`, so on an individual-only
  // tournament these do nothing – the value still travels for team estimates.
  | 'DE_BOUT_DURATION'

/** Fails to satisfy its constraint – and so fails `tsc` – for any type but `never`. */
type AssertNever<T extends never> = T

/**
 * Compile-time exhaustiveness (T079 finding 3). A new `GlobalOverrides` key
 * gets either a row in `ROWS` or an explicit, reasoned member of
 * `NotSurfacedKey`; with neither, `Exclude` leaves it behind and this alias
 * stops typechecking, naming the key. Without it the next key becomes the next
 * `video_strips_total` – serialized and shared, with no UI and a green suite.
 *
 * Exported only so `noUnusedLocals` cannot strip the check as an unused local.
 * Nothing imports it and nothing should.
 */
export type EveryOverrideKeyIsAccountedFor = AssertNever<
  Exclude<keyof GlobalOverrides, (typeof ROWS)[number]['key'] | NotSurfacedKey>
>

/**
 * The gears panel (US5, FR-041/042/043/047): the engine settings the organizer
 * can retune and that actually reach the schedule, followed by
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
            const value = globalOverrides[row.key]
            const isDefault = value === row.default
            const inputId = `gear-${row.key}`

            function commit(next: number) {
              // Written through an indexed assignment rather than a computed-key
              // literal plus a cast (T079 finding 4): a computed key widens to
              // `{ [k: string]: number }` and the cast that repairs it also
              // discards the check that `row.key` holds a number at all.
              const patch: Partial<GlobalOverrides> = {}
              patch[row.key] = next
              setGlobalOverrides(patch)
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
                  min={row.min}
                  max={row.max}
                  rejectOutOfRange
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
