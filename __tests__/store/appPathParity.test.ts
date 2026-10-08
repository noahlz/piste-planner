import { describe, it, expect } from 'vitest'
import { runAppPath } from '../helpers/appPath.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig, buildPinnedPlacements } from '../../src/store/buildConfig.ts'
import {
  RunState,
  selectAllFindings,
  selectDerivedRefRequirements,
  selectDrawnSchedule,
  selectFooterMetrics,
} from '../../src/store/derived.ts'
import { BottleneckRule, BottleneckSeverity, DAY_AXIS_SPACING_MINS } from '../../src/engine/types.ts'
import { competitionLabel } from '../../src/lib/competitionLabels.ts'
import { phaseRequiresVideo, phaseSpans } from '../../src/engine/unseated.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { runAndPinAll, runPreset, runTemplate } from '../helpers/drawnFixtures.ts'
import { computeRefRequirements, refDemandFromSchedule } from '../../src/engine/refs.ts'
import { unseatedPhases } from '../../src/engine/unseated.ts'

/**
 * The app-path parity check (specs/006-day-axis-parity/contracts/day-axis.md C5 (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/contracts/day-axis.md), FR-004): for each of
 * the eight reference tournaments, the app's own route – `applyPreset` →
 * `buildTournamentConfig` → `scheduleAll` – must place the count the drift
 * ledger records for that tournament, unless FR-004a pins a documented
 * per-default exception (research.md D7).
 *
 * **All eight scenarios agree.** 015 converged the ledger's factory
 * (`__tests__/helpers/scenarios.ts`'s `buildCompetitions`) onto the app's
 * per-type rules – the regional cut override, the per-type DE mode and the
 * per-type referee policy – and the three FR-004a exceptions it left open
 * (B4, B6, B8) closed with it. `__tests__/store/factoryParity.test.ts` checks
 * the two builds field by field, which this file's counts cannot. The plan and
 * its measured tables are `specs/015-ledger-convergence/plan.md`.
 *
 * The day axis is not a permitted cause of any gap (FR-004a's hard limit,
 * SC-002): the ledger keeps the engine's own empty `dayConfigs` while the app
 * builds 1440-spaced day windows, and swapping one for the other moves no
 * count.
 */

/**
 * The drift ledger's `scheduledCount` per scenario – the target parity is
 * measured against, first carried from specs/006-day-axis-parity/baseline.md's (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md) ledger column.
 * Where a pin below differs from its entry here, `PARITY_EXCEPTIONS` must say
 * why.
 *
 * 010 L9, 2026-09-05 — B6 moved 44 → 45, read from the drift ledger's own
 * re-taken snapshot in the same commit (T019). It is the only entry that moved:
 * B6 is the only scenario holding Y8 events, and T019 emptied
 * `CROSSOVER_GRAPH[Y8]`.
 *
 * 011 T004/T006, 2026-09-05 — B4 moved 0 → 17, read from the drift ledger's own
 * snapshot, which T004 re-took in the commit that demoted
 * `feasibility-strip-hours` to a WARN in every mode. It is the only entry that
 * moved: B4 was the one scenario the aggregate feasibility gate emptied.
 *
 * 015, 2026-10-05 – B4 17 → 18, B6 45 → 40 and B8 52 → 53, read from the drift
 * ledger's re-taken snapshot after the ledger's factory adopted the app's
 * per-type rules. Every entry now equals its app-path pin.
 *
 * 024 group A, 2026-10-06 – B4 18 → 19 and B6 40 → 50, read from the drift
 * ledger's re-taken snapshot after the 2026-27 Operations Manual planning
 * times (pool of 7, DEs derived per round from bout time, team events single
 * stage with no video). B4: CDT-M-EPEE-IND and CDT-M-FOIL-IND out,
 * CDT-W-FOIL-IND, Y12-W-SABRE-IND and Y14-W-EPEE-IND in. B6: ten in, none out
 * (specs/024-ops-manual-conformance/plan.md §Group A). Every entry still equals
 * its app-path pin.
 *
 * 024 group B, 2026-10-06 – B8 53 → 52, read from the drift ledger's re-taken
 * snapshot: the 9:00 start loses JR-W-EPEE-IND on both paths. The day moved to
 * 9:00 with a 19:00 soft target and a 22:00 hard end (Ops Manual 2026-27 p.17,
 * METHODOLOGY.md §Inputs and §Same-Day Completion), so the hard window shrinks
 * from 840 to 780 minutes. Planning's 8:00-start control isolates the start as
 * the cause: under group B with an 8:00 start B8 places 53
 * (specs/024-ops-manual-conformance/plan.md §Group B, D3). Every entry still
 * equals its app-path pin.
 *
 * 024 group D, 2026-10-06 – B4 19 → 21, B6 50 → 45 and B8 52 → 53, read from
 * the drift ledger's re-taken snapshot after the Ops Manual p.20 same-day rules
 * (Group 1 hard at national types and windowed at regional ones, the
 * Junior–Cadet rest day removed, Group 2 and Group 3, first and last days
 * planned shorter; METHODOLOGY.md §Overlapping-Population Separation and
 * §First and Last Day Capacity). B4: CDT-W-EPEE-IND, CDT-W-FOIL-IND,
 * CDT-W-SABRE-IND and Y14-W-SABRE-IND out, six in. B6: seven out, D1A-W-EPEE-IND
 * and Y12-M-FOIL-IND in (D.1 −1, D.2 −1, D.4 −2, D.5 −1). B8: JR-W-EPEE-IND
 * placed again (specs/024-ops-manual-conformance/plan.md §Group D). Every entry
 * still equals its app-path pin.
 *
 * 018 T2, 2026-10-07 – B4 21 → 24 and B6 45 → 51, read from the drift ledger's
 * re-taken snapshot after R1: an event's last phase may now start before the
 * 22:00 hard end and end by midnight, so it is placed with a WARN instead of
 * dropped (specs/018-engine-correctness/plan.md T2). B4 gains CDT-W-FOIL-IND,
 * CDT-W-SABRE-IND and Y14-W-EPEE-IND, B6 six events. Every entry still equals
 * its app-path pin.
 *
 * The table is still typed out, but it is no longer trusted as typed: the
 * "matches the live drift ledger" test below re-measures every entry by the
 * drift ledger's own route. Until 015 it was a hand-typed copy that nothing
 * checked, which is why three stale FR-004a exceptions stayed green after the
 * ledger's real counts had moved.
 */
