import { describe, it, expect } from 'vitest'
import {
  suggestFlightingGroups,
  calculateFlightedStrips,
} from '../../src/engine/flighting.ts'
import { BottleneckCause, BottleneckRule, BottleneckSeverity, Category } from '../../src/engine/types.ts'
import { makeCompetition } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// suggestFlightingGroups
// ──────────────────────────────────────────────

describe('suggestFlightingGroups', () => {
  it('combined > strips, each fits alone → suggests flighting the larger event (METHODOLOGY §How Flighting Works)', () => {
    // ceil(210/7)=30 pools, ceil(203/7)=29 pools; 30+29=59 > 55 strips, each alone fits
    // Each fits within poolStripCap (55), combined (59) exceeds stripsTotal (55)
    const c1 = makeCompetition({ id: 'large', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'small', fencer_count: 203 }) // 29 pools
    const dayAssignments: Record<string, number> = { large: 0, small: 0 }

    const { suggestions, bottlenecks } = suggestFlightingGroups([c1, c2], 55, dayAssignments, 55)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].flighted_competition_id).toBe('large')
    expect(suggestions[0].priority_competition_id).toBe('small')
    // The unflighted event gets its pool count (29), the flighted one the remainder (55-29=26)
    expect(suggestions[0].strips_for_priority).toBe(29)
    expect(suggestions[0].strips_for_flighted).toBe(26)
    // No MANUAL_NEEDED bottleneck when pool counts differ
    expect(bottlenecks.some(b => b.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED)).toBe(false)
  })

  it('combined fits within strips → no suggestion', () => {
    // 10 pools = ~70 fencers, 10 pools = ~70 fencers; 10+10=20 <= 24
    const c1 = makeCompetition({ id: 'comp-a', fencer_count: 70 }) // 10 pools
    const c2 = makeCompetition({ id: 'comp-b', fencer_count: 70 }) // 10 pools
    const dayAssignments: Record<string, number> = { 'comp-a': 0, 'comp-b': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 24, dayAssignments, 24)

    expect(suggestions).toHaveLength(0)
  })

  it('neither fits alone → no suggestion (both individually exceed strips)', () => {
    // 30 pools = ~210 fencers; each exceeds 24 strips individually
    const c1 = makeCompetition({ id: 'huge-a', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'huge-b', fencer_count: 210 }) // 30 pools
    const dayAssignments: Record<string, number> = { 'huge-a': 0, 'huge-b': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 24, dayAssignments, 24)

    expect(suggestions).toHaveLength(0)
  })

  it('tied pool counts → suggest group AND flag FLIGHTING_GROUP_MANUAL_NEEDED', () => {
    // Two competitions with identical fencer counts → identical pool counts
    // ceil(210/7)=30 pools each; 30+30=60 > 55 strips, each fits alone (30 <= 55)
    // Each fits within poolStripCap (55), combined (60) exceeds stripsTotal (55)
    const c1 = makeCompetition({ id: 'tied-a', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'tied-b', fencer_count: 210 }) // 30 pools
    const dayAssignments: Record<string, number> = { 'tied-a': 0, 'tied-b': 0 }

    // construction order differs from sorted order so a dropped sort() fails
    const { suggestions, bottlenecks } = suggestFlightingGroups([c2, c1], 55, dayAssignments, 55)

    expect(suggestions).toHaveLength(1)
    const manualNeeded = bottlenecks.find(
      b => b.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
    )
    expect(manualNeeded).toBeDefined()
    expect(manualNeeded?.severity).toBe(BottleneckSeverity.WARN)
    expect(manualNeeded?.rule).toBe(BottleneckRule.FLIGHTING_PRIORITY_TIE)
    expect(manualNeeded?.subjects).toEqual(['tied-a', 'tied-b'])
  })

  it('tied pool counts → flights the later id whatever the input order, and the WARN says the organizer picks', () => {
    // Same tie as above, input order [tied-b, tied-a], so a choice that follows
    // the pair order instead of the ids would flight tied-a.
    const c1 = makeCompetition({ id: 'tied-a', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'tied-b', fencer_count: 210 }) // 30 pools
    const dayAssignments: Record<string, number> = { 'tied-a': 0, 'tied-b': 0 }

    const { suggestions, bottlenecks } = suggestFlightingGroups([c2, c1], 55, dayAssignments, 55)

    expect(suggestions.map(s => [s.flighted_competition_id, s.priority_competition_id])).toEqual([['tied-b', 'tied-a']])
    expect(bottlenecks.find(b => b.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED)?.message)
      .toBe('tied-b and tied-a have equal pool counts (30), so the organizer picks which one to flight')
  })

  it('each fits within poolStripCap but combined exceeds stripsTotal → suggests group', () => {
    // 20 pools each; 20+20=40 > 35 stripsTotal, but each 20 <= 25 poolStripCap
    const c1 = makeCompetition({ id: 'comp-a', fencer_count: 140 }) // ceil(140/7)=20 pools
    const c2 = makeCompetition({ id: 'comp-b', fencer_count: 140 }) // 20 pools
    const dayAssignments: Record<string, number> = { 'comp-a': 0, 'comp-b': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 35, dayAssignments, 25)

    expect(suggestions).toHaveLength(1)
  })

  it('one event exceeds poolStripCap → no suggestion (individually too big to flight)', () => {
    // 30 pools > poolStripCap of 24; the event itself is already over cap so flighting is not the fix
    const c1 = makeCompetition({ id: 'large-comp', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'small-comp', fencer_count: 140 }) // 20 pools
    const dayAssignments: Record<string, number> = { 'large-comp': 0, 'small-comp': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 55, dayAssignments, 24)

    expect(suggestions).toHaveLength(0)
  })

  it('any category and fencer count → suggested when pools exceed cap (category gate removed)', () => {
    // Y14 and small fencer count — no longer gated by category or 200-fencer minimum
    // 20 pools each; combined 40 > 35 stripsTotal, each 20 <= 25 poolStripCap
    const c1 = makeCompetition({ id: 'y14-comp', fencer_count: 140, category: Category.Y14 }) // 20 pools
    const c2 = makeCompetition({ id: 'div1-comp', fencer_count: 140 }) // 20 pools
    const dayAssignments: Record<string, number> = { 'y14-comp': 0, 'div1-comp': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 35, dayAssignments, 25)

    expect(suggestions).toHaveLength(1)
  })

  it('competitions on different days → no suggestion for cross-day pairs', () => {
    // Same strip conditions but on different days → no suggestion
    const c1 = makeCompetition({ id: 'day0-comp', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'day1-comp', fencer_count: 203 }) // 29 pools
    const dayAssignments: Record<string, number> = { 'day0-comp': 0, 'day1-comp': 1 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 55, dayAssignments, 55)

    expect(suggestions).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// calculateFlightedStrips
// ──────────────────────────────────────────────

describe('calculateFlightedStrips', () => {
  it('priority gets its pool count, flighted gets remainder', () => {
    // The flighted event is the larger one (METHODOLOGY §How Flighting Works).
    // Priority: 84 fencers → ceil(84/7)=12 pools, and flighted: 98 fencers → ceil(98/7)=14 pools
    // 22 strips total: priority gets 12, flighted gets 10
    const priority = makeCompetition({ id: 'pri', fencer_count: 84 })  // 12 pools
    const flighted = makeCompetition({ id: 'flt', fencer_count: 98 })  // 14 pools

    const result = calculateFlightedStrips(priority, flighted, 22)

    expect(result.strips_for_priority).toBe(12)
    expect(result.strips_for_flighted).toBe(10)
  })

  it('strip split sums to strips_total', () => {
    const priority = makeCompetition({ id: 'pri', fencer_count: 84 })  // 12 pools
    const flighted = makeCompetition({ id: 'flt', fencer_count: 98 })  // 14 pools

    const result = calculateFlightedStrips(priority, flighted, 24)

    expect(result.strips_for_priority + result.strips_for_flighted).toBe(24)
  })

  it('priority pool count equals strips_total → flighted gets 0 cleanly', () => {
    // Priority: 168 fencers → ceil(168/7)=24 pools = exactly strips_total; flighted gets 0
    const priority = makeCompetition({ id: 'pri', fencer_count: 168 }) // 24 pools
    const flighted = makeCompetition({ id: 'flt', fencer_count: 84 })  // 12 pools

    const result = calculateFlightedStrips(priority, flighted, 24)

    expect(result.strips_for_priority).toBe(24)
    expect(result.strips_for_flighted).toBe(0)
    expect(result.strips_for_priority + result.strips_for_flighted).toBe(24)
  })

  it('priority pool count capped at strips_total when it would exceed', () => {
    // Priority with more pools than total strips: capped at strips_total, flighted gets 0
    const priority = makeCompetition({ id: 'pri', fencer_count: 210 }) // 30 pools > 24
    const flighted = makeCompetition({ id: 'flt', fencer_count: 84 })  // 12 pools

    const result = calculateFlightedStrips(priority, flighted, 24)

    expect(result.strips_for_priority).toBe(24)
    expect(result.strips_for_flighted).toBe(0)
    expect(result.strips_for_priority + result.strips_for_flighted).toBe(24)
  })
})
