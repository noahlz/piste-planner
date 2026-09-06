import { describe, it, expect } from 'vitest'
import { scheduleAllConcurrent } from '../../src/engine/concurrentScheduler.ts'
import {
  BottleneckCause,
  BottleneckSeverity,
  DeMode,
  EventType,
  VideoPolicy,
  Category,
  Gender,
  Weapon,
  RefPolicy,
  CutMode,
  DeStripRequirement,
  Phase,
  ValidationMode,
  tailEstimateMins,
} from '../../src/engine/types.ts'
import type { Competition, TournamentConfig } from '../../src/engine/types.ts'
import { computePoolStructure, resolveRefsPerPool } from '../../src/engine/pools.ts'
import { validateConfig } from '../../src/engine/validation.ts'
import { DEFAULT_DE_DURATION_TABLE } from '../../src/engine/constants.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Build a small competition with sane defaults for concurrent-scheduler tests.
 * Defaults: SINGLE_STAGE, BEST_EFFORT video, 24 fencers, foil ind, DIV1 men.
 */
function comp(id: string, overrides: Partial<Competition> = {}): Competition {
  return makeCompetition({
    id,
    fencer_count: 24,
    de_round_of_16_strips: 4,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    de_mode: DeMode.SINGLE_STAGE,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    de_round_of_16_requirement: DeStripRequirement.IF_AVAILABLE,
    ref_policy: RefPolicy.ONE,
    ...overrides,
  })
}

function smallConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return makeConfig({
    days_available: 2,
    strips: makeStrips(20, 4),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    ...overrides,
  })
}

// ──────────────────────────────────────────────
// Test 1: Concurrent pools — disjoint strips, overlapping time
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — concurrent pools on disjoint strips', () => {
  it('two same-day events run pools concurrently on different strip indices', () => {
    // Two events, both small enough to share strips on day 0.
    const c1 = comp('e1', {
      gender: Gender.MEN, weapon: Weapon.EPEE, category: Category.VETERAN,
      fencer_count: 20,
    })
    const c2 = comp('e2', {
      gender: Gender.WOMEN, weapon: Weapon.FOIL, category: Category.VETERAN,
      fencer_count: 20,
    })
    const config = smallConfig()
    const result = scheduleAllConcurrent([c1, c2], config)

    const s1 = result.schedule['e1']
    const s2 = result.schedule['e2']
    expect(s1).toBeDefined()
    expect(s2).toBeDefined()

    // If the day-coloring places them on the same day, their pool intervals
    // should overlap in time and use disjoint strip indices.
    if (s1.assigned_day === s2.assigned_day) {
      const overlap =
        (s1.pool_start ?? 0) < (s2.pool_end ?? 0) &&
        (s2.pool_start ?? 0) < (s1.pool_end ?? 0)
      expect(overlap, `e1 and e2 pool intervals must overlap when same-day`).toBe(true)

      // Disjoint strips: total strip_count is at most strips_total and
      // intervals are independent (no exclusive serialization).
      expect((s1.pool_strip_count ?? 0) + (s2.pool_strip_count ?? 0)).toBeLessThanOrEqual(config.strips_total)
    }
  })
})

// ──────────────────────────────────────────────
// Test 2: Video contention — video phase wins priority + emits VIDEO_STRIP_CONTENTION
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — video-required priority', () => {
  it('emits VIDEO_STRIP_CONTENTION (INFO) when two REQUIRED-video R16s compete for the video pool', () => {
    // Three STAGED events with VideoPolicy.REQUIRED, all small enough to land
    // on day 0 (different demographics so no hard separations apply). With
    // only 4 video strips and each R16 wanting 4, at least one R16 must defer
    // until another's R16 finishes — the deferred one accumulates
    // defer_count > 0 and emits VIDEO_STRIP_CONTENTION on its eventual
    // allocation. Bracket size 32 (fencer_count=24) means dePhasesForBracket
    // returns just [DE_ROUND_OF_16] — no prelims — so we exercise the R16
    // contention path directly.
    const a = comp('vidA', {
      gender: Gender.MEN, weapon: Weapon.EPEE, category: Category.VETERAN,
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const b = comp('vidB', {
      gender: Gender.WOMEN, weapon: Weapon.FOIL, category: Category.VETERAN,
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const c = comp('vidC', {
      gender: Gender.MEN, weapon: Weapon.SABRE, category: Category.VETERAN,
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    // 4 video strips total — one R16 fits; the other two must wait.
    const config = smallConfig({
      strips: makeStrips(20, 4),
      max_pool_strip_pct: 1.0,
      max_de_strip_pct: 1.0,
    })

    const result = scheduleAllConcurrent([a, b, c], config)
    // All three should be scheduled (no permanent failures).
    expect(result.schedule['vidA']).toBeDefined()
    expect(result.schedule['vidB']).toBeDefined()
    expect(result.schedule['vidC']).toBeDefined()
    // Strict assertion: at least one VIDEO_STRIP_CONTENTION (INFO) bottleneck.
    expect(result.bottlenecks).toContainEqual(expect.objectContaining({
      cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
      severity: BottleneckSeverity.INFO,
    }))
  })
})

// ──────────────────────────────────────────────
// Test 3: Phase dependency — R16 starts after prelims
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — phase dependency order', () => {
  it('STAGED event has de_round_of_16_start >= de_prelims_end + ADMIN_GAP_MINS', () => {
    // Bracket >= 64 forces prelims to exist. Small bracket (64) keeps duration sane.
    const stagedBig = comp('big', {
      fencer_count: 64,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.BEST_EFFORT,
      de_round_of_16_strips: 4,
      cut_mode: CutMode.DISABLED,
      weapon: Weapon.SABRE,
    })
    const config = smallConfig({
      days_available: 2,
      strips: makeStrips(40, 8),
      max_pool_strip_pct: 1.0,
      max_de_strip_pct: 1.0,
    })
    const result = scheduleAllConcurrent([stagedBig], config)
    const s = result.schedule['big']
    expect(s).toBeDefined()
    expect(s.de_prelims_start).not.toBeNull()
    expect(s.de_prelims_end).not.toBeNull()
    expect(s.de_round_of_16_start).not.toBeNull()
    expect(s.pool_end).not.toBeNull()
    expect(s.de_prelims_start!).toBeGreaterThanOrEqual(s.pool_end! + config.ADMIN_GAP_MINS)
    expect(s.de_round_of_16_start!).toBeGreaterThanOrEqual(s.de_prelims_end! + config.ADMIN_GAP_MINS)
  })
})

// ──────────────────────────────────────────────
// Test 4: Rollback — failed event's allocations are removed
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — rollback on terminal failure', () => {
  it('event whose terminal phase fails leaves no schedule entry and emits unresolvable', () => {
    // Deterministic failure: with earliest_start=480 and latest_end=510 the
    // hardEnd cap is 510 (since dayHardEnd = min(dayEnd, latest_end) and
    // latest_end is tighter than the day's 840-min length). 24 fencers → 4
    // pools of 6, FOIL pool round = 105 min — cannot fit in 30 min. Both
    // attempts fail at pools.
    const failing = comp('failing-event', {
      fencer_count: 24,
      de_mode: DeMode.SINGLE_STAGE,
      earliest_start: 480,
      latest_end: 510,
    })
    const config = smallConfig()

    const result = scheduleAllConcurrent([failing], config)

    // 1. Schedule does NOT contain the failing event — releaseEventAllocations
    //    deletes the entry on attempt 2's permanent failure.
    expect(result.schedule['failing-event']).toBeUndefined()

    // 2. DEADLINE_BREACH_UNRESOLVABLE (ERROR, attempt_id=2) is emitted.
    expect(result.bottlenecks).toContainEqual(expect.objectContaining({
      cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      severity: BottleneckSeverity.ERROR,
      competition_id: 'failing-event',
      attempt_id: 2,
    }))

    // 3. State integrity: no orphan ERROR bottlenecks for the failed event
    //    beyond the documented DEADLINE_BREACH_UNRESOLVABLE one (e.g. no
    //    SAME_DAY_VIOLATION leak).
    //
    // We can't read state.strip_allocations directly through the public API,
    // but releaseEventAllocations(state, 'failing-event', 2) is what removes
    // the schedule entry and the attempt_id=2 bottlenecks. The schedule-entry
    // absence (assertion 1) plus the presence of exactly one
    // DEADLINE_BREACH_UNRESOLVABLE (assertion 2) proves the rollback path
    // executed.
    const errors = result.bottlenecks.filter(
      b => b.severity === BottleneckSeverity.ERROR && b.competition_id === 'failing-event',
    )
    // Expect exactly one ERROR-severity bottleneck (the DEADLINE_BREACH_UNRESOLVABLE
    // emitted post-release).
    expect(errors.length).toBe(1)
    expect(errors[0].cause).toBe(BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE)
  })
})

