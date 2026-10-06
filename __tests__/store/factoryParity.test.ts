import { isDeepStrictEqual } from 'node:util'
import { describe, it, expect } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { SCENARIO_IDS, SCENARIOS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'
import { TournamentType, VideoPolicy } from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'

/**
 * Pins the ledger's factory (`buildCompetitions`, `tournamentConfig`) to the
 * app path's own build of the same tournament, field by field. It sits beside
 * `appPathParity.test.ts` because that test stays the only cover for the
 * placement filter and the day axis, while a count cannot see every
 * difference here: `ref_policy` moves no count, and B4's cut and DE mode
 * cancel at it.
 *
 * Never schedules: only `applyPreset` and `buildTournamentConfig` run.
 */

/**
 * The ledger keeps the engine's own day axis (empty `dayConfigs`), and
 * converging it would rewrite every time in the snapshot for no behavior
 * change. 006's whole-config swaps moved no count.
 *
 * The generic field loop skips these keys, but the difference is not ignored:
 * the scenario test asserts the ledger side is `[]` and the app side holds one
 * window per day. The app's windows are checked by count only, so a wrong
 * window time on the app side does not fail here.
 */
const ALLOWED_CONFIG_DIFFS: ReadonlySet<string> = new Set(['dayConfigs'])

/**
 * Display only – equality is `isDeepStrictEqual`. Sorted-key JSON that prints
 * non-finite numbers by name, so Infinity is not 9999 and not null, and quotes
 * top-level strings, so a failure prints "310" against 310.
 */
function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value !== 'object' || value === null) return String(value)
  const canonical = (v: unknown): unknown => {
    if (typeof v === 'number' && !Number.isFinite(v)) return String(v)
    if (Array.isArray(v)) return v.map(canonical)
    if (typeof v === 'object' && v !== null) {
      return Object.fromEntries(
        Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
      )
    }
    return v
  }
  return JSON.stringify(canonical(value))
}

function unionKeys(a: object, b: object): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
}

function appPathBuild(id: ScenarioId, tournamentType?: TournamentType) {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset(id)
  if (tournamentType !== undefined) useStore.getState().setTournamentType(tournamentType)
  return buildTournamentConfig(useStore.getState())
}

/**
 * Every difference between the two competition lists: their ids and order, then
 * the first event at which each field differs. Fields compare by
 * `isDeepStrictEqual`, so 310 and '310' differ.
 */
function competitionDiffs(ledger: Competition[], app: Competition[]): string[] {
  const diffs: string[] = []

  const ledgerIds = ledger.map((c) => c.id)
  const appIds = app.map((c) => c.id)
  if (!isDeepStrictEqual(ledgerIds, appIds)) {
    diffs.push(`competition ids/order: ledger=${show(ledgerIds)} app=${show(appIds)}`)
  }

  const appById = new Map(app.map((c) => [c.id, c]))
  const firstDiff = new Map<string, { eventId: string, ledger: string, app: string }>()
  for (const ledgerComp of ledger) {
    const appComp = appById.get(ledgerComp.id)
    if (!appComp) continue
    const l = ledgerComp as unknown as Record<string, unknown>
    const a = appComp as unknown as Record<string, unknown>
    for (const key of unionKeys(l, a)) {
      if (isDeepStrictEqual(l[key], a[key]) || firstDiff.has(key)) continue
      firstDiff.set(key, { eventId: ledgerComp.id, ledger: show(l[key]), app: show(a[key]) })
    }
  }
  for (const [field, d] of firstDiff) {
    diffs.push(`${field} (first at ${d.eventId}): ledger=${d.ledger} app=${d.app}`)
  }
  return diffs
}

