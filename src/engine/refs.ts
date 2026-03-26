import { PodCaptainOverride, DeMode, Weapon } from './types.ts'
import type { TournamentConfig, DayRefereeAvailability, Competition } from './types.ts'
import { computePoolStructure } from './pools.ts'
import { computeBracketSize } from './de.ts'

/**
 * Returns the number of pod captains needed for a DE phase.
 *
 * PRD Section 8.1 pod captain rules:
 * - DISABLED → 0 (no pod captains during DEs)
 * - FORCE_4  → always ceil(deStrips / 4)
 * - AUTO + SINGLE_BLOCK: bracket ≤32 → 4-strip pods; bracket >32 → 8-strip pods
 * - AUTO + STAGED_DE_BLOCKS: DE_ROUND_OF_16 → 4-strip pods; all other phases → 8-strip pods
 */
export function podCaptainsNeeded(
  override: PodCaptainOverride,
  deMode: DeMode,
  bracketSize: number,
  dePhase: string,
  deStrips: number,
): number {
  if (override === PodCaptainOverride.DISABLED) return 0
  if (override === PodCaptainOverride.FORCE_4) return Math.ceil(deStrips / 4)

  // AUTO mode — pod size depends on de_mode and phase
  let podSize: number
  if (deMode === DeMode.SINGLE_BLOCK) {
    podSize = bracketSize <= 32 ? 4 : 8
  } else {
    // STAGED_DE_BLOCKS: round-of-16 uses 4-strip pods; finals and prelims use 8-strip pods
    podSize = dePhase === 'DE_ROUND_OF_16' ? 4 : 8
  }

  return Math.ceil(deStrips / podSize)
}

/**
 * Returns the total number of refs available on a given day for the specified weapon.
 *
 * PRD Section 2.3:
 * - SABRE: sabre-qualified refs only (no cross-weapon)
 * - FOIL/EPEE: foil_epee refs + sabre refs (sabre refs can officiate ROW weapons)
 *
 * Note: The reverse direction (foil/epee refs filling in for sabre shortfalls
 * via `allow_sabre_ref_fillin`) is handled in the resource allocation layer (Task 3C).
 */
export function refsAvailableOnDay(day: number, weapon: Weapon, config: TournamentConfig): number {
  const avail = config.referee_availability[day]
  if (!avail) return 0
  if (weapon === Weapon.SABRE) return avail.sabre_refs
  return avail.foil_epee_refs + avail.sabre_refs
}

/**
 * Estimates peak concurrent pool-round referee demand for a single competition.
 *
 * With infinite refs (as required by Phase 1.5a simulation), all pools run
 * concurrently — demand equals the number of pools.
 */
function peakPoolRefDemand(comp: Competition): number {
  const { n_pools } = computePoolStructure(comp.fencer_count, comp.use_single_pool_override)
  return n_pools
}

/**
 * Estimates peak concurrent DE referee demand for a single competition,
 * including pod captains (1 ref per strip + pod captains).
 *
 * With infinite refs, the DE phase uses all allocated strips concurrently.
 * DE always requires 1 ref per strip (DE_REFS = 1).
 */
function peakDeRefDemand(comp: Competition, config: TournamentConfig): number {
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
  const phase = comp.de_round_of_16_strips > 0 ? 'DE_ROUND_OF_16' : 'DE_FINALS'

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
 * Calculates optimal referee counts per day (Phase 1.5a).
 *
 * PRD Section 8.1: simulates the day schedule with infinite refs and finds
 * peak concurrent demand per weapon type per day.
 *
 * Implementation approach:
 * 1. Assign each competition to a day via greedy round-robin (simplified
 *    preliminary_day_assign — sufficient for ref estimation without full scheduler)
 * 2. For each day, sum peak concurrent demand across all competitions:
 *    - Pool phase demand: n_pools refs (all pools run concurrently with infinite refs)
 *    - DE phase demand: strips * DE_REFS + pod captains
 *    The peak is the maximum of pool-phase and DE-phase demand summed across
 *    all competitions on the day. Since competitions share the day sequentially,
 *    we take each competition's own peak (pool vs DE) and sum across concurrent
 *    competitions — conservative but valid for minimum ref estimation.
 *
 * TODO: Replace round-robin day assignment with preliminary_day_assign (PRD Section 12)
 * and per-competition peak sum with simulate_day_schedule time-slot simulation
 * (PRD Section 8.1) when the scheduler layer (Task 4) is available.
 */
export function calculateOptimalRefs(
  competitions: Competition[],
  config: TournamentConfig,
): DayRefereeAvailability[] {
  const days = config.days_available

  // Greedy round-robin day assignment — approximates preliminary_day_assign
  // without requiring full scheduling context (sufficient for ref estimation)
  const dayAssignments = new Map<string, number>()
  competitions.forEach((comp, idx) => {
    dayAssignments.set(comp.id, idx % days)
  })

  const result: DayRefereeAvailability[] = []

  for (let d = 0; d < days; d++) {
    const dayComps = competitions.filter(c => dayAssignments.get(c.id) === d)

    let peakFoilEpee = 0
    let peakSabre = 0

    for (const comp of dayComps) {
      // Peak ref demand for this competition is the max of its pool and DE phases
      const poolDemand = comp.fencer_count > 1 ? peakPoolRefDemand(comp) : 0
      const deDemand = comp.fencer_count > 1 ? peakDeRefDemand(comp, config) : 0
      const compPeak = Math.max(poolDemand, deDemand)

      if (comp.weapon === Weapon.SABRE) {
        peakSabre += compPeak
      } else {
        peakFoilEpee += compPeak
      }
    }

    result.push({
      day: d,
      foil_epee_refs: peakFoilEpee,
      sabre_refs: peakSabre,
      source: 'OPTIMAL',
    })
  }

  return result
}
