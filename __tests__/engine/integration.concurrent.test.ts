/**
 * Concurrent-scheduler integration tests — mirrors B1–B7 from integration.test.ts
 * but calls scheduleAllConcurrent instead of scheduleAll.
 *
 * OBSERVED COUNTS captured 2026-04-27 against the concurrent scheduler after
 * adding Y8/Y10 priority to the within-day priority function (mirrors
 * daySequencing.ts rule 1). Numbers reflect the actual scheduled-event count
 * produced by scheduleAllConcurrent on each scenario.
 *
 *   Scenario | serial | concurrent | delta | floor used in this file
 *   B1       |   8    |    15      |  +7   | 14 (= 15 - 1 safety margin)
 *   B2       |   8    |    12      |  +4   | 11 (= 12 - 1 safety margin)
 *   B3       |   6    |    10      |  +4   |  9 (= 10 - 1 safety margin) — was a known regression at 4
 *   B4       |   7    |    10      |  +3   |  9 (= 10 - 1 safety margin)
 *   B5       |   3    |    12      |  +9   |  3 + GAIN_B5=8  → floor 11
 *   B6       |  18    |    29      |  +11  | 18 + GAIN_B6=10 → floor 28
 *   B7       |   4    |     6      |  +2   |  4 + GAIN_B7=1  → floor  5
 *
 * GAIN formula (per plan line 287-288): max(0, observed_concurrent - serial - 1).
 * The -1 safety margin accounts for priority-tie non-determinism in the
 * OS-scheduling style loop: a 1-event swing is possible when two events
 * have equal priority and the tiebreak lands differently across runs.
 *
 * B3 REGRESSION RESOLVED — the concurrent scheduler's priority function now
 * places Y8/Y10 events ahead of larger events at the same ready_time, matching
 * serial's `sequenceEventsForDay` rule 1. Without that rule, large events grab
 * strip-time at dayStart and the small youth events get crowded out of their
 * DE windows. See `compareNodes` in concurrentScheduler.ts.
 */
const GAIN_B5 = 8
const GAIN_B6 = 10
const GAIN_B7 = 1

import { describe, it, expect } from 'vitest'
import {
  EventType, DeMode, VideoPolicy,
  CutMode, BottleneckSeverity, BottleneckCause,
} from '../../src/engine/types.ts'
import type { Competition, Bottleneck, TournamentType } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { scheduleAllConcurrent } from '../../src/engine/concurrentScheduler.ts'
import { crossoverPenalty } from '../../src/engine/crossover.ts'
import { makeStrips, makeConfig, makeCompetition } from '../helpers/factories.ts'
import { SERIAL_BASELINES } from './baselines.ts'

// ──────────────────────────────────────────────
// Helpers (copied from integration.test.ts — semantics unchanged)
// ──────────────────────────────────────────────

