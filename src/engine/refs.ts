import { Phase, Weapon, RefPolicy } from './types.ts'
import type {
  TournamentConfig,
  Competition,
  RefDemandInterval,
  RefDemandByDay,
  RefRequirementsByDay,
  ScheduleResult,
} from './types.ts'
import { computePoolStructure } from './pools.ts'
import { computeBracketSize, deVideoStripAsk } from './de.ts'
import { phaseKey } from './unseated.ts'

/**
 * Estimates peak concurrent pool-round referee demand for a single competition.
 *
 * With infinite refs (as required by Phase 1.5a simulation), all pools run
 * concurrently. Demand is scaled by the ref_policy:
 * - ONE: 1 ref per pool
 * - TWO: 2 refs per pool
 * - AUTO: 2 refs per pool (peak estimate — AUTO tries 2 first, so we size for that)
 *
 * Takes no config, so its callers guard it: `comp` must have a count
 * `isSizeableCount` accepts (018 T4).
 */
export function peakPoolRefDemand(comp: Competition, ref_policy: RefPolicy): number {
  const { n_pools } = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
  return ref_policy === RefPolicy.ONE ? n_pools : n_pools * 2
}

/**
 * Estimates peak concurrent DE referee demand for a single competition.
 *
 * The peak DE referee demand is the video block's ask, min(4, bracketSize / 2)
 * (METHODOLOGY.md §DE Modes), at DE_REFS (1) per strip. It does not depend on
 * `strips_allocated`.
 */
export function peakDeRefDemand(comp: Competition, config: TournamentConfig): number {
  const videoAsk = deVideoStripAsk(
    computeBracketSize(comp.fencer_count, comp.cut_mode, comp.cut_value, comp.event_type),
  )
  return config.DE_REFS * videoAsk
}

/**
 * Sweep-line helper: given a list of intervals, returns the peak running count
 * and the time at which it is first reached.
 *
 * Tie-break rule: when a start event (delta > 0) and an end event (delta < 0)
 * share the same time, the start event is processed first. This ensures that
 * two back-to-back intervals that share a boundary time are counted as
 * concurrent at that boundary (matching the OR model where handoff is instant).
 */
function sweepLine(intervals: RefDemandInterval[]): { peak: number; peakTime: number } {
  if (intervals.length === 0) return { peak: 0, peakTime: 0 }

  // Emit (time, delta) events — +count at start, -count at end
  const events: Array<{ time: number; delta: number }> = []
  for (const { startTime, endTime, count } of intervals) {
    events.push({ time: startTime, delta: count })
    events.push({ time: endTime, delta: -count })
  }

  // Sort ascending by time; within same time, positive deltas (starts) come first
  events.sort((a, b) => a.time - b.time || b.delta - a.delta)

  let running = 0
  let peak = 0
  let peakTime = 0

  for (const { time, delta } of events) {
    running += delta
    if (running > peak) {
      peak = running
      peakTime = time
    }
  }

  return { peak, peakTime }
}

/**
 * Computes peak concurrent referee requirements per day via a sweep-line over
 * demand intervals emitted by the scheduler.
 *
 * Returns one entry per day in [0, daysAvailable). Days with no intervals (or
 * absent from demandByDay) yield all-zero entries with peak_time=0.
 */
export function computeRefRequirements(
  demandByDay: Record<number, RefDemandByDay>,
  daysAvailable: number,
): RefRequirementsByDay[] {
  const result: RefRequirementsByDay[] = []

  for (let d = 0; d < daysAvailable; d++) {
    const intervals: RefDemandInterval[] = demandByDay[d]?.intervals ?? []

    const { peak: peak_total_refs, peakTime: peak_time } = sweepLine(intervals)
    const sabreOnly = intervals.filter(iv => iv.weapon === Weapon.SABRE)
    const { peak: peak_saber_refs } = sweepLine(sabreOnly)

    result.push({ day: d, peak_total_refs, peak_saber_refs, peak_time })
  }

  return result
}

/**
 * Turns a set of scheduled events into per-day referee demand intervals
 * (METHODOLOGY.md §Ref Demand Derivation, 016 spec §5): pools by
 * `pool_refs_count`, a flighted event by its two flights' own refs instead,
 * and each DE block (single-stage, prelims, round of 16) by its strips ×
 * `DE_REFS`. Each result is keyed by its `assigned_day` and takes its weapon
 * from its competition. The scheduler calls this on its own results, the
 * store's footer on the board it draws (017 spec §7), so right after a run the
 * two count the same intervals.
 *
 * Interval times are whatever axis the results are on: the scheduler's own
 * results sit on the scheduler axis, the store's drawn results on the clock
 * axis. A result whose competition is not given is skipped, and so is a block
 * that asks no referee – a bracket of 2's DE draws 0 strips (METHODOLOGY.md
 * §DE Duration 'No counted round'). `skip` holds `phaseKey`s of phases that
 * hold no strips (`unseatedPhases`, or the drawn model's unplaced blocks):
 * each pushed interval is one phase, and a skipped one counts no referees.
 */
export function refDemandFromSchedule(
  results: ScheduleResult[],
  config: TournamentConfig,
  competitions: Competition[],
  skip: ReadonlySet<string> = new Set(),
): Record<number, RefDemandByDay> {
  const byDay: Record<number, RefDemandByDay> = {}
  const compById = new Map(competitions.map((c) => [c.id, c]))

  function push(day: number, interval: RefDemandInterval, id: string, phase: Phase): void {
    if (interval.count === 0) return
    if (skip.has(phaseKey(id, phase))) return
    if (!byDay[day]) byDay[day] = { intervals: [] }
    byDay[day].intervals.push(interval)
  }

  for (const result of results) {
    const competition = compById.get(result.competition_id)
    if (!competition) continue

    const day = result.assigned_day
    const weapon = competition.weapon
    const deRefCount = (strips: number) => strips * config.DE_REFS

    const id = result.competition_id
    if (result.flight_a_start !== null && result.flight_a_end !== null) {
      push(day, { startTime: result.flight_a_start, endTime: result.flight_a_end, count: result.flight_a_refs, weapon }, id, Phase.FLIGHT_A)
      if (result.flight_b_start !== null && result.flight_b_end !== null) {
        push(day, { startTime: result.flight_b_start, endTime: result.flight_b_end, count: result.flight_b_refs, weapon }, id, Phase.FLIGHT_B)
      }
    } else if (result.pool_start !== null && result.pool_end !== null) {
      push(day, { startTime: result.pool_start, endTime: result.pool_end, count: result.pool_refs_count, weapon }, id, Phase.POOLS)
    }

    if (result.de_start !== null && result.de_end !== null) {
      push(day, { startTime: result.de_start, endTime: result.de_end, count: deRefCount(result.de_strip_count), weapon }, id, Phase.DE)
    }
    if (result.de_prelims_start !== null && result.de_prelims_end !== null) {
      push(day, {
        startTime: result.de_prelims_start,
        endTime: result.de_prelims_end,
        count: deRefCount(result.de_prelims_strip_count),
        weapon,
      }, id, Phase.DE_PRELIMS)
    }
    if (result.de_round_of_16_start !== null && result.de_round_of_16_end !== null) {
      push(day, {
        startTime: result.de_round_of_16_start,
        endTime: result.de_round_of_16_end,
        count: deRefCount(result.de_round_of_16_strip_count),
        weapon,
      }, id, Phase.DE_ROUND_OF_16)
    }
  }

  return byDay
}
