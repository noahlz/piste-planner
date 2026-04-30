/**
 * ASCII lane renderer — terminal-friendly per-day timeline of strip usage.
 *
 * Pure function over schedule output. Each day gets a header + time axis +
 * one row per group of contiguous strips that share an allocation pattern,
 * followed by an UNSCHEDULED footer at the end listing events the engine
 * could not place.
 *
 * Time resolution: 1 character = MINS_PER_CHAR minutes (default 10).
 * Strip-prefix area is fixed-width so the time axis aligns across rows.
 * Phase abbreviations: POOLS=P, FLIGHT_A=FA, FLIGHT_B=FB, DE_PRELIMS=DEP,
 * DE_ROUND_OF_16=R16, DE=DE.
 */

import { Phase, BottleneckSeverity, dayStart, dayEnd } from '../engine/types.ts'
import type {
  Bottleneck,
  Competition,
  ScheduleResult,
  StripAllocation,
  TournamentConfig,
} from '../engine/types.ts'

const MINS_PER_CHAR = 10
const PREFIX_WIDTH = 9 // "S001-S080" worst case + trailing space

export interface AsciiLaneRenderInput {
  schedule: Record<string, ScheduleResult>
  strip_allocations: StripAllocation[][]
  bottlenecks: Bottleneck[]
  config: TournamentConfig
  competitions: Competition[]
}

export function renderAsciiLanes(input: AsciiLaneRenderInput): string {
  const { schedule, strip_allocations, bottlenecks, config, competitions } = input
  const lines: string[] = []

  for (let d = 0; d < config.days_available; d++) {
    if (d > 0) lines.push('')
    lines.push(...renderDay(d, schedule, strip_allocations, config, competitions))
  }

  const unscheduled = renderUnscheduledFooter(schedule, bottlenecks, competitions)
  if (unscheduled.length > 0) {
    lines.push('')
    lines.push(...unscheduled)
  }

  return lines.join('\n')
}

function renderDay(
  d: number,
  schedule: Record<string, ScheduleResult>,
  strip_allocations: StripAllocation[][],
  config: TournamentConfig,
  competitions: Competition[],
): string[] {
  const dStart = dayStart(d, config)
  const dEnd = dayEnd(d, config)
  const dDur = dEnd - dStart
  const laneWidth = Math.ceil(dDur / MINS_PER_CHAR)

  const dayCompCount = competitions.filter(c => {
    const sr = schedule[c.id]
    return sr !== undefined && sr.assigned_day === d
  }).length

  const wallStart = formatHM(config.DAY_START_MINS)
  const wallEnd = formatHM(config.DAY_END_MINS)

  const out: string[] = []
  out.push(
    `DAY ${d + 1}  (${wallStart}-${wallEnd})   strips: ${config.strips_total}   video: ${config.video_strips_total}   scheduled: ${dayCompCount}`,
  )
  out.push(renderTimeAxis(config, laneWidth))

  // Build per-strip lane strings for this day.
  const lanes: string[] = []
  for (let i = 0; i < config.strips_total; i++) {
    lanes.push(renderLane(strip_allocations[i] ?? [], dStart, dEnd, laneWidth))
  }

  // Group consecutive strips that share an identical lane string.
  let groupStart = 0
  for (let i = 1; i <= lanes.length; i++) {
    if (i === lanes.length || lanes[i] !== lanes[groupStart]) {
      const prefix = stripGroupPrefix(groupStart, i - 1)
      out.push(`${prefix} ${lanes[groupStart]}`)
      groupStart = i
    }
  }

  return out
}

function renderTimeAxis(config: TournamentConfig, laneWidth: number): string {
  const buf = new Array<string>(PREFIX_WIDTH + laneWidth).fill(' ')
  const dayLenMins = config.DAY_END_MINS - config.DAY_START_MINS
  for (let h = 0; h * 60 < dayLenMins; h++) {
    const mins = config.DAY_START_MINS + h * 60
    const label = formatHM(mins)
    const col = PREFIX_WIDTH + Math.floor((h * 60) / MINS_PER_CHAR)
    for (let k = 0; k < label.length && col + k < buf.length; k++) {
      buf[col + k] = label[k]
    }
  }
  return buf.join('').trimEnd()
}

function renderLane(
  allocs: StripAllocation[],
  dStart: number,
  dEnd: number,
  laneWidth: number,
): string {
  const buf = new Array<string>(laneWidth).fill(' ')

  for (const a of allocs) {
    if (a.end_time <= dStart || a.start_time >= dEnd) continue
    const startCol = clamp(Math.floor((a.start_time - dStart) / MINS_PER_CHAR), 0, laneWidth)
    const endCol = clamp(Math.ceil((a.end_time - dStart) / MINS_PER_CHAR), 0, laneWidth)
    if (endCol <= startCol) continue

    const span = endCol - startCol
    if (span === 1) {
      // Too narrow for [..]; mark the slot with a single tick so the user can
      // at least see something happened here, even if the label is dropped.
      buf[startCol] = '|'
      continue
    }

    // Always paint brackets at the boundaries so adjacent allocations stay
    // visually separable; fill the interior with as much of the label as fits.
    buf[startCol] = '['
    buf[endCol - 1] = ']'
    const innerSpan = span - 2
    if (innerSpan <= 0) continue

    const label = `${phaseAbbrev(a.phase)}-${a.event_id}`
    for (let k = 0; k < innerSpan; k++) {
      buf[startCol + 1 + k] = k < label.length ? label[k] : ' '
    }
  }

  return buf.join('')
}

function renderUnscheduledFooter(
  schedule: Record<string, ScheduleResult>,
  bottlenecks: Bottleneck[],
  competitions: Competition[],
): string[] {
  const failed = competitions.filter(c => schedule[c.id] === undefined)
  if (failed.length === 0) return []

  const reasonByEvent = new Map<string, string>()
  for (const b of bottlenecks) {
    if (b.severity !== BottleneckSeverity.ERROR) continue
    if (!b.competition_id) continue
    if (!reasonByEvent.has(b.competition_id)) {
      reasonByEvent.set(b.competition_id, `${b.cause} at ${b.phase}`)
    }
  }

  const out: string[] = []
  out.push(`UNSCHEDULED (${failed.length}):`)
  for (const c of failed) {
    const reason = reasonByEvent.get(c.id) ?? 'no terminating phase reached'
    out.push(`  ${c.id} - ${reason}`)
  }
  return out
}

function stripGroupPrefix(startIdx: number, endIdx: number): string {
  const lo = String(startIdx + 1).padStart(2, '0')
  const hi = String(endIdx + 1).padStart(2, '0')
  const label = startIdx === endIdx ? `S${lo}` : `S${lo}-S${hi}`
  return label.padEnd(PREFIX_WIDTH - 1, ' ')
}

function phaseAbbrev(p: Phase): string {
  switch (p) {
    case Phase.POOLS:
      return 'P'
    case Phase.FLIGHT_A:
      return 'FA'
    case Phase.FLIGHT_B:
      return 'FB'
    case Phase.DE_PRELIMS:
      return 'DEP'
    case Phase.DE_ROUND_OF_16:
      return 'R16'
    case Phase.DE:
      return 'DE'
    default:
      return String(p)
  }
}

function formatHM(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
