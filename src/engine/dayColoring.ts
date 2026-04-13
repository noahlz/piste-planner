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
 * balance load across those days. This module uses two phases:
 *   Phase 1 – run DSatur without load-balancing penalties to discover the
 *             minimum number of days (the effective chromatic number).
 *   Phase 2 – rerun DSatur with load-balancing penalties active, capped to
 *             the effective day count from Phase 1, so events spread evenly
 *             across the minimum set of days.
 *
 * References:
 *   - DSatur algorithm: https://en.wikipedia.org/wiki/DSatur
 *   - Graph coloring concepts: https://www.youtube.com/watch?v=h9wxtqoa1jY
 */

import type { Competition, TournamentConfig } from './types.ts'
import { EventType } from './types.ts'
import type { ConstraintGraph } from './constraintGraph.ts'
import { categoryWeight } from './capacity.ts'
import { getProximityWeight } from './crossover.ts'
import {
  REST_DAY_PAIRS,
  INDIV_TEAM_RELAXABLE_BLOCKS,
  PENALTY_WEIGHTS,
} from './constants.ts'

// ──────────────────────────────────────────────
// Load-balancing constants
// ──────────────────────────────────────────────

/** Per-event cost for adding to an already-used day. Nudges toward even distribution. */
const LOAD_BALANCE_FULLNESS = 0.5

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

  const ind = competitions.find(
    c =>
      c.id !== competition.id &&
      c.category === competition.category &&
      c.gender === competition.gender &&
      c.weapon === competition.weapon &&
      c.event_type === EventType.INDIVIDUAL,
  )
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

  // Load balancing: penalize days proportionally to how many events are
  // already assigned there. Only active in Phase 2 (loadBalance = true).
  if (loadBalance) {
    let eventsOnDay = 0
    for (const day of coloring.values()) {
      if (day === c) eventsOnDay++
    }
    total += eventsOnDay * LOAD_BALANCE_FULLNESS
  }

  return total
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
    const edges = graph.get(id) ?? []

    // Determine blocked colors (from hard-edge neighbors already colored)
    const blockedColors = new Set<number>()
    for (const edge of edges) {
      if (edge.weight === Infinity) {
        const neighborColor = coloring.get(edge.targetId)
        if (neighborColor !== undefined) blockedColors.add(neighborColor)
      }
    }

    // Valid colors in [0, nDays)
    const validColors = Array.from({ length: nDays }, (_, i) => i).filter(
      c => !blockedColors.has(c),
    )

    // Pick best valid color by soft penalty
    let chosenColor: number
    if (validColors.length > 0) {
      let bestColor = validColors[0]
      let bestPenalty = colorPenalty(id, validColors[0], graph, coloring, compMap, competitions, new Set(), loadBalance)
      for (let ci = 1; ci < validColors.length; ci++) {
        const p = colorPenalty(id, validColors[ci], graph, coloring, compMap, competitions, new Set(), loadBalance)
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
          let bestPenalty = colorPenalty(id, relaxedValidColors[0], graph, coloring, compMap, competitions, relaxable, loadBalance)
          for (let ci = 1; ci < relaxedValidColors.length; ci++) {
            const p = colorPenalty(id, relaxedValidColors[ci], graph, coloring, compMap, competitions, relaxable, loadBalance)
            if (p < bestPenalty) {
              bestPenalty = p
              bestColor = relaxedValidColors[ci]
            }
          }
          chosenColor = bestColor
        } else {
          // Still no valid color — pick least-bad color
          chosenColor = 0
          let bestPenalty = colorPenalty(id, 0, graph, coloring, compMap, competitions, relaxable, loadBalance)
          for (let c = 1; c < nDays; c++) {
            const p = colorPenalty(id, c, graph, coloring, compMap, competitions, relaxable, loadBalance)
            if (p < bestPenalty) {
              bestPenalty = p
              chosenColor = c
            }
          }
        }
      } else {
        // No relaxable edges — pick least-bad color
        chosenColor = 0
        let bestPenalty = colorPenalty(id, 0, graph, coloring, compMap, competitions, new Set(), loadBalance)
        for (let c = 1; c < nDays; c++) {
          const p = colorPenalty(id, c, graph, coloring, compMap, competitions, new Set(), loadBalance)
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

  // Phase 1: find minimum days (no load balancing)
  const phase1 = dsaturLoop(graph, competitions, config.days_available, compMap, packingFootprint, false)
  const effectiveDays = new Set(phase1.coloring.values()).size

  // Phase 2: rebalance within minimum day count
  const phase2 = dsaturLoop(graph, competitions, effectiveDays, compMap, packingFootprint, true)

  // Compact day assignments to contiguous 0..k-1
  const dayRemap = new Map<number, number>()
  const sortedUsed = [...new Set(phase2.coloring.values())].sort((a, b) => a - b)
  for (let i = 0; i < sortedUsed.length; i++) dayRemap.set(sortedUsed[i], i)
  const dayMap = new Map<string, number>()
  for (const [id, day] of phase2.coloring) dayMap.set(id, dayRemap.get(day)!)

  return { dayMap, relaxations: phase2.relaxations, effectiveDays }
}
