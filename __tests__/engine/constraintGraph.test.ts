import { describe, it, expect } from 'vitest'
import { buildConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { makeCompetition } from '../helpers/factories.ts'
import { Category, Gender, Weapon, EventType } from '../../src/engine/types.ts'

describe('buildConstraintGraph', () => {
  it('returns an empty graph for empty input', () => {
    const graph = buildConstraintGraph([])
    expect(graph.size).toBe(0)
  })

  it('same population -> hard edge (Infinity) from crossoverPenalty', () => {
    // Two DIV1 MEN FOIL INDIVIDUAL competitions share the same population
    const c1 = makeCompetition({ id: 'div1-men-foil-1', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const c2 = makeCompetition({ id: 'div1-men-foil-2', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })

    const graph = buildConstraintGraph([c1, c2])

    const edges1 = graph.get('div1-men-foil-1')!
    expect(edges1).toHaveLength(1)
    expect(edges1[0].targetId).toBe('div1-men-foil-2')
    expect(edges1[0].weight).toBe(Infinity)

    const edges2 = graph.get('div1-men-foil-2')!
    expect(edges2).toHaveLength(1)
    expect(edges2[0].targetId).toBe('div1-men-foil-1')
    expect(edges2[0].weight).toBe(Infinity)
  })

  it('GROUP_1_MANDATORY -> hard edge (Infinity) from crossoverPenalty', () => {
    // DIV1 + JUNIOR same gender (MEN) + weapon (EPEE) -> GROUP_1_MANDATORY
    const div1 = makeCompetition({ id: 'div1-men-epee', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.EPEE, event_type: EventType.INDIVIDUAL })
    const junior = makeCompetition({ id: 'junior-men-epee', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.EPEE, event_type: EventType.INDIVIDUAL })

    const graph = buildConstraintGraph([div1, junior])

    const edges = graph.get('div1-men-epee')!
    expect(edges).toHaveLength(1)
    expect(edges[0].targetId).toBe('junior-men-epee')
    expect(edges[0].weight).toBe(Infinity)
  })

  it('CROSSOVER_GRAPH -> soft edge (finite weight > 0) from crossoverPenalty', () => {
    // DIV1 + VETERAN same gender (WOMEN) + weapon (SABRE) -> soft crossover penalty
    const div1 = makeCompetition({ id: 'div1-women-sabre', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.SABRE, event_type: EventType.INDIVIDUAL })
    const vet = makeCompetition({ id: 'vet-women-sabre', category: Category.VETERAN, gender: Gender.WOMEN, weapon: Weapon.SABRE, event_type: EventType.INDIVIDUAL })

    const graph = buildConstraintGraph([div1, vet])

    const edges = graph.get('div1-women-sabre')!
    expect(edges).toHaveLength(1)
    expect(edges[0].targetId).toBe('vet-women-sabre')
    expect(edges[0].weight).toBeGreaterThan(0)
    expect(edges[0].weight).toBeLessThan(Infinity)
    // VETERAN ↔ DIV1 has a small (~0.1) penalty: the populations rarely
    // overlap (~5–10% of vets enter Div1), so this is a soft preference
    // the day-coloring will happily relax under contention.
    expect(edges[0].weight).toBeCloseTo(0.1, 2)
  })

  it('different gender events -> no edge', () => {
    const men = makeCompetition({ id: 'div1-men-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const women = makeCompetition({ id: 'div1-women-foil', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })

    const graph = buildConstraintGraph([men, women])

    expect(graph.get('div1-men-foil')).toHaveLength(0)
    expect(graph.get('div1-women-foil')).toHaveLength(0)
  })

  it('different weapon events -> no edge', () => {
    const foil = makeCompetition({ id: 'div1-men-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const epee = makeCompetition({ id: 'div1-men-epee', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.EPEE, event_type: EventType.INDIVIDUAL })

    const graph = buildConstraintGraph([foil, epee])

    expect(graph.get('div1-men-foil')).toHaveLength(0)
    expect(graph.get('div1-men-epee')).toHaveLength(0)
  })

  it('Same-population: VET INDIVIDUAL + VET TEAM same gender+weapon -> hard edge (Infinity, ind+team always blocks)', () => {
    // Per METHODOLOGY §Same-Population Conflicts, Vet ind + Vet team (same
    // gender+weapon) are hard-blocked because the team event spans all Vet
    // age groups. Hard at every relaxation level — NOT in INDIV_TEAM_RELAXABLE_BLOCKS.
    const vetIndiv = makeCompetition({ id: 'vet-men-foil-indiv', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const vetTeam = makeCompetition({ id: 'vet-men-foil-team', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM })

    const graph = buildConstraintGraph([vetIndiv, vetTeam])

    const edges = graph.get('vet-men-foil-indiv')!
    expect(edges).toHaveLength(1)
    expect(edges[0].targetId).toBe('vet-men-foil-team')
    expect(edges[0].weight).toBe(Infinity)

    const edgesTeam = graph.get('vet-men-foil-team')!
    expect(edgesTeam).toHaveLength(1)
    expect(edgesTeam[0].targetId).toBe('vet-men-foil-indiv')
    expect(edgesTeam[0].weight).toBe(Infinity)
  })

  it('INDIV_TEAM_RELAXABLE_BLOCKS: DIV1 INDIVIDUAL + JUNIOR TEAM same gender+weapon -> hard edge (Infinity)', () => {
    const div1Indiv = makeCompetition({ id: 'div1-men-foil-indiv', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL })
    const juniorTeam = makeCompetition({ id: 'junior-men-foil-team', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM })

    const graph = buildConstraintGraph([div1Indiv, juniorTeam])

    const edges = graph.get('div1-men-foil-indiv')!
    expect(edges).toHaveLength(1)
    expect(edges[0].targetId).toBe('junior-men-foil-team')
    expect(edges[0].weight).toBe(Infinity)
  })

  it('symmetry: every edge A->B has a matching B->A edge with the same weight', () => {
    // Build a realistic set of competitions across multiple categories
    const competitions = [
      makeCompetition({ id: 'div1-men-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL }),
      makeCompetition({ id: 'junior-men-foil', category: Category.JUNIOR, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL }),
      makeCompetition({ id: 'vet-men-foil-indiv', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL }),
      makeCompetition({ id: 'vet-men-foil-team', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM }),
      makeCompetition({ id: 'div1-women-foil', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL }),
      makeCompetition({ id: 'div1-men-epee', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.EPEE, event_type: EventType.INDIVIDUAL }),
      makeCompetition({ id: 'cadet-men-foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL }),
    ]

    const graph = buildConstraintGraph(competitions)

    // Verify symmetry: for every edge A->B, there must be a matching B->A
    for (const [sourceId, edges] of graph.entries()) {
      for (const edge of edges) {
        const reverseEdges = graph.get(edge.targetId)!
        const reverseEdge = reverseEdges.find(e => e.targetId === sourceId)
        expect(reverseEdge).toBeDefined()
        expect(reverseEdge!.weight).toBe(edge.weight)
      }
    }
  })

  it('all competitions appear as keys even with no edges', () => {
    const foil = makeCompetition({ id: 'div1-men-foil', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL })
    const epee = makeCompetition({ id: 'div1-women-epee', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.EPEE })

    const graph = buildConstraintGraph([foil, epee])

    expect(graph.has('div1-men-foil')).toBe(true)
    expect(graph.has('div1-women-epee')).toBe(true)
    expect(graph.get('div1-men-foil')).toHaveLength(0)
    expect(graph.get('div1-women-epee')).toHaveLength(0)
  })
})
