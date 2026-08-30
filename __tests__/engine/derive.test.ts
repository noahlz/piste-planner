import { describe, it, expect } from 'vitest'
import { deriveEventSchedule } from '../../src/engine/derive.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import {
  DeMode, CutMode, Gender, Weapon, PlacementSource,
} from '../../src/engine/types.ts'
import type { Placement, Competition, TournamentConfig, ScheduleResult } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Generous single/few-event config: strips_total and pcts high enough that
 * no phase is strip-capped, so a scheduleAll run's actual allocation equals
 * its desired allocation. Isolates the geometry math from resource contention.
 */
function isolatedConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return makeConfig({
    days_available: 2,
    strips: makeStrips(24, 8),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    ...overrides,
  })
}

/**
 * Builds a Placement the way an auto-schedule write would, per T003's oracle
 * recipe: day/start_time/strip_count taken directly from a live ScheduleResult.
 * pool_start covers both flighted (== flight_a_start, concurrentScheduler.ts
 * onPhaseAllocated) and non-flighted events for any successfully scheduled
 * result, so a null pool_start here means the oracle itself is corrupted —
 * that must fail loudly, not silently default start_time to 0.
 */
function placementFromResult(r: ScheduleResult): Placement {
  if (r.pool_start === null) {
    throw new Error(`placementFromResult: oracle for ${r.competition_id} has a null pool_start`)
  }
  return {
    day: r.assigned_day,
    start_time: r.pool_start,
    strip_count: r.pool_strip_count,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
  }
}

/** Runs scheduleAll on a single competition and returns its oracle result plus a derived Placement. */
function scheduleIsolated(
  competition: Competition,
  config: TournamentConfig,
): { oracle: ScheduleResult; placement: Placement } {
  const { schedule } = scheduleAll([competition], config)
  const oracle = schedule[competition.id]
  if (!oracle) throw new Error(`scheduleIsolated: ${competition.id} was not scheduled`)
  return { oracle, placement: placementFromResult(oracle) }
}

// Fields derive.ts must reproduce exactly from (placement, competition, config).
// Excludes scheduler-only diagnostics with no input derivation: conflict_score,
// constraint_relaxation_level, accepted_warnings.
const DERIVED_FIELDS = [
  'competition_id', 'assigned_day', 'use_flighting', 'is_priority', 'flighting_group_id',
  'pool_start', 'pool_end', 'pool_strip_count', 'pool_refs_count',
  'flight_a_start', 'flight_a_end', 'flight_a_strips', 'flight_a_refs',
  'flight_b_start', 'flight_b_end', 'flight_b_strips', 'flight_b_refs',
  'entry_fencer_count', 'promoted_fencer_count', 'bracket_size',
  'cut_mode', 'cut_value', 'de_mode', 'de_video_policy',
  'de_start', 'de_end', 'de_strip_count',
  'de_prelims_start', 'de_prelims_end', 'de_prelims_strip_count',
  'de_round_of_16_start', 'de_round_of_16_end', 'de_round_of_16_strip_count',
  'de_total_end',
  'pool_duration_baseline', 'pool_duration_actual',
  'de_duration_baseline', 'de_duration_actual',
] as const satisfies readonly (keyof ScheduleResult)[]

// Scheduler-only diagnostics carried on ScheduleResult but not derivable from
// (placement, competition, config) alone — see DERIVED_FIELDS' comment above.
const EXCLUDED_DIAGNOSTIC_FIELDS = [
  'conflict_score', 'constraint_relaxation_level', 'accepted_warnings',
] as const satisfies readonly (keyof ScheduleResult)[]
void EXCLUDED_DIAGNOSTIC_FIELDS // used only in the type position below

// Exhaustiveness guard: DERIVED_FIELDS plus EXCLUDED_DIAGNOSTIC_FIELDS must
// cover every key of ScheduleResult. If ScheduleResult gains a field claimed
// by neither list, the object literal below is missing a required property
// and this file stops compiling.
const _fieldCoverageCheck: Record<
  Exclude<keyof ScheduleResult, typeof DERIVED_FIELDS[number] | typeof EXCLUDED_DIAGNOSTIC_FIELDS[number]>,
  true
> = {}
void _fieldCoverageCheck // type-level check only — no runtime assertion needed

/** Asserts every genuinely-derivable field on `derived` matches the live scheduleAll `oracle`. */
function expectGeometryMatches(derived: ScheduleResult, oracle: ScheduleResult): void {
  for (const field of DERIVED_FIELDS) {
    expect(derived[field], field).toEqual(oracle[field])
  }
}

// ──────────────────────────────────────────────
// Case 1: pool-only geometry
// ──────────────────────────────────────────────
//
// The engine has no literal DE-less competition (every event gets a DE_SINGLE
// or DE_PRELIMS+DE_R16 node regardless of fencer count). "Pool-only" here
// scopes the assertion to the pool block; DE geometry for the same shape of
// event is covered by the single-stage-DE case below.

