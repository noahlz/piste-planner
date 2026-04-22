import { describe, it, expect } from 'vitest'
import { assignDaysByColoring, capacityPenalty } from '../../src/engine/dayColoring.ts'
import type { ConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
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
    // Tiny events so capacity-aware expansion never triggers. With no edges
    // and low strip-hours the coloring collapses to a single day.
    const comps = Array.from({ length: 5 }, (_, i) =>
      makeCompetition({ id: `c${i}`, fencer_count: 2, strips_allocated: 2 }),
    )
    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const config = makeConfig({ days_available: 3 })

    const { dayMap, effectiveDays } = assignDaysByColoring(graph, comps, config)

    // No constraints and negligible capacity demand → all on 1 day
    expect(effectiveDays).toBe(1)
    for (const [, day] of dayMap) {
      expect(day).toBeGreaterThanOrEqual(0)
      expect(day).toBeLessThan(effectiveDays)
    }
  })

  it('expands effectiveDays to the days_available cap when capacity heavily exceeds one day', () => {
    // No edges → chromatic number = 1. Six large DIV1 events vastly exceed
    // one day's capacity (dayCap = 24 strips × 14 h = 336 SH; each event's
    // weighted SH is in the tens, so 6 × ~75 = ~450 SH easily saturates
    // capacityDays beyond 4). Expansion should hit the min(days_available,
    // MAX_EXPANDED_DAYS) = 4 cap and place every event.
    const comps = Array.from({ length: 6 }, (_, i) =>
      makeCompetition({
        id: `big${i}`,
        fencer_count: 120,
        category: Category.DIV1,
        strips_allocated: 20,
      }),
    )
    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const config = makeConfig({ days_available: 4 })

    const { effectiveDays, dayMap } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(4)
    expect(dayMap.size).toBe(6)
  })

  it('days_available=1 suppresses expansion even when capacity demand is high', () => {
    // Even with huge capacity pressure, expansionCap = min(1, 4) = 1 forces
    // effectiveDays = max(chromaticN, min(capacityDays, 1)) = 1.
    const comps = Array.from({ length: 6 }, (_, i) =>
      makeCompetition({
        id: `big${i}`,
        fencer_count: 120,
        category: Category.DIV1,
        strips_allocated: 20,
      }),
    )
    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const config = makeConfig({ days_available: 1 })

    const { effectiveDays } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(1)
  })

  it('chromatic number is a hard floor that expansion cannot lower', () => {
    // 3 mutually hard-conflicting tiny events: chromaticN = 3. Their total
    // strip-hours is negligible, so capacityDays ≈ 1 — but effectiveDays must
    // stay at 3 because hard constraints require 3 distinct colors.
    const comps = [
      makeCompetition({ id: 'c1', fencer_count: 2, strips_allocated: 2 }),
      makeCompetition({ id: 'c2', fencer_count: 2, strips_allocated: 2 }),
      makeCompetition({ id: 'c3', fencer_count: 2, strips_allocated: 2 }),
    ]
    const graph = buildGraph([
      ['c1', 'c2', Infinity],
      ['c2', 'c3', Infinity],
      ['c1', 'c3', Infinity],
    ])
    const config = makeConfig({ days_available: 5 })

    const { effectiveDays } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(3)
  })

  it('Phase 2 load-balances unconstrained events away from non-empty days', () => {
    // Tight config: 2 strips × 14h = 28 SH/day. With a single big DIV1 event
    // placed first, Phase 2's per-event flat LOAD_BALANCE_FULLNESS plus the
    // capacity penalty together steer an unconstrained candidate to the other
    // day. (This scenario alone does not isolate the capacity term — see
    // 'capacityPenalty ramp' below for that.)
    const big = makeCompetition({
      id: 'big',
      fencer_count: 120,
      category: Category.DIV1,
      strips_allocated: 20,
    })
    const candidate = makeCompetition({
      id: 'candidate',
      fencer_count: 8,
      category: Category.Y8,
      strips_allocated: 2,
    })
    const graph: ConstraintGraph = new Map([
      ['big', []],
      ['candidate', []],
    ])
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(2, 0),
    })
    const { dayMap } = assignDaysByColoring(graph, [big, candidate], config)

    expect(dayMap.get('candidate')).not.toBe(dayMap.get('big'))
  })
})

describe('capacityPenalty ramp', () => {
  it('returns 0 below the 0.85 threshold', () => {
    expect(capacityPenalty(0)).toBe(0)
    expect(capacityPenalty(0.5)).toBe(0)
    expect(capacityPenalty(0.85)).toBe(0)
  })

  it('ramps linearly from 0 at 0.85 to 3.0 at 1.0', () => {
    // Mid-ramp: 0.925 → ~1.5
    expect(capacityPenalty(0.925)).toBeCloseTo(1.5, 3)
    expect(capacityPenalty(1.0)).toBeCloseTo(3.0, 3)
  })

  it('applies a steep overflow ramp above 1.0 and caps at OVERFLOW_PENALTY', () => {
    // 10% overflow → 3.0 + 0.1 * 10 = 4.0
    expect(capacityPenalty(1.1)).toBeCloseTo(4.0, 3)
    // Far past overflow is clamped at CAPACITY_PENALTY_CURVE.OVERFLOW_PENALTY (20.0)
    expect(capacityPenalty(10)).toBe(20.0)
  })
})
