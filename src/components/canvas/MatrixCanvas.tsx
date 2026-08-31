import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react'
import { flushSync } from 'react-dom'
import { DAY_END_MINS, DAY_START_MINS } from '../../engine/constants.ts'
import { useStore } from '../../store/store.ts'
import {
  selectDerivedFindings,
  selectDerivedSchedule,
  type DerivedFindings,
  type DerivedSchedule,
} from '../../store/derived.ts'
import {
  RowHeightStep,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../../store/viewState.ts'
import {
  ROW_HEIGHT_PX,
  blockHeight,
  blockWidth,
  blockX,
  blockY,
  eventTimeSegments,
} from './geometry.ts'
import {
  buildDayLayout,
  flatRowIndex,
  intersectsTimeRange,
  maxRowScroll,
  resolveFlatRow,
  visibleRowRange,
  visibleTimeRange,
  type TimeRange,
} from './windowing.ts'
import { assignStripLanes, type BlockPlacement } from './lanes.ts'
import { EventBlock } from './EventBlock.tsx'
import { CanvasTooltip, type CanvasTooltipTarget } from './CanvasTooltip.tsx'
import { competitionLabel } from '../competitionLabels.ts'
import type { Competition, Phase } from '../../engine/types.ts'
import {
  clampTimeZoom,
  fitToDay,
  fitToTournament,
  hourTicks,
  stepRowHeight,
  zoomAtCursor,
  zoomToSelection,
  type AxisTick,
  type TimeWindow,
} from './zoom.ts'

/**
 * The matrix canvas — FR-012, FR-017 through FR-021.
 *
 * Strips run down, time runs right, day groups stack. The grid is plain SVG the
 * component builds itself with no charting dependency (research D1) and no
 * virtualization library (research D2); every scale, tick and window is
 * arithmetic imported from `geometry.ts`, `windowing.ts` and `zoom.ts`, none of
 * it re-derived here.
 *
 * ## The header is an overlay in row space, with one uniform offset in pixels
 *
 * `windowing.ts` fixes `rowsPerDay === stripsTotal` — the day header band gets
 * no row of its own, and the hour axis FR-017 pins "at the top of each day
 * group" rides in the same floating overlay. What would break `blockY` is a
 * *non-uniform* offset: a band taking real layout between day groups would put
 * a different correction under every day, and no row-space arithmetic could
 * express it.
 *
 * One offset applied everywhere is a different matter, and it is what the rows
 * need — the band is drawn over the top `HEADER_HEIGHT_PX` of the viewport, so
 * without it the first strip of every day group is permanently hidden and the
 * second half-cut. The gutter, the grid and the block layer therefore all start
 * `HEADER_HEIGHT_PX` down and are `HEADER_HEIGHT_PX` shorter, and every
 * position measured in row space keeps its expression unchanged. The bands'
 * own `headerTop` is unchanged too: a day's band sits `HEADER_HEIGHT_PX` above
 * its first row, which is exactly what the existing formula produces once the
 * rows have moved down.
 *
 * ## Two scrolls, neither of them native
 *
 * Row position (`rowScroll`, a flat row index) and time position (`timeScroll`,
 * minutes from midnight) are both view state, not `scrollTop`/`scrollLeft`. So
 * the strip gutter is frozen and the day bands are sticky by construction: they
 * are positioned from the window rather than translated with it.
 *
 * ## The wheel is ours, and it is not React's
 *
 * React registers `wheel` as a *passive* listener, so an `onWheel` prop can
 * never call `preventDefault` and a ctrl+wheel zoom would zoom the browser page
 * as well as the canvas. The listener is therefore attached by hand with
 * `{ passive: false }`. The viewport owns the gesture outright: it is
 * `overflow-hidden` and both scroll positions are view state, so there is no
 * ancestor scroller with a claim on it.
 *
 * ## Hover is resolved by arithmetic, not by the DOM
 *
 * One `onPointerMove` on the viewport hit-tests the pointer against the block
 * rectangles this render already computed (research D3). It does not read
 * layout, and it does not walk up from `event.target` — both would tie hover to
 * there being a DOM element per block, which is the thing a later move to
 * `<canvas>` rendering removes. The cost is one handler and one comparison per
 * visible block, rather than a listener and a positioning context on each.
 *
 * A client coordinate becomes a plot coordinate by subtracting the viewport's
 * own offset and then the two frozen layers: the gutter on x, the day band's
 * `HEADER_HEIGHT_PX` on y. That is the same pair the block layer is positioned
 * by, so the two cannot disagree about where a block is.
 *
 * ## What mounts it
 *
 * `CenterView`'s Matrix ⇄ Schedule toggle (T040), which hands it the committed
 * schedule and findings the schedule table reads — one model, two views.
 */

/** Width of the frozen strip-label gutter, in pixels. */
const GUTTER_WIDTH_PX = 72

/** The floating day band and the hour axis pinned under it. */
const DAY_BAND_HEIGHT_PX = 20
const AXIS_HEIGHT_PX = 18
const HEADER_HEIGHT_PX = DAY_BAND_HEIGHT_PX + AXIS_HEIGHT_PX

/**
 * Zoom factor per button click or wheel notch. Coarse on purpose — the buttons
 * are for getting somewhere, and a modified wheel gives continuous control from
 * wherever a click lands.
 */
const ZOOM_STEP_FACTOR = 2

/**
 * How long after the last wheel event a gesture's window reaches localStorage.
 *
 * A wheel fires 60-120 events a second and `writeNow` is a parse, a stringify
 * and a synchronous `setItem`. `Drawer.tsx` answers the same problem the same
 * way, persisting once on pointer-up rather than on every pointer-move. Only
 * the storage write waits — the state updates stay synchronous, so the canvas
 * still follows the gesture frame by frame.
 */
export const PERSIST_DEBOUNCE_MS = 200

/**
 * Pixels one `DOM_DELTA_LINE` wheel notch stands for. Firefox on Windows and
 * Linux reports lines rather than pixels, at a `deltaY` of 3 per notch: read as
 * pixels that is an eighth of a row, which rounds away to nothing and leaves
 * row panning completely dead on those platforms.
 */
const WHEEL_LINE_HEIGHT_PX = 16

/**
 * Pixels one arrow-key press pans the time axis. A pixel step rather than a
 * minute step, so the movement is the same size on screen at every zoom — one
 * hour is 7.5px at `MAX_TIME_ZOOM` and 1200px at `MIN_TIME_ZOOM`.
 */
const KEY_PAN_PX = 48

/** Wheel deltas arrive in pixels, lines or pages. This converts them to pixels. */
function wheelPixels(delta: number, deltaMode: number, pagePx: number): number {
  switch (deltaMode) {
    case 1: // WheelEvent.DOM_DELTA_LINE
      return delta * WHEEL_LINE_HEIGHT_PX
    case 2: // WheelEvent.DOM_DELTA_PAGE
      return delta * pagePx
    default:
      return delta
  }
}

/** A trailing write in flight: its timer and the patch it will apply. */
interface TrailingWrite {
  timer: ReturnType<typeof setTimeout> | null
  patch: Partial<ViewState>
}

/**
 * Merges one patch into the stored view state, never rewriting the rest — and
 * settles whatever the wheel left in flight before it does.
 *
 * Cancelling the pending timer is what keeps storage agreeing with the screen.
 * A gesture's write trails the state it describes by `PERSIST_DEBOUNCE_MS`, so
 * a discrete change landing inside that window — ctrl+wheel zoom, then "Fit to
 * day" — would otherwise be overwritten by the older gesture a moment later,
 * and the next load would open on the window the user had already replaced.
 *
 * The pending patch is merged rather than dropped, so a field the gesture set
 * and this patch does not still reaches storage. This patch wins wherever the
 * two name the same field, because it is the newer of the two.
 */
function writeNow(trailing: RefObject<TrailingWrite>, patch: Partial<ViewState>): void {
  const pending = trailing.current
  if (pending.timer !== null) {
    clearTimeout(pending.timer)
    pending.timer = null
  }
  const merged = { ...pending.patch, ...patch }
  pending.patch = {}
  saveViewState({ ...loadViewState(), ...merged })
}

/**
 * Coalesces a gesture's writes onto one trailing `writeNow`. Only the wheel
 * comes through here — a button or a key press is one discrete change and
 * stores immediately, as `Drawer.tsx`'s keyboard path does.
 */
function writeSoon(trailing: RefObject<TrailingWrite>, patch: Partial<ViewState>): void {
  const pending = trailing.current
  pending.patch = { ...pending.patch, ...patch }
  if (pending.timer !== null) clearTimeout(pending.timer)
  // `writeNow` empties the patch and clears the timer itself, so the callback
  // is the flush and nothing else.
  pending.timer = setTimeout(() => writeNow(trailing, {}), PERSIST_DEBOUNCE_MS)
}

/**
 * What the wheel listener reads and writes. The listener is attached once and
 * outlives every render, so it cannot read render-time state: two wheel events
 * can land before React re-renders, and the second would then be computed from
 * the first one's starting position. It updates this as it goes, so a burst
 * accumulates instead of repeating one stale step.
 */
interface WheelState {
  timeZoom: number
  timeScroll: number
  rowScroll: number
  rowHeight: number
  maxScroll: number
}

export interface MatrixCanvasProps {
  /**
   * The committed derived model, as `ScheduleOutput` takes it. Passed with
   * `findings`, the canvas never subscribes to the store at all — see
   * `MatrixCanvas` below. Omitted, it falls back to the live model.
   */
  schedule?: DerivedSchedule
  /**
   * The committed findings the tooltip and the blocks' accessible names
   * attribute to a block. Passed together with `schedule` or not at all, so a
   * block's findings always describe the same tournament state its geometry
   * came from.
   */
  findings?: DerivedFindings
  /**
   * The minute range `Zoom to selection` targets (FR-020). The action is
   * disabled without one — there is no selection until blocks exist (T037).
   */
  selection?: TimeRange | null
}

/** The same model, resolved: the view never has to fall back to anything. */
interface MatrixCanvasViewProps {
  schedule: DerivedSchedule
  findings: DerivedFindings
  selection?: TimeRange | null
}

/** One block and the window-relative pixels it draws at, resolved per render. */
interface DrawnBlock {
  readonly placement: BlockPlacement
  readonly competition: Competition
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  /** Clamped to the block's own day group — see `visibleBlocks`. */
  readonly height: number
  /** This block's findings, resolved once for the name and the tooltip. */
  readonly findings: string[]
}

/**
 * Which block the pointer is over, and where the viewport sat when it crossed
 * in. Primitives only, on purpose: everything the tooltip shows is re-derived
 * from the current render, so a scroll or a zoom under a stationary pointer
 * cannot leave it describing a block that has since moved, and a hovered block
 * culled out of the window closes the tooltip instead of stranding a snapshot
 * of it. Holding the block object here would also put a value derived from
 * `lanes` and `competitionsById` into state, which is enough for React Compiler
 * to stop treating either memo as safe.
 */
interface HoveredBlock {
  competitionId: string
  phase: Phase
  /** The viewport's own origin, in viewport-relative pixels. */
  originX: number
  originY: number
}

/** One day group's visible geometry, resolved once per render. */
interface VisibleDay {
  readonly day: number
  /** Top of the sticky header overlay, in pixels below the first visible row. */
  readonly headerTop: number
  /** Top and bottom of this day's visible rows, for the grid lines. */
  readonly rowsTop: number
  readonly rowsBottom: number
  readonly ticks: AxisTick[]
}

/**
 * Where a day's floating header sits: pinned to the top of the viewport once
 * the day's first row has scrolled past, but pushed back out by the following
 * day's header rather than overlapping it.
 */
function stickyHeaderTop(rawTop: number, nextDayTop: number): number {
  return Math.min(Math.max(0, rawTop), nextDayTop - HEADER_HEIGHT_PX)
}

/**
 * The block under a plot coordinate, or `null` over empty grid.
 *
 * The pointer is bounded to the plot before any block is considered. The block
 * layer is `overflow-hidden` at exactly `plotWidth` x `plotHeight` and sits
 * below the frozen gutter and the sticky day bands, so a block with a negative
 * x or y is clipped away and hidden under them by design. Comparing against the
 * block rectangles alone would make those clipped pixels live hits and open a
 * tooltip while the pointer is over a strip label or a day band, for a block
 * that is not drawn there. The bound is the same pair of constants the layer is
 * positioned by, so the drawn and hit-tested rectangles cannot disagree.
 *
 * Within the plot the scan runs back to front, because the blocks are
 * absolutely positioned in array order: where an overflowing block overlaps one
 * that legitimately holds those strips, the one drawn on top is the one the
 * pointer is actually over.
 *
 * The right and bottom edges are exclusive, so two blocks abutting at a minute
 * or a strip boundary never both claim the same pixel.
 */
function blockAt(
  blocks: DrawnBlock[],
  plotX: number,
  plotY: number,
  plotWidth: number,
  plotHeight: number,
): DrawnBlock | null {
  if (plotX < 0 || plotX >= plotWidth || plotY < 0 || plotY >= plotHeight) return null

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (
      plotX >= block.x &&
      plotX < block.x + block.width &&
      plotY >= block.y &&
      plotY < block.y + block.height
    ) {
      return block
    }
  }
  return null
}

