import type { Competition } from './types.ts'

/**
 * Iterates over every unique (a, b) pair in competitions where a comes before b
 * (i.e., i < j). Calls fn for each pair. Used to avoid duplicating the standard
 * nested-loop scaffolding across engine modules.
 */
export function forEachCompetitionPair(
  competitions: Competition[],
  fn: (a: Competition, b: Competition) => void,
): void {
  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      fn(competitions[i], competitions[j])
    }
  }
}
