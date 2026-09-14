import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { DAY_END_MINS, DAY_START_MINS } from '../../engine/constants.ts'
import type { Competition, DayConfig, Phase } from '../../engine/types.ts'
import { formatClock } from '../../lib/time.ts'
import { assignStripLanes, type BlockPlacement } from '../../layout/lanes.ts'
import { useStore } from '../../store/store.ts'
import {
  daySummariesFromBlocks,
  type DaySummary,
  type DerivedFindings,
  type DerivedSchedule,
  type Finding,
} from '../../store/derived.ts'
import { competitionLabel } from '../../lib/competitionLabels.ts'
import { Block } from './Block.tsx'
import { CanvasTooltip, type CanvasTooltipTarget } from './CanvasTooltip.tsx'
import { FIT_FALLBACK_STEP, rungAt, type ZoomState } from './zoomLadder.ts'

/**
 * The canvas — FR-032 to FR-043, research D2, D3, D4, D18.
 *
 * Strips run down, time runs right, day groups stack. Everything on screen is
 * an ordinary DOM element in ordinary flow, and that is the whole design.
 *
 * ## One scroller, and it is the browser's (FR-032, research D2)
 *
 * 004's canvas scrolled by arithmetic: `timeScroll` and `rowScroll` were view
 * state, the viewport was `overflow-hidden`, and every layer was positioned
 * from the window rather than translated with it. That bought culling — only
 * the visible rows were in the DOM — and paid for it with a wheel listener, a
 * keyboard pan handler, a persisted window, two frozen layers positioned by
 * hand, and a hit-test that had to subtract both of them back out again.
 *
 * This draws all of it: every day group, every strip row, every block, inside
 * one `overflow: auto` container. The axis, the day bands and the strip gutter
 * are `position: sticky`, so the browser pins them for free — there is no
 * scroll position to store, nothing to re-derive when it changes, and no way
 * for the drawn layers to disagree about where the window is, because none of
 * them knows.
 *
 * ## Two ways to solve the horizontal, and the browser owns one of them
 *
 * On the ladder (`fitting: false`) a block's `left` and `width` are pixels at
 * the rung's pixels-per-minute. Under Fit day they are **percentages of the
 * day span**, the plot is `flex: 1`, and the browser solves the scale. That is
 * what makes fit-to-day exact at any window size without measuring anything:
 * a measurement would have to be taken after layout, applied on the next
 * frame, and would lag every resize by one.
 *
 * The `ResizeObserver` below therefore feeds *label fitting only* — how much
 * of an event's name a block has room for. With no measurement at all (jsdom,
 * or the first paint) that estimate falls back to rung 2's scale
 * (`FIT_FALLBACK_STEP`), so every block still draws and still carries a name.
 *
 * ## What it is handed, and what it reads (D18)
 *
 * `schedule`, `findings` and `dayConfigs` are props, committed together by
 * `CenterView`, so the axis this draws never runs ahead of the blocks it
 * bounds. `dayConfigs` is the store's, never `schedule.config.dayConfigs`,
 * which for a scheduled tournament may carry the scheduler's own day axis
 * rather than clock time (contracts/day-axis.md C4, research D4/D5).
 *
 * The day bands are computed here too, by `daySummariesFromBlocks` over this
 * component's own `lanes` — the same committed blocks the grid draws — plus
 * `findingRows`, a fourth prop `CenterView` commits alongside the other three
 * on the same settle (013 T032, contract §4.3). Two store reads remain
 * unexpressed from the committed model: `placements`, for the pin badge, and
 * `selectedCompetitionId` (013 T029), for the selection ring — a click
 * selects the event immediately, and waiting for the next settle to ring it
 * would make the click feel unacknowledged. `jumpNonce` (013 T032, contract
 * §4.4) is read live for the same reason: a Findings jump should scroll and
 * flash the instant it is pressed, not a settle later.
 */

/** The frozen strip-label gutter (mockup line 278). */
const GUTTER_WIDTH_PX = 58
/** The sticky time axis across the top (mockup line 277). */
const AXIS_HEIGHT_PX = 26
/** Day band heights, by detail tier (mockup `TIER`). */
const BAND_HEIGHT_OVERVIEW_PX = 22
const BAND_HEIGHT_PX = 30
/** Below this scale the canvas is in the overview tier (mockup `tierFor`). */
const OVERVIEW_MAX_PPM = 2.8

