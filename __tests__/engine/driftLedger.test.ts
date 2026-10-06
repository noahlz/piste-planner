/**
 * Drift ledger — the guard rail for the P1 Foundations feature.
 *
 * Snapshots a normalized digest of `scheduleAll`'s output for each of the eight
 * B1–B8 real-tournament scenarios. Every behavior-affecting task in the feature
 * re-runs this file and reviews the diff before accepting it.
 *
 * Drift gate: a task halts if any scenario schedules FEWER events than its floor
 * below. Start-time shifts, day reassignments, and referee changes are expected
 * churn and halt nothing. The floors are asserted, not merely snapshotted — a
 * snapshot alone is defeated by `vitest -u`.
 * The two admitted floor lowerings are input correction and policy amendment,
 * both named in the `SCHEDULED_FLOORS` docblock below. Any other drop still halts.
 *
 * What is deliberately NOT in the digest: bottleneck message strings. They embed
 * times that churn for uninteresting reasons and would drown every real finding.
 * ERROR and WARN *counts* are in, the messages are out.
 */
import { describe, it, expect } from 'vitest'
import { BottleneckSeverity, Phase, ValidationMode } from '../../src/engine/types.ts'
import type {
  Bottleneck, BottleneckCause, Competition, RefRequirementsByDay, ScheduleResult, TournamentConfig,
} from '../../src/engine/types.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { validateConfig, FeasibilityRule } from '../../src/engine/validation.ts'
import { peakPoolRefDemand, peakDeRefDemand } from '../../src/engine/refs.ts'
import { recommendRefCount } from '../../src/engine/stripBudget.ts'
import { searchStripCount } from '../../src/engine/stripSearch.ts'
import { resolveRefsPerPool } from '../../src/engine/pools.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'

/**
 * Scheduled-event floors, measured on the pre-change baseline and re-measured
 * where a dated entry below says so. The constitution halts a task when any
 * scenario schedules fewer events than before, so these are asserted rather
 * than left to a reader of the snapshot diff.
 *
 * A later task may deliberately RAISE a floor when it improves packing. Lowering
 * one is the regression the gate exists to catch: never edit a floor down to make
 * a red test pass — identify the cause first, and record both counts.
 *
 * The first exception is input correction: a floor may be lowered only when the
 * ledger's own inputs were wrong, and only when all four of these hold:
 *  - the old count was measured on a configuration the app never runs
 *  - the new count equals the app path's measured count
 *  - `__tests__/store/factoryParity.test.ts` passes in the lowering commit, which
 *    proves the inputs now match. A count alone can match by coincidence, as
 *    B4's cut and DE mode showed when they cancelled.
 *  - the lowering commit records both counts and the isolation beside the floor
 *
 * The second exception is policy amendment (024's D3, owner ruling 2026-10-05):
 * a floor may be lowered when an owner-approved METHODOLOGY.md amendment causes
 * the drop, and only when all four of these hold:
 *  - the drop is confined to one rule group's commit
 *  - that commit's drift review names the amendment and the events lost, and cites
 *    what isolates the cause – in 024, a control run for group B (the 8:00-start
 *    run) and the sub-step attribution for group D
 *  - the ledger equals the app path in that commit, and
 *    `__tests__/store/factoryParity.test.ts` passes
 *  - a dated entry beside the floor records both counts
 *
 * Any other drop still halts the task.
 *
 * B4's floor was 0 for as long as the upfront `validateFeasibility` gate aborted
 * its build. 011's T004 demoted that finding to a WARN, so B4 packs again and its
 * floor rises with it (see the entry below).
 */
