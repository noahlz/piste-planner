import { CutMode, DeMode, RefPolicy, VideoPolicy } from '../../src/engine/types.ts'
import type { Competition, TournamentConfig } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from './factories.ts'

/** A clock time as minutes from midnight, so a window opening reads `clock(17, 55)` and not 1075. */
export function clock(hours: number, minutes = 0): number {
  return hours * 60 + minutes
}

export const SEVEN_PM = clock(19)
export const TEN_PM = clock(22)

/**
 * A single event shaped for the evening-window tests: no cut, one referee per
 * strip, best-effort video. Its id is `late-evt`.
 */
export function lateEventCompetition(fencerCount: number, deMode: DeMode = DeMode.SINGLE_STAGE): Competition {
  return makeCompetition({
    id: 'late-evt',
    fencer_count: fencerCount,
    de_mode: deMode,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    ref_policy: RefPolicy.ONE,
  })
}

/**
 * One day on day index 0 opening at clock minute `start`, so a scheduler minute
 * is its clock minute, with the 22:00 hard end. 20 general and 4 video strips,
 * no caps. Timings measured on this config (018 T2 probe), relative to the
 * day's start: 100 fencers single-stage – pools 0–109, DE 140–320; 24 fencers
 * single-stage – pools 0–86, DE 120–200; 64 fencers staged – pools 0–100,
 * prelims 130–190, R16 220–300.
 */
export function windowFrom(start: number): TournamentConfig {
  return makeConfig({
    days_available: 1,
    strips: makeStrips(20, 4),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    dayConfigs: [{ day_start_time: start, day_end_time: Math.max(start, SEVEN_PM), day_hard_end_time: TEN_PM }],
  })
}