// ──────────────────────────────────────────────
// Test 5: Tail estimate — de_total_end = terminal_end + tailEstimateMins
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — tail estimate on de_total_end', () => {
  it('STAGED INDIVIDUAL: de_total_end = de_round_of_16_end + 30', () => {
    const e = comp('ind', {
      event_type: EventType.INDIVIDUAL,
      fencer_count: 120,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
    })
    const config = smallConfig({
      days_available: 2,
      strips: makeStrips(30, 8),
    })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['ind']
    expect(s).toBeDefined()
    expect(s.de_total_end).not.toBeNull()
    expect(s.de_round_of_16_end).not.toBeNull()
    expect(s.de_total_end! - s.de_round_of_16_end!).toBe(tailEstimateMins(EventType.INDIVIDUAL))
  })

  it('STAGED TEAM: de_total_end = de_round_of_16_end + 60', () => {
    // Teams require a matching individual counterpart for validation.
    const ind = comp('teamInd', {
      event_type: EventType.INDIVIDUAL,
      fencer_count: 24,
      de_mode: DeMode.SINGLE_STAGE,
    })
    const team = comp('team', {
      event_type: EventType.TEAM,
      fencer_count: 30,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
    })
    const config = smallConfig({
      days_available: 3,
      strips: makeStrips(20, 8),
    })
    const result = scheduleAllConcurrent([ind, team], config)
    const s = result.schedule['team']
    expect(s).toBeDefined()
    expect(s.de_total_end).not.toBeNull()
    expect(s.de_round_of_16_end).not.toBeNull()
    expect(s.de_total_end! - s.de_round_of_16_end!).toBe(tailEstimateMins(EventType.TEAM))
  })

  it('SINGLE_STAGE: de_total_end = de_end + tailEstimateMins(event_type)', () => {
    const e = comp('single', {
      event_type: EventType.INDIVIDUAL,
      fencer_count: 24,
      de_mode: DeMode.SINGLE_STAGE,
    })
    const config = smallConfig()
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['single']
    expect(s).toBeDefined()
    expect(s.de_total_end).not.toBeNull()
    expect(s.de_end).not.toBeNull()
    expect(s.de_total_end! - s.de_end!).toBe(tailEstimateMins(EventType.INDIVIDUAL))
  })
})

