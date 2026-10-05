import { describe, it, expect } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { SCENARIO_IDS, SCENARIOS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'

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
 */
const ALLOWED_CONFIG_DIFFS: ReadonlySet<string> = new Set(['dayConfigs'])

/** Sorted-key JSON that prints non-finite numbers by name, so Infinity is not 9999 and not null. */
function show(value: unknown): string {
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

function appPathBuild(id: ScenarioId) {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset(id)
  return buildTournamentConfig(useStore.getState())
}

describe('factory parity with the app-path build', () => {
  it.each(SCENARIO_IDS)('%s: ledger factory builds what the app path builds', (id) => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
    const app = appPathBuild(id)
    const ledgerCompetitions = buildCompetitions(fencerCounts, tournamentType)
    const ledgerConfig = tournamentConfig(days, strips, videoStrips, tournamentType)

    expect(ledgerCompetitions.length, `${id}: no competitions built`).toBeGreaterThan(0)
    expect(ledgerCompetitions.length, `${id}: competition count vs fencerCounts`)
      .toBe(Object.keys(fencerCounts).length)

    const diffs: string[] = []

    const ledgerIds = ledgerCompetitions.map((c) => c.id)
    const appIds = app.competitions.map((c) => c.id)
    if (show(ledgerIds) !== show(appIds)) {
      diffs.push(`competition ids/order: ledger=${show(ledgerIds)} app=${show(appIds)}`)
    }

    const appById = new Map(app.competitions.map((c) => [c.id, c]))
    const firstDiff = new Map<string, { eventId: string, ledger: string, app: string }>()
    for (const ledgerComp of ledgerCompetitions) {
      const appComp = appById.get(ledgerComp.id)
      if (!appComp) continue
      const l = ledgerComp as unknown as Record<string, unknown>
      const a = appComp as unknown as Record<string, unknown>
      for (const key of unionKeys(l, a)) {
        if (show(l[key]) === show(a[key]) || firstDiff.has(key)) continue
        firstDiff.set(key, { eventId: ledgerComp.id, ledger: show(l[key]), app: show(a[key]) })
      }
    }
    for (const [field, d] of firstDiff) {
      diffs.push(`${field} (first at ${d.eventId}): ledger=${d.ledger} app=${d.app}`)
    }

    const lc = ledgerConfig as unknown as Record<string, unknown>
    const ac = app.config as unknown as Record<string, unknown>
    for (const key of unionKeys(lc, ac)) {
      if (ALLOWED_CONFIG_DIFFS.has(key) || show(lc[key]) === show(ac[key])) continue
      diffs.push(`config.${key}: ledger=${show(lc[key])} app=${show(ac[key])}`)
    }

    expect(diffs, `${id}: factory differs from the app path`).toEqual([])
  })
})
