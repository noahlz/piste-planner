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
  EventType, DeMode, RefPolicy, TournamentType, CutMode,
} from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { makeStrips, makeConfig, makeCompetition } from './factories.ts'

export { SCENARIO_IDS, SCENARIOS } from '../../src/data/tournaments.ts'
export type { ScenarioId, ScenarioFixture } from '../../src/data/tournaments.ts'

/**
 * Per-type referee policy and DE mode, transcribed from the 004 data-model's
 * per-type default table (video strips are not here – the scenario fixture
 * supplies them). Keyed by every `TournamentType` so a missing row is a type
 * error.
 */
const TYPE_RULES: Record<TournamentType, { ref_policy: RefPolicy; de_mode: DeMode }> = {
  [TournamentType.NAC]: { ref_policy: RefPolicy.TWO, de_mode: DeMode.STAGED },
  [TournamentType.SJCC]: { ref_policy: RefPolicy.TWO, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.SYC]: { ref_policy: RefPolicy.TWO, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.ROC]: { ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RYC]: { ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RJCC]: { ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE },
}

/**
 * Four rules here are deliberate second copies of what the app derives (feature
 * 008, then 015): the team-event cut default that `src/store/competitionDefaults.ts`
 * derives, and the three per-type rules – the regional cut override, the DE
 * mode and the referee policy – that `src/store/buildConfig.ts` applies from
 * `src/store/typeDefaults.ts`. This factory imports none of them, and it should
 * not start to.
 *
 * `appPathParity.test.ts` and `factoryParity.test.ts` catch a store/engine
 * divergence by deriving a tournament's competitions down both paths
 * independently and comparing the results; that check only has power because
 * the two derivations do not share a source. Point any of these rules at the
 * store's helpers and the paths would agree by construction – the parity tests
 * would stop being able to fail on that rule, and a wrong row in a shared table
 * would move the ledger and the app together instead of surfacing as a parity
 * gap. That is also why the per-type table above is transcribed from the spec
 * rather than imported.
 *
 * See research.md D2 (008) for the full argument and the alternatives rejected.
 */
export function buildCompetitions(
  fencerCounts: Record<string, number>,
  tournamentType: TournamentType,
): Competition[] {
  const typeRules = TYPE_RULES[tournamentType]

  return Object.entries(fencerCounts).map(([id, fencerCount]) => {
    const entry = findCompetition(id)
    if (!entry) throw new Error(`Catalogue entry not found: ${id}`)

    const isTeam = entry.event_type === EventType.TEAM
    const baseCut = isTeam
      ? { mode: CutMode.DISABLED, value: 100 }
      : DEFAULT_CUT_BY_CATEGORY[entry.category]
    // Regional tournaments advance every fencer to DEs in some categories,
    // whatever the catalogue or team default would have said.
    const regionalCut = REGIONAL_CUT_TOURNAMENT_TYPES.has(tournamentType)
      ? REGIONAL_CUT_OVERRIDES[entry.category]
      : undefined
    const cut = regionalCut ?? baseCut

    return makeCompetition({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,
      fencer_count: fencerCount,
      ref_policy: typeRules.ref_policy,
      cut_mode: cut.mode,
      cut_value: cut.value,
      de_video_policy: DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category],
      de_mode: typeRules.de_mode,
      latest_end: Infinity,
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