const LEDGER_SCHEDULED_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 24, B5: 12, B6: 51, B7: 18, B8: 53,
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
 * paths have not converged on – a day-axis difference is a contract violation,
 * not an exception (specs/006-day-axis-parity/contracts/day-axis.md C5 (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/contracts/day-axis.md)).
 *
 * **None is open.** Every gap recorded here sat at one seam: the app resolves
 * cut, DE mode and referee policy per tournament type (`src/store/buildConfig.ts`
 * and `src/store/typeDefaults.ts`), and the ledger's factory used to resolve
 * them per event. 015 gave the factory the per-type rules, transcribed from
 * the spec rather than imported from `src/store`, so a wrong row still shows
 * up as a gap here (specs/015-ledger-convergence/plan.md D1).
 *
 * The table and the consistency test below stay for the next gap: a pin that
 * leaves its ledger count must come with an entry here giving the ledger's
 * count, the isolated cause and a locatable closing feature.
 */
const PARITY_EXCEPTIONS: Partial<Record<ScenarioId, ParityException>> = {}

/**
 * What the app path places today, measured (T011, re-measured T063a), one
 * number per scenario. As of 015 all eight equal their ledger count. A pin
 * that leaves its ledger count needs an FR-004a exception above and is gated
 * exactly as the rest are: a different pinned number, never an unasserted one.
 *
 * A second copy of B4's and B6's pins lives in
 * `__tests__/helpers/appPath.test.ts`'s `BASELINE`, which proves the harness
 * rather than the parity contract. The duplication is deliberate — that file
 * must be able to fail on its own — but the two move together, so a task that
 * re-measures one re-measures both.
 *
 * 010 L9, 2026-09-05 — B6 re-measured 39 → 40 (T019 emptied
 * `CROSSOVER_GRAPH[Y8]`), and its copy in `appPath.test.ts` moved with it in
 * the same commit. No other scenario carries Y8 events, and no other pin moved.
 *
 * 011 T006, 2026-09-05 — B4 re-measured 0 → **18**, against the ledger's 17. It
 * left the equal-to-ledger group and became the third FR-004a exception, and
 * its copy in `appPath.test.ts` moved with it in the same commit. The count
 * moved because T004 demoted `feasibility-strip-hours`; the *gap* it exposed was
 * older than that and was recorded then as `PARITY_EXCEPTIONS.B4`, which 015
 * removed when the ledger reached 18 too (see the 015 line below and
 * specs/015-ledger-convergence/plan.md §B4's 18-vs-17 – isolated).
 *
 * 015, 2026-10-05 – no pin moved. The ledger moved onto them instead, and B4,
 * B6 and B8 rejoined the equal-to-ledger group (specs/015-ledger-convergence/plan.md).
 *
 * 024 group A, 2026-10-06 – B4 re-measured 18 → 19 and B6 40 → 50, the same
 * moves as the ledger's, and their copies in `appPath.test.ts` moved with them
 * in the same commit. No other pin moved.
 *
 * 024 group B, 2026-10-06 – B8 re-measured 53 → 52, the same move as the
 * ledger's: the 9:00 start loses JR-W-EPEE-IND on both paths (the 780-minute
 * hard window, Ops Manual 2026-27 p.17, METHODOLOGY.md §Same-Day Completion).
 * Its copy in `appPath.test.ts` moved with it in the same commit. No other pin
 * moved.
 *
 * 024 group D, 2026-10-06 – B4 re-measured 19 → 21, B6 50 → 45 and B8 52 → 53,
 * the same moves as the ledger's under the Ops Manual p.20 same-day rules
 * (specs/024-ops-manual-conformance/plan.md §Group D). Their copies in
 * `appPath.test.ts` moved with them in the same commit. No other pin moved.
 *
 * 018 T2, 2026-10-07 – B4 re-measured 21 → 24 and B6 45 → 51, the same moves as
 * the ledger's after R1 (the last phase may run past the hard end, placed with
 * a WARN). Their copies in `appPath.test.ts` move with them in the same commit.
 * No other pin moved.
 */
