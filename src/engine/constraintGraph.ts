import type { Competition } from './types.ts'
import { EventType } from './types.ts'
import { INDIV_TEAM_RELAXABLE_BLOCKS } from './constants.ts'
import { crossoverPenalty } from './crossover.ts'
import { forEachCompetitionPair } from './pairs.ts'

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type ConstraintEdge = {
  targetId: string
  weight: number // Infinity = hard constraint, finite = soft penalty
}

/** Adjacency list keyed by competition ID. */
export type ConstraintGraph = Map<string, ConstraintEdge[]>

// ──────────────────────────────────────────────
// Individual/Team block check
// ──────────────────────────────────────────────

/**
 * Returns true if c1 and c2 form an INDIV_TEAM_RELAXABLE_BLOCK pair
 * (same weapon and gender, one INDIVIDUAL of indivCategory and one TEAM of teamCategory).
 * These must not be on the same day.
 */
function isIndivTeamBlock(c1: Competition, c2: Competition): boolean {
  if (c1.gender !== c2.gender) return false
  if (c1.weapon !== c2.weapon) return false
  // INDIV_TEAM_RELAXABLE_BLOCKS requires one INDIVIDUAL and one TEAM event
  if (c1.event_type === c2.event_type) return false

  for (const { indivCategory, teamCategory } of INDIV_TEAM_RELAXABLE_BLOCKS) {
    if (
      c1.event_type === EventType.INDIVIDUAL &&
      c1.category === indivCategory &&
      c2.event_type === EventType.TEAM &&
      c2.category === teamCategory
    ) {
      return true
    }
    if (
      c2.event_type === EventType.INDIVIDUAL &&
      c2.category === indivCategory &&
      c1.event_type === EventType.TEAM &&
      c1.category === teamCategory
    ) {
      return true
    }
  }

  return false
}

// ──────────────────────────────────────────────
// Builder
// ──────────────────────────────────────────────

/**
 * Builds an incompatibility constraint graph from all competition pairs.
 * Each edge weight represents the penalty for scheduling the two competitions
 * on the same day: Infinity = hard constraint (must not share a day),
 * finite > 0 = soft penalty.
 *
 * Edges are bidirectional and symmetric.
 * O(n^2) over n competitions (n <= 54).
 */
export function buildConstraintGraph(competitions: Competition[]): ConstraintGraph {
  const graph: ConstraintGraph = new Map()

  // Initialize adjacency lists for all competitions
  for (const comp of competitions) {
    graph.set(comp.id, [])
  }

  forEachCompetitionPair(competitions, (c1, c2) => {
    // Check crossoverPenalty first (handles same-population, GROUP_1_MANDATORY, CROSSOVER_GRAPH)
    let weight = crossoverPenalty(c1, c2)

    // If crossoverPenalty returns 0 (no crossover relationship), check INDIV_TEAM_RELAXABLE_BLOCKS
    if (weight === 0.0 && isIndivTeamBlock(c1, c2)) {
      weight = Infinity
    }

    // Only add an edge if there is a constraint (weight > 0)
    if (weight > 0) {
      graph.get(c1.id)!.push({ targetId: c2.id, weight })
      graph.get(c2.id)!.push({ targetId: c1.id, weight })
    }
  })

  return graph
}
