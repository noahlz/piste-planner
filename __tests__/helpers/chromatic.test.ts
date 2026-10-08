import { describe, it, expect } from 'vitest'
import { chromaticNumber } from './chromatic.ts'
import type { Adjacency } from './chromatic.ts'

// The table pin trusts this helper to say one fewer day is impossible, so the
// search must be exact, not a greedy upper bound.

/** An undirected graph on vertices 0..n-1 from `edges` written as 'a-b'. */
function graphOf(n: number, edges: readonly string[]): Adjacency {
  const adjacency = new Map<string, Set<string>>()
  for (let v = 0; v < n; v++) adjacency.set(String(v), new Set())
  for (const edge of edges) {
    const [a, b] = edge.split('-')
    adjacency.get(a)!.add(b)
    adjacency.get(b)!.add(a)
  }
  return adjacency
}

const K2 = graphOf(2, ['0-1'])

describe('chromaticNumber', () => {
  it.each([
    // Found by a seeded random search: first-fit greedy in the helper's own
    // vertex order needs 4 here, the exact answer is 3.
    {
      name: 'a graph greedy over-colours',
      graph: graphOf(8, [
        '0-2', '0-4', '0-5', '0-7', '1-2', '1-4', '1-6',
        '2-3', '2-4', '2-5', '2-6', '3-5', '6-7',
      ]),
      chi: 3,
    },
    { name: 'K4', graph: graphOf(4, ['0-1', '0-2', '0-3', '1-2', '1-3', '2-3']), chi: 4 },
    // An odd cycle, so 2 colours must be ruled out.
    { name: 'C5', graph: graphOf(5, ['0-1', '1-2', '2-3', '3-4', '4-0']), chi: 3 },
    { name: 'K3 plus an isolated vertex', graph: graphOf(4, ['0-1', '1-2', '2-0']), chi: 3 },
    { name: 'the empty graph', graph: graphOf(0, []), chi: 0 },
  ])('$name needs $chi colours', ({ graph, chi }) => {
    expect(chromaticNumber(graph)).toBe(chi)
  })

  it('throws once the search runs past its step cap', () => {
    expect(() => chromaticNumber(K2, 1)).toThrow(/exceeded 1 search steps/)
  })
})
