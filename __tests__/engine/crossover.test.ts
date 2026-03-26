import { describe, it, expect } from 'vitest'
import {
  buildPenaltyMatrix,
  crossoverPenalty,
  proximityPenalty,
  getProximityWeight,
  individualTeamProximityPenalty,
  findIndividualCounterpart,
} from '../../src/engine/crossover.ts'
import { Category, Gender, Weapon, EventType } from '../../src/engine/types.ts'
import { CROSSOVER_GRAPH } from '../../src/engine/constants.ts'
import type { Competition, ScheduleResult } from '../../src/engine/types.ts'
import { makeComp, makeScheduleResult } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// buildPenaltyMatrix
// ──────────────────────────────────────────────

describe('buildPenaltyMatrix', () => {
  const matrix = buildPenaltyMatrix(CROSSOVER_GRAPH)

  it('has entries for all direct pairs from CROSSOVER_GRAPH', () => {
    for (const [a, neighbours] of Object.entries(CROSSOVER_GRAPH)) {
      for (const [b, w] of Object.entries(neighbours as Record<string, number>)) {
        expect(matrix.get(`${a}|${b}`)).toBe(w)
      }
    }
  })

  it('is symmetric: matrix[(A,B)] === matrix[(B,A)]', () => {
    for (const [key, w] of matrix) {
      const [a, b] = key.split('|')
      expect(matrix.get(`${b}|${a}`)).toBe(w)
    }
  })

  it('indirect pairs are capped at 0.3 (Y8↔Y12 via Y10 = 0.3)', () => {
    // Y8→Y10 = 1.0, Y10→Y12 = 1.0, so indirect = min(1.0 * 1.0, 0.3) = 0.3
    expect(matrix.get(`${Category.Y8}|${Category.Y12}`)).toBe(0.3)
    expect(matrix.get(`${Category.Y12}|${Category.Y8}`)).toBe(0.3)
  })

  it('has no self-pairs', () => {
    for (const cat of Object.values(Category)) {
      expect(matrix.has(`${cat}|${cat}`)).toBe(false)
    }
  })
})

// ──────────────────────────────────────────────
// crossoverPenalty — table-driven from PRD Section 4.2
// ──────────────────────────────────────────────

describe('crossoverPenalty', () => {
  it.each([
    {
      label: 'Same category + gender + weapon → INFINITY',
      c1: makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.DIV1, Gender.MEN, Weapon.FOIL),
      expected: Infinity,
    },
    {
      label: 'Cross-gender (any) → 0.0',
      c1: makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.JUNIOR, Gender.WOMEN, Weapon.FOIL),
      expected: 0.0,
    },
    {
      label: 'Same gender, same weapon, Y10↔Y12 (Group 1) → INFINITY',
      c1: makeComp('a', Category.Y10, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.Y12, Gender.MEN, Weapon.FOIL),
      expected: Infinity,
    },
    // Expected values below come from CROSSOVER_GRAPH edge weights in constants.ts.
    // Soft penalties (0.3, 0.6, 1.0) reflect how closely related two categories are;
    // higher weight = stronger scheduling conflict.
    {
      label: 'Same gender, same weapon, CADET↔DIV2 → 1.0',
      c1: makeComp('a', Category.CADET, Gender.WOMEN, Weapon.EPEE),
      c2: makeComp('b', Category.DIV2, Gender.WOMEN, Weapon.EPEE),
      expected: 1.0,
    },
    {
      label: 'Same gender, different weapon, Y10↔Y12 → 0.0',
      c1: makeComp('a', Category.Y10, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.Y12, Gender.MEN, Weapon.EPEE),
      expected: 0.0,
    },
    {
      label: 'Same gender, same weapon, VET↔DIV1 → 0.3',
      c1: makeComp('a', Category.VETERAN, Gender.WOMEN, Weapon.SABRE),
      c2: makeComp('b', Category.DIV1, Gender.WOMEN, Weapon.SABRE),
      expected: 0.3,
    },
    {
      label: 'Same gender, same weapon, Y14↔DIV1A → 0.6',
      c1: makeComp('a', Category.Y14, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.DIV1A, Gender.MEN, Weapon.FOIL),
      expected: 0.6,
    },
    {
      label: 'Same gender, same weapon, Y8↔VETERAN (unrelated categories) → 0.0',
      c1: makeComp('a', Category.Y8, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.VETERAN, Gender.MEN, Weapon.FOIL),
      expected: 0.0,
    },
  ])('$label', ({ c1, c2, expected }) => {
    expect(crossoverPenalty(c1, c2)).toBe(expected)
  })
})

// ──────────────────────────────────────────────
// getProximityWeight
// ──────────────────────────────────────────────

describe('getProximityWeight', () => {
  it.each([
    { cat1: Category.VETERAN, cat2: Category.VETERAN, expected: 1.0 },
    { cat1: Category.JUNIOR, cat2: Category.CADET, expected: 1.0 },
    { cat1: Category.VETERAN, cat2: Category.DIV1A, expected: 0.6 },
    { cat1: Category.DIV1, cat2: Category.Y10, expected: 0.0 },
  ])('$cat1 ↔ $cat2 → $expected', ({ cat1, cat2, expected }) => {
    expect(getProximityWeight(cat1, cat2)).toBe(expected)
  })
})

// ──────────────────────────────────────────────
// proximityPenalty
// ──────────────────────────────────────────────

