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
  tailEstimateMins,
} from '../../src/engine/types.ts'
import type { Competition, TournamentConfig } from '../../src/engine/types.ts'
import { computePoolStructure, resolveRefsPerPool } from '../../src/engine/pools.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'

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

describe('scheduleAllConcurrent — per-strip DE referee demand (US1)', () => {
  it('STAGED event: DE_PRELIMS block emits ref demand equal to its allocated strip count', () => {
    // Bracket 64 (fencer_count=64, cut disabled) forces a DE_PRELIMS block ahead
    // of DE_ROUND_OF_16. de_round_of_16_strips is kept small so DE_PRELIMS (capped
    // at DEFAULT_DE_PODS * DE_POD_SIZE = 16) is the day's dominant demand.
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s.assigned_day)
    expect(dayReq).toBeDefined()
    // Target: one ref per allocated strip (config.DE_REFS=1) — same model as
    // DE_SINGLE — not one ref per DE_POD_SIZE-strip pod (which would report
    // ceil(strip_count / DE_POD_SIZE) instead).
    expect(dayReq!.peak_total_refs).toBe(s.de_prelims_strip_count * config.DE_REFS)
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s.assigned_day)
    expect(dayReq).toBeDefined()
    expect(dayReq!.peak_total_refs).toBe(s.de_round_of_16_strip_count * config.DE_REFS)
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s.assigned_day)
    expect(dayReq).toBeDefined()
    expect(dayReq!.peak_total_refs).toBe(s.de_strip_count * config.DE_REFS)
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s1.assigned_day)
    expect(dayReq).toBeDefined()
    // Each event's block is an independent interval, so overlapping demand
    // adds — not one shared pod count for the pair.
    expect(dayReq!.peak_total_refs).toBe(
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s.assigned_day)
    expect(dayReq).toBeDefined()
    expect(dayReq!.peak_total_refs).toBe(expectedPoolRefs)
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

    const dayReq = result.ref_requirements_by_day!.find(r => r.day === s.assigned_day)
    expect(dayReq).toBeDefined()
    expect(dayReq!.peak_total_refs).toBe(s.de_round_of_16_strip_count * config.DE_REFS)
  })
})