/**
 * The findings that belong to one block.
 *
 * A `ValidationError` names its competitions in `subjects`, so it attaches to
 * every block of that event — the rules it expresses (a shared population, a
 * day's capacity) are about the event, not about one of its phases. A
 * `Bottleneck` does carry a `phase`, so when any of an event's bottlenecks name
 * this block's phase the list narrows to those: a delay in the DE is not a fact
 * about the pools that ran that morning. An event whose bottlenecks all name
 * other phases still shows them, because the alternative is a block that
 * reports nothing while its event is in trouble.
 */
function findingsForBlock(
  findings: DerivedFindings,
  competitionId: string,
  phase: Phase,
): string[] {
  const messages: string[] = []

  for (const error of findings.validationErrors) {
    if (error.subjects?.includes(competitionId)) messages.push(error.message)
  }

  const forEvent = findings.analysis.warnings.filter(
    (warning) => warning.competition_id === competitionId,
  )
  const forPhase = forEvent.filter((warning) => warning.phase === phase)
  for (const warning of forPhase.length > 0 ? forPhase : forEvent) {
    messages.push(warning.message)
  }

  return messages
}

/**
 * The canvas as everything else mounts it, and the only place a store
 * subscription can enter it.
 *
 * Handed both halves of a committed model it renders the view directly, with no
 * `useStore` on the path at all. That is not a micro-optimization: the
 * subscription's values were discarded on the next line either way, but their
 * *identity* changes on every placement or config edit, so the whole canvas
 * re-rendered on each keystroke — rebuilding `visibleBlocks` and reconciling
 * every `EventBlock` — to draw output identical to the last one until
 * `CENTER_SETTLE_MS` elapsed (FR-008). Nothing memoizes those blocks at
 * runtime: the React Compiler is not in the build, and its lint rules only
 * check the source. The same path amplifies the `flushSync` hover, where one
 * block crossing synchronously reconciles every visible block.
 *
 * `ScheduleOutput` carries the identical pattern. It is left as S2 recorded it
 * — the canvas is the center, and the canvas is where this was worth solving.
 */
