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
 *
 * What is deliberately NOT in the digest: bottleneck message strings. They embed
 * times that churn for uninteresting reasons and would drown every real finding.
 * ERROR and WARN *counts* are in, the messages are out.
 */
import { describe, it, expect } from 'vitest'
import { BottleneckSeverity } from '../../src/engine/types.ts'
import type {
  Bottleneck, Competition, RefRequirementsByDay, ScheduleResult, TournamentConfig,
  BottleneckCause,
} from '../../src/engine/types.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { peakPoolRefDemand, peakDeRefDemand } from '../../src/engine/refs.ts'
import { recommendRefCount, recommendStripCount } from '../../src/engine/stripBudget.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'

/**
 * Refs per pool under `RefPolicy.AUTO` — the same peak estimate
 * `peakPoolRefDemand` applies for AUTO. Not an arbitrary constant.
 */
const AUTO_REFS_PER_POOL = 2

/**
 * Scheduled-event floors, measured on the pre-change baseline. The constitution
 * halts a task when any scenario schedules fewer events than before, so these
 * are asserted rather than left to a reader of the snapshot diff.
 *
 * A later task may deliberately RAISE a floor when it improves packing. Lowering
 * one is the regression the gate exists to catch: never edit a floor down to make
 * a red test pass — identify the cause first, and record both counts.
 */
const SCHEDULED_FLOORS: Record<ScenarioId, number> = {
  B1: 24, B2: 24, B3: 24, B4: 15, B5: 12, B6: 43, B7: 18, B8: 50,
}

/** Scenarios that emit at least one `Day N refs: peak demand M.` summary line. */
const SCENARIOS_WITH_DAY_SUMMARY: ScenarioId[] = ['B4', 'B6', 'B8']

/** Matches the refs line built at `concurrentScheduler.ts:1505`. */
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
  stripRecommendation: number
  events: Record<string, EventDigest>
}

function runScenario(id: ScenarioId) {
  const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
  const competitions = buildCompetitions(fencerCounts)
  const config = tournamentConfig(days, strips, videoStrips, tournamentType)
  return { competitions, config, ...scheduleAll(competitions, config) }
}

/**
 * Per-day peak ref demand, recomputed the way `concurrentScheduler.ts:1489-1496`
 * builds its DAY_RESOURCE_SUMMARY line: each competition on the day contributes
 * the larger of its pool and DE demand.
 *
 * Recomputed rather than parsed out of the message, and computed for EVERY day —
 * the scheduler only emits a summary for days with failures, and a ledger field
 * that appears and disappears is unreviewable. `dayPeaksMatchSummaryLine` below
 * pins this copy of the formula to the scheduler's own output.
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
    refRecommendation: recommendRefCount(competitions, AUTO_REFS_PER_POOL, config),
    stripRecommendation: recommendStripCount(competitions, config.max_pool_strip_pct),
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

    it(`${id} schedules at least its baseline event count`, () => {
      expect(buildDigest(id).scheduledCount).toBeGreaterThanOrEqual(SCHEDULED_FLOORS[id])
    })
  }

  it('day peaks match the scheduler\'s own DAY_RESOURCE_SUMMARY line', () => {
    let compared = 0

    for (const id of SCENARIOS_WITH_DAY_SUMMARY) {
      const { competitions, config, schedule, bottlenecks } = runScenario(id)
      const peaks = dayPeakRefDemands(competitions, config, schedule)

      for (const b of bottlenecks) {
        const match = DAY_REFS_SUMMARY.exec(b.message)
        if (!match) continue
        const day = Number(match[1]) - 1
        expect(peaks[day], `${id} day ${day + 1} peak ref demand`).toBe(Number(match[2]))
        compared++
      }
    }

    // Without this the test passes vacuously if the message format ever changes.
    expect(compared).toBeGreaterThan(0)
  })
})
