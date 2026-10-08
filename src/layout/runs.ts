/** A stretch of consecutive strip indices, `first` 0-based. */
export interface StripRun {
  first: number
  count: number
}

/**
 * The maximal consecutive stretches of an ascending strip set, one per drawn
 * rect and one per range in a strip label. Shared by `assignStrips` and
 * `stripSetLabel`, so the canvas and its words cannot split a set differently.
 * Input must be ascending and free of duplicates, as both callers pass it.
 */
export function runsOf(strips: readonly number[]): StripRun[] {
  const runs: StripRun[] = []
  for (const strip of strips) {
    const last = runs[runs.length - 1]
    if (last && last.first + last.count === strip) last.count++
    else runs.push({ first: strip, count: 1 })
  }
  return runs
}
