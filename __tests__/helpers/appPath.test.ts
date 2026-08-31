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
 * the whole defect this feature exists to fix. B2 and B8 are unchanged at 0:
 * both hit an upfront validation gate over a `de_mode`/video-policy default
 * mismatch unrelated to the day axis (research.md D7), the same gate that
 * already produced 0 before this feature. T012 is where that gets a formal
 * FR-004a classification.
 */
describe('runAppPath', () => {
  // Measured post-fix on 2026-08-31 via
  // `timeout 120 pnpm --silent vitest run __tests__/helpers/appPath.test.ts`.
  // Pre-fix numbers (baseline.md "Raw output from the measurement run",
  // captured at the commit this feature branched from) in comments.
  const BASELINE: Record<string, { selected: number; placed: number }> = {
    B1: { selected: 24, placed: 24 }, // pre-fix: 11
    B2: { selected: 24, placed: 0 }, // pre-fix: 0 (unchanged — D7 exception, not the day axis)
    B3: { selected: 24, placed: 24 }, // pre-fix: 9
    B4: { selected: 30, placed: 16 }, // pre-fix: 8
    B5: { selected: 12, placed: 12 }, // pre-fix: 9
    B6: { selected: 54, placed: 43 }, // pre-fix: 19
    B7: { selected: 18, placed: 18 }, // pre-fix: 3
    B8: { selected: 53, placed: 0 }, // pre-fix: 0 (unchanged — D7 exception, not the day axis)
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
    const result = runAppPath('B1')
    expect(result.refRequirementsByDay).toEqual([
      { day: 0, peak_total_refs: 212, peak_saber_refs: 64, peak_time: 585 },
      { day: 1, peak_total_refs: 200, peak_saber_refs: 52, peak_time: 2060 },
      { day: 2, peak_total_refs: 204, peak_saber_refs: 76, peak_time: 3465 },
      { day: 3, peak_total_refs: 142, peak_saber_refs: 62, peak_time: 4880 },
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
    // B8 (53 selected, 0 placed) run before B1 must not shift B1's own numbers.
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
