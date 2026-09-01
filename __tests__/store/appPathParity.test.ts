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
 * Every number below was measured on 2026-08-31 after the axis fix landed
 * (T006/T008, commit b20f351347), not predicted. The classification behind
 * each exception is `specs/006-day-axis-parity/parity-exceptions.md`; the
 * short form lives beside the number here so a reader who only opens this
 * file still learns why it is what it is.
 *
 * B2's `24` and B8's `53` were re-measured on 2026-08-31 by feature 008
 * (T004, T008/T009), against 008's own code rather than 006's axis fix. B8's
 * classification is `specs/008-team-event-cut/b8-residual.md`, alongside
 * this file's existing pointer to `parity-exceptions.md`.
 *
 * **All eight were re-measured on 2026-09-01 by 004 US4 (T063a)**, against the
 * post-D5/D6/D7/T061a tree, and every number below is what that run reported
 * rather than what it was hoped to report. Two moved: B4 16 → **0**, which is
 * the ledger's own count, so its FR-004a exception is gone; and B6 43 → **39**,
 * which is one further from the ledger, not nearer. B8 did not move off 53.
 * The account of both movements is `specs/004-p3-workbench-shell/drift-baseline.md`
 * §T062 and commit `29aabc9031`.
 *
 * **No exception below is attributable to the day axis** (FR-004a's hard
 * limit, SC-002). That was established per row by isolation, not by argument:
 * holding the competitions fixed and swapping only the config — the app's
 * 1440-spaced day windows for the ledger's empty `dayConfigs`, and back —
 * moves no count on any row, while holding the config fixed and swapping the
 * per-competition defaults reproduces the other path's count exactly.
 */

/**
 * The drift ledger's `scheduledCount` per scenario — the target parity is
 * measured against, carried from baseline.md's ledger column and unchanged
 * by this feature (FR-005). Where a pin below differs from its entry here,
 * `PARITY_EXCEPTIONS` must say why.
 */
const LEDGER_SCHEDULED_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 0, B5: 12, B6: 44, B7: 18, B8: 52,
}

interface ParityException {
  /** What the app path places today, and what `PINNED_APP_PATH_COUNTS` asserts. */
  appPath: number
  /** What the drift ledger records for the same tournament. */
  ledger: number
  /** The per-competition default that accounts for the whole difference. */
  cause: string
  /** The isolation run that established `cause`, and the source lines it implicates. */
  evidence: string
  /** The feature that closes it, after which this entry is deleted and the pin moves. */
  closedBy: string
}

/**
 * FR-004a exceptions. Admissible only for a per-competition default the two
 * paths have not converged on; a day-axis difference is a contract violation,
 * not an exception (contracts/day-axis.md C5).
 *
 * 006 recorded three, all at the same seam: `defaultConfigForId`
 * (`src/store/store.ts`) and `buildConfig.ts` build a competition differently
 * from the ledger's factory (`__tests__/helpers/scenarios.ts:44-72`).
 *
 * **Two remain after 004 US4 (T063a), and the seam has flipped sides.** US4
 * closed the divergence that had the store *understating* demand — T061a gave
 * `buildConfig.ts` the ledger's own `max(2, ceil(n/7))` pre-allocation, and
 * `strips_allocated` now differs on zero events of B6 and zero of B8. What is
 * left is the reverse: the store resolves `cut_mode` and `de_mode` **per
 * tournament type** (`REGIONAL_CUT_OVERRIDES`, and `data-model.md`'s per-type
 * table — `AUTO` → `STAGED` at NAC, `SINGLE_STAGE` elsewhere) while the
 * ledger's factory derives them **per event** from the catalogue's category
 * and video policy. Neither remaining exception closes by another change to
 * `src/`: each closes by the ledger's factory adopting the store's per-type
 * resolutions, which moves the drift ledger's own recorded counts and is
 * therefore a constitution III change with its own snapshot review — see each
 * entry's `closedBy`.
 */
