import { BottleneckCause, BottleneckRule, BottleneckSeverity, Phase } from './types.ts'
import type { Competition, FlightingGroup, Bottleneck } from './types.ts'
import { ENGINE_FENCER_BOUNDS, computePoolStructure, isSizeableCount } from './pools.ts'
import type { FencerCountBounds } from './pools.ts'
import { forEachCompetitionPair } from './pairs.ts'
// ──────────────────────────────────────────────
// suggestFlightingGroups
// ──────────────────────────────────────────────

interface FlightingGroupSuggestions {
  suggestions: FlightingGroup[]
  bottlenecks: Bottleneck[]
}

/**
 * For each pair of competitions scheduled on the same day, suggests a flighting group
 * when their combined pool count exceeds strips_total but each fits individually within
 * the per-event pool strip cap (poolStripCap).
 *
 * METHODOLOGY.md §Flighting Pair Suggestion, §How Flighting Works:
 * - The larger event, the one with more pools, is the one to flight. The smaller
 *   event is the group's priority and runs unflighted beside the flights.
 * - When pool counts are tied, a FLIGHTING_GROUP_MANUAL_NEEDED warning is emitted and
 *   the suggestion is still created (with an arbitrary ordering by id for determinism),
 *   and the organizer picks which one to flight.
 *
 * A competition `isSizeableCount` rejects pairs with nothing (018 T4).
 * `bounds` defaults to the engine's own; `initialAnalysis` passes its config.
 */
export function suggestFlightingGroups(
  competitions: Competition[],
  stripsTotal: number,
  dayAssignments: Record<string, number>,
  poolStripCap: number,
  bounds: FencerCountBounds = ENGINE_FENCER_BOUNDS,
): FlightingGroupSuggestions {
  const suggestions: FlightingGroup[] = []
  const bottlenecks: Bottleneck[] = []

  const sizeable = competitions.filter(c => isSizeableCount(c.fencer_count, bounds))
  forEachCompetitionPair(sizeable, (c1, c2) => {
    // Only consider pairs on the same day
    if (dayAssignments[c1.id] !== dayAssignments[c2.id]) return

    const c1Pools = computePoolStructure(c1.fencer_count, c1.use_single_pool_override).n_pools
    const c2Pools = computePoolStructure(c2.fencer_count, c2.use_single_pool_override).n_pools

    // Suggest only when combined exceeds strips but each fits within the per-event cap
    if (c1Pools + c2Pools <= stripsTotal) return
    if (c1Pools > poolStripCap || c2Pools > poolStripCap) return

    const tied = c1Pools === c2Pools
    // The larger pool count is flighted, and on a tie the later id is, for determinism
    const [flighted, priority] =
      c1Pools > c2Pools || (tied && c1.id > c2.id) ? [c1, c2] : [c2, c1]

    if (tied) {
      bottlenecks.push({
        competition_id: c1.id,
        phase: Phase.FLIGHTING,
        cause: BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
        rule: BottleneckRule.FLIGHTING_PRIORITY_TIE,
        subjects: [c1.id, c2.id].sort(),
        severity: BottleneckSeverity.WARN,
        delay_mins: 0,
        message: `${c1.id} and ${c2.id} have equal pool counts (${c1Pools}), so the organizer picks which one to flight`,
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
  })

  return { suggestions, bottlenecks }
}

// ──────────────────────────────────────────────
// calculateFlightedStrips
// ──────────────────────────────────────────────

/**
 * Splits strips_total between a group's priority competition – the smaller,
 * unflighted event – and its flighted competition, the larger event
 * (METHODOLOGY.md §How Flighting Works):
 * - Priority receives strips equal to its pool count, capped at strips_total,
 *   since an unflighted event runs all its pools at once.
 * - Flighted receives the remainder (strips_total − priority allocation).
 * METHODOLOGY does not fix the split, and the suggestion is advisory text.
 *
 * Precondition: `priorityComp` has a count `isSizeableCount` accepts. Its one
 * production caller, `suggestFlightingGroups`, pairs only those (018 T4); a
 * split has no honest value for an event with no pools, so this does not
 * invent one.
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