/**
 * Candidate tick intervals, in minutes, coarsest last.
 *
 * A fixed ladder rather than a computed interval: an hour, a half hour and a
 * quarter are the divisions a competition day is actually read in, and a
 * "nice number" solve would happily produce 20- or 45-minute ticks that no
 * organizer thinks in. The first candidate whose spacing clears
 * `MIN_TICK_GAP_PX` wins, so the count is one comparison per candidate and
 * never a loop that has to converge (constitution IV).
 */
const TICK_STEPS_MINUTES: readonly number[] = [15, 30, 60, 120, 180, 360]

/**
 * Narrowest gap two `HH:MM` labels may sit at. Mono 10.5px "08:00" is about
 * 40px wide, so 72 leaves a clear half-label of air between neighbours at
 * every rung.
 */
const MIN_TICK_GAP_PX = 72

export interface CanvasProps {
  schedule: DerivedSchedule
  /** Still feeds the tooltip's per-block messages (`findingsForBlock`). */
  findings: DerivedFindings
  /** The unified findings list (contract §1), committed with the other three (§4.1). */
  findingRows: Finding[]
  /** The store's clock-time day hours, committed with `schedule` (C4). */
  dayConfigs: DayConfig[]
  zoom: ZoomState
}

/** One block resolved to what it draws, once per render. */
interface DrawnBlock {
  readonly placement: BlockPlacement
  readonly competition: Competition
  readonly label: string
  readonly findings: string[]
}

/** Which block the pointer is over, and where to anchor the tooltip. */
interface HoveredBlock {
  competitionId: string
  phase: Phase
  anchorX: number
  anchorY: number
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
 * Every competition a `findingRows` row names (013 T032, contract §4.2).
 * Replaces the old `flaggedCompetitions(findings)`, which read the raw
 * `DerivedFindings` pair directly — the gutter now flags exactly what the
 * Findings panel lists, dismissed rows excluded, rather than a superset the
 * panel has already waved off.
 */
function flaggedTargets(findingRows: Finding[]): Set<string> {
  const flagged = new Set<string>()
  for (const row of findingRows) {
    if (row.target !== null) flagged.add(row.target)
  }
  return flagged
}

/** How long a jump's flash stays on a block before clearing (013 T032, contract §4.4). */
const FLASH_MS = 900

/**
 * The tick interval for a scale: the finest candidate whose spacing clears
 * `MIN_TICK_GAP_PX`, and the coarsest one when none does.
 */
function tickStepMinutes(pixelsPerMinute: number): number {
  for (const step of TICK_STEPS_MINUTES) {
    if (step * pixelsPerMinute >= MIN_TICK_GAP_PX) return step
  }
  return TICK_STEPS_MINUTES[TICK_STEPS_MINUTES.length - 1]
}

/**
 * The clock-time window every day is drawn against: the earliest start and the
 * latest end across the configured days.
 *
 * One span for all days rather than one per day (research D3), so a block at
 * 09:00 on Thursday sits directly above a block at 09:00 on Friday. A day that
 * starts later than the others is drawn with its own empty lead-in, which is
 * the true statement about it.
 */
function axisSpan(dayConfigs: DayConfig[]): { startMinutes: number; endMinutes: number } {
  let startMinutes = Number.POSITIVE_INFINITY
  let endMinutes = Number.NEGATIVE_INFINITY
  for (const day of dayConfigs) {
    if (day.day_start_time < startMinutes) startMinutes = day.day_start_time
    if (day.day_end_time > endMinutes) endMinutes = day.day_end_time
  }
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes) || endMinutes <= startMinutes) {
    return { startMinutes: DAY_START_MINS, endMinutes: DAY_END_MINS }
  }
  return { startMinutes, endMinutes }
}

const EMPTY_SUMMARY: Omit<DaySummary, 'day'> = {
  events: 0,
  finish: null,
  peakStrips: 0,
  unplaced: 0,
  findings: 0,
}

