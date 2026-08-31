import { describe, it, expect } from 'vitest'
import { runAppPath } from './appPath.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'

/**
 * Proves the harness itself before anything downstream (T005's parity test,
 * T003's callers) relies on it: it reproduces baseline.md's app-path numbers
 * exactly, and resetting the store between scenarios means sequential calls
 * do not contaminate each other.
 */
describe('runAppPath', () => {
  // baseline.md "Raw output from the measurement run" — captured pre-change,
  // at the commit this feature branched from.
  const BASELINE: Record<string, { selected: number; placed: number }> = {
    B1: { selected: 24, placed: 11 },
    B2: { selected: 24, placed: 0 },
    B3: { selected: 24, placed: 9 },
    B4: { selected: 30, placed: 8 },
    B5: { selected: 12, placed: 9 },
    B6: { selected: 54, placed: 19 },
    B7: { selected: 18, placed: 3 },
    B8: { selected: 53, placed: 0 },
  }

  it.each(SCENARIO_IDS)('reproduces baseline.md\'s app-path numbers for %s', (id) => {
    const result = runAppPath(id)
    expect(result.selectedCount).toBe(BASELINE[id].selected)
    expect(result.placedCount).toBe(BASELINE[id].placed)
  })

  it('reproduces baseline.md\'s B1 ref_requirements_by_day (all peaks on day 0, pre-fix)', () => {
    const result = runAppPath('B1')
    expect(result.refRequirementsByDay).toEqual([
      { day: 0, peak_total_refs: 134, peak_saber_refs: 112, peak_time: 480 },
      { day: 1, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 },
      { day: 2, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 },
      { day: 3, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 },
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
