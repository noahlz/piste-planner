import type { CSSProperties } from 'react'
import type { Competition } from '../../engine/types.ts'
import { Gender, Phase } from '../../engine/types.ts'
import { formatMinutes } from '../../lib/time.ts'
import { RowHeightStep } from '../../store/viewState.ts'
import { categoryFill, categoryInk, resolveCanvasCategory, weaponMark } from './palette.ts'
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

/**
 * Phase names for the accessible name. Only the six phases
 * `eventTimeSegments` emits can reach a block, so the fallback is unreachable
 * rather than lenient — it exists because `BlockPlacement.phase` is the whole
 * `Phase` union.
 */
const PHASE_LABELS: Partial<Record<Phase, string>> = {
  [Phase.POOLS]: 'Pools',
  [Phase.FLIGHT_A]: 'Flight A',
  [Phase.FLIGHT_B]: 'Flight B',
  [Phase.DE_PRELIMS]: 'DE prelims',
  [Phase.DE_ROUND_OF_16]: 'DE round of 16',
  [Phase.DE]: 'DE',
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
}: EventBlockProps) {
  const category = resolveCanvasCategory(competition.category, competition.vet_age_group)
  const kind = phaseKind(placement.phase)
  const channels = blockChannels(width, rowHeightStep)

  const firstStrip = placement.firstStrip + 1
  const lastStrip = placement.firstStrip + placement.stripCount
  const stripRange = firstStrip === lastStrip ? `Strip ${firstStrip}` : `Strips ${firstStrip}–${lastStrip}`
  const name = [
    label,
    PHASE_LABELS[placement.phase] ?? placement.phase,
    `Day ${day + 1}`,
    `${formatMinutes(placement.startMinutes)}–${formatMinutes(placement.endMinutes)}`,
    stripRange,
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
