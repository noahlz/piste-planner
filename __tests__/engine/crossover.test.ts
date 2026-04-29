import { describe, it, expect } from 'vitest'
import {
  buildPenaltyMatrix,
  crossoverPenalty,
  proximityPenalty,
  getProximityWeight,
  individualTeamProximityPenalty,
  findIndividualCounterpart,
} from '../../src/engine/crossover.ts'
import { Category, Gender, Weapon, EventType, VetAgeGroup } from '../../src/engine/types.ts'
import { CROSSOVER_GRAPH } from '../../src/engine/constants.ts'
import type { ScheduleResult } from '../../src/engine/types.ts'
import { makeComp, makeCompetition, makeScheduleResult } from '../helpers/factories.ts'


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
      label: 'Same gender, same weapon, CADET↔DIV2 → 0.8',
      c1: makeComp('a', Category.CADET, Gender.WOMEN, Weapon.EPEE),
      c2: makeComp('b', Category.DIV2, Gender.WOMEN, Weapon.EPEE),
      expected: 0.8,
    },
    {
      label: 'Same gender, different weapon, Y10↔Y12 → 0.0',
      c1: makeComp('a', Category.Y10, Gender.MEN, Weapon.FOIL),
      c2: makeComp('b', Category.Y12, Gender.MEN, Weapon.EPEE),
      expected: 0.0,
    },
    {
      label: 'Same gender, same weapon, VET↔DIV1 → 0.1 (rare fencer overlap)',
      c1: makeComp('a', Category.VETERAN, Gender.WOMEN, Weapon.SABRE),
      c2: makeComp('b', Category.DIV1, Gender.WOMEN, Weapon.SABRE),
      expected: 0.1,
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

  it('Y8↔Y10 is NOT a hard conflict — returns 0.8, not Infinity', () => {
    // Y8/Y10 were removed from GROUP_1_MANDATORY; they can and should share a day.
    const c1 = makeComp('a', Category.Y8, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.Y10, Gender.MEN, Weapon.FOIL)
    const result = crossoverPenalty(c1, c2)
    expect(result).toBe(0.8)
    expect(result).not.toBe(Infinity)
  })

  it('Div1↔Cadet returns soft penalty (0.8), not Infinity — moved to SOFT_SEPARATION_PAIRS', () => {
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.CADET, Gender.MEN, Weapon.FOIL)
    const result = crossoverPenalty(c1, c2)
    expect(result).toBe(0.8)
    expect(result).not.toBe(Infinity)
  })

  it('Div1↔Div1A returns Infinity (GROUP_1_MANDATORY)', () => {
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.DIV1A, Gender.MEN, Weapon.FOIL)
    expect(crossoverPenalty(c1, c2)).toBe(Infinity)
  })

  it('Div1↔Div2 returns soft penalty (not Infinity) — moved to SOFT_SEPARATION_PAIRS', () => {
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.DIV2, Gender.MEN, Weapon.FOIL)
    expect(crossoverPenalty(c1, c2)).not.toBe(Infinity)
  })

  it('Div1↔Div3 returns soft penalty (not Infinity) — moved to SOFT_SEPARATION_PAIRS', () => {
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.DIV3, Gender.MEN, Weapon.FOIL)
    expect(crossoverPenalty(c1, c2)).not.toBe(Infinity)
  })

  it('All CROSSOVER_GRAPH direct edges are ≤ 0.8', () => {
    for (const [, neighbours] of Object.entries(CROSSOVER_GRAPH)) {
      for (const [, weight] of Object.entries(neighbours as Record<string, number>)) {
        expect(weight).toBeLessThanOrEqual(0.8)
      }
    }
  })

  // ──────────────────────────────────────────────
  // Veteran age-group same-population (F2a)
  //
  // Per METHODOLOGY §Same-Population Conflicts: for Veterans, "category" is
  // read as the full (VETERAN, vet_age_group) pair. Different vet_age_groups
  // are *different* populations and not blocked by the same-population check
  // (they are forced *together* by the Vet Co-Day rule, which lives in
  // dayColoring, not crossoverPenalty). Same-population is still Infinity
  // when both events share the same vet_age_group, OR when one is a Vet
  // individual and the other is a Vet team (the team event spans all Vet
  // age groups).
  // ──────────────────────────────────────────────

  describe('crossoverPenalty — Veteran vet_age_group handling', () => {
    function vetIndiv(id: string, gender: Gender, weapon: Weapon, ageGroup: VetAgeGroup) {
      return makeCompetition({ id, category: Category.VETERAN, gender, weapon, event_type: EventType.INDIVIDUAL, vet_age_group: ageGroup })
    }
    function vetTeam(id: string, gender: Gender, weapon: Weapon) {
      return makeCompetition({ id, category: Category.VETERAN, gender, weapon, event_type: EventType.TEAM, vet_age_group: null })
    }

    it('Vet 40 ind + Vet 50 ind (same gender+weapon) → NOT Infinity (different vet_age_groups, different populations)', () => {
      const a = vetIndiv('vet40', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vet50', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET50)
      const result = crossoverPenalty(a, b)
      expect(result).not.toBe(Infinity)
    })

    it('Vet 40 ind + Vet 40 ind (same gender+weapon, same age group) → Infinity (same population)', () => {
      const a = vetIndiv('vet40-a', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vet40-b', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b)).toBe(Infinity)
    })

    it('Vet 40 ind + Vet team (same gender+weapon) → Infinity (team spans all Vet ages)', () => {
      const ind = vetIndiv('vet40-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team)).toBe(Infinity)
    })

    it('Vet 50 ind + Vet team (same gender+weapon) → Infinity (team spans all Vet ages)', () => {
      const ind = vetIndiv('vet50-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET50)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team)).toBe(Infinity)
    })

    it('Vet team + Vet 40 ind (team first, ind second — symmetric direction) → Infinity', () => {
      // Verifies isSamePopulation is order-independent: the ind+team rule
      // should fire regardless of which argument is the team.
      const ind = vetIndiv('vet40-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(team, ind)).toBe(Infinity)
    })

    it('Vet 40 M Foil ind + Vet 40 W Foil ind (different gender) → 0.0', () => {
      const a = vetIndiv('m', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('w', Gender.WOMEN, Weapon.FOIL, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b)).toBe(0.0)
    })

    it('Vet 40 M Foil ind + Vet 40 M Saber ind (different weapon) → 0.0', () => {
      const a = vetIndiv('foil', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('saber', Gender.MEN, Weapon.SABRE, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b)).toBe(0.0)
    })

    it('Vet 40 ind + Vet 60 ind (same gender+weapon, different age groups) → 0.0 (no negative penalty)', () => {
      // After F2a, Vet ind events of different age groups are different
      // populations and have no crossover edge to each other. The Vet Co-Day
      // rule (handled in dayColoring) is what forces them onto the same day —
      // crossoverPenalty itself is silent for this pair.
      const a = vetIndiv('vet40', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vet60', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET60)
      expect(crossoverPenalty(a, b)).toBe(0.0)
    })

    it('VET40 M Foil ind + VET_COMBINED M Foil ind → Infinity (F3a hard block)', () => {
      // A fencer in VET40 typically also enters VET_COMBINED, so these must NOT share a day.
      const a = vetIndiv('vet40', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b)).toBe(Infinity)
    })

    it('VET_COMBINED M Foil ind + VET80 M Foil ind → Infinity (symmetric direction, F3a hard block)', () => {
      // Symmetric: VET_COMBINED first in argument order.
      const a = vetIndiv('vetcomb', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      const b = vetIndiv('vet80', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET80)
      expect(crossoverPenalty(a, b)).toBe(Infinity)
    })

    it('VET40 M Foil ind + VET_COMBINED W Foil ind (different gender) → 0.0 (gender mismatch, no block)', () => {
      // Different gender — the hard block does not fire; existing matrix returns 0.0.
      const a = vetIndiv('vet40-m', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb-w', Gender.WOMEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b)).toBe(0.0)
    })

    it('VET40 M Foil ind + VET_COMBINED M Sabre ind (different weapon) → 0.0 (weapon mismatch, no block)', () => {
      // Different weapon — the hard block does not fire; pins the weapon guard
      // independently from the gender guard.
      const a = vetIndiv('vet40-foil', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb-sabre', Gender.MEN, Weapon.SABRE, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b)).toBe(0.0)
    })

    it('VET_COMBINED M Foil ind + Vet M Foil team → Infinity (same-population rule still fires, regression check)', () => {
      // isSamePopulation: ind+team of same category+gender+weapon → Infinity.
      // Verifies the existing rule wasn't broken by F3a changes.
      const ind = vetIndiv('vetcomb-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team)).toBe(Infinity)
    })
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
  const div1 = makeCompetition({ id: 'div1', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
  const junior = makeCompetition({ id: 'junior', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL })
  const juniorWomen = makeCompetition({ id: 'junior-w', category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.FOIL })
  const juniorEpee = makeCompetition({ id: 'junior-e', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.EPEE })
  const y10 = makeCompetition({ id: 'y10', category: Category.Y10, gender: Gender.MEN, weapon: Weapon.FOIL })

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=1 → negative bonus (-0.4 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 1),
    }
    // div1 proposed day=2, junior on day=1 → gap=1 → -0.4 * 1.0 = -0.4
    const result = proximityPenalty(div1, 2, schedule, [junior])
    expect(result).toBeCloseTo(-0.4)
  })

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=0 → 0.0 (same day handled elsewhere)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 2),
    }
    const result = proximityPenalty(div1, 2, schedule, [junior])
    expect(result).toBe(0.0)
  })

  it('Same gender+weapon, DIV1↔JUNIOR, day_gap=3 → positive penalty (0.5 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 0),
    }
    // div1 proposed day=3, junior on day=0 → gap=3 → 0.5 * 1.0 = 0.5
    const result = proximityPenalty(div1, 3, schedule, [junior])
    expect(result).toBeCloseTo(0.5)
  })

  it('Different gender → 0.0 regardless', () => {
    const schedule: Record<string, ScheduleResult> = {
      'junior-w': makeScheduleResult('junior-w', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [juniorWomen])
    expect(result).toBe(0.0)
  })

  it('Different weapon → 0.0 regardless', () => {
    const schedule: Record<string, ScheduleResult> = {
      'junior-e': makeScheduleResult('junior-e', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [juniorEpee])
    expect(result).toBe(0.0)
  })

  it('Non-proximity pair (DIV1↔Y10) → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      y10: makeScheduleResult('y10', 0),
    }
    const result = proximityPenalty(div1, 3, schedule, [y10])
    expect(result).toBe(0.0)
  })

  it('day_gap=4 → clamped to 3, same penalty as gap=3 (0.5 × 1.0)', () => {
    const schedule: Record<string, ScheduleResult> = {
      junior: makeScheduleResult('junior', 0),
    }
    // div1 proposed day=4, junior on day=0 → gap=4, clamped to 3 → 0.5 * 1.0
    const result = proximityPenalty(div1, 4, schedule, [junior])
    expect(result).toBeCloseTo(0.5)
  })
})

// ──────────────────────────────────────────────
// individualTeamProximityPenalty
// ──────────────────────────────────────────────

describe('individualTeamProximityPenalty', () => {
  const teamComp = makeCompetition({ id: 'div1-team', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM })
  const indComp = makeCompetition({ id: 'div1-ind', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })

  it('TEAM event, individual scheduled day before → -0.4 bonus', () => {
    // team on proposed day=2, individual on day=1 → gap = 2-1 = 1 → -0.4
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 1),
    }
    const result = individualTeamProximityPenalty(
      teamComp,
      2,
      schedule,
      [indComp],
    )
    expect(result).toBe(-0.4)
  })

  it('TEAM event, individual scheduled same day → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 2),
    }
    const result = individualTeamProximityPenalty(
      teamComp,
      2,
      schedule,
      [indComp],
    )
    expect(result).toBe(0.0)
  })

  it('TEAM event, individual scheduled day after (team before ind) → 1.0 penalty', () => {
    // team proposed day=1, individual on day=2 → gap = 1-2 = -1 → 1.0
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 2),
    }
    const result = individualTeamProximityPenalty(
      teamComp,
      1,
      schedule,
      [indComp],
    )
    expect(result).toBe(1.0)
  })

  it('TEAM event, individual 2+ days after (team far before ind) → 0.3 penalty', () => {
    // team proposed day=0, individual on day=3 → gap = 0-3 = -3 → too far apart
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 3),
    }
    const result = individualTeamProximityPenalty(
      teamComp,
      0,
      schedule,
      [indComp],
    )
    expect(result).toBe(0.3)
  })

  it('INDIVIDUAL event → 0.0', () => {
    const schedule: Record<string, ScheduleResult> = {
      'div1-ind': makeScheduleResult('div1-ind', 1),
    }
    const result = individualTeamProximityPenalty(
      indComp,
      2,
      schedule,
      [indComp],
    )
    expect(result).toBe(0.0)
  })
})

// ──────────────────────────────────────────────
// findIndividualCounterpart
// ──────────────────────────────────────────────

describe('findIndividualCounterpart', () => {
  it('finds matching individual for a team event', () => {
    const team = makeCompetition({ id: 'd1-team', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM })
    const ind = makeCompetition({ id: 'd1-ind', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const other = makeCompetition({ id: 'd1w-ind', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const result = findIndividualCounterpart(team, [ind, other, team])
    expect(result?.id).toBe('d1-ind')
  })

  it('returns undefined when no match exists', () => {
    const team = makeCompetition({ id: 'd1-team', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM })
    const other = makeCompetition({ id: 'jr-ind', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const result = findIndividualCounterpart(team, [other])
    expect(result).toBeUndefined()
  })
})