export function Canvas({ schedule, findings, findingRows, dayConfigs, zoom }: CanvasProps) {
  const { config } = schedule
  const stripsTotal = Math.max(0, Math.floor(config.strips_total))
  const daysAvailable = Math.max(0, Math.floor(config.days_available))

  const placements = useStore((s) => s.placements)
  const selectedCompetitionId = useStore((s) => s.selectedCompetitionId)
  const selectCompetition = useStore((s) => s.selectCompetition)
  // Read live rather than off the committed model (013 T032, contract §4.4):
  // a Findings jump should scroll and flash the instant it is pressed.
  const jumpNonce = useStore((s) => s.jumpNonce)

  const [hovered, setHovered] = useState<HoveredBlock | null>(null)
  /** The measured plot width, 0 until the observer reports one. */
  const [plotWidthPx, setPlotWidthPx] = useState(0)
  const plotRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)

  /** The event currently flashing from a jump, or null between jumps. */
  const [flashId, setFlashId] = useState<string | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /**
   * The nonce this effect last acted on, seeded from the first render's value
   * rather than a boolean flipped by the first call.
   *
   * StrictMode double-invokes an effect on mount — run, cleanup, run again —
   * both calls closing over the same `jumpNonce`. A boolean skip flag is set
   * true by the first call and stays true, so the second call falls through
   * the guard and jumps on every mount where a competition is already
   * selected (013 T032 follow-up). Seeding the ref to the mount's own nonce
   * means both calls compare that nonce against itself and skip alike; only a
   * later nonce that actually differs from what this ref last recorded runs
   * the jump.
   */
  const lastHandledNonceRef = useRef(jumpNonce)

  useEffect(() => {
    if (jumpNonce === lastHandledNonceRef.current) return
    lastHandledNonceRef.current = jumpNonce

    const scroller = scrollerRef.current
    const targetId = selectedCompetitionId
    const el =
      scroller && targetId
        ? scroller.querySelector<HTMLElement>(
            `[data-event-block][data-event-id="${targetId}"]`,
          )
        : null

    if (el) {
      if (typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'center', inline: 'center' })
      }
      setFlashId(targetId)
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
      flashTimerRef.current = setTimeout(() => setFlashId(null), FLASH_MS)
    }

    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
    // jumpNonce alone is the trigger (contract §4.4); selectedCompetitionId
    // is read from the same `set()` call that bumped it, so it is already
    // current by the time this effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpNonce])

  useEffect(() => {
    const el = plotRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width
      if (typeof width === 'number') {
        setPlotWidthPx((prev) => (prev === width ? prev : width))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [daysAvailable])

  const span = axisSpan(dayConfigs)
  const spanMinutes = span.endMinutes - span.startMinutes

  const rung = rungAt(zoom.zoomStep)
  const rowHeightPx = rung.row
  // On the ladder the rung's scale is the scale. Under Fit day the browser
  // solves the geometry and this is only an estimate for label fitting, from
  // the measured plot when there is one and rung 2 when there is not.
  const fitPixelsPerMinute =
    plotWidthPx > 0 && spanMinutes > 0
      ? plotWidthPx / spanMinutes
      : rungAt(FIT_FALLBACK_STEP).ppm
  const pixelsPerMinute = zoom.fitting ? fitPixelsPerMinute : rung.ppm
  const bandHeightPx = pixelsPerMinute < OVERVIEW_MAX_PPM ? BAND_HEIGHT_OVERVIEW_PX : BAND_HEIGHT_PX
  const plotWidthAtRung = spanMinutes * rung.ppm

  const ticks = useMemo(() => {
    if (spanMinutes <= 0) return []
    const step = tickStepMinutes(pixelsPerMinute)
    const count = Math.max(1, Math.ceil(spanMinutes / step))
    return Array.from({ length: count }, (_, i) => span.startMinutes + i * step)
  }, [span.startMinutes, spanMinutes, pixelsPerMinute])

  const lanes = useMemo(
    () => assignStripLanes(schedule.events, stripsTotal),
    [schedule.events, stripsTotal],
  )

  const summaries = useMemo(
    () => daySummariesFromBlocks(lanes, daysAvailable, findingRows),
    [lanes, daysAvailable, findingRows],
  )

  const competitionsById = useMemo(
    () => new Map(schedule.competitions.map((competition) => [competition.id, competition])),
    [schedule.competitions],
  )

  const drawn: DrawnBlock[] = []
  for (const placement of lanes) {
    const competition = competitionsById.get(placement.competitionId)
    if (!competition) continue
    drawn.push({
      placement,
      competition,
      label: competitionLabel(competition),
      findings: findingsForBlock(findings, placement.competitionId, placement.phase),
    })
  }

  const flagged = flaggedTargets(findingRows)
  /** Per day, the strip rows a flagged event has a block on. */
  const flaggedRowsByDay = new Map<number, Set<number>>()
  for (const { placement } of drawn) {
    if (!flagged.has(placement.competitionId)) continue
    let rows = flaggedRowsByDay.get(placement.day)
    if (!rows) {
      rows = new Set<number>()
      flaggedRowsByDay.set(placement.day, rows)
    }
    for (let i = 0; i < placement.stripCount; i++) rows.add(placement.firstStrip + i)
  }

  /**
   * The hovered block resolved against *this* render. A block that has left
   * the grid resolves to nothing and the tooltip closes, rather than
   * describing something no longer drawn.
   */
  const hoveredBlock =
    hovered === null
      ? null
      : (drawn.find(
          (block) =>
            block.placement.competitionId === hovered.competitionId &&
            block.placement.phase === hovered.phase,
        ) ?? null)

  /**
   * Hover is bound per block rather than hit-tested from the container.
   *
   * 004's canvas compared pointer coordinates against the rectangles it had
   * just computed, because its scroll positions were state it could subtract
   * back out. The browser owns both scroll offsets now, and on two axes across
   * four nested sticky layers, so the arithmetic that used to be one
   * subtraction would be a reconstruction of layout the DOM already did. The
   * element under the pointer is the answer to "which block is this", and
   * `pointerenter` is how the DOM reports it.
   *
   * The anchor is the block's own top centre, in viewport pixels, so the
   * tooltip stays put while the pointer moves within one block.
   */
  function handleEnter(block: DrawnBlock, e: PointerEvent<HTMLDivElement>): void {
    const rect = e.currentTarget.getBoundingClientRect()
    setHovered({
      competitionId: block.placement.competitionId,
      phase: block.placement.phase,
      anchorX: rect.left + rect.width / 2,
      anchorY: rect.top,
    })
  }

  function blockStyle(placement: BlockPlacement): CSSProperties {
    const durationMinutes = Math.max(0, placement.endMinutes - placement.startMinutes)
    const offsetMinutes = placement.startMinutes - span.startMinutes
    const geometry: CSSProperties = zoom.fitting
      ? {
          left: `${((offsetMinutes / spanMinutes) * 100).toFixed(4)}%`,
          width: `${((durationMinutes / spanMinutes) * 100).toFixed(4)}%`,
        }
      : {
          left: `${offsetMinutes * rung.ppm}px`,
          width: `${durationMinutes * rung.ppm}px`,
        }
    return {
      position: 'absolute',
      top: `${placement.firstStrip * rowHeightPx + 2}px`,
      height: `${Math.max(1, placement.stripCount * rowHeightPx - 4)}px`,
      ...geometry,
    }
  }

  const days = Array.from({ length: daysAvailable }, (_, day) => day)

  return (
    <section aria-label="Matrix canvas" className="relative h-full w-full min-w-0 flex-1">
      <div
        ref={scrollerRef}
        data-canvas-scroller="true"
        style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--chrome)' }}
      >
        <div style={{ minWidth: zoom.fitting ? '100%' : GUTTER_WIDTH_PX + plotWidthAtRung }}>
          {/* The time axis. Sticky on the vertical, with its own corner cell
              sticky on the horizontal, so the two frozen edges meet. */}
          <div
            data-time-axis="true"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 30,
              display: 'flex',
              height: AXIS_HEIGHT_PX,
              background: 'var(--chrome-deep)',
              borderBottom: '1.5px solid var(--chrome-border)',
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: 'sticky',
                left: 0,
                zIndex: 2,
                width: GUTTER_WIDTH_PX,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingRight: 8,
                background: 'var(--chrome-deep)',
                borderRight: '1.5px solid var(--chrome-border)',
                fontSize: 9.5,
                fontWeight: 600,
                letterSpacing: '.05em',
                textTransform: 'uppercase',
                color: 'var(--neutral-500)',
              }}
            >
              Strip
            </div>
            <div style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {ticks.map((minutes) => (
                <span
                  key={minutes}
                  data-hour-tick={minutes}
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: zoom.fitting
                      ? `${(((minutes - span.startMinutes) / spanMinutes) * 100).toFixed(4)}%`
                      : `${(minutes - span.startMinutes) * rung.ppm}px`,
                    paddingLeft: 5,
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    fontSize: 10.5,
                    color:
                      minutes % 60 === 0 ? 'var(--neutral-700)' : 'var(--neutral-500)',
                  }}
                >
                  {formatClock(minutes)}
                </span>
              ))}
            </div>
          </div>

          {days.map((day) => {
            const summary = summaries[day] ?? { day, ...EMPTY_SUMMARY }
            const flaggedRows = flaggedRowsByDay.get(day)
            const dayBlocks = drawn.filter((block) => block.placement.day === day)

            return (
              <div key={day} data-day-group={day}>
                <div
                  data-day-band={day}
                  style={{
                    position: 'sticky',
                    top: AXIS_HEIGHT_PX,
                    zIndex: 20,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 13,
                    height: bandHeightPx,
                    paddingLeft: 16,
                    paddingRight: 16,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    background: 'var(--chrome)',
                    borderTop: '1.5px solid var(--chrome-border)',
                    borderBottom: '1.5px solid var(--chrome-border)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: 'var(--neutral-700)',
                  }}
                >
                  {dayBandText(day, summary, stripsTotal)}
                </div>

                <div style={{ display: 'flex' }}>
                  <div
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 10,
                      width: GUTTER_WIDTH_PX,
                      flexShrink: 0,
                      background: 'var(--chrome-deep)',
                      borderRight: '1.5px solid var(--chrome-border)',
                    }}
                  >
                    {Array.from({ length: stripsTotal }, (_, strip) => {
                      const isFlagged = flaggedRows?.has(strip) ?? false
                      return (
                        <div
                          key={strip}
                          data-strip-row={strip}
                          data-flagged={isFlagged ? 'true' : undefined}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            height: rowHeightPx,
                            paddingRight: 8,
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            fontSize: Math.max(10, Math.min(11, rowHeightPx - 3)),
                            color: isFlagged ? 'var(--error-text)' : 'var(--neutral-700)',
                            background: isFlagged ? 'var(--error)' : undefined,
                            borderBottom: '1px solid var(--divider)',
                          }}
                        >
                          {stripRowLabel(strip, rowHeightPx, isFlagged)}
                        </div>
                      )
                    })}
                  </div>

                  <div
                    ref={day === 0 ? plotRef : undefined}
                    data-day-plot={day}
                    style={{
                      position: 'relative',
                      height: stripsTotal * rowHeightPx,
                      background: 'var(--card)',
                      ...(zoom.fitting
                        ? { flex: 1, minWidth: 0 }
                        : { width: plotWidthAtRung, flexShrink: 0 }),
                    }}
                  >
                    {dayBlocks.map((block) => (
                      <Block
                        key={`${block.placement.competitionId}:${block.placement.phase}`}
                        competition={block.competition}
                        label={block.label}
                        placement={block.placement}
                        pinned={placements[block.placement.competitionId]?.pinned ?? false}
                        selected={selectedCompetitionId === block.placement.competitionId}
                        flash={flashId === block.placement.competitionId}
                        widthPx={
                          (block.placement.endMinutes - block.placement.startMinutes) *
                          pixelsPerMinute
                        }
                        heightPx={block.placement.stripCount * rowHeightPx}
                        style={blockStyle(block.placement)}
                        findings={block.findings}
                        onPointerEnter={(e) => handleEnter(block, e)}
                        onPointerLeave={() => setHovered(null)}
                        onClick={() => selectCompetition(block.placement.competitionId)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Outside the scroller: the anchor is fixed-positioned, so it neither
          takes part in the canvas layout nor gets clipped by it.

          The target is built here in the prop rather than in a `const` above,
          and that is load-bearing rather than a style choice. React Compiler
          freezes a value at the JSX boundary, so a target assembled here is
          provably never mutated; assembled into a local first, the block it
          reads — and with it `lanes` and `competitionsById` — is inferred as
          possibly mutated later, and the compiler skips optimizing this
          component entirely. */}
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
                anchorX: hovered.anchorX,
                anchorY: hovered.anchorY,
              } satisfies CanvasTooltipTarget)
        }
      />
    </section>
  )
}

