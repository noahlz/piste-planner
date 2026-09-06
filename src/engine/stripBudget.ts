// Strip budget utilities: build the engine's strip list, compute strip caps,
// recommend ref counts, and flag competitions that need flighting due to strip
// scarcity. No strip-count recommendation lives here: 012 FR-016 removed it,
// which also ended this module's import of the analysis module and with it the
// mutual import between the two that 011 introduced. This module imports
// downward only, and the analysis module still imports `computeStripCap` here.

import type { Competition, Strip, TournamentConfig } from './types.ts'
import { Weapon, DeMode } from './types.ts'
import { poolCountFor } from './pools.ts'
import { peakDeRefDemand } from './refs.ts'

/**
 * The one rule that turns a strip count into the engine's strip list:
 * `total` strips, ids `strip-1..strip-N`, the first `videoCount`
 * video-capable. The store and the Suggest search's per-candidate config
 * (012 tasks.md §One decision) both call this, so the app cannot build one
 * strip list and the search another.
 */
export function buildStrips(total: number, videoCount: number): Strip[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `strip-${i + 1}`,
    video_capable: i < videoCount,
  }))
}

/**
 * Peak strip count a staged DE will hold concurrently — the round-of-16 allocation.
 * Finals and beyond are run ad-hoc (stop-at-semis model) and not pre-allocated.
 */
export function peakDeStripDemand(comp: Competition): number {
  return comp.de_round_of_16_strips
}

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
 * Recommends referee staffing split between three-weapon (sabre) refs and
 * foil/epee-only refs.
 *
 * Peak load is the maximum of pool-phase and DE-phase demand, using the sum
 * of the two largest concurrent events per weapon class for each phase.
 * Sabre refs are three-weapon capable, so foil/epee-only refs are the surplus
 * beyond the sabre crew.
 *
 * For staged-DE competitions, video-stage strip demand across all weapon
 * classes is factored in as additional cross-weapon contention.
 */
export function recommendRefCount(
  competitions: Competition[],
  refsPerPool: number,
  config: TournamentConfig,
): { three_weapon: number; foil_epee: number } {
  const poolsFor = (comp: Competition) => poolCountFor(comp.fencer_count, comp.use_single_pool_override)

  // --- Pool peaks per weapon class (top-2) ---
  const sabrePoolCounts = competitions
    .filter(c => c.weapon === Weapon.SABRE)
    .map(poolsFor)
    .sort((a, b) => b - a)

  const foilEpeePoolCounts = competitions
    .filter(c => c.weapon === Weapon.FOIL || c.weapon === Weapon.EPEE)
    .map(poolsFor)
    .sort((a, b) => b - a)

  const peakSabrePools = (sabrePoolCounts[0] ?? 0) + (sabrePoolCounts[1] ?? 0)
  const peakFoilEpeePools = (foilEpeePoolCounts[0] ?? 0) + (foilEpeePoolCounts[1] ?? 0)

  // --- DE peaks per weapon class (top-2) ---
  const sabreDeDemands = competitions
    .filter(c => c.weapon === Weapon.SABRE)
    .map(c => peakDeRefDemand(c, config))
    .sort((a, b) => b - a)

  const foilEpeeDeDemands = competitions
    .filter(c => c.weapon === Weapon.FOIL || c.weapon === Weapon.EPEE)
    .map(c => peakDeRefDemand(c, config))
    .sort((a, b) => b - a)

  const peakSabreDe = (sabreDeDemands[0] ?? 0) + (sabreDeDemands[1] ?? 0)
  const peakFoilEpeeDe = (foilEpeeDeDemands[0] ?? 0) + (foilEpeeDeDemands[1] ?? 0)

  // --- Video-stage addendum for staged DEs ---
  // Staged DEs share limited video strips across weapon classes, so the
  // cross-weapon sum of video-stage strips may exceed per-class peaks.
  const videoStageSum = competitions
    .filter(c => c.de_mode === DeMode.STAGED)
    .reduce((sum, c) => sum + peakDeStripDemand(c), 0)

  // Per weapon class: max(pool demand, DE demand)
  let peakSabre = Math.max(peakSabrePools * refsPerPool, peakSabreDe)
  let peakFoilEpee = Math.max(peakFoilEpeePools * refsPerPool, peakFoilEpeeDe)

  // If cross-weapon video-stage contention exceeds both per-class peaks,
  // distribute the surplus proportionally (or to foil/epee when no sabre staged)
  if (videoStageSum > peakSabre + peakFoilEpee) {
    const stagedSabreStrips = competitions
      .filter(c => c.de_mode === DeMode.STAGED && c.weapon === Weapon.SABRE)
      .reduce((sum, c) => sum + peakDeStripDemand(c), 0)
    const stagedFoilEpeeStrips = videoStageSum - stagedSabreStrips

    peakSabre = Math.max(peakSabre, stagedSabreStrips)
    peakFoilEpee = Math.max(peakFoilEpee, stagedFoilEpeeStrips)
  }

  const threeWeaponRefs = Math.ceil(peakSabre)
  const foilEpeeRefs = Math.max(
    0,
    Math.ceil(peakFoilEpee) - threeWeaponRefs,
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
