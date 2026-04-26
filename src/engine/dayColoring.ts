/**
 * Two-phase DSatur graph coloring for tournament day assignment.
 *
 * DSatur is a greedy graph-coloring heuristic that always colors the vertex
 * with the highest "saturation degree" next – that is, the uncolored vertex
 * whose already-colored neighbors use the most distinct colors. This
 * prioritizes the most constrained events first, and ties are broken by
 * hard-edge degree then by packing footprint (strips × category weight).
 *
 * Tournament day assignment maps directly to graph coloring: events are
 * vertices, scheduling conflicts are edges, and days are colors. Hard edges
 * (weight === Infinity) block a color outright, so hard constraints are
 * guaranteed by construction rather than relying on penalty dominance. Soft
 * edges contribute penalties that steer the heuristic toward better schedules
 * without forbidding any assignment. For realistic tournament sizes (n <= 54
 * events), the O(n³) runtime is negligible.
 *
 * Standard DSatur minimizes chromatic number (fewest days) but does not
 * balance load across those days. This module uses two phases with a
 * capacity-aware expansion step between them:
 *   Phase 1 – run DSatur without load-balancing penalties to discover the
 *             minimum number of days (the effective chromatic number).
 *   Expand  – if total weighted strip-hours exceed what chromaticN days can
 *             absorb at CAPACITY_TARGET_FILL, raise the day count up to a
 *             cap of min(config.days_available, MAX_EXPANDED_DAYS). The
 *             chromatic number is always a floor so hard constraints remain
 *             satisfied.
 *   Phase 2 – rerun DSatur with capacity-aware load-balancing penalties
 *             active, capped to the expanded day count from the step above.
 *             A day's penalty rises with its fill ratio (strip-hours /
 *             day capacity), steering events toward less-loaded days.
 *
 * References:
 *   - DSatur algorithm: https://en.wikipedia.org/wiki/DSatur
 *   - Graph coloring concepts: https://www.youtube.com/watch?v=h9wxtqoa1jY
 */

import type { Competition, TournamentConfig } from './types.ts'
import { Category, EventType } from './types.ts'
import { saberPileupPenalty } from './dayAssignment.ts'
import type { ConstraintGraph } from './constraintGraph.ts'
import { categoryWeight, estimateCompetitionStripHours } from './capacity.ts'
import { getProximityWeight, findIndividualCounterpart } from './crossover.ts'
import {
  REST_DAY_PAIRS,
  INDIV_TEAM_RELAXABLE_BLOCKS,
  PENALTY_WEIGHTS,
  CAPACITY_PENALTY_CURVE,
} from './constants.ts'

// ──────────────────────────────────────────────
// Load-balancing constants
// ──────────────────────────────────────────────

/**
 * Per-event base cost for adding to an already-used day. Provides uniform
 * spread pressure when capacity fill is low. Matches the pre-Stage-5 flat
 * load balance so small tournaments that never saturate capacity behave the
 * same as before.
 */
const LOAD_BALANCE_FULLNESS = 0.5

/**
 * Upper bound on how many days Phase 2 is allowed to use, independent of the
 * user's `days_available` setting. USA Fencing tournaments beyond 4 days are
 * uncommon; capping at 4 prevents runaway expansion.
 */
const MAX_EXPANDED_DAYS = 4

/**
 * "Target fill" used when estimating capacity-demanded days. estimateComp
 * StripHours models raw parallel work and underestimates real scheduling
 * capacity pressure (LATEST_START cutoffs, DE tails, video strip serialization),
 * so a conservative target leaves headroom. 0.3 means we aim to keep each
 * day's raw strip-hour fill at ~30% before expanding.
 */
const CAPACITY_TARGET_FILL = 0.3

/**
 * Capacity penalty for a candidate day's fill ratio. Exported for unit tests.
 *
 * We only penalize approaching / past 100% fill. Earlier-triggering curves
 * (starting at 60% fill) over-steered events in mid-loaded days and caused
 * regressions in large multi-day tournaments where several days naturally
 * land in the 0.6-0.8 range. Keeping the ramp near 1.0 targets the actual
 * failure mode: packing a day past its raw strip-hour capacity.
 */
