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
 * clock-axis conversion back) moved these numbers off the specs/006-day-axis-parity/baseline.md (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md)
 * pre-fix column. Each entry below carries the pre-fix number in a comment
 * so the before/after stays legible — per specs/006-day-axis-parity/baseline.md's (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md) own count, that was
 * the whole defect this feature exists to fix. B2 and B8 now place their
 * ledger counts too, but not from this feature's axis fix — feature
 * 008-team-event-cut gave team events the all-advance `cut_mode` the engine
 * requires, closing the last BINDING error that zeroed both
 * (specs/008-team-event-cut/ (removed; git show 0ab5bd2dc9:specs/008-team-event-cut/)).
 *
 * 004 US4's T061a then moved two of them again — see `BASELINE` below.
 */
describe('runAppPath', () => {
  // Measured post-fix on 2026-08-31 via
  // `timeout 120 pnpm --silent vitest run __tests__/helpers/appPath.test.ts`.
  // Pre-fix numbers (specs/006-day-axis-parity/baseline.md "Raw output from the measurement run" (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md),
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
  //
  // 010 L9, 2026-09-05 — B6's placed count moved 39 → 40, re-measured on this
  // branch, and nothing else in the table moved. T019 emptied
  // `CROSSOVER_GRAPH[Y8]`, which drops Y8's constraint-graph edges to Y10 (0.8)
  // and, through `buildPenaltyMatrix`'s two-hop derivation, to Y12 (0.3). B6 is
  // the only scenario carrying Y8 events, its three Y8 women's events rotate
  // days under the freed coloring, and one more event clears its deadline. The
  // drift ledger's own B6 count moved by the same +1 (44 → 45), so the parity
  // gap is unchanged at 5.
  //
  // 011 T006, 2026-09-05 — B4's placed count moved 0 → 18, re-measured on this
  // branch, and nothing else in the table moved. T004 demoted
  // `feasibility-strip-hours` to a WARN in every mode, so the upfront gate no
  // longer aborts B4's build and it packs again.
  //
  // The drift ledger reads 18 too. Its factory applies the regional cut
  // override and the per-type DE mode since 015, so the one-event gap 011
  // recorded against the ledger's 17 is closed and B4 carries no FR-004a
  // exception (specs/015-ledger-convergence/plan.md). This file pins numbers
  // and `__tests__/store/appPathParity.test.ts` pins the contract.
  //
  // 015, 2026-10-05 – B6's gap closed. The ledger now reads 40, as the app path
  // does, because 015's factory applies the app's per-type cut, DE mode and
  // referee policy. B6's placed count here did not move.
  //
  // 024 group A, 2026-10-06 – B4's placed count moved 18 → 19 and B6's 40 → 50,
  // re-measured on this branch, with the parity file's pins and the ledger's
  // counts in the same commit. The 2026-27 Operations Manual planning times
  // (pool of 7, DEs derived per round from bout time, team events single stage
  // without video) shorten most events, so more fit their days
  // (specs/024-ops-manual-conformance/plan.md §Group A).
  //
  // 024 group B, 2026-10-06 – B8's placed count moved 53 → 52, with the parity
  // file's pins and the ledger's count in the same commit: the 9:00 start loses
  // JR-W-EPEE-IND on both paths, because the day's hard window shrinks from 840
  // to 780 minutes (Ops Manual 2026-27 p.17, METHODOLOGY.md §Inputs and
  // §Same-Day Completion; specs/024-ops-manual-conformance/plan.md §Group B).
  //
  // 024 group D, 2026-10-06 – B4's placed count moved 19 → 21, B6's 50 → 45 and
  // B8's 52 → 53, with the parity file's pins and the ledger's counts in the
  // same commit. The Ops Manual p.20 same-day rules (Group 1 by tournament
  // type, the Junior–Cadet rest day removed, Group 2, Group 3, first and last
  // days planned shorter) re-colour the days: B8 places JR-W-EPEE-IND again
  // (METHODOLOGY.md §Overlapping-Population Separation and §First and Last Day
  // Capacity; specs/024-ops-manual-conformance/plan.md §Group D).
  const BASELINE: Record<string, { selected: number; placed: number }> = {
    B1: { selected: 24, placed: 24 }, // pre-fix: 11
    B2: { selected: 24, placed: 24 }, // pre-fix: 0 (closed by 008-team-event-cut, not the day axis)
    B3: { selected: 24, placed: 24 }, // pre-fix: 9
    B4: { selected: 30, placed: 21 }, // pre-fix: 8; 16 until T061a fired the upfront gate; 0 until 011 T004 demoted it; 18 until 024 group A; 19 until 024 group D – the ledger reads the same since 015 (see above)
    B5: { selected: 12, placed: 12 }, // pre-fix: 9
    B6: { selected: 54, placed: 45 }, // pre-fix: 19; 43 until T061a re-packed it at the capacity margin (8 out, 4 in, validateFeasibility clean either side — commit 29aabc9031); 39 until 010 T019 removed the Y8→Y10 penalty; 40 until 024 group A; 50 until 024 group D (seven out, two in)
    B7: { selected: 18, placed: 18 }, // pre-fix: 3
    B8: { selected: 53, placed: 53 }, // pre-fix: 0 (closed by 008-team-event-cut, not the day axis); unmoved by US4; 53 until 024 group B (JR-W-EPEE-IND lost to the 9:00 start); 52 until 024 group D placed it again
  }

  // specs/006-day-axis-parity/baseline.md (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md)
  it.each(SCENARIO_IDS)('reproduces baseline.md\'s app-path numbers for %s', (id) => {
    const result = runAppPath(id)
    expect(result.selectedCount).toBe(BASELINE[id].selected)
    expect(result.placedCount).toBe(BASELINE[id].placed)
  })

  it('spreads B1\'s ref_requirements_by_day across all four days, post-fix', () => {
    // Pre-fix (specs/006-day-axis-parity/baseline.md (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md)): all 134 peak refs landed on day 0, days 1-3 read
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
    // specs/004-p3-workbench-shell/drift-baseline.md §T062 (removed; git show 0ab5bd2dc9:specs/004-p3-workbench-shell/drift-baseline.md).
    //
    // 010 L1, 2026-09-05 — six of the twelve numbers moved and all four
    // peak_time values held. T018 wired PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS
    // into colorPenalty, which had never read it: the adjacent-day loop's
    // `if (dayGap !== 1) continue` excluded every gap of 3 or more. Six of B1's
    // VET events change day under the new term, since VETERAN↔VETERAN carries
    // proximity weight 1.0, so each day now holds a different set of events and
    // therefore a different concurrent ref demand. The peak *times* are
    // unchanged because the day windows themselves did not move, only their
    // membership. Day 3 absorbs the sabre load the reshuffle displaces, which is
    // why both of its numbers rise the most.
    //
    // 024 group A, 2026-10-06 – day 1's peak moved 186 → 210 (2025 → 1980) and
    // day 3's peak time 4905 → 4860, its count held. The 2026-27 Operations
    // Manual planning times re-time every pool and DE, so the overlapping
    // windows `computePostScheduleRefDemand` sweeps move, and with them the
    // minute each peak falls on. Planning measured the 210 independently
    // (specs/024-ops-manual-conformance/plan.md §Group A).
    //
    // 024 group B, 2026-10-06 – every peak time moved 60 minutes later and
    // every count held. The day now starts at 9:00 (540), not 8:00 (Ops Manual
    // 2026-27 p.17, METHODOLOGY.md §Inputs), and B1 places the same 24 events
    // on the same days, so each day's schedule shifts whole: days 0 and 2 peak
    // at their day start, d × 1440 + 540 (540, 3420), day 1 peaks 60 minutes
    // after its 1980 start (1980 → 2040), and day 3's peak moves 4860 → 4920.
    //
    // 024 group D, 2026-10-06 – day 1 held, and six values (five counts and one
    // peak time) on days 0, 2 and 3 moved: day 0's sabre peak 64 → 62, day 2
    // 160/50 at 3420 → 134/56 at 3480, day 3 202/76 → 186/72 at the same 4920.
    // Group D re-colours B1's days (planning counts 13 of its 24 events
    // changed, most by the Group 3 cross-weapon preference, Ops Manual p.20 –
    // Group 3, METHODOLOGY.md §Other Soft Preferences), so each day holds a
    // different set of events and a different concurrent ref demand. Day 2 no
    // longer peaks at its day start: its peak is 60 minutes in, at
    // JR-W-EPEE-IND's 10:00 pool start (3420 + 60). At 3480 the refs are
    // 10 + 6 + 58 + 52 + 8 (VET-M-SABRE-TEAM's DE) = 134, of which only the 8
    // are sabre, and the sabre peak of 56 falls at another minute. The store's selectDerivedRefRequirements independently
    // reproduces day 0 (154/62) and day 3 (186/72).
    //
    // What this case asserts is unchanged: four days, four disjoint peak times
    // in four different day windows, none of them zero.
    const result = runAppPath('B1')
    expect(result.refRequirementsByDay).toEqual([
      { day: 0, peak_total_refs: 154, peak_saber_refs: 62, peak_time: 540 },
      { day: 1, peak_total_refs: 210, peak_saber_refs: 64, peak_time: 2040 },
      { day: 2, peak_total_refs: 134, peak_saber_refs: 56, peak_time: 3480 },
      { day: 3, peak_total_refs: 186, peak_saber_refs: 72, peak_time: 4920 },
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
