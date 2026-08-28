/**
 * Realistic tournament integration tests using actual USA Fencing event data.
 *
 * These tests build competition rosters from real tournament data (fencer counts
 * rounded to nearest 10) and verify that the scheduler:
 * 1. Produces results without crashing
 * 2. Respects hard separation constraints for all scheduled events
 * 3. Gracefully degrades when day capacity is exceeded (ERROR bottlenecks)
 *
 * ENGINE LIMITATIONS FOUND (historical):
 * - estimateStartOnDay passed videoRequired=true for POOLS phase (fixed)
 * - Day assignment was penalty-driven only, not capacity-aware (fixed — day
 *   assignment now uses a strip-hour bin-packing model with category weights
 *   and a capacity penalty curve)
 * - Refs must be >= max pool count of any single event (engine doesn't wave pools).
 *
 * Phase D shipped 2026-04-27: the serial scheduler was deleted and scheduleAll
 * is now a thin shim over scheduleAllConcurrent. Baselines below reflect the
 * concurrent scheduler's output (higher than the old serial floors). Historical
 * serial values preserved as inline comments on each assertion.
 */
import { describe, it, expect } from 'vitest'
import {
  EventType, BottleneckSeverity, BottleneckCause,
} from '../../src/engine/types.ts'
import type { Competition, Bottleneck } from '../../src/engine/types.ts'
import type { ScheduleResult, StripAllocation, TournamentConfig } from '../../src/engine/types.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { crossoverPenalty } from '../../src/engine/crossover.ts'
import { SCENARIOS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import { renderAsciiLanes } from '../../src/tools/asciiLaneRenderer.ts'

/**
 * Opt-in ASCII lane dump for diagnosing scheduling-density failures.
 * Set PISTE_VISUALIZE=1 to print per-scenario strip occupancy. No-op otherwise.
 */
function maybeDumpAsciiLanes(
  label: string,
  schedule: Record<string, ScheduleResult>,
  bottlenecks: Bottleneck[],
  strip_allocations: StripAllocation[][],
  config: TournamentConfig,
  competitions: Competition[],
): void {
  if (process.env.PISTE_VISUALIZE !== '1') return
  // eslint-disable-next-line no-console
  console.log(`\n=== ${label} ASCII LANES ===\n` + renderAsciiLanes({
    schedule, strip_allocations, bottlenecks, config, competitions,
  }))
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Asserts mandatory-separation categories are never on the same day for scheduled events.
 * Per-event: skips any pair where either event used level-3 relaxation (knowingly
 * overrode hard blocks as a last resort).
 */
function assertHardSeparations(
  schedule: Record<string, { assigned_day: number; constraint_relaxation_level: number }>,
  competitions: Competition[],
) {
  const compMap = new Map(competitions.map(c => [c.id, c]))
  const entries = Object.entries(schedule)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [id1, sr1] = entries[i]
      const [id2, sr2] = entries[j]
      // Skip pairs where either event knowingly overrode hard blocks
      if (sr1.constraint_relaxation_level >= 3 || sr2.constraint_relaxation_level >= 3) continue
      const c1 = compMap.get(id1)!
      const c2 = compMap.get(id2)!
      if (c1.gender !== c2.gender || c1.weapon !== c2.weapon) continue
      if (c1.event_type !== EventType.INDIVIDUAL || c2.event_type !== EventType.INDIVIDUAL) continue
      const xpen = crossoverPenalty(c1, c2)
      if (xpen === Infinity) {
        expect(sr1.assigned_day, `Hard separation: ${id1} vs ${id2}`).not.toBe(sr2.assigned_day)
      }
    }
  }
}

/**
 * Asserts ind and team events of same category/gender/weapon not on same day.
 * Per-event: skips any pair where either event used level-3 relaxation (knowingly
 * overrode hard blocks as a last resort).
 */
