import { useId } from 'react'
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui'
import { useStore } from '../../../store/store.ts'
import { DeMode } from '../../../engine/types.ts'
import { TYPE_DEFAULTS } from '../../../store/typeDefaults.ts'
import { PoolDurationSettings } from '../../sections/PoolDurationSettings.tsx'
import { SectionCaption } from '../../common/SectionCaption.tsx'

/** Standing rule 13 pill, matching TournamentPanel's — one pill shape per panel. */
const PILL_CLASSES =
  'rounded-full px-[14px] py-1.5 text-[12.5px] border-[1.5px] border-chrome-border bg-secondary ' +
  'data-[state=checked]:border-transparent data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground'

/** The Default pill's radio value. Not a `DeMode`, so it can never collide with
 *  an override: the group's value is `de_mode_override ?? FOLLOW_TYPE`. */
const FOLLOW_TYPE = 'FOLLOW_TYPE'

const DE_MODE_LABELS: Record<DeMode, string> = {
  [DeMode.STAGED]: 'Staged',
  [DeMode.SINGLE_STAGE]: 'Single',
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
 * DE mode has a third pill, Default, that returns `de_mode_override` to `null`
 * so the tournament follows its type again (handoff finding 6, owner decision
 * 2026-10-04). A hint beside the pills names what Default resolves to.
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

  const hintId = useId()

  return (
    <section aria-label="Settings" className="flex flex-col gap-4 py-0.5 text-[12.5px]">
      <div>
        {/* The table's figures are for a pool of 7 (METHODOLOGY §Pool Duration
            Estimation, Ops Manual p.17). */}
        <SectionCaption>Pool durations (pool of 7)</SectionCaption>
        <PoolDurationSettings />
      </div>

      <div>
        <SectionCaption>DE mode</SectionCaption>
        <div className="flex flex-col gap-[5px]">
          <RadioGroupPrimitive.Root
            aria-label="DE mode"
            value={deModeOverride ?? FOLLOW_TYPE}
            onValueChange={(value: string) =>
              setDeModeOverride(value === FOLLOW_TYPE ? null : (value as DeMode))
            }
            className="flex flex-wrap gap-[5px]"
          >
            {/* No per-pill `onClick`: the group's value is `deModeOverride ??
                FOLLOW_TYPE`, so the checked pill always equals the stored
                value and re-pressing it would write what is already stored.
                `onValueChange` covers every real change, mouse or arrow key. */}
            <RadioGroupPrimitive.Item
              value={FOLLOW_TYPE}
              aria-describedby={hintId}
              className={PILL_CLASSES}
            >
              Default
            </RadioGroupPrimitive.Item>
            <RadioGroupPrimitive.Item
              value={DeMode.STAGED}
              className={PILL_CLASSES}
            >
              Staged
            </RadioGroupPrimitive.Item>
            <RadioGroupPrimitive.Item
              value={DeMode.SINGLE_STAGE}
              className={PILL_CLASSES}
            >
              Single
            </RadioGroupPrimitive.Item>
          </RadioGroupPrimitive.Root>
          {/* Sibling of the group, never inside a pill: text inside an item
              would join that radio's accessible name and rename it. */}
          <p id={hintId} className="text-[11.5px] text-neutral-700">
            {`${tournamentType} default: ${DE_MODE_LABELS[TYPE_DEFAULTS[tournamentType].de_mode]}`}
          </p>
          {/* Team events ignore the mode (METHODOLOGY §DE Modes). Not in the
              Default radio's description, which names what Default resolves to. */}
          <p className="text-[11.5px] text-neutral-700">Team events always run single stage.</p>
        </div>
      </div>
    </section>
  )
}