const PINNED_APP_PATH_COUNTS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 24, B5: 12, B6: 51, B7: 18, B8: 53,
}

// specs/006-day-axis-parity/contracts/day-axis.md C5 (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/contracts/day-axis.md)
describe('app-path parity with the drift ledger (day-axis C5)', () => {
  /**
   * `LEDGER_SCHEDULED_COUNTS` is re-measured here by the same route as the
   * drift ledger (`runScenario` and `scheduledCount` in
   * `__tests__/engine/driftLedger.test.ts`) – `scheduleAll` over
   * `buildCompetitions` plus `tournamentConfig`, counting the schedule's keys.
   * This test repeats those calls inline rather than calling the ledger's
   * functions, so a later change to `runScenario` needs the same change here.
   */
  it.each(SCENARIO_IDS)('%s: LEDGER_SCHEDULED_COUNTS matches the live drift ledger', (id) => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
    const { schedule } = scheduleAll(
      buildCompetitions(fencerCounts, tournamentType),
      tournamentConfig(days, strips, videoStrips, tournamentType),
    )
    const live = Object.keys(schedule).length
    expect(
      live,
      `${id}: the drift ledger schedules ${live} but LEDGER_SCHEDULED_COUNTS says ${LEDGER_SCHEDULED_COUNTS[id]}. `
        + 'The table is stale – re-measure it, then re-check every pin and FR-004a exception against the new count.',
    ).toBe(LEDGER_SCHEDULED_COUNTS[id])
  })

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
    assertPinAgreesWithLedger(id, PINNED_APP_PATH_COUNTS[id], LEDGER_SCHEDULED_COUNTS[id], PARITY_EXCEPTIONS[id])
  })

  /**
   * research.md D1, second symptom: with all four of B1's day windows
   * coincident on the absolute axis, `findDayForTime` resolves every
   * allocation to day 0, so referee demand collapses onto day one instead of
   * being spread across the tournament's four days. specs/006-day-axis-parity/baseline.md (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md) measured
   * this exactly: day 0 carries all 134 peak refs, days 1–3 read zero.
   *
   * B1 is the scenario specs/006-day-axis-parity/baseline.md (removed; git show 0ab5bd2dc9:specs/006-day-axis-parity/baseline.md) measured this on, and it is the boot
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

/**
 * The consistency test's whole per-scenario decision: a pin on its ledger count
 * carries no exception, and a pin off it carries a well-formed one. It lives in
 * a helper so the describes below can exercise both branches while
 * `PARITY_EXCEPTIONS` is empty – otherwise nothing runs them until the next gap
 * opens, and a broken check would wave that gap through.
 *
 * What this does not prove: that the per-scenario test above actually calls it,
 * or calls it with the right tables and exception. With `PARITY_EXCEPTIONS`
 * empty and every pin equal to its ledger count, a no-op in place of that call
 * leaves the suite green. So do passing the pin table twice, swapping pinned and
 * ledger, or passing undefined for the exception, because every scenario agrees
 * either way. That is inherent while all eight scenarios agree. The pin table
 * and the ledger table are each tied to a live run by their own tests, and only
 * this call relates the two tables.
 */