function assertIndTeamSeparation(
  schedule: Record<string, { assigned_day: number; constraint_relaxation_level: number }>,
  competitions: Competition[],
) {
  const compMap = new Map(competitions.map(c => [c.id, c]))
  const entries = Object.entries(schedule)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [id1, sr1] = entries[i]
      const [id2, sr2] = entries[j]
      // Skip pairs where either event knowingly overrode hard blocks
      if (sr1.constraint_relaxation_level >= 3 || sr2.constraint_relaxation_level >= 3) continue
      const c1 = compMap.get(id1)!
      const c2 = compMap.get(id2)!
      if (c1.category !== c2.category) continue
      if (c1.gender !== c2.gender || c1.weapon !== c2.weapon) continue
      const oneIsTeam =
        (c1.event_type === EventType.TEAM && c2.event_type === EventType.INDIVIDUAL) ||
        (c1.event_type === EventType.INDIVIDUAL && c2.event_type === EventType.TEAM)
      if (oneIsTeam) {
        expect(sr1.assigned_day, `Ind/team separation: ${id1} vs ${id2}`).not.toBe(sr2.assigned_day)
      }
    }
  }
}

/**
 * Standard assertions for all scenarios:
 * - At least some events scheduled
 * - All scheduled events + errors account for all competitions
 * - Hard separations respected for scheduled events
 * - All assigned days within bounds
 */
function assertScheduleIntegrity(
  schedule: Record<string, { assigned_day: number; constraint_relaxation_level: number }>,
  bottlenecks: Bottleneck[],
  competitions: Competition[],
  days: number,
) {
  const scheduled = Object.keys(schedule).length
  const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR).length

  // At least some events scheduled (engine shouldn't totally fail)
  expect(scheduled).toBeGreaterThan(0)

  // All scheduled events + errors = total (graceful degradation)
  expect(scheduled + errors).toBe(competitions.length)

  // Day bounds
  for (const sr of Object.values(schedule)) {
    expect(sr.assigned_day).toBeGreaterThanOrEqual(0)
    expect(sr.assigned_day).toBeLessThan(days)
  }

  // Relaxed events must have matching CONSTRAINT_RELAXED bottleneck (prevents silent false-pass
  // if a bug were to set constraint_relaxation_level=3 on all events without actually relaxing)
  for (const [id, sr] of Object.entries(schedule)) {
    if (sr.constraint_relaxation_level > 0) {
      const hasRelaxedBottleneck = bottlenecks.some(
        b => b.competition_id === id && b.cause === BottleneckCause.CONSTRAINT_RELAXED,
      )
      expect(hasRelaxedBottleneck, `${id} has level ${sr.constraint_relaxation_level} but no CONSTRAINT_RELAXED bottleneck`).toBe(true)
    }
  }

  // Hard separation constraints (per-event: skipped for events that used level-3 relaxation)
  assertHardSeparations(schedule, competitions)
}

// ──────────────────────────────────────────────
// Scenarios — fixtures live in `../helpers/scenarios.ts`
// ──────────────────────────────────────────────

describe('Realistic tournament integration', () => {

  describe(SCENARIOS.B1.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B1
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
      // B1: 24 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 8 under serial; observed 15, floor 14 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(14)

      // Smoke test for ref_requirements_by_day
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B1', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B2.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B2
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
      // B2: 24 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 8 under serial; observed 12, floor 11 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(11)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B2', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B3.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B3
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      // B3: 24 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 6 under serial; observed 10, floor 9 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(9)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B3', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B4.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B4
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // B4: 30 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 7 under serial; observed 10, floor 9 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(9)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B4', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B5.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B5
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // B5: 12 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 3 under serial; observed 12, floor 11 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(11)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B5', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B6.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B6
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // B6: 54 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 18 under serial; observed 29, floor 28 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(28)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
      maybeDumpAsciiLanes('B6', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B7.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B7
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      // B7: 18 events; concurrent scheduler — Phase D re-baseline 2026-04-27 (was 4 under serial; observed 6, floor 5 with 1-event safety margin).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(5)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }

      maybeDumpAsciiLanes('B7', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })

  describe(SCENARIOS.B8.label, () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B8
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day, strip_allocations } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
      // B8: 53 events on the 4-pod-DE model. The real tournament fit all 53 in 4 days.
      // Conservative floor with safety margin while we tune the engine further.
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(35)

      // Ref requirements output
      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }

      maybeDumpAsciiLanes('B8', schedule, bottlenecks, strip_allocations, config, competitions)
    })
  })
})
