import type { CSSProperties, MouseEvent, PointerEvent } from 'react'
import type { Competition } from '../../engine/types.ts'
import { Phase } from '../../engine/types.ts'
import { formatClock } from '../../lib/time.ts'
import type { BlockPlacement } from '../../layout/lanes.ts'
import { GENDER_DISPLAY, categoryDisplay, vetAgeGroupDisplay } from '../../lib/competitionLabels.ts'
import { WeaponTokenPart, weaponVar } from './weaponTokens.ts'
import { phaseDisplay, stripAssignmentLabel } from '../../lib/blockLabels.ts'

/**
 * One block on the canvas — FR-035 to FR-037, FR-043,
 * contracts/ui-contract.md §Canvas encoding contract.
 *
 * ## Five channels, and none of them is the age category
 *
 * | Channel | Carries |
 * |---|---|
 * | Fill, ink and edge | Weapon |
 * | 45° hatch, plus the icon | Phase — a bracket for a DE, a bout grid for pools |
 * | Name text | Category and gender, at whatever length the room allows |
 * | Pin badge | Pinned |
 * | Dashed edge / ring | Overflow / selection |
 *
 * 004's block component painted the age category across sixteen fills and put the
 * weapon in a one-letter chip. Research D4 inverts that: weapon is the thing a
 * reader tracks across a day, three fills are three fills a person can actually
 * learn, and sixteen category fills were never distinguishable from each other
 * at a 15px row. The category did not lose its channel — it moved into the
 * name, which is the last thing a shrinking block gives up.
 *
 * ## Paint comes from the weapon tokens, and from nowhere else
 *
 * `--block-fill`, `--block-ink`, `--block-edge` and `--block-hatch` are set from
 * `weaponTokens.ts` and consumed by this element's own styles. No hex literal
 * and no age-category token name reaches this file: the tokens in `src/index.css` are
 * the single home for the colours (standing rule 13).
 *
 * ## Nothing here drags, and nothing resizes (FR-043)
 *
 * The engine owns placement. A resize handle or a pointer-down that moved a
 * block would be an affordance for an edit this phase does not make, and one
 * the user could not undo — so there is no pointer handler on this element at
 * all beyond the hover the canvas wires for the tooltip.
 */

/** The phases drawn with a DE hatch and the bracket icon. Named rather than matched on a `DE` prefix, which `DEADLINE_CHECK` also starts with. */
const DE_PHASES: readonly Phase[] = [Phase.DE, Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16]