// ──────────────────────────────────────────────
// Test 6: Retry — event fails once, succeeds on attempt 2
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — retry success path', () => {
  // Constructing a deterministic attempt-1-fail / attempt-2-succeed scenario
  // through public APIs alone is fragile: the retry rolls back ONLY the
  // failing event's allocations (releaseEventAllocations filters by event_id),
  // so attempt 2's resource picture is identical to attempt 1's at dayStart
  // unless a sibling event released strips during attempt 1's execution.
  // That timing is sensitive to priority-tie ordering and not stable across
  // refactors.
  //
  // Instead we assert the retry-PATH invariant: ANY event that emits
  // DEADLINE_BREACH (WARN, attempt_id=1) without a matching
  // DEADLINE_BREACH_UNRESOLVABLE (ERROR, attempt_id=2) MUST be present in
  // result.schedule. That is the contract: retry-success does not silently
  // drop the schedule entry. This is checked unconditionally, plus a
  // smoke-test of basic dense-scenario throughput.
  it('any event with DEADLINE_BREACH(1) but no DEADLINE_BREACH_UNRESOLVABLE(2) is scheduled', () => {
    // Pile up several pools competing for a small strip pool — likely to
    // produce some retry chains.
    const events = Array.from({ length: 4 }, (_, i) =>
      comp(`e${i}`, {
        gender: i % 2 === 0 ? Gender.MEN : Gender.WOMEN,
        weapon: i === 0 ? Weapon.EPEE : i === 1 ? Weapon.FOIL : Weapon.SABRE,
        category: Category.VETERAN,
        fencer_count: 24,
      }),
    )
    const config = smallConfig({
      strips: makeStrips(8, 0),
      max_pool_strip_pct: 0.6,
      days_available: 2,
    })
    const result = scheduleAllConcurrent(events, config)

    const breachByEvent = new Map<string, { warn: boolean; unresolvable: boolean }>()
    for (const b of result.bottlenecks) {
      if (b.cause === BottleneckCause.DEADLINE_BREACH && b.severity === BottleneckSeverity.WARN) {
        const e = breachByEvent.get(b.competition_id) ?? { warn: false, unresolvable: false }
        e.warn = true
        breachByEvent.set(b.competition_id, e)
      }
      if (b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE) {
        const e = breachByEvent.get(b.competition_id) ?? { warn: false, unresolvable: false }
        e.unresolvable = true
        breachByEvent.set(b.competition_id, e)
      }
    }

    // Retry-success contract: warn-only ⇒ event scheduled.
    for (const [eventId, status] of breachByEvent) {
      if (status.warn && !status.unresolvable) {
        expect(
          result.schedule[eventId],
          `${eventId} hit DEADLINE_BREACH(1) without DEADLINE_BREACH_UNRESOLVABLE — retry should have scheduled it`,
        ).toBeDefined()
      }
    }

    // Smoke: at least one event scheduled.
    expect(Object.keys(result.schedule).length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// Test 7: Permanent failure — both attempts fail, attempt_id tags emitted
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — permanent deadline breach', () => {
  it('emits DEADLINE_BREACH(WARN, 1) AND DEADLINE_BREACH_UNRESOLVABLE(ERROR, 2) on full failure', () => {
    // Tight latest_end forces both attempts to fail. earliest_start=8AM,
    // latest_end=8:30 leaves no time for a real pool round.
    const huge = comp('huge', {
      fencer_count: 24,
      de_mode: DeMode.SINGLE_STAGE,
      earliest_start: 480,
      latest_end: 510,
    })
    const config = smallConfig()
    const result = scheduleAllConcurrent([huge], config)

    const warns = result.bottlenecks.filter(
      b => b.cause === BottleneckCause.DEADLINE_BREACH &&
           b.severity === BottleneckSeverity.WARN &&
           b.competition_id === 'huge',
    )
    const errors = result.bottlenecks.filter(
      b => b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE &&
           b.severity === BottleneckSeverity.ERROR &&
           b.competition_id === 'huge',
    )

    expect(warns.length).toBeGreaterThanOrEqual(1)
    expect(errors.length).toBeGreaterThanOrEqual(1)
    // Tag check
    expect(warns.some(w => w.attempt_id === 1)).toBe(true)
    expect(errors.some(e => e.attempt_id === 2)).toBe(true)
    // Schedule does not contain the event.
    expect(result.schedule['huge']).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// Test 8: Per-strip DE referee demand (US1) — staged DE blocks report one ref
// per allocated strip, matching the existing DE_SINGLE branch, instead of one
// ref per DE_POD_SIZE-strip pod.
// ──────────────────────────────────────────────

/**
 * Finds `day`'s ref-requirements entry and returns its peak_total_refs,
 * asserting the entry exists. Collapses the find/toBeDefined/read-field
 * sequence repeated across the per-strip DE ref demand tests below.
 */
function peakRefsOnDay(result: ReturnType<typeof scheduleAllConcurrent>, day: number): number {
  const dayReq = result.ref_requirements_by_day!.find(r => r.day === day)
  expect(dayReq).toBeDefined()
  return dayReq!.peak_total_refs
}

describe('scheduleAllConcurrent — per-strip DE referee demand (US1)', () => {
  it('STAGED event: DE_PRELIMS block emits ref demand equal to its allocated strip count', () => {
    // Bracket 64 (fencer_count=64, cut disabled) forces a DE_PRELIMS block ahead
    // of DE_ROUND_OF_16. de_round_of_16_strips is kept small so DE_PRELIMS (capped
    // at DEFAULT_DE_STRIP_FOOTPRINT = 16) is the day's dominant demand.
    const e = comp('prelimsEvt', {
      fencer_count: 64,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 4,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const config = smallConfig({
      days_available: 2,
      strips: makeStrips(40, 8),
    })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['prelimsEvt']
    expect(s).toBeDefined()
    expect(s.de_prelims_strip_count).toBeGreaterThan(0)

    // Guard: prelims genuinely dominates the day (not pools or R16), so the
    // day's peak can only reflect the prelims block's own ref count.
    expect(s.pool_refs_count).toBeLessThan(s.de_prelims_strip_count)
    expect(s.de_round_of_16_strip_count).toBeLessThan(s.de_prelims_strip_count)

    // Target: one ref per allocated strip (config.DE_REFS=1) — same model as
    // DE_SINGLE — not one ref per DE_POD_SIZE-strip pod (which would report
    // ceil(strip_count / DE_POD_SIZE) instead).
    expect(peakRefsOnDay(result, s.assigned_day)).toBe(s.de_prelims_strip_count * config.DE_REFS)
  })

  it('STAGED event with bracket < 64 (no prelims): DE_ROUND_OF_16 block emits ref demand equal to its allocated strip count', () => {
    // Bracket 32 (fencer_count=24) — dePhasesForBracket returns just
    // [DE_ROUND_OF_16], isolating the R16 block from any DE_PRELIMS contribution.
    const e = comp('r16Evt', {
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 16,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const config = smallConfig({ strips: makeStrips(20, 4) })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['r16Evt']
    expect(s).toBeDefined()
    expect(s.de_prelims_strip_count).toBe(0)
    expect(s.de_round_of_16_strip_count).toBeGreaterThan(0)
    expect(s.pool_refs_count).toBeLessThan(s.de_round_of_16_strip_count)

    expect(peakRefsOnDay(result, s.assigned_day)).toBe(s.de_round_of_16_strip_count * config.DE_REFS)
  })

  it('SINGLE_STAGE event: DE block ref demand is unchanged — still one ref per allocated strip', () => {
    const e = comp('singleEvt', {
      fencer_count: 24,
      de_mode: DeMode.SINGLE_STAGE,
      cut_mode: CutMode.DISABLED,
    })
    const config = smallConfig({ strips: makeStrips(20, 4) })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['singleEvt']
    expect(s).toBeDefined()
    expect(s.de_strip_count).toBeGreaterThan(0)
    expect(s.pool_refs_count).toBeLessThan(s.de_strip_count)

    expect(peakRefsOnDay(result, s.assigned_day)).toBe(s.de_strip_count * config.DE_REFS)
  })

  it('two concurrent STAGED events emit independent per-strip DE_ROUND_OF_16 intervals that sum at their overlap', () => {
    // Symmetric competitions (same fencer_count/weapon/strip target, differing
    // only by gender) with abundant single-day capacity produce identical R16
    // windows — the overlap guard below confirms that determinism.
    const a = comp('r16A', {
      gender: Gender.MEN, weapon: Weapon.EPEE, category: Category.DIV1,
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 8,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const b = comp('r16B', {
      gender: Gender.WOMEN, weapon: Weapon.EPEE, category: Category.DIV1,
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 8,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const config = smallConfig({ days_available: 2, strips: makeStrips(40, 8) })
    const result = scheduleAllConcurrent([a, b], config)
    const s1 = result.schedule['r16A']
    const s2 = result.schedule['r16B']
    expect(s1).toBeDefined()
    expect(s2).toBeDefined()
    // Guard: symmetric competitions with abundant capacity land on the same day.
    expect(s1.assigned_day).toBe(s2.assigned_day)

    // Guard: confirms the two R16 windows genuinely overlap in time.
    expect(s1.de_round_of_16_start).toBe(s2.de_round_of_16_start)
    expect(s1.de_round_of_16_end).toBe(s2.de_round_of_16_end)

    // Each event's block is an independent interval, so overlapping demand
    // adds — not one shared pod count for the pair.
    expect(peakRefsOnDay(result, s1.assigned_day)).toBe(
      (s1.de_round_of_16_strip_count + s2.de_round_of_16_strip_count) * config.DE_REFS,
    )
  })

  it('pool phase ref demand still uses resolveRefsPerPool, unaffected by the DE pod removal', () => {
    const e = comp('poolEvt', {
      fencer_count: 30,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 1,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const config = smallConfig({ strips: makeStrips(20, 4) })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['poolEvt']
    expect(s).toBeDefined()

    const expectedPoolRefs = resolveRefsPerPool(
      e.ref_policy,
      computePoolStructure(e.fencer_count, e.use_single_pool_override).n_pools,
    ).refs_needed
    expect(s.pool_refs_count).toBe(expectedPoolRefs)
    // Guard: pools genuinely dominate the day (DE strip count is tiny), so the
    // day's peak reflects only the pool phase's resolveRefsPerPool count.
    expect(s.de_round_of_16_strip_count).toBeLessThan(expectedPoolRefs)

    expect(peakRefsOnDay(result, s.assigned_day)).toBe(expectedPoolRefs)
  })

  it('STAGED event with DE_REFS=2: DE_ROUND_OF_16 block demand is strips × DE_REFS, not strips × 1', () => {
    // Same bracket/strip shape as the "no prelims" R16 test above, but DE_REFS=2
    // pins the × config.DE_REFS multiplier. The rest of this suite runs at the
    // default DE_REFS=1, where "strips × DE_REFS" and "strips × 1" are numerically
    // identical and so cannot catch a staged block landing in the wrong branch.
    const e = comp('r16RefsEvt', {
      fencer_count: 24,
      de_mode: DeMode.STAGED,
      cut_mode: CutMode.DISABLED,
      de_round_of_16_strips: 16,
      de_video_policy: VideoPolicy.BEST_EFFORT,
    })
    const config = smallConfig({ strips: makeStrips(20, 4), DE_REFS: 2 })
    const result = scheduleAllConcurrent([e], config)
    const s = result.schedule['r16RefsEvt']
    expect(s).toBeDefined()
    expect(s.de_prelims_strip_count).toBe(0)
    expect(s.de_round_of_16_strip_count).toBeGreaterThan(0)
    expect(s.pool_refs_count).toBeLessThan(s.de_round_of_16_strip_count)

    expect(peakRefsOnDay(result, s.assigned_day)).toBe(s.de_round_of_16_strip_count * config.DE_REFS)
  })
})

// ──────────────────────────────────────────────
// DSatur least-bad-color fallback: report the hard edges it breaks as WARN
// bottlenecks (R7 / US2, T010)
//
// T009 (dayColoring.ts) already collects the pairs the least-bad-color
// fallback shares a day across a hard (Infinity-weight) edge, in
// `assignDaysByColoring`'s returned `violations`. This suite pins the
// consumer side: scheduleAllConcurrent must turn each one into a WARN
// bottleneck naming both competitions, and must never emit one when the
// coloring is satisfiable. Fixture and strip count match
// __tests__/engine/dayColoring.test.ts's R7 suite exactly, per baseline.md §2.
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — hard-edge violation bottlenecks (R7 / US2, T010)', () => {
  const STRIPS = 80
  const VIDEO_STRIPS = 12

  /** Builds one template through the app's own configuration path, exactly as baseline.md §2/§3 measured it. */
  function buildTemplate(name: string) {
    useStore.setState(useStore.getInitialState(), true)
    const state = () => useStore.getState()
    state().setDays(state().days_available) // populates dayConfigs at the default 3, as boot does
    state().applyTemplate(name)
    state().setStrips(STRIPS)
    state().setVideoStrips(VIDEO_STRIPS)
    return buildTournamentConfig(state())
  }

  it('NAC Cadet/Junior at 3 days / 80 strips / 12 video: one WARN UNAVOIDABLE_CROSSOVER_CONFLICT bottleneck per hard-edged pair, naming both ids (baseline.md §2, 6 pairs)', () => {
    const { config, competitions } = buildTemplate('NAC Cadet/Junior')
    const { bottlenecks } = scheduleAllConcurrent(competitions, config)

    // baseline.md §2 "Witness pairs" table, 80 strips / 12 video column.
    const expectedPairs: [string, string][] = [
      ['CDT-M-EPEE-TEAM', 'JR-M-EPEE-TEAM'],
      ['CDT-M-FOIL-TEAM', 'JR-M-FOIL-TEAM'],
      ['CDT-M-SABRE-IND', 'JR-M-SABRE-TEAM'],
      ['CDT-W-EPEE-TEAM', 'JR-W-EPEE-TEAM'],
      ['CDT-W-FOIL-TEAM', 'JR-W-FOIL-TEAM'],
      ['CDT-W-SABRE-TEAM', 'JR-W-SABRE-TEAM'],
    ]

    const crossoverBottlenecks = bottlenecks.filter(
      b => b.cause === BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
    )
    expect(crossoverBottlenecks).toHaveLength(6)
    for (const b of crossoverBottlenecks) {
      expect(b.severity).toBe(BottleneckSeverity.WARN)
    }

    // Reads bn.message for the paired competition rather than a structured
    // subject, because Bottleneck (src/engine/types.ts) carries only a single
    // competition_id and a free-text message — no field for a second subject
    // the way ValidationError carries `subjects: string[]`. This is the best
    // available option against today's interface, not an oversight; see
    // docs/design/backlog.md §Bottleneck has no structured field for a second
    // subject.
    for (const [a, b] of expectedPairs) {
      const match = crossoverBottlenecks.filter(bn =>
        (bn.competition_id === a || bn.competition_id === b)
        && bn.message.includes(a) && bn.message.includes(b),
      )
      expect(match, `expected exactly one bottleneck for ${a} + ${b}`).toHaveLength(1)
    }
  })

  it('NAC Youth at 3 days / 80 strips / 12 video: hard-constraint graph is satisfiable, reports no UNAVOIDABLE_CROSSOVER_CONFLICT bottleneck (baseline.md §2, viol=0)', () => {
    const { config, competitions } = buildTemplate('NAC Youth')
    const { bottlenecks } = scheduleAllConcurrent(competitions, config)

    const crossoverBottlenecks = bottlenecks.filter(
      b => b.cause === BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
    )
    expect(crossoverBottlenecks).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// R2 / US3 (T012): a per-event structural finding excludes its own
// competition, not the tournament. Today (pre-T015) any ERROR from
// validateConfig empties the whole schedule — see the gate at
// concurrentScheduler.ts:197-204. Each case below is red for that reason:
// the valid events are absent too, not just the defective one.
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — a per-event finding excludes one event, not the tournament (R2 / US3, T012)', () => {
  /**
   * Three valid events, deliberately distinct in category/gender/weapon so
   * none collides with another on the same-population key (category|gender|
   * weapon) and none is mistaken for the defective event.
   */
  function validTrio(): Competition[] {
    return [
      comp('valid-1', { category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL }),
      comp('valid-2', { category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.EPEE }),
      comp('valid-3', { category: Category.VETERAN, gender: Gender.WOMEN, weapon: Weapon.EPEE }),
    ]
  }

  /**
   * FR-006 half 1: the named rule fires as an ERROR naming the bad event, via
   * validateConfig directly — rule id and subjects, never message text.
   * Exactly one, per FR-006's "keeping one ERROR per excluded competition" —
   * a second match here would be a duplicate emission, not a passing variant.
   */
  function assertRuleError(competitions: Competition[], config: TournamentConfig, badId: string, rule: string): void {
    const errors = validateConfig(config, competitions, ValidationMode.BINDING)
    const matches = errors.filter(
      e => e.severity === BottleneckSeverity.ERROR && e.rule === rule && (e.subjects ?? []).includes(badId),
    )
    expect(matches.length, `expected exactly one '${rule}' ERROR naming ${badId}`).toBe(1)
  }

  /** FR-006 half 2: every valid event is scheduled and the bad one has no entry. */
  function assertOnlyValidScheduled(competitions: Competition[], config: TournamentConfig, badIds: string[]): void {
    const { schedule } = scheduleAllConcurrent(competitions, config)
    for (const c of competitions) {
      if (badIds.includes(c.id)) continue
      expect(schedule[c.id], `${c.id} should be scheduled`).toBeDefined()
    }
    for (const badId of badIds) {
      expect(schedule[badId], `${badId} should have no schedule entry`).toBeUndefined()
    }
  }

  it('fencer-count-bounds: the valid events schedule, the below-minimum event is excluded', () => {
    // fencer_count 1 < MIN_FENCERS (2). Guarded everywhere else in
    // validation.ts by `fencer_count >= MIN_FENCERS`, so no other rule
    // reads this competition's derived fields — isolated to one finding.
    // category/gender/weapon deliberately differ from validTrio()'s
    // 'valid-1' (DIV1/MEN/FOIL) so this event does not share its
    // same-population key — smallConfig()'s 2-day default sits exactly at
    // the same-population rule's threshold, so a collision here would pass
    // by accident rather than by isolation.
    const bad = comp('bad-fencer-count', {
      fencer_count: 1, category: Category.CADET, gender: Gender.WOMEN, weapon: Weapon.EPEE,
    })
    const competitions = [...validTrio(), bad]
    const config = smallConfig()

    assertRuleError(competitions, config, bad.id, 'fencer-count-bounds')
    assertOnlyValidScheduled(competitions, config, [bad.id])
  })

  it('cut-value-range: the valid events schedule, the out-of-range COUNT cut is excluded', () => {
    // COUNT cut_value (30) exceeds fencer_count (24) — fires cut-value-range.
    // computeDeFencerCount's COUNT branch clamps to min(cutValue, fencerCount)
    // = fencerCount, so bracket size is unaffected and no other rule fires.
    const bad = comp('bad-cut-range', { cut_mode: CutMode.COUNT, cut_value: 30, fencer_count: 24, category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.SABRE })
    const competitions = [...validTrio(), bad]
    const config = smallConfig()

    assertRuleError(competitions, config, bad.id, 'cut-value-range')
    assertOnlyValidScheduled(competitions, config, [bad.id])
  })

  it('cut-value-min-promotions: the valid events schedule, the too-small COUNT cut is excluded', () => {
    // COUNT cut_value (1) is within fencer_count so cut-value-range does not
    // fire, but computeDeFencerCount clamps promoted to max(1, 2) = 2 before
    // the bracket lookup, so the raw rawPromoted=1 check here is the only
    // finding — bracket size 2 has a table entry for every weapon.
    const bad = comp('bad-min-promotions', { cut_mode: CutMode.COUNT, cut_value: 1, fencer_count: 24, category: Category.DIV1, gender: Gender.WOMEN, weapon: Weapon.SABRE })
    const competitions = [...validTrio(), bad]
    const config = smallConfig()

    assertRuleError(competitions, config, bad.id, 'cut-value-min-promotions')
    assertOnlyValidScheduled(competitions, config, [bad.id])
  })

  it('de-duration-table-missing-entry: the valid events schedule, the event with no table entry is excluded', () => {
    // fencer_count 24, cut_mode DISABLED -> bracket 32. The config's DE
    // duration table has the SABRE/32 entry removed, and only the
    // defective event uses SABRE — the three valid events stay on
    // FOIL/EPEE, whose tables are untouched.
    const sabreTable: Record<number, number> = { ...DEFAULT_DE_DURATION_TABLE[Weapon.SABRE] }
    delete sabreTable[32]
    const config = smallConfig({
      de_duration_table: { ...DEFAULT_DE_DURATION_TABLE, [Weapon.SABRE]: sabreTable },
    })
    const bad = comp('bad-de-duration', { weapon: Weapon.SABRE, category: Category.CADET, gender: Gender.MEN })
    const competitions = [...validTrio(), bad]

    assertRuleError(competitions, config, bad.id, 'de-duration-table-missing-entry')
    assertOnlyValidScheduled(competitions, config, [bad.id])
  })

  it('video-r16-strip-shortfall: the valid events schedule, the under-provisioned STAGED/REQUIRED event is excluded', () => {
    // STAGED + REQUIRED video with de_round_of_16_strips (8) exceeding
    // video_strips_total (4, from smallConfig's makeStrips(20, 4)). Bracket
    // size and cut fields are left at their defaults so nothing else fires.
    const bad = comp('bad-video-shortfall', {
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 8,
      category: Category.CADET,
      gender: Gender.WOMEN,
    })
    const competitions = [...validTrio(), bad]
    const config = smallConfig()

    assertRuleError(competitions, config, bad.id, 'video-r16-strip-shortfall')
    assertOnlyValidScheduled(competitions, config, [bad.id])
  })

  it('FR-009: one summary finding names how many competitions were excluded', () => {
    // Two independent fencer-count-bounds defects, so the excluded count is
    // unambiguous (2) and distinct from "one ERROR per excluded event."
    // category/gender/weapon deliberately unique per event (and distinct from
    // validTrio()'s DIV1/MEN/FOIL) so neither collides with the other or with
    // a valid event on the same-population key.
    const bad1 = comp('bad-1', { fencer_count: 1, category: Category.DIV3, gender: Gender.WOMEN, weapon: Weapon.FOIL })
    const bad2 = comp('bad-2', { fencer_count: 1, category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE })
    const competitions = [...validTrio(), bad1, bad2]
    const config = smallConfig()

    assertOnlyValidScheduled(competitions, config, [bad1.id, bad2.id])

    // Every other bottleneck this validation gate produces today is either
    // an ERROR (the per-event findings themselves) or lives outside
    // Phase.VALIDATION entirely — so cause RESOURCE_EXHAUSTION + WARN +
    // Phase.VALIDATION is free for T015 to use for the summary alone, and
    // this is where T015 must put it (research.md D2, FR-009).
    const { bottlenecks } = scheduleAllConcurrent(competitions, config)
    const summaries = bottlenecks.filter(
      b => b.phase === Phase.VALIDATION
        && b.severity === BottleneckSeverity.WARN
        && b.cause === BottleneckCause.RESOURCE_EXHAUSTION,
    )
    expect(summaries, 'expected exactly one summary bottleneck for the excluded count').toHaveLength(1)
    expect(summaries[0]?.message, 'summary message should name the excluded count').toMatch(/\b2\b/)
  })

  // ──────────────────────────────────────────────
  // T013 (FR-008 complement): a *global* ERROR — one not on R2's per-event
  // list — must still empty the whole schedule, exactly as today. This is a
  // guard, not a red test: it passes now (pre-T015, every ERROR empties the
  // schedule) and it MUST STILL PASS after T015 restricts the exclusion to
  // the five per-event rule ids (research.md D2, D3). Do not "fix" this file
  // by making these red — a green run here is what proves T015 did not
  // over-reach into global findings. Nested here (rather than as a sibling
  // describe) to reuse validTrio() by closure instead of duplicating it.
  // ──────────────────────────────────────────────

  describe('a global finding still empties the whole schedule (T013)', () => {
    /** Every case must schedule nothing and must carry the named rule id among its ERRORs. */
    function assertEmptyWithRuleError(competitions: Competition[], config: TournamentConfig, rule: string): void {
      const errors = validateConfig(config, competitions, ValidationMode.BINDING)
      const matches = errors.filter(e => e.severity === BottleneckSeverity.ERROR && e.rule === rule)
      expect(matches.length, `expected a '${rule}' ERROR`).toBeGreaterThan(0)

      const { schedule } = scheduleAllConcurrent(competitions, config)
      expect(Object.keys(schedule), 'expected an empty schedule').toHaveLength(0)
    }

    it('strips-total-positive: no strips at all still empties the schedule', () => {
      const competitions = validTrio()
      const config = smallConfig({ strips_total: 0 })

      assertEmptyWithRuleError(competitions, config, 'strips-total-positive')
    })

    it('duplicate-competition-id: two competitions sharing an id still empties the schedule', () => {
      const dupe = comp('valid-1', { category: Category.CADET, gender: Gender.MEN, weapon: Weapon.SABRE })
      const competitions = [...validTrio(), dupe]
      const config = smallConfig()

      assertEmptyWithRuleError(competitions, config, 'duplicate-competition-id')
    })

    // A `feasibility-strip-hours` case stood here until 011's T006. It was the
    // block's fourth witness, and it is gone rather than rewritten in place:
    // T004 demoted that rule to a WARN in every mode, so the fixture it used no
    // longer contains a global ERROR of any kind and cannot demonstrate this
    // block's claim in any form. The fixture itself survives — see
    // 'the demotion does not rescue a structurally impossible venue' below,
    // where it now guards the opposite half. The three cases above are
    // untouched and still carry the block's purpose.

    it('mixed: a per-event finding alongside a global one still empties the schedule (D3)', () => {
      // D3: findings are computed once over the full set. A tournament
      // carrying both a per-event finding (fencer-count-bounds) and a global
      // one (strips-total-positive) is rejected whole -- today's behavior,
      // unchanged, which is what FR-008 pins.
      const badFencerCount = comp('bad-fencer-count', { fencer_count: 1 })
      const competitions = [...validTrio(), badFencerCount]
      const config = smallConfig({ strips_total: 0 })

      const errors = validateConfig(config, competitions, ValidationMode.BINDING)
      expect(
        errors.some(e => e.severity === BottleneckSeverity.ERROR && e.rule === 'fencer-count-bounds'),
        'expected a fencer-count-bounds ERROR',
      ).toBe(true)
      expect(
        errors.some(e => e.severity === BottleneckSeverity.ERROR && e.rule === 'strips-total-positive'),
        'expected a strips-total-positive ERROR',
      ).toBe(true)

      const { schedule } = scheduleAllConcurrent(competitions, config)
      expect(Object.keys(schedule), 'expected an empty schedule').toHaveLength(0)
    })
  })
})

// ──────────────────────────────────────────────
// The demoted feasibility finding (011 US1 T006, FR-001, SC-004)
//
// This block holds the fixture that used to live in the T013 block above as
// 'feasibility-strip-hours: an aggregate shortfall with every individual event
// valid still empties the schedule'. Three 200-fencer events, one day, two
// strips — an aggregate demand of 323 strip-hours against 28 available.
//
// T006 was told to rewrite that case to assert a non-empty board carrying the
// WARN. Measurement says otherwise and measurement wins (tasks.md standing rule
// 8): this fixture's board is STILL empty after the demotion, and the reason it
// was empty was never feasibility alone. `[M]` at T006, `validateConfig` on it
// returns three ERROR `resource-precondition-strips` — one per event, "requires
// 29 strips for pools but only 2 total strips configured" — alongside the
// feasibility finding. The old case's own comment claimed "every event here is
// individually valid (no per-event finding fires)", and that claim was already
// false before 011 touched anything. It passed only because it asserted the
// presence of a feasibility ERROR and then an empty board, and the per-event
// ERRORs delivered the empty board independently.
//
// So the fixture is kept and its two halves are separated, which is what it
// could never do while it was asserting one thing:
//
//  - the demotion reached it: no ERROR carries either feasibility rule id, and
//    the shortfall is still reported, as a WARN (FR-001, FR-002).
//  - the demotion did not reach past it: a structurally impossible venue still
//    empties the board. SC-004 says every board still empty after this feature
//    is empty for a structural reason, and this is the engine-level case of it.
//
// The "non-empty board carrying the WARN" assertion T006 was asked for is made
// where a fixture can actually carry it: on B4 in `driftLedger.test.ts`, and on
// the 13-event single-finding fixture in the T005 block below.
// ──────────────────────────────────────────────

describe('scheduleAllConcurrent — the demoted feasibility finding (011 T006)', () => {
  /** Three 200-fencer events on one day and two strips: 323 strip-hours wanted, 28 available. */
  function aggregateShortfall(): { competitions: Competition[]; config: TournamentConfig } {
    return {
      competitions: [
        comp('big-1', { category: Category.DIV1, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 200 }),
        comp('big-2', { category: Category.JUNIOR, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 200 }),
        comp('big-3', { category: Category.VETERAN, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 200 }),
      ],
      config: smallConfig({ days_available: 1, strips: makeStrips(2, 0), strips_total: 2, video_strips_total: 0 }),
    }
  }

  it('reports the aggregate shortfall as a WARN and contributes no ERROR', () => {
    const { competitions, config } = aggregateShortfall()
    const findings = validateConfig(config, competitions, ValidationMode.BINDING)

    // Present, so the demotion cannot become a deletion: the organizer is still
    // told about a 295 strip-hour shortfall. Rule id and severity, never message
    // text — FR-001 holds the text unchanged and this file does not police it.
    const feasibility = findings.filter(f => f.rule === 'feasibility-strip-hours')
    expect(feasibility, 'the shortfall must still be reported').toHaveLength(1)
    expect(feasibility[0]?.severity).toBe(BottleneckSeverity.WARN)

    // And absent from the ERROR set, in both modes. A re-escalation in either
    // one is what empties boards, and BINDING alone would not catch a mode
    // re-derivation returning to validation.ts:74-77 (research.md D1).
    for (const mode of [ValidationMode.BINDING, ValidationMode.ADVISORY]) {
      const errors = validateConfig(config, competitions, mode)
        .filter(f => f.severity === BottleneckSeverity.ERROR)
        .map(f => f.rule)
      expect(errors, `no feasibility ERROR under ${mode}`).not.toContain('feasibility-strip-hours')
      expect(errors, `no video feasibility ERROR under ${mode}`).not.toContain('feasibility-video-strip-hours')
    }
  })

  it('does not rescue a structurally impossible venue — the board is still empty (SC-004)', () => {
    const { competitions, config } = aggregateShortfall()

    // The ERRORs that hold this board empty are per-event and structural: each
    // of the three events needs 29 pool strips and the venue has 2. Pinned by
    // rule id so this fails loudly if the emptying ever changes hands back to
    // an aggregate estimate rather than silently reading as "still empty".
    const errors = validateConfig(config, competitions, ValidationMode.BINDING)
      .filter(f => f.severity === BottleneckSeverity.ERROR)
    expect(errors.map(f => f.rule)).toEqual([
      'resource-precondition-strips', 'resource-precondition-strips', 'resource-precondition-strips',
    ])

    const { schedule } = scheduleAllConcurrent(competitions, config)
    expect(Object.keys(schedule), 'a venue that cannot hold one event\'s pools schedules nothing').toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// postScheduleDiagnostics — the strip recommendation must survive a
// WARN-only feasibility finding (011 US1 T005, research.md D3, FR-004)
// ──────────────────────────────────────────────

describe('postScheduleDiagnostics — the recommendation survives a WARN-only feasibility finding, and its message names four levers in order with no strip count (T005, T009)', () => {
  it('a configuration whose only finding is feasibility-strip-hours (WARN) still emits the post-schedule RESOURCE_RECOMMENDATION INFO', () => {
    // 13 events, one strip-hour-hungry combination per category/gender/weapon
    // so `same-population` never fires. max_pool_strip_pct is deliberately
    // below 1.0 so each event's own pool count (5, from 32 fencers) stays
    // under strips_total (8) — no per-event resource-precondition-strips
    // ERROR — while recommendStripCount's answer still exceeds it, which is
    // what the post-schedule INFO is gated on. The resulting demand
    // (13 events) trips the aggregate feasibility band, which after 011 T004
    // is a WARN, not an ERROR: validateConfig produces exactly that one
    // finding and nothing else, so the only bottleneck carrying
    // RESOURCE_EXHAUSTION is a WARN, never an ERROR. Some events still miss
    // their deadline once scheduling actually runs — an oversubscribed venue
    // producing DEADLINE_BREACH_UNRESOLVABLE ERRORs on excluded events is the
    // accepted cost recorded in spec.md Edge Cases, and those ERRORs carry a
    // different cause, so they play no part in the gate this test checks.
    const combos: Array<[Category, Gender, Weapon]> = [
      [Category.DIV1, Gender.MEN, Weapon.FOIL],
      [Category.DIV1, Gender.WOMEN, Weapon.EPEE],
      [Category.DIV1A, Gender.MEN, Weapon.SABRE],
      [Category.DIV1A, Gender.WOMEN, Weapon.FOIL],
      [Category.DIV2, Gender.MEN, Weapon.EPEE],
      [Category.DIV2, Gender.WOMEN, Weapon.SABRE],
      [Category.DIV3, Gender.MEN, Weapon.FOIL],
      [Category.DIV3, Gender.WOMEN, Weapon.EPEE],
      [Category.JUNIOR, Gender.MEN, Weapon.SABRE],
      [Category.JUNIOR, Gender.WOMEN, Weapon.FOIL],
      [Category.CADET, Gender.MEN, Weapon.EPEE],
      [Category.CADET, Gender.WOMEN, Weapon.SABRE],
      [Category.DIV1, Gender.MEN, Weapon.EPEE],
    ]
    const competitions = combos.map(([category, gender, weapon], i) =>
      comp(`ev-${i}`, { category, gender, weapon, fencer_count: 32, de_round_of_16_strips: 4 }),
    )
    const config = smallConfig({
      days_available: 2,
      strips: makeStrips(8, 8),
      strips_total: 8,
      video_strips_total: 8,
      max_pool_strip_pct: 0.6,
      max_de_strip_pct: 1.0,
    })

    const errors = validateConfig(config, competitions, ValidationMode.BINDING)
    expect(errors, 'expected exactly one finding: the feasibility WARN').toHaveLength(1)
    expect(errors[0]?.rule).toBe('feasibility-strip-hours')
    expect(errors[0]?.severity).toBe(BottleneckSeverity.WARN)

    const { schedule, bottlenecks } = scheduleAllConcurrent(competitions, config)

    // 011 T006, FR-003. This is the file's only fixture whose validation output
    // is the feasibility WARN and nothing else, so it is the only one that can
    // witness "a board is not emptied by an aggregate estimate" without another
    // finding confounding the result. Before T004 this same configuration
    // returned nothing at all. `[M]` at T006 it places 3 of its 13 events —
    // asserted as a lower bound rather than pinned at 3, because the number a
    // 13-event board fits into 8 strips is packing detail this test has no
    // stake in, while zero is the outcome R5 exists to prevent. The drift
    // ledger pins exact counts; this pins the absence of a collapse.
    expect(
      Object.keys(schedule).length,
      'a board whose only finding is a feasibility WARN must not come back empty (FR-003)',
    ).toBeGreaterThan(0)

    expect(
      bottlenecks.some(b => b.severity === BottleneckSeverity.ERROR && b.cause === BottleneckCause.RESOURCE_EXHAUSTION),
      'expected no ERROR carrying RESOURCE_EXHAUSTION — feasibility is the only such finding and it is a WARN',
    ).toBe(false)

    const recommendation = bottlenecks.find(b => b.cause === BottleneckCause.RESOURCE_RECOMMENDATION)
    expect(recommendation, 'expected the post-schedule strip recommendation to survive the WARN-only feasibility finding').toBeDefined()
    expect(recommendation?.severity).toBe(BottleneckSeverity.INFO)

    // T009/FR-012: the four levers are named in this fixed order — add a day,
    // flight the largest events, cap entries, add strips (last, because
    // strips mean renting more of the facility). Asserted on each phrase's
    // index, not on the whole string, so the surrounding prose can change
    // freely as long as the order holds.
    const message = recommendation?.message ?? ''
    const iDay = message.indexOf('add a day')
    const iFlight = message.indexOf('flight')
    const iCap = message.indexOf('cap entries')
    const iStrips = message.indexOf('add strips')
    expect(iDay, 'expected "add a day" in the message').toBeGreaterThanOrEqual(0)
    expect(iFlight, 'expected "flight" in the message').toBeGreaterThanOrEqual(0)
    expect(iCap, 'expected "cap entries" in the message').toBeGreaterThanOrEqual(0)
    expect(iStrips, 'expected "add strips" in the message').toBeGreaterThanOrEqual(0)
    expect(iDay, 'days before flighting').toBeLessThan(iFlight)
    expect(iFlight, 'flighting before entry caps').toBeLessThan(iCap)
    expect(iCap, 'entry caps before strips').toBeLessThan(iStrips)

    // FR-015: the finding reports no strip count of its own — the shortfall
    // figures above already carry the numbers (FR-013).
    expect(message, 'expected no digit anywhere in the lever message').not.toMatch(/\d/)
  })

  it('a board that fits emits no RESOURCE_RECOMMENDATION bottleneck', () => {
    // Same shape as test 1 (lines 64-75): two comp(...) events of 20 fencers
    // each on a plain smallConfig() (2 days, 20 strips). validateConfig is
    // checked first so this pins "the board really fits," not merely "this
    // gate stays quiet for some other reason."
    const c1 = comp('e1', {
      gender: Gender.MEN, weapon: Weapon.EPEE, category: Category.VETERAN,
      fencer_count: 20,
    })
    const c2 = comp('e2', {
      gender: Gender.WOMEN, weapon: Weapon.FOIL, category: Category.VETERAN,
      fencer_count: 20,
    })
    const config = smallConfig()

    const findings = validateConfig(config, [c1, c2], ValidationMode.BINDING)
    expect(
      findings.some(f => f.rule === 'feasibility-strip-hours'),
      'expected no feasibility finding — this board is meant to fit',
    ).toBe(false)

    const { bottlenecks } = scheduleAllConcurrent([c1, c2], config)
    expect(
      bottlenecks.some(b => b.cause === BottleneckCause.RESOURCE_RECOMMENDATION),
      'a board that fits must not receive the post-schedule strip recommendation',
    ).toBe(false)
  })
})
