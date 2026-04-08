import { Weapon, CutMode, EventType, RefPolicy } from './types.ts'
import type { PoolStructure, PoolDurationResult, RefResolution } from './types.ts'
import { BOUT_COUNTS } from './constants.ts'

// BOUT_COUNTS[6] = 15 is the baseline pool size used to scale durations
const BASELINE_POOL_SIZE = 6

/**
 * Computes the pool structure (number of pools and their sizes) for a given fencer count.
 *
 * METHODOLOGY.md §Pool Sizing rules:
 * - n ≤ 9: single pool
 * - n = 10 with single_pool_override: single pool of 10
 * - n ≥ 10: split into pools of 5, 6, and 7 targeting pool sizes of 6-7.
 *   n_pools = ceil(n/7). Distribute fencers across pools evenly:
 *   base_size = floor(n / n_pools), remainder = n % n_pools.
 *   `remainder` pools get base_size+1, the rest get base_size.
 *
 * The single_pool_override is only honoured when n ≤ 10.
 */
export function computePoolStructure(
  fencerCount: number,
  useSinglePoolOverride = false,
): PoolStructure {
  if (fencerCount <= 1) {
    throw new Error(`computePoolStructure: fencerCount must be > 1, got ${fencerCount}`)
  }
  if (fencerCount <= 9 || (fencerCount === 10 && useSinglePoolOverride)) {
    return { n_pools: 1, pool_sizes: [fencerCount] }
  }

  // Target pools of 6-7; use ceil(n/7) as pool count
  const n_pools = Math.ceil(fencerCount / 7)
  const baseSize = Math.floor(fencerCount / n_pools)
  const remainder = fencerCount % n_pools

  // `remainder` pools get baseSize+1, the rest get baseSize
  const sizes: number[] = [
    ...Array(remainder).fill(baseSize + 1),
    ...Array(n_pools - remainder).fill(baseSize),
  ]

  return { n_pools, pool_sizes: sizes }
}

/**
 * Lightweight wrapper around computePoolStructure that returns only n_pools.
 * Use this wherever pool count is needed without the full PoolStructure.
 */
export function poolCountFor(fencerCount: number, useSinglePoolOverride = false): number {
  return computePoolStructure(fencerCount, useSinglePoolOverride).n_pools
}

/**
 * Returns the estimated duration (minutes) for a single pool of a given size.
 *
 * Formula (METHODOLOGY.md §Pool Duration Estimation):
 *   round(baseDuration * BOUT_COUNTS[poolSize] / BOUT_COUNTS[6])
 *
 * BOUT_COUNTS[6] = 15 is the canonical baseline (standard 6-person pool).
 */
export function poolDurationForSize(
  weapon: Weapon,
  poolSize: number,
  durationTable: Record<Weapon, number>,
): number {
  const baseDuration = durationTable[weapon]
  return Math.round(
    (baseDuration * BOUT_COUNTS[poolSize]) / BOUT_COUNTS[BASELINE_POOL_SIZE],
  )
}

/**
 * Computes the weighted-average pool round duration across a mixed pool structure.
 *
 * METHODOLOGY.md §Pool Duration Estimation: weighted average = sum(duration_for_size * count) / total_pools
 */
export function weightedPoolDuration(
  poolStructure: PoolStructure,
  weapon: Weapon,
  durationTable: Record<Weapon, number>,
): number {
  const { pool_sizes } = poolStructure
  const totalWeighted = pool_sizes.reduce(
    (sum, size) => sum + poolDurationForSize(weapon, size, durationTable),
    0,
  )
  const avg = Math.round(totalWeighted / pool_sizes.length)

  // Single pool of 8+ fencers is double-stripped. 0.6× (not 0.5×) accounts for
  // fencer rest periods and bout-switching friction that prevent a clean 2× speedup.
  if (pool_sizes.length === 1 && pool_sizes[0] >= 8) {
    return Math.round(avg * 0.6)
  }

  return avg
}

/**
 * Estimates the total pool round duration given resource constraints.
 *
 * METHODOLOGY.md §Pool Parallelism:
 * - staffable_strips = min(availableStrips, nPools, floor(availableRefs / refsPerPool))
 * - When refsPerPool == 1, excess refs can each cover an additional strip ("double duty")
 * - effective_parallelism = staffable_strips + double_duty_pairs
 * - actual_batches = ceil(nPools / effective_parallelism)
 * - actual_duration = ceil(baseline * actual_batches)
 */
