import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { DAY_END_MINS, DAY_START_MINS } from '../../engine/constants.ts'
import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule, type DerivedSchedule } from '../../store/derived.ts'
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
import { competitionLabel } from '../competitionLabels.ts'
import type { Competition } from '../../engine/types.ts'
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
 * ## What is not here yet
 *
 * The tooltip (T038). Nothing mounts this component until the view toggle in
 * T040.
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

/** Merges one patch into the stored view state, never rewriting the rest. */
function writeNow(patch: Partial<ViewState>): void {
  saveViewState({ ...loadViewState(), ...patch })
}

/** A trailing write in flight: its timer and the patch it will apply. */
interface TrailingWrite {
  timer: ReturnType<typeof setTimeout> | null
  patch: Partial<ViewState>
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
  pending.timer = setTimeout(() => {
    pending.timer = null
    const merged = pending.patch
    pending.patch = {}
    writeNow(merged)
  }, PERSIST_DEBOUNCE_MS)
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
   * The committed derived model, as `ScheduleOutput` takes it. Omitted, the
   * canvas subscribes to the store directly.
   */
  schedule?: DerivedSchedule
  /**
   * The minute range `Zoom to selection` targets (FR-020). The action is
   * disabled without one — there is no selection until blocks exist (T037).
   */
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
  readonly height: number
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

export function MatrixCanvas({ schedule: committed, selection }: MatrixCanvasProps = {}) {
  const live = useStore(selectDerivedSchedule)
  const schedule = committed ?? live
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
   */
  const visibleBlocks: DrawnBlock[] = []
  if (rowRange) {
    for (const placement of lanes) {
      if (!intersectsTimeRange(timeRange, placement.startMinutes, placement.endMinutes)) continue

      const flatRow = flatRowIndex(layout, placement.day, placement.firstStrip)
      if (flatRow === null) continue
      // Row ranges are inclusive, and a block spans `stripCount` of them.
      if (flatRow > rowRange.lastRow) continue
      if (flatRow + placement.stripCount - 1 < rowRange.firstRow) continue

      const competition = competitionsById.get(placement.competitionId)
      if (!competition) continue

      visibleBlocks.push({
        placement,
        competition,
        label: competitionLabel(competition),
        x: blockX(placement.startMinutes, timeScroll, timeZoom),
        y: blockY(flatRow, windowStartRow, rowHeightStep),
        width: blockWidth(placement.endMinutes - placement.startMinutes, timeZoom),
        height: blockHeight(placement.stripCount, rowHeightStep),
      })
    }
  }

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

  useEffect(
    () => () => {
      if (trailing.current.timer !== null) clearTimeout(trailing.current.timer)
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
    writeNow({ timeZoom: next.timeZoom, timeScroll: next.timeScroll })
  }

  function applyRowHeight(delta: number): void {
    const next = stepRowHeight(rowHeightStep, delta)
    if (next === rowHeightStep) return
    setRowHeightStep(next)
    writeNow({ rowHeightStep: next })
  }

  function scrollRowsBy(delta: number): void {
    const next = Math.min(Math.max(0, rowScroll + delta), maxScroll)
    if (next === rowScroll) return
    setRowScroll(next)
    writeNow({ rowScroll: next })
  }

  function scrollTimeBy(deltaMinutes: number): void {
    const next = Math.max(0, timeScroll + deltaMinutes)
    if (next === timeScroll) return
    setTimeScroll(next)
    writeNow({ timeScroll: next })
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