/** `pool` or `de` — the phase channel, coarsened to what the eye reads. */
function phaseKind(phase: Phase): 'pool' | 'de' {
  return DE_PHASES.includes(phase) ? 'de' : 'pool'
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/**
 * The middle rung of the label ladder: category and gender, without the weapon
 * or the event type.
 *
 * Those two are the pair the encoding contract puts in the name text; the
 * weapon is already the block's own fill and edge, and "Individual" is what
 * every block on a NAC is. Dropping them first is dropping what the block
 * already says twice.
 */
function shortCompetitionLabel(competition: Competition): string {
  const category = categoryDisplay(competition.category, competition.event_type)
  const vetSuffix = competition.vet_age_group ? ` ${vetAgeGroupDisplay(competition.vet_age_group)}` : ''
  return `${category}${vetSuffix} ${GENDER_DISPLAY[competition.gender]}`
}

export interface BlockProps {
  competition: Competition
  /** `competitionLabel(competition)`, resolved once by the canvas. */
  label: string
  placement: BlockPlacement
  pinned: boolean
  selected: boolean
  flash?: boolean
  /**
   * The block's drawn width in pixels, or null when it has not been measured.
   * Under Fit day the canvas positions in percent and the browser owns the
   * solve, so this is the canvas's estimate of what that solve produced — used
   * only to decide how much of the name fits, never for geometry. Null shows
   * the full label: there is no room to judge it against.
   */
  widthPx: number | null
  /** `placement.stripCount * rungAt(zoomStep).row`. */
  heightPx: number
  /** Absolute position, as the canvas solved it. */
  style: CSSProperties
  /**
   * The findings this block is implicated in, already narrowed by the canvas.
   * They belong in the accessible name because the tooltip cannot carry them:
   * its trigger is `aria-hidden`, so a keyboard or screen-reader user can read
   * every block on the grid and never learn that one is in trouble.
   */
  findings: string[]
  onPointerEnter?: (e: PointerEvent<HTMLDivElement>) => void
  onPointerLeave?: (e: PointerEvent<HTMLDivElement>) => void
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

export function Block({
  competition,
  label,
  placement,
  pinned,
  selected,
  flash = false,
  widthPx,
  heightPx,
  style,
  findings,
  onPointerEnter,
  onPointerLeave,
  onClick,
}: BlockProps) {
  const kind = phaseKind(placement.phase)

  const name = [
    label,
    phaseDisplay(placement.phase),
    `Day ${placement.day + 1}`,
    `${formatClock(placement.startMinutes)}–${formatClock(placement.endMinutes)}`,
    stripAssignmentLabel(placement.firstStrip, placement.stripCount, placement.overflow),
    ...(findings.length === 0
      ? []
      : [`${findings.length} finding${findings.length === 1 ? '' : 's'}: ${findings.join('; ')}`]),
  ].join(', ')

  // Content scale follows the block, not the zoom rung (mockup lines
  // 1240-1258). Sizing the glyph and the type from the rung alone left a
  // zoomed-out block carrying full-size furniture inside a shrinking box, so
  // wide blocks truncated their names for room the icon had taken.
  const rowHeightPx = heightPx / Math.max(1, placement.stripCount)
  const contentHeightPx = Math.max(0, heightPx - 8)
  const namePx = clamp(
    Math.max(rowHeightPx * 0.46, Math.min(contentHeightPx * 0.34, 19)),
    10,
    20,
  )
  const iconPx = Math.round(
    clamp(Math.min(contentHeightPx * 0.42, 22), 0, Math.max(10, contentHeightPx - 2)),
  )
  // The inner flex's own padding (mockup: round(clamp(rowH*0.2, 6, 11)) per
  // side), needed again below to size an icon standing alone with no label
  // beside it, and applied to the flex itself so the two stay true to each
  // other (T027 follow-up 2: a static px-2 class charged 8px regardless of
  // this value, so the icon-alone math was sizing against room the block did
  // not actually have).
  const padding = Math.round(clamp(rowHeightPx * 0.2, 6, 11))
  // The inner flex's own gap (mockup: round(clamp(rowH*0.16, 4, 9))), applied
  // the same way — a static gap-2 class was always charged even when no
  // label rendered beside the icon.
  const gap = Math.round(clamp(rowHeightPx * 0.16, 4, 9))
  // A pool grid is only distinguishable from a DE bracket above roughly 10px,
  // so below that the phase channel drops to the hatch alone. This is the
  // *icon-beside-name* tier: icon room plus a 9px gap plus space for the name.
  const showIcon = iconPx >= 10 && (widthPx === null || widthPx > iconPx + 26)
  // Width the furniture has already claimed, so the name is judged only
  // against the room actually left for it.
  const taken = (showIcon ? iconPx + 9 : 0) + 22
  const fits = (text: string): boolean =>
    widthPx === null || widthPx > text.length * namePx * 0.54 + taken

  const shortLabel = shortCompetitionLabel(competition)
  const categoryLabel = categoryDisplay(competition.category, competition.event_type)
  let labelText = ''
  if (fits(label)) labelText = label
  else if (fits(shortLabel)) labelText = shortLabel
  else if (fits(categoryLabel)) labelText = categoryLabel

  // Four label tiers, not three: full name, short name, category alone, and
  // — when even the category does not fit — the icon standing alone. A block
  // this narrow still has the phase channel to give, so FR-035's "neither"
  // tier is reserved for blocks too narrow even for a shrunk glyph: below a
  // 10px floor the icon is dropped and the block goes blank.
  //
  // `widthPx === null` never reaches this branch: `fits()` returns true
  // unconditionally when widthPx is null, so labelText is always the full
  // label in that case and the `!showIcon && labelText === ''` guard below
  // is never both true. The `widthPx !== null` check exists only to narrow
  // the type for the arithmetic that follows.
  let iconAlonePx = 0
  if (!showIcon && labelText === '' && widthPx !== null) {
    const shrunk = Math.min(iconPx, widthPx - 2 * padding)
    iconAlonePx = shrunk >= 10 ? shrunk : 0
  }
  const displayIconPx = showIcon ? iconPx : iconAlonePx
  const renderIcon = displayIconPx > 0

  // The four paint channels travel as custom properties so the styles below
  // can consume them; React types style as CSSProperties, which has no index
  // signature for custom properties.
  const blockStyle = {
    ...style,
    '--block-fill': weaponVar(competition.weapon, WeaponTokenPart.FILL),
    '--block-ink': weaponVar(competition.weapon, WeaponTokenPart.INK),
    '--block-edge': weaponVar(competition.weapon, WeaponTokenPart.EDGE),
    '--block-hatch': weaponVar(competition.weapon, WeaponTokenPart.HATCH),
    background: 'var(--block-fill)',
    color: 'var(--block-ink)',
    // An unplaced block goes dashed; a placed one keeps a solid edge, so the
    // two states never read alike (mockup line 1287).
    border: placement.overflow ? '2px dashed var(--block-edge)' : '1.5px solid var(--block-edge)',
    borderStyle: placement.overflow ? 'dashed' : 'solid',
    borderRadius: 5,
    boxSizing: 'border-box',
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(43, 43, 45, .07)',
  } as CSSProperties

  return (
    <div
      role="img"
      aria-label={name}
      data-event-block={`${competition.id}:${placement.phase}`}
      data-event-id={competition.id}
      data-day={placement.day}
      data-phase={placement.phase}
      data-phase-kind={kind}
      data-start={placement.startMinutes}
      data-end={placement.endMinutes}
      data-strips={placement.stripCount}
      data-first-strip={placement.firstStrip}
      data-overflow={placement.overflow ? 'true' : 'false'}
      data-weapon={competition.weapon}
      data-pinned={pinned ? 'true' : 'false'}
      data-selected={selected ? 'true' : 'false'}
      data-flash={flash ? 'true' : 'false'}
      style={blockStyle}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      {kind === 'de' && (
        <span
          data-hatch
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, transparent 0 5px, var(--block-hatch) 5px 10px)',
          }}
        />
      )}

      {pinned && (
        <span
          data-pin-glyph
          aria-hidden="true"
          className="absolute top-1 right-[5px] z-[2] flex items-center justify-center rounded-[5px]"
          style={{ width: 15, height: 15, background: 'var(--block-edge)', color: '#fff' }}
        >
          <PinGlyph />
        </span>
      )}

      {selected && (
        <span
          data-ring
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[1.5px] rounded-[6px] border-[2.5px] border-accent-700"
        />
      )}

      {/* A Findings jump's flash (013 T032 follow-up, contract §4.4). Drawn as
          a child rather than a shadow on the block itself, the same reason
          the selection ring is a child: `blockStyle` is a whole-value style
          hole assembled once per render, so a shadow toggled there would
          never repaint after mount (mockup comment above `flashBlocks`). */}
      {flash && (
        <span
          data-flash-ring
          aria-hidden="true"
          className="pointer-events-none absolute -inset-[3px] z-[3] rounded-[8px]"
          style={{
            border: '3px solid var(--flash)',
            boxShadow: '0 0 0 4px color-mix(in srgb, var(--flash) 22%, transparent)',
          }}
        />
      )}

      <div
        aria-hidden="true"
        data-content
        className="relative flex h-full items-center justify-center overflow-hidden leading-none"
        style={{ padding: `0 ${padding}px`, gap: `${gap}px` }}
      >
        {renderIcon && (
          <span
            data-icon={kind === 'de' ? 'bracket' : 'grid'}
            className="block flex-none self-center"
            style={{ width: displayIconPx, height: displayIconPx, lineHeight: 0 }}
          >
            {kind === 'de' ? <BracketIcon /> : <GridIcon />}
          </span>
        )}
        {labelText !== '' && (
          <span
            data-label
            className="overflow-hidden font-semibold text-ellipsis whitespace-nowrap"
            style={{ fontSize: `${namePx.toFixed(1)}px`, lineHeight: 1 }}
          >
            {labelText}
          </span>
        )}
      </div>
    </div>
  )
}

/** The DE bracket, from the mockup (line 322). */
function BracketIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2 3h5" />
      <path d="M2 9h5" />
      <path d="M2 15h5" />
      <path d="M2 21h5" />
      <path d="M7 3v6" />
      <path d="M7 15v6" />
      <path d="M7 6h5" />
      <path d="M7 18h5" />
      <path d="M12 6v12" />
      <path d="M12 12h9" />
    </svg>
  )
}

/** The pool bout chart, from the mockup (line 327). */
function GridIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      <path d="M3 3h6v6H3zM9 9h6v6H9zM15 15h6v6h-6z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** The pin badge, from the mockup (line 315). */
function PinGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 17v5" />
      <path d="M9 10.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}
