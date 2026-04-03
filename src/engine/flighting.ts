import { BottleneckCause, BottleneckSeverity } from './types.ts'
import type { Competition, FlightingGroup, Bottleneck } from './types.ts'
import { computePoolStructure } from './pools.ts'
import { crossoverPenalty } from './crossover.ts'
import { FLIGHTING_MIN_FENCERS, FLIGHTING_ELIGIBLE_CATEGORIES } from './constants.ts'

// ──────────────────────────────────────────────
// suggestFlightingGroups
// ──────────────────────────────────────────────

export interface FlightingGroupSuggestions {
  suggestions: FlightingGroup[]
  bottlenecks: Bottleneck[]
}

/**
 * For each pair of competitions scheduled on the same day, suggests a flighting group
 * when their combined pool count exceeds strips_total but each fits individually.
 *
 * PRD Section 9.1, Pass 2:
 * - The competition with more pools is designated priority; the other becomes flighted.
 * - When pool counts are tied, a FLIGHTING_GROUP_MANUAL_NEEDED warning is emitted and
 *   the suggestion is still created (with an arbitrary ordering by id for determinism).
 */
export function suggestFlightingGroups(
  competitions: Competition[],
  stripsTotal: number,
  dayAssignments: Record<string, number>,
): FlightingGroupSuggestions {
  const suggestions: FlightingGroup[] = []
  const bottlenecks: Bottleneck[] = []

  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      const c1 = competitions[i]
      const c2 = competitions[j]

      // Only consider pairs on the same day
      if (dayAssignments[c1.id] !== dayAssignments[c2.id]) continue

      // Both competitions must meet eligibility: 200+ fencers and eligible category
      if (
        c1.fencer_count < FLIGHTING_MIN_FENCERS ||
        c2.fencer_count < FLIGHTING_MIN_FENCERS ||
        !FLIGHTING_ELIGIBLE_CATEGORIES.has(c1.category) ||
        !FLIGHTING_ELIGIBLE_CATEGORIES.has(c2.category)
      ) continue

      // Fencer counts must be within 40 of each other
      if (Math.abs(c1.fencer_count - c2.fencer_count) > 40) continue

      const c1Pools = computePoolStructure(c1.fencer_count, c1.use_single_pool_override).n_pools
      const c2Pools = computePoolStructure(c2.fencer_count, c2.use_single_pool_override).n_pools

      // Suggest only when combined exceeds strips but each fits individually
      if (c1Pools + c2Pools <= stripsTotal) continue
      if (c1Pools > stripsTotal || c2Pools > stripsTotal) continue

      const tied = c1Pools === c2Pools
      // Larger pool count becomes priority; on tie, fall back to id lexicographic order for determinism
      const [priority, flighted] =
        c1Pools > c2Pools || (tied && c1.id <= c2.id) ? [c1, c2] : [c2, c1]

      if (tied) {
        bottlenecks.push({
          competition_id: c1.id,
          phase: 'FLIGHTING',
          cause: BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          message: `${c1.id} and ${c2.id} have equal pool counts (${c1Pools}); organiser must designate priority manually`,
        })
      }

      const { strips_for_priority, strips_for_flighted } = calculateFlightedStrips(
        priority,
        flighted,
        stripsTotal,
      )

      suggestions.push({
        priority_competition_id: priority.id,
        flighted_competition_id: flighted.id,
        strips_for_priority,
        strips_for_flighted,
      })
    }
  }

  return { suggestions, bottlenecks }
}

// ──────────────────────────────────────────────
// calculateFlightedStrips
// ──────────────────────────────────────────────

/**
 * Splits strips_total between a priority and flighted competition.
 *
 * PRD Section 9:
 * - Priority receives strips equal to its pool count, capped at strips_total.
 * - Flighted receives the remainder (strips_total − priority allocation).
 */
export function calculateFlightedStrips(
  priorityComp: Competition,
  flightedComp: Competition,
  stripsTotal: number,
): FlightingGroup {
  const priorityPools = computePoolStructure(
    priorityComp.fencer_count,
    priorityComp.use_single_pool_override,
  ).n_pools

  const strips_for_priority = Math.min(priorityPools, stripsTotal)
  const strips_for_flighted = stripsTotal - strips_for_priority

  return {
    priority_competition_id: priorityComp.id,
    flighted_competition_id: flightedComp.id,
    strips_for_priority,
    strips_for_flighted,
  }
}

// ──────────────────────────────────────────────
// validateFlightingGroup
// ──────────────────────────────────────────────

/**
 * Validates a flighting group configuration against scheduling constraints.
 *
 * Checks (PRD Section 9.1, Pass 3):
 * 1. Warn if more than one competition on the same day is marked flighted.
 * 2. Warn (FLIGHTING_GROUP_NOT_LARGEST) if the flighted competition is not the
 *    largest by pool count among all competitions on that day.
 * 3. Warn (SAME_DAY_DEMOGRAPHIC_CONFLICT) if the grouped pair has a non-zero
 *    crossover penalty.
 */
export function validateFlightingGroup(
  group: FlightingGroup,
  competitions: Competition[],
  dayAssignments: Record<string, number>,
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = []

  const priorityComp = competitions.find(c => c.id === group.priority_competition_id)
  const flightedComp = competitions.find(c => c.id === group.flighted_competition_id)

  if (!priorityComp || !flightedComp) return bottlenecks

  const flightedDay = dayAssignments[flightedComp.id]

  // Check 1: multiple flighted competitions on the same day
  const flightedOnDay = competitions.filter(
    c => c.flighted && dayAssignments[c.id] === flightedDay,
  )
  if (flightedOnDay.length > 1) {
    for (const comp of flightedOnDay) {
      bottlenecks.push({
        competition_id: comp.id,
        phase: 'FLIGHTING',
        cause: BottleneckCause.MULTIPLE_FLIGHTED_SAME_DAY,
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `Multiple flighted competitions on day ${flightedDay}: ${flightedOnDay.map(c => c.id).join(', ')}`,
      })
    }
  }

  // Check 2: flighted should be the largest on its day
  const compsOnDay = competitions.filter(c => dayAssignments[c.id] === flightedDay)
  const poolCounts = compsOnDay.map(c => ({
    id: c.id,
    pools: computePoolStructure(c.fencer_count, c.use_single_pool_override).n_pools,
  }))
  const maxPools = Math.max(...poolCounts.map(p => p.pools))
  const flightedPools = poolCounts.find(p => p.id === flightedComp.id)?.pools ?? 0

  if (flightedPools < maxPools) {
    const largestComp = poolCounts.find(p => p.pools === maxPools)
    bottlenecks.push({
      competition_id: flightedComp.id,
      phase: 'FLIGHTING',
      cause: BottleneckCause.FLIGHTING_GROUP_NOT_LARGEST,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `Flighted competition ${flightedComp.id} (${flightedPools} pools) is not the largest on day ${flightedDay}; largest is ${largestComp?.id} (${maxPools} pools)`,
    })
  }

  // Check 3: demographic conflict between the grouped pair
  // Infinity = hard conflict (same gender/weapon/category) — handled as an error upstream,
  // not a flighting-level warning. Only finite positive penalties warrant a soft warning here.
  const penalty = crossoverPenalty(priorityComp, flightedComp)
  if (penalty > 0 && penalty !== Infinity) {
    bottlenecks.push({
      competition_id: flightedComp.id,
      phase: 'FLIGHTING',
      cause: BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT,
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `Flighting group (${priorityComp.id}, ${flightedComp.id}) has a demographic crossover penalty of ${penalty.toFixed(2)}`,
    })
  }

  return bottlenecks
}