/**
 * What a day band says (FR-039, contracts/ui-contract.md §Canvas).
 *
 * One sentence, in the order a reader asks the questions: which day, how much
 * is on it, when it ends, how hard it leans on the strips, and whether
 * anything is wrong with it. `—` for a day with nothing placed, rather than a
 * time: a finish of 08:00 on an empty day is a number that reads as a fact.
 */
function dayBandText(day: number, summary: DaySummary, stripsTotal: number): string {
  const finish = summary.finish === null ? '—' : formatClock(summary.finish)
  return (
    `Day ${day + 1} · ${summary.events} events · finishes ${finish} · ` +
    `${summary.peakStrips} of ${stripsTotal} strips at peak · ${summary.findings} findings`
  )
}

/**
 * Which strip rows carry a number.
 *
 * Below about 15px of row the type would have to go under 10px to fit, so the
 * labels thin out instead of shrinking: the first row, every fifth, and any
 * row a finding lands on. A legible number on one row in five answers "which
 * strip is this?"; an 8px one on every row does not (mockup line 1561).
 */
function stripRowLabel(strip: number, rowHeightPx: number, isFlagged: boolean): string {
  const shown = rowHeightPx >= 15 || strip === 0 || (strip + 1) % 5 === 0 || isFlagged
  return shown ? String(strip + 1) : ''
}
