/**
 * The strip search: the smallest strip count that places every event.
 *
 * The **ceiling** is `suggestStripCount` (`analysis.ts:42`), which sizes for
 * peak concurrency — every pool of the busiest day running at once. A board the
 * scheduler cannot place there is not placed by adding strips. The **floor** is
 * the tournament's aggregate strip-hours divided by the hours available
 * (`days_available × DAY_LENGTH_MINS`), rounded up and at least 1 (FR-003):
 * below it the work does not fit in the tournament at all, whatever the
 * arrangement. Both bounds are necessary conditions, so the answer lies between
 * them or does not exist.
 *
 * **The scan runs upward one strip at a time, and that is load-bearing.** `[M]`
 * `specs/012-actionable-strip-suggestion/baseline.md` §1a swept every count in
 * range across ten templates: on four of them a count *above* the smallest
 * working count places *fewer* events. Scheduling is not monotonic in strip
 * count, so any method assuming it is — a bisection, or a scan that samples
 * rather than steps — reads the non-monotone band as failure and returns the
 * monotone threshold instead, 10 strips high on NAC Youth and 11 on NAC
 * Vet/Div1/Junior. Stepping by one is correct without the assumption, and the
 * range's length is `ceiling − floor + 1`, known before the loop starts
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
import { suggestStripCount } from './analysis.ts'
import type { Competition, TournamentConfig } from './types.ts'

/** The inclusive bounds of one search, both necessary conditions on the answer. */
export interface StripSearchRange {
  /** Aggregate strip-hours ÷ available hours, rounded up, at least 1 (FR-003). */
  floor: number
  /** `suggestStripCount` — the busiest day's pools running at once. */
  ceiling: number
}

/** One evaluated strip count: what the scheduler did with it. */
export interface StripCandidate {
  /** The strip count evaluated. */
  count: number
  /** Schedule entries with a non-null `pool_start` — the app's own rule (`runActions.ts:28`). */
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
 * The two bounds for a board, or `null` when `suggestStripCount` finds no
 * sizeable competition. A `null` ceiling is the absence of an answer before any
 * scan, never a zero (011 FR-010).
 */
export function stripSearchRange(
  competitions: Competition[],
  config: TournamentConfig,
): StripSearchRange | null {
  const ceiling = suggestStripCount(competitions, config.days_available, config.max_pool_strip_pct)
  if (ceiling === null) return null

  const availableHours = config.days_available * config.DAY_LENGTH_MINS / 60
  const { total_strip_hours } = aggregateStripHours(competitions, config)
  const floor = Math.max(1, Math.ceil(total_strip_hours / availableHours))

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
 */
export function* scanStripCounts(
  competitions: Competition[],
  config: TournamentConfig,
  range: StripSearchRange,
): Generator<StripCandidate, number | null, void> {
  // Written as `!(floor <= ceiling)` rather than `floor > ceiling` so a
  // non-finite bound fails here too. A backwards or NaN range is an arithmetic
  // contradiction — the ceiling sizes for peak concurrency and the floor for
  // aggregate demand, so neither can exceed the other — and scanning it would
  // return the absence of an answer, indistinguishable from an honest "no count
  // found" (constitution IV, FR-004, research.md D3).
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
    const { schedule } = scheduleAll(competitions, candidateConfig)
    const placed = Object.values(schedule).filter(r => r.pool_start !== null).length
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
): number | null {
  const range = stripSearchRange(competitions, config)
  if (range === null) return null

  const scan = scanStripCounts(competitions, config, range)
  let step = scan.next()
  while (!step.done) step = scan.next()
  return step.value
}
