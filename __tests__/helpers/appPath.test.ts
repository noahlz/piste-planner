import { describe, it, expect } from 'vitest'
import { runAppPath } from './appPath.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'

/**
 * Proves the harness itself before anything downstream (T005's parity test,
 * T003's callers) relies on it: it reproduces the app path's real numbers,
 * and resetting the store between scenarios means sequential calls do not
 * contaminate each other.
 *
 * T006/T008 (buildConfig.ts's scheduler-axis emission, runActions.ts's
 * clock-axis conversion back) moved these numbers off the baseline.md
 * pre-fix column. Each entry below carries the pre-fix number in a comment
 * so the before/after stays legible — per baseline.md's own count, that was
 * the whole defect this feature exists to fix. B2 and B8 now place their
 * ledger counts too, but not from this feature's axis fix — feature
 * 008-team-event-cut gave team events the all-advance `cut_mode` the engine
 * requires, closing the last BINDING error that zeroed both
 * (specs/008-team-event-cut/).
 *
 * 004 US4's T061a then moved two of them again — see `BASELINE` below.
 */
describe('runAppPath', () => {
  // Measured post-fix on 2026-08-31 via
  // `timeout 120 pnpm --silent vitest run __tests__/helpers/appPath.test.ts`.
  // Pre-fix numbers (baseline.md "Raw output from the measurement run",
  // captured at the commit this feature branched from) in comments.
  //
  // B4's and B6's placed counts are a **second copy** of the pins in
  // `__tests__/store/appPathParity.test.ts`, held here on purpose: this file
  // proves the harness reproduces the app path's real numbers, and it has to
  // be able to fail on its own rather than inherit the parity file's table.
  // The cost of that is that the two copies must be re-measured together —
  // they were, at T063a on 2026-09-01, against the post-D5/D6/D7/T061a tree.
  // The parity file carries the FR-004a classification; this one carries only
  // the numbers.
  const BASELINE: Record<string, { selected: number; placed: number }> = {
    B1: { selected: 24, placed: 24 }, // pre-fix: 11
    B2: { selected: 24, placed: 24 }, // pre-fix: 0 (closed by 008-team-event-cut, not the day axis)
    B3: { selected: 24, placed: 24 }, // pre-fix: 9
    B4: { selected: 30, placed: 0 }, // pre-fix: 8; 16 until T061a, when pre-allocated strips restored the DE term of the feasibility estimate and the upfront gate finally fired — the ledger's own count
    B5: { selected: 12, placed: 12 }, // pre-fix: 9
    B6: { selected: 54, placed: 39 }, // pre-fix: 19; 43 until T061a re-packed it at the capacity margin (8 out, 4 in, validateFeasibility clean either side — commit 29aabc9031)
    B7: { selected: 18, placed: 18 }, // pre-fix: 3
    B8: { selected: 53, placed: 53 }, // pre-fix: 0 (closed by 008-team-event-cut, not the day axis); unmoved by US4
  }

  it.each(SCENARIO_IDS)('reproduces baseline.md\'s app-path numbers for %s', (id) => {
    const result = runAppPath(id)
    expect(result.selectedCount).toBe(BASELINE[id].selected)
    expect(result.placedCount).toBe(BASELINE[id].placed)
  })

  it('spreads B1\'s ref_requirements_by_day across all four days, post-fix', () => {
    // Pre-fix (baseline.md): all 134 peak refs landed on day 0, days 1-3 read
    // zero — findDayForTime resolved every coincident window to day 0
    // (research.md D1, second symptom). Post-fix the four day windows are
    // disjoint, so each day carries its own peak.
    //
    // 004 US4 T063 — all twelve numbers moved (was 212/64/585, 200/52/2060,
    // 204/76/3465, 142/62/4880). B1 is NAC, so of US4's four changes two reach
    // it: D6 resolves all 24 competitions' de_mode to STAGED, which replaces
    // each single DE allocation window with a DE_PRELIMS and a DE_ROUND_OF_16
    // one, and T061a pre-allocates strips_allocated, which re-packs which
    // events land on which day. `computePostScheduleRefDemand` sweeps those
    // windows, so both a different window shape and a different day membership
    // move the per-day peak and the minute it falls on. D5 cannot: NAC resolves
    // ref_policy AUTO to TWO, and resolveRefsPerPool scores both at 2 refs per
    // pool (src/engine/pools.ts:170-175). D7 cannot either: applyPreset always
    // calls setVideoStrips, so video_strips_total is never the null that
    // buildConfig.ts:60 fills in. The per-scenario account is in
    // specs/004-p3-workbench-shell/drift-baseline.md §T062.
    //
    // What this case asserts is unchanged: four days, four disjoint peak times
    // in four different day windows, none of them zero.
    const result = runAppPath('B1')
    expect(result.refRequirementsByDay).toEqual([
      { day: 0, peak_total_refs: 160, peak_saber_refs: 64, peak_time: 480 },
      { day: 1, peak_total_refs: 182, peak_saber_refs: 64, peak_time: 2025 },
      { day: 2, peak_total_refs: 156, peak_saber_refs: 46, peak_time: 3360 },
      { day: 3, peak_total_refs: 194, peak_saber_refs: 64, peak_time: 4905 },
    ])
  })

  it('gives the same scenario the same numbers on repeated calls', () => {
    const first = runAppPath('B1')
    const second = runAppPath('B1')
    expect(second.selectedCount).toBe(first.selectedCount)
    expect(second.placedCount).toBe(first.placedCount)
    expect(second.refRequirementsByDay).toEqual(first.refRequirementsByDay)
  })

  it('does not let one scenario contaminate the next', () => {
    // B8 (53 selected, 53 placed) run before B1 must not shift B1's own numbers.
    runAppPath('B8')
    const b1 = runAppPath('B1')
    expect(b1.selectedCount).toBe(BASELINE.B1.selected)
    expect(b1.placedCount).toBe(BASELINE.B1.placed)

    // And running every scenario in ledger order must reproduce every one of
    // them, not just the first and last.
    for (const id of SCENARIO_IDS) {
      const result = runAppPath(id)
      expect(result.selectedCount).toBe(BASELINE[id].selected)
      expect(result.placedCount).toBe(BASELINE[id].placed)
    }
  })
})
