import { describe, it, expect } from 'vitest'
import {
  suggestFlightingGroups,
  calculateFlightedStrips,
  validateFlightingGroup,
} from '../../src/engine/flighting.ts'
import { BottleneckCause, BottleneckSeverity } from '../../src/engine/types.ts'
import type { Competition } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'comp-1',
    gender: 'MEN',
    category: 'DIV1',
    weapon: 'FOIL',
    event_type: 'INDIVIDUAL',
    fencer_count: 42,
    fencer_count_type: 'ESTIMATED',
    ref_policy: 'AUTO',
    earliest_start: 0,
    latest_end: 840,
    optional: false,
    vet_age_group: null,
    use_single_pool_override: false,
    cut_mode: 'DISABLED',
    cut_value: 100,
    de_mode: 'SINGLE_BLOCK',
    de_video_policy: 'BEST_EFFORT',
    de_finals_strip_id: null,
    de_finals_strip_requirement: 'IF_AVAILABLE',
    de_round_of_16_strips: 4,
    de_round_of_16_requirement: 'IF_AVAILABLE',
    de_finals_strips: 4,
    de_finals_requirement: 'IF_AVAILABLE',
    flighted: false,
    flighting_group_id: null,
    is_priority: false,
    strips_allocated: 0,
    ...overrides,
  }
}

// ──────────────────────────────────────────────
// suggestFlightingGroups
// ──────────────────────────────────────────────

