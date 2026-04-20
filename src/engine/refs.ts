import { PodCaptainOverride, DeMode, Weapon, RefPolicy, Phase } from './types.ts'
import type { TournamentConfig, DayRefereeAvailability, Competition } from './types.ts'
import { computePoolStructure } from './pools.ts'
import { computeBracketSize } from './de.ts'
import { constraintScore } from './dayAssignment.ts'
import { crossoverPenalty } from './crossover.ts'

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
 * Returns the total number of refs available on a given day for the specified weapon.
 *
 * METHODOLOGY.md §Referee Types:
 * - SABRE: saber-qualified refs only (no cross-weapon)
 * - FOIL/EPEE: foil_epee refs + saber refs (saber refs can officiate ROW weapons)
 *
 */
export function refsAvailableOnDay(day: number, weapon: Weapon, config: TournamentConfig): number {
  const avail = config.referee_availability[day]
  if (!avail) return 0
  if (weapon === Weapon.SABRE) return avail.three_weapon_refs
  return avail.foil_epee_refs + avail.three_weapon_refs
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
 * Lightweight greedy day assignment for referee demand estimation.
 *
 * Uses constraint scores to distribute competitions across days but skips full
 * penalty scoring and resource-window simulation.
 * Results are approximate — used only to estimate peak concurrent ref demand before
 * the real scheduler runs.
 *
 * Algorithm (METHODOLOGY.md §Scheduling Algorithm / §Capacity-Aware Day Assignment):
 * Sort order: most-constrained competitions first (highest constraintScore).
 * Per competition: assign to the day with the lowest total crossoverPenalty against
 * competitions already assigned to that day. Ties broken by lowest day index.
 *
 * No GlobalState, no time-slot simulation — sufficient for ref-estimation purposes only.
 */
export function preliminaryDayAssign(
  competitions: Competition[],
  config: TournamentConfig,
): Map<string, number> {
  const days = config.days_available
  const assignments = new Map<string, number>()

  // Sort by constraintScore descending: most constrained goes first
  const sorted = [...competitions].sort(
    (a, b) => constraintScore(b, competitions, config) - constraintScore(a, competitions, config),
  )

  // dayBuckets[d] holds competitions already assigned to day d
  const dayBuckets: Competition[][] = Array.from({ length: days }, () => [])

  for (const comp of sorted) {
    let bestDay = 0
    let bestPenalty = Infinity

    for (let d = 0; d < days; d++) {
      // Sum crossover penalties against all competitions already on this day
      let dayPenalty = 0
      for (const assigned of dayBuckets[d]) {
        dayPenalty += crossoverPenalty(comp, assigned)
        // Short-circuit: once we exceed the current best, no point continuing
        if (dayPenalty > bestPenalty) break
      }

      // Lower penalty wins; ties broken by lowest day index (d < bestDay is guaranteed by iteration order)
      if (dayPenalty < bestPenalty) {
        bestPenalty = dayPenalty
        bestDay = d
      }
    }

    assignments.set(comp.id, bestDay)
    dayBuckets[bestDay].push(comp)
  }

  return assignments
}

/**
 * Calculates optimal referee counts per day (Phase 1.5a).
 *
 * METHODOLOGY.md §Pod Captains: simulates the day schedule with infinite refs and finds
 * peak concurrent demand per weapon type per day.
 *
 * Implementation approach:
 * 1. Assign each competition to a day via preliminaryDayAssign — a greedy
 *    constraint-scored assignment that separates high-crossover competitions
 *    across days (sufficient for ref estimation without full scheduler)
 * 2. For each day, sum peak concurrent demand across all competitions:
 *    - Pool phase demand: n_pools refs (all pools run concurrently with infinite refs)
 *    - DE phase demand: strips * DE_REFS + pod captains
 *    The peak is the maximum of pool-phase and DE-phase demand summed across
 *    all competitions on the day. Since competitions share the day sequentially,
 *    we take each competition's own peak (pool vs DE) and sum across concurrent
 *    competitions — conservative but valid for minimum ref estimation.
 */
export function calculateOptimalRefs(
  competitions: Competition[],
  config: TournamentConfig,
): DayRefereeAvailability[] {
  const dayAssignments = preliminaryDayAssign(competitions, config)
  const days = config.days_available

  const result: DayRefereeAvailability[] = []

  for (let d = 0; d < days; d++) {
    const dayComps = competitions.filter(c => dayAssignments.get(c.id) === d)

    let peakFoilEpee = 0
    let peakSaber = 0

    for (const comp of dayComps) {
      // Peak ref demand for this competition is the max of its pool and DE phases
      const poolDemand = comp.fencer_count > 1 ? peakPoolRefDemand(comp, comp.ref_policy) : 0
      const deDemand = comp.fencer_count > 1 ? peakDeRefDemand(comp, config) : 0
      const compPeak = Math.max(poolDemand, deDemand)

      if (comp.weapon === Weapon.SABRE) {
        peakSaber += compPeak
      } else {
        peakFoilEpee += compPeak
      }
    }

    result.push({
      day: d,
      foil_epee_refs: peakFoilEpee,
      three_weapon_refs: peakSaber,
      source: 'OPTIMAL',
    })
  }

  return result
}
