// Strip budget utilities: build the engine's strip list, compute strip caps,
// and flag competitions that need flighting due to strip scarcity. No
// strip-count recommendation lives here: 012 FR-016 removed it, which also
// ended this module's import of the analysis module and with it the mutual
// import between the two that 011 introduced. This module imports downward
// only, and the analysis module still imports `computeStripCap` here.

import type { Competition, Strip, TournamentConfig } from './types.ts'
import { isSizeableCount, poolCountFor } from './pools.ts'
import { computeBracketSize, deVideoStripAsk } from './de.ts'

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
 * Peak strip count a staged DE's video block will hold concurrently – its
 * video ask, `min(4, bracketSize / 2)` (METHODOLOGY.md §DE Modes). Gold and
 * bronze are run ad-hoc (stop-at-semis model) and not pre-allocated.
 */
export function peakDeStripDemand(comp: Competition): number {
  return deVideoStripAsk(
    computeBracketSize(comp.fencer_count, comp.cut_mode, comp.cut_value, comp.event_type),
  )
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
 * Returns the IDs of competitions whose pool round needs more strips than
 * their own cap allows, making them candidates for flighting (METHODOLOGY
 * §Strip Budget). Each event's cap is `computeStripCap` with its own
 * `max_pool_strip_pct_override`, the global percentage otherwise. A
 * competition `isSizeableCount` rejects under the config's bounds has no pool
 * round and is never a candidate (018 T4). Analysis Pass 1 reads its
 * strip-deficit candidates from here.
 */
export function flagFlightingCandidates(
  competitions: Competition[],
  config: TournamentConfig,
): string[] {
  return competitions
    .filter(comp => isSizeableCount(comp.fencer_count, config))
    .filter(comp => {
      const cap = computeStripCap(config.strips_total, config.max_pool_strip_pct, comp.max_pool_strip_pct_override)
      return poolCountFor(comp.fencer_count, comp.use_single_pool_override) > cap
    })
    .map(comp => comp.id)
}