describe('factory parity with the app-path build', () => {
  it.each(SCENARIO_IDS)('%s: ledger factory builds what the app path builds', (id) => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
    const app = appPathBuild(id)
    const ledgerCompetitions = buildCompetitions(fencerCounts, tournamentType)
    const ledgerConfig = tournamentConfig(days, strips, videoStrips, tournamentType)

    expect(ledgerCompetitions.length, `${id}: no competitions built`).toBeGreaterThan(0)

    const diffs = competitionDiffs(ledgerCompetitions, app.competitions)

    const lc = ledgerConfig as unknown as Record<string, unknown>
    const ac = app.config as unknown as Record<string, unknown>
    for (const key of unionKeys(lc, ac)) {
      if (ALLOWED_CONFIG_DIFFS.has(key) || isDeepStrictEqual(lc[key], ac[key])) continue
      diffs.push(`config.${key}: ledger=${show(lc[key])} app=${show(ac[key])}`)
    }

    expect(diffs, `${id}: factory differs from the app path`).toEqual([])
    expect(ledgerConfig.dayConfigs, `${id}: ledger keeps the engine's empty day axis`).toEqual([])
    expect(app.config.dayConfigs, `${id}: app builds one day window per day`).toHaveLength(days)
  })

  /**
   * B1–B8 cover only four tournament types, so this rebuilds B1's roster under
   * every type down both paths to reach the other rows of the factory's
   * per-type table. Competitions only: the config side is the scenario test's.
   * The regional cut data and DEFAULT_CUT_BY_CATEGORY are shared by both paths,
   * so parity cannot catch a wrong row in them. `__tests__/engine/constants.test.ts`
   * pins the exact contents of all three tables (REGIONAL_CUT_OVERRIDES,
   * REGIONAL_CUT_TOURNAMENT_TYPES, DEFAULT_CUT_BY_CATEGORY), so a wrong or
   * added row is caught there (024 plan D8).
   */
  it.each(Object.values(TournamentType))('%s: factory per-type rules match the app path on B1\'s roster', (type) => {
    const app = appPathBuild('B1', type)
    expect(useStore.getState().tournament_type, `${type}: store took the type`).toBe(type)
    expect(competitionDiffs(buildCompetitions(SCENARIOS.B1.fencerCounts, type), app.competitions)).toEqual([])
  })
})

/**
 * The video rule is a deliberate second copy (024 plan D9 and D11): the
 * factory's `TYPE_RULES` column against the store's `TYPE_DEFAULTS` and
 * `resolveVideoPolicy`. Each row builds one event down both paths and pins the
 * policy to a literal, so a drift in either copy fails here and a drift in both
 * together still fails on the literal. The three rows reach the cases B1–B8
 * leave thin: a NAC youth individual event (REQUIRED, where the category table
 * said BEST_EFFORT), a NAC team event (BEST_EFFORT, the owner's team ruling),
 * and an SJCC Cadet event (BEST_EFFORT, where the category table said
 * REQUIRED). METHODOLOGY.md §Tournament-Type Policies, §Video Replay Policy.
 */
describe('factory parity on the video rule', () => {
  const FENCER_COUNT = 64
  const ROWS: readonly (readonly [string, TournamentType, string, VideoPolicy])[] = [
    ['a NAC youth individual event', TournamentType.NAC, 'Y12-M-FOIL-IND', VideoPolicy.REQUIRED],
    ['a NAC team event', TournamentType.NAC, 'CDT-M-FOIL-TEAM', VideoPolicy.BEST_EFFORT],
    ['an SJCC Cadet event', TournamentType.SJCC, 'CDT-M-FOIL-IND', VideoPolicy.BEST_EFFORT],
  ]

  it.each(ROWS)('plans %s the same way down both paths', (_label, type, id, expected) => {
    useStore.setState(useStore.getInitialState(), true)
    useStore.getState().setTournamentType(type)
    useStore.getState().selectCompetitions([id])
    useStore.getState().updateCompetition(id, { fencer_count: FENCER_COUNT })

    const app = buildTournamentConfig(useStore.getState()).competitions
    const ledger = buildCompetitions({ [id]: FENCER_COUNT }, type)

    expect(app.map((c) => c.de_video_policy), 'app path').toEqual([expected])
    expect(ledger.map((c) => c.de_video_policy), 'ledger factory').toEqual([expected])
    expect(competitionDiffs(ledger, app)).toEqual([])
  })
})