function assertPinAgreesWithLedger(
  id: string,
  pinned: number,
  ledger: number,
  exception: ParityException | undefined,
): void {
  if (pinned === ledger) {
    expect(
      exception,
      `${id}: pinned at the ledger's ${ledger}, so it must carry no FR-004a exception`,
    ).toBeUndefined()
    return
  }
  assertWellFormedException(id, exception, pinned, ledger)
}

/** The FR-004a exception checks, run for any pin that leaves its ledger count. */
function assertWellFormedException(
  id: string,
  exception: ParityException | undefined,
  pinned: number,
  ledger: number,
): void {
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
  // backlog entry or a spec directory.
  expect(
    closedBy,
    `${id}: "${closedBy}" names no locatable artifact. An owner a reader cannot open is `
      + 'the same parked exception FR-004a forbids — point at a docs/design/backlog.md entry or a specs/ directory.',
  ).toMatch(/backlog\.md|specs\//)
}

/** One well-formed off-ledger exception, shared by both synthetic describes below. */
const SYNTHETIC_PINNED = 18
const SYNTHETIC_LEDGER = 17
const WELL_FORMED_EXCEPTION: ParityException = {
  appPath: SYNTHETIC_PINNED,
  ledger: SYNTHETIC_LEDGER,
  cause: 'per-type DE mode',
  evidence: 'isolation probe: DE mode alone moves the count',
  closedBy: 'docs/design/backlog.md §Ledger convergence',
}

describe('an FR-004a exception must be well formed', () => {
  it.each([
    ['a backlog entry', WELL_FORMED_EXCEPTION.closedBy],
    ['a spec directory', 'specs/015-ledger-convergence'],
  ])('accepts an exception whose closedBy points at %s', (_, closedBy) => {
    expect(() => assertWellFormedException(
      'BX', { ...WELL_FORMED_EXCEPTION, closedBy }, SYNTHETIC_PINNED, SYNTHETIC_LEDGER,
    )).not.toThrow()
  })

  // Each row names the message its own check produces, so a row fails if that
  // check is removed and a later one catches the input instead. Every input
  // breaks only its own field, and the helper's check order makes that field's
  // check the first to fail.
  it.each<[string, ParityException | undefined, RegExp]>([
    ['no exception recorded', undefined, /with no exception recorded/],
    ['appPath differs from the pin', { ...WELL_FORMED_EXCEPTION, appPath: SYNTHETIC_PINNED + 1 }, /appPath must be the pinned number/],
    ['ledger differs from the ledger count', { ...WELL_FORMED_EXCEPTION, ledger: SYNTHETIC_LEDGER + 1 }, /ledger count must be the ledger's/],
    ['an empty cause', { ...WELL_FORMED_EXCEPTION, cause: '' }, /must state its cause/],
    ['empty evidence', { ...WELL_FORMED_EXCEPTION, evidence: '' }, /isolation run behind its cause/],
    ['a blank closedBy', { ...WELL_FORMED_EXCEPTION, closedBy: '' }, /must name the feature that closes it/],
    ['a placeholder closedBy', { ...WELL_FORMED_EXCEPTION, closedBy: 'TBD' }, /is a placeholder/],
    ['an unlocatable closedBy', { ...WELL_FORMED_EXCEPTION, closedBy: 'later' }, /names no locatable artifact/],
  ])('rejects %s', (_, exception, message) => {
    expect(() => assertWellFormedException('BX', exception, SYNTHETIC_PINNED, SYNTHETIC_LEDGER)).toThrow(message)
  })
})

describe('a pin may leave its ledger count only with an exception', () => {
  // The off-ledger fixture is the well-formed one, so this describe cannot drift
  // from the shape the first describe proves acceptable.
  const offLedgerException = WELL_FORMED_EXCEPTION

  it('rejects an off-ledger pin with no exception', () => {
    expect(() => assertPinAgreesWithLedger('BX', SYNTHETIC_PINNED, SYNTHETIC_LEDGER, undefined))
      .toThrow(/with no exception recorded/)
  })

  it('accepts an off-ledger pin with a well-formed exception', () => {
    expect(() => assertPinAgreesWithLedger('BX', SYNTHETIC_PINNED, SYNTHETIC_LEDGER, offLedgerException))
      .not.toThrow()
  })

  it('rejects an on-ledger pin still carrying a leftover exception', () => {
    expect(() => assertPinAgreesWithLedger('BX', SYNTHETIC_LEDGER, SYNTHETIC_LEDGER, offLedgerException))
      .toThrow(/must carry no FR-004a exception/)
  })

  it('accepts an on-ledger pin with no exception', () => {
    expect(() => assertPinAgreesWithLedger('BX', SYNTHETIC_LEDGER, SYNTHETIC_LEDGER, undefined)).not.toThrow()
  })
})

/**
 * 016 review focus 5: a run that had to break a hard edge. Every
 * `hard-separation-violated` pair the scheduler reports for the app's own
 * config must also appear in the app's findings after `runScheduleAll`, as a
 * row naming both events – the hand-placement check reads the placements the
 * run wrote back, so it must reach the same verdict.
 *
 * B1–B8 break no hard edge (measured in 016 Task A), so their loop holds
 * vacuously and is kept only so a scenario that starts breaking one is
 * checked. The NAC Cadet/Junior template at 3 days / 80 strips / 12 video
 * breaks hard pairs through the app config (six today, pinned in
 * `concurrentScheduler.test.ts`'s hard-edge suite), and is the case that
 * actually exercises the check. A pair matches only an app row on the same
 * day, so a row that names the pair on the wrong day counts as missing.
 */
describe('a hard pair the scheduler breaks reaches the app\'s findings (016 review focus 5)', () => {
  type HardPair = { pair: string[]; day: number | undefined }

  /** Scheduler pairs (with their day) for the store's current config, and the ones the app's findings miss after a run. */
  function hardPairsAfterRun(): { pairs: HardPair[]; missing: HardPair[] } {
    const { config, competitions } = buildTournamentConfig(useStore.getState())
    const pairs = scheduleAll(competitions, config).bottlenecks
      .filter((b) => b.rule === BottleneckRule.HARD_SEPARATION_VIOLATED)
      .map((b) => ({ pair: [...b.subjects].sort(), day: b.day }))

    runScheduleAll()
    const appIds = selectAllFindings(useStore.getState())
      .map((row) => row.id)
      .filter((id) => id.startsWith(`analysis:${BottleneckRule.HARD_SEPARATION_VIOLATED}:`))
    const missing = pairs.filter(
      ({ pair, day }) => !appIds.some((id) => id.endsWith(`:${pair.join('+')}:${day ?? '-'}`)),
    )
    return { pairs, missing }
  }

  it.each(SCENARIO_IDS)('%s: every scheduler hard-separation pair shows in the app after a run', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    applyPreset(id)

    const { missing } = hardPairsAfterRun()
    expect(Object.keys(useStore.getState().placements).length, 'premise: the run placed events').toBe(PINNED_APP_PATH_COUNTS[id])
    expect(missing).toEqual([])
  })

  // 019 R4: Div1/Junior broke no hard pair here while its cross-level pair was relaxable.
  it.each(['NAC Cadet/Junior', 'NAC Div1/Junior'])('%s at 3 days / 80 strips / 12 video: every broken pair shows in the app after a run', (template) => {
    useStore.setState(useStore.getInitialState(), true)
    const state = () => useStore.getState()
    state().applyTemplate(template)
    state().setDays(3) // hand-lowered board: 3 days set after the template, below its 4
    state().setStrips(80)
    state().setVideoStrips(12)

    const { pairs, missing } = hardPairsAfterRun()
    expect(pairs.length, 'the template must break hard pairs, or this check is vacuous').toBeGreaterThan(0)
    expect(missing).toEqual([])
  })
})

/**
 * 016 Task E (spec §5, R5): one referee number. After a run, the footer's
 * per-day referee figures (`selectDerivedRefRequirements`, from the schedule
 * as the workbench draws it) equal the scheduler's own
 * `ref_requirements_by_day` on every B1–B8 day.
 *
 * The store's `peak_time` is on the clock axis of its day, the engine's on the
 * scheduler axis (day d shifted by d × DAY_AXIS_SPACING_MINS), so the store's
 * is shifted onto the scheduler axis before comparing. A day with no demand
 * reads peak_time 0 on both sides and is compared unshifted.
 *
 * Before Task E this comparison is red on 14 days: the 13 days of B1, B2, B4,
 * B6, B7 and B8 where the totals differ (spec §'What planning measured', whose
 * table counts totals only), plus B8 day 1, where the total held at 146 and
 * only peak_saber_refs differed (56 vs 64). The scheduler counted phases at the
 * times it allocated them, the store at the times it draws them.
 *
 * 017 T9 (spec §7) keeps the parity and moves both sides onto the scheduler's
 * timeline: the scheduler counts its own results less `unseatedPhases`, and the
 * footer counts the drawn model, which right after a run is that timeline.
 */
describe('the footer\'s referee peak is the scheduler\'s (016 Task E)', () => {
  /** The footer's per-day figures, with each non-empty day's peak_time moved onto the scheduler axis. */
  const footerOnSchedulerAxis = () => selectDerivedRefRequirements(useStore.getState()).map((row) => ({
    ...row,
    peak_time: row.peak_total_refs > 0 ? row.peak_time + row.day * DAY_AXIS_SPACING_MINS : row.peak_time,
  }))

  it.each(SCENARIO_IDS)('%s: every day\'s referee requirements match the scheduler\'s', (id) => {
    const engine = runAppPath(id).refRequirementsByDay
    expect(footerOnSchedulerAxis()).toEqual(engine)
  })

  // Both sides count the scheduler's result for a pinned event: the footer
  // reads it from the kept run while the event sits where kept. They agree
  // only while the run honors the pin's day, start and strip count, which
  // this case holds it to, since otherwise the event no longer sits where kept
  // and the footer draws it derived.
  it.each(['B1', 'B2', 'B6', 'B8'] as const)('%s: the two still match with four hand-moved pins', (id) => {
    runAppPath(id)
    const moved = Object.keys(useStore.getState().placements).slice(0, 4)
    expect(moved, 'premise: the run placed at least four events').toHaveLength(4)
    moved.forEach((eventId, i) => {
      useStore.getState().updatePlacement(eventId, { day: i % 2, start_time: 600 + 45 * i, strip_count: 3 + i })
    })
    const pins = Object.fromEntries(moved.map((eventId) => [eventId, useStore.getState().placements[eventId]]))

    runScheduleAll()
    const after = useStore.getState().placements
    expect(Object.fromEntries(moved.map((eventId) => [eventId, after[eventId]])), 'the run kept every pin').toEqual(pins)

    // The same inputs runScheduleAll just passed the engine, pins included.
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const engine = scheduleAll(competitions, config, buildPinnedPlacements(state)).ref_requirements_by_day ?? []
    expect(footerOnSchedulerAxis()).toEqual(engine)
  })

  /**
   * 017 T9 (spec §7): a pinned phase the engine could not seat holds no strips,
   * so neither side counts referees for it. B8's pin-all re-run leaves 48
   * phases unseated (unseated.test.ts), enough that counting them would move
   * the peak.
   */
  it('a pinned phase the run could not seat counts no referees on either side', () => {
    runAndPinAll('B8')
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const run = scheduleAll(competitions, config, buildPinnedPlacements(state))
    const unseated = unseatedPhases(run)
    expect(unseated.size, 'premise: the pin-all re-run leaves phases unseated').toBeGreaterThan(0)

    const sweep = (skip: ReadonlySet<string>) => computeRefRequirements(
      refDemandFromSchedule(Object.values(run.schedule), config, competitions, skip),
      config.days_available,
    )
    expect(sweep(unseated), 'premise: counting the unseated phases would move a peak').not.toEqual(sweep(new Set()))

    expect(run.ref_requirements_by_day).toEqual(sweep(unseated))
    expect(footerOnSchedulerAxis()).toEqual(run.ref_requirements_by_day)
  })
})

/**
 * 017 T5a (spec §4, §Pass conditions): the footer counts what the drawn model
 * leaves unplaced. Right after a run every event the engine placed is kept on
 * its own strips, so the footer reads the engine's scheduled and unscheduled
 * counts. Before T5a the footer counted the lane packer's overflow over
 * derived times and read 15/9, 13/11, 14/10, 11/19, 8/4, 17/37, 11/7, 30/23.
 */
describe('the footer counts the engine\'s placements at boot (017 T5a)', () => {
  const BOOT_FOOTERS: Record<ScenarioId, { placed: number; unplaced: number }> = {
    B1: { placed: 24, unplaced: 0 },
    B2: { placed: 24, unplaced: 0 },
    B3: { placed: 24, unplaced: 0 },
    B4: { placed: 24, unplaced: 6 },
    B5: { placed: 12, unplaced: 0 },
    B6: { placed: 51, unplaced: 3 },
    B7: { placed: 18, unplaced: 0 },
    B8: { placed: 53, unplaced: 0 },
  }

  it.each(SCENARIO_IDS)('%s reads its pinned boot footer, equal to the engine\'s counts', (id) => {
    const { footer, placedCount, selectedCount } = runAppPath(id)
    const { placed, unplaced } = footer
    expect({ placed, unplaced }).toEqual(BOOT_FOOTERS[id])
    expect({ placed, unplaced }, 'the engine\'s scheduled and unscheduled counts')
      .toEqual({ placed: placedCount, unplaced: selectedCount - placedCount })
  })

  /**
   * Referee ordering (plan, Global constraints): T5a moved what the footer
   * counts as unplaced, never the referee peak.
   *
   * 017 T9, 2026-10-07 – B1 218 → 210, B2 244 → 240, B4 104 → 88, B6 112 → 78
   * and B8 236 → 212, B3, B5 and B7 held. The footer and the scheduler now
   * count the scheduler's own timeline (METHODOLOGY.md §Ref Demand Derivation,
   * spec §7), waits included, so a DE delayed for strips no longer overlaps the
   * pools it waited behind. These are the drift ledger's pre-016 peaks
   * (b84be7e291), the maximum over each scenario's days.
   *
   * 018 T2, 2026-10-07 – B4 88 → 96, the rest held. R1 places three more B4
   * events past the old day end (a last phase may run past the 22:00 hard end),
   * and their referees count: B4's day 1 total went 80 → 96 and day 2 80 → 94
   * in `refs.test.ts`. B6's six new events add no peak (78 holds).
   */
  const BOOT_REF_PEAKS: Record<ScenarioId, number> = {
    B1: 210, B2: 240, B3: 226, B4: 96, B5: 118, B6: 78, B7: 228, B8: 212,
  }

  it.each(SCENARIO_IDS)('%s keeps its boot referee peak', (id) => {
    runAppPath(id)
    const refs = selectFooterMetrics(useStore.getState()).find((m) => m.id === 'refs:peak-total')
    expect(refs?.value).toBe(BOOT_REF_PEAKS[id])
  })
})

/**
 * 017 T5b (spec §Pass conditions, "Boot invariants"): on B1–B8 and all 10
 * templates, right after a run, the board the app draws is the scheduler's own
 * run, read straight off a second `scheduleAll` over the same inputs (the run
 * had no pins, so the inputs are identical, as `runAppPath` relies on).
 *
 * The drawn-model invariants held from T4 on and must pass before and after.
 * The first and last day WARN is the failing-first part: until T5b the rule
 * check ran over `deriveEventSchedule` times, whose DEs start without the
 * scheduler's waits, so the app's rows differed from the scheduler's on B4–B8
 * (measured 2026-10-07: B4 0 rows against the scheduler's 1, B5 2 against 0,
 * B6 1 against 0, B7 1 against 0, B8 2 against 1). A mismatch after T5b halts
 * to the owner for attribution.
 */
describe('boot invariants: the drawn board is the scheduler\'s run (017 T5b)', () => {
  const FIRST_LAST_RULES: string[] = [
    BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE,
    BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
  ]
  const BOARDS: { name: string; boot: () => void }[] = [
    ...SCENARIO_IDS.map((id) => ({ name: id as string, boot: () => runPreset(id) })),
    ...Object.keys(TEMPLATES).map((name) => ({ name, boot: () => runTemplate(name) })),
  ]

  /** The scheduler's run over the store's current inputs, which at boot carry no pins. */
  function schedulerRun() {
    const state = useStore.getState()
    expect(buildPinnedPlacements(state), 'premise: a boot run has no pins').toEqual([])
    const { config, competitions } = buildTournamentConfig(state)
    return { config, competitions, run: scheduleAll(competitions, config) }
  }

  it.each(BOARDS.map((b) => [b.name, b] as const))('%s: every drawn phase is the scheduler\'s, seated, on its own strips (must pass before and after)', (_, board) => {
    board.boot()
    const { config, competitions, run } = schedulerRun()
    const model = selectDrawnSchedule(useStore.getState())
    const byId = new Map(competitions.map((c) => [c.id, c]))

    // The scheduler's phases on the clock axis, and its strips per phase.
    const expected = new Map<string, { start: number; end: number; strips: number[] }>()
    for (const [id, result] of Object.entries(run.schedule)) {
      const shift = result.assigned_day * DAY_AXIS_SPACING_MINS
      for (const span of phaseSpans(result)) {
        expected.set(`${id}|${span.phase}`, { start: span.start - shift, end: span.end - shift, strips: [] })
      }
    }
    const allocationMismatches: string[] = []
    run.strip_allocations.forEach((allocations, strip) => {
      for (const a of allocations) {
        const phase = expected.get(`${a.event_id}|${a.phase}`)
        const shift = run.schedule[a.event_id].assigned_day * DAY_AXIS_SPACING_MINS
        if (phase === undefined || a.start_time - shift !== phase.start || a.end_time - shift !== phase.end) {
          allocationMismatches.push(`${a.event_id} ${a.phase} on ${strip}`)
          continue
        }
        phase.strips.push(strip)
      }
    })
    expect(allocationMismatches, 'every allocation is one of the result\'s phases, at its times').toEqual([])

    expect(model.runState).toBe(RunState.FRESH)
    expect(model.blocks.filter((b) => b.unseated).map((b) => `${b.competitionId} ${b.phase}`), 'unseated phases').toEqual([])
    // Sorted keys, not just a count: a phase drawn twice and another missing
    // would keep the count.
    expect(
      model.blocks.map((b) => `${b.competitionId}|${b.phase}`).sort(),
      'one block per scheduler phase',
    ).toEqual([...expected.keys()].sort())
    for (const block of model.blocks) {
      const phase = expected.get(`${block.competitionId}|${block.phase}`)
      expect(
        { start: block.startMinutes, end: block.endMinutes, strips: block.strips },
        `${block.competitionId} ${block.phase}`,
      ).toEqual(phase && { start: phase.start, end: phase.end, strips: [...phase.strips].sort((a, b) => a - b) })
    }

    const overlaps: string[] = []
    const videoOff: string[] = []
    const held = new Map<string, { start: number; end: number; who: string }[]>()
    for (const block of model.blocks) {
      const who = `${block.competitionId} ${block.phase}`
      const competition = byId.get(block.competitionId)
      if (competition && phaseRequiresVideo(block.phase, competition)) {
        if (block.strips.some((s) => !config.strips[s].video_capable)) videoOff.push(who)
      }
      for (const strip of block.strips) {
        const key = `${block.day}|${strip}`
        const intervals = held.get(key) ?? []
        for (const other of intervals) {
          if (block.startMinutes < other.end && other.start < block.endMinutes) overlaps.push(`${who} / ${other.who} on day ${block.day} strip ${strip}`)
        }
        intervals.push({ start: block.startMinutes, end: block.endMinutes, who })
        held.set(key, intervals)
      }
    }
    expect(overlaps, 'strip-index overlaps per day').toEqual([])
    expect(videoOff, 'video-required phases off video').toEqual([])
  })

  it.each(BOARDS.map((b) => [b.name, b] as const))('%s: the app\'s first and last day WARN equal the scheduler\'s', (_, board) => {
    board.boot()
    const { run } = schedulerRun()
    const scheduler = run.bottlenecks
      .filter((b) => FIRST_LAST_RULES.includes(b.rule))
      .map((b) => `${b.rule} day ${b.day}: ${b.message}`)
    const app = selectAllFindings(useStore.getState())
      .flatMap((row) => {
        const [source, rule, , , day] = row.id.split(':')
        return source === 'analysis' && FIRST_LAST_RULES.includes(rule) ? [`${rule} day ${day}: ${row.message}`] : []
      })
    expect(app).toEqual(scheduler)
  })

  // 018 R3: the app's overrun rows are the scheduler's phase-overruns-day-end
  // WARNs. The one difference is the message, which names the event by its
  // label in the app and by its id in the scheduler.
  it.each(BOARDS.map((b) => [b.name, b] as const))('%s: the app\'s phase-overruns-day-end rows equal the scheduler\'s WARNs', (_, board) => {
    board.boot()
    const { competitions, run } = schedulerRun()
    const labels = new Map(competitions.map((c) => [c.id, competitionLabel(c)]))
    const scheduler = run.bottlenecks
      .filter((b) => b.rule === BottleneckRule.PHASE_OVERRUNS_DAY_END && b.severity === BottleneckSeverity.WARN)
      .map((b) => ({ rule: b.rule, target: b.competition_id, day: b.day, message: b.message }))
    const app = selectAllFindings(useStore.getState())
      .filter((row) => row.id.split(':')[1] === BottleneckRule.PHASE_OVERRUNS_DAY_END)
      .map((row) => ({
        rule: row.id.split(':')[1],
        target: row.target,
        day: row.day,
        message: row.message.replace(labels.get(row.target!)!, row.target!),
      }))
    expect(app).toEqual(scheduler)
  })
})