export function capacityPenalty(fillRatio: number): number {
  if (fillRatio <= 0.85) return 0
  if (fillRatio <= 1.0) {
    // Linear ramp 0.85 → 1.0 mapping to 0 → 3.0
    return (fillRatio - 0.85) / 0.15 * 3.0
  }
  // Past capacity: strong push. OVERFLOW_PENALTY provides upper cap.
  return Math.min(CAPACITY_PENALTY_CURVE.OVERFLOW_PENALTY, 3.0 + (fillRatio - 1.0) * 10.0)
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/** Returns the number of distinct colors among hard-edge neighbors. */
function saturationDegree(
  id: string,
  graph: ConstraintGraph,
  coloring: Map<string, number>,
): number {
  const edges = graph.get(id) ?? []
  const neighborColors = new Set<number>()
  for (const edge of edges) {
    if (edge.weight === Infinity) {
      const c = coloring.get(edge.targetId)
      if (c !== undefined) neighborColors.add(c)
    }
  }
  return neighborColors.size
}

/** Returns the number of hard-edge neighbors (graph degree for tie-breaking). */
function hardEdgeDegree(id: string, graph: ConstraintGraph): number {
  const edges = graph.get(id) ?? []
  return edges.filter(e => e.weight === Infinity).length
}

/**
 * Checks if any REST_DAY_PAIRS pair applies between this competition and a
 * same-gender, same-weapon competition colored on an adjacent day.
 */
function isRestDayPair(cat1: Competition['category'], cat2: Competition['category']): boolean {
  return REST_DAY_PAIRS.some(
    ([a, b]) => (a === cat1 && b === cat2) || (a === cat2 && b === cat1),
  )
}

/**
 * Returns the proximity weight for a category pair (0.0 if not in PROXIMITY_GRAPH).
 * Delegates to getProximityWeight from crossover.ts.
 */
function proximityWeight(cat1: Competition['category'], cat2: Competition['category']): number {
  return getProximityWeight(cat1, cat2)
}

/**
 * Individual/team ordering penalty computed from coloring state.
 *
 * For a TEAM event being colored on day `d`, finds its individual counterpart
 * (same category, gender, weapon). If the counterpart is already colored on day `d2`:
 *   gap = d - d2
 *   gap === 1  -> -0.4 bonus (ideal: team day after individual)
 *   gap === 0  ->  0.0 (same day, fine)
 *   gap === -1 ->  1.0 penalty (team before individual)
 *   |gap| >= 2 ->  0.3 penalty
 */
function individualTeamOrderingPenalty(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  if (competition.event_type !== EventType.TEAM) return 0.0

  const ind = findIndividualCounterpart(competition, competitions)
  if (!ind) return 0.0

  const indDay = coloring.get(ind.id)
  if (indDay === undefined) return 0.0

  const gap = proposedDay - indDay
  if (gap === 1) return PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER
  if (gap === 0) return 0.0
  if (gap === -1) return PENALTY_WEIGHTS.TEAM_BEFORE_INDIVIDUAL
  return PENALTY_WEIGHTS.INDIV_TEAM_2_PLUS_DAYS // |gap| >= 2
}

/**
 * Computes the soft penalty for assigning `id` color `c`, given current coloring.
 * Includes:
 *   - direct soft-edge neighbor penalties (weight !== Infinity)
 *   - rest-day penalties for adjacent days (same gender + weapon, REST_DAY_PAIRS)
 *   - proximity bonuses for adjacent days (same gender + weapon, PROXIMITY_GRAPH)
 *   - individual/team ordering penalties
 */
function colorPenalty(
  id: string,
  c: number,
  graph: ConstraintGraph,
  coloring: Map<string, number>,
  compMap: Map<string, Competition>,
  competitions: Competition[],
  relaxedEdges: Set<string>, // edges temporarily relaxed to soft for this vertex
  loadBalance: boolean,
  stripHoursMap: Map<string, number>,
  dayCapacity: number,
): number {
  const edges = graph.get(id) ?? []
  const self = compMap.get(id)!
  let total = 0.0

  for (const edge of edges) {
    const neighborColor = coloring.get(edge.targetId)
    if (neighborColor !== c) continue

    const effectiveWeight = relaxedEdges.has(edge.targetId) ? 5.0 : edge.weight
    // Hard-edge same-color would be blocked; if we reach here it's already been
    // filtered by valid-color logic — only soft or relaxed edges remain.
    total += effectiveWeight
  }

  // Rest-day and proximity adjustments — only for graph neighbors on adjacent days
  for (const edge of edges) {
    const neighborColor = coloring.get(edge.targetId)
    if (neighborColor === undefined) continue

    const dayGap = Math.abs(c - neighborColor)
    if (dayGap !== 1) continue // only adjacent days matter for these adjustments

    const neighbor = compMap.get(edge.targetId)
    if (!neighbor) continue
    if (neighbor.gender !== self.gender) continue
    if (neighbor.weapon !== self.weapon) continue

    if (isRestDayPair(self.category, neighbor.category)) {
      total += PENALTY_WEIGHTS.REST_DAY_VIOLATION
    }
    const proxW = proximityWeight(self.category, neighbor.category)
    if (proxW > 0) {
      total += PENALTY_WEIGHTS.PROXIMITY_1_DAY * proxW
    }
  }

  // Individual/team ordering
  total += individualTeamOrderingPenalty(self, c, competitions, coloring)

  // Saber pileup: discourage concentrating saber events on a single day.
  // Always active (not gated by loadBalance) — structural concern.
  total += saberPileupPenalty(self, c, coloring, competitions)

  // Load balancing: per-event flat cost plus staged capacity-fill penalty.
  // Only active in Phase 2.
  if (loadBalance) {
    let sumStripHours = 0
    let eventsOnDay = 0
    for (const [otherId, otherDay] of coloring) {
      if (otherDay === c) {
        sumStripHours += stripHoursMap.get(otherId) ?? 0
        eventsOnDay++
      }
    }
    total += eventsOnDay * LOAD_BALANCE_FULLNESS
    if (dayCapacity > 0) {
      total += capacityPenalty(sumStripHours / dayCapacity)
    }
  }

  return total
}

/**
 * Veteran Age-Group Co-Day Rule (METHODOLOGY §Veteran Age-Group Co-Day Rule).
 *
 * If `self` is a Vet *individual* event and a sibling Vet individual event
 * (same gender + weapon, different vet_age_group) is already colored, the
 * sibling's day is the required color for `self`. The DSatur loop must
 * restrict valid colors to that day; the rule is hard, not a soft pull.
 *
 * Returns the required color, or null if the rule does not bind (self is
 * not Vet ind, or no sibling has been colored yet).
 */
function vetCoDayRequiredColor(
  self: Competition,
  coloring: Map<string, number>,
  competitions: Competition[],
): number | null {
  if (self.category !== Category.VETERAN) return null
  if (self.event_type !== EventType.INDIVIDUAL) return null

  for (const other of competitions) {
    if (other.id === self.id) continue
    if (other.category !== Category.VETERAN) continue
    if (other.event_type !== EventType.INDIVIDUAL) continue
    if (other.gender !== self.gender) continue
    if (other.weapon !== self.weapon) continue
    const day = coloring.get(other.id)
    if (day !== undefined) return day
  }

  return null
}

/**
 * Returns the set of edge targetIds that are INDIV_TEAM_RELAXABLE_BLOCKS edges
 * for this competition (same gender + weapon, matching indiv/team category pair).
 */
function findRelaxableEdges(
  id: string,
  graph: ConstraintGraph,
  compMap: Map<string, Competition>,
): Set<string> {
  const self = compMap.get(id)!
  const edges = graph.get(id) ?? []
  const relaxable = new Set<string>()

  for (const edge of edges) {
    if (edge.weight !== Infinity) continue
    const neighbor = compMap.get(edge.targetId)
    if (!neighbor) continue
    if (neighbor.gender !== self.gender || neighbor.weapon !== self.weapon) continue

    for (const block of INDIV_TEAM_RELAXABLE_BLOCKS) {
      const selfIsIndiv =
        self.event_type === EventType.INDIVIDUAL &&
        self.category === block.indivCategory &&
        neighbor.event_type === EventType.TEAM &&
        neighbor.category === block.teamCategory
      const selfIsTeam =
        self.event_type === EventType.TEAM &&
        self.category === block.teamCategory &&
        neighbor.event_type === EventType.INDIVIDUAL &&
        neighbor.category === block.indivCategory
      if (selfIsIndiv || selfIsTeam) {
        relaxable.add(edge.targetId)
        break
      }
    }
  }

  return relaxable
}

// ──────────────────────────────────────────────
// Core DSatur loop
// ──────────────────────────────────────────────

/**
 * Runs one pass of DSatur graph coloring over all competitions.
 *
 * When `loadBalance` is true, `colorPenalty` adds per-event fullness costs so
 * events spread evenly across used days. When false, the algorithm minimizes
 * chromatic number without caring about balance.
 */
function dsaturLoop(
  graph: ConstraintGraph,
  competitions: Competition[],
  nDays: number,
  compMap: Map<string, Competition>,
  packingFootprint: Map<string, number>,
  loadBalance: boolean,
  stripHoursMap: Map<string, number>,
  dayCapacity: number,
): { coloring: Map<string, number>; relaxations: Map<string, number> } {
  const coloring = new Map<string, number>()
  const relaxations = new Map<string, number>()

  // All competition IDs that need coloring
  const uncolored = new Set<string>(competitions.map(c => c.id))

  // Max iterations = number of competitions (bounded, no infinite loop)
  const maxIter = competitions.length
  for (let iter = 0; iter < maxIter && uncolored.size > 0; iter++) {
    // Pick uncolored vertex with highest saturation. Ties by hard-edge degree,
    // then by packing footprint (largest first).
    let bestId: string | null = null
    let bestSat = -1
    let bestDeg = -1
    let bestFootprint = -1

    for (const id of uncolored) {
      const sat = saturationDegree(id, graph, coloring)
      const deg = hardEdgeDegree(id, graph)
      const fp = packingFootprint.get(id) ?? 0

      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && fp > bestFootprint)
      ) {
        bestId = id
        bestSat = sat
        bestDeg = deg
        bestFootprint = fp
      }
    }

    if (!bestId) break // should not happen

    const id = bestId
    const self = compMap.get(id)!
    const edges = graph.get(id) ?? []

    // Determine blocked colors (from hard-edge neighbors already colored)
    const blockedColors = new Set<number>()
    for (const edge of edges) {
      if (edge.weight === Infinity) {
        const neighborColor = coloring.get(edge.targetId)
        if (neighborColor !== undefined) blockedColors.add(neighborColor)
      }
    }

    // Vet Co-Day Rule: if a sibling Vet ind (same gender + weapon) is already
    // colored, restrict valid colors to that day. Hard rule per METHODOLOGY
    // §Veteran Age-Group Co-Day Rule.
    const requiredColor = vetCoDayRequiredColor(self, coloring, competitions)

    // Valid colors in [0, nDays)
    const allColors = Array.from({ length: nDays }, (_, i) => i)
    const validColors = (requiredColor !== null
      ? (blockedColors.has(requiredColor) ? [] : [requiredColor])
      : allColors.filter(c => !blockedColors.has(c)))

    // Pick best valid color by soft penalty
    let chosenColor: number
    if (validColors.length > 0) {
      let bestColor = validColors[0]
      let bestPenalty = colorPenalty(id, validColors[0], graph, coloring, compMap, competitions, new Set(), loadBalance, stripHoursMap, dayCapacity)
      for (let ci = 1; ci < validColors.length; ci++) {
        const p = colorPenalty(id, validColors[ci], graph, coloring, compMap, competitions, new Set(), loadBalance, stripHoursMap, dayCapacity)
        if (p < bestPenalty) {
          bestPenalty = p
          bestColor = validColors[ci]
        }
      }
      chosenColor = bestColor
    } else {
      // No valid color — try relaxing INDIV_TEAM edges
      const relaxable = findRelaxableEdges(id, graph, compMap)

      if (relaxable.size > 0) {
        // Recompute blocked colors excluding relaxable edges
        const relaxedBlockedColors = new Set<number>()
        for (const edge of edges) {
          if (edge.weight === Infinity && !relaxable.has(edge.targetId)) {
            const neighborColor = coloring.get(edge.targetId)
            if (neighborColor !== undefined) relaxedBlockedColors.add(neighborColor)
          }
        }
        const relaxedValidColors = Array.from({ length: nDays }, (_, i) => i).filter(
          c => !relaxedBlockedColors.has(c),
        )

        if (relaxedValidColors.length > 0) {
          let bestColor = relaxedValidColors[0]
          let bestPenalty = colorPenalty(id, relaxedValidColors[0], graph, coloring, compMap, competitions, relaxable, loadBalance, stripHoursMap, dayCapacity)
          for (let ci = 1; ci < relaxedValidColors.length; ci++) {
            const p = colorPenalty(id, relaxedValidColors[ci], graph, coloring, compMap, competitions, relaxable, loadBalance, stripHoursMap, dayCapacity)
            if (p < bestPenalty) {
              bestPenalty = p
              bestColor = relaxedValidColors[ci]
            }
          }
          chosenColor = bestColor
        } else {
          // Still no valid color — pick least-bad color
          chosenColor = 0
          let bestPenalty = colorPenalty(id, 0, graph, coloring, compMap, competitions, relaxable, loadBalance, stripHoursMap, dayCapacity)
          for (let c = 1; c < nDays; c++) {
            const p = colorPenalty(id, c, graph, coloring, compMap, competitions, relaxable, loadBalance, stripHoursMap, dayCapacity)
            if (p < bestPenalty) {
              bestPenalty = p
              chosenColor = c
            }
          }
        }
      } else {
        // No relaxable edges — pick least-bad color
        chosenColor = 0
        let bestPenalty = colorPenalty(id, 0, graph, coloring, compMap, competitions, new Set(), loadBalance, stripHoursMap, dayCapacity)
        for (let c = 1; c < nDays; c++) {
          const p = colorPenalty(id, c, graph, coloring, compMap, competitions, new Set(), loadBalance, stripHoursMap, dayCapacity)
          if (p < bestPenalty) {
            bestPenalty = p
            chosenColor = c
          }
        }
      }

      // Record relaxation only when INDIV_TEAM edges were actually relaxed
      if (relaxable.size > 0) {
        relaxations.set(id, 3)
      }
    }

    coloring.set(id, chosenColor)
    uncolored.delete(id)
  }

  return { coloring, relaxations }
}

