/**
 * The engine backstop for fencer counts it cannot size (018 T4, owner rulings
 * R5 and R6). One predicate, `isSizeableCount`, decides it: a whole number
 * inside the config's MIN_FENCERS–MAX_FENCERS. Every pool-math caller skips an
 * unsizeable event instead of throwing on it or returning NaN. Tests marked
 * *guard* pass before and after the change by design.
 */
import { describe, it, expect } from 'vitest'
import { isSizeableCount } from '../../src/engine/pools.ts'
import { initialAnalysis } from '../../src/engine/analysis.ts'
import { validateConfig } from '../../src/engine/validation.ts'
import { deriveEventSchedule, estimateEventFootprint } from '../../src/engine/derive.ts'
import { flagFlightingCandidates, recommendRefCount } from '../../src/engine/stripBudget.ts'
import { suggestFlightingGroups, validateFlightingGroup } from '../../src/engine/flighting.ts'
import { suggestStripCount } from '../../src/engine/analysis.ts'
import { busiestDayCompetitors, scanStripCounts } from '../../src/engine/stripSearch.ts'
import { BottleneckRule, CutMode, ValidationMode, Weapon } from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makePlacement } from '../helpers/factories.ts'

const config = makeConfig()

/** Counts the engine cannot size: below 2, fractional, non-finite, above the maximum. */
const UNSIZEABLE: readonly number[] = [0, 1, 1.5, 30.5, NaN, Infinity, config.MAX_FENCERS + 1]

function event(id: string, fencer_count: number, overrides: Partial<Competition> = {}): Competition {
  return makeCompetition({ id, fencer_count, ...overrides })
}

describe('isSizeableCount', () => {
  const cases: [number, boolean][] = [
    ...UNSIZEABLE.map((n): [number, boolean] => [n, false]),
    [-2, false],
    [-Infinity, false],
    [2, true],
    [24, true],
    [config.MAX_FENCERS, true],
  ]
  it.each(cases)('%s → %s', (count, expected) => {
    expect(isSizeableCount(count, config)).toBe(expected)
  })

  it('reads its bounds from the config it is given', () => {
    expect(isSizeableCount(10, { MIN_FENCERS: 2, MAX_FENCERS: 9 })).toBe(false)
  })

  it('never admits a count below 2, whatever the config says, since a pool needs two fencers', () => {
    expect(isSizeableCount(1, { MIN_FENCERS: 1, MAX_FENCERS: 500 })).toBe(false)
  })

  it('reads the minimum side of its bounds, not only the pool floor of 2', () => {
    expect(isSizeableCount(5, { MIN_FENCERS: 8, MAX_FENCERS: 500 })).toBe(false)
  })
})

describe('initialAnalysis skips an unsizeable event', () => {
  it('does not throw with one event at 0 fencers and one at 1, and names neither', () => {
    const competitions = [event('zero', 0), event('one', 1), event('ok', 24)]
    const days = { zero: 0, one: 0, ok: 0 }
    const run = () => initialAnalysis(config, competitions, days)
    expect(run).not.toThrow()
    const named = run().warnings.filter((w) => w.subjects.includes('zero') || w.subjects.includes('one'))
    expect(named).toEqual([])
  })

  it.each(UNSIZEABLE)('does not throw for a count of %s', (n) => {
    expect(() => initialAnalysis(config, [event('x', n)], { x: 0 })).not.toThrow()
  })
})

describe('initialAnalysis Pass 6 skips an unsizeable event that carries a cut', () => {
  const cut = { cut_mode: CutMode.PERCENTAGE, cut_value: 50 }

  it.each(UNSIZEABLE)('a count of %s adds no cut summary', (n) => {
    const { warnings } = initialAnalysis(config, [event('x', n, cut)], { x: 0 })
    expect(warnings.filter((w) => w.rule === BottleneckRule.CUT_SUMMARY)).toEqual([])
  })

  it('guard: a sizeable event with the same cut does get a cut summary', () => {
    const { warnings } = initialAnalysis(config, [event('ok', 24, cut)], { ok: 0 })
    expect(warnings.filter((w) => w.rule === BottleneckRule.CUT_SUMMARY).map((w) => w.subjects)).toEqual([['ok']])
  })
})

describe('validateConfig raises fencer-count-bounds for an unsizeable count', () => {
  it.each(UNSIZEABLE)('%s: one fencer-count-bounds finding naming the event, no throw', (n) => {
    const findings = validateConfig(config, [event('x', n), event('ok', 24)], ValidationMode.BINDING)
    const bounds = findings.filter((f) => f.rule === 'fencer-count-bounds')
    expect(bounds.map((f) => f.subjects)).toEqual([['x']])
  })

  // The message names why the count is refused, so the organizer knows what to fix.
  const reasons: [number, string][] = [
    [NaN, 'not a number'],
    [30.5, 'whole number'],
    [1.5, 'whole number'],
    [config.MAX_FENCERS + 1, 'exceeds maximum'],
    [Infinity, 'exceeds maximum'],
    [0, 'below minimum'],
    [1, 'below minimum'],
  ]
  it.each(reasons)('%s: the message says "%s"', (n, fragment) => {
    const findings = validateConfig(config, [event('x', n)], ValidationMode.BINDING)
    expect(findings.find((f) => f.rule === 'fencer-count-bounds')?.message).toContain(fragment)
  })

  it('guard: a count of 2 raises no fencer-count-bounds finding', () => {
    const findings = validateConfig(config, [event('two', 2)], ValidationMode.BINDING)
    expect(findings.filter((f) => f.rule === 'fencer-count-bounds')).toEqual([])
  })
})