describe('suggestFlightingGroups', () => {
  it('combined > strips, each fits alone → suggests group with larger as priority', () => {
    // 20 pools = ~140 fencers (ceil(140/7)=20), 15 pools = ~105 fencers (ceil(105/7)=15)
    // 20+15=35 > 24 strips, each alone fits
    const c1 = makeCompetition({ id: 'large', fencer_count: 140 }) // 20 pools
    const c2 = makeCompetition({ id: 'small', fencer_count: 105 }) // 15 pools
    const dayAssignments: Record<string, number> = { large: 0, small: 0 }

    const { suggestions, bottlenecks } = suggestFlightingGroups([c1, c2], 24, dayAssignments)

    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].priority_competition_id).toBe('large')
    expect(suggestions[0].flighted_competition_id).toBe('small')
    // No MANUAL_NEEDED bottleneck when pool counts differ
    expect(bottlenecks.some(b => b.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED)).toBe(false)
  })

  it('combined fits within strips → no suggestion', () => {
    // 10 pools = ~70 fencers, 10 pools = ~70 fencers; 10+10=20 <= 24
    const c1 = makeCompetition({ id: 'comp-a', fencer_count: 70 }) // 10 pools
    const c2 = makeCompetition({ id: 'comp-b', fencer_count: 70 }) // 10 pools
    const dayAssignments: Record<string, number> = { 'comp-a': 0, 'comp-b': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 24, dayAssignments)

    expect(suggestions).toHaveLength(0)
  })

  it('neither fits alone → no suggestion (both individually exceed strips)', () => {
    // 30 pools = ~210 fencers; each exceeds 24 strips individually
    const c1 = makeCompetition({ id: 'huge-a', fencer_count: 210 }) // 30 pools
    const c2 = makeCompetition({ id: 'huge-b', fencer_count: 210 }) // 30 pools
    const dayAssignments: Record<string, number> = { 'huge-a': 0, 'huge-b': 0 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 24, dayAssignments)

    expect(suggestions).toHaveLength(0)
  })

  it('tied pool counts → suggest group AND flag FLIGHTING_GROUP_MANUAL_NEEDED', () => {
    // Two competitions with identical fencer counts → identical pool counts
    const c1 = makeCompetition({ id: 'tied-a', fencer_count: 140 }) // 20 pools
    const c2 = makeCompetition({ id: 'tied-b', fencer_count: 140 }) // 20 pools
    // 20+20=40 > 24 strips, each fits alone (20 <= 24)
    const dayAssignments: Record<string, number> = { 'tied-a': 0, 'tied-b': 0 }

    const { suggestions, bottlenecks } = suggestFlightingGroups([c1, c2], 24, dayAssignments)

    expect(suggestions).toHaveLength(1)
    const manualNeeded = bottlenecks.find(
      b => b.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
    )
    expect(manualNeeded).toBeDefined()
    expect(manualNeeded?.severity).toBe(BottleneckSeverity.WARN)
  })

  it('competitions on different days → no suggestion for cross-day pairs', () => {
    const c1 = makeCompetition({ id: 'day0-comp', fencer_count: 140 }) // 20 pools
    const c2 = makeCompetition({ id: 'day1-comp', fencer_count: 105 }) // 15 pools
    const dayAssignments: Record<string, number> = { 'day0-comp': 0, 'day1-comp': 1 }

    const { suggestions } = suggestFlightingGroups([c1, c2], 24, dayAssignments)

    expect(suggestions).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// calculateFlightedStrips
// ──────────────────────────────────────────────

describe('calculateFlightedStrips', () => {
  it('priority gets its pool count, flighted gets remainder', () => {
    // Priority: 98 fencers → ceil(98/7)=14 pools; flighted: 84 fencers → ceil(84/7)=12 pools
    // 24 strips total: priority gets 14, flighted gets 10
    const priority = makeCompetition({ id: 'pri', fencer_count: 98 })  // 14 pools
    const flighted = makeCompetition({ id: 'flt', fencer_count: 84 })  // 12 pools

    const result = calculateFlightedStrips(priority, flighted, 24)

    expect(result.strips_for_priority).toBe(14)
    expect(result.strips_for_flighted).toBe(10)
  })

  it('strip split sums to strips_total', () => {
    const priority = makeCompetition({ id: 'pri', fencer_count: 98 })  // 14 pools
    const flighted = makeCompetition({ id: 'flt', fencer_count: 84 })  // 12 pools

    const result = calculateFlightedStrips(priority, flighted, 24)

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

// ──────────────────────────────────────────────
// validateFlightingGroup
// ──────────────────────────────────────────────

describe('validateFlightingGroup', () => {
  it('two flighted competitions on same day → warning', () => {
    const c1 = makeCompetition({ id: 'pri', fencer_count: 140, flighted: false, is_priority: true })
    const c2 = makeCompetition({ id: 'flt1', fencer_count: 105, flighted: true })
    const c3 = makeCompetition({ id: 'flt2', fencer_count: 84, flighted: true })

    const group = { priority_competition_id: 'pri', flighted_competition_id: 'flt1', strips_for_priority: 14, strips_for_flighted: 10 }
    const dayAssignments: Record<string, number> = { pri: 0, flt1: 0, flt2: 0 }

    const bottlenecks = validateFlightingGroup(group, [c1, c2, c3], dayAssignments)

    // flt1 and flt2 are both flighted on day 0
    const multipleFlighted = bottlenecks.find(b => b.competition_id === 'flt1' || b.competition_id === 'flt2')
    expect(multipleFlighted).toBeDefined()
  })

  it('flighted competition is not largest by pool count on the day → FLIGHTING_GROUP_NOT_LARGEST warning', () => {
    // largest: 20 pools (not flighted), flighted: 15 pools
    const largest = makeCompetition({ id: 'largest', fencer_count: 140, flighted: false, is_priority: false })
    const priority = makeCompetition({ id: 'pri', fencer_count: 105, flighted: false, is_priority: true })
    const flighted = makeCompetition({ id: 'flt', fencer_count: 98, flighted: true, is_priority: false })

    const group = { priority_competition_id: 'pri', flighted_competition_id: 'flt', strips_for_priority: 14, strips_for_flighted: 10 }
    const dayAssignments: Record<string, number> = { largest: 0, pri: 0, flt: 0 }

    const bottlenecks = validateFlightingGroup(group, [largest, priority, flighted], dayAssignments)

    const notLargest = bottlenecks.find(b => b.cause === BottleneckCause.FLIGHTING_GROUP_NOT_LARGEST)
    expect(notLargest).toBeDefined()
    expect(notLargest?.severity).toBe(BottleneckSeverity.WARN)
  })

  it('no warning when flighted competition is the largest on the day', () => {
    const priority = makeCompetition({ id: 'pri', fencer_count: 84, flighted: false, is_priority: true })
    // flighted has more pools than priority
    const flighted = makeCompetition({ id: 'flt', fencer_count: 140, flighted: true, is_priority: false })

    const group = { priority_competition_id: 'pri', flighted_competition_id: 'flt', strips_for_priority: 12, strips_for_flighted: 12 }
    const dayAssignments: Record<string, number> = { pri: 0, flt: 0 }

    const bottlenecks = validateFlightingGroup(group, [priority, flighted], dayAssignments)

    const notLargest = bottlenecks.find(b => b.cause === BottleneckCause.FLIGHTING_GROUP_NOT_LARGEST)
    expect(notLargest).toBeUndefined()
  })

  it('demographic conflict between grouped pair → warning with crossover score', () => {
    // CADET + DIV2: direct crossover edge (1.0), same gender and weapon → penalty > 0
    // CADET→DIV2 is in CROSSOVER_GRAPH[CADET] and is not GROUP_1_MANDATORY
    const priority = makeCompetition({ id: 'pri', gender: 'MEN', weapon: 'FOIL', category: 'CADET', fencer_count: 105 })
    const flighted = makeCompetition({ id: 'flt', gender: 'MEN', weapon: 'FOIL', category: 'DIV2', fencer_count: 84, flighted: true })

    const group = { priority_competition_id: 'pri', flighted_competition_id: 'flt', strips_for_priority: 14, strips_for_flighted: 10 }
    const dayAssignments: Record<string, number> = { pri: 0, flt: 0 }

    const bottlenecks = validateFlightingGroup(group, [priority, flighted], dayAssignments)

    const conflictWarning = bottlenecks.find(
      b => b.cause === BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT,
    )
    expect(conflictWarning).toBeDefined()
    expect(conflictWarning?.message).toMatch(/crossover/i)
  })

  it('no demographic warning for different genders', () => {
    const priority = makeCompetition({ id: 'pri', gender: 'MEN', weapon: 'FOIL', category: 'DIV1', fencer_count: 105 })
    const flighted = makeCompetition({ id: 'flt', gender: 'WOMEN', weapon: 'FOIL', category: 'DIV1', fencer_count: 84, flighted: true })

    const group = { priority_competition_id: 'pri', flighted_competition_id: 'flt', strips_for_priority: 14, strips_for_flighted: 10 }
    const dayAssignments: Record<string, number> = { pri: 0, flt: 0 }

    const bottlenecks = validateFlightingGroup(group, [priority, flighted], dayAssignments)

    const conflictWarning = bottlenecks.find(
      b => b.cause === BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT,
    )
    expect(conflictWarning).toBeUndefined()
  })
})