describe('deriveEventSchedule — pool block geometry', () => {
  it('derives pool start/end/strip_count/refs_count for a plain non-flighted event', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'pool-plain', fencer_count: 24 })
    const { oracle, placement } = scheduleIsolated(competition, config)

    const derived = deriveEventSchedule(placement, competition, config)

    expect(derived.result.pool_start).toBe(oracle.pool_start)
    expect(derived.result.pool_end).toBe(oracle.pool_end)
    expect(derived.result.pool_strip_count).toBe(oracle.pool_strip_count)
    expect(derived.result.pool_refs_count).toBe(oracle.pool_refs_count)
    expect(derived.result.pool_start).not.toBeNull()
    expect(derived.result.pool_end ?? 0).toBeGreaterThan(derived.result.pool_start ?? 0)
    expect(derived.day_out_of_range).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Case 2: single-stage DE event
// ──────────────────────────────────────────────

describe('deriveEventSchedule — single-stage DE event', () => {
  it('derives pool block plus one DE block, matching a live scheduleAll run', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'de-single', fencer_count: 24, de_mode: DeMode.SINGLE_STAGE })
    const { oracle, placement } = scheduleIsolated(competition, config)

    const derived = deriveEventSchedule(placement, competition, config)

    expectGeometryMatches(derived.result, oracle)
    expect(derived.result.de_start).not.toBeNull()
    expect(derived.result.de_end).not.toBeNull()
    expect(derived.result.de_prelims_start).toBeNull()
    expect(derived.result.de_round_of_16_start).toBeNull()
    expect(derived.day_out_of_range).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Case 3: staged DE event
// ──────────────────────────────────────────────

describe('deriveEventSchedule — staged DE event', () => {
  it('derives prelims and round-of-16 segments for a large bracket, matching a live scheduleAll run', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({
      id: 'de-staged', fencer_count: 70, de_mode: DeMode.STAGED, cut_mode: CutMode.DISABLED,
    })
    const { oracle, placement } = scheduleIsolated(competition, config)
    expect(oracle.bracket_size).toBeGreaterThanOrEqual(64) // sanity: prelims only exist ≥64
    expect(oracle.de_prelims_start).not.toBeNull() // sanity: this scenario actually stages

    const derived = deriveEventSchedule(placement, competition, config)

    expectGeometryMatches(derived.result, oracle)
    expect(derived.result.de_prelims_start).not.toBeNull()
    expect(derived.result.de_round_of_16_start).not.toBeNull()
    expect(derived.result.de_start).toBeNull()
    expect(derived.day_out_of_range).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Case 4: flighted event
// ──────────────────────────────────────────────

describe('deriveEventSchedule — flighted event', () => {
  it('derives flight A/B splits and use_flighting=true, matching a live scheduleAll run', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'flighted-1', fencer_count: 40, flighted: true })
    const { oracle, placement } = scheduleIsolated(competition, config)
    expect(oracle.use_flighting).toBe(true) // sanity

    const derived = deriveEventSchedule(placement, competition, config)

    expectGeometryMatches(derived.result, oracle)
    expect(derived.result.use_flighting).toBe(true)
    expect(derived.result.flight_a_start).not.toBeNull()
    expect(derived.result.flight_b_start).not.toBeNull()
    expect(derived.day_out_of_range).toBe(false)
  })

  // Pins research D1's specific claim: use_flighting is `comp.flighted ||
  // comp.flighting_group_id !== null` (concurrentScheduler.ts:306) — true even
  // when a competition only carries a flighting_group_id and flighted=false,
  // which the scheduler does NOT split into flight A/B pools on its own
  // (isFlighted requires flighted===true with no group id). No oracle needed:
  // this is a direct boolean derivation from competition inputs.
  it('derives use_flighting=true from flighting_group_id alone, even when flighted=false', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({
      id: 'flighted-2', fencer_count: 24, flighted: false, flighting_group_id: 'group-1',
    })
    const placement: Placement = {
      day: 0, start_time: 480, strip_count: 6, strips: null, source: PlacementSource.MANUAL, pinned: true,
    }

    const derived = deriveEventSchedule(placement, competition, config)

    expect(derived.result.use_flighting).toBe(true)
    expect(derived.result.flighting_group_id).toBe('group-1')
  })
})

// ──────────────────────────────────────────────
// Case 5: purity
// ──────────────────────────────────────────────

describe('deriveEventSchedule — purity', () => {
  it('returns deeply equal output for identical inputs called twice', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'purity-1', fencer_count: 40, flighted: true, de_mode: DeMode.STAGED })
    const placement: Placement = {
      day: 1, start_time: 900, strip_count: 6, strips: null, source: PlacementSource.AUTO, pinned: false,
    }

    const first = deriveEventSchedule(placement, competition, config)
    const second = deriveEventSchedule(placement, competition, config)

    expect(second).toEqual(first)
  })

  it('does not mutate its placement, competition, or config arguments', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'purity-2', fencer_count: 24 })
    const placement: Placement = {
      day: 0, start_time: 480, strip_count: 6, strips: null, source: PlacementSource.AUTO, pinned: false,
    }
    const placementBefore = JSON.parse(JSON.stringify(placement))
    const competitionBefore = JSON.parse(JSON.stringify(competition))
    const configBefore = JSON.parse(JSON.stringify(config))

    deriveEventSchedule(placement, competition, config)

    expect(placement).toEqual(placementBefore)
    expect(competition).toEqual(competitionBefore)
    expect(config).toEqual(configBefore)
  })
})

