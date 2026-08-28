import { Weapon, RefPolicy } from './types.ts'
import type {
  TournamentConfig,
  Competition,
  RefDemandInterval,
  RefDemandByDay,
  RefRequirementsByDay,
} from './types.ts'
import { computePoolStructure } from './pools.ts'

/**
 * Estimates peak concurrent pool-round referee demand for a single competition.
 *
 * With infinite refs (as required by Phase 1.5a simulation), all pools run
 * concurrently. Demand is scaled by the ref_policy:
 * - ONE: 1 ref per pool
 * - TWO: 2 refs per pool
 * - AUTO: 2 refs per pool (peak estimate — AUTO tries 2 first, so we size for that)
 */
export function peakPoolRefDemand(comp: Competition, ref_policy: RefPolicy): number {
  const { n_pools } = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
  return ref_policy === RefPolicy.ONE ? n_pools : n_pools * 2
}

/**
 * Estimates peak concurrent DE referee demand for a single competition.
 *
 * With infinite refs, the DE phase uses all allocated strips concurrently.
 * DE always requires 1 ref per strip (DE_REFS = 1).
 */
export function peakDeRefDemand(comp: Competition, config: TournamentConfig): number {
  // Use the larger of round-of-16 strips and overall allocation as representative peak.
  // Stop-at-semis: there is no separate finals phase to consider.
  const deStrips = Math.max(comp.de_round_of_16_strips, comp.strips_allocated)

  // DE refs: 1 per strip for the round-of-16 phase (the terminal scheduled phase).
  const dePhasePeakStrips = comp.de_round_of_16_strips

  // Strips for DE: the peak concurrent active strips
  const activeStrips = Math.min(dePhasePeakStrips, deStrips)
  return config.DE_REFS * activeStrips
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