describe('proximityPenalty', () => {
  const div1 = makeComp('div1', Category.DIV1, Gender.MEN, Weapon.FOIL)
  const junior = makeComp('junior', Category.JUNIOR, Gender.MEN, Weapon.FOIL)
  const juniorWomen = makeComp('junior-w', Category.JUNIOR, Gender.WOMEN, Weapon.FOIL)
  const juniorEpee = makeComp('junior-e', Category.JUNIOR, Gender.MEN, Weapon.EPEE)
  const y10 = makeComp('y10', Category.Y10, Gender.MEN, Weapon.FOIL)

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=1 → negative bonus (-0.4 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 1),
    }
    // div1 proposed day=2, junior on day=1 → gap=1 → -0.4 * 1.0 = -0.4
    const result = proximityPenalty(div1, 2, schedule, [junior as Competition])
    expect(result).toBeCloseTo(-0.4)
  })

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=0 → 0.0 (same day handled elsewhere)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 2),
    }
    const result = proximityPenalty(div1, 2, schedule, [junior as Competition])
    expect(result).toBe(0.0)
  })

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=3 → positive penalty (0.5 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 0),
    }
    // div1 proposed day=3, junior on day=0 → gap=3 → 0.5 * 1.0 = 0.5
    const result = proximityPenalty(div1, 3, schedule, [junior as Competition])
    expect(result).toBeCloseTo(0.5)
  })

  it('Different gender → 0.0 regardless', () => {
    const schedule: Record<string, ScheduleResult> = {
      'junior-w': makeScheduleResult('junior-w', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [juniorWomen as Competition])
    expect(result).toBe(0.0)
  })

  it('Different weapon → 0.0 regardless', () => {
    const schedule: Record<string, ScheduleResult> = {
      'junior-e': makeScheduleResult('junior-e', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [juniorEpee as Competition])
    expect(result).toBe(0.0)
  })

  it('Non-proximity pair (DIV1↔Y10) → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      y10: makeScheduleResult('y10', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [y10 as Competition])
    expect(result).toBe(0.0)
  })

  it('day_gap=4 → clamped to 3, same penalty as gap=3 (0.5 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 0),
    }
    // div1 proposed day=4, junior on day=0 → gap=4, clamped to 3 → 0.5 * 1.0
    const result = proximityPenalty(div1, 4, schedule, [junior as Competition])
    expect(result).toBeCloseTo(0.5)
  })
})

// ──────────────────────────────────────────────
// individualTeamProximityPenalty
// ──────────────────────────────────────────────

describe('individualTeamProximityPenalty', () => {
  const teamComp = makeComp('div1-team', Category.DIV1, Gender.MEN, Weapon.FOIL, EventType.TEAM)
  const indComp = makeComp('div1-ind', Category.DIV1, Gender.MEN, Weapon.FOIL, EventType.INDIVIDUAL)

  it('TEAM event, individual scheduled day before → -0.4 bonus', () => {
    // team on proposed day=2, individual on day=1 → gap = 2-1 = 1 → -0.4
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 1),
    }
    const result = individualTeamProximityPenalty(
      teamComp as Competition,
      2,
      schedule,
      [indComp as Competition],
    )
    expect(result).toBe(-0.4)
  })

  it('TEAM event, individual scheduled same day → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 2),
    }
    const result = individualTeamProximityPenalty(
      teamComp as Competition,
      2,
      schedule,
      [indComp as Competition],
    )
    expect(result).toBe(0.0)
  })

  it('TEAM event, individual scheduled day after (team before ind) → 1.0 penalty', () => {
    // team proposed day=1, individual on day=2 → gap = 1-2 = -1 → 1.0
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 2),
    }
    const result = individualTeamProximityPenalty(
      teamComp as Competition,
      1,
      schedule,
      [indComp as Competition],
    )
    expect(result).toBe(1.0)
  })

  it('TEAM event, individual 2+ days after (team far before ind) → 0.3 penalty', () => {
    // team proposed day=0, individual on day=3 → gap = 0-3 = -3 → too far apart
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 3),
    }
    const result = individualTeamProximityPenalty(
      teamComp as Competition,
      0,
      schedule,
      [indComp as Competition],
    )
    expect(result).toBe(0.3)
  })

  it('INDIVIDUAL event → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 1),
    }
    const result = individualTeamProximityPenalty(
      indComp as Competition,
      2,
      schedule,
      [indComp as Competition],
    )
    expect(result).toBe(0.0)
  })
})

// ──────────────────────────────────────────────
// findIndividualCounterpart
// ──────────────────────────────────────────────

describe('findIndividualCounterpart', () => {
  it('finds matching individual for a team event', () => {
    const team = makeComp('d1-team', Category.DIV1, Gender.MEN, Weapon.FOIL, EventType.TEAM)
    const ind = makeComp('d1-ind', Category.DIV1, Gender.MEN, Weapon.FOIL, EventType.INDIVIDUAL)
    const other = makeComp('d1w-ind', Category.DIV1, Gender.WOMEN, Weapon.FOIL, EventType.INDIVIDUAL)
    const result = findIndividualCounterpart(team as Competition, [
      ind as Competition,
      other as Competition,
      team as Competition,
    ])
    expect(result?.id).toBe('d1-ind')
  })

  it('returns undefined when no match exists', () => {
    const team = makeComp('d1-team', Category.DIV1, Gender.MEN, Weapon.FOIL, EventType.TEAM)
    const other = makeComp('jr-ind', Category.JUNIOR, Gender.MEN, Weapon.FOIL, EventType.INDIVIDUAL)
    const result = findIndividualCounterpart(team as Competition, [other as Competition])
    expect(result).toBeUndefined()
  })
})
