import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useStore } from '../../../store/store.ts'
import { DeMode } from '../../../engine/types.ts'
import { TYPE_DEFAULTS } from '../../../store/typeDefaults.ts'
import { DefaultLabel } from '@/components/common/DefaultLabel'
import { PoolDurationSettings } from '../../sections/PoolDurationSettings.tsx'

/** Standing rule 13 pill, matching TournamentPanel's — one pill shape per panel. */
const PILL_CLASSES =
  'rounded-full px-[13px] py-1.5 text-[12.5px] border-[1.5px] border-chrome-border bg-white ' +
  'data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground'

/** Section caption above each field group (standing rule 13, as TournamentPanel). */
function SectionCaption({ children }: { children: string }) {
  return (
    <div className="mb-[7px] text-[11.5px] font-semibold tracking-[.06em] text-neutral-600 uppercase">
      {children}
    </div>
  )
}

/**
 * The Settings inspector panel (013 T022, FR-029–FR-031, FR-063): pool round
 * durations, and the tournament's DE mode.
 *
 * It replaces `components/workbench/SettingsPanel.tsx`, whose two rows wrote
 * to the store's global-overrides slice — deleted in this task (research D7). Of the
 * seven settings that slice carried, five could not move the derived schedule
 * at all and the sixth moved it off `de_duration_table`'s own calibration;
 * `buildConfig.ts` now reads all seven from `constants.ts`. What earns a row
 * back is engine work first, recorded in `docs/design/backlog.md`.
 *
 * `PoolDurationSettings` is mounted unchanged (FR-043, research D13) — it
 * brings its own `region` and its own per-weapon revert behaviour, so this
 * panel only places it under the caption.
 *
 * Video strips are deliberately absent even though the mockup draws them
 * here: the Strips panel (T018) is their one writer, and two controls on one
 * field is how the app comes to state one count and schedule another.
 */
export function SettingsPanel() {
  const tournamentType = useStore((s) => s.tournament_type)
  const deModeOverride = useStore((s) => s.de_mode_override)
  const setDeModeOverride = useStore((s) => s.setDeModeOverride)

  // The resolved mode is what the pills show; the override is what decides
  // whether it reads as a default. Comparing the resolved mode against the
  // type default instead would mislabel a deliberate choice that happens to
  // agree with the type — and that choice outlives a type change, where a
  // `null` would not (buildConfig.ts resolves `null` per render).
  const resolved = deModeOverride ?? TYPE_DEFAULTS[tournamentType].de_mode

  return (
    <section aria-label="Settings" className="flex flex-col gap-4 text-[12.5px]">
      <div>
        <SectionCaption>Pool durations</SectionCaption>
        <PoolDurationSettings />
      </div>

      <div>
        <SectionCaption>DE mode</SectionCaption>
        <div className="flex items-center gap-[5px]">
          <RadioGroupPrimitive.Root
            aria-label="DE mode"
            value={resolved}
            onValueChange={(value: string) => setDeModeOverride(value as DeMode)}
            className="flex flex-wrap gap-[5px]"
          >
            {/* `onClick` as well as the group's `onValueChange`, because the
                two fire in different cases and both are a real choice here.
                Radix raises `onValueChange` only when the value *changes*, so
                pressing the pill that is already checked — the one showing
                Default, because the type resolves to it — would otherwise do
                nothing, and the organizer who means "staged, and stay staged
                if I change the type later" has no way to say it. Clicking
                either pill writes the override; the writes agree, so the two
                handlers firing together is idempotent. */}
            <RadioGroupPrimitive.Item
              value={DeMode.STAGED}
              onClick={() => setDeModeOverride(DeMode.STAGED)}
              className={PILL_CLASSES}
            >
              Staged
            </RadioGroupPrimitive.Item>
            <RadioGroupPrimitive.Item
              value={DeMode.SINGLE_STAGE}
              onClick={() => setDeModeOverride(DeMode.SINGLE_STAGE)}
              className={PILL_CLASSES}
            >
              Single
            </RadioGroupPrimitive.Item>
          </RadioGroupPrimitive.Root>
          {/* Sibling of the group, never inside a pill: a badge inside an item
              would join that radio's accessible name and rename it. */}
          <DefaultLabel isDefault={deModeOverride === null} />
        </div>
      </div>
    </section>
  )
}
