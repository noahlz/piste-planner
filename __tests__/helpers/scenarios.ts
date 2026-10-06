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
  EventType, DeMode, RefPolicy, TournamentType, CutMode, VideoPolicy,
} from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { makeStrips, makeConfig, makeCompetition } from './factories.ts'

export { SCENARIO_IDS, SCENARIOS } from '../../src/data/tournaments.ts'
export type { ScenarioId, ScenarioFixture } from '../../src/data/tournaments.ts'

/**
 * Per-type referee policy, DE mode and individual video policy, transcribed
 * from METHODOLOGY.md §Tournament-Type Policies (video strips are not here –
 * the scenario fixture supplies them). Keyed by every `TournamentType` so a
 * missing row is a type error. The DE mode and video policy are an individual
 * event's: a team event runs Single Stage and BEST_EFFORT at every type (024 D4,
 * applied in `buildCompetitions`). The video column is REQUIRED at a NAC and
 * BEST_EFFORT elsewhere (Ops Manual 2026-27 p.19; 024 D9).
 */
const TYPE_RULES: Record<TournamentType, {
  ref_policy: RefPolicy
  de_mode: DeMode
  individual_video_policy: VideoPolicy
}> = {
  [TournamentType.NAC]: {
    ref_policy: RefPolicy.TWO, de_mode: DeMode.STAGED, individual_video_policy: VideoPolicy.REQUIRED,
  },
  [TournamentType.SJCC]: {
    ref_policy: RefPolicy.TWO, de_mode: DeMode.SINGLE_STAGE, individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.SYC]: {
    ref_policy: RefPolicy.TWO, de_mode: DeMode.SINGLE_STAGE, individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.ROC]: {
    ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE, individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RYC]: {
    ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE, individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RJCC]: {
    ref_policy: RefPolicy.ONE, de_mode: DeMode.SINGLE_STAGE, individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
}

/**
 * Six rules here are deliberate second copies of what the app derives (feature
 * 008, then 015, then 024): the team-event cut default that `src/store/competitionDefaults.ts`
 * derives, the four per-type rules – the regional cut override, the DE
 * mode, the referee policy and the individual video policy – that
 * `src/store/buildConfig.ts` applies from `src/store/typeDefaults.ts`, and the
 * team rule that `resolveDeMode` and `resolveVideoPolicy` there apply: a team
 * event is Single Stage and BEST_EFFORT at every type (024 plan D4 and D11,
 * METHODOLOGY.md §DE Modes, §Video Replay Policy). `individual_video_policy`
 * is transcribed in `TYPE_RULES` above and never read from `TYPE_DEFAULTS`
 * (024 D9 and D11, METHODOLOGY.md §Tournament-Type Policies). This factory
 * imports none of the store's helpers (`src/store/*`), and it should not
 * start to.
 *
 * `appPathParity.test.ts` and `factoryParity.test.ts` catch a store/engine
 * divergence by deriving a tournament's competitions down both paths
 * independently and comparing the results; that check only has power because
 * the two derivations do not share a source. Point any of these rules at the
 * store's helpers and the paths would agree by construction – the parity tests
 * would stop being able to fail on that rule, and a wrong row in a shared table
 * would move the ledger and the app together instead of surfacing as a parity
 * gap. That is also why the per-type table above is transcribed from the spec
 * rather than imported. The regional cut override is the exception: its step is
 * written here, but its data (`REGIONAL_CUT_OVERRIDES`,
 * `REGIONAL_CUT_TOURNAMENT_TYPES`), like `DEFAULT_CUT_BY_CATEGORY`, comes from
 * the engine constants the app and the engine's regional-cut-override rule
 * also read. Parity therefore cannot catch a wrong row in those tables.
 * `__tests__/engine/constants.test.ts` pins the exact contents of those tables
 * (024 plan D8), so a wrong or added row is caught there instead – the cost
 * specs/015-ledger-convergence/plan.md D1 accepted is now covered.
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
      // The team rule (024 D4): Single Stage and BEST_EFFORT at every type.
      // An individual event follows the type's video column (024 D9).
      de_video_policy: isTeam ? VideoPolicy.BEST_EFFORT : typeRules.individual_video_policy,
      de_mode: isTeam ? DeMode.SINGLE_STAGE : typeRules.de_mode,
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
