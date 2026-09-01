import type { CSSProperties } from 'react'
import type { Competition } from '../../engine/types.ts'
import { Gender, Phase } from '../../engine/types.ts'
import { formatMinutes } from '../../lib/time.ts'
import { RowHeightStep } from '../../store/viewState.ts'
import { categoryFill, categoryInk, resolveCanvasCategory, weaponMark } from './palette.ts'
import { phaseDisplay, stripAssignmentLabel } from './blockLabels.ts'
import type { BlockPlacement } from './lanes.ts'

/**
 * One block on the matrix canvas — FR-014, FR-016,
 * contracts/ui-contract.md §Encoding contract.
 *
 * ## Four channels, and they do not degrade together
 *
 * | Channel | Carries |
 * |---|---|
 * | Fill | Age category |
 * | Left edge-bar, plus a hatch on DE | Phase |
 * | Weapon mark | Weapon |
 * | Label prefix | Gender |
 *
 * As a block narrows the label text drops first, then the weapon mark, then
 * the gender prefix. Fill and the edge-bar never drop — they are what still
 * reads at the compact row height, where every text channel is gone.
 *
 * ## The two letter marks are two channels, and must look like it
 *
 * The weapon mark and the gender prefix are both single capitals, so `M` beside
 * `E` risks scanning as one string "ME" and collapsing two channels into one.
 * They are kept apart three ways at once: the weapon mark is a **bordered
 * chip** pinned at the block's left past the edge-bar, in a heavier weight and
 * a smaller size, separated by a gap; the gender prefix is plain text in the
 * label's own style, and is the first run of the label. A reader sees a chip
 * and then a word, not two adjacent capitals.
 *
 * They are also two elements rather than one, which is what makes the
 * degradation order expressible at all: merged into a single glyph they would
 * drop together and the contract's order would be lost.
 *
 * ## Paint comes from the palette, and from nowhere else
 *
 * `--block-fill` and `--block-ink` are set from `palette.ts` and consumed by
 * the element's own classes. They are the paint, not a decorative marker beside
 * a hardcoded colour: `data-category` names the category for a test, the custom
 * properties are what a person sees. `ROW_HEIGHT_PX` and the palette are the
 * only two homes a canvas visual constant has.
 *
 * ## The highlight is not a fifth channel
 *
 * `highlighted` says the scorecard metric under the pointer is driven by this
 * block (FR-029). That is a transient fact about the *pointer*, not about the
 * event, so it is drawn strictly outside the four channels: its own overlay
 * span, consulting neither `blockChannels` nor the palette, present at every
 * width and at the compact row height where every text channel is already gone.
 * Riding the degradation order would mean the narrow blocks — exactly the ones
 * a person is squinting at when they reach for the scorecard — were the ones
 * that could not answer.
 *
 * Its paint is the deliberate exception to "paint comes from the palette". No
 * single palette token can do this job: `--cat-y8` is `#648fb9` against a
 * `--ring` of `#6b7fa8`, so one colour would disappear on some of the sixteen
 * fills. The cue is a near-white ring with a dark ring inside it — UI chrome
 * tokens, of which one always reads whether the fill beneath it is the darkest
 * or the lightest. Being chrome rather than palette is itself the statement
 * that it encodes nothing about the event.
 */

/** Narrowest block that still carries the gender prefix. */
export const GENDER_PREFIX_MIN_WIDTH_PX = 14
/** Narrowest block that still carries the weapon mark. */
export const WEAPON_MARK_MIN_WIDTH_PX = 28
/** Narrowest block that still carries the label text. */
export const LABEL_TEXT_MIN_WIDTH_PX = 64

/** Which text channels a block of this width and row height can carry. */
export interface BlockChannels {
  labelText: boolean
  weaponMark: boolean
  labelPrefix: boolean
}

/**
 * The degradation order, executable. The compact row height drops every text
 * channel at any width — 16px of row leaves no room for a legible glyph, which
 * is the trade FR-018 makes for fitting more strips on screen.
 */
// The degradation order belongs with the component that draws it, and the
// committed T029 tests import it from here. Splitting it out to satisfy fast
// refresh would put the rule and the markup it governs in two files.
// eslint-disable-next-line react-refresh/only-export-components
export function blockChannels(widthPx: number, rowHeightStep: RowHeightStep): BlockChannels {
  if (rowHeightStep === RowHeightStep.COMPACT) {
    return { labelText: false, weaponMark: false, labelPrefix: false }
  }
  return {
    labelText: widthPx >= LABEL_TEXT_MIN_WIDTH_PX,
    weaponMark: widthPx >= WEAPON_MARK_MIN_WIDTH_PX,
    labelPrefix: widthPx >= GENDER_PREFIX_MIN_WIDTH_PX,
  }
}

/** The phases drawn with a DE hatch. Named rather than matched on a `DE` prefix, which `DEADLINE_CHECK` also starts with. */
const DE_PHASES: readonly Phase[] = [Phase.DE, Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16]

/** `pool` or `de` — the phase channel, coarsened to what the eye reads. */
function phaseKind(phase: Phase): 'pool' | 'de' {
  return DE_PHASES.includes(phase) ? 'de' : 'pool'
}

export interface EventBlockProps {
  competition: Competition
  /** `competitionLabel(competition)`, passed in so the canvas resolves it once. */
  label: string
  /** The day group this block draws in, 0-based. */
  day: number
  placement: BlockPlacement
  /** Window-relative pixels from `geometry.ts`. Neither axis is clamped. */
  x: number
  y: number
  width: number
  height: number
  rowHeightStep: RowHeightStep
  /**
   * The findings this block is implicated in, already narrowed by the canvas.
   * They belong in the accessible name because the tooltip cannot carry them:
   * its trigger is `aria-hidden`, so a keyboard or screen-reader user can read
   * every block on the grid and never learn that one is in trouble.
   */
  findings: string[]
  /**
   * Whether the scorecard metric under the pointer is driven by this block
   * (FR-029). Not a channel — see the highlight note in the module docblock.
   */
  highlighted?: boolean
}

