/**
 * Realistic tournament integration tests using actual USA Fencing event data.
 *
 * These tests build competition rosters from real tournament data (fencer counts
 * rounded to nearest 10) and verify that the scheduler:
 * 1. Produces results without crashing
 * 2. Respects hard separation constraints for all scheduled events
 * 3. Gracefully degrades when day capacity is exceeded (ERROR bottlenecks)
 *
 * ENGINE LIMITATIONS FOUND:
 * - estimateStartOnDay passed videoRequired=true for POOLS phase (fixed in this PR)
 * - Day assignment is penalty-driven, not capacity-aware — the scheduler doesn't
 *   consider total strip-hours remaining on a day, so it overloads days when
 *   many large events have similar penalty profiles. This causes DE phases to
 *   overrun day boundaries even with generous resources.
 * - Staged DE (STAGED_DE_BLOCKS) serializes video-strip usage across events,
 *   compounding the day-overload problem for Cadet/Junior/Div1 events.
 * - Refs must be >= max pool count of any single event (engine doesn't wave pools).
 */
import { describe, it, expect } from 'vitest'
import {
  EventType, DeMode, VideoPolicy,
  CutMode, BottleneckSeverity,
} from '../../src/engine/types.ts'
import type { Competition, TournamentType } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { crossoverPenalty } from '../../src/engine/crossover.ts'
import { makeStrips, makeConfig, makeCompetition } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers
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
        ? DeMode.STAGED_DE_BLOCKS
        : DeMode.SINGLE_BLOCK,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

/**
 * Asserts mandatory-separation categories are never on the same day for scheduled events.
 * Only checked when no ERROR bottlenecks exist — when errors are present, the engine
 * may have relaxed to level 3 (overriding hard blocks as last resort).
 *
 * Note: constraint_relaxation_level in ScheduleResult is not yet populated by the engine
 * (hardcoded to 0), so we can't use it for per-event filtering.
 */
function assertHardSeparations(
  schedule: Record<string, { assigned_day: number }>,
  competitions: Competition[],
  hasErrors: boolean,
) {
  // When the engine has errors, it may have used level-3 relaxation (override hard blocks)
  if (hasErrors) return

  const compMap = new Map(competitions.map(c => [c.id, c]))
  const entries = Object.entries(schedule)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [id1, sr1] = entries[i]
      const [id2, sr2] = entries[j]
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

/** Asserts ind and team events of same category/gender/weapon not on same day. */
function assertIndTeamSeparation(
  schedule: Record<string, { assigned_day: number }>,
  competitions: Competition[],
) {
  const compMap = new Map(competitions.map(c => [c.id, c]))
  const entries = Object.entries(schedule)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [id1, sr1] = entries[i]
      const [id2, sr2] = entries[j]
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

/** Compute minimum refs needed: max pool count of any single event. */
function minRefsForEvents(fencerCounts: Record<string, number>): { fe: number; saber: number } {
  let maxFe = 0
  let maxSaber = 0
  for (const [id, count] of Object.entries(fencerCounts)) {
    const pools = Math.ceil(count / 7)
    if (id.includes('SABRE')) {
      maxSaber = Math.max(maxSaber, pools)
    } else {
      maxFe = Math.max(maxFe, pools)
    }
  }
  return { fe: maxFe, saber: maxSaber }
}

function tournamentConfig(
  days: number, strips: number, videoStrips: number,
  feRefs: number, saberRefs: number, tournamentType: TournamentType,
) {
  return makeConfig({
    days_available: days,
    strips: makeStrips(strips, videoStrips),
    tournament_type: tournamentType,
    referee_availability: Array.from({ length: days }, (_, i) => ({
      day: i, foil_epee_refs: feRefs, saber_refs: saberRefs, source: 'ACTUAL' as const,
    })),
  })
}

/**
 * Standard assertions for all scenarios:
 * - At least some events scheduled
 * - All scheduled events + errors account for all competitions
 * - Hard separations respected for scheduled events
 * - All assigned days within bounds
 */
function assertScheduleIntegrity(
  schedule: Record<string, { assigned_day: number }>,
  bottlenecks: { severity: string }[],
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

  // Hard separation constraints (skipped when engine is in degraded mode)
  assertHardSeparations(schedule, competitions, errors > 0)
}

// ──────────────────────────────────────────────
// Scenarios
// ──────────────────────────────────────────────

describe('Realistic tournament integration', () => {

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(4, 80, 8, refs.fe, refs.saber, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      assertIndTeamSeparation(schedule, competitions)
    })
  })

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(4, 80, 8, refs.fe, refs.saber, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
      // TODO: assertIndTeamSeparation once INDIV_TEAM_HARD_BLOCKS is wired into engine
    })
  })

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(4, 80, 8, refs.fe, refs.saber, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
    })
  })

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(3, 40, 4, refs.fe, refs.saber, 'SYC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
    })
  })

  describe('B5: Jan 2026 SJCC — Cadet/Junior (3 days, 12 events)', () => {
    const fencerCounts = {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 120, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 80, 'JR-W-FOIL-IND': 70, 'JR-W-SABRE-IND': 110,
      'CDT-M-EPEE-IND': 120, 'CDT-M-FOIL-IND': 80, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 80, 'CDT-W-FOIL-IND': 70, 'CDT-W-SABRE-IND': 90,
    }
    const competitions = buildCompetitions(fencerCounts)
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(3, 60, 8, refs.fe, refs.saber, 'SJCC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
    })
  })

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(3, 48, 4, refs.fe, refs.saber, 'ROC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 3)
    })
  })

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
    const refs = minRefsForEvents(fencerCounts)
    const config = tournamentConfig(4, 80, 8, refs.fe, refs.saber, 'NAC')

    it('schedules events with hard constraints respected', () => {
      const { schedule, bottlenecks } = scheduleAll(competitions, config)
      assertScheduleIntegrity(schedule, bottlenecks, competitions, 4)
    })
  })
})
