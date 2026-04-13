/**
 * Coloring validation tests for DSatur graph-coloring day assignment.
 *
 * Imports the real B1-B7 tournament configurations and validates that
 * assignDaysByColoring produces correct, constraint-respecting day
 * assignments before integration into the full scheduler.
 */
import { describe, it, expect } from 'vitest'
import {
  EventType, CutMode, VideoPolicy, DeMode,
} from '../../src/engine/types.ts'
import type { Competition, TournamentConfig, TournamentType } from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  REST_DAY_PAIRS,
} from '../../src/engine/constants.ts'
import { findCompetition } from '../../src/engine/catalogue.ts'
import { crossoverPenalty } from '../../src/engine/crossover.ts'
import { buildConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { assignDaysByColoring } from '../../src/engine/dayColoring.ts'
import { sequenceEventsForDay } from '../../src/engine/daySequencing.ts'
import { makeStrips, makeConfig, makeCompetition } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers (adapted from integration.test.ts)
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

function tournamentConfig(
  days: number, strips: number, videoStrips: number,
  feRefs: number, saberRefs: number, tournamentType: TournamentType,
): TournamentConfig {
  return makeConfig({
    days_available: days,
    strips: makeStrips(strips, videoStrips),
    tournament_type: tournamentType,
    referee_availability: Array.from({ length: days }, (_, i) => ({
      day: i, foil_epee_refs: feRefs, three_weapon_refs: saberRefs, source: 'ACTUAL' as const,
    })),
  })
}

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

// ──────────────────────────────────────────────
// Metric collection helpers
// ──────────────────────────────────────────────

/** Counts events per day. */
function dayDistribution(dayMap: Map<string, number>, daysAvailable: number): number[] {
  const counts = Array.from({ length: daysAvailable }, () => 0)
  for (const day of dayMap.values()) {
    counts[day]++
  }
  return counts
}

/** Finds hard constraint violations: same-population or GROUP_1_MANDATORY pairs on same day. */
function hardConstraintViolations(
  dayMap: Map<string, number>,
  competitions: Competition[],
  relaxations: Map<string, number>,
): Array<{ id1: string; id2: string; day: number }> {
  const violations: Array<{ id1: string; id2: string; day: number }> = []
  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      const c1 = competitions[i]
      const c2 = competitions[j]
      const day1 = dayMap.get(c1.id)
      const day2 = dayMap.get(c2.id)
      if (day1 === undefined || day2 === undefined || day1 !== day2) continue

      const penalty = crossoverPenalty(c1, c2)
      if (penalty === Infinity) {
        // Skip if either event was relaxed
        if (relaxations.has(c1.id) || relaxations.has(c2.id)) continue
        violations.push({ id1: c1.id, id2: c2.id, day: day1 })
      }
    }
  }
  return violations
}

/** Sums soft-edge weights for same-day pairs. */
function softPenaltyTotal(
  dayMap: Map<string, number>,
  competitions: Competition[],
): number {
  let total = 0
  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      const c1 = competitions[i]
      const c2 = competitions[j]
      const day1 = dayMap.get(c1.id)
      const day2 = dayMap.get(c2.id)
      if (day1 === undefined || day2 === undefined || day1 !== day2) continue

      const penalty = crossoverPenalty(c1, c2)
      if (penalty > 0 && penalty !== Infinity) {
        total += penalty
      }
    }
  }
  return total
}

/** Finds REST_DAY_PAIRS on adjacent days (same gender + weapon). */
function restDayViolations(
  dayMap: Map<string, number>,
  competitions: Competition[],
): Array<{ id1: string; id2: string; day1: number; day2: number }> {
  const violations: Array<{ id1: string; id2: string; day1: number; day2: number }> = []
  for (let i = 0; i < competitions.length; i++) {
    for (let j = i + 1; j < competitions.length; j++) {
      const c1 = competitions[i]
      const c2 = competitions[j]
      if (c1.gender !== c2.gender || c1.weapon !== c2.weapon) continue

      const isRestPair = REST_DAY_PAIRS.some(
        ([a, b]) =>
          (a === c1.category && b === c2.category) ||
          (a === c2.category && b === c1.category),
      )
      if (!isRestPair) continue

      const day1 = dayMap.get(c1.id)
      const day2 = dayMap.get(c2.id)
      if (day1 === undefined || day2 === undefined) continue
      if (Math.abs(day1 - day2) === 1) {
        violations.push({ id1: c1.id, id2: c2.id, day1, day2 })
      }
    }
  }
  return violations
}

