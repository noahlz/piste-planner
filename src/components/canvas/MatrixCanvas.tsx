import { useEffect, useMemo, useRef, useState, type WheelEvent } from 'react'
import { DAY_END_MINS, DAY_START_MINS } from '../../engine/constants.ts'
import { useStore } from '../../store/store.ts'
import { selectDerivedSchedule, type DerivedSchedule } from '../../store/derived.ts'
import {
  RowHeightStep,
  loadViewState,
  saveViewState,
  type ViewState,
} from '../../store/viewState.ts'
import { ROW_HEIGHT_PX, blockX, blockY, eventTimeSegments } from './geometry.ts'
import {
  buildDayLayout,
  flatRowIndex,
  resolveFlatRow,
  visibleRowRange,
  visibleTimeRange,
  type TimeRange,
} from './windowing.ts'
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
 * ## The header is an overlay, and that is load-bearing
 *
 * `windowing.ts` fixes `rowsPerDay === stripsTotal` — the day header band gets
 * no row of its own. The hour axis FR-017 pins "at the top of each day group"
 * is therefore drawn in the *same* floating overlay as the band, not in a strip
 * of layout between day groups. Giving either one real vertical space would put
 * an offset between `blockY`'s answer and where a row actually sits, and every
 * block T037 draws would land in the wrong place.
 *
 * ## Two scrolls, neither of them native
 *
 * Row position (`rowScroll`, a flat row index) and time position (`timeScroll`,
 * minutes from midnight) are both view state, not `scrollTop`/`scrollLeft`. So
 * the strip gutter is frozen and the day bands are sticky by construction: they
 * are positioned from the window rather than translated with it.
 *
 * ## What is not here yet
 *
 * Event blocks (T037) and the tooltip (T038). This component draws the grid the
 * blocks land on, and nothing mounts it until the view toggle in T040.
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
  const rowHeight = ROW_HEIGHT_PX[rowHeightStep]

  const layout = useMemo(
    () => buildDayLayout(config.days_available, config.strips_total),
    [config.days_available, config.strips_total],
  )
  const rowRange = visibleRowRange(rowScroll, size.height, rowHeightStep, layout.totalRows)
  const timeRange = visibleTimeRange(timeScroll, timeZoom, plotWidth)

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
          : blockY(nextDayFirstRow, rowRange.firstRow, rowHeightStep)

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
          blockY(dayFirstRow, rowRange.firstRow, rowHeightStep),
          nextDayTop,
        ),
        rowsTop: Math.max(0, blockY(dayFirstRow, rowRange.firstRow, rowHeightStep)),
        rowsBottom: Math.min(size.height, nextDayTop),
        ticks: hourTicks(axisRange, timeZoom),
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

  /** Merges one patch into the stored view state, never rewriting the rest. */
  function persist(patch: Partial<ViewState>): void {
    saveViewState({ ...loadViewState(), ...patch })
  }

  function applyWindow(next: TimeWindow | null): void {
    if (next === null) return
    setTimeZoom(next.timeZoom)
    setTimeScroll(next.timeScroll)
    persist({ timeZoom: next.timeZoom, timeScroll: next.timeScroll })
  }

  function applyRowScroll(next: number): void {
    const clamped = Math.min(Math.max(0, next), Math.max(0, layout.totalRows - 1))
    if (clamped === rowScroll) return
    setRowScroll(clamped)
    persist({ rowScroll: clamped })
  }

  function applyRowHeight(delta: number): void {
    const next = stepRowHeight(rowHeightStep, delta)
    if (next === rowHeightStep) return
    setRowHeightStep(next)
    persist({ rowHeightStep: next })
  }

  const currentWindow: TimeWindow = { timeZoom, timeScroll }

  function zoomByFactor(factor: number, cursorX: number): void {
    applyWindow(zoomAtCursor(currentWindow, timeZoom * factor, cursorX))
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>): void {
    // Ctrl or meta is the platform convention for zoom-on-wheel; a plain wheel
    // pans, vertically over rows and horizontally over time.
    if (e.ctrlKey || e.metaKey) {
      const rect = e.currentTarget.getBoundingClientRect()
      zoomByFactor(
        e.deltaY > 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR,
        e.clientX - rect.left - GUTTER_WIDTH_PX,
      )
      return
    }

    if (e.deltaY !== 0) {
      applyRowScroll(rowScroll + Math.round(e.deltaY / rowHeight))
    }
    if (e.deltaX !== 0) {
      const next = Math.max(0, timeScroll + e.deltaX * timeZoom)
      setTimeScroll(next)
      persist({ timeScroll: next })
    }
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
        onWheel={handleWheel}
        className="relative min-h-0 flex-1 overflow-hidden"
      >
        {/* The frozen gutter: positioned, never translated by timeScroll. */}
        <ul
          aria-label="Strip labels"
          className="absolute inset-y-0 left-0 z-10 m-0 list-none border-r bg-background p-0"
          style={{ width: GUTTER_WIDTH_PX }}
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
                  top: blockY(flatIndex, rowScroll, rowHeightStep),
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
          height={size.height}
          className="absolute inset-y-0"
          style={{ left: GUTTER_WIDTH_PX }}
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
            const y = blockY(flatIndex, rowScroll, rowHeightStep)
            return (
              <line
                key={flatIndex}
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

        {/* Sticky day bands, each with its own hour axis pinned beneath it. */}
        {visibleDays.map((visible) => (
          <div
            key={visible.day}
            data-day-group={visible.day}
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ top: visible.headerTop, height: HEADER_HEIGHT_PX }}
          >
            <div
              className="flex items-center bg-background/90 px-2 text-[11px] font-semibold"
              style={{ height: DAY_BAND_HEIGHT_PX }}
            >
              Day {visible.day + 1}
            </div>
            <div
              className="relative bg-background/80"
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
