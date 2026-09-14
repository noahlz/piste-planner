import type { Competition } from '../../engine/types.ts'
import { formatMinutes } from '../../lib/time.ts'
import { phaseDisplay, stripAssignmentLabel } from '../../lib/blockLabels.ts'
import { GENDER_DISPLAY, WEAPON_DISPLAY, categoryDisplay } from '../../lib/competitionLabels.ts'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip.tsx'
import type { BlockPlacement } from '../../layout/lanes.ts'

/**
 * The canvas tooltip — FR-022, contracts/ui-contract.md §Tooltip contract.
 *
 * ## One tooltip, and the canvas decides what it points at
 *
 * This is a *controlled* Radix tooltip on a zero-size anchor (research D3):
 * `open` is `target !== null` and the anchor is placed at whatever viewport
 * coordinates `Canvas` resolved. There is still exactly one Radix trigger for
 * the whole grid; 013 T026 moved the *gesture* onto the blocks themselves,
 * because the redesigned canvas scrolls natively and a scroller-relative
 * hit-test would have to undo the browser's own scroll offsets on both axes to
 * find a block the DOM already knows the pointer is over.
 *
 * Radix earns its place here rather than a new dependency: `TooltipPrimitive`
 * portals its content, so the tooltip escapes the canvas's `overflow-hidden`
 * clip, and its collision detection flips the content near a viewport edge.
 * Both are behaviors FR-022 requires and neither is code this file writes.
 *
 * ## The tooltip is the fallback channel, not a repeat of the block
 *
 * `Block` drops the event type, then the weapon, then the gender as a block
 * narrows (FR-035). At its narrowest a block is a coloured bar with an icon,
 * and this is the only surface that still says which event it is.
 * So every field is **unconditional**: the tooltip is handed no width, no row
 * height and no record of what the block drew, and therefore cannot gate a row
 * on any of them. A tooltip whose contents changed with the zoom would make the
 * organizer zoom to read it.
 *
 * ## No layer takes the pointer — and there are three of them
 *
 * The anchor and the content are both `pointer-events: none`. The anchor sits
 * under the pointer by construction, and Radix's own hover handling on either
 * would fight the canvas handler that actually owns the gesture.
 *
 * Between the portal and the content sits a third layer this file does not
 * render: Radix's positioning wrapper, `div[data-radix-popper-content-wrapper]`.
 * It takes no `className` and `@radix-ui/react-popper@1.2.8` exposes no prop
 * for it, so it stayed hit-testable while the two layers around it did not —
 * see `releasePopperWrapper` below for why that closed the tooltip it had just
 * opened.
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

/**
 * Takes Radix's positioning wrapper out of hit testing.
 *
 * `Canvas` owns the hover gesture and clears it on the block's own
 * `pointerleave`, so *any* element that takes the pointer over the block
 * closes the tooltip. `side="top"` keeps the content itself clear of the
 * pointer only while there is room above the block: near the top of the plot
 * Radix's collision detection flips the content to `bottom`, and the wrapper's
 * rect then covers the pointer resting on the block it describes. The viewport
 * gets `pointerleave` with `relatedTarget` reading
 * `<div data-radix-popper-content-wrapper>`, `hovered` goes to null, and the
 * tooltip closes about 20ms after it opened — with the pointer never having
 * moved.
 *
 * Written imperatively because the wrapper is Radix's own element: it accepts
 * no `className` and no `style`, and the only handle on it is the content ref
 * React runs once the content is in the DOM. Radix (`@radix-ui/react-popper@1.2.8`)
 * never puts `pointer-events` in that wrapper's style object on the open path,
 * so React's style diffing has nothing here to overwrite.
 *
 * That survives only because `TooltipContent` below never passes
 * `hideWhenDetached`. With it true, `@radix-ui/react-popper@1.2.8` writes
 * `pointerEvents` into the wrapper's own style object once the anchor goes
 * off-screen (`react-popper`'s `index.mjs:161-164`), and React's style diffing
 * then clears that key the next time the anchor is back on-screen — wiping
 * this override along with it. Anyone adding that prop reintroduces the
 * closing bug.
 *
 * Exported for its own test: the DOM shape it depends on — a wrapper carrying
 * `data-radix-popper-content-wrapper` — is Radix's to change without notice,
 * so a change of shape warns in dev rather than silently leaving the tooltip
 * closable again.
 */
// The ref callback belongs with the component whose content ref it runs on,
// and the test above imports it from here. Splitting it out to satisfy fast
// refresh would put the Radix workaround and the markup it governs in two files.
// eslint-disable-next-line react-refresh/only-export-components
export function releasePopperWrapper(content: HTMLDivElement | null): void {
  const wrapper = content?.parentElement
  if (content && !wrapper?.hasAttribute('data-radix-popper-content-wrapper')) {
    if (import.meta.env.DEV) {
      console.warn(
        '[CanvasTooltip] expected the tooltip content\'s parent to be Radix\'s ' +
          '`div[data-radix-popper-content-wrapper]`, but it was not found. The ' +
          'tooltip may close under the pointer.',
      )
    }
    return
  }
  wrapper?.style.setProperty('pointer-events', 'none')
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
          ref={releasePopperWrapper}
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
