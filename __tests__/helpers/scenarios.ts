/**
 * B1–B8 scenario builders — real USA Fencing tournament event schedules,
 * built into `Competition`/config values test suites can run the engine on.
 *
 * Shared by `integration.test.ts` (constraint assertions) and
 * `driftLedger.test.ts` (behavior-drift snapshots). Both must measure the same
 * tournament, so the builders below live in exactly one place. This file is
 * not a test file — it holds no `describe`/`it`, because importing a module
 * that registers tests would re-register them in the importing suite.
 *
 * The roster data itself lives in `src/data/tournaments.ts` (research.md D6):
 * it is app-consumable, while `buildCompetitions`/`tournamentConfig` below
 * depend on test factories that must not ship in app code.
 */
import {
  EventType, DeMode, VideoPolicy, CutMode,
} from '../../src/engine/types.ts'
import type { Competition, TournamentType } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { makeStrips, makeConfig, makeCompetition } from './factories.ts'

export { SCENARIO_IDS, SCENARIOS } from '../../src/data/tournaments.ts'
export type { ScenarioId, ScenarioFixture } from '../../src/data/tournaments.ts'

export function buildCompetitions(fencerCounts: Record<string, number>): Competition[] {
  return Object.entries(fencerCounts).map(([id, fencerCount]) => {
    const entry = findCompetition(id)
    if (!entry) throw new Error(`Catalogue entry not found: ${id}`)

    const isTeam = entry.event_type === EventType.TEAM
    const cut = isTeam
      ? { mode: CutMode.DISABLED, value: 100 }
      : DEFAULT_CUT_BY_CATEGORY[entry.category]
    const videoPolicy = DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]

    return makeCompetition({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,
      fencer_count: fencerCount,
      cut_mode: cut.mode,
      cut_value: cut.value,
      de_video_policy: videoPolicy,
      de_mode: (!isTeam && videoPolicy === VideoPolicy.REQUIRED)
        ? DeMode.STAGED
        : DeMode.SINGLE_STAGE,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

export function tournamentConfig(
  days: number, strips: number, videoStrips: number,
  tournamentType: TournamentType,
) {
  return makeConfig({
    days_available: days,
    strips: makeStrips(strips, videoStrips),
    tournament_type: tournamentType,
  })
}