// ──────────────────────────────────────────────
// Case 6: out-of-range day
// ──────────────────────────────────────────────

describe('deriveEventSchedule — day_out_of_range', () => {
  it('flags a day beyond days_available without throwing; block durations are unchanged', () => {
    const config = isolatedConfig({ days_available: 4 })
    const competition = makeCompetition({ id: 'oor-high', fencer_count: 24 })
    const { oracle, placement: basePlacement } = scheduleIsolated(competition, config)
    const placement: Placement = { ...basePlacement, day: 9 }

    expect(() => deriveEventSchedule(placement, competition, config)).not.toThrow()
    const derived = deriveEventSchedule(placement, competition, config)

    expect(derived.day_out_of_range).toBe(true)
    expect(derived.result.pool_start).not.toBeNull()
    expect(derived.result.pool_end).not.toBeNull()
    // Duration math is a function of (competition, config, strip_count) only —
    // an out-of-range day changes the flag, not the block durations.
    expect((derived.result.pool_end ?? 0) - (derived.result.pool_start ?? 0))
      .toBe((oracle.pool_end ?? 0) - (oracle.pool_start ?? 0))
  })

  it('flags a negative day without throwing', () => {
    const config = isolatedConfig()
    const competition = makeCompetition({ id: 'oor-neg', fencer_count: 24 })
    const { placement: basePlacement } = scheduleIsolated(competition, config)
    const placement: Placement = { ...basePlacement, day: -1 }

    expect(() => deriveEventSchedule(placement, competition, config)).not.toThrow()
    const derived = deriveEventSchedule(placement, competition, config)
    expect(derived.day_out_of_range).toBe(true)
    expect(derived.result.pool_start).not.toBeNull()
  })

  it('does not flag a day within [0, days_available)', () => {
    const config = isolatedConfig({ days_available: 4 })
    const competition = makeCompetition({ id: 'in-range', fencer_count: 24 })
    const { placement } = scheduleIsolated(competition, config)

    expect(deriveEventSchedule(placement, competition, config).day_out_of_range).toBe(false)
  })

  // Pins the boundary itself: day === days_available is out of range, and
  // day === days_available - 1 is the last valid day. Catches a `>` vs `>=`
  // off-by-one in the range check. Manual placements isolate the boundary
  // from whatever day scheduleAll happens to assign.
  it('flags day === days_available as out of range (boundary)', () => {
    const config = isolatedConfig({ days_available: 4 })
    const competition = makeCompetition({ id: 'oor-boundary-high', fencer_count: 24 })
    const placement: Placement = {
      day: 4, start_time: 480, strip_count: 6, strips: null, source: PlacementSource.MANUAL, pinned: true,
    }

    expect(deriveEventSchedule(placement, competition, config).day_out_of_range).toBe(true)
  })

  it('does not flag day === days_available - 1 as out of range (boundary)', () => {
    const config = isolatedConfig({ days_available: 4 })
    const competition = makeCompetition({ id: 'oor-boundary-in', fencer_count: 24 })
    const placement: Placement = {
      day: 3, start_time: 480, strip_count: 6, strips: null, source: PlacementSource.MANUAL, pinned: true,
    }

    expect(deriveEventSchedule(placement, competition, config).day_out_of_range).toBe(false)
  })
})

// ──────────────────────────────────────────────
// Case 7: oracle — reproduces scheduleAll geometry under real contention
// ──────────────────────────────────────────────

describe('deriveEventSchedule — oracle: reproduces scheduleAll geometry', () => {
  it('reproduces one event geometry from a busier multi-event schedule (research D1)', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(12, 2),
      max_pool_strip_pct: 1.0,
      max_de_strip_pct: 1.0,
    })
    const competitions = [
      makeCompetition({ id: 'multi-a', fencer_count: 32, gender: Gender.MEN, weapon: Weapon.FOIL }),
      makeCompetition({ id: 'multi-b', fencer_count: 24, gender: Gender.WOMEN, weapon: Weapon.EPEE }),
      makeCompetition({
        id: 'multi-c', fencer_count: 16, gender: Gender.MEN, weapon: Weapon.SABRE, de_mode: DeMode.STAGED,
      }),
    ]
    const { schedule, bottlenecks } = scheduleAll(competitions, config)
    const target = competitions[0]
    const oracle = schedule[target.id]
    expect(oracle).toBeDefined() // sanity: target actually got scheduled
    // sanity: pins this fixture as contention-free, so a match failure here
    // means the fixture stopped isolating geometry and started isolating delay.
    expect(bottlenecks.filter((b) => b.delay_mins > 0)).toEqual([])

    const placement = placementFromResult(oracle)
    const derived = deriveEventSchedule(placement, target, config)

    expectGeometryMatches(derived.result, oracle)
    expect(derived.day_out_of_range).toBe(false)
  })
})