const SCHEDULED_FLOORS: Record<ScenarioId, number> = {
  // B6 raised 44 → 45 by 010's L9 (2026-09-05, commit 2bacf2aa8e): removing the
  // Y8→Y10 crossover edge repacked B6's oversubscribed board and placed one more
  // event. A deliberate raise under the rule above, so a later regression to 44
  // halts its own task instead of passing the gate.
  //
  // B4 raised 0 → 17 by 011's T004 (2026-09-05): `feasibility-strip-hours` is a
  // WARN in every mode now, so the aggregate estimate no longer empties the board
  // and B4 places 17 of its 30 events. Measured, not predicted. A deliberate raise
  // under the rule above — a later collapse toward 0 halts its own task instead of
  // passing the gate. T006 removed the `continue` that had kept B4 out of the
  // generic floor test below, so from T006 on this number is asserted for B4 the
  // same way it is for the other seven.
  //
  // 015, 2026-10-05 – B4 raised 17 → 18: the factory now applies the regional
  // cut and the per-type DE mode, as the app does. Measured in isolation, cut
  // alone gives 19 and DE mode alone 20, while both together give 18, equal to
  // the app path's 18. A raise under the rule above.
  //
  // 015, 2026-10-05 – B8 raised 52 → 53: the per-type DE mode alone places
  // JR-W-EPEE-IND, equal to the app path's 53. A raise under the rule above.
  //
  // 015, 2026-10-05 – B6 lowered 45 → 40, 015's one deliberate lowering, under the
  // input-correction exception above. The old 45 came from a factory that ran
  // B6 (an ROC) without the regional cut and with the wrong DE mode, a
  // configuration the app never runs. Measured in isolation: CUT alone gives 43,
  // DE mode alone 42, both 40, equal to the app path's 40. Eight events leave
  // (VET-M-EPEE-IND-VCMB, VET-W-EPEE-IND-VCMB, Y12-M-FOIL-IND, Y12-M-SABRE-IND,
  // Y12-W-SABRE-IND, D2-M-EPEE-IND, D2-M-SABRE-IND, D2-W-EPEE-IND) and three
  // arrive (D1A-W-FOIL-IND, JR-M-EPEE-IND, JR-W-SABRE-IND): the all-advance
  // brackets cost the strip-hours the 20% cut hid. See
  // specs/015-ledger-convergence/plan.md §What planning measured and §D4.
  //
  // 024, 2026-10-06 – B4 raised 18 → 19 by group A (planning times): pools
  // rebased to the pool of 7 and DEs derived per round from the 2026-27 Ops
  // Manual's bout times (METHODOLOGY §Pool Duration Estimation, §DE Duration).
  // Out CDT-M-EPEE-IND, CDT-M-FOIL-IND. In CDT-W-FOIL-IND, Y12-W-SABRE-IND,
  // Y14-W-EPEE-IND. Equal to the app path's 19. A raise under the rule above.
  //
  // 024, 2026-10-06 – B6 raised 40 → 50 by group A (planning times), the same
  // rules. In CDT-W-FOIL-IND, D2-M-EPEE-IND, D2-M-FOIL-IND, D2-M-SABRE-IND,
  // VET-M-EPEE-IND-VCMB, Y12-M-FOIL-IND, Y12-M-SABRE-IND, Y12-W-EPEE-IND,
  // Y12-W-SABRE-IND, Y14-W-EPEE-IND. None leave. Equal to the app path's 50.
  // A raise under the rule above. See specs/024-ops-manual-conformance/plan.md
  // §Group A.
  B1: 24, B2: 24, B3: 24, B4: 19, B5: 12, B6: 50, B7: 18, B8: 53,
}

/**
 * Scenarios that emit at least one `Day N refs: peak demand M.` summary line.
 *
 * B4 was absent for as long as the upfront feasibility gate aborted its build
 * before any per-day packing ran, so `postScheduleDayBreakdown` never executed
 * for it. 011's T004 demoted that finding to a WARN and B4 packs again: it emits
 * three summary lines (days 1-3, peak demand 86 / 156 / 162 at 015, 106 / 148 /
 * 170 since 024's group A)
 * and `dayPeakRefDemands` reproduces all three, so B4 joins the list rather than
 * the comment being rewritten around its absence. B1/B2/B3/B5/B7/B8 stay out
 * because they emit no summary line at all – the scheduler only writes one for
 * a day that had a failure, and those six place every event.
 *
 * 015, 2026-10-05 – B8 left the list: with the per-type DE mode it places
 * JR-W-EPEE-IND too, so it places every event and emits no summary line.
 *
 * Membership is asserted in both directions: the day-peaks test below fails if a
 * listed scenario emits no summary line or an unlisted one emits any.
 */
const SCENARIOS_WITH_DAY_SUMMARY: ScenarioId[] = ['B4', 'B6']

/** Matches the refs line built by `postScheduleDayBreakdown` in `concurrentScheduler.ts`. */
const DAY_REFS_SUMMARY = /^Day (\d+) refs: peak demand (\d+)\.$/

type EventDigest = {
  assigned_day: number
  pool_start: number | null
  pool_end: number | null
  pool_strip_count: number
  de_start: number | null
  de_prelims_start: number | null
  de_round_of_16_start: number | null
  de_total_end: number | null
  de_strip_count: number
  de_prelims_strip_count: number
  de_round_of_16_strip_count: number
  constraint_relaxation_level: number
  peak_de_ref_demand: number
}