/** Logs all metrics for a scenario. */
function logMetrics(
  label: string,
  dayMap: Map<string, number>,
  relaxations: Map<string, number>,
  competitions: Competition[],
  config: TournamentConfig,
): void {
  const dist = dayDistribution(dayMap, config.days_available)
  const hardViolations = hardConstraintViolations(dayMap, competitions, relaxations)
  const softTotal = softPenaltyTotal(dayMap, competitions)
  const restViolations = restDayViolations(dayMap, competitions)

  console.log(`\n=== ${label} ===`)
  console.log(`Events: ${competitions.length} | Days: ${config.days_available}`)
  console.log(`Day distribution: ${dist.map((c, d) => `Day ${d}: ${c}`).join(', ')}`)
  console.log(`Hard constraint violations: ${hardViolations.length}`)
  if (hardViolations.length > 0) {
    for (const v of hardViolations) {
      console.log(`  HARD VIOLATION: ${v.id1} vs ${v.id2} both on day ${v.day}`)
    }
  }
  console.log(`Relaxation count: ${relaxations.size}`)
  if (relaxations.size > 0) {
    for (const [id, level] of relaxations) {
      console.log(`  Relaxed: ${id} (level ${level}) -> day ${dayMap.get(id)}`)
    }
  }
  console.log(`Soft penalty total: ${softTotal.toFixed(2)}`)
  console.log(`Rest-day violations: ${restViolations.length}`)
  if (restViolations.length > 0) {
    for (const v of restViolations) {
      console.log(`  REST VIOLATION: ${v.id1} (day ${v.day1}) vs ${v.id2} (day ${v.day2})`)
    }
  }

  // Within-day sequence
  const eventsByDay = new Map<number, Competition[]>()
  for (const comp of competitions) {
    const day = dayMap.get(comp.id)
    if (day === undefined) continue
    if (!eventsByDay.has(day)) eventsByDay.set(day, [])
    eventsByDay.get(day)!.push(comp)
  }
  for (let d = 0; d < config.days_available; d++) {
    const dayEvents = eventsByDay.get(d) ?? []
    const sequenced = sequenceEventsForDay(dayEvents, config)
    console.log(`Day ${d} sequence: ${sequenced.map(c => c.id).join(', ')}`)
  }
}

// ──────────────────────────────────────────────
// Scenario definitions
// ──────────────────────────────────────────────

