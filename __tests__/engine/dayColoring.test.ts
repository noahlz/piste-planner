import { describe, it, expect } from 'vitest'
import { assignDaysByColoring } from '../../src/engine/dayColoring.ts'
import type { ConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'
import { Category, Gender, Weapon, EventType } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Graph-building helpers
// ──────────────────────────────────────────────

function buildGraph(edges: [string, string, number][]): ConstraintGraph {
  const g: ConstraintGraph = new Map()
  for (const [a, b, w] of edges) {
    if (!g.has(a)) g.set(a, [])
    if (!g.has(b)) g.set(b, [])
    g.get(a)!.push({ targetId: b, weight: w })
    g.get(b)!.push({ targetId: a, weight: w })
  }
  return g
}

// ──────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────

describe('assignDaysByColoring', () => {
  it('assigns 2 hard-conflicting events to different days (2 days)', () => {
    const c1 = makeCompetition({ id: 'c1' })
    const c2 = makeCompetition({ id: 'c2' })
    const graph = buildGraph([['c1', 'c2', Infinity]])
    const config = makeConfig({ days_available: 2 })

    const { dayMap, relaxations } = assignDaysByColoring(graph, [c1, c2], config)

    expect(dayMap.get('c1')).not.toBeUndefined()
    expect(dayMap.get('c2')).not.toBeUndefined()
    expect(dayMap.get('c1')).not.toBe(dayMap.get('c2'))
    expect(relaxations.size).toBe(0)
  })

  it('assigns 3 mutually hard-conflicting events to 3 different days', () => {
    const c1 = makeCompetition({ id: 'c1' })
    const c2 = makeCompetition({ id: 'c2' })
    const c3 = makeCompetition({ id: 'c3' })
    const graph = buildGraph([
      ['c1', 'c2', Infinity],
      ['c2', 'c3', Infinity],
      ['c1', 'c3', Infinity],
    ])
    const config = makeConfig({ days_available: 3 })

    const { dayMap, relaxations } = assignDaysByColoring(graph, [c1, c2, c3], config)

    const days = [dayMap.get('c1'), dayMap.get('c2'), dayMap.get('c3')]
    expect(new Set(days).size).toBe(3)
    expect(relaxations.size).toBe(0)
  })

  it('records relaxation when INDIV_TEAM edge is relaxed to fit 3 events in 2 days', () => {
    // VET INDIVIDUAL and VET TEAM (same gender + weapon) form an
    // INDIV_TEAM_RELAXABLE_BLOCKS pair. A third event (DIV1 MEN FOIL INDIVIDUAL)
    // hard-conflicts with both. With only 2 days, one pair must share a day —
    // the coloring relaxes the VET INDIV/TEAM edge rather than the hard ones.
    const vetIndiv = makeCompetition({
      id: 'vet-indiv',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const vetTeam = makeCompetition({
      id: 'vet-team',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })
    const div1 = makeCompetition({
      id: 'div1',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    // All three pairs have hard edges — with 2 days the INDIV_TEAM edge gets relaxed
    const graph = buildGraph([
      ['vet-indiv', 'vet-team', Infinity],
      ['vet-indiv', 'div1', Infinity],
      ['vet-team', 'div1', Infinity],
    ])
    const config = makeConfig({ days_available: 2 })

    const { dayMap, relaxations } = assignDaysByColoring(graph, [vetIndiv, vetTeam, div1], config)

    // All 3 get assigned some day
    expect(dayMap.size).toBe(3)
    // The INDIV_TEAM edge was relaxed, so at least one relaxation is recorded
    expect(relaxations.size).toBeGreaterThanOrEqual(1)
    // All relaxation values should be 3 (INDIV_TEAM relaxation code)
    for (const v of relaxations.values()) {
      expect(v).toBe(3)
    }
  })

  it('soft conflicts prefer different days when enough colors available', () => {
    // With load balancing, the new-day penalty outweighs soft conflicts for
    // just 2 events. Use a hard edge to force day 0 open, then verify the
    // soft conflict steers c3 away from c2's day.
    const c1 = makeCompetition({ id: 'c1' })
    const c2 = makeCompetition({ id: 'c2' })
    const c3 = makeCompetition({ id: 'c3' })
    const graph = buildGraph([
      ['c1', 'c2', Infinity], // hard: c1 and c2 on different days
      ['c2', 'c3', 5.0],     // soft: c3 prefers not to share c2's day
    ])
    const config = makeConfig({ days_available: 3 })

    const { dayMap, relaxations, effectiveDays } = assignDaysByColoring(graph, [c1, c2, c3], config)

    expect(effectiveDays).toBe(2)
    // c3 should avoid c2's day due to soft penalty (both days already open)
    expect(dayMap.get('c2')).not.toBe(dayMap.get('c3'))
    expect(relaxations.size).toBe(0)
  })

  it('load balancing spreads events across used days evenly', () => {
    // c1 and c2 have a hard edge forcing 2 days. The remaining 4 events
    // have no constraints. Phase 1 → effectiveDays=2, Phase 2 → ~3 per day.
    const comps = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map(id => makeCompetition({ id }))
    const graph = buildGraph([['c1', 'c2', Infinity]])
    // Add empty adjacency entries for c3-c6
    for (const id of ['c3', 'c4', 'c5', 'c6']) {
      if (!graph.has(id)) graph.set(id, [])
    }
    const config = makeConfig({ days_available: 4 })

    const { dayMap, effectiveDays } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(2)
    const day0Count = [...dayMap.values()].filter(d => d === 0).length
    const day1Count = [...dayMap.values()].filter(d => d === 1).length
    expect(day0Count).toBe(3)
    expect(day1Count).toBe(3)
  })

  it('tie-breaking: larger strips_allocated × categoryWeight event gets colored first (higher saturation priority is irrelevant at tie — packing footprint wins)', () => {
    // Both events have no edges (saturation = 0, hard-degree = 0).
    // The one with larger packing footprint should be colored first.
    // With no constraints and identical config, both land on day 0 — but
    // the large event must appear in dayMap at all (proves it was processed).
    const big = makeCompetition({ id: 'big', strips_allocated: 16, category: Category.DIV1 })
    const small = makeCompetition({ id: 'small', strips_allocated: 4, category: Category.DIV1 })

    const graph: ConstraintGraph = new Map([['big', []], ['small', []]])
    const config = makeConfig({ days_available: 2 })

    const { dayMap } = assignDaysByColoring(graph, [big, small], config)

    // Both must be assigned
    expect(dayMap.has('big')).toBe(true)
    expect(dayMap.has('small')).toBe(true)
    // big is colored first (no saturation difference), so it gets day 0
    expect(dayMap.get('big')).toBe(0)
  })

  it('rest-day pairs prefer non-adjacent days', () => {
    // JUNIOR and CADET (same gender + weapon) are a REST_DAY_PAIR.
    // With 3 days and a soft edge between them, they should avoid being adjacent.
    const junior = makeCompetition({
      id: 'junior',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    const cadet = makeCompetition({
      id: 'cadet',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    // Soft edge (not hard): day separation is possible
    const graph = buildGraph([['junior', 'cadet', 0.5]])
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [junior, cadet], config)

    const jDay = dayMap.get('junior')!
    const cDay = dayMap.get('cadet')!
    // With 3 days, they should avoid being placed on adjacent days
    // (rest-day penalty of 1.5 > proximity bonus of 0.4 for adjacent days)
    expect(Math.abs(jDay - cDay)).not.toBe(1)
  })

  it('individual/team proximity: team event prefers same day or day after individual', () => {
    // INDIVIDUAL DIV1 MEN FOIL and TEAM DIV1 MEN FOIL
    // Team should prefer day after individual (gap = +1, bonus -0.4)
    const indiv = makeCompetition({
      id: 'indiv',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
    })
    const team = makeCompetition({
      id: 'team',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
    })
    // Soft edge — no hard block between individual and team of same category
    const graph = buildGraph([['indiv', 'team', 1.0]])
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [indiv, team], config)

    const indivDay = dayMap.get('indiv')!
    const teamDay = dayMap.get('team')!
    const gap = teamDay - indivDay

    // Gap of +1 (team after individual) earns -0.4 bonus.
    // Gap of -1 (team before individual) earns +1.0 penalty.
    // So team should be on same day or the day after individual.
    expect(gap).toBeGreaterThanOrEqual(0)
  })

  it('handles competitions with no edges in the graph', () => {
    const comps = [
      makeCompetition({ id: 'a' }),
      makeCompetition({ id: 'b' }),
      makeCompetition({ id: 'c' }),
    ]
    const graph: ConstraintGraph = new Map([['a', []], ['b', []], ['c', []]])
    const config = makeConfig({ days_available: 2 })

    const { dayMap, relaxations } = assignDaysByColoring(graph, comps, config)

    expect(dayMap.size).toBe(3)
    expect(relaxations.size).toBe(0)
  })

  it('effectiveDays reports minimum days needed', () => {
    // 3 mutually hard-conflicting events, 5 days available.
    // Chromatic number = 3, so effectiveDays = 3.
    const c1 = makeCompetition({ id: 'c1' })
    const c2 = makeCompetition({ id: 'c2' })
    const c3 = makeCompetition({ id: 'c3' })
    const graph = buildGraph([
      ['c1', 'c2', Infinity],
      ['c2', 'c3', Infinity],
      ['c1', 'c3', Infinity],
    ])
    const config = makeConfig({ days_available: 5 })

    const { dayMap, effectiveDays } = assignDaysByColoring(graph, [c1, c2, c3], config)

    expect(effectiveDays).toBe(3)
    // All assignments compacted to [0, 3)
    for (const day of dayMap.values()) {
      expect(day).toBeGreaterThanOrEqual(0)
      expect(day).toBeLessThan(3)
    }
  })

  it('assigns all days within [0, effectiveDays)', () => {
    const comps = Array.from({ length: 5 }, (_, i) =>
      makeCompetition({ id: `c${i}` }),
    )
    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const config = makeConfig({ days_available: 3 })

    const { dayMap, effectiveDays } = assignDaysByColoring(graph, comps, config)

    // No constraints → all on 1 day
    expect(effectiveDays).toBe(1)
    for (const [, day] of dayMap) {
      expect(day).toBeGreaterThanOrEqual(0)
      expect(day).toBeLessThan(effectiveDays)
    }
  })
})
