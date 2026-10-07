/**
 * Which strips each drawn phase holds (017 spec §3). Pure: no React, no store.
 *
 * ## Kept first, on their own indices
 *
 * A kept event is one the last run placed and nobody has moved since. Its
 * phases are drawn on exactly the strip indices the scheduler claimed for
 * them, read from the kept run and never re-chosen, so a run's board is the
 * engine's board. They are seated first, per day, as fixed occupancy.
 *
 * ## Derived around them, by the engine's own rule
 *
 * Every other event (hand-moved, or every event on a stale board) is
 * *derived*: its times come from `deriveEventSchedule`. Each derived phase is
 * offered to the engine's `findAvailableStripsInWindow` over a resource state
 * holding everything seated so far that day, and a hit is claimed with the
 * engine's `allocateInterval`. The candidate rule (non-video first, video
 * only for a video-required phase) is the engine's, never a copy. A miss
 * leaves the phase **unseated**: it holds no strips and records no occupancy,
 * so one phase with no room cannot push any other out of place.
 *
 * ## Fixed order (P5, owner-approved)
 *
 * Derived events are seated whole, by (day, event start, id by code point,
 * phase order), on every recompute, not in the order they were edited. The
 * event start is its earliest phase start, so one event's phases are never
 * interleaved with another's. Kept events never move when a derived one is
 * added, but a later hand move with an earlier start may take strips an
 * earlier hand move held and unseat it.
 *
 * ## Days never contend
 *
 * Times are minutes from each day's own midnight, so day 0 at 600 and day 1
 * at 600 are different moments. Each day gets its own resource state.
 *
 * ## Bounded
 *
 * One pass over the phases, each offered once to a search bounded by the strip
 * count. No retry, no backtracking (constitution IV).
 */

import type { DerivedEventSchedule } from '../engine/derive.ts'
import type { Competition, GlobalState, Phase, TournamentConfig } from '../engine/types.ts'
import { allocateInterval, createGlobalState, findAvailableStripsInWindow } from '../engine/resources.ts'
import { phaseRequiresVideo, phaseSpans } from '../engine/unseated.ts'
import { compareIds } from '../engine/order.ts'
import type { BlockPlacement } from './lanes.ts'

/** One event to draw: its result on the clock axis, plus the strips its run kept, or `null` when derived. */
export type DrawnEventInput = DerivedEventSchedule & {
  keptStrips: Readonly<Partial<Record<Phase, readonly number[]>>> | null
}

/** A stretch of consecutive strip indices, `first` 0-based. */
export interface StripRun {
  first: number
  count: number
}

/**
 * One drawn phase. `strips` is ascending and empty when `unseated`; `runs` are
 * its maximal consecutive stretches. `firstStrip` and `overflow` keep code
 * typed on `BlockPlacement` compiling until the canvas reads `runs` (T6b).
 */
export interface DrawnBlock extends BlockPlacement {
  strips: readonly number[]
  runs: readonly StripRun[]
  unseated: boolean
}

/** A kept run names a strip the current config does not have. */
export class KeptStripOutOfRangeError extends Error {
  readonly competitionId: string
  readonly phase: Phase
  readonly strip: number

  constructor(competitionId: string, phase: Phase, strip: number, stripsTotal: number) {
    super(`kept strip ${strip} of ${competitionId} ${phase} is outside the ${stripsTotal} strips`)
    this.name = 'KeptStripOutOfRangeError'
    this.competitionId = competitionId
    this.phase = phase
    this.strip = strip
  }
}

/** One phase waiting for strips. `rank` is its place in its event's `phaseSpans` order. */
interface Candidate {
  competitionId: string
  day: number
  phase: Phase
  rank: number
  /** The event's earliest phase start: the seating key P5 orders derived events by. */
  eventStartMinutes: number
  startMinutes: number
  endMinutes: number
  stripCount: number
  /** Ascending kept indices, or `null` for a derived phase. */
  kept: readonly number[] | null
}

/** Drawing order: (day, phase start, id, phase order). */
function compareForOutput(a: Candidate, b: Candidate): number {
  return a.day - b.day
    || a.startMinutes - b.startMinutes
    || compareIds(a.competitionId, b.competitionId)
    || a.rank - b.rank
}

/** Seating order (P5): (day, event start, id, phase order), so each event is seated whole. */
function compareForSeating(a: Candidate, b: Candidate): number {
  return a.day - b.day
    || a.eventStartMinutes - b.eventStartMinutes
    || compareIds(a.competitionId, b.competitionId)
    || a.rank - b.rank
}

