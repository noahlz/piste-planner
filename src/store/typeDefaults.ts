import { DeMode, EventType, RefPolicy, TournamentType, VideoPolicy } from '../engine/types.ts'
import type {
  Category,
  EventType as EventTypeValue,
  TournamentType as TournamentTypeValue,
} from '../engine/types.ts'
import { DEFAULT_VIDEO_POLICY_BY_CATEGORY } from '../engine/constants.ts'

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
 * Strips & referees panel's video-strips field displays it, so a second copy
 * anywhere is a second answer to one question (constitution §Planning
 * Artifacts). Nothing here writes back to the store (FR-036): a later
 * tournament type change re-resolves the same `null` against the new type.
 */
export function resolveVideoStrips(
  videoStripsTotal: number | null,
  tournamentType: TournamentTypeValue,
): number {
  return videoStripsTotal ?? TYPE_DEFAULTS[tournamentType].video_strips_total
}

/**
 * The DE mode an event runs (METHODOLOGY.md §DE Modes; 024 plan D4, the
 * owner's team ruling). A team event runs Single Stage at every tournament
 * type, NACs included, even when the organizer's setting says Staged: Ops
 * Manual 2026-27 p.19 gives teams video for the gold and bronze only, so a
 * team DE has no video stage to split at. An individual event follows the
 * organizer's tournament-wide setting, `null` meaning the type's row.
 *
 * `buildConfig.ts` calls this, and `__tests__/helpers/scenarios.ts` keeps its
 * own transcription of the same rule on purpose (024 D11).
 */
export function resolveDeMode(
  tournamentType: TournamentTypeValue,
  eventType: EventTypeValue,
  deModeOverride: DeMode | null,
): DeMode {
  if (eventType === EventType.TEAM) return DeMode.SINGLE_STAGE
  return deModeOverride ?? TYPE_DEFAULTS[tournamentType].de_mode
}

/**
 * The video policy an event plans with (METHODOLOGY.md §Video Replay Policy;
 * 024 plan D4). A team event is BEST_EFFORT at every tournament type, NACs
 * included (Ops Manual 2026-27 p.19 guarantees teams video for the gold and
 * bronze only, and those are not scheduled). The policy follows the type, never
 * the DE-mode setting, so it takes no override.
 *
 * An individual event still reads the category table here. Group C replaces
 * that with a per-type column and narrows this to `(tournamentType,
 * eventType)` (024 D9), which is when the type starts to matter.
 */
export function resolveVideoPolicy(
  _tournamentType: TournamentTypeValue,
  eventType: EventTypeValue,
  category: Category,
): VideoPolicy {
  if (eventType === EventType.TEAM) return VideoPolicy.BEST_EFFORT
  return DEFAULT_VIDEO_POLICY_BY_CATEGORY[category]
}