export function estimatePoolDuration(
  nPools: number,
  weightedDuration: number,
  availableStrips: number,
  availableRefs: number,
  refsPerPool: number,
): PoolDurationResult {
  const staffableStrips = Math.min(
    availableStrips,
    nPools,
    Math.floor(availableRefs / refsPerPool),
  )

  // Referee double-duty: when refs_per_pool == 1, one excess ref can cover two strips.
  // Distinct from "double stripping" in the Ops Manual.
  let double_duty_pairs = 0
  if (refsPerPool === 1) {
    const excessRefs = Math.max(availableRefs - staffableStrips, 0)
    double_duty_pairs = Math.min(excessRefs, nPools - staffableStrips)
  }

  const effective_parallelism = staffableStrips + double_duty_pairs
  const actual_batches = Math.ceil(nPools / Math.max(effective_parallelism, 1))
  const actual_duration = Math.ceil(weightedDuration * actual_batches)
  const uncompensated = Math.max(nPools - effective_parallelism, 0)

  return {
    actual_duration,
    baseline: weightedDuration,
    effective_parallelism,
    double_duty_pairs,
    uncompensated,
    penalised: uncompensated > 0,
  }
}

/**
 * Computes the number of fencers advancing to DE after applying pool-round cuts.
 *
 * METHODOLOGY.md §Pool Composition:
 * - TEAM events always bypass cuts (return fencerCount unchanged)
 * - DISABLED: all fencers advance
 * - PERCENTAGE: floor(fencerCount * value / 100), minimum 2
 * - COUNT: min(value, fencerCount), minimum 2
 */
export function computeDeFencerCount(
  fencerCount: number,
  cutMode: CutMode,
  cutValue: number,
  eventType: EventType,
): number {
  if (fencerCount <= 1) {
    throw new Error(`computeDeFencerCount: fencerCount must be > 1, got ${fencerCount}`)
  }
  if (eventType === EventType.TEAM) return fencerCount

  let promoted: number
  if (cutMode === CutMode.DISABLED) {
    promoted = fencerCount
  } else if (cutMode === CutMode.PERCENTAGE) {
    // cutValue is the % to CUT (e.g. 20 = cut 20%, keep 80%), so promoted = fencerCount × (1 - cutValue/100)
    promoted = Math.round(fencerCount * (1 - cutValue / 100))
  } else {
    promoted = Math.min(cutValue, fencerCount)
  }

  return Math.max(promoted, 2)
}

/**
 * Resolves the number of referees assigned per pool given the ref policy.
 *
 * METHODOLOGY.md §Refs Per Pool:
 * - ONE: always 1 ref/pool; shortfall if availableRefs < nPools
 * - TWO: tries 2 refs/pool; falls back to 1 with shortfall if availableRefs < 2*nPools
 * - AUTO: tries 2 if availableRefs >= 2*nPools; otherwise uses 1 (no shortfall)
 */
export function resolveRefsPerPool(
  refPolicy: RefPolicy,
  nPools: number,
  availableRefs: number,
): RefResolution {
  if (refPolicy === RefPolicy.ONE) {
    const refs_needed = nPools
    return {
      refs_per_pool: 1,
      refs_needed,
      shortfall: Math.max(0, refs_needed - availableRefs),
    }
  }

  if (refPolicy === RefPolicy.TWO) {
    const refs_needed_2 = nPools * 2
    if (availableRefs >= refs_needed_2) {
      return { refs_per_pool: 2, refs_needed: refs_needed_2, shortfall: 0 }
    }
    const refs_needed_1 = nPools
    return {
      refs_per_pool: 1,
      refs_needed: refs_needed_1,
      shortfall: refs_needed_2 - availableRefs,
    }
  }

  // RefPolicy.AUTO: use 2/pool if enough, otherwise 1/pool.
  // AUTO mode silently falls back to 1 ref/pool when supply is insufficient, reporting zero shortfall.
  // This is intentional: AUTO means "use the best available" rather than "require 2".
  // Contrast with TWO mode, which reports the shortfall as a warning.
  // Shortfall is still reported if even 1/pool can't be staffed.
  const refs_needed_2 = nPools * 2
  if (availableRefs >= refs_needed_2) {
    return { refs_per_pool: 2, refs_needed: refs_needed_2, shortfall: 0 }
  }

  const refs_needed_1 = nPools
  return {
    refs_per_pool: 1,
    refs_needed: refs_needed_1,
    shortfall: Math.max(0, refs_needed_1 - availableRefs),
  }
}