// ──────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────

/**
 * Assigns each competition to a tournament day (0-indexed) using two-phase
 * DSatur graph coloring on the constraint graph.
 *
 * Phase 1 discovers the minimum number of days (no load balancing).
 * Phase 2 rebalances events within that minimum day count.
 *
 * Returns `effectiveDays` – the actual number of distinct days used.
 */
export function assignDaysByColoring(
  graph: ConstraintGraph,
  competitions: Competition[],
  config: TournamentConfig,
): { dayMap: Map<string, number>; relaxations: Map<string, number>; effectiveDays: number } {
  // Build lookup maps
  const compMap = new Map<string, Competition>()
  for (const c of competitions) compMap.set(c.id, c)

  // Precompute packing footprint: strips_allocated × categoryWeight
  const packingFootprint = new Map<string, number>()
  for (const c of competitions) {
    packingFootprint.set(c.id, c.strips_allocated * categoryWeight(c))
  }

  // Precompute strip-hours per competition (capacity-weighted for load balancing).
  // Multiplying by categoryWeight gives heavyweight categories (DIV1, JUNIOR,
  // CADET) more effective footprint than their raw strip-hours, so capacity
  // scoring treats a 300-fencer DIV1 event as heavier than a 300-fencer DIV3.
  const stripHoursMap = new Map<string, number>()
  let totalStripHours = 0
  for (const c of competitions) {
    const raw = estimateCompetitionStripHours(c, config).total_strip_hours
    const weighted = raw * categoryWeight(c)
    stripHoursMap.set(c.id, weighted)
    totalStripHours += weighted
  }

  const dayCapacity = config.strips_total * (config.DAY_LENGTH_MINS / 60)

  // Phase 1: find minimum days (no load balancing). Passes stripHoursMap +
  // dayCapacity for signature uniformity but they're unused when loadBalance=false.
  const phase1 = dsaturLoop(
    graph, competitions, config.days_available, compMap, packingFootprint,
    false, stripHoursMap, dayCapacity,
  )
  const chromaticN = new Set(phase1.coloring.values()).size

  // Day expansion: if raw capacity demand exceeds what chromaticN days can
  // absorb at a reasonable fill target, expand — capped at the user's
  // days_available and at MAX_EXPANDED_DAYS. chromaticN is always a floor
  // (hard constraints must be respected).
  const capacityDays = dayCapacity > 0
    ? Math.ceil(totalStripHours / (dayCapacity * CAPACITY_TARGET_FILL))
    : chromaticN
  const expansionCap = Math.min(config.days_available, MAX_EXPANDED_DAYS)
  const effectiveDays = Math.max(chromaticN, Math.min(capacityDays, expansionCap))

  // Phase 2: rebalance with capacity-aware fill-ratio penalty.
  const phase2 = dsaturLoop(
    graph, competitions, effectiveDays, compMap, packingFootprint,
    true, stripHoursMap, dayCapacity,
  )

  // Compact day assignments to contiguous 0..k-1
  const dayRemap = new Map<number, number>()
  const sortedUsed = [...new Set(phase2.coloring.values())].sort((a, b) => a - b)
  for (let i = 0; i < sortedUsed.length; i++) dayRemap.set(sortedUsed[i], i)
  const dayMap = new Map<string, number>()
  for (const [id, day] of phase2.coloring) dayMap.set(id, dayRemap.get(day)!)

  return { dayMap, relaxations: phase2.relaxations, effectiveDays: sortedUsed.length }
}