describe('deriveEventSchedule and estimateEventFootprint give no result for an unsizeable count', () => {
  it.each(UNSIZEABLE)('deriveEventSchedule: %s gives null', (n) => {
    expect(deriveEventSchedule(makePlacement(), event('x', n), config)).toBeNull()
  })

  it.each(UNSIZEABLE)('estimateEventFootprint: %s gives null', (n) => {
    expect(estimateEventFootprint(event('x', n), config)).toBeNull()
  })

  it('guard: a count of 2 derives one pool with a finite end', () => {
    const derived = deriveEventSchedule(makePlacement(), event('two', 2), config)
    expect(derived?.result.pool_strip_count).toBe(1)
    expect(Number.isFinite(derived?.result.pool_end)).toBe(true)
    expect(estimateEventFootprint(event('two', 2), config)?.strips).toBe(1)
  })
})

describe('referee and flighting suggestions skip an unsizeable event', () => {
  const sabre = (id: string, n: number) => event(id, n, { weapon: Weapon.SABRE })

  it.each(UNSIZEABLE)('recommendRefCount: an extra sabre event at %s changes nothing', (n) => {
    const without = recommendRefCount([sabre('a', 40)], 1, config)
    expect(recommendRefCount([sabre('a', 40), sabre('x', n)], 1, config)).toEqual(without)
  })

  it.each(UNSIZEABLE)('flagFlightingCandidates: %s is never a candidate', (n) => {
    expect(flagFlightingCandidates([event('x', n)], 0)).toEqual([])
  })

  it('guard: flagFlightingCandidates still flags a count of 2 over a cap of 0', () => {
    expect(flagFlightingCandidates([event('two', 2)], 0)).toEqual(['two'])
  })

  it.each(UNSIZEABLE)('suggestFlightingGroups: %s pairs with nothing', (n) => {
    // 70 fencers is 10 pools: alone it fits 10 strips, so any pairing would
    // come from the unsizeable event's pools.
    const result = suggestFlightingGroups([event('a', 70), event('x', n)], 10, { a: 0, x: 0 }, 10)
    expect(result).toEqual({ suggestions: [], bottlenecks: [] })
  })

  it.each(UNSIZEABLE)('validateFlightingGroup: an event at %s on the day changes nothing', (n) => {
    const pair = [event('a', 70), event('b', 35, { flighted: true })]
    const days = { a: 0, b: 0, x: 0 }
    const group = { priority_competition_id: 'a', flighted_competition_id: 'b', strips_for_priority: 10, strips_for_flighted: 0 }
    const without = validateFlightingGroup(group, pair, days, config.tournament_type)
    expect(validateFlightingGroup(group, [...pair, event('x', n)], days, config.tournament_type)).toEqual(without)
  })

  it.each(UNSIZEABLE)('validateFlightingGroup: the flighted event itself at %s gets no "0 pools" not-largest finding', (n) => {
    const pair = [event('a', 70), event('b', n, { flighted: true })]
    const group = { priority_competition_id: 'a', flighted_competition_id: 'b', strips_for_priority: 10, strips_for_flighted: 0 }
    const result = validateFlightingGroup(group, pair, { a: 0, b: 0 }, config.tournament_type)
    expect(result.filter((b) => b.rule === BottleneckRule.FLIGHTED_NOT_LARGEST)).toEqual([])
  })
})

describe('the strip search leaves out an unsizeable event', () => {
  const base = [event('a', 24)]

  it.each(UNSIZEABLE)('suggestStripCount: an extra event at %s changes nothing', (n) => {
    const without = suggestStripCount(base, config.days_available, config.max_pool_strip_pct, config)
    expect(suggestStripCount([...base, event('x', n)], config.days_available, config.max_pool_strip_pct, config)).toBe(without)
  })

  it.each(UNSIZEABLE)('busiestDayCompetitors: an extra event at %s changes nothing', (n) => {
    expect(busiestDayCompetitors([...base, event('x', n)], config)).toBe(busiestDayCompetitors(base, config))
  })

  it.each(UNSIZEABLE)('scanStripCounts: an extra event at %s leaves `required` unchanged', (n) => {
    const range = { floor: 24, ceiling: 24 }
    const required = (comps: Competition[]) => scanStripCounts(comps, config, range).next().value
    expect(required([...base, event('x', n)])).toMatchObject({ required: (required(base) as { required: number }).required })
  })
})

describe('validateConfig video ask for an unsizeable count', () => {
  // strips_total 0 gives a DE cap of 0, so any event that asks video strips
  // raises r16-over-cap.
  const noStrips = makeConfig({ strips_total: 0, strips: [] })
  const overCap = (n: number) =>
    validateConfig(noStrips, [event('x', n)], ValidationMode.BINDING).filter((f) => f.rule === 'r16-over-cap')

  it.each([1.5, config.MAX_FENCERS + 1, Infinity])('a count of %s asks no video strips', (n) => {
    expect(overCap(n)).toEqual([])
  })

  it('guard: a sizeable count over the same cap does raise r16-over-cap', () => {
    expect(overCap(24).map((f) => f.subjects)).toEqual([['x']])
  })
})