const PARITY_EXCEPTIONS: Partial<Record<ScenarioId, ParityException>> = {
  /**
   * B6 moved **away** from the ledger under US4: 43 → 39 against the ledger's
   * unchanged 44. That is not a regression to hunt. T061a's pre-allocated
   * strips made all-advance regional brackets cost the real strip-hours that
   * `strips_allocated: 0` had been hiding, and B6 re-packed at its capacity
   * margin — 8 events out, 4 in, `validateFeasibility` clean on both sides.
   * Isolated and recorded in commit `29aabc9031` and in
   * `specs/004-p3-workbench-shell/drift-baseline.md` §T062.
   *
   * Two per-competition defaults still differ, both of them the store
   * resolving per tournament type where the ledger's factory resolves per
   * event:
   *
   * - **cut_mode / cut_value, on 18 of 54 events.** B6 is an ROC, so
   *   `buildConfig.ts` applies `REGIONAL_CUT_OVERRIDES` — all-advance for
   *   Y14/Cadet/Junior/Div1 — which the engine's own rule requires
   *   (`src/engine/validation.ts:256-267`). The ledger's factory does not
   *   apply it and cuts at 20% (`scenarios.ts:50-52`). **The app is the
   *   correct side**, and the ledger's 44 is measured on a config the engine
   *   itself flags.
   * - **de_mode, on 12 of 54 events.** US4 resolves `de_mode` from the
   *   per-type table (`data-model.md` §Per-type default table): ROC →
   *   `SINGLE_STAGE`. The ledger derives `STAGED` per event from a REQUIRED
   *   video policy (`scenarios.ts:66-68`). The two rules disagree wherever a
   *   REQUIRED-video individual event sits at a non-NAC type.
   *
   * `strips_allocated` is **no longer among them** — T061a adopted the
   * ledger's `max(2, ceil(n/7))` and it now differs on zero of the 54.
   * `ref_policy` differs on all 54 (the app's resolved `ONE` against the
   * ledger's unresolved `AUTO`, which is D5 working) but is inert on
   * placement — swapping it alone leaves 39.
   */
  B6: {
    appPath: 39,
    ledger: 44,
    cause: 'the ledger\'s factory applies neither per-type resolution the store now ships: it cuts B6\'s Y14/Cadet/Junior/Div1 events at 20% where buildConfig.ts forces the regional all-advance override (18 of 54 events), and it stages DEs per event from a REQUIRED video policy where US4 resolves de_mode per tournament type, ROC to SINGLE_STAGE (12 of 54). T061a moved this pin 43 → 39 by a capacity re-pack, so the gap is wider than 006 recorded, not narrower',
    evidence: 'measured at T063a: 39 on the app\'s config and 39 on the ledger\'s, against the ledger\'s 44 on either config — the axis stays uninvolved. Of the fields still differing, swapping in the ledger\'s de_mode alone reaches exactly 44, its cut_mode alone overshoots to 54, cut_value alone stays 39, and swapping every differing field reaches 44. strips_allocated and de_video_policy differ on zero events',
    closedBy: 'a follow-up feature, unnumbered and named in docs/design/backlog.md as "The drift ledger\'s factory does not apply the store\'s per-type resolutions": the ledger\'s factory (__tests__/helpers/scenarios.ts) adopts REGIONAL_CUT_OVERRIDES and the per-type de_mode table. It cannot close in 004 US4 — scenarios.ts is the comparison point T062 diffs against, and changing it moves the drift ledger\'s own recorded counts, a constitution III change owing its own snapshot review',
  },

  /**
   * B8 held at 53 against the ledger's 52 — re-measured at T063a, not
   * assumed. The 006/008 record (`specs/008-team-event-cut/b8-residual.md`)
   * attributed the +1 jointly to `de_mode` **and** `strips_allocated`, each
   * necessary and neither sufficient. **US4 closed one half and inverted the
   * other**, and the two changes cancel at the count while changing the
   * cause underneath it:
   *
   * - `strips_allocated` now differs on **zero** of the 53 events. T061a
   *   adopted the ledger's `max(2, ceil(n/7))`, so half of b8-residual.md's
   *   conjunction is gone.
   * - `de_mode` now differs on **41**, and in the opposite direction. B8 is a
   *   NAC, so US4's per-type table (`data-model.md`) resolves all 53 to
   *   `STAGED`; the ledger's per-event rule stages only the 12 Div1 and
   *   Junior individuals whose video policy is REQUIRED. 53 − 12 = 41. The
   *   app was the `SINGLE_STAGE` side before and is the `STAGED` side now.
   *
   * So B8 was never going to reach 52 through US4: 52 is what
   * `b8-residual.md` P1 measured under the **ledger's** per-event staging
   * rule, and US4 shipped the per-type rule instead — a different assignment
   * of `de_mode` to events, not a failed attempt at the same one. That is a
   * decided difference in rules, not a shortfall against a target.
   *
   * `cut_mode` remains closed at zero differing events (008's
   * `defaultCutForEntry`, and `REGIONAL_CUT_OVERRIDES` never applies at a
   * NAC on either side). `ref_policy` differs on all 53 — resolved `TWO`
   * against unresolved `AUTO` — but both score two refs per pool
   * (`src/engine/pools.ts:170-175`), and swapping it alone leaves 53.
   */
  B8: {
    appPath: 53,
    ledger: 52,
    cause: 'de_mode is now the whole gap, and it is the two paths applying different rules rather than one lagging the other: US4 resolves de_mode from the per-type table (NAC → STAGED, all 53 events) while the ledger derives it per event from a REQUIRED video policy (12 events staged), so 41 of 53 differ. b8-residual.md\'s second cause, strips_allocated, closed in T061a and now differs on zero events',
    evidence: 'measured at T063a: 53 on the app\'s config and 53 on the ledger\'s, against the ledger\'s 52 on either config. Swapping in the ledger\'s de_mode alone now takes the app path to 52 — sole and sufficient, where b8-residual.md R2/R3/P1 measured it as necessary-but-not-sufficient alongside strips_allocated. cut_mode, cut_value, strips_allocated and de_video_policy differ on zero of the 53',
    closedBy: 'the same follow-up as B6 — "The drift ledger\'s factory does not apply the store\'s per-type resolutions" in docs/design/backlog.md, unnumbered: the ledger\'s factory (__tests__/helpers/scenarios.ts:66-68) adopts the per-type de_mode table in place of its per-event video derivation. Not 004 US4: that would edit the comparison point T062 diffs against, moving the drift ledger\'s own recorded counts under constitution III',
  },
}

