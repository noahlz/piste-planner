import { findCompetition } from '../engine/catalogue.ts'
import { computePoolStructure } from '../engine/pools.ts'

interface RefSuggestion {
  foil_epee_refs: number
  three_weapon_refs: number
}

/**
 * Suggests referee counts based on selected competitions and strip count.
 * Heuristic: one ref per strip in use. Saber competitions need saber refs;
 * foil/epee competitions need foil/epee refs. Distributes evenly across days.
 *
 * Accepts a map of competition ID -> { fencer_count, use_single_pool_override }
 * so it can be called from both the store and the component without coupling
 * to the full store shape.
 */
export function suggestRefs(
  competitions: Record<string, { fencer_count: number; use_single_pool_override: boolean }>,
  daysAvailable: number,
  stripsTotal: number,
): RefSuggestion | null {
  const entries = Object.entries(competitions)
  if (entries.length === 0 || daysAvailable === 0 || stripsTotal === 0) return null

  let saberPools = 0
  let foilEpeePools = 0
  for (const [id, config] of entries) {
    const entry = findCompetition(id)
    if (!entry || config.fencer_count < 2) continue
    const ps = computePoolStructure(config.fencer_count, config.use_single_pool_override)
    if (entry.weapon === 'SABRE') {
      saberPools += ps.n_pools
    } else {
      foilEpeePools += ps.n_pools
    }
  }

  const totalPools = saberPools + foilEpeePools
  if (totalPools === 0) return null

  const poolsPerDay = Math.ceil(totalPools / daysAvailable)
  const stripsInUse = Math.min(poolsPerDay, stripsTotal)

  // Split refs proportionally by weapon type (one ref per strip in use)
  const saberRatio = saberPools / totalPools
  const saberRefs = Math.max(1, Math.round(stripsInUse * saberRatio))
  const foilEpeeRefs = Math.max(1, stripsInUse - saberRefs)

  return { foil_epee_refs: foilEpeeRefs, three_weapon_refs: saberRefs }
}
