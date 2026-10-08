/**
 * The strip search: the smallest strip count that places every event
 * (METHODOLOGY.md §Strip Count Suggestion).
 *
 * The **pool ceiling** is `suggestStripCount` (`analysis.ts`), which sizes for
 * peak concurrency — every pool of the busiest day running at once. A board the
 * scheduler cannot place there is not placed by adding strips. The **floor** is
 * the larger of two rules, both of which the answer may never undercut:
 *
 * - the **strip-hour floor**: the tournament's aggregate strip-hours divided by
 *   the hours available (`days_available × DAY_LENGTH_MINS`, the 600-minute
 *   planning day of §Strip-Hour Capacity), rounded up and at least 1 (FR-003).
 *   Below it the work does not fit in the tournament at all, whatever the
 *   arrangement.
 * - the **manual baseline**: the busiest day's competitors ÷ 14, rounded up
 *   (Ops Manual 2026-27 p.17, "Number of strips needed = Estimated number of
 *   competitors per day / 14"; 024 D7). The busiest day comes from spreading the
 *   competitions' fencer counts over the tournament days largest-first, each
 *   into the day with the fewest competitors so far – the same spread
 *   `suggestStripCount` applies to pool counts (`busiestDayLoad`) – and taking
 *   the day that ends with the most. It depends only on the fencer counts and
 *   the number of days, never on the strip count being tested. A team event
 *   counts its entries as stored, one per team. The spread covers the
 *   competitions `aggregateStripHours` counts, so a fencer count outside
 *   `MIN_FENCERS`–`MAX_FENCERS` is left out. The divisor is fixed at 14 and
 *   does not scale when the organizer edits a day's hours: it is competitors
 *   per strip per day, not a day length.
 *
 * Normally the floor sits at or below the pool ceiling and the search runs
 * between them. When the floor exceeds the pool ceiling, the window is
 * `[floor, floor + pool ceiling]` (024 D7): the floor is still a necessary
 * condition, and the pool ceiling's worth of headroom above it keeps the scan
 * bounded.
 *
 * **The scan runs upward one strip at a time, and that is load-bearing.** `[M]`
 * `specs/012-actionable-strip-suggestion/baseline.md` (removed; git show 0ab5bd2dc9:specs/012-actionable-strip-suggestion/baseline.md) §1a swept every count in
 * range across ten templates: on four of them a count *above* the smallest
 * working count places *fewer* events. Scheduling is not monotonic in strip
 * count, so any method assuming it is — a bisection, or a scan that samples
 * rather than steps — reads the non-monotone band as failure and returns the
 * monotone threshold instead, 10 strips high on NAC Youth and 11 on NAC
 * Vet/Div1/Junior. Stepping by one is correct without the assumption, and the
 * window's length is `ceiling − floor + 1`, known before the loop starts
 * (constitution IV).
 *
 * This module is the only strip-count rule that reaches an organizer (FR-016),
 * and it is a **leaf** (research.md D1): it imports downward only and nothing
 * under `src/engine/` imports it, so it cannot join the `analysis.ts` ↔
 * `stripBudget.ts` cycle. `scheduleAll` never reaches it — the store is its
 * only caller. The scan yields between candidates so that caller can hand the
 * browser a turn; the engine half owns no timer and no promise (research.md D5).
 */

import { scheduleAll } from './scheduler.ts'
import { aggregateStripHours } from './capacity.ts'
import { buildStrips } from './stripBudget.ts'
import { suggestStripCount, busiestDayLoad } from './analysis.ts'
import { phaseKey, phaseSpans, unseatedPhases } from './unseated.ts'
import { COMPETITORS_PER_STRIP_PER_DAY } from './constants.ts'
import type { Competition, TournamentConfig, PinnedPlacement } from './types.ts'

/** The inclusive bounds of one search. */
export interface StripSearchRange {
  /**
   * max(strip-hour floor, manual baseline): aggregate strip-hours ÷ available
   * hours, rounded up and at least 1 (FR-003), or the busiest day's
   * competitors ÷ 14, rounded up, whichever is larger.
   */
  floor: number
  /**
   * `suggestStripCount` — the busiest day's pools running at once — or, when
   * the floor is above that, the floor plus it (024 D7).
   */
  ceiling: number
}

/** One evaluated strip count: what the scheduler did with it. */
export interface StripCandidate {
  /** The strip count evaluated. */
  count: number
  /**
   * Schedule entries with a non-null `pool_start` — the app's own rule
   * (`runActions.ts:28`) — **minus** every event with an unseated phase at this
   * count (`unseatedPhases`, the rule the canvas and the Findings panel share).
   *
   * A pin keeps its day and start whether or not it finds free strips, so its
   * `pool_start` is non-null either way and the first rule alone cannot see a
   * pinned board overflow. Worse, a pin that claims nothing consumes nothing,
   * so counting it as placed makes a crowded board look *cheaper* than the
   * same board with no pins on it. Research D1 asks this search for "the
   * smallest count that places every event *around the pins* … without it the
   * card could name a count at which the pinned board overflows", and an
   * unseated phase is exactly that overflow.
   */
  placed: number
  /**
   * Competitions inside `MIN_FENCERS`–`MAX_FENCERS`, the filter
   * `aggregateStripHours` applies — not `competitions.length`.
   * `concurrentScheduler.ts:229-242` drops a competition carrying a per-event
   * ERROR (fencer-count bounds) and schedules the rest, so under the wider
   * definition a board holding one 0-fencer event could never place every
   * event at any count. `[M]` On every measured template all events are
   * sizeable, so this changes no number.
   */
  required: number
  /** `placed === required` — this count works. */
  placesAll: boolean
}

