import { PodCaptainOverride, DeMode, Weapon, RefPolicy, Phase } from './types.ts'
import type { TournamentConfig, Competition, RefDemandInterval, RefDemandByDay, RefRequirementsByDay } from './types.ts'
import { computePoolStructure } from './pools.ts'
import { computeBracketSize } from './de.ts'

/**
 * Returns the number of pod captains needed for a DE phase.
 *
 * METHODOLOGY.md §Pod Captains pod captain rules:
 * - DISABLED → 0 (no pod captains during DEs)
 * - FORCE_4  → always ceil(deStrips / 4)
 * - AUTO + SINGLE_STAGE: bracket ≤32 → 4-strip pods; bracket >32 → 8-strip pods
 * - AUTO + STAGED: DE_ROUND_OF_16 → 4-strip pods; all other phases → 8-strip pods
 */
export function podCaptainsNeeded(
  override: PodCaptainOverride,
  deMode: DeMode,
  bracketSize: number,
  dePhase: Phase,
  deStrips: number,
): number {
  if (override === PodCaptainOverride.DISABLED) return 0
  if (override === PodCaptainOverride.FORCE_4) return Math.ceil(deStrips / 4)

  // AUTO mode — pod size depends on de_mode and phase
  let podSize: number
  if (deMode === DeMode.SINGLE_STAGE) {
    podSize = bracketSize <= 32 ? 4 : 8
  } else {
    // STAGED: round-of-16 uses 4-strip pods; finals and prelims use 8-strip pods
    podSize = dePhase === Phase.DE_ROUND_OF_16 ? 4 : 8
  }

  return Math.ceil(deStrips / podSize)
}

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
 * Estimates peak concurrent DE referee demand for a single competition,
 * including pod captains (1 ref per strip + pod captains).
 *
 * With infinite refs, the DE phase uses all allocated strips concurrently.
 * DE always requires 1 ref per strip (DE_REFS = 1).
 */
export function peakDeRefDemand(comp: Competition, config: TournamentConfig): number {
  const bracketSize = computeBracketSize(
    comp.fencer_count,
    comp.cut_mode,
    comp.cut_value,
    comp.event_type,
  )

  // Use the larger of round-of-16 and finals strips as representative peak
  const deStrips = Math.max(comp.de_round_of_16_strips, comp.de_finals_strips, comp.strips_allocated)

  // DE refs: 1 per strip + pod captains for the phase with most strips
  // Use DE_ROUND_OF_16 as the representative phase (typically more strips than finals)
  const dePhasePeakStrips = comp.de_round_of_16_strips > 0 ? comp.de_round_of_16_strips : comp.de_finals_strips
  const phase = comp.de_round_of_16_strips > 0 ? Phase.DE_ROUND_OF_16 : Phase.DE_FINALS

  const refsPerStrip = config.DE_REFS
  const captains = podCaptainsNeeded(
    config.pod_captain_override,
    comp.de_mode,
    bracketSize,
    phase,
    dePhasePeakStrips,
  )

  // Strips for DE: the peak concurrent active strips
  const activeStrips = Math.min(dePhasePeakStrips, deStrips)
  return refsPerStrip * activeStrips + captains
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
