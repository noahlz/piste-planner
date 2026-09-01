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

/**
 * The video strip count a store field resolves to. `null` alone means "follow
 * the tournament type's default" (research D7); `??` and not `||` because `0`
 * is a legitimate explicit value — a tournament with no video strips — and must
 * survive rather than resolve to a NAC's 8.
 *
 * The rule's only home. `buildConfig.ts` resolves it for the engine, and the
 * rail's two panels — `StripSetup`'s count field and `AdvancedPanel`'s summary
 * — both display it, so a second copy anywhere is a second answer to one
 * question (constitution §Planning Artifacts). Nothing here writes back to the
 * store (FR-036): a later tournament type change re-resolves the same `null`
 * against the new type.
 */
export function resolveVideoStrips(
  videoStripsTotal: number | null,
  tournamentType: TournamentTypeValue,
): number {
  return videoStripsTotal ?? TYPE_DEFAULTS[tournamentType].video_strips_total
}