type ScenarioDigest = {
  competitionCount: number
  scheduledCount: number
  errorCount: number
  warnCountsByCause: Partial<Record<BottleneckCause, number>>
  refRequirementsByDay: RefRequirementsByDay[] | undefined
  daySummaryPeaks: number[]
  refRecommendation: { three_weapon: number; foil_epee: number }
  // The smallest strip count that places every event — what pressing **Suggest**
  // writes into the app (`stripSearch.ts`), and the only strip number a user
  // sees. `null` is the absence of an answer, never a recommendation of 0
  // strips: either no competition on the scenario can be sized (011 FR-010, so
  // the search has no ceiling), or no count in `[floor, ceiling]` places every
  // event.
  //
  // The field is *recorded* by the ledger and *consumed* by nothing: no
  // scenario's strip count comes from it, so it has no path to move a scheduled
  // count. A scheduled count that moves alongside it means something unexamined
  // reads this number, and halts the task that moved it (research.md D7).
  stripRecommendation: number | null
  events: Record<string, EventDigest>
}

function runScenario(id: ScenarioId) {
  const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
  const competitions = buildCompetitions(fencerCounts, tournamentType)
  const config = tournamentConfig(days, strips, videoStrips, tournamentType)
  return { competitions, config, ...scheduleAll(competitions, config) }
}

/**
 * Per-day peak ref demand, recomputed the way `postScheduleDayBreakdown`
 * (`concurrentScheduler.ts`) builds its DAY_RESOURCE_SUMMARY line: each
 * competition on the day contributes the larger of its pool and DE demand.
 *
 * Recomputed rather than parsed out of the message, and computed for EVERY day —
 * the scheduler only emits a summary for days with failures, and a ledger field
 * that appears and disappears is unreviewable. The test 'day peaks match the
 * scheduler's own DAY_RESOURCE_SUMMARY line' below pins this copy of the formula
 * to the scheduler's own output.
 */
function dayPeakRefDemands(
  competitions: Competition[],
  config: TournamentConfig,
  schedule: Record<string, ScheduleResult>,
): number[] {
  const peaks: number[] = []
  for (let day = 0; day < config.days_available; day++) {
    let peakRefDemand = 0
    for (const comp of competitions) {
      if (schedule[comp.id]?.assigned_day !== day) continue
      if (comp.fencer_count <= 1) continue
      const poolDemand = peakPoolRefDemand(comp, comp.ref_policy)
      const deDemand = peakDeRefDemand(comp, config)
      peakRefDemand += Math.max(poolDemand, deDemand)
    }
    peaks.push(peakRefDemand)
  }
  return peaks
}

/**
 * Refs per pool for the scenario's `refRecommendation`, resolved from the
 * competitions' own `ref_policy`, through `resolveRefsPerPool(policy, 1)` as
 * `StripsPanel.tsx` does for **Suggest**. StripsPanel feeds it the store's
 * `TYPE_DEFAULTS[tournamentType].ref_policy` instead, and the two agree because
 * `factoryParity.test.ts` pins the factory's `ref_policy` to the store's. The
 * policy must be uniform across the scenario, since `recommendRefCount` takes a
 * single factor. A mixed scenario fails here, naming the policies seen, rather
 * than picking one silently.
 */
function scenarioRefsPerPool(id: ScenarioId, competitions: Competition[]): number {
  const policies = [...new Set(competitions.map(c => c.ref_policy))]
  if (policies.length !== 1) {
    throw new Error(`${id}: expected one ref_policy across the scenario, saw [${policies.join(', ')}]`)
  }
  return resolveRefsPerPool(policies[0], 1).refs_per_pool
}

/** WARN bottlenecks tallied by cause. Counts carry no times, so no message text leaks in. */
function warnCountsByCause(bottlenecks: Bottleneck[]): Partial<Record<BottleneckCause, number>> {
  const counts: Partial<Record<BottleneckCause, number>> = {}
  for (const b of bottlenecks) {
    if (b.severity !== BottleneckSeverity.WARN) continue
    counts[b.cause] = (counts[b.cause] ?? 0) + 1
  }
  return counts
}

/**
 * Builds the digest for one scenario. All eight tests share this — the digest
 * shape is defined in exactly one place so a field added here reaches every
 * scenario at once.
 *
 * Times stay as minutes from midnight; formatting them as clock strings would
 * hide sub-minute drift and add a second source of truth.
 */