/**
 * The busiest day's competitors: the fencer counts of every competition inside
 * `MIN_FENCERS`–`MAX_FENCERS` (the competitions `aggregateStripHours` counts),
 * spread largest-first over `days_available` by `busiestDayLoad`. A team
 * event's count is its entries as stored. Reads no strip count and no day
 * hours (METHODOLOGY.md §Strip Count Suggestion).
 */
export function busiestDayCompetitors(
  competitions: Competition[],
  config: TournamentConfig,
): number {
  const counts = competitions
    .filter(c => c.fencer_count >= config.MIN_FENCERS && c.fencer_count <= config.MAX_FENCERS)
    .map(c => c.fencer_count)
  return busiestDayLoad(counts, config.days_available)
}

/**
 * The manual baseline: the busiest day's competitors ÷
 * `COMPETITORS_PER_STRIP_PER_DAY` (14), rounded up (Ops Manual 2026-27 p.17,
 * 024 D7). The divisor is fixed, so an organizer's edited day hours never move
 * it.
 */
export function manualBaselineStrips(
  competitions: Competition[],
  config: TournamentConfig,
): number {
  return Math.ceil(busiestDayCompetitors(competitions, config) / COMPETITORS_PER_STRIP_PER_DAY)
}

/**
 * The search window for a board, or `null` when `suggestStripCount` finds no
 * sizeable competition. A `null` ceiling is the absence of an answer before any
 * scan, never a zero (011 FR-010).
 *
 * The floor is max(strip-hour floor, manual baseline). The ceiling is the pool
 * ceiling, unless the floor is above it, when the window becomes
 * `[floor, floor + pool ceiling]` (024 D7).
 */
export function stripSearchRange(
  competitions: Competition[],
  config: TournamentConfig,
): StripSearchRange | null {
  const poolCeiling = suggestStripCount(competitions, config.days_available, config.max_pool_strip_pct)
  if (poolCeiling === null) return null

  const availableHours = config.days_available * config.DAY_LENGTH_MINS / 60
  const { total_strip_hours } = aggregateStripHours(competitions, config)
  const stripHourFloor = Math.max(1, Math.ceil(total_strip_hours / availableHours))
  const floor = Math.max(stripHourFloor, manualBaselineStrips(competitions, config))

  const ceiling = floor > poolCeiling ? floor + poolCeiling : poolCeiling
  return { floor, ceiling }
}

/**
 * Evaluates every count in `range`, low to high, yielding each candidate before
 * moving on, and returns the first count that places every event — or `null`
 * when the range is exhausted without one. The caller drives it, so it can
 * yield to the browser between candidates (research.md D5).
 *
 * Each candidate's config is the caller's with only `strips_total` and `strips`
 * replaced, every other field held, so the search evaluates exactly the config
 * `buildTournamentConfig` would produce at that count. Neither argument is
 * mutated.
 *
 * `pinned` rides through to every candidate (013 research D1), so the answer is
 * the smallest count that places every event *around the pins* — the count the
 * organizer will be judged by once they apply it. Without it the card could
 * name a count at which the pinned board overflows.
 */
export function* scanStripCounts(
  competitions: Competition[],
  config: TournamentConfig,
  range: StripSearchRange,
  pinned: readonly PinnedPlacement[] = [],
): Generator<StripCandidate, number | null, void> {
  // Written as `!(floor <= ceiling)` rather than `floor > ceiling` so a
  // non-finite bound fails here too. `stripSearchRange` never builds a
  // backwards range – a floor above the pool ceiling widens the window instead
  // (024 D7) – so a backwards or NaN range is a caller's arithmetic error, and
  // scanning it would return the absence of an answer, indistinguishable from
  // an honest "no count found" (constitution IV, FR-004, research.md D3).
  if (!(range.floor <= range.ceiling)) {
    throw new Error(
      `strip search range is backwards: floor ${range.floor} exceeds ceiling ${range.ceiling}`,
    )
  }

  const required = competitions.filter(
    c => c.fencer_count >= config.MIN_FENCERS && c.fencer_count <= config.MAX_FENCERS,
  ).length

  // A direct computation: the loop runs `ceiling - floor + 1` times, fixed
  // before entry. No convergence, no second cap.
  for (let count = range.floor; count <= range.ceiling; count++) {
    const candidateConfig: TournamentConfig = {
      ...config,
      strips_total: count,
      strips: buildStrips(count, config.video_strips_total),
    }
    const run = scheduleAll(competitions, candidateConfig, pinned)
    const { schedule } = run
    let placed = Object.values(schedule).filter(r => r.pool_start !== null).length
    if (pinned.length > 0) {
      // Guarded, so the no-pins path runs the same statements it did before
      // this feature — with no pins every phase is seated, so the guard
      // changes no number, only which statements execute.
      const unseated = unseatedPhases(run)
      for (const [id, result] of Object.entries(schedule)) {
        if (result.pool_start === null) continue
        if (phaseSpans(result).some(span => unseated.has(phaseKey(id, span.phase)))) placed--
      }
    }
    const placesAll = placed === required

    yield { count, placed, required, placesAll }
    if (placesAll) return count
  }

  return null
}

/**
 * The whole search in one synchronous call: the smallest strip count that
 * places every event, or `null` when the board has no sizeable competition or
 * no count in range works.
 *
 * The store drives `scanStripCounts` itself so it can yield to the browser
 * between candidates; this is for callers that do not need to — the tests and
 * the drift ledger.
 */
export function searchStripCount(
  competitions: Competition[],
  config: TournamentConfig,
  pinned: readonly PinnedPlacement[] = [],
): number | null {
  const range = stripSearchRange(competitions, config)
  if (range === null) return null

  const scan = scanStripCounts(competitions, config, range, pinned)
  let step = scan.next()
  while (!step.done) step = scan.next()
  return step.value
}