const scenarios = {
  'B1: Feb 2026 NAC — Div1/Junior/Veteran (4 days, 24 events)': {
    fencerCounts: {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 210,
      'D1-W-EPEE-IND': 220, 'D1-W-FOIL-IND': 130, 'D1-W-SABRE-IND': 180,
      'JR-M-EPEE-IND': 200, 'JR-M-FOIL-IND': 220, 'JR-M-SABRE-IND': 210,
      'JR-W-EPEE-IND': 180, 'JR-W-FOIL-IND': 130, 'JR-W-SABRE-IND': 160,
      'VET-M-EPEE-IND-VCMB': 120, 'VET-M-FOIL-IND-VCMB': 80, 'VET-M-SABRE-IND-VCMB': 40,
      'VET-W-EPEE-IND-VCMB': 80, 'VET-W-FOIL-IND-VCMB': 40, 'VET-W-SABRE-IND-VCMB': 50,
      'VET-M-EPEE-TEAM': 30, 'VET-M-FOIL-TEAM': 10, 'VET-M-SABRE-TEAM': 10,
      'VET-W-EPEE-TEAM': 20, 'VET-W-FOIL-TEAM': 10, 'VET-W-SABRE-TEAM': 10,
    },
    days: 4, strips: 80, videoStrips: 8, tournamentType: 'NAC' as TournamentType,
  },
  'B2: Nov 2025 NAC — Div1/Cadet/Y-14 + Cadet Teams (4 days, 24 events)': {
    fencerCounts: {
      'D1-M-EPEE-IND': 310, 'D1-M-FOIL-IND': 280, 'D1-M-SABRE-IND': 200,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 160, 'D1-W-SABRE-IND': 220,
      'CDT-M-EPEE-IND': 270, 'CDT-M-FOIL-IND': 240, 'CDT-M-SABRE-IND': 310,
      'CDT-W-EPEE-IND': 240, 'CDT-W-FOIL-IND': 220, 'CDT-W-SABRE-IND': 240,
      'Y14-M-EPEE-IND': 200, 'Y14-M-FOIL-IND': 140, 'Y14-M-SABRE-IND': 170,
      'Y14-W-EPEE-IND': 150, 'Y14-W-FOIL-IND': 150, 'Y14-W-SABRE-IND': 160,
      'CDT-M-EPEE-TEAM': 50, 'CDT-M-FOIL-TEAM': 10, 'CDT-M-SABRE-TEAM': 20,
      'CDT-W-EPEE-TEAM': 30, 'CDT-W-FOIL-TEAM': 10, 'CDT-W-SABRE-TEAM': 10,
    },
    days: 4, strips: 80, videoStrips: 8, tournamentType: 'NAC' as TournamentType,
  },
  'B3: March 2026 NAC — Y10/Y12/Y14/Div2 (4 days, 24 events)': {
    fencerCounts: {
      'Y14-M-EPEE-IND': 260, 'Y14-M-FOIL-IND': 270, 'Y14-M-SABRE-IND': 280,
      'Y14-W-EPEE-IND': 210, 'Y14-W-FOIL-IND': 240, 'Y14-W-SABRE-IND': 230,
      'Y12-M-EPEE-IND': 210, 'Y12-M-FOIL-IND': 230, 'Y12-M-SABRE-IND': 180,
      'Y12-W-EPEE-IND': 170, 'Y12-W-FOIL-IND': 200, 'Y12-W-SABRE-IND': 170,
      'Y10-M-EPEE-IND': 80, 'Y10-M-FOIL-IND': 110, 'Y10-M-SABRE-IND': 80,
      'Y10-W-EPEE-IND': 60, 'Y10-W-FOIL-IND': 70, 'Y10-W-SABRE-IND': 70,
      'D2-M-EPEE-IND': 180, 'D2-M-FOIL-IND': 170, 'D2-M-SABRE-IND': 160,
      'D2-W-EPEE-IND': 110, 'D2-W-FOIL-IND': 120, 'D2-W-SABRE-IND': 130,
    },
    days: 4, strips: 80, videoStrips: 8, tournamentType: 'NAC' as TournamentType,
  },
  'B4: Jan 2026 SYC — Y8/Y10/Y12/Y14/Cadet (3 days, 30 events)': {
    fencerCounts: {
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
    },
    days: 3, strips: 40, videoStrips: 4, tournamentType: 'SYC' as TournamentType,
  },
  'B5: Jan 2026 SJCC — Cadet/Junior (3 days, 12 events)': {
    fencerCounts: {
      'JR-M-EPEE-IND': 120, 'JR-M-FOIL-IND': 120, 'JR-M-SABRE-IND': 120,
      'JR-W-EPEE-IND': 80, 'JR-W-FOIL-IND': 70, 'JR-W-SABRE-IND': 110,
      'CDT-M-EPEE-IND': 120, 'CDT-M-FOIL-IND': 80, 'CDT-M-SABRE-IND': 100,
      'CDT-W-EPEE-IND': 80, 'CDT-W-FOIL-IND': 70, 'CDT-W-SABRE-IND': 90,
    },
    days: 3, strips: 60, videoStrips: 8, tournamentType: 'SJCC' as TournamentType,
  },
  'B6: Sep 2025 ROC — 9 categories (3 days, 54 events)': {
    fencerCounts: {
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
    },
    days: 3, strips: 48, videoStrips: 4, tournamentType: 'ROC' as TournamentType,
  },
  'B7: Oct 2025 NAC — Div1/Junior/Cadet (4 days, 18 events)': {
    fencerCounts: {
      'D1-M-EPEE-IND': 320, 'D1-M-FOIL-IND': 260, 'D1-M-SABRE-IND': 220,
      'D1-W-EPEE-IND': 210, 'D1-W-FOIL-IND': 180, 'D1-W-SABRE-IND': 220,
      'JR-M-EPEE-IND': 320, 'JR-M-FOIL-IND': 300, 'JR-M-SABRE-IND': 300,
      'JR-W-EPEE-IND': 240, 'JR-W-FOIL-IND': 230, 'JR-W-SABRE-IND': 240,
      'CDT-M-EPEE-IND': 230, 'CDT-M-FOIL-IND': 190, 'CDT-M-SABRE-IND': 220,
      'CDT-W-EPEE-IND': 180, 'CDT-W-FOIL-IND': 170, 'CDT-W-SABRE-IND': 180,
    },
    days: 4, strips: 80, videoStrips: 8, tournamentType: 'NAC' as TournamentType,
  },
} as const

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('Coloring validation (DSatur day assignment)', () => {
  for (const [label, scenario] of Object.entries(scenarios)) {
    describe(label, () => {
      const competitions = buildCompetitions(scenario.fencerCounts)
      const refs = minRefsForEvents(scenario.fencerCounts)
      const config = tournamentConfig(
        scenario.days, scenario.strips, scenario.videoStrips,
        refs.fe, refs.saber, scenario.tournamentType,
      )
      const graph = buildConstraintGraph(competitions)
      const { dayMap, relaxations } = assignDaysByColoring(graph, competitions, config)

      it('assigns every competition a day within bounds', () => {
        logMetrics(label, dayMap, relaxations, competitions, config)

        const assignedIds = new Set(dayMap.keys())
        const expectedIds = new Set(competitions.map(c => c.id))
        expect(assignedIds).toEqual(expectedIds)
        for (const [id, day] of dayMap) {
          expect(day, `${id} day out of bounds`).toBeGreaterThanOrEqual(0)
          expect(day, `${id} day out of bounds`).toBeLessThan(scenario.days)
        }
      })

      it('has zero hard constraint violations (excluding relaxed events)', () => {
        const violations = hardConstraintViolations(dayMap, competitions, relaxations)
        for (const v of violations) {
          console.log(`  HARD VIOLATION: ${v.id1} vs ${v.id2} both on day ${v.day}`)
        }
        expect(violations).toHaveLength(0)
      })

    })
  }
})