function runsOf(strips: readonly number[]): StripRun[] {
  const runs: StripRun[] = []
  for (const strip of strips) {
    const last = runs[runs.length - 1]
    if (last && last.first + last.count === strip) last.count++
    else runs.push({ first: strip, count: 1 })
  }
  return runs
}

function keptIndices(candidate: Omit<Candidate, 'kept'>, strips: readonly number[], stripsTotal: number): number[] {
  for (const strip of strips) {
    if (!Number.isInteger(strip) || strip < 0 || strip >= stripsTotal) {
      throw new KeptStripOutOfRangeError(candidate.competitionId, candidate.phase, strip, stripsTotal)
    }
  }
  return [...strips].sort((a, b) => a - b)
}

/**
 * Seats every drawable phase. Events with `day_out_of_range` are skipped: the
 * canvas has no row for their day. Output is sorted by (day, start, id by code
 * point, phase order), whatever order `events` arrives in.
 */
export function assignStrips(
  events: Record<string, DrawnEventInput>,
  config: TournamentConfig,
  competitions: Competition[],
): DrawnBlock[] {
  const stripsTotal = config.strips.length
  const competitionById = new Map(competitions.map(c => [c.id, c]))

  const candidates: Candidate[] = []
  for (const [competitionId, input] of Object.entries(events)) {
    if (input.day_out_of_range) continue
    const day = input.result.assigned_day
    const spans = phaseSpans(input.result)
    const eventStartMinutes = Math.min(...spans.map(span => span.start))
    spans.forEach((span, rank) => {
      const base = {
        competitionId, day, phase: span.phase, rank, eventStartMinutes,
        startMinutes: span.start, endMinutes: span.end, stripCount: span.stripCount,
      }
      const kept = input.keptStrips === null
        ? null
        : keptIndices(base, input.keptStrips[span.phase] ?? [], stripsTotal)
      candidates.push({ ...base, kept })
    })
  }
  candidates.sort(compareForOutput)

  const stateByDay = new Map<number, GlobalState>()
  const stateFor = (day: number): GlobalState => {
    let state = stateByDay.get(day)
    if (!state) {
      state = createGlobalState(config)
      stateByDay.set(day, state)
    }
    return state
  }

  const seated = new Map<Candidate, readonly number[]>()

  // Kept phases first, so no derived phase can take a strip a kept one holds.
  for (const candidate of candidates) {
    if (candidate.kept === null) continue
    seated.set(candidate, candidate.kept)
    if (candidate.kept.length > 0) {
      allocateInterval(stateFor(candidate.day), candidate.competitionId, candidate.phase,
        [...candidate.kept], candidate.startMinutes, candidate.endMinutes)
    }
  }

  for (const candidate of [...candidates].sort(compareForSeating)) {
    if (candidate.kept !== null) continue
    // A phase with nothing to claim holds nothing and is not unseated, by the shared rule.
    if (candidate.stripCount <= 0) {
      seated.set(candidate, [])
      continue
    }
    const competition = competitionById.get(candidate.competitionId)
    if (!competition) throw new Error(`assignStrips: no competition ${candidate.competitionId}`)
    const state = stateFor(candidate.day)
    const fit = findAvailableStripsInWindow(
      state, config, candidate.stripCount, candidate.startMinutes,
      candidate.endMinutes - candidate.startMinutes,
      phaseRequiresVideo(candidate.phase, competition), candidate.day,
    )
    if (fit.fit !== 'ok') {
      seated.set(candidate, [])
      continue
    }
    allocateInterval(state, candidate.competitionId, candidate.phase, fit.strip_indices,
      candidate.startMinutes, candidate.endMinutes)
    seated.set(candidate, [...fit.strip_indices].sort((a, b) => a - b))
  }

  return candidates.map(candidate => {
    const strips = seated.get(candidate) ?? []
    const runs = runsOf(strips)
    const unseated = candidate.stripCount > 0 && strips.length === 0
    return {
      competitionId: candidate.competitionId,
      day: candidate.day,
      phase: candidate.phase,
      startMinutes: candidate.startMinutes,
      endMinutes: candidate.endMinutes,
      stripCount: candidate.stripCount,
      firstStrip: runs[0]?.first ?? 0,
      overflow: unseated,
      strips,
      runs,
      unseated,
    }
  })
}
