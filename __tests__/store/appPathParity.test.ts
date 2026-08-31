import { describe, it, expect } from 'vitest'
import { runAppPath } from '../helpers/appPath.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'

/**
 * The app-path parity check (contracts/day-axis.md C5, FR-004): for each of
 * the eight reference tournaments, the app's own route — `applyPreset` →
 * `buildTournamentConfig` → `scheduleAll` — must place the count the drift
 * ledger records for that tournament, unless FR-004a pins a documented
 * per-default exception (research.md D7).
 *
 * Pinned from baseline.md's *ledger* `scheduledCount` column — the target,
 * not the app-path column, which is the defect this feature fixes.
 *
 * B4 inverts: the ledger trips the upfront feasibility gate and schedules 0,
 * while the app path (today) schedules 8 — the only row where the app path
 * exceeds the ledger. T002/baseline.md traced this to the feasibility gate
 * seeing different aggregate demand on each path, not to the day axis.
 *
 * B6 and B8 pin below their selected counts (44 of 54, 52 of 53) because the
 * ledger itself does not place everything selected for those two — parity is
 * against the ledger's count, not against "all selected events placed".
 *
 * This test is deliberately RED until T006/T008 land the axis fix. T011
 * fills in whatever numbers are actually measured after that; these are not
 * to be edited to make a row pass before then (tasks.md standing rule: no
 * number is invented).
 */
const LEDGER_SCHEDULED_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 0, B5: 12, B6: 44, B7: 18, B8: 52,
}

describe('app-path parity with the drift ledger (contracts/day-axis.md C5)', () => {
  it.each(SCENARIO_IDS)('%s places the ledger\'s scheduled-event count', (id) => {
    const result = runAppPath(id)
    expect(
      result.placedCount,
      `${id}: app path placed ${result.placedCount}, ledger scheduledCount is ${LEDGER_SCHEDULED_COUNTS[id]}`,
    ).toBe(LEDGER_SCHEDULED_COUNTS[id])
  })

  /**
   * research.md D1, second symptom: with all four of B1's day windows
   * coincident on the absolute axis, `findDayForTime` resolves every
   * allocation to day 0, so referee demand collapses onto day one instead of
   * being spread across the tournament's four days. baseline.md measured
   * this exactly: day 0 carries all 134 peak refs, days 1–3 read zero.
   *
   * B1 is the scenario baseline.md measured this on, and it is the boot
   * preset — the tournament this symptom was originally noticed against.
   */
  it('spreads B1\'s referee requirements across its four days, not all onto day one', () => {
    const result = runAppPath('B1')
    const demandOffDayZero = result.refRequirementsByDay
      .filter(d => d.day !== 0)
      .reduce((sum, d) => sum + d.peak_total_refs, 0)

    expect(
      demandOffDayZero,
      `B1 ref_requirements_by_day: ${JSON.stringify(result.refRequirementsByDay)} — ` +
        'expected nonzero peak_total_refs on at least one day other than day 0',
    ).toBeGreaterThan(0)
  })
})
