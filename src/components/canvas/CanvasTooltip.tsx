import type { Competition } from '../../engine/types.ts'
import { formatMinutes } from '../../lib/time.ts'
import { GENDER_DISPLAY, WEAPON_DISPLAY, categoryDisplay } from '../competitionLabels.ts'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx'
import { phaseDisplay, stripAssignmentLabel } from './blockLabels.ts'
import type { BlockPlacement } from './lanes.ts'

/**
 * The canvas tooltip — FR-022, contracts/ui-contract.md §Tooltip contract.
 *
 * ## One tooltip, and the canvas decides what it points at
 *
 * This is a *controlled* Radix tooltip on a zero-size anchor (research D3):
 * `open` is `target !== null` and the anchor is placed at whatever viewport
 * coordinates `MatrixCanvas` resolved. There is no trigger per block and no
 * listener per block — a hundred visible blocks mount exactly this one trigger,
 * which is what keeps hover off the per-block cost and what survives a future
 * move to `<canvas>` rendering, where there are no block elements to bind to.
 *
 * Radix earns its place here rather than a new dependency: `TooltipPrimitive`
 * portals its content, so the tooltip escapes the canvas's `overflow-hidden`
 * clip, and its collision detection flips the content near a viewport edge.
 * Both are behaviors FR-022 requires and neither is code this file writes.
 *
 * ## The tooltip is the fallback channel, not a repeat of the block
 *
 * `EventBlock` drops its label text, then its weapon mark, then its gender
 * prefix as a block narrows (FR-016). At 27px a block is a coloured bar with a
 * single letter, and this is the only surface that still says which event it is.
 * So every field is **unconditional**: the tooltip is handed no width, no row
 * height and no record of what the block drew, and therefore cannot gate a row
 * on any of them. A tooltip whose contents changed with the zoom would make the
 * organizer zoom to read it.
 *
 * ## Neither layer takes the pointer
 *
 * The anchor and the content are both `pointer-events: none`. The anchor sits
 * under the pointer by construction, and Radix's own hover handling on either
 * would fight the canvas handler that actually owns the gesture.
 */

/** Everything the tooltip shows, resolved by the canvas for one hovered block. */
export interface CanvasTooltipTarget {
  competition: Competition
  /** `competitionLabel(competition)`, resolved once by the canvas. */
  label: string
  /** The day group the block draws in, 0-based. */
  day: number
  placement: BlockPlacement
  /** Findings attached to this competition, already narrowed to this block. */
  findings: string[]
  /** Where the anchor sits, in viewport-relative pixels. */
  anchorX: number
  anchorY: number
}

export function CanvasTooltip({ target }: { target: CanvasTooltipTarget | null }) {
  return (
    <TooltipProvider>
      <Tooltip open={target !== null}>
        <TooltipTrigger asChild>
          <span
            aria-hidden="true"
            className="pointer-events-none fixed"
            style={{
              left: target?.anchorX ?? 0,
              top: target?.anchorY ?? 0,
              width: 0,
              height: 0,
            }}
          />
        </TooltipTrigger>
        {/* `open` is the only guard. Radix renders no content while a tooltip
            is closed, so a second `target !== null &&` around this element
            would look like belt and braces and in fact make `open` unfalsifiable
            — the content would stay out of the DOM even if `open` were stuck
            true. */}
        <TooltipContent
          side="top"
          align="center"
          className="pointer-events-none block max-w-sm items-start text-left"
        >
          {target !== null && <TooltipBody target={target} />}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * The contract's fields, in the order it lists them. Each value carries a
 * `data-tooltip-field` on the element whose whole text *is* that value, so a
 * test reads one field without matching on the surrounding prose.
 */
function TooltipBody({ target }: { target: CanvasTooltipTarget }) {
  const { competition, placement } = target
  const durationMinutes = placement.endMinutes - placement.startMinutes

  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      <Row label="Event" field="name" value={target.label} />
      <Row label="Weapon" field="weapon" value={WEAPON_DISPLAY[competition.weapon]} />
      <Row
        label="Category"
        field="category"
        value={categoryDisplay(competition.category, competition.event_type)}
      />
      <Row label="Gender" field="gender" value={GENDER_DISPLAY[competition.gender]} />
      <Row label="Day" field="day" value={`Day ${target.day + 1}`} />
      <Row label="Phase" field="phase" value={phaseDisplay(placement.phase)} />
      <Row label="Start" field="start" value={formatMinutes(placement.startMinutes)} />
      <Row label="End" field="end" value={formatMinutes(placement.endMinutes)} />
      <Row label="Duration" field="duration" value={`${durationMinutes} min`} />
      <Row
        label="Strips"
        field="strips"
        value={stripAssignmentLabel(
          placement.firstStrip,
          placement.stripCount,
          placement.overflow,
        )}
      />

      <dt className="font-medium opacity-70">Findings</dt>
      {/* An empty list says so rather than leaving the row blank: a blank row
          reads as "not loaded yet", and the whole point of the row is to answer
          whether this block is implicated in anything. */}
      <dd data-tooltip-field="findings" className="m-0">
        {target.findings.length === 0 ? (
          'No findings'
        ) : (
          <ul className="m-0 list-none space-y-0.5 p-0">
            {target.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        )}
      </dd>
    </dl>
  )
}

function Row({ label, field, value }: { label: string; field: string; value: string }) {
  return (
    <>
      <dt className="font-medium opacity-70">{label}</dt>
      <dd data-tooltip-field={field} className="m-0">
        {value}
      </dd>
    </>
  )
}