/**
 * What the app path places today, measured (T011, re-measured T063a), one
 * number per scenario. **Six** now equal their ledger count — B4 joined them
 * at 0 — and two are the FR-004a exceptions above, gated exactly as the six
 * are: a different pinned number, never an unasserted one.
 *
 * A second copy of B4's and B6's pins lives in
 * `__tests__/helpers/appPath.test.ts`'s `BASELINE`, which proves the harness
 * rather than the parity contract. The duplication is deliberate — that file
 * must be able to fail on its own — but the two move together, so a task that
 * re-measures one re-measures both.
 */
const PINNED_APP_PATH_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 0, B5: 12, B6: 39, B7: 18, B8: 53,
}

describe('app-path parity with the drift ledger (contracts/day-axis.md C5)', () => {
  it.each(SCENARIO_IDS)('%s places its pinned app-path count', (id) => {
    const exception = PARITY_EXCEPTIONS[id]
    const result = runAppPath(id)
    expect(
      result.placedCount,
      exception
        ? `${id}: app path placed ${result.placedCount}, pinned at ${PINNED_APP_PATH_COUNTS[id]} `
          + `(FR-004a exception — ledger records ${exception.ledger}; ${exception.cause}; closed by ${exception.closedBy})`
        : `${id}: app path placed ${result.placedCount}, ledger scheduledCount is ${LEDGER_SCHEDULED_COUNTS[id]}`,
    ).toBe(PINNED_APP_PATH_COUNTS[id])
  })

  /**
   * The pins and the exception table have to keep agreeing with each other.
   * Without this, a future edit could quietly move a pin off its ledger count
   * with no exception recorded — which is the whole thing FR-004a exists to
   * prevent — or leave a stale exception behind after US4 closes one.
   */
  it.each(SCENARIO_IDS)('%s: pinning off the ledger\'s count requires a recorded FR-004a exception', (id) => {
    const pinned = PINNED_APP_PATH_COUNTS[id]
    const ledger = LEDGER_SCHEDULED_COUNTS[id]
    const exception = PARITY_EXCEPTIONS[id]

    if (pinned === ledger) {
      expect(
        exception,
        `${id}: pinned at the ledger's ${ledger}, so it must carry no FR-004a exception`,
      ).toBeUndefined()
      return
    }

    expect(
      exception,
      `${id}: pinned at ${pinned} against the ledger's ${ledger} with no exception recorded. `
        + 'FR-004a admits a different number only with the ledger\'s count, the cause, and the closing feature beside it.',
    ).toBeDefined()
    expect(exception?.appPath, `${id}: the exception's appPath must be the pinned number`).toBe(pinned)
    expect(exception?.ledger, `${id}: the exception's ledger count must be the ledger's`).toBe(ledger)
    expect(exception?.cause.length, `${id}: the exception must state its cause`).toBeGreaterThan(0)
    expect(exception?.evidence.length, `${id}: the exception must state the isolation run behind its cause`).toBeGreaterThan(0)

    // Until T063a this read `.toContain('004 US4')`, because every exception
    // 006 recorded was expected to close there. Two do not: B6 and B8 both
    // close by the ledger's factory adopting the store's per-type
    // resolutions, which 004 US4 deliberately does not touch. Naming one
    // feature forever would have forced the choice between a false `closedBy`
    // and deleting the check — so the check keeps what it was actually for,
    // which is that no exception is parked without an owner, and drops the
    // part that named which owner. A blank or placeholder `closedBy` still
    // fails (008 T010 / issue #255 anticipated exactly this relaxation).
    const closedBy = exception?.closedBy?.trim() ?? ''
    expect(
      closedBy.length,
      `${id}: the exception must name the feature that closes it — FR-004a admits a gap only with an owner beside it`,
    ).toBeGreaterThan(0)
    expect(
      closedBy,
      `${id}: "${closedBy}" is a placeholder, not a closing feature`,
    ).not.toMatch(/^(tbd|todo|none|n\/a|unassigned|unknown|\?+|-+)$/i)
    // 004 US4 T067 — the placeholder list above rejects a fixed set of words,
    // so `closedBy: 'later'` or 'a future feature' passed it, and "the named
    // owner actually exists somewhere a reader can find it" rested entirely on
    // this comment. The owner has to be locatable, which in this repo means a
    // backlog entry or a spec directory. Both current values name
    // docs/design/backlog.md's "The drift ledger's factory does not apply the
    // store's per-type resolutions".
    expect(
      closedBy,
      `${id}: "${closedBy}" names no locatable artifact. An owner a reader cannot open is `
        + 'the same parked exception FR-004a forbids — point at a docs/design/backlog.md entry or a specs/ directory.',
    ).toMatch(/backlog\.md|specs\//)
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