function buildCompetitions(fencerCounts: Record<string, number>): Competition[] {
  return Object.entries(fencerCounts).map(([id, fencerCount]) => {
    const entry = findCompetition(id)
    if (!entry) throw new Error(`Catalogue entry not found: ${id}`)

    const isTeam = entry.event_type === EventType.TEAM
    const cut = isTeam
      ? { mode: CutMode.DISABLED, value: 100 }
      : DEFAULT_CUT_BY_CATEGORY[entry.category]
    const videoPolicy = DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]

    return makeCompetition({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,
      fencer_count: fencerCount,
      cut_mode: cut.mode,
      cut_value: cut.value,
      de_video_policy: videoPolicy,
      de_mode: (!isTeam && videoPolicy === VideoPolicy.REQUIRED)
        ? DeMode.STAGED
        : DeMode.SINGLE_STAGE,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

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

function tournamentConfig(
  days: number, strips: number, videoStrips: number,
  tournamentType: TournamentType,
) {
  return makeConfig({
    days_available: days,
    strips: makeStrips(strips, videoStrips),
    tournament_type: tournamentType,
  })
}

function assertScheduleIntegrity(
  schedule: Record<string, { assigned_day: number; constraint_relaxation_level: number }>,
  bottlenecks: Bottleneck[],
  competitions: Competition[],
  days: number,
) {
  const scheduled = Object.keys(schedule).length
  const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR).length

  expect(scheduled).toBeGreaterThan(0)
  expect(scheduled + errors).toBe(competitions.length)

  for (const sr of Object.values(schedule)) {
    expect(sr.assigned_day).toBeGreaterThanOrEqual(0)
    expect(sr.assigned_day).toBeLessThan(days)
  }

  for (const [id, sr] of Object.entries(schedule)) {
    if (sr.constraint_relaxation_level > 0) {
      const hasRelaxedBottleneck = bottlenecks.some(
        b => b.competition_id === id && b.cause === BottleneckCause.CONSTRAINT_RELAXED,
      )
      expect(hasRelaxedBottleneck, `${id} has level ${sr.constraint_relaxation_level} but no CONSTRAINT_RELAXED bottleneck`).toBe(true)
    }
  }

  assertHardSeparations(schedule, competitions)
}

// ──────────────────────────────────────────────
// Scenarios
// ──────────────────────────────────────────────

describe('Realistic tournament integration — concurrent scheduler', () => {

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/CEEB23D736774CA6AA20D0988372A7D6
  describe('B1: Feb 2026 NAC — Div1/Junior/Veteran (4 days, 24 events)', () => {
    const fencerCounts = {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 210,
      'D1-W-EPEE-IND': 220, 'D1-W-FOIL-IND': 130, 'D1-W-SABRE-IND': 180,
      'JR-M-EPEE-IND': 200, 'JR-M-FOIL-IND': 220, 'JR-M-SABRE-IND': 210,
      'JR-W-EPEE-IND': 180, 'JR-W-FOIL-IND': 130, 'JR-W-SABRE-IND': 160,
      'VET-M-EPEE-IND-VCMB': 120, 'VET-M-FOIL-IND-VCMB': 80, 'VET-M-SABRE-IND-VCMB': 40,
      'VET-W-EPEE-IND-VCMB': 80, 'VET-W-FOIL-IND-VCMB': 40, 'VET-W-SABRE-IND-VCMB': 50,
      'VET-M-EPEE-TEAM': 30, 'VET-M-FOIL-TEAM': 10, 'VET-M-SABRE-TEAM': 10,
      'VET-W-EPEE-TEAM': 20, 'VET-W-FOIL-TEAM': 10, 'VET-W-SABRE-TEAM': 10,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(4, 80, 8, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
      // Concurrent observed=15; floor=14 with 1-event safety margin (>= serial baseline of 8).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(14)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/EE514470341F42279A49312868171FFF
  describe('B2: Nov 2025 NAC — Div1/Cadet/Y-14 + Cadet Teams (4 days, 24 events)', () => {
    const fencerCounts = {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 280, 'D1-M-SABRE-IND': 200,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 160, 'D1-W-SABRE-IND': 220,
      'CDT-M-EPEE-IND': 270, 'CDT-M-FOIL-IND': 240, 'CDT-M-SABRE-IND': 310,
      'CDT-W-EPEE-IND': 240, 'CDT-W-FOIL-IND': 220, 'CDT-W-SABRE-IND': 240,
      'Y14-M-EPEE-IND': 200, 'Y14-M-FOIL-IND': 140, 'Y14-M-SABRE-IND': 170,
      'Y14-W-EPEE-IND': 150, 'Y14-W-FOIL-IND': 150, 'Y14-W-SABRE-IND': 160,
      'CDT-M-EPEE-TEAM': 50, 'CDT-M-FOIL-TEAM': 10, 'CDT-M-SABRE-TEAM': 20,
      'CDT-W-EPEE-TEAM': 30, 'CDT-W-FOIL-TEAM': 10, 'CDT-W-SABRE-TEAM': 10,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(4, 80, 8, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
      // Concurrent observed=12; floor=11 with 1-event safety margin (>= serial baseline of 8).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(11)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/4E2874CB40914BDCB0286561FA5531D4
  describe('B3: March 2026 NAC — Y10/Y12/Y14/Div2 (4 days, 24 events)', () => {
    const fencerCounts = {
      'Y14-M-EPEE-IND': 260, 'Y14-M-FOIL-IND': 270, 'Y14-M-SABRE-IND': 280,
      'Y14-W-EPEE-IND': 210, 'Y14-W-FOIL-IND': 240, 'Y14-W-SABRE-IND': 230,
      'Y12-M-EPEE-IND': 210, 'Y12-M-FOIL-IND': 230, 'Y12-M-SABRE-IND': 180,
      'Y12-W-EPEE-IND': 170, 'Y12-W-FOIL-IND': 200, 'Y12-W-SABRE-IND': 170,
      'Y10-M-EPEE-IND': 80, 'Y10-M-FOIL-IND': 110, 'Y10-M-SABRE-IND': 80,
      'Y10-W-EPEE-IND': 60, 'Y10-W-FOIL-IND': 70, 'Y10-W-SABRE-IND': 70,
      'D2-M-EPEE-IND': 180, 'D2-M-FOIL-IND': 170, 'D2-M-SABRE-IND': 160,
      'D2-W-EPEE-IND': 110, 'D2-W-FOIL-IND': 120, 'D2-W-SABRE-IND': 130,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(4, 80, 8, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      // Concurrent observed=10; floor=9 with 1-event safety margin (>= serial baseline of 6).
      // Y8/Y10 priority in compareNodes (added 2026-04-27) lets youth events
      // claim morning strip-time before larger events crowd them out.
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(9)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/A502062C3346472AAA8C63C3366DC4BE
  describe('B4: Jan 2026 SYC — Y8/Y10/Y12/Y14/Cadet (3 days, 30 events)', () => {
    const fencerCounts = {
      'Y14-M-EPEE-IND': 190, 'Y14-M-FOIL-IND': 170, 'Y14-M-SABRE-IND': 200,
      'Y14-W-EPEE-IND': 140, 'Y14-W-FOIL-IND': 150, 'Y14-W-SABRE-IND': 170,
      'Y12-M-EPEE-IND': 140, 'Y12-M-FOIL-IND': 150, 'Y12-M-SABRE-IND': 150,
      'Y12-W-EPEE-IND': 120, 'Y12-W-FOIL-IND': 120, 'Y12-W-SABRE-IND': 120,
      'Y10-M-EPEE-IND': 70, 'Y10-M-FOIL-IND': 80, 'Y10-M-SABRE-IND': 80,
      'Y10-W-EPEE-IND': 70, 'Y10-W-FOIL-IND': 60, 'Y10-W-SABRE-IND': 60,
      'Y8-M-EPEE-IND': 20, 'Y8-M-FOIL-IND': 20, 'Y8-M-SABRE-IND': 20,
      'Y8-W-EPEE-IND': 30, 'Y8-W-FOIL-IND': 20, 'Y8-W-SABRE-IND': 10,
      'CDT-M-EPEE-IND': 170, 'CDT-M-FOIL-IND': 100, 'CDT-M-SABRE-IND': 130,
      'CDT-W-EPEE-IND': 110, 'CDT-W-FOIL-IND': 80, 'CDT-W-SABRE-IND': 120,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(3, 40, 4, 'SYC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // Concurrent observed=10; floor=9 with 1-event safety margin (>= serial baseline of 7).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(9)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/EB2CCA52D45B4BB08F66DCC79C0C2063
  describe('B5: Jan 2026 SJCC — Cadet/Junior (3 days, 12 events)', () => {
    const fencerCounts = {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 120, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 80, 'JR-W-FOIL-IND': 70, 'JR-W-SABRE-IND': 110,
      'CDT-M-EPEE-IND': 120, 'CDT-M-FOIL-IND': 80, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 80, 'CDT-W-FOIL-IND': 70, 'CDT-W-SABRE-IND': 90,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(3, 60, 8, 'SJCC')

    it('schedules more events than serial baseline', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // Concurrent observed=12 vs serial=3; floor = serial + GAIN_B5 (= 3 + 8 = 11).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(SERIAL_BASELINES.B5 + GAIN_B5)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/C023BCB957844F6BAC9AD10BE8316CAA
  describe('B6: Sep 2025 ROC — 9 categories (3 days, 54 events)', () => {
    const fencerCounts = {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 90, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 70, 'JR-W-FOIL-IND': 30, 'JR-W-SABRE-IND': 80,
      'CDT-M-EPEE-IND': 110, 'CDT-M-FOIL-IND': 40, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 30, 'CDT-W-FOIL-IND': 80, 'CDT-W-SABRE-IND': 80,
      'Y14-M-EPEE-IND': 50, 'Y14-M-FOIL-IND': 100, 'Y14-M-SABRE-IND': 50,
      'Y14-W-EPEE-IND': 70, 'Y14-W-FOIL-IND': 70, 'Y14-W-SABRE-IND': 30,
      'Y12-M-EPEE-IND': 70, 'Y12-M-FOIL-IND': 70, 'Y12-M-SABRE-IND': 70,
      'Y12-W-EPEE-IND': 70, 'Y12-W-FOIL-IND': 30, 'Y12-W-SABRE-IND': 50,
      'Y10-M-EPEE-IND': 20, 'Y10-M-FOIL-IND': 20, 'Y10-M-SABRE-IND': 30,
      'Y10-W-EPEE-IND': 20, 'Y10-W-FOIL-IND': 20, 'Y10-W-SABRE-IND': 20,
      'Y8-M-EPEE-IND': 10, 'Y8-M-FOIL-IND': 10, 'Y8-M-SABRE-IND': 10,
      'Y8-W-EPEE-IND': 10, 'Y8-W-FOIL-IND': 10, 'Y8-W-SABRE-IND': 6,
      'D1A-M-EPEE-IND': 50, 'D1A-M-FOIL-IND': 100, 'D1A-M-SABRE-IND': 50,
      'D1A-W-EPEE-IND': 50, 'D1A-W-FOIL-IND': 60, 'D1A-W-SABRE-IND': 10,
      'D2-M-EPEE-IND': 60, 'D2-M-FOIL-IND': 70, 'D2-M-SABRE-IND': 50,
      'D2-W-EPEE-IND': 60, 'D2-W-FOIL-IND': 20, 'D2-W-SABRE-IND': 30,
      'VET-M-EPEE-IND-VCMB': 40, 'VET-M-FOIL-IND-VCMB': 20, 'VET-M-SABRE-IND-VCMB': 20,
      'VET-W-EPEE-IND-VCMB': 20, 'VET-W-FOIL-IND-VCMB': 10, 'VET-W-SABRE-IND-VCMB': 10,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(3, 48, 4, 'ROC')

    it('schedules more events than serial baseline', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
      // Concurrent observed=29 vs serial=18; floor = serial + GAIN_B6 (= 18 + 10 = 28).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(SERIAL_BASELINES.B6 + GAIN_B6)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })

  // Source: https://fencingtimelive.com/tournaments/eventSchedule/3BC857E223F2428ABEB1DA24D7D1DE28
  describe('B7: Oct 2025 NAC — Div1/Junior/Cadet (4 days, 18 events)', () => {
    const fencerCounts = {
      'D1-M-EPEE-IND': 320, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 220,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 180, 'D1-W-SABRE-IND': 220,
      'JR-M-EPEE-IND': 320, 'JR-M-FOIL-IND': 300, 'JR-M-SABRE-IND': 300,
      'JR-W-EPEE-IND': 240, 'JR-W-FOIL-IND': 230, 'JR-W-SABRE-IND': 240,
      'CDT-M-EPEE-IND': 230, 'CDT-M-FOIL-IND': 190, 'CDT-M-SABRE-IND': 220,
      'CDT-W-EPEE-IND': 180, 'CDT-W-FOIL-IND': 170, 'CDT-W-SABRE-IND': 180,
    }
    const competitions = buildCompetitions(fencerCounts)
    const config = tournamentConfig(4, 80, 8, 'NAC')

    it('schedules more events than serial baseline', () => {
      const { schedule, bottlenecks, ref_requirements_by_day } = scheduleAllConcurrent(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      // Concurrent observed=6 vs serial=4; floor = serial + GAIN_B7 (= 4 + 1 = 5).
      expect(Object.keys(schedule).length).toBeGreaterThanOrEqual(SERIAL_BASELINES.B7 + GAIN_B7)

      expect(ref_requirements_by_day).toBeDefined()
      expect(ref_requirements_by_day).toHaveLength(config.days_available)
      for (const r of ref_requirements_by_day!) {
        expect(r.peak_total_refs).toBeGreaterThanOrEqual(0)
        expect(r.peak_saber_refs).toBeLessThanOrEqual(r.peak_total_refs)
      }
    })
  })
})
