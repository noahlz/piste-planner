/**
 * Which strips a block occupies — FR-012, constitution IV.
 *
 * `Placement.strips` is `number[] | null` and is **always null** in P3
 * (`src/store/runActions.ts`), so a placement implies a strip *count*, never
 * strip indices. The engine grants an event four strips; it does not say which
 * four. Without a choice made somewhere every block on a day would draw from
 * strip 1 and they would all pile on top of each other, so the canvas makes it
 * here — a view concern, kept out of `src/engine/` (constitution I).
 *
 * ## First fit, and why it is bounded
 *
 * Blocks are laid out in a fixed order and each takes the lowest contiguous run
 * of strips that is free for its whole time span. The scan is a triple `for`
 * over (candidate start x strips in the run x intervals already on that strip)
 * with no retry and no backtracking: a block that finds no run does not
 * re-shuffle the ones before it, it overflows. Constitution IV — a bounded
 * computation, not a search that can fail to converge.
 *
 * ## Overflow does not cascade
 *
 * A block with nowhere to go is reported with `overflow: true` and drawn at
 * strip 0, where it will overlap whatever is there. It deliberately records
 * **no** occupancy: a block that found no room holds no room either, and
 * letting it claim strips it was never granted would push every later block
 * out of place and turn one over-capacity day into a day of misplaced blocks.
 *
 * ## The order is fixed on purpose
 *
 * Day, then start minute, then competition id, then — by a stable sort over
 * `eventTimeSegments`' emission order — the phases of one event in the order
 * they run. Object key order is not a guarantee to lean on, and a lane
 * assignment that varied between renders would make blocks jump under the
 * pointer.
 */

import type { DerivedEventSchedule } from '../../engine/derive.ts'
import type { Phase } from '../../engine/types.ts'
import { eventTimeSegments } from './geometry.ts'
import { intersectsTimeRange } from './windowing.ts'

/** One block, resolved to the rows it draws across. */
export interface BlockPlacement {
  competitionId: string
  day: number
  phase: Phase
  startMinutes: number
  endMinutes: number
  stripCount: number
  /** 0-based strip index inside the day. */
  firstStrip: number
  /** No free run existed, so the block is drawn at strip 0 and overlaps. */
  overflow: boolean
}

/** A span of minutes one strip is already spoken for. */
interface Occupancy {
  startMinutes: number
  endMinutes: number
}

/** The blocks of one day, before lanes are chosen. */
interface Candidate {
  competitionId: string
  day: number
  phase: Phase
  startMinutes: number
  endMinutes: number
  stripCount: number
}

/**
 * Day, then start minute, then competition id — and nothing after that.
 *
 * Two blocks reaching this last `return 0` share an event, a day and a start
 * minute, so the only thing left to order them by is phase. `Array.prototype.sort`
 * is stable, so they keep the order `eventTimeSegments` emitted them in, which
 * is already chronological within an event: pools or flights first, then the DE
 * phases. A phase rank here would be a second, independent statement of that
 * order — one that no real `ScheduleResult` can exercise, since a single-stage
 * DE and a staged DE are mutually exclusive on the result and neither ever
 * starts at the pool start. Two orders that only one fixture can tell apart is
 * one order too many, so the emission order is the whole rule.
 */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.day !== b.day) return a.day - b.day
  if (a.startMinutes !== b.startMinutes) return a.startMinutes - b.startMinutes
  if (a.competitionId !== b.competitionId) return a.competitionId < b.competitionId ? -1 : 1
  return 0
}

/** Whether every strip in `[firstStrip, firstStrip + stripCount)` is free. */
function runIsFree(
  occupied: Occupancy[][],
  firstStrip: number,
  candidate: Candidate,
): boolean {
  for (let strip = firstStrip; strip < firstStrip + candidate.stripCount; strip++) {
    for (const taken of occupied[strip]) {
      if (
        intersectsTimeRange(
          { startMinutes: taken.startMinutes, endMinutes: taken.endMinutes },
          candidate.startMinutes,
          candidate.endMinutes,
        )
      ) {
        return false
      }
    }
  }
  return true
}

/**
 * The lowest free run for a candidate, or `null` when the day has none. Scans
 * every legal start once, in order, and stops at the first that fits.
 */
function firstFit(
  occupied: Occupancy[][],
  stripsTotal: number,
  candidate: Candidate,
): number | null {
  if (candidate.stripCount > stripsTotal) return null
  for (let firstStrip = 0; firstStrip + candidate.stripCount <= stripsTotal; firstStrip++) {
    if (runIsFree(occupied, firstStrip, candidate)) return firstStrip
  }
  return null
}

/**
 * Assigns every drawable block a strip run.
 *
 * Events whose `day_out_of_range` is set are **skipped**: the canvas has no row
 * for their day, so there is nowhere to draw them. That is the one place the
 * matrix and the schedule table deliberately differ (FR-023) — the table still
 * lists such an event, flagged.
 */
export function assignStripLanes(
  events: Record<string, DerivedEventSchedule>,
  stripsTotal: number,
): BlockPlacement[] {
  const candidates: Candidate[] = []
  for (const [competitionId, derived] of Object.entries(events)) {
    if (derived.day_out_of_range) continue
    const day = derived.result.assigned_day
    for (const segment of eventTimeSegments(derived)) {
      candidates.push({
        competitionId,
        day,
        phase: segment.phase,
        startMinutes: segment.startMinutes,
        endMinutes: segment.endMinutes,
        stripCount: segment.stripCount,
      })
    }
  }
  candidates.sort(compareCandidates)

  const strips = Math.max(0, Math.floor(stripsTotal))
  const perDay = new Map<number, Occupancy[][]>()
  const placements: BlockPlacement[] = []

  for (const candidate of candidates) {
    let occupied = perDay.get(candidate.day)
    if (!occupied) {
      occupied = Array.from({ length: strips }, (): Occupancy[] => [])
      perDay.set(candidate.day, occupied)
    }

    const fit = firstFit(occupied, strips, candidate)
    if (fit !== null) {
      for (let strip = fit; strip < fit + candidate.stripCount; strip++) {
        occupied[strip].push({
          startMinutes: candidate.startMinutes,
          endMinutes: candidate.endMinutes,
        })
      }
    }

    placements.push({
      competitionId: candidate.competitionId,
      day: candidate.day,
      phase: candidate.phase,
      startMinutes: candidate.startMinutes,
      endMinutes: candidate.endMinutes,
      stripCount: candidate.stripCount,
      firstStrip: fit ?? 0,
      overflow: fit === null,
    })
  }

  return placements
}