export function MatrixCanvas({ schedule, findings, selection }: MatrixCanvasProps = {}) {
  if (schedule !== undefined && findings !== undefined) {
    return <MatrixCanvasView schedule={schedule} findings={findings} selection={selection} />
  }
  return <StoreConnectedCanvas schedule={schedule} findings={findings} selection={selection} />
}

/** The fallback path: whichever half was not passed comes from the store. */
function StoreConnectedCanvas({ schedule, findings, selection }: MatrixCanvasProps) {
  const live = useStore(selectDerivedSchedule)
  const liveFindings = useStore(selectDerivedFindings)

  return (
    <MatrixCanvasView
      schedule={schedule ?? live}
      findings={findings ?? liveFindings}
      selection={selection}
    />
  )
}

function MatrixCanvasView({ schedule, findings, selection }: MatrixCanvasViewProps) {
  const { config } = schedule

  // One field per initializer, following Drawer.tsx: each read is independent
  // so a write never has to reconstruct a field this component does not own.
  const [timeZoom, setTimeZoom] = useState<number>(() => clampTimeZoom(loadViewState().timeZoom))
  const [timeScroll, setTimeScroll] = useState<number>(() => loadViewState().timeScroll)
  const [rowScroll, setRowScroll] = useState<number>(() => loadViewState().rowScroll)
  const [rowHeightStep, setRowHeightStep] = useState<RowHeightStep>(
    () => loadViewState().rowHeightStep,
  )
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [hovered, setHovered] = useState<HoveredBlock | null>(null)

  const viewportRef = useRef<HTMLDivElement>(null)

  // ResizeObserver is the measurement path in every browser that ships one.
  // jsdom does not, so the fallback measures once and follows window resizes —
  // enough to keep a test from throwing, and never used where the observer
  // exists. The component tests install a stub observer so the real path is the
  // one under test.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    const measure = (width: number, height: number): void => {
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    if (typeof ResizeObserver === 'undefined') {
      const onResize = (): void => {
        const rect = el.getBoundingClientRect()
        measure(rect.width, rect.height)
      }
      onResize()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    }

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) measure(rect.width, rect.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const plotWidth = Math.max(0, size.width - GUTTER_WIDTH_PX)
  // The rows get the viewport less the day band's own space. Every layer that
  // is measured in row space is offset by the same amount, so `blockY`'s
  // arithmetic is untouched — see the module docblock.
  const plotHeight = Math.max(0, size.height - HEADER_HEIGHT_PX)
  const rowHeight = ROW_HEIGHT_PX[rowHeightStep]

  const layout = useMemo(
    () => buildDayLayout(config.days_available, config.strips_total),
    [config.days_available, config.strips_total],
  )
  const rowRange = visibleRowRange(rowScroll, plotHeight, rowHeightStep, layout.totalRows)
  const timeRange = visibleTimeRange(timeScroll, timeZoom, plotWidth)
  const maxScroll = maxRowScroll(plotHeight, rowHeightStep, layout.totalRows)

  /**
   * The single origin every vertical position is measured from — `blockY`'s
   * `windowStartRow`. It is the *clamped* first row, never the raw `rowScroll`:
   * a `rowScroll` stored against a larger tournament survives into a smaller
   * one (`isValidViewState` accepts any non-negative integer and nothing
   * re-clamps when `setDays` or `setStrips` shrinks the layout), and measuring
   * one part of the canvas from the stored value and another from the clamped
   * one puts every row thousands of pixels off screen.
   */
  const windowStartRow = rowRange?.firstRow ?? 0

  /** The configured hours of one day, falling back to the engine's defaults. */
  function dayHours(day: number): TimeRange {
    const dayConfig = config.dayConfigs[day]
    return {
      startMinutes: dayConfig?.day_start_time ?? DAY_START_MINS,
      endMinutes: dayConfig?.day_end_time ?? DAY_END_MINS,
    }
  }

  const visibleRows: number[] = rowRange
    ? Array.from({ length: rowRange.lastRow - rowRange.firstRow + 1 }, (_, i) => rowRange.firstRow + i)
    : []

  const visibleDays: VisibleDay[] = []
  if (rowRange) {
    const firstDay = resolveFlatRow(layout, rowRange.firstRow)?.day ?? 0
    const lastDay = resolveFlatRow(layout, rowRange.lastRow)?.day ?? firstDay

    for (let day = firstDay; day <= lastDay; day++) {
      const dayFirstRow = flatRowIndex(layout, day, 0)
      if (dayFirstRow === null) continue
      const nextDayFirstRow = flatRowIndex(layout, day + 1, 0)
      const nextDayTop =
        nextDayFirstRow === null
          ? Number.POSITIVE_INFINITY
          : blockY(nextDayFirstRow, windowStartRow, rowHeightStep)

      // The axis belongs to the day group, so it stops at the day's configured
      // hours. Zoomed far out the visible window can span more than a day, and
      // an axis that ran the whole window would label hours past midnight that
      // no day has.
      const hours = dayHours(day)
      const axisRange: TimeRange = {
        startMinutes: Math.max(timeRange.startMinutes, hours.startMinutes),
        endMinutes: Math.min(timeRange.endMinutes, hours.endMinutes),
      }

      visibleDays.push({
        day,
        headerTop: stickyHeaderTop(
          blockY(dayFirstRow, windowStartRow, rowHeightStep),
          nextDayTop,
        ),
        rowsTop: Math.max(0, blockY(dayFirstRow, windowStartRow, rowHeightStep)),
        rowsBottom: Math.min(plotHeight, nextDayTop),
        ticks: hourTicks(axisRange, timeZoom),
      })
    }
  }

  const lanes = useMemo(
    () => assignStripLanes(schedule.events, config.strips_total),
    [schedule.events, config.strips_total],
  )
  const competitionsById = useMemo(
    () => new Map(schedule.competitions.map((competition) => [competition.id, competition])),
    [schedule.competitions],
  )

  /**
   * The blocks the window actually shows, culled on both axes (FR-021): a block
   * wholly outside the window is not in the DOM at all. Geometry is computed
   * here on every render and never written back into the derived model
   * (FR-013), so a scroll or a zoom cannot leave a stale coordinate behind.
   *
   * The drawn strip span is clamped to what is left of the block's own day
   * group. `assignStripLanes` already returns `overflow` rather than a run that
   * runs off the end of a day, so this only bites if the engine ever grants an
   * event more strips than the tournament has — and there the unclamped height
   * would paint straight across the next day's rows.
   */
  const visibleBlocks: DrawnBlock[] = []
  if (rowRange) {
    for (const placement of lanes) {
      if (!intersectsTimeRange(timeRange, placement.startMinutes, placement.endMinutes)) continue

      const flatRow = flatRowIndex(layout, placement.day, placement.firstStrip)
      if (flatRow === null) continue
      const drawnStrips = Math.min(placement.stripCount, layout.rowsPerDay - placement.firstStrip)
      // Row ranges are inclusive, and a block spans `drawnStrips` of them.
      if (flatRow > rowRange.lastRow) continue
      if (flatRow + drawnStrips - 1 < rowRange.firstRow) continue

      const competition = competitionsById.get(placement.competitionId)
      if (!competition) continue

      visibleBlocks.push({
        placement,
        competition,
        label: competitionLabel(competition),
        x: blockX(placement.startMinutes, timeScroll, timeZoom),
        y: blockY(flatRow, windowStartRow, rowHeightStep),
        width: blockWidth(placement.endMinutes - placement.startMinutes, timeZoom),
        height: blockHeight(drawnStrips, rowHeightStep),
        findings: findingsForBlock(findings, placement.competitionId, placement.phase),
      })
    }
  }

  /**
   * The one hover handler (research D3). It reads `visibleBlocks` from this
   * render's closure rather than from a ref, so it can never hit-test against a
   * layout the user is no longer looking at.
   *
   * ## It changes state per *block*, not per pointer event
   *
   * The anchor is the hovered block's own top centre rather than the pointer, so
   * moving within one block resolves to the target already showing and returns
   * without touching state. A cursor-tracked anchor would re-render the whole
   * canvas on each of the sixty-odd pointer events a second a slow drag over a
   * single block produces, and would jitter the tooltip while it did.
   *
   * ## Why the update is flushed
   *
   * React classes `pointermove` as a *continuous* event, so a plain `setState`
   * here is scheduled rather than applied — the tooltip would appear a frame or
   * more after the pointer entered the block, and later than that under load.
   * `flushSync` puts it on screen in the frame the crossing happened. The cost
   * is bounded by the paragraph above: it runs once per block the pointer
   * crosses, which is the rate a hover enter/leave runs at anyway, not once per
   * pointer event.
   */
  function handlePointerMove(e: PointerEvent<HTMLDivElement>): void {
    const el = viewportRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    const drawn = blockAt(
      visibleBlocks,
      e.clientX - rect.left - GUTTER_WIDTH_PX,
      e.clientY - rect.top - HEADER_HEIGHT_PX,
      plotWidth,
      plotHeight,
    )

    if (drawn === null) {
      if (hovered !== null) flushSync(() => setHovered(null))
      return
    }
    if (
      hovered !== null &&
      hovered.competitionId === drawn.placement.competitionId &&
      hovered.phase === drawn.placement.phase
    ) {
      return
    }

    const next: HoveredBlock = {
      competitionId: drawn.placement.competitionId,
      phase: drawn.placement.phase,
      originX: rect.left,
      originY: rect.top,
    }
    flushSync(() => setHovered(next))
  }

  /**
   * The hovered block resolved against *this* render's window. A block the user
   * has scrolled or zoomed out of view resolves to nothing and the tooltip
   * closes, rather than describing a block that is no longer on screen.
   */
  const hoveredBlock =
    hovered === null
      ? null
      : (visibleBlocks.find(
          (block) =>
            block.placement.competitionId === hovered.competitionId &&
            block.placement.phase === hovered.phase,
        ) ?? null)

  const placedSpans = useMemo<TimeRange[]>(
    () =>
      Object.values(schedule.events).flatMap((derived) =>
        eventTimeSegments(derived).map((segment) => ({
          startMinutes: segment.startMinutes,
          endMinutes: segment.endMinutes,
        })),
      ),
    [schedule.events],
  )

  const trailing = useRef<TrailingWrite>({ timer: null, patch: {} })

  // A pending gesture write is flushed on unmount, not discarded. T040's
  // Matrix ⇄ Schedule toggle swaps the canvas out entirely, so a wheel scroll
  // followed within PERSIST_DEBOUNCE_MS by a click on "Schedule" would
  // otherwise drop the scroll: switching back would restore the pre-wheel
  // position and the gesture would silently not have happened.
  useEffect(
    () => () => {
      if (trailing.current.timer !== null) writeNow(trailing, {})
    },
    [],
  )

  const latest = useRef<WheelState>({ timeZoom, timeScroll, rowScroll, rowHeight, maxScroll })
  useEffect(() => {
    latest.current = { timeZoom, timeScroll, rowScroll, rowHeight, maxScroll }
  })

  /**
   * Wheel pixels the row scroll has not yet consumed. Without it a trackpad
   * delta under half a row rounds to zero, the residue is discarded, and slow
   * scrolling never moves at all however long it goes on.
   */
  const rowRemainderPx = useRef(0)

  // Reads and writes only refs and `useState` setters, so it is attached once
  // and never needs re-attaching. See the module docblock for why it is not an
  // `onWheel` prop.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return

    // An arrow rather than a declaration so `el`'s null check narrows inside it.
    const onWheel = (e: globalThis.WheelEvent): void => {
      e.preventDefault()
      const current = latest.current

      // Ctrl or meta is the platform convention for zoom-on-wheel; a plain
      // wheel pans, vertically over rows and horizontally over time.
      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect()
        const next = zoomAtCursor(
          { timeZoom: current.timeZoom, timeScroll: current.timeScroll },
          current.timeZoom * (e.deltaY > 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR),
          e.clientX - rect.left - GUTTER_WIDTH_PX,
        )
        current.timeZoom = next.timeZoom
        current.timeScroll = next.timeScroll
        setTimeZoom(next.timeZoom)
        setTimeScroll(next.timeScroll)
        writeSoon(trailing, { timeZoom: next.timeZoom, timeScroll: next.timeScroll })
        return
      }

      const deltaY = wheelPixels(e.deltaY, e.deltaMode, el.clientHeight)
      if (deltaY !== 0) {
        rowRemainderPx.current += deltaY
        const rows = Math.trunc(rowRemainderPx.current / current.rowHeight)
        if (rows !== 0) {
          rowRemainderPx.current -= rows * current.rowHeight
          const next = Math.min(Math.max(0, current.rowScroll + rows), current.maxScroll)
          if (next !== current.rowScroll) {
            current.rowScroll = next
            setRowScroll(next)
            writeSoon(trailing, { rowScroll: next })
          }
        }
      }

      const deltaX = wheelPixels(e.deltaX, e.deltaMode, el.clientWidth)
      if (deltaX !== 0) {
        const next = Math.max(0, current.timeScroll + deltaX * current.timeZoom)
        if (next !== current.timeScroll) {
          current.timeScroll = next
          setTimeScroll(next)
          writeSoon(trailing, { timeScroll: next })
        }
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  /** A window from a toolbar button: one discrete change, stored at once. */
  function applyWindow(next: TimeWindow | null): void {
    if (next === null) return
    setTimeZoom(next.timeZoom)
    setTimeScroll(next.timeScroll)
    writeNow(trailing, { timeZoom: next.timeZoom, timeScroll: next.timeScroll })
  }

  function applyRowHeight(delta: number): void {
    const next = stepRowHeight(rowHeightStep, delta)
    if (next === rowHeightStep) return
    // The remainder is a fraction of the *old* row height, so it means nothing
    // against the new one. Carried over it would tip the next notch early.
    rowRemainderPx.current = 0
    setRowHeightStep(next)
    writeNow(trailing, { rowHeightStep: next })
  }

  function scrollRowsBy(delta: number): void {
    const next = Math.min(Math.max(0, rowScroll + delta), maxScroll)
    if (next === rowScroll) return
    // A button or a key press moves whole rows, so a part-row left over from an
    // earlier wheel gesture is no longer describing where the rows sit.
    rowRemainderPx.current = 0
    setRowScroll(next)
    writeNow(trailing, { rowScroll: next })
  }

  function scrollTimeBy(deltaMinutes: number): void {
    const next = Math.max(0, timeScroll + deltaMinutes)
    if (next === timeScroll) return
    setTimeScroll(next)
    writeNow(trailing, { timeScroll: next })
  }

  /**
   * Keyboard panning (WCAG 2.1.1). The viewport is `overflow-hidden` and both
   * scroll positions are view state, so there is no scrollbar and no native key
   * handling to inherit — without this the toolbar's zoom actions are the only
   * reachable controls and rows cannot be panned at all without a wheel. Each
   * press is discrete, so it stores immediately, as `Drawer.tsx`'s resize
   * handle does.
   */
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const rowsPerPage = rowRange ? rowRange.lastRow - rowRange.firstRow + 1 : 1

    switch (e.key) {
      case 'ArrowDown':
        scrollRowsBy(1)
        break
      case 'ArrowUp':
        scrollRowsBy(-1)
        break
      case 'PageDown':
        scrollRowsBy(rowsPerPage)
        break
      case 'PageUp':
        scrollRowsBy(-rowsPerPage)
        break
      case 'ArrowRight':
        scrollTimeBy(KEY_PAN_PX * timeZoom)
        break
      case 'ArrowLeft':
        scrollTimeBy(-KEY_PAN_PX * timeZoom)
        break
      case 'Escape':
        // WCAG 1.4.13: content shown on hover must be dismissible without
        // moving the pointer. The tooltip's `open` is `hovered !== null`, so
        // clearing the hover is the dismissal — no `onOpenChange` needed, and
        // nothing about the controlled tooltip is fought. This handler does not
        // preventDefault: an Escape the canvas consumed is still an Escape.
        setHovered(null)
        return
      default:
        return
    }
    e.preventDefault()
  }

  function zoomByFactor(factor: number, cursorX: number): void {
    applyWindow(zoomAtCursor({ timeZoom, timeScroll }, timeZoom * factor, cursorX))
  }

  const topDay = rowRange ? (resolveFlatRow(layout, rowRange.firstRow)?.day ?? 0) : 0
  const topDayHours = dayHours(topDay)

  return (
    <section
      aria-label="Matrix canvas"
      className="flex h-full w-full min-w-0 flex-col bg-background"
    >
      <div
        role="toolbar"
        aria-label="Canvas zoom controls"
        aria-orientation="horizontal"
        className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1 text-xs"
      >
        <ToolbarButton label="Zoom in" onClick={() => zoomByFactor(1 / ZOOM_STEP_FACTOR, plotWidth / 2)} />
        <ToolbarButton label="Zoom out" onClick={() => zoomByFactor(ZOOM_STEP_FACTOR, plotWidth / 2)} />
        <ToolbarButton
          label="Fit to day"
          onClick={() =>
            applyWindow(fitToDay(topDayHours.startMinutes, topDayHours.endMinutes, plotWidth))
          }
        />
        <ToolbarButton
          label="Fit to tournament"
          disabled={placedSpans.length === 0}
          onClick={() => applyWindow(fitToTournament(placedSpans, plotWidth))}
        />
        <ToolbarButton
          label="Zoom to selection"
          disabled={!selection}
          onClick={() => selection && applyWindow(zoomToSelection(selection, plotWidth))}
        />
        <ToolbarButton label="Taller rows" onClick={() => applyRowHeight(1)} />
        <ToolbarButton label="Shorter rows" onClick={() => applyRowHeight(-1)} />
      </div>

      <div
        ref={viewportRef}
        data-canvas-viewport="true"
        role="group"
        aria-label="Matrix grid"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHovered(null)}
        className="relative min-h-0 flex-1 overflow-hidden focus-visible:outline-2"
      >
        {/* The frozen gutter: positioned, never translated by timeScroll. */}
        <ul
          aria-label="Strip labels"
          className="absolute bottom-0 left-0 z-10 m-0 list-none border-r bg-background p-0"
          style={{ top: HEADER_HEIGHT_PX, width: GUTTER_WIDTH_PX }}
        >
          {visibleRows.map((flatIndex) => {
            const location = resolveFlatRow(layout, flatIndex)
            if (location === null) return null
            return (
              <li
                key={flatIndex}
                data-strip-row={flatIndex}
                className="flex items-center justify-end overflow-hidden pr-2 text-[10px] text-muted-foreground"
                style={{
                  position: 'absolute',
                  top: blockY(flatIndex, windowStartRow, rowHeightStep),
                  height: rowHeight,
                  right: 0,
                  left: 0,
                }}
              >
                Strip {location.strip + 1}
              </li>
            )
          })}
        </ul>

        <svg
          role="presentation"
          width={plotWidth}
          height={plotHeight}
          className="absolute"
          style={{ left: GUTTER_WIDTH_PX, top: HEADER_HEIGHT_PX }}
        >
          {visibleDays.map((visible) => (
            <g key={visible.day} data-day-grid={visible.day}>
              {visible.ticks.map((tick) => {
                const x = blockX(tick.minutes, timeScroll, timeZoom)
                return (
                  <line
                    key={tick.minutes}
                    x1={x}
                    x2={x}
                    y1={visible.rowsTop}
                    y2={visible.rowsBottom}
                    stroke="var(--border)"
                  />
                )
              })}
            </g>
          ))}
          {visibleRows.map((flatIndex) => {
            const y = blockY(flatIndex, windowStartRow, rowHeightStep)
            return (
              <line
                key={flatIndex}
                data-row-line={flatIndex}
                x1={0}
                x2={plotWidth}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeOpacity={0.6}
              />
            )
          })}
        </svg>

        {/* The blocks. Clipped to the plot and left below the frozen gutter
            (z-10) and the sticky day bands (z-20), so a block scrolled off the
            left or above the top slides under them rather than over. */}
        <div
          data-block-layer="true"
          className="absolute overflow-hidden"
          style={{
            left: GUTTER_WIDTH_PX,
            top: HEADER_HEIGHT_PX,
            width: plotWidth,
            height: plotHeight,
          }}
        >
          {visibleBlocks.map((drawn) => (
            <EventBlock
              key={`${drawn.placement.competitionId}:${drawn.placement.phase}`}
              competition={drawn.competition}
              label={drawn.label}
              day={drawn.placement.day}
              placement={drawn.placement}
              x={drawn.x}
              y={drawn.y}
              width={drawn.width}
              height={drawn.height}
              rowHeightStep={rowHeightStep}
              findings={drawn.findings}
            />
          ))}
        </div>

        {/* Sticky day bands, each with its own hour axis pinned beneath it. */}
        {visibleDays.map((visible) => (
          <div
            key={visible.day}
            data-day-group={visible.day}
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ top: visible.headerTop, height: HEADER_HEIGHT_PX }}
          >
            {/* Opaque, both layers: the band's whole job is to hide the rows
                scrolled past behind it, and Tailwind's /90 and /80 resolve to a
                color-mix with transparent that lets them ghost through. */}
            <div
              className="flex items-center bg-background px-2 text-[11px] font-semibold"
              style={{ height: DAY_BAND_HEIGHT_PX }}
            >
              Day {visible.day + 1}
            </div>
            <div
              className="relative bg-background"
              style={{ height: AXIS_HEIGHT_PX }}
            >
              {visible.ticks.map((tick) => (
                <span
                  key={tick.minutes}
                  data-hour-tick={tick.minutes}
                  className="absolute top-0 text-[10px] text-muted-foreground"
                  style={{
                    left: GUTTER_WIDTH_PX + blockX(tick.minutes, timeScroll, timeZoom),
                  }}
                >
                  {tick.label}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Outside the viewport: the anchor is fixed-positioned, so it neither
          takes part in the canvas layout nor gets clipped by it.

          The target is built here in the prop rather than in a `const` above,
          and that is load-bearing rather than a style choice. React Compiler
          freezes a value at the JSX boundary, so a target assembled here is
          provably never mutated; assembled into a local first, the block it
          reads — and with it `lanes`, `competitionsById` and the `config` and
          `schedule` fields they memoize on — is inferred as possibly mutated
          later, and the compiler skips optimizing this component entirely.

          The anchor is the block's own top centre, clamped into the plot so a
          block half under the frozen gutter or the day band is still pointed at
          somewhere it can be seen. */}
      <CanvasTooltip
        target={
          hovered === null || hoveredBlock === null
            ? null
            : ({
                competition: hoveredBlock.competition,
                label: hoveredBlock.label,
                day: hoveredBlock.placement.day,
                placement: hoveredBlock.placement,
                findings: hoveredBlock.findings,
                anchorX:
                  hovered.originX +
                  GUTTER_WIDTH_PX +
                  Math.min(Math.max(hoveredBlock.x + hoveredBlock.width / 2, 0), plotWidth),
                anchorY:
                  hovered.originY +
                  HEADER_HEIGHT_PX +
                  Math.min(Math.max(hoveredBlock.y, 0), plotHeight),
              } satisfies CanvasTooltipTarget)
        }
      />
    </section>
  )
}

function ToolbarButton({
  label,
  onClick,
  disabled,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded border px-2 py-0.5 hover:bg-muted disabled:opacity-40"
    >
      {label}
    </button>
  )
}
