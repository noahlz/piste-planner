import { DeMode, EventType, RefPolicy, TournamentType, VideoPolicy } from '../engine/types.ts'
import type {
  EventType as EventTypeValue,
  TournamentType as TournamentTypeValue,
} from '../engine/types.ts'

/**
 * Per-type resolved defaults — METHODOLOGY.md §Tournament-Type Policies,
 * transcribed row for row. `ref_policy: RefPolicy.AUTO` and a `null` video
 * strip count are the *unset* markers a competition config carries before
 * resolution (research D5, D6, D7); this table holds only resolved values,
 * so `ref_policy` here is never `AUTO`.
 *
 * `individual_video_policy` is what an individual event plans with: REQUIRED at
 * a NAC and BEST_EFFORT at every other type (Ops Manual 2026-27 p.19; 024 plan
 * D9). A team event ignores it, see `resolveVideoPolicy`.
 */
export interface TypeDefaults {
  ref_policy: RefPolicy
  video_strips_total: number
  de_mode: DeMode
  individual_video_policy: VideoPolicy
}

export const TYPE_DEFAULTS: Record<TournamentTypeValue, TypeDefaults> = {
  [TournamentType.NAC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 8, de_mode: DeMode.STAGED,
    individual_video_policy: VideoPolicy.REQUIRED,
  },
  [TournamentType.SJCC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.SYC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.ROC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RYC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RJCC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
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
 * An individual event follows the tournament type's row, whatever its
 * category (METHODOLOGY.md §Tournament-Type Policies; 024 D9): REQUIRED at a
 * NAC, BEST_EFFORT elsewhere.
 *
 * `buildConfig.ts` calls this, and `__tests__/helpers/scenarios.ts` keeps its
 * own transcription of the same rule on purpose (024 D11).
 */
export function resolveVideoPolicy(
  tournamentType: TournamentTypeValue,
  eventType: EventTypeValue,
): VideoPolicy {
  if (eventType === EventType.TEAM) return VideoPolicy.BEST_EFFORT
  return TYPE_DEFAULTS[tournamentType].individual_video_policy
}
