import type { Competition, TournamentType } from './types.ts'
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
// Builder
// ──────────────────────────────────────────────

/**
 * Builds an incompatibility constraint graph from all competition pairs.
 * Each edge weight represents the penalty for scheduling the two competitions
 * on the same day: Infinity = hard constraint (must not share a day),
 * finite > 0 = soft penalty. The tournament type decides whether a Group 1
 * pair is hard or soft (Ops Manual p.20 – Group 1, `crossoverPenalty`).
 *
 * Edges are bidirectional and symmetric.
 * O(n^2) over n competitions (n <= 54).
 */
export function buildConstraintGraph(
  competitions: Competition[],
  tournamentType: TournamentType,
): ConstraintGraph {
  const graph: ConstraintGraph = new Map()

  // Initialize adjacency lists for all competitions
  for (const comp of competitions) {
    graph.set(comp.id, [])
  }

  forEachCompetitionPair(competitions, (c1, c2) => {
    // crossoverPenalty covers same-population, the cross-level ind/team blocks,
    // Group 1 by tournament type, the soft separations and CROSSOVER_GRAPH.
    const weight = crossoverPenalty(c1, c2, tournamentType)

    // Only add an edge if there is a constraint (weight > 0)
    if (weight > 0) {
      graph.get(c1.id)!.push({ targetId: c2.id, weight })
      graph.get(c2.id)!.push({ targetId: c1.id, weight })
    }
  })

  return graph
}
