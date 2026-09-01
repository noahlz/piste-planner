import { DeMode, RefPolicy, TournamentType } from '../engine/types.ts'
import type { TournamentType as TournamentTypeValue } from '../engine/types.ts'

/**
 * Per-type resolved defaults — data-model.md §Per-type default table,
 * transcribed row for row. `ref_policy: RefPolicy.AUTO` and a `null` video
 * strip count are the *unset* markers a competition config carries before
 * resolution (research D5, D6, D7); this table holds only resolved values,
 * so `ref_policy` here is never `AUTO`.
 */
export interface TypeDefaults {
  ref_policy: RefPolicy
  video_strips_total: number
  de_mode: DeMode
}

export const TYPE_DEFAULTS: Record<TournamentTypeValue, TypeDefaults> = {
  [TournamentType.NAC]: { ref_policy: RefPolicy.TWO, video_strips_total: 8, de_mode: DeMode.STAGED },
  [TournamentType.SJCC]: { ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.SYC]: { ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.ROC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RYC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RJCC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
}
