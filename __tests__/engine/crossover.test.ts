import { describe, it, expect } from 'vitest'
import {
  buildPenaltyMatrix,
  crossoverPenalty,
  proximityPenalty,
  getProximityWeight,
  individualTeamProximityPenalty,
  findIndividualCounterpart,
} from '../../src/engine/crossover.ts'
import { Category, Gender, Weapon, EventType, TournamentType, VetAgeGroup } from '../../src/engine/types.ts'
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

  it('Y8↔Y12 two-hop edge is gone now that Y8→Y10 is (L9, research.md D5)', () => {
    // Y8→Y10 was Y8's only direct edge (METHODOLOGY:118: Y8 CAN and SHOULD
    // share a day with Y10). Removing it removes the two-hop derivation this
    // matrix entry came from — 0.3 → 0.0, not just the direct edge's 0.8.
    expect(matrix.get(`${Category.Y8}|${Category.Y12}`)).toBeUndefined()
    expect(matrix.get(`${Category.Y12}|${Category.Y8}`)).toBeUndefined()
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
    expect(crossoverPenalty(c1, c2, TournamentType.NAC)).toBe(expected)
  })

  it('Y8↔Y12 returns 0.0 — the two-hop consequence of removing Y8→Y10 (L9, research.md D5)', () => {
    // Y8→Y10 was Y8's only direct edge, so it was also the sole source of the
    // Y8↔Y12 two-hop edge buildPenaltyMatrix derives. Removing it drops this
    // pair too (0.3 → 0.0) — a second, deliberate change the drift review
    // must name alongside Y8↔Y10, not a copy of that assertion.
    const c1 = makeComp('a', Category.Y8, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.Y12, Gender.MEN, Weapon.FOIL)
    const result = crossoverPenalty(c1, c2, TournamentType.NAC)
    expect(result).toBe(0.0)
    expect(crossoverPenalty(c2, c1, TournamentType.NAC)).toBe(0.0)
  })

  it('Div1↔Div2 returns 3.0 — the SOFT_SEPARATION_PAIRS penalty (L3)', () => {
    // METHODOLOGY:253. The pair has no CROSSOVER_GRAPH edge at all, direct or
    // two-hop, so it scored 0.0 — unmodelled, not deliberately free. The old
    // assertion here was `.not.toBe(Infinity)`, which 0.0 satisfies: pinning
    // the value is what makes this test able to catch the defect.
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.DIV2, Gender.MEN, Weapon.FOIL)
    expect(crossoverPenalty(c1, c2, TournamentType.NAC)).toBe(3.0)
    expect(crossoverPenalty(c2, c1, TournamentType.NAC)).toBe(3.0)
  })

  it('Div1↔Div3 returns 3.0 — the SOFT_SEPARATION_PAIRS penalty (L3)', () => {
    // METHODOLOGY:254, and the same story as DIV1↔DIV2: no graph edge, so 0.0,
    // under a `.not.toBe(Infinity)` assertion that could not tell 0.0 from 3.0.
    const c1 = makeComp('a', Category.DIV1, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', Category.DIV3, Gender.MEN, Weapon.FOIL)
    expect(crossoverPenalty(c1, c2, TournamentType.NAC)).toBe(3.0)
    expect(crossoverPenalty(c2, c1, TournamentType.NAC)).toBe(3.0)
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
      const result = crossoverPenalty(a, b, TournamentType.NAC)
      expect(result).not.toBe(Infinity)
    })

    it('Vet 40 ind + Vet 40 ind (same gender+weapon, same age group) → Infinity (same population)', () => {
      const a = vetIndiv('vet40-a', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vet40-b', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(Infinity)
    })

    it('Vet 40 ind + Vet team (same gender+weapon) → Infinity (team spans all Vet ages)', () => {
      const ind = vetIndiv('vet40-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team, TournamentType.NAC)).toBe(Infinity)
    })

    it('Vet 50 ind + Vet team (same gender+weapon) → Infinity (team spans all Vet ages)', () => {
      const ind = vetIndiv('vet50-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET50)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team, TournamentType.NAC)).toBe(Infinity)
    })

    it('Vet team + Vet 40 ind (team first, ind second — symmetric direction) → Infinity', () => {
      // Verifies isSamePopulation is order-independent: the ind+team rule
      // should fire regardless of which argument is the team.
      const ind = vetIndiv('vet40-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(team, ind, TournamentType.NAC)).toBe(Infinity)
    })

    it('Vet 40 M Foil ind + Vet 40 W Foil ind (different gender) → 0.0', () => {
      const a = vetIndiv('m', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('w', Gender.WOMEN, Weapon.FOIL, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(0.0)
    })

    it('Vet 40 M Foil ind + Vet 40 M Saber ind (different weapon) → 0.0', () => {
      const a = vetIndiv('foil', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('saber', Gender.MEN, Weapon.SABRE, VetAgeGroup.VET40)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(0.0)
    })

    it('Vet 40 ind + Vet 60 ind (same gender+weapon, different age groups) → 0.0 (no negative penalty)', () => {
      // After F2a, Vet ind events of different age groups are different
      // populations and have no crossover edge to each other. The Vet Co-Day
      // rule (handled in dayColoring) is what forces them onto the same day —
      // crossoverPenalty itself is silent for this pair.
      const a = vetIndiv('vet40', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vet60', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET60)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(0.0)
    })

    it('VET40 M Foil ind + VET_COMBINED M Foil ind → Infinity (F3a hard block)', () => {
      // A fencer in VET40 typically also enters VET_COMBINED, so these must NOT share a day.
      const a = vetIndiv('vet40', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(Infinity)
    })

    it('VET_COMBINED M Foil ind + VET80 M Foil ind → Infinity (symmetric direction, F3a hard block)', () => {
      // Symmetric: VET_COMBINED first in argument order.
      const a = vetIndiv('vetcomb', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      const b = vetIndiv('vet80', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET80)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(Infinity)
    })

    it('VET40 M Foil ind + VET_COMBINED W Foil ind (different gender) → 0.0 (gender mismatch, no block)', () => {
      // Different gender — the hard block does not fire; existing matrix returns 0.0.
      const a = vetIndiv('vet40-m', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb-w', Gender.WOMEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(0.0)
    })

    it('VET40 M Foil ind + VET_COMBINED M Sabre ind (different weapon) → 0.0 (weapon mismatch, no block)', () => {
      // Different weapon — the hard block does not fire; pins the weapon guard
      // independently from the gender guard.
      const a = vetIndiv('vet40-foil', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET40)
      const b = vetIndiv('vetcomb-sabre', Gender.MEN, Weapon.SABRE, VetAgeGroup.VET_COMBINED)
      expect(crossoverPenalty(a, b, TournamentType.NAC)).toBe(0.0)
    })

    it('VET_COMBINED M Foil ind + Vet M Foil team → Infinity (same-population rule still fires, regression check)', () => {
      // isSamePopulation: ind+team of same category+gender+weapon → Infinity.
      // Verifies the existing rule wasn't broken by F3a changes.
      const ind = vetIndiv('vetcomb-ind', Gender.MEN, Weapon.FOIL, VetAgeGroup.VET_COMBINED)
      const team = vetTeam('vet-team', Gender.MEN, Weapon.FOIL)
      expect(crossoverPenalty(ind, team, TournamentType.NAC)).toBe(Infinity)
    })
  })
})

// ──────────────────────────────────────────────
// crossoverPenalty – Group 1 by tournament type (Ops Manual p.20 – Group 1,
// METHODOLOGY §Overlapping-Population Separation (Group 1), 024 D10)
// ──────────────────────────────────────────────

describe('crossoverPenalty – Group 1 by tournament type', () => {
  const NATIONAL_TYPES = [TournamentType.NAC, TournamentType.SYC, TournamentType.SJCC]
  const REGIONAL_TYPES = [TournamentType.ROC, TournamentType.RYC, TournamentType.RJCC]
  const ALL_TYPES = [...NATIONAL_TYPES, ...REGIONAL_TYPES]

  // METHODOLOGY's Group 1 table, older side first.
  const GROUP_1_PAIRS: [Category, Category][] = [
    [Category.DIV1, Category.JUNIOR],
    [Category.JUNIOR, Category.CADET],
    [Category.DIV1, Category.CADET],
    [Category.Y12, Category.Y10],
    [Category.Y14, Category.Y12],
    [Category.CADET, Category.Y14],
  ]

  /** The pair's penalty in both argument orders, same weapon and gender. */
  function bothOrders(
    a: Category,
    b: Category,
    type: TournamentType,
    aType: EventType = EventType.INDIVIDUAL,
    bType: EventType = EventType.INDIVIDUAL,
  ) {
    const c1 = makeComp('a', a, Gender.WOMEN, Weapon.EPEE, aType)
    const c2 = makeComp('b', b, Gender.WOMEN, Weapon.EPEE, bType)
    return [crossoverPenalty(c1, c2, type), crossoverPenalty(c2, c1, type)]
  }

  it.each(NATIONAL_TYPES)('%s: every Group 1 pair is a hard block, Div 1–Cadet included', (type) => {
    for (const [older, younger] of GROUP_1_PAIRS) {
      expect(bothOrders(older, younger, type), `${older}–${younger}`).toEqual([Infinity, Infinity])
    }
  })

  it.each(REGIONAL_TYPES)('%s: every Group 1 pair costs the regional Group 1 pair penalty, 5.0', (type) => {
    for (const [older, younger] of GROUP_1_PAIRS) {
      expect(bothOrders(older, younger, type), `${older}–${younger}`).toEqual([5.0, 5.0])
    }
  })

  it.each(ALL_TYPES)('%s: a Group 1 pair in another gender or another weapon costs 0 (guard)', (type) => {
    for (const [older, younger] of GROUP_1_PAIRS) {
      const base = makeComp('a', older, Gender.MEN, Weapon.FOIL)
      const otherGender = makeComp('b', younger, Gender.WOMEN, Weapon.FOIL)
      const otherWeapon = makeComp('c', younger, Gender.MEN, Weapon.SABRE)
      expect(crossoverPenalty(base, otherGender, type), `${older}–${younger} gender`).toBe(0)
      expect(crossoverPenalty(base, otherWeapon, type), `${older}–${younger} weapon`).toBe(0)
    }
  })

  it.each(ALL_TYPES)('%s: Div 1–Div 1A stays a hard block (guard, Appendix B departure)', (type) => {
    expect(bothOrders(Category.DIV1, Category.DIV1A, type)).toEqual([Infinity, Infinity])
  })

  it.each(ALL_TYPES)('%s: Y8–Y10 is not a Group 1 pair and costs nothing (guard, Appendix B departure)', (type) => {
    // METHODOLOGY: Y8 CAN and SHOULD share a day with Y10, and CROSSOVER_GRAPH
    // carries no Y8 edge (L9, research.md D5).
    expect(bothOrders(Category.Y8, Category.Y10, type)).toEqual([0, 0])
  })

  it.each([
    { label: 'a Group 1 pair', a: Category.JUNIOR, b: Category.CADET, gender: Gender.MEN },
    { label: 'a same-population pair', a: Category.JUNIOR, b: Category.JUNIOR, gender: Gender.MEN },
    { label: 'an unrelated cross-gender pair', a: Category.Y8, b: Category.VETERAN, gender: Gender.WOMEN },
  ])('throws on an unknown tournament type for $label', ({ a, b, gender }) => {
    const c1 = makeComp('a', a, Gender.MEN, Weapon.FOIL)
    const c2 = makeComp('b', b, gender, Weapon.FOIL)
    expect(() => crossoverPenalty(c1, c2, 'NATIONALS' as TournamentType)).toThrow(/tournament type/i)
  })

  it('a Cadet individual and the Div 1 team are a Group 1 pair: Infinity at NAC, 5.0 at ROC', () => {
    // Group 1 is keyed by category, weapon and gender for any mix of
    // individual and team events (D10), so the Div 1 team is the older side.
    expect(bothOrders(Category.CADET, Category.DIV1, TournamentType.NAC, EventType.INDIVIDUAL, EventType.TEAM))
      .toEqual([Infinity, Infinity])
    expect(bothOrders(Category.CADET, Category.DIV1, TournamentType.ROC, EventType.INDIVIDUAL, EventType.TEAM))
      .toEqual([5.0, 5.0])
  })

  it.each(ALL_TYPES)('%s: same-category individual and team stay a hard block (guard, Same-Population)', (type) => {
    for (const category of [Category.DIV1, Category.JUNIOR, Category.CADET, Category.Y14]) {
      expect(bothOrders(category, category, type, EventType.INDIVIDUAL, EventType.TEAM), category)
        .toEqual([Infinity, Infinity])
    }
  })

  it.each(REGIONAL_TYPES)('%s: the cross-level relaxable blocks stay Infinity (guard, Individual/Team Separation)', (type) => {
    expect(bothOrders(Category.DIV1, Category.JUNIOR, type, EventType.INDIVIDUAL, EventType.TEAM))
      .toEqual([Infinity, Infinity])
    expect(bothOrders(Category.JUNIOR, Category.DIV1, type, EventType.INDIVIDUAL, EventType.TEAM))
      .toEqual([Infinity, Infinity])
  })
})

// ──────────────────────────────────────────────
// crossoverPenalty – Group 2 soft separations (Ops Manual p.20 – Group 2,
// METHODOLOGY §Other Soft Preferences, Appendix A §Penalty Weights)
// ──────────────────────────────────────────────

describe('crossoverPenalty – Group 2 soft separations', () => {
  const ALL_TYPES = [
    TournamentType.NAC, TournamentType.SYC, TournamentType.SJCC,
    TournamentType.ROC, TournamentType.RYC, TournamentType.RJCC,
  ]

  function comp(id: string, category: Category, eventType: EventType, vetAgeGroup: VetAgeGroup | null = null) {
    return makeCompetition({
      id, category, gender: Gender.WOMEN, weapon: Weapon.EPEE, event_type: eventType, vet_age_group: vetAgeGroup,
    })
  }

  /** The pair's penalty in both argument orders. */
  function bothOrders(c1: ReturnType<typeof comp>, c2: ReturnType<typeof comp>, type: TournamentType) {
    return [crossoverPenalty(c1, c2, type), crossoverPenalty(c2, c1, type)]
  }

  it.each(ALL_TYPES)('%s: Vet Combined individual ↔ Div 1A individual costs 3.0', (type) => {
    const vet = comp('vet', Category.VETERAN, EventType.INDIVIDUAL, VetAgeGroup.VET_COMBINED)
    const d1a = comp('d1a', Category.DIV1A, EventType.INDIVIDUAL)
    expect(bothOrders(vet, d1a, type)).toEqual([3.0, 3.0])
  })

  it.each(ALL_TYPES)('%s: an age-banded Vet individual ↔ Div 1A individual costs 3.0', (type) => {
    const vet = comp('vet', Category.VETERAN, EventType.INDIVIDUAL, VetAgeGroup.VET50)
    const d1a = comp('d1a', Category.DIV1A, EventType.INDIVIDUAL)
    expect(bothOrders(vet, d1a, type)).toEqual([3.0, 3.0])
  })

  it('the Vet team ↔ Div 1A individual is outside the row and keeps its graph value, 0.1 (guard)', () => {
    // The Veteran side of the row is the Veteran individual events only.
    const vetTeam = comp('vet-team', Category.VETERAN, EventType.TEAM)
    const d1a = comp('d1a', Category.DIV1A, EventType.INDIVIDUAL)
    expect(bothOrders(vetTeam, d1a, TournamentType.ROC)).toEqual([0.1, 0.1])
  })

  it.each(ALL_TYPES)('%s: Div 2 ↔ Div 3 costs 3.0', (type) => {
    const d2 = comp('d2', Category.DIV2, EventType.INDIVIDUAL)
    const d3 = comp('d3', Category.DIV3, EventType.INDIVIDUAL)
    expect(bothOrders(d2, d3, type)).toEqual([3.0, 3.0])
  })

  it.each([TournamentType.ROC, TournamentType.NAC])('%s: a Y14 individual ↔ the Div 1 team costs 3.0', (type) => {
    const y14 = comp('y14', Category.Y14, EventType.INDIVIDUAL)
    const d1Team = comp('d1-team', Category.DIV1, EventType.TEAM)
    expect(bothOrders(y14, d1Team, type)).toEqual([3.0, 3.0])
  })

  it.each([TournamentType.ROC, TournamentType.NAC])(
    '%s: a Y14 individual ↔ the Div 1 individual is unaffected by the open-team row, 0.3 (guard)',
    (type) => {
      // Matched by event type: the Div 1 side of the row is the team event only,
      // so this pair keeps buildPenaltyMatrix's two-hop Y14–Cadet–Div 1 value.
      const y14 = comp('y14', Category.Y14, EventType.INDIVIDUAL)
      const d1 = comp('d1', Category.DIV1, EventType.INDIVIDUAL)
      expect(bothOrders(y14, d1, type)).toEqual([0.3, 0.3])
    },
  )

  it('Cadet and Junior against the Div 1 team keep their Group 1 and relaxable-block values (guard)', () => {
    // Group 1 is checked before Group 2, and the Junior individual ↔ Div 1 team
    // is a relaxable block, so the open-team row scores only Y14.
    const d1Team = comp('d1-team', Category.DIV1, EventType.TEAM)
    const cadet = comp('cdt', Category.CADET, EventType.INDIVIDUAL)
    const junior = comp('jr', Category.JUNIOR, EventType.INDIVIDUAL)
    expect(bothOrders(cadet, d1Team, TournamentType.ROC)).toEqual([5.0, 5.0])
    expect(bothOrders(cadet, d1Team, TournamentType.NAC)).toEqual([Infinity, Infinity])
    expect(bothOrders(junior, d1Team, TournamentType.ROC)).toEqual([Infinity, Infinity])
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
