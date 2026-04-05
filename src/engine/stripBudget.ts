// Strip budget utilities: compute strip caps, recommend strip/ref counts,
// and flag competitions that need flighting due to strip scarcity.

import type { Competition } from './types.ts'
import { Weapon } from './types.ts'
import { poolCountFor } from './pools.ts'

/**
 * Returns the max number of strips a phase (pool or DE) may use across the
 * whole tournament.  Per-competition override takes precedence over the global
 * percentage when provided.
 */
export function computeStripCap(
  stripTotal: number,
  globalPct: number,
  eventOverridePct?: number | null,
): number {
  const pct = eventOverridePct ?? globalPct
  return Math.floor(stripTotal * pct)
}

/**
 * Estimates the minimum strip count needed so that the busiest pool round can
 * run with all pools in parallel while staying within the given percentage cap.
 */
export function recommendStripCount(
  competitions: Competition[],
  maxPoolStripPct: number,
): number {
  const maxPools = competitions.reduce((max, comp) => {
    const n_pools = poolCountFor(comp.fencer_count, comp.use_single_pool_override)
    return Math.max(max, n_pools)
  }, 0)

  if (maxPools === 0) return 0
  return Math.ceil(maxPools / maxPoolStripPct)
}

/**
 * Recommends referee staffing split between three-weapon (sabre) refs and
 * foil/epee-only refs.
 *
 * Peak load is estimated as the sum of the two largest concurrent pool rounds
 * per weapon class.  Sabre refs are three-weapon capable, so foil/epee-only
 * refs are the surplus beyond the sabre crew.
 */
export function recommendRefCount(
  competitions: Competition[],
  refsPerPool: number,
): { three_weapon: number; foil_epee: number } {
  const poolsFor = (comp: Competition) => poolCountFor(comp.fencer_count, comp.use_single_pool_override)

  const sabreEvents = competitions
    .filter(c => c.weapon === Weapon.SABRE)
    .map(poolsFor)
    .sort((a, b) => b - a)

  const foilEpeeEvents = competitions
    .filter(c => c.weapon === Weapon.FOIL || c.weapon === Weapon.EPEE)
    .map(poolsFor)
    .sort((a, b) => b - a)

  // Sum of top-2 concurrent events for each weapon class
  const peakSabrePools = (sabreEvents[0] ?? 0) + (sabreEvents[1] ?? 0)
  const peakFoilEpeePools = (foilEpeeEvents[0] ?? 0) + (foilEpeeEvents[1] ?? 0)

  const threeWeaponRefs = Math.ceil(peakSabrePools * refsPerPool)
  const foilEpeeRefs = Math.max(
    0,
    Math.ceil(peakFoilEpeePools * refsPerPool) - threeWeaponRefs,
  )

  return { three_weapon: threeWeaponRefs, foil_epee: foilEpeeRefs }
}

/**
 * Returns the IDs of competitions whose pool round needs more strips than the
 * cap allows, making them candidates for flighting.
 */
export function flagFlightingCandidates(
  competitions: Competition[],
  poolStripCap: number,
): string[] {
  return competitions
    .filter(comp => poolCountFor(comp.fencer_count, comp.use_single_pool_override) > poolStripCap)
    .map(comp => comp.id)
}