function buildDigest(id: ScenarioId): ScenarioDigest {
  const { competitions, config, schedule, bottlenecks, ref_requirements_by_day } = runScenario(id)
  const byId = new Map(competitions.map(c => [c.id, c]))

  // Keys are emitted in sorted order. The snapshot serializer sorts object keys
  // on its own, so this does not change the snapshot — it keeps the in-memory
  // digest in the same order the snapshot shows, for anyone logging or diffing
  // it outside Vitest.
  const events: Record<string, EventDigest> = {}
  for (const eventId of Object.keys(schedule).sort()) {
    const sr = schedule[eventId]
    events[eventId] = {
      assigned_day: sr.assigned_day,
      pool_start: sr.pool_start,
      pool_end: sr.pool_end,
      pool_strip_count: sr.pool_strip_count,
      // de_start is null on staged events — only the single-stage path sets it —
      // so the two staged starts are carried separately or their movement is invisible.
      de_start: sr.de_start,
      de_prelims_start: sr.de_prelims_start,
      de_round_of_16_start: sr.de_round_of_16_start,
      de_total_end: sr.de_total_end,
      de_strip_count: sr.de_strip_count,
      de_prelims_strip_count: sr.de_prelims_strip_count,
      de_round_of_16_strip_count: sr.de_round_of_16_strip_count,
      // Holding the event count by relaxing hard separations would otherwise read
      // as "no drift" — integration.test.ts skips its separation assertions at level 3.
      constraint_relaxation_level: sr.constraint_relaxation_level,
      // The single number the pod-captain removal changes. Aggregate ref demand is
      // dominated by the pool arm, so this never surfaces in the recommendations.
      peak_de_ref_demand: peakDeRefDemand(byId.get(eventId)!, config),
    }
  }

  return {
    competitionCount: competitions.length,
    scheduledCount: Object.keys(schedule).length,
    errorCount: bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR).length,
    warnCountsByCause: warnCountsByCause(bottlenecks),
    refRequirementsByDay: ref_requirements_by_day,
    daySummaryPeaks: dayPeakRefDemands(competitions, config, schedule),
    refRecommendation: recommendRefCount(competitions, scenarioRefsPerPool(id, competitions), config),
    stripRecommendation: searchStripCount(competitions, config),
    events,
  }
}

