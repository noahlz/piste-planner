import { describe, it, expect } from 'vitest'
import {
  assignDaysByColoring,
  capacityDemandedDays,
  capacityPenalty,
  crossWeaponSameDemographicPenalty,
  dayCapacityFactor,
} from '../../src/engine/dayColoring.ts'
import { FIRST_LAST_DAY_CAPACITY_FACTOR } from '../../src/engine/constants.ts'
import { categoryWeight, estimateCompetitionStripHours } from '../../src/engine/capacity.ts'
import type { ConstraintGraph } from '../../src/engine/constraintGraph.ts'
import type { Competition } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { Category, Gender, Weapon, EventType, TournamentType, VetAgeGroup } from '../../src/engine/types.ts'
import { buildConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'

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

    const { dayMap } = assignDaysByColoring(graph, [c1, c2], config)

    expect(dayMap.get('c1')).not.toBeUndefined()
    expect(dayMap.get('c2')).not.toBeUndefined()
    expect(dayMap.get('c1')).not.toBe(dayMap.get('c2'))
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

    const { dayMap } = assignDaysByColoring(graph, [c1, c2, c3], config)

    const days = [dayMap.get('c1'), dayMap.get('c2'), dayMap.get('c3')]
    expect(new Set(days).size).toBe(3)
  })

  // Div 1 ind ↔ Junior team is a cross-level individual/team pair, hard at
  // every tournament type (Ops Manual 2026-27 p.20 – Group 1 bullet 1,
  // METHODOLOGY §Individual/Team Separation). Cadet men's foil individual
  // conflicts with both through Group 1, hard at a national type and soft at
  // a regional one. Packing footprint (smallest last) colors junior-team last.
  function div1JuniorCadetFixture() {
    const div1Indiv = makeCompetition({
      id: 'div1-indiv',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 12,
    })
    const juniorTeam = makeCompetition({
      id: 'junior-team',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
      strips_allocated: 1,
    })
    const cadet = makeCompetition({
      id: 'cadet',
      category: Category.CADET,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 12,
    })
    return [div1Indiv, juniorTeam, cadet]
  }

  it('breaks the Div 1 ind ↔ Junior team pair when 3 mutually hard events have 2 days', () => {
    // All three pairs are hard, so with 2 days junior-team has no valid color
    // and the least-bad branch puts it beside div1-indiv on day 0: every day
    // ties at Infinity, so the lowest day (div1-indiv's) wins.
    const graph = buildGraph([
      ['div1-indiv', 'junior-team', Infinity],
      ['div1-indiv', 'cadet', Infinity],
      ['junior-team', 'cadet', Infinity],
    ])
    const config = makeConfig({ days_available: 2 })

    const { dayMap, violations } = assignDaysByColoring(graph, div1JuniorCadetFixture(), config)

    expect(dayMap.size).toBe(3)
    expect(violations.map(v => [v.id, v.targetId].sort())).toEqual([['div1-indiv', 'junior-team']])
  })

  it('at ROC on 1 day, the Div 1 ind ↔ Junior team pair stays hard and is the one violation', () => {
    // At a regional type Group 1 is soft, so both cadet edges are soft and the
    // cross-level individual/team pair is the only hard edge left.
    const competitions = div1JuniorCadetFixture()
    const graph = buildConstraintGraph(competitions, TournamentType.ROC)
    const config = makeConfig({ days_available: 1, tournament_type: TournamentType.ROC })

    const { violations } = assignDaysByColoring(graph, competitions, config)

    expect(violations.map(v => [v.id, v.targetId].sort())).toEqual([['div1-indiv', 'junior-team']])
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

    const { dayMap, effectiveDays } = assignDaysByColoring(graph, [c1, c2, c3], config)

    expect(effectiveDays).toBe(2)
    // c3 should avoid c2's day due to soft penalty (both days already open)
    expect(dayMap.get('c2')).not.toBe(dayMap.get('c3'))
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

  // METHODOLOGY §Rest Day Preference, Ops Manual p.20 – Group 2. Junior is pinned
  // to day 0 and two identical women's épée fillers to days 1 and 2, so every day
  // carries the same load and pins switch off day compaction. The soft 0.5 edge
  // rules out day 0 for the partner, leaving gap 1 (−0.4 PROXIMITY_1_DAY bonus at
  // weight 1.0, plus 1.5 if a rest-day pair) against gap 2 (0).
  function restDayGap(other: Category, tournamentType: TournamentType): number {
    const junior = makeCompetition({
      id: 'junior',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    const partner = makeCompetition({
      id: 'partner',
      category: other,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
    })
    const filler1 = makeCompetition({ id: 'filler1', category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.EPEE })
    const filler2 = makeCompetition({ id: 'filler2', category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.EPEE })
    const graph = buildGraph([['junior', 'partner', 0.5]])
    const config = makeConfig({ days_available: 3, tournament_type: tournamentType })
    const pin = (competition_id: string, day: number) =>
      ({ competition_id, day, start_time: config.DAY_START_MINS, strip_count: 1 })

    const { dayMap } = assignDaysByColoring(
      graph,
      [junior, partner, filler1, filler2],
      config,
      [pin('junior', 0), pin('filler1', 1), pin('filler2', 2)],
    )
    expect(dayMap.get('junior')).toBe(0)
    return dayMap.get('partner')!
  }

  it.each(Object.values(TournamentType))(
    'Junior and Cadet carry no rest-day penalty at %s, so the proximity bonus puts them on adjacent days',
    (tournamentType) => {
      expect(restDayGap(Category.CADET, tournamentType)).toBe(1)
    },
  )

  it.each(Object.values(TournamentType))(
    'Junior and Div 1 keep the rest day at %s: the 1.5 penalty outweighs the adjacent-day bonus',
    (tournamentType) => {
      expect(restDayGap(Category.DIV1, tournamentType)).toBe(2)
    },
  )

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

    const { dayMap } = assignDaysByColoring(graph, comps, config)

    expect(dayMap.size).toBe(3)
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
    // Tight config: 2 strips × 10h = 20 SH/day. With a single big DIV1 event
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

// ──────────────────────────────────────────────
// PROXIMITY_3_PLUS_DAYS wiring (L1 / US4, T017)
//
// colorPenalty's adjacent-day block (dayColoring.ts:280-300) reads
// `if (dayGap !== 1) continue` before it ever looks at PROXIMITY_3_PLUS_DAYS,
// so a gap of 3+ has never been read — only the gap-of-1 bonus applies. T018
// splits this into a gap-of-1 branch (rest-day check + PROXIMITY_1_DAY,
// unchanged) and a gap-of-3-or-more branch (PROXIMITY_3_PLUS_DAYS); a gap of
// 2 gets neither (research.md D7, FR-012).
//
// Both tests below use the same technique as the VET_COMBINED day-after test
// above: a K4 of mutually hard-conflicting fillers, ordered by packing
// footprint (strips_allocated × categoryWeight) so DSatur's tie-breaks
// deterministically place each filler on a known day. CADET↔Y14 is a real
// PROXIMITY_GRAPH pair (weight 1.0) that is also GROUP_1_MANDATORY (hard), so
// it gives a genuine hard-separated, proximity-related pair without needing a
// synthetic edge for the category relationship — only the graph's structure
// (which days are open) is synthetic.
// ──────────────────────────────────────────────

describe('colorPenalty — PROXIMITY_3_PLUS_DAYS (L1)', () => {
  it('gap of 1 keeps its bonus, unaffected by the gap-3+ term T018 adds (pinned)', () => {
    // K4: x0, x1, cadet, x3 mutually hard-conflict (Infinity). All four start
    // at saturation 0 and hard-degree 3 (tied), so packing footprint decides
    // processing order: x0 (12.0) > x1 (9.0) > cadet (5.2) > x3 (1.4). Each
    // is colored onto the lowest day not yet blocked, in that order, landing
    // cadet in the middle at day 2 — deliberately not day 0, so the winning
    // day below can't be explained by "lowest index wins ties".
    //
    // y14's edge to cadet is a large FINITE weight (20), not Infinity: an
    // Infinity edge here would give cadet a 4th hard neighbor and win the
    // first pick on degree instead of footprint, upsetting the ordering
    // above. A same-day cost of 20 rules out day 2 for y14 just as surely.
    const x0 = makeCompetition({ id: 'x0', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 8 })
    const x1 = makeCompetition({ id: 'x1', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 6 })
    const cadet = makeCompetition({ id: 'cadet', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 4 })
    const x3 = makeCompetition({ id: 'x3', category: Category.DIV3, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 2 })
    const y14 = makeCompetition({ id: 'y14', category: Category.Y14, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 1 })

    const graph = buildGraph([
      ['x0', 'x1', Infinity], ['x0', 'cadet', Infinity], ['x0', 'x3', Infinity],
      ['x1', 'cadet', Infinity], ['x1', 'x3', Infinity],
      ['cadet', 'x3', Infinity],
      ['cadet', 'y14', 20.0], // large soft cost, not hard — see comment above
    ])
    const config = makeConfig({ days_available: 4 })

    const { dayMap } = assignDaysByColoring(graph, [x0, x1, cadet, x3, y14], config)

    // Sanity: the clique lands exactly where the footprint argument predicts.
    expect(dayMap.get('x0')).toBe(0)
    expect(dayMap.get('x1')).toBe(1)
    expect(dayMap.get('cadet')).toBe(2)
    expect(dayMap.get('x3')).toBe(3)

    // y14 is free to land on any of the 4 days (no hard edge blocks it).
    // Day 2 (same day as cadet) costs 20 outright. Day 0 is gap=2 from cadet
    // (0, both before and after T018). Days 1 and 3 are BOTH gap=1 from cadet
    // (|1-2|=1, |3-2|=1) and tie at -0.4 each (PROXIMITY_1_DAY × weight 1.0)
    // plus identical load-balancing fullness (one clique member already sits
    // on every day) — strictly better than day 0's 0. If the bonus were gone,
    // days 0/1/3 would all tie at 0 and day 0 (lowest index) would win
    // instead, so landing on 1 is what proves the bonus fired. Ties among 1
    // and 3 break to whichever is checked first (day 1).
    expect(dayMap.get('y14')).toBe(1)
  })

  it('gap of 3+ gains PROXIMITY_3_PLUS_DAYS, and a gap of 2 stays untouched', () => {
    // Same K4 mechanism, cadet fixed at day 0 this time (its edge to the
    // floater is the one under test, and here it may safely be Infinity: the
    // floater — y14team — has only this one edge, so it never contends for
    // the first pick regardless of the edge's weight). x1 and x3 are inert
    // fillers; y14ind doubles as y14team's individual counterpart — same
    // category/gender/weapon, EventType.INDIVIDUAL — found by
    // findIndividualCounterpart independent of any graph edge, giving a
    // second, independently-controlled day-gap term to pit against the
    // proximity term under test.
    const cadet = makeCompetition({ id: 'cadet', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 8 })
    const x1 = makeCompetition({ id: 'x1', category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 6 })
    const y14ind = makeCompetition({ id: 'y14ind', category: Category.Y14, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.INDIVIDUAL, strips_allocated: 4 })
    const x3 = makeCompetition({ id: 'x3', category: Category.DIV3, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 2 })
    const y14team = makeCompetition({ id: 'y14team', category: Category.Y14, gender: Gender.MEN, weapon: Weapon.FOIL, event_type: EventType.TEAM, strips_allocated: 1 })

    const graph = buildGraph([
      ['cadet', 'x1', Infinity], ['cadet', 'y14ind', Infinity], ['cadet', 'x3', Infinity],
      ['x1', 'y14ind', Infinity], ['x1', 'x3', Infinity],
      ['y14ind', 'x3', Infinity],
      ['cadet', 'y14team', Infinity], // the pair under test
    ])
    const config = makeConfig({ days_available: 4 })

    const { dayMap } = assignDaysByColoring(graph, [cadet, x1, y14ind, x3, y14team], config)

    // Sanity: the clique lands exactly where the footprint argument predicts.
    expect(dayMap.get('cadet')).toBe(0)
    expect(dayMap.get('x1')).toBe(1)
    expect(dayMap.get('y14ind')).toBe(2)
    expect(dayMap.get('x3')).toBe(3)

    // y14team's open days are {1, 2, 3} (0 is blocked by the cadet edge).
    // Load-balancing fullness is identical on every candidate (one clique
    // member already sits on each day), so it cancels and is dropped below.
    //   day 1: proximity gap=1 from cadet (-0.4)
    //          + individual/team gap=-1, team-before-individual (+1.0) = +0.6
    //   day 2: proximity gap=2 (0, both regimes)
    //          + same day as its individual counterpart (0.0)            = 0.0
    //   day 3: proximity gap=3 (0 TODAY / +0.5 after T018)
    //          + individual/team gap=+1, day-after bonus (-0.4)
    //          = -0.4 TODAY / +0.1 after T018
    // TODAY: -0.4 < 0.0 < 0.6 — day 3 wins, proving gap>=3 carries no term
    // yet (the day-after bonus is free to pull the floater as far as it
    // likes). After T018, day 3 becomes 0.1 > day 2's 0.0, so day 2 wins
    // instead: the new term lands on gap 3 and is strong enough to flip this
    // case, and day 2's total is still exactly 0.0 — proving gap 2 itself
    // stayed untouched.
    expect(dayMap.get('y14team')).toBe(2)
  })
})

// ──────────────────────────────────────────────
// DSatur least-bad-color fallback reporting (R7 / US2, T007)
//
// When every color is blocked for a vertex, dsaturLoop's least-bad-color
// branch picks a color anyway. R7 (T009) made assignDaysByColoring return the
// broken hard-edge pairs so the caller can report them instead of leaving no
// trace. These tests pin that return shape:
//
//   assignDaysByColoring(...): {
//     dayMap, effectiveDays,
//     violations: { id: string; targetId: string }[]
//   }
//
// One entry per hard-edged pair sharing a day, order-insensitive between
// `id` and `targetId`.
// ──────────────────────────────────────────────

describe('assignDaysByColoring — least-bad-color fallback violations (R7)', () => {
  // specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md) pins the strip count: colorPenalty's load-balancing term
  // reads dayCapacity = strips_total × DAY_LENGTH_MINS / 60, so the witness
  // pairs for NAC Cadet/Junior differ at 39 (app-suggested) vs 80/12 strips
  // even though the violation count is 6 at both. 80/12 matches the venue
  // __tests__/engine/integration.test.ts uses for the same templates.
  const STRIPS = 80
  const VIDEO_STRIPS = 12

  function pairKey(a: string, b: string): string {
    return [a, b].sort().join('|')
  }

  /** Exactly one violation per expected pair, order-insensitive within and across pairs. */
  function expectViolationPairs(violations: { id: string; targetId: string }[], expectedPairs: [string, string][]) {
    expect(violations.length).toBe(expectedPairs.length)
    const actualKeys = violations.map(v => pairKey(v.id, v.targetId)).sort()
    const expectedKeys = expectedPairs.map(([a, b]) => pairKey(a, b)).sort()
    expect(actualKeys).toEqual(expectedKeys)
  }

  /** Builds one template through the app's own configuration path, exactly as specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md)/§3 measured it. */
  function buildTemplate(name: string) {
    useStore.setState(useStore.getInitialState(), true)
    const state = () => useStore.getState()
    state().applyTemplate(name)
    state().setDays(3) // hand-lowered board: 3 days set after the template, below the K4 templates' 4
    state().setStrips(STRIPS)
    state().setVideoStrips(VIDEO_STRIPS)
    return buildTournamentConfig(state())
  }

  // specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md)
  it('NAC Cadet/Junior at 3 days / 80 strips / 12 video: one violation per hard-edged pair sharing day 0, naming both ids (6 pairs, least-bad branch)', () => {
    const { config, competitions } = buildTemplate('NAC Cadet/Junior')
    const graph = buildConstraintGraph(competitions, config.tournament_type)

    const { violations } = assignDaysByColoring(graph, competitions, config)

    // specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md) "Witness pairs" table, 80 strips / 12 video column.
    const expectedPairs: [string, string][] = [
      ['CDT-M-EPEE-TEAM', 'JR-M-EPEE-TEAM'],
      ['CDT-M-FOIL-TEAM', 'JR-M-FOIL-TEAM'],
      ['CDT-M-SABRE-IND', 'JR-M-SABRE-TEAM'],
      ['CDT-W-EPEE-TEAM', 'JR-W-EPEE-TEAM'],
      ['CDT-W-FOIL-TEAM', 'JR-W-FOIL-TEAM'],
      ['CDT-W-SABRE-TEAM', 'JR-W-SABRE-TEAM'],
    ]

    expectViolationPairs(violations, expectedPairs)
  })

  // specs/010-wave-1-reconciliation/baseline.md §2 (removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/baseline.md)
  it('NAC Youth at 3 days / 80 strips / 12 video: hard-constraint graph is satisfiable in the days available, reports no violations (viol=0)', () => {
    const { config, competitions } = buildTemplate('NAC Youth')
    const graph = buildConstraintGraph(competitions, config.tournament_type)

    const { violations } = assignDaysByColoring(graph, competitions, config)

    expect(violations.length).toBe(0)
  })

  // 019 R4: Div 1 and Junior team never share a day, so no pair is lifted and the
  // least-bad branch breaks six hard pairs, like NAC Cadet/Junior. The
  // pairs are the R4 counterfactual's (specs/019-default-days-per-template/plan.md
  // §Measurements, "NAC Div1/Junior|3|@80").
  it('NAC Div1/Junior on a hand-lowered 3-day board / 80 strips / 12 video: one violation per hard-edged pair sharing a day, naming both ids (6 pairs, least-bad branch)', () => {
    const { config, competitions } = buildTemplate('NAC Div1/Junior')
    const graph = buildConstraintGraph(competitions, config.tournament_type)

    const { violations } = assignDaysByColoring(graph, competitions, config)

    expectViolationPairs(violations, [
      ['D1-M-EPEE-IND', 'JR-M-EPEE-TEAM'],
      ['D1-M-FOIL-TEAM', 'JR-M-FOIL-TEAM'],
      ['D1-M-SABRE-TEAM', 'JR-M-SABRE-TEAM'],
      ['D1-W-EPEE-TEAM', 'JR-W-EPEE-TEAM'],
      ['D1-W-FOIL-TEAM', 'JR-W-FOIL-TEAM'],
      ['D1-W-SABRE-TEAM', 'JR-W-SABRE-TEAM'],
    ])
  })

  // Regression capture, not a red test. The expected map below is the day map
  // after 024 group D's same-day rules (first and last day capacity, Group 3,
  // no Junior–Cadet rest day). It pins today's coloring so a later change that
  // moves a day assignment shows up here. It no longer evidences that R7's
  // violations reporting changed no decision (FR-004, FR-005): that held for
  // the pre-024 map, which group D replaced.
  it('NAC Cadet/Junior at 3 days / 80 strips / 12 video: the day map is the post-024-group-D capture', () => {
    const { config, competitions } = buildTemplate('NAC Cadet/Junior')
    const graph = buildConstraintGraph(competitions, config.tournament_type)

    const { dayMap } = assignDaysByColoring(graph, competitions, config)

    // Captured from the current code, not derived from this same call.
    // Re-captured in 024 group D, whose owner-approved rules move six events.
    // Three rules interact, so the effect is order-dependent. As a path from
    // the final state, found in a throwaway probe:
    // - turning the Group 3 cross-weapon preference (Ops Manual p.20 – Group 3,
    //   METHODOLOGY.md §Other Soft Preferences) off reverts four events:
    //   CDT-M-FOIL-IND, CDT-W-SABRE-IND, JR-M-FOIL-IND and JR-W-SABRE-IND. With
    //   it on, no Cadet or Junior individual demographic keeps all three
    //   weapons on one day
    // - with the 0.8 first/last day factor on and Group 3 off, restoring the
    //   Junior–Cadet rest day (METHODOLOGY.md §Rest Day Preference) moves four
    //   events: CDT-M-SABRE-TEAM and JR-M-SABRE-IND back to their pre-024 days,
    //   and CDT-W-FOIL-TEAM and JR-W-FOIL-IND off theirs. The 0.8 factor alone
    //   moves those last two: with the factor at 1.0, Group 3 off and the rest
    //   day on, the map equals the pre-024 map
    // - with the factor off, Group 3 alone moves two and the rest day alone
    //   moves four, and both together give the final six
    const expectedDayMap: Record<string, number> = {
      'CDT-M-EPEE-IND': 2,
      'CDT-M-EPEE-TEAM': 0,
      'CDT-M-FOIL-IND': 1,
      'CDT-M-FOIL-TEAM': 0,
      'CDT-M-SABRE-IND': 0,
      'CDT-M-SABRE-TEAM': 2,
      'CDT-W-EPEE-IND': 1,
      'CDT-W-EPEE-TEAM': 0,
      'CDT-W-FOIL-IND': 1,
      'CDT-W-FOIL-TEAM': 0,
      'CDT-W-SABRE-IND': 2,
      'CDT-W-SABRE-TEAM': 0,
      'JR-M-EPEE-IND': 1,
      'JR-M-EPEE-TEAM': 0,
      'JR-M-FOIL-IND': 2,
      'JR-M-FOIL-TEAM': 0,
      'JR-M-SABRE-IND': 1,
      'JR-M-SABRE-TEAM': 0,
      'JR-W-EPEE-IND': 2,
      'JR-W-EPEE-TEAM': 0,
      'JR-W-FOIL-IND': 2,
      'JR-W-FOIL-TEAM': 0,
      'JR-W-SABRE-IND': 1,
      'JR-W-SABRE-TEAM': 0,
    }

    expect(Object.fromEntries(dayMap)).toEqual(expectedDayMap)
  })
})

// ──────────────────────────────────────────────
// Veteran Age-Group Co-Day Rule (F2b)
//
// Per METHODOLOGY §Veteran Age-Group Co-Day Rule: all Vet *individual* events
// for a given (gender, weapon) must be on the same day. Hard rule, beyond
// Same-Population Conflicts — forces *consolidation*, not separation.
// ──────────────────────────────────────────────

describe('assignDaysByColoring — Veteran Co-Day Rule', () => {
  it('Vet 40 + Vet 50 + Vet 60 (same gender+weapon, all individual) → all on the same day', () => {
    const vet40 = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const vet50 = makeCompetition({
      id: 'vet50-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET50,
    })
    const vet60 = makeCompetition({
      id: 'vet60-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET60,
    })

    const graph = buildConstraintGraph([vet40, vet50, vet60], TournamentType.NAC)
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [vet40, vet50, vet60], config)

    const d40 = dayMap.get('vet40-m-foil')
    const d50 = dayMap.get('vet50-m-foil')
    const d60 = dayMap.get('vet60-m-foil')
    expect(d40).toBeDefined()
    expect(d50).toBe(d40)
    expect(d60).toBe(d40)
  })

  it('Vet 40 individual + Vet 40 team (same gender+weapon, same age group) → different days (Same-Population block)', () => {
    const vet40Indiv = makeCompetition({
      id: 'vet40-m-foil-ind',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const vetTeam = makeCompetition({
      id: 'vet-m-foil-team',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.TEAM,
      vet_age_group: null,
    })

    const graph = buildConstraintGraph([vet40Indiv, vetTeam], TournamentType.NAC)
    const config = makeConfig({ days_available: 2 })

    const { dayMap } = assignDaysByColoring(graph, [vet40Indiv, vetTeam], config)

    expect(dayMap.get('vet40-m-foil-ind')).not.toBe(dayMap.get('vet-m-foil-team'))
  })

  it('Vet 40 M Foil + Vet 40 W Foil (different gender) → NOT bound by Co-Day rule (placed on different days when forced)', () => {
    // The Co-Day rule binds within (gender, weapon). When a hard edge would
    // force separation between M and W Vets of the same age group, the rule
    // must NOT veto the separation by binding them together.
    const m = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const w = makeCompetition({
      id: 'vet40-w-foil',
      category: Category.VETERAN,
      gender: Gender.WOMEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })

    // Synthetic hard edge to force separation. If the Co-Day rule were
    // misfiring across genders, the algorithm would still try to bind them
    // and fail (the assertion would catch it via dayMap inequality).
    const graph = buildGraph([['vet40-m-foil', 'vet40-w-foil', Infinity]])
    const config = makeConfig({ days_available: 2 })

    const { dayMap } = assignDaysByColoring(graph, [m, w], config)

    expect(dayMap.get('vet40-m-foil')).not.toBe(dayMap.get('vet40-w-foil'))
  })

  it('Vet 40 M Foil + Vet 40 M Saber (different weapon) → NOT bound by Co-Day rule (placed on different days when forced)', () => {
    const foil = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const saber = makeCompetition({
      id: 'vet40-m-saber',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })

    const graph = buildGraph([['vet40-m-foil', 'vet40-m-saber', Infinity]])
    const config = makeConfig({ days_available: 2 })

    const { dayMap } = assignDaysByColoring(graph, [foil, saber], config)

    expect(dayMap.get('vet40-m-foil')).not.toBe(dayMap.get('vet40-m-saber'))
  })

  it('Co-Day rule binds to the sibling\'s actual day (not a hardcoded zero)', () => {
    // If a sibling Vet ind ends up colored on day 1 (not day 0), subsequent
    // Vet ind events of the same gender+weapon must also land on day 1.
    // We pin Vet 40 to day 1 by giving it a hard edge to a non-Vet event
    // that DSatur will color on day 0 first.
    const blocker = makeCompetition({
      id: 'blocker',
      category: Category.DIV1,
      gender: Gender.MEN,
      weapon: Weapon.SABRE,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 16, // larger packing footprint → colored first → day 0
    })
    const vet40 = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
      strips_allocated: 8,
    })
    const vet50 = makeCompetition({
      id: 'vet50-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET50,
      strips_allocated: 8,
    })
    // Hard edge between blocker and vet40: blocker takes day 0, vet40 must
    // take day 1. Then vet50 must follow vet40 to day 1 via Co-Day.
    const graph = buildGraph([
      ['blocker', 'vet40-m-foil', Infinity],
    ])
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [blocker, vet40, vet50], config)

    expect(dayMap.get('blocker')).toBe(0)
    expect(dayMap.get('vet40-m-foil')).toBe(1)
    expect(dayMap.get('vet50-m-foil')).toBe(1)
  })

  it('Co-Day rule survives load-balancing pressure that would otherwise scatter the Vets', () => {
    // Three Vet ind events (M Foil) plus six unrelated Y10 W Epee events.
    // Without the Co-Day rule, load balancing would likely scatter the Vets
    // across multiple days. The rule forces all three Vets onto the same day
    // regardless of how the unrelated events are spread.
    const vet40 = makeCompetition({
      id: 'vet40-m-foil', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL, vet_age_group: VetAgeGroup.VET40,
    })
    const vet50 = makeCompetition({
      id: 'vet50-m-foil', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL, vet_age_group: VetAgeGroup.VET50,
    })
    const vet60 = makeCompetition({
      id: 'vet60-m-foil', category: Category.VETERAN, gender: Gender.MEN, weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL, vet_age_group: VetAgeGroup.VET60,
    })
    // Six other unrelated events to give load-balancing room to scatter
    const others = [0, 1, 2, 3, 4, 5].map(i => makeCompetition({
      id: `other-${i}`, category: Category.Y10, gender: Gender.WOMEN, weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL, fencer_count: 200, strips_allocated: 8,
    }))

    const all = [vet40, vet50, vet60, ...others]
    const graph = buildConstraintGraph(all, TournamentType.NAC)
    const config = makeConfig({ days_available: 4 })

    const { dayMap } = assignDaysByColoring(graph, all, config)

    const d40 = dayMap.get('vet40-m-foil')
    const d50 = dayMap.get('vet50-m-foil')
    const d60 = dayMap.get('vet60-m-foil')
    expect(d40).toBeDefined()
    expect(d50).toBe(d40)
    expect(d60).toBe(d40)
  })

  it('VET40 + VET60 share a day; VET_COMBINED is on a different day (F3a)', () => {
    // Co-Day rule must bind VET40 and VET60 together, but must NOT bind
    // VET_COMBINED to that same day. VET_COMBINED must land on a different day
    // because fencers typically enter their age-banded event AND VET_COMBINED.
    const vet40 = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const vet60 = makeCompetition({
      id: 'vet60-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET60,
    })
    const vetCombined = makeCompetition({
      id: 'vetcomb-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET_COMBINED,
    })

    const graph = buildConstraintGraph([vet40, vet60, vetCombined], TournamentType.NAC)
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [vet40, vet60, vetCombined], config)

    const d40 = dayMap.get('vet40-m-foil')
    const d60 = dayMap.get('vet60-m-foil')
    const dComb = dayMap.get('vetcomb-m-foil')

    expect(d40).toBeDefined()
    expect(d60).toBe(d40)
    expect(dComb).toBeDefined()
    expect(dComb).not.toBe(d40)
  })

  it('VET_COMBINED alone (no age-banded siblings) → assigns successfully (F3a)', () => {
    // Co-Day rule must not crash or fail when no age-banded Vet ind siblings exist.
    // The rule simply does not bind in that case.
    const vetCombined = makeCompetition({
      id: 'vetcomb-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET_COMBINED,
    })

    const graph = buildConstraintGraph([vetCombined], TournamentType.NAC)
    const config = makeConfig({ days_available: 3 })

    const { dayMap } = assignDaysByColoring(graph, [vetCombined], config)

    const dComb = dayMap.get('vetcomb-m-foil')
    expect(dComb).toBe(0)
  })
})

describe('assignDaysByColoring — VET_COMBINED Day-After Preference (F3c)', () => {
  it('VET_COMBINED prefers the day immediately after the age-banded co-day', () => {
    // VET40 + VET60 + VET80 (age-banded) must all share co-day D via Co-Day rule.
    // VET_COMBINED soft preference should steer it to D+1.
    //
    // DSatur ordering note: VET_COMBINED has 3 hard edges (to the three age-banded
    // siblings via F3a), giving it the highest initial degree. DSatur would color it
    // first — before any sibling is colored — making the soft penalty inactive.
    // To force a sibling to be colored first, we add a "blocker" event that has hard
    // edges to all three age-banded siblings (degree=3, same as VET_COMBINED) but
    // a much larger packing footprint (strips_allocated=20 vs 8). Footprint breaks
    // the tie, so the blocker is colored first (day 0). That gives VET40/60/80 each
    // saturation=1, beating VET_COMBINED's saturation=0. The first age-banded Vet
    // (VET40, by Set insertion order) is colored on day 1 (blocked from day 0).
    // Now vetCombinedOrderingPenalty fires for VET_COMBINED with sibling on day 1:
    //   day 0 → gap=-1 → penalty 1.0; day 2 → gap=1 → bonus -0.4; day 3 → gap=2 → 0.3
    // VET_COMBINED picks day 2 (gap=1, lowest cost). Result: d40=1, dComb=2=d40+1.
    const blocker = makeCompetition({
      id: 'blocker-div1',
      category: Category.DIV1,
      gender: Gender.WOMEN, // different gender/weapon — no same-population conflict
      weapon: Weapon.EPEE,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 20, // footprint tiebreak over VET_COMBINED (default 8)
    })
    const vet40 = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const vet60 = makeCompetition({
      id: 'vet60-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET60,
    })
    const vet80 = makeCompetition({
      id: 'vet80-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET80,
    })
    const vetCombined = makeCompetition({
      id: 'vetcomb-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET_COMBINED,
    })

    // Build the constraint graph for Vet events (F3a hard edges: vetcomb ↔ each banded),
    // then inject the blocker with hard edges to all three age-banded siblings only.
    const vetComps = [vet40, vet60, vet80, vetCombined]
    const graph = buildConstraintGraph(vetComps, TournamentType.NAC)
    graph.set('blocker-div1', [
      { targetId: 'vet40-m-foil', weight: Infinity },
      { targetId: 'vet60-m-foil', weight: Infinity },
      { targetId: 'vet80-m-foil', weight: Infinity },
    ])
    graph.get('vet40-m-foil')!.push({ targetId: 'blocker-div1', weight: Infinity })
    graph.get('vet60-m-foil')!.push({ targetId: 'blocker-div1', weight: Infinity })
    graph.get('vet80-m-foil')!.push({ targetId: 'blocker-div1', weight: Infinity })

    const comps = [blocker, vet40, vet60, vet80, vetCombined]
    const config = makeConfig({ days_available: 4 })

    const { dayMap } = assignDaysByColoring(graph, comps, config)

    const d40 = dayMap.get('vet40-m-foil')!
    const d60 = dayMap.get('vet60-m-foil')!
    const d80 = dayMap.get('vet80-m-foil')!
    const dComb = dayMap.get('vetcomb-m-foil')!

    // Co-Day rule (F3a): all age-banded Vets share the same day
    expect(d40).toBeDefined()
    expect(d60).toBe(d40)
    expect(d80).toBe(d40)

    // F3c soft preference: VET_COMBINED should land on the day immediately after co-day
    expect(dComb).toBe(d40 + 1)
  })

  it('soft-preference falls back gracefully when D+1 is occupied (no crash, F3a still holds)', () => {
    // Same Vet events plus a JUNIOR event that will naturally occupy D+1.
    // The important assertions are:
    //   1. VET_COMBINED is NOT on the age-banded co-day (F3a hard rule holds).
    //   2. VET_COMBINED is assigned a valid integer day (no crash).
    const vet40 = makeCompetition({
      id: 'vet40-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET40,
    })
    const vet60 = makeCompetition({
      id: 'vet60-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET60,
    })
    const vet80 = makeCompetition({
      id: 'vet80-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET80,
    })
    const vetCombined = makeCompetition({
      id: 'vetcomb-m-foil',
      category: Category.VETERAN,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      vet_age_group: VetAgeGroup.VET_COMBINED,
    })
    // Large Junior event to create capacity pressure and occupy other days
    const junior = makeCompetition({
      id: 'junior-m-foil',
      category: Category.JUNIOR,
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      event_type: EventType.INDIVIDUAL,
      fencer_count: 200,
      strips_allocated: 16,
    })

    const comps = [vet40, vet60, vet80, vetCombined, junior]
    const graph = buildConstraintGraph(comps, TournamentType.NAC)
    const config = makeConfig({ days_available: 4 })

    const { dayMap } = assignDaysByColoring(graph, comps, config)

    const dVet40 = dayMap.get('vet40-m-foil')!
    const dVet60 = dayMap.get('vet60-m-foil')!
    const dVet80 = dayMap.get('vet80-m-foil')!
    const dComb = dayMap.get('vetcomb-m-foil')

    // VET_COMBINED must be assigned (no crash)
    expect(dComb).toBeDefined()
    // VET_COMBINED must be on a valid day within the available range
    expect(dComb).toBeGreaterThanOrEqual(0)
    expect(dComb).toBeLessThan(4)
    // F3a hard rule must still hold: VET_COMBINED not on the age-banded co-day
    expect(dComb).not.toBe(dVet40)
    expect(dComb).not.toBe(dVet60)
    expect(dComb).not.toBe(dVet80)
    // The soft preference is genuinely soft — we do not assert VET_COMBINED is on D+1
    // because this test is specifically about fallback behavior when capacity pressure exists
  })
})

// ──────────────────────────────────────────────
// Group 3 cross-weapon preference (Ops Manual p.20 – Group 3, METHODOLOGY
// §Other Soft Preferences "Cross-Weapon Same Demographic" 0.2)
// ──────────────────────────────────────────────

describe('crossWeaponSameDemographicPenalty — Group 3', () => {
  const self = (overrides: Partial<Competition> = {}) =>
    makeCompetition({ id: 'self', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL, ...overrides })
  const other = (id: string, overrides: Partial<Competition> = {}) =>
    makeCompetition({ id, category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE, ...overrides })
  const vet40 = { category: Category.VETERAN, vet_age_group: VetAgeGroup.VET40 }

  /** Scores `s` on day 0 against the `others`, each already coloured onto day 0. */
  function scoreOnDay0(s: Competition, others: Competition[]): number {
    const coloring = new Map(others.map(o => [o.id, 0]))
    return crossWeaponSameDemographicPenalty(s, 0, [s, ...others], coloring)
  }

  it.each([
    { label: 'a non-Veteran category, individual (Cadet M foil + Cadet M sabre)', s: self(), o: other('o'), expected: 0.2 },
    { label: 'a team pair (Cadet M foil team + Cadet M sabre team)', s: self({ event_type: EventType.TEAM }), o: other('o', { event_type: EventType.TEAM }), expected: 0.2 },
    { label: 'VETERAN, same age group (Vet 40 foil + Vet 40 épée)', s: self(vet40), o: other('o', { ...vet40, weapon: Weapon.EPEE }), expected: 0.2 },
    { label: 'VETERAN, different age group (Vet 40 foil + Vet 50 épée)', s: self(vet40), o: other('o', { category: Category.VETERAN, vet_age_group: VetAgeGroup.VET50, weapon: Weapon.EPEE }), expected: 0 },
    { label: 'VETERAN, age-banded against Vet Combined', s: self(vet40), o: other('o', { category: Category.VETERAN, vet_age_group: VetAgeGroup.VET_COMBINED }), expected: 0 },
    { label: 'different event types (Cadet M foil ind + Cadet M sabre team)', s: self(), o: other('o', { event_type: EventType.TEAM }), expected: 0 },
    { label: 'different gender (Cadet M foil + Cadet W sabre)', s: self(), o: other('o', { gender: Gender.WOMEN }), expected: 0 },
    { label: 'different category (Cadet M foil + Junior M sabre)', s: self(), o: other('o', { category: Category.JUNIOR }), expected: 0 },
    { label: 'the same weapon (not a cross-weapon pair)', s: self(), o: other('o', { weapon: Weapon.FOIL }), expected: 0 },
  ])('$label → $expected', ({ s, o, expected }) => {
    expect(scoreOnDay0(s, [o])).toBe(expected)
  })

  it('is 0 when the cross-weapon sibling is on another day', () => {
    const s = self()
    const o = other('o')
    expect(crossWeaponSameDemographicPenalty(s, 0, [s, o], new Map([['o', 1]]))).toBe(0)
  })

  it('scores each same-day cross-weapon sibling once (foil with épée and sabre → 0.4)', () => {
    expect(scoreOnDay0(self(), [other('sabre'), other('epee', { weapon: Weapon.EPEE })])).toBeCloseTo(0.4, 10)
  })

  it('steers day colouring: a Cadet M sabre with no edges leaves the Cadet M foil day', () => {
    // foil and x hard-conflict, so they take days 0 and 1 (foil first, by
    // packing footprint). The sabre has no edges, so both days cost it the same
    // load-balance fullness and the tie would go to day 0 – the foil's day.
    // Only the Group 3 term separates them.
    const foil = makeCompetition({ id: 'foil', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.FOIL, strips_allocated: 8 })
    const x = makeCompetition({ id: 'x', category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.EPEE, strips_allocated: 6 })
    const sabre = makeCompetition({ id: 'sabre', category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE, strips_allocated: 1 })
    const graph = buildGraph([['foil', 'x', Infinity]])
    graph.set('sabre', [])

    const { dayMap } = assignDaysByColoring(graph, [foil, x, sabre], makeConfig({ days_available: 2 }))

    expect(dayMap.get('foil')).toBe(0)
    expect(dayMap.get('x')).toBe(1)
    expect(dayMap.get('sabre')).toBe(1)
  })
})

/**
 * First and last day capacity (024 D10, METHODOLOGY.md §First and Last Day
 * Capacity, Appendix A §Capacity Model Constants – Ops Manual p.20, Group 2:
 * the first and last days should be planned shorter than the days between).
 * From 3 days up, colours 0 and N−1 get FIRST_LAST_DAY_CAPACITY_FACTOR (0.8)
 * of a middle day's strip-hours, in Phase 2's fill ratio and in day expansion.
 */
describe('first and last day capacity', () => {
  it('is 0.8 of a middle day', () => {
    expect(FIRST_LAST_DAY_CAPACITY_FACTOR).toBe(0.8)
  })

  it.each([
    [1, [1]],
    [2, [1, 1]],
    [3, [0.8, 1, 0.8]],
    [4, [0.8, 1, 1, 0.8]],
  ])('at %i days gives colours the factors %j', (nDays, factors) => {
    expect(Array.from({ length: nDays }, (_, c) => dayCapacityFactor(c, nDays))).toEqual(factors)
  })

  // x is what day expansion asks capacityDemandedDays for: the weighted
  // strip-hour demand in middle days at the target fill, i.e. totalStripHours /
  // (dayCapacity × CAPACITY_TARGET_FILL). Without the factor, expansion takes
  // ceil(x). With the factor, N days hold N middle days below 3 days and
  // N − 2 + 2 × 0.8 = N − 0.4 from 3 up, so 3 days hold 2.6 and 4 days 3.6:
  // 2 / 2.0001 is the two-to-three edge (unchanged, no factor at 2 days) and
  // 2.6 / 2.61 the three-to-four edge, which moves from 3 to 4.
  it.each([
    [0.5, 1],
    [2, 2],
    [2.0001, 3],
    [2.6, 3],
    [2.61, 4],
  ])('expansion asks for %f middle days and gets %i days', (x, days) => {
    expect(capacityDemandedDays(x)).toBe(days)
  })

  it('steers a 3-day colouring\'s fourth event to the middle day when the edge days would pass 0.85 fill', () => {
    // Four equal, unconstrained Y12 foil events on 3 days. DSatur's tie-break
    // puts the first three on colours 0, 1 and 2 (one each). The fourth then
    // sees one event on every day. The strip count is sized so one event's fill
    // f of a middle day sits in (0.68, 0.85]: no penalty in the middle, but
    // f / 0.8 > 0.85 on the edge days, where the capacity penalty starts. So
    // the fourth lands on the middle day. Without the factor every day ties and
    // it takes colour 0.
    const comps = ['A', 'B', 'C', 'D'].map(id =>
      makeCompetition({ id, category: Category.Y12, weapon: Weapon.FOIL, fencer_count: 200 }),
    )
    const base = makeConfig({ days_available: 3 })
    const eventSH = estimateCompetitionStripHours(comps[0], base).total_strip_hours * categoryWeight(comps[0])
    const strips = Math.round(eventSH / 7.5)
    const config = makeConfig({ days_available: 3, strips: makeStrips(strips, 0) })
    const fill = eventSH / (strips * (config.DAY_LENGTH_MINS / 60))
    expect(fill).toBeGreaterThan(0.68)
    expect(fill).toBeLessThanOrEqual(0.85)

    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const { dayMap, effectiveDays } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(3)
    expect(['A', 'B', 'C'].map(id => dayMap.get(id))).toEqual([0, 1, 2])
    expect(dayMap.get('D')).toBe(1)
  })

  // Wiring: day expansion in assignDaysByColoring goes through
  // capacityDemandedDays. Eight equal, unconstrained Y12 foil events on 4
  // available days (chromatic number 1) sized so the weighted strip-hours fill
  // `ratio` of one middle day: strips = round(total / (ratio × DAY_LENGTH hours)).
  // x = ratio / CAPACITY_TARGET_FILL (0.3). At ratio 0.85, x ≈ 2.83: ceil(x) says
  // 3 days but 3 days hold only 2.6 middle days, so the helper says 4. At ratio
  // 0.70, x ≈ 2.33 sits under 2.6 and both say 3.
  it.each([
    [0.85, 4],
    [0.7, 3],
  ])('expands to the days capacityDemandedDays asks for at a middle-day fill of %f (%i days)', (ratio, days) => {
    const comps = Array.from({ length: 8 }, (_, i) =>
      makeCompetition({ id: `E${i}`, category: Category.Y12, weapon: Weapon.FOIL, fencer_count: 200 }),
    )
    const base = makeConfig({ days_available: 4 })
    const totalSH = comps.reduce(
      (sum, c) => sum + estimateCompetitionStripHours(c, base).total_strip_hours * categoryWeight(c),
      0,
    )
    const dayHours = base.DAY_LENGTH_MINS / 60
    const strips = Math.round(totalSH / (ratio * dayHours))
    const config = makeConfig({ days_available: 4, strips: makeStrips(strips, 0) })
    const actualRatio = totalSH / (strips * dayHours)
    expect(actualRatio).toBeGreaterThan(ratio - 0.03)
    expect(actualRatio).toBeLessThan(ratio + 0.03)

    const graph: ConstraintGraph = new Map(comps.map(c => [c.id, []]))
    const { effectiveDays } = assignDaysByColoring(graph, comps, config)

    expect(effectiveDays).toBe(days)
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
