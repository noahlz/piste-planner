import { Weapon, CutMode, EventType, RefPolicy } from './types.ts'
import type { PoolStructure, PoolDurationResult, RefResolution } from './types.ts'
import { BOUT_COUNTS, MAX_DE_FIELD } from './constants.ts'

// BOUT_COUNTS[7] = 21 is the baseline pool size used to scale durations (Ops Manual p.17)
const BASELINE_POOL_SIZE = 7

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
 *   round(baseDuration * BOUT_COUNTS[poolSize] / BOUT_COUNTS[7])
 *
 * `durationTable` holds pool-of-7 times (21 bouts), per Ops Manual 2026-27
 * p.17 – Average Bout Timing, Pool of 7.
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
  return Math.round(totalWeighted / pool_sizes.length)
}

/**
 * Estimates the total pool round duration given resource constraints.
 *
 * Refs are assumed always available (Task 5A: ref-availability gating removed).
 *
 * METHODOLOGY.md §Pool Parallelism:
 * - staffable_strips = min(availableStrips, nPools)
 * - effective_parallelism = staffable_strips
 * - actual_batches = ceil(nPools / effective_parallelism)
 * - actual_duration = ceil(baseline * actual_batches)
 */
export function estimatePoolDuration(
  nPools: number,
  weightedDuration: number,
  availableStrips: number,
  _refsPerPool: number,
): PoolDurationResult {
  const staffableStrips = Math.min(availableStrips, nPools)
  const effective_parallelism = staffableStrips
  const actual_batches = Math.ceil(nPools / Math.max(effective_parallelism, 1))
  const actual_duration = Math.ceil(weightedDuration * actual_batches)
  const uncompensated = Math.max(nPools - staffableStrips, 0)

  return {
    actual_duration,
    baseline: weightedDuration,
    effective_parallelism,
    uncompensated,
    penalised: uncompensated > 0,
  }
}

/**
 * Computes the number of fencers advancing to DE after applying pool-round cuts.
 *
 * METHODOLOGY.md §Bracket Sizing. The result is min(max(promoted, 2), MAX_DE_FIELD)
 * where promoted is:
 * - TEAM events always bypass cuts (all fencers advance)
 * - DISABLED: all fencers advance
 * - PERCENTAGE: round(fencerCount * (1 - value / 100)), where value is the % cut
 * - COUNT: min(value, fencerCount)
 * The 256 cap holds for every event, team or individual, and is silent (S8 p.37).
 * Throws when fencerCount is 1 or fewer.
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

  let promoted: number
  if (eventType === EventType.TEAM || cutMode === CutMode.DISABLED) {
    promoted = fencerCount
  } else if (cutMode === CutMode.PERCENTAGE) {
    // cutValue is the % to CUT (e.g. 20 = cut 20%, keep 80%), so promoted = fencerCount × (1 - cutValue/100)
    promoted = Math.round(fencerCount * (1 - cutValue / 100))
  } else {
    promoted = Math.min(cutValue, fencerCount)
  }

  return Math.min(Math.max(promoted, 2), MAX_DE_FIELD)
}

/**
 * Resolves the number of referees assigned per pool given the ref policy.
 *
 * Refs are assumed always available (Task 5A: ref-availability gating removed).
 *
 * METHODOLOGY.md §Refs Per Pool:
 * - ONE: 1 ref/pool, refs_needed = nPools
 * - TWO: 2 refs/pool, refs_needed = 2 * nPools (no fallback — refs always sufficient)
 * - AUTO: 2 refs/pool, refs_needed = 2 * nPools (no fallback — refs always sufficient)
 */
export function resolveRefsPerPool(
  refPolicy: RefPolicy,
  nPools: number,
): RefResolution {
  if (refPolicy === RefPolicy.ONE) {
    return { refs_per_pool: 1, refs_needed: nPools }
  }

  // TWO and AUTO both use 2 refs/pool; no fallback to 1 since refs are always assumed available
  return { refs_per_pool: 2, refs_needed: nPools * 2 }
}