describe('drift ledger', () => {
  // One test per scenario, so a snapshot diff names the scenario that moved.
  // Snapshot keys use the bare id rather than the fixture label: labels carry
  // event counts that would rewrite every key when a fixture is re-baselined.
  for (const id of SCENARIO_IDS) {
    it(`${id} digest is unchanged`, () => {
      expect(buildDigest(id)).toMatchSnapshot()
    })

    // B4 carries an extra pin on top of the floor test below, and it always has.
    //
    // Until 011's T004 it read "0 scheduled, 1 validation error": Ruling 11 had
    // accepted a collapse from 15 to 0, because the flat SINGLE_STAGE formula
    // raised B4's aggregate strip-hour demand past the upfront
    // `validateFeasibility` gate (validation.ts:310), which aborted the whole
    // build before any per-day packing ran. The pin existed so that collapse
    // could not deepen or evaporate unnoticed.
    //
    // T004 demoted `feasibility-strip-hours` to a WARN in every mode, so the
    // gate no longer aborts and B4 packs 17 of its 30 events. T006 keeps the
    // pin's purpose and inverts what it pins: the ONE structural fact about B4
    // is no longer "an aggregate estimate empties it" but "an aggregate estimate
    // does not empty it". So this asserts, `[M]` at T006, re-measured at 015,
    // against the real run:
    //
    //  - 18 scheduled exactly, not merely at-or-above the floor. The floor test
    //    below catches a collapse; this catches any movement in either
    //    direction, which is what the old `toBe(0)` did for the old number.
    //    015, 2026-10-05 – 17 → 18: the factory now applies the regional cut and
    //    the per-type DE mode, which together account for the +1 (cut alone 19,
    //    DE mode alone 20, both 18 – specs/015-ledger-convergence/plan.md).
    //    024, 2026-10-06 – 18 → 19: group A's pool-of-7 and per-round DE times
    //    (2026-27 Ops Manual) re-pack B4 – CDT-M-EPEE-IND and CDT-M-FOIL-IND out,
    //    CDT-W-FOIL-IND, Y12-W-SABRE-IND and Y14-W-EPEE-IND in
    //    (specs/024-ops-manual-conformance/plan.md §Group A).
    //  - no ERROR-severity validation finding at all, and in particular neither
    //    feasibility rule id among them. This reads `validateConfig` directly
    //    because it pins the severity at the source: a severity re-escalation
    //    of either feasibility rule would otherwise show up only as a
    //    scheduledCount change, and a re-escalation that happened to leave B4
    //    at 18 would be invisible. The scheduler-side assertion at the end pins
    //    the copy the scheduler's own bottlenecks carry. The literal
    //    'feasibility-strip-hours' stays on purpose, as an independent pin of
    //    the wire id. FR-001/FR-002 are what this holds.
    //  - the demoted `feasibility-strip-hours` finding is still PRESENT, as a
    //    WARN. The demotion must not become a deletion: B4's 633-strip-hour
    //    shortfall (~38%) is real and the organizer still has to be told about
    //    it. Without this the rule could be dropped outright and every other
    //    assertion here would still pass. 015, 2026-10-05 – aside: the shortfall
    //    was 481 (~29%,
    //    specs/011-feasibility-and-strip-suggestion/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/011-feasibility-and-strip-suggestion/baseline.md))
    //    before the factory took the per-type DE mode and regional cut.
    //    024, 2026-10-06 – suspended for group A only. Billing DE bouts × bout
    //    time (METHODOLOGY §DE Capacity Estimation) drops B4's demand to 1548
    //    strip-hours, under the 1680 its 14-hour days hold, so no feasibility
    //    finding fires (the ledger's RESOURCE_EXHAUSTION 7 → 6). Group B's
    //    600-minute capacity day (1200 available, 1380 with slack) brings the
    //    WARN back, and Task B restores both presence assertions. Until then the
    //    test holds only that any feasibility finding is a WARN, and never pins
    //    its absence.
    //  - no ERROR sits in Phase.VALIDATION. B4's 11 ERRORs (12 before 024's
    //    group A) are all
    //    DEADLINE_BREACH_UNRESOLVABLE from DEADLINE_CHECK — the ordinary
    //    per-event degradation of an oversubscribed board, which is spec.md
    //    §Edge Cases' accepted cost. A validation-phase ERROR returning is the
    //    shape that empties the board, and it halts here whatever its rule id.
    if (id === 'B4') {
      it('B4 packs with feasibility demoted to WARN — 19 scheduled, no validation ERROR', () => {
        const { competitions, config, bottlenecks } = runScenario(id)

        expect(buildDigest(id).scheduledCount).toBe(19)

        const findings = validateConfig(config, competitions, ValidationMode.BINDING)
        expect(findings.filter(f => f.severity === BottleneckSeverity.ERROR)).toEqual([])

        const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
        expect(errors.filter(b => b.phase === Phase.VALIDATION)).toEqual([])

        // 024 group A: the presence pins are suspended (see the note above).
        // Task B restores `toHaveLength(1)` on both copies.
        expect(
          bottlenecks.filter(b => b.rule === FeasibilityRule.STRIP_HOURS && b.severity !== BottleneckSeverity.WARN),
          'any feasibility finding the scheduler carries is a WARN',
        ).toEqual([])
      })
    }

    it(`${id} schedules at least its baseline event count`, () => {
      expect(buildDigest(id).scheduledCount).toBeGreaterThanOrEqual(SCHEDULED_FLOORS[id])
    })
  }

  it('day peaks match the scheduler\'s own DAY_RESOURCE_SUMMARY line', () => {
    let compared = 0

    for (const id of SCENARIO_IDS) {
      const { competitions, config, schedule, bottlenecks } = runScenario(id)
      const peaks = dayPeakRefDemands(competitions, config, schedule)

      let lines = 0
      for (const b of bottlenecks) {
        const match = DAY_REFS_SUMMARY.exec(b.message)
        if (!match) continue
        const day = Number(match[1]) - 1
        expect(peaks[day], `${id} day ${day + 1} peak ref demand`).toBe(Number(match[2]))
        lines++
      }
      expect(
        lines > 0,
        `${id}: ${lines} Day N refs lines, listed=${SCENARIOS_WITH_DAY_SUMMARY.includes(id)} – lines are emitted iff listed in SCENARIOS_WITH_DAY_SUMMARY`,
      ).toBe(SCENARIOS_WITH_DAY_SUMMARY.includes(id))
      compared += lines
    }

    // Without this the test passes vacuously if the message format ever changes.
    expect(compared).toBeGreaterThan(0)
  })
})
