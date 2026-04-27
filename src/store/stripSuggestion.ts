import { computePoolStructure } from '../engine/pools.ts'

/**
 * Suggests strip count based on the largest competition's pool count.
 * Returns enough strips to run all pools of the peak competition in a single flight.
 *
 * Returns null if no valid competitions exist.
 */
export function suggestStrips(
  competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }>,
): number | null {
  let maxPools = 0

  for (const config of Object.values(competitions)) {
    if (config.fencer_count < 2) continue
    const ps = computePoolStructure(config.fencer_count, config.use_single_pool_override)
    if (ps.n_pools > maxPools) {
      maxPools = ps.n_pools
    }
  }

  if (maxPools === 0) return null

  return maxPools
}
