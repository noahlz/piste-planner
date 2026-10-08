/** An undirected graph as adjacency sets: each edge appears under both ends. */
export type Adjacency = ReadonlyMap<string, ReadonlySet<string>>

/**
 * The exact chromatic number of `graph`: the fewest colours with no edge
 * joining two vertices of one colour. Each connected component is searched on
 * its own (the graph's number is the largest of theirs), trying k = 1, 2, …
 * with a backtracking colouring in falling-degree order.
 *
 * Exponential in the worst case, so every step counts against `maxSteps` and
 * the search throws rather than run on (constitution IV).
 */
export function chromaticNumber(graph: Adjacency, maxSteps = 5_000_000): number {
  let steps = 0
  const step = (): void => {
    if (++steps > maxSteps) throw new Error(`chromaticNumber: exceeded ${maxSteps} search steps`)
  }

  let chi = 0
  for (const component of components(graph, step)) {
    chi = Math.max(chi, componentChromaticNumber(graph, component, step))
  }
  return chi
}

function components(graph: Adjacency, step: () => void): string[][] {
  const seen = new Set<string>()
  const out: string[][] = []
  for (const start of graph.keys()) {
    if (seen.has(start)) continue
    const component: string[] = []
    const stack = [start]
    seen.add(start)
    // Each vertex is pushed once, so this runs at most |V| times per graph.
    while (stack.length > 0) {
      step()
      const v = stack.pop()!
      component.push(v)
      for (const w of neighbours(graph, v)) {
        if (!seen.has(w)) {
          seen.add(w)
          stack.push(w)
        }
      }
    }
    out.push(component)
  }
  return out
}

function componentChromaticNumber(graph: Adjacency, vertices: string[], step: () => void): number {
  // k = |V| always colours, so the loop returns by then.
  for (let k = 1; k <= vertices.length; k++) {
    if (colourable(graph, vertices, k, step)) return k
  }
  throw new Error('chromaticNumber: no k ≤ |V| colours the component (self-loop?)')
}

function colourable(graph: Adjacency, vertices: string[], k: number, step: () => void): boolean {
  const order = [...vertices].sort((a, b) => neighbours(graph, b).size - neighbours(graph, a).size)
  const colour = new Map<string, number>()
  const assign = (i: number): boolean => {
    step()
    if (i === order.length) return true
    const v = order[i]
    const taken = new Set<number>()
    for (const w of neighbours(graph, v)) {
      const c = colour.get(w)
      if (c !== undefined) taken.add(c)
    }
    for (let c = 0; c < k; c++) {
      if (taken.has(c)) continue
      colour.set(v, c)
      if (assign(i + 1)) return true
      colour.delete(v)
    }
    return false
  }
  return assign(0)
}

function neighbours(graph: Adjacency, v: string): ReadonlySet<string> {
  const ns = graph.get(v)
  if (ns === undefined) throw new Error(`chromaticNumber: vertex ${v} has no adjacency entry`)
  return ns
}