export function EventBlock({
  competition,
  label,
  day,
  placement,
  x,
  y,
  width,
  height,
  rowHeightStep,
  findings,
  highlighted,
}: EventBlockProps) {
  const category = resolveCanvasCategory(competition.category, competition.vet_age_group)
  const kind = phaseKind(placement.phase)
  const channels = blockChannels(width, rowHeightStep)

  const name = [
    label,
    phaseDisplay(placement.phase),
    `Day ${day + 1}`,
    `${formatMinutes(placement.startMinutes)}–${formatMinutes(placement.endMinutes)}`,
    stripAssignmentLabel(placement.firstStrip, placement.stripCount, placement.overflow),
    ...(findings.length === 0
      ? []
      : [
          `${findings.length} finding${findings.length === 1 ? '' : 's'}: ${findings.join('; ')}`,
        ]),
  ].join(', ')

  // The fill and the ink travel as custom properties so the classes below can
  // consume them; React types style as CSSProperties, which has no index
  // signature for custom properties.
  const style = {
    left: x,
    top: y,
    width,
    height,
    '--block-fill': categoryFill(category),
    '--block-ink': categoryInk(category),
  } as CSSProperties

  const textSize = rowHeightStep === RowHeightStep.TALL ? 'text-[11px]' : 'text-[10px]'

  return (
    <div
      role="img"
      aria-label={name}
      data-event-block={`${competition.id}:${placement.phase}`}
      data-event-id={competition.id}
      data-day={day}
      data-phase={placement.phase}
      data-phase-kind={kind}
      data-category={category}
      data-start={placement.startMinutes}
      data-end={placement.endMinutes}
      data-strips={placement.stripCount}
      data-first-strip={placement.firstStrip}
      data-overflow={placement.overflow ? 'true' : undefined}
      data-highlighted={highlighted ? 'true' : undefined}
      className="absolute overflow-hidden rounded-[2px] bg-[var(--block-fill)] text-[var(--block-ink)]"
      style={style}
    >
      {/* The phase channel. Both parts are drawn in the block's own ink, so
          they hold their contrast on every one of the sixteen fills. */}
      <span
        data-edge-bar
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-[3px] bg-[var(--block-ink)]"
      />
      {kind === 'de' && (
        <span
          data-hatch
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent 0 3px, color-mix(in srgb, var(--block-ink) 22%, transparent) 3px 6px)',
          }}
        />
      )}

      {/* The scorecard's hover cue (FR-029). Solid, so it cannot be read as
          the dashed overflow border below; a ring rather than a wash, since a
          wash would change how the fill beneath it reads and the fill is the
          age-category channel. Drawn after the DE hatch so the hatch does not
          tint it, and before the overflow cue so both read at once on a block
          that is highlighted *and* overflowing: the dashed --block-ink border
          paints over the white ring with its own gaps showing through.

          `inset-0` rather than an inset ring on purpose: a block one or two
          pixels wide still paints its border box, where an inset one would
          collapse to nothing on exactly the blocks a person most needs the
          scorecard to point at. The cost of that choice, stated rather than
          left to be rediscovered: on a block under about 4px the 2px
          --background ring covers the whole border box, so a sub-4px block
          loses its category fill for as long as it is highlighted. Nothing
          here consults `blockChannels`. */}
      {highlighted && (
        <span
          data-highlight-cue
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2px]"
          style={{
            boxShadow: 'inset 0 0 0 2px var(--background), inset 0 0 0 3px var(--foreground)',
          }}
        />
      )}
      {/* The overflow cue. A block that found no run is drawn at strip 0 on top
          of whatever legitimately holds those strips, and without a cue an
          over-capacity day reads as an ordinary one — blocks quietly stacked,
          nothing saying anything failed to place. Dashed rather than a fill or
          an ink change, so it cannot be mistaken for the category or the phase
          channel. Last of the overlays, so a highlight cannot hide it. */}
      {placement.overflow && (
        <span
          data-overflow-cue
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[2px] border-2 border-dashed border-[var(--block-ink)]"
        />
      )}

      <div
        aria-hidden="true"
        className={`relative flex h-full items-center gap-1 overflow-hidden pl-[6px] pr-1 leading-none ${textSize}`}
      >
        {channels.weaponMark && (
          <span
            data-weapon-mark
            className="shrink-0 rounded-[2px] border border-current px-[3px] py-px text-[9px] font-bold"
          >
            {weaponMark(competition.weapon)}
          </span>
        )}
        {(channels.labelPrefix || channels.labelText) && (
          <span className="flex min-w-0 items-baseline gap-[3px] font-normal">
            {channels.labelPrefix && <span data-gender-prefix>{GENDER_PREFIXES[competition.gender]}</span>}
            {channels.labelText && <span data-label-text className="truncate">{label}</span>}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * The gender channel: the first run of the label, in the label's own style.
 * An exhaustive record rather than a first-letter slice, so a future `Gender`
 * member fails `tsc` here instead of silently taking whatever letter it starts
 * with — the same rule `palette.weaponMark` follows.
 */
const GENDER_PREFIXES: Record<Gender, string> = {
  [Gender.MEN]: 'M',
  [Gender.WOMEN]: 'W',
}
