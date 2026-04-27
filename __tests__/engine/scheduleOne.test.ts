import { describe, it, expect } from 'vitest'
import { scheduleCompetition } from '../../src/engine/scheduleOne.ts'
import {
  Category,
  Gender,
  Weapon,
  EventType,
  DeMode,
  VideoPolicy,
  BottleneckCause,
  dayStart,
  dayEnd,
  tailEstimateMins,
} from '../../src/engine/types.ts'
import { createGlobalState, nextFreeTime } from '../../src/engine/resources.ts'
import { SchedulingError } from '../../src/engine/dayAssignment.ts'
import { makeStrips, makeConfig, makeCompetition } from '../helpers/factories.ts'
import { RefPolicy } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Non-flighted scheduling
// ──────────────────────────────────────────────

describe('scheduleCompetition — non-flighted', () => {
  it('schedules pool phase + admin gap + DE phase on the same day', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const comp = makeCompetition({
      id: 'MF-DIV1',
      fencer_count: 24,
      strips_allocated: 8,
    })

    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // Pool phase populated
    expect(result.pool_start).not.toBeNull()
    expect(result.pool_end).not.toBeNull()
    expect(result.pool_start!).toBeLessThan(result.pool_end!)

    // DE phase populated
    expect(result.de_start).not.toBeNull()
    expect(result.de_end).not.toBeNull()
    expect(result.de_start!).toBeLessThan(result.de_end!)

    // DE starts after pool + admin gap
    expect(result.de_start!).toBeGreaterThanOrEqual(result.pool_end! + config.ADMIN_GAP_MINS)

    // All on same day
    const day = result.assigned_day
    expect(result.pool_start!).toBeGreaterThanOrEqual(dayStart(day, config))
    expect(result.de_end!).toBeLessThanOrEqual(dayEnd(day, config))
  })

  it('populates strip and ref counts in the result', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const comp = makeCompetition({ id: 'MF-DIV1', fencer_count: 24 })

    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // 24 fencers → 4 pools of 6 → pool_strips = min(n_pools=4, allocated=8) = 4
    expect(result.pool_strip_count).toBe(4)
    // AUTO ref policy, 20 foil_epee refs → 2 refs/pool × 4 pools = 8
    expect(result.pool_refs_count).toBe(8)
    // bracket=32, deOptimal=16 → engine allocates 16 strips from available pool
    expect(result.de_strip_count).toBe(16)
  })

  it('marks strips as occupied during the pool phase', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const comp = makeCompetition({ id: 'MF-DIV1', fencer_count: 24 })

    scheduleCompetition(comp, 0, state, config, [comp])

    // Some strips should be occupied past day start
    const occupiedStrips = state.strip_allocations.filter((_, i) => nextFreeTime(state, i) > dayStart(0, config))
    expect(occupiedStrips.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// Flighted (standalone)
// ──────────────────────────────────────────────

describe('scheduleCompetition — flighted standalone', () => {
  it('schedules Flight A + buffer + Flight B + admin gap + DE', () => {
    // max_de_strip_pct: 1.0 so DE can use all 24 strips (this test is not about strip caps)
    const config = makeConfig({ strips: makeStrips(24, 4), max_de_strip_pct: 1.0 })
    const comp = makeCompetition({
      id: 'MF-CADET',
      fencer_count: 80,
      category: Category.CADET,
      flighted: true,
      strips_allocated: 12,
      weapon: Weapon.FOIL,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    expect(result.use_flighting).toBe(true)

    // Both flights populated
    expect(result.flight_a_start).not.toBeNull()
    expect(result.flight_a_end).not.toBeNull()
    expect(result.flight_b_start).not.toBeNull()
    expect(result.flight_b_end).not.toBeNull()

    // Flight A before Flight B
    expect(result.flight_a_start!).toBeLessThan(result.flight_b_start!)

    // Both flights on same day
    const day = result.assigned_day
    const ds = dayStart(day, config)
    const de = dayEnd(day, config)
    expect(result.flight_a_start!).toBeGreaterThanOrEqual(ds)
    expect(result.flight_b_end!).toBeLessThanOrEqual(de)
  })

  it('does NOT emit FLIGHT_B_DELAYED when strips are plentiful and Flight B starts on schedule', () => {
    // 24 strips, 12 needed per flight — no contention, Flight B should start on time.
    // 80 fencers → 12 pools → AUTO policy needs 24 refs (2/pool); provide 30 sabre refs.
    const strips = makeStrips(24, 4)
    const config = makeConfig({
      strips,
      strips_total: 24,
      video_strips_total: 4,
      THRESHOLD_MINS: 10,
      FLIGHT_BUFFER_MINS: 15,
    })
    const comp = makeCompetition({
      id: 'MS-CADET',
      fencer_count: 80,
      category: Category.CADET,
      flighted: true,
      strips_allocated: 12,
      weapon: Weapon.SABRE,
    })

    const state = createGlobalState(config)
    scheduleCompetition(comp, 0, state, config, [comp])

    const result = state.schedule['MS-CADET']
    expect(result.flight_a_start).not.toBeNull()
    expect(result.flight_b_start).not.toBeNull()
    expect(result.flight_a_start!).toBeLessThan(result.flight_b_start!)
    expect(result.use_flighting).toBe(true)

    const delayed = state.bottlenecks.find(b => b.cause === BottleneckCause.FLIGHT_B_DELAYED)
    expect(delayed).toBeUndefined()
  })

  // Triggering FLIGHT_B_DELAYED requires a concurrent external competition holding all
  // strip-pool strips occupied past flightBIdeal. Flight A always releases its strips
  // before flightBIdeal in a single-competition scenario, so this path can only be
  // exercised through multi-competition integration tests (see integration.test.ts).
  it.todo('emits FLIGHT_B_DELAYED when a concurrent competition holds all strips past flightBIdeal')
})

// ──────────────────────────────────────────────
// Flighting group (paired)
// ──────────────────────────────────────────────

describe('scheduleCompetition — flighting group', () => {
  it('allocates strips according to flighting group split', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })

    // Priority comp: scheduled first with dedicated strips
    const priority = makeCompetition({
      id: 'priority-comp',
      fencer_count: 30,
      category: Category.DIV1,
      weapon: Weapon.EPEE,
      gender: Gender.MEN,
      is_priority: true,
      flighting_group_id: 'group-1',
      strips_allocated: 8,
    })

    // Flighted comp: different category, same weapon — gets remainder strips
    const flighted = makeCompetition({
      id: 'flighted-comp',
      fencer_count: 30,
      category: Category.VETERAN,
      weapon: Weapon.EPEE,
      gender: Gender.WOMEN,
      flighted: true,
      flighting_group_id: 'group-1',
      strips_allocated: 6,
    })

    // Schedule priority first
    const state = createGlobalState(config)
    const allComps = [priority, flighted]
    const priorityResult = scheduleCompetition(priority, 0, state, config, allComps)

    // Priority should have strips allocated
    expect(priorityResult.pool_strip_count).toBeGreaterThan(0)

    // Now schedule the flighted comp
    const flightedResult = scheduleCompetition(flighted, 0, state, config, allComps)
    expect(flightedResult.pool_strip_count).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// STAGED
// ──────────────────────────────────────────────

describe('scheduleCompetition — STAGED', () => {
  it('bracket 64 produces DE_PRELIMS + DE_ROUND_OF_16 (no allocated finals)', () => {
    // Need enough video strips for dayAssignment (which wrongly checks video for pools)
    const config = makeConfig({ strips: makeStrips(24, 12) })
    // 64 fencers, cut disabled → bracket 64
    const comp = makeCompetition({
      id: 'MF-DIV1-STAGED',
      fencer_count: 64,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 12,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // Prelims and R16 populated
    expect(result.de_prelims_start).not.toBeNull()
    expect(result.de_prelims_end).not.toBeNull()
    expect(result.de_round_of_16_start).not.toBeNull()
    expect(result.de_round_of_16_end).not.toBeNull()

    // Ordering: prelims before R16
    expect(result.de_prelims_end!).toBeLessThanOrEqual(result.de_round_of_16_start!)

  })

  it('bracket 16 produces DE_ROUND_OF_16 only (no prelims, no allocated finals)', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    // 16 fencers → bracket 16
    const comp = makeCompetition({
      id: 'MF-DIV1-STAGED16',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // No prelims
    expect(result.de_prelims_start).toBeNull()
    expect(result.de_prelims_end).toBeNull()

    // R16 present
    expect(result.de_round_of_16_start).not.toBeNull()
    expect(result.de_round_of_16_end).not.toBeNull()

  })

  it('video policy REQUIRED uses video strips for R16', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    const comp = makeCompetition({
      id: 'MF-DIV1-VIDEO',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // 16 fencers → bracket 16 → de_round_of_16_strip_count = comp setting (4)
    expect(result.de_round_of_16_strip_count).toBe(4)
  })

  it('video policy FINALS_ONLY: R16 does NOT use video strips', () => {
    // Only 2 video strips (strips 0-1), 22 non-video (strips 2-23).
    // FINALS_ONLY → R16 allocates from non-video pool (4 strips requested, only 2 video available).
    // Finals are not allocated in STAGED mode — gold/bronze covered by tailEstimateMins.
    const strips = makeStrips(24, 2) // strips 0-1 are video_capable
    const config = makeConfig({
      strips,
      strips_total: 24,
      video_strips_total: 2,
    })

    const comp = makeCompetition({
      id: 'MF-FINALS-ONLY',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.FINALS_ONLY,
      // Requesting 4 R16 strips — only 2 video available, so R16 must use non-video
      de_round_of_16_strips: 4,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // R16 scheduled successfully
    expect(result.de_round_of_16_start).not.toBeNull()

    // R16 got 4 strips (pulled from non-video pool, not limited to 2 video strips)
    expect(result.de_round_of_16_strip_count).toBe(4)

    // The fact that de_round_of_16_strip_count=4 was satisfied with only 2 video strips available
    // proves R16 used non-video strips — if videoRequired were true for R16, it could only
    // get 2 strips (video_strips_total=2) and de_round_of_16_strip_count would be ≤2.
  })

  it('STAGED competition: de_total_end equals de_round_of_16_end + tailEstimateMins — INDIVIDUAL', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    const comp = makeCompetition({
      id: 'MF-STAGED-TAIL-INDIV',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      event_type: EventType.INDIVIDUAL,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    expect(result.de_round_of_16_end).not.toBeNull()
    expect(result.de_total_end).toBe(result.de_round_of_16_end! + tailEstimateMins(EventType.INDIVIDUAL))
  })

  it('STAGED competition: de_total_end equals de_round_of_16_end + tailEstimateMins — TEAM', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    const comp = makeCompetition({
      id: 'MF-STAGED-TAIL-TEAM',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      event_type: EventType.TEAM,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    expect(result.de_round_of_16_end).not.toBeNull()
    expect(result.de_total_end).toBe(result.de_round_of_16_end! + tailEstimateMins(EventType.TEAM))
  })

  it('STAGED competition: no strip allocation extends past de_round_of_16_end', () => {
    // Bracket 16 — only R16 should be allocated; no phase comes after it in the schedule
    const config = makeConfig({ strips: makeStrips(24, 12) })
    const comp = makeCompetition({
      id: 'MF-STAGED-LAST-PHASE',
      fencer_count: 16,
      de_mode: DeMode.STAGED,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    const r16End = result.de_round_of_16_end!
    // No strip allocation for this competition extends past r16End (the gold bout is unallocated).
    for (const list of state.strip_allocations) {
      for (const alloc of list) {
        if (alloc.event_id === comp.id) {
          expect(alloc.end_time).toBeLessThanOrEqual(r16End)
        }
      }
    }
  })
})

// ──────────────────────────────────────────────
// SINGLE_STAGE
// ──────────────────────────────────────────────

describe('scheduleCompetition — SINGLE_STAGE', () => {
  it('SINGLE_STAGE competition: de_total_end equals de_end + tailEstimateMins — INDIVIDUAL', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'MF-SS-TAIL-INDIV',
      fencer_count: 24,
      event_type: EventType.INDIVIDUAL,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    expect(result.de_end).not.toBeNull()
    expect(result.de_total_end).toBe(result.de_end! + tailEstimateMins(EventType.INDIVIDUAL))
  })

  it('SINGLE_STAGE competition: de_total_end equals de_end + tailEstimateMins — TEAM', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'MF-SS-TAIL-TEAM',
      fencer_count: 16,
      event_type: EventType.TEAM,
      de_mode: DeMode.SINGLE_STAGE,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    expect(result.de_end).not.toBeNull()
    expect(result.de_total_end).toBe(result.de_end! + tailEstimateMins(EventType.TEAM))
  })
})

// ──────────────────────────────────────────────
// Deadline breach
// ──────────────────────────────────────────────

describe('scheduleCompetition — deadline breach', () => {
  it('succeeds and finishes within day bounds when competition fits', () => {
    // Full 840-min day with ample strips and refs — competition must fit.
    // No dayConfigs, so day 0 starts at 0 with LATEST_START_OFFSET=840 (full day).
    const config = makeConfig({
      days_available: 1,
      LATEST_START_OFFSET: 840,
    })
    const comp = makeCompetition({
      id: 'MF-FITS',
      fencer_count: 24,
      earliest_start: 0,
      latest_end: 840,
      weapon: Weapon.FOIL,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // Must finish by day end and no DEADLINE_BREACH bottleneck
    expect(result.de_total_end ?? result.de_end).toBeLessThanOrEqual(dayEnd(result.assigned_day, config))
    const breachBottleneck = state.bottlenecks.find(
      b => b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    )
    expect(breachBottleneck).toBeUndefined()
  })

  it('successfully reschedules to an earlier slot and emits DEADLINE_BREACH warning', () => {
    // Day is 270 min. With earliest_start=180, pool starts at 180 and overruns
    // dayEnd (180 + 105 = 285 > 270). findEarlierSlotSameDay finds time 0,
    // retry from 0 succeeds: pool(105) + gap at 135→150 slot + DE(84) + tail(30) = 264 < 270.
    const config = makeConfig({
      DAY_LENGTH_MINS: 270,
      LATEST_START_OFFSET: 270,
      days_available: 1,
      MAX_RESCHEDULE_ATTEMPTS: 3,
    })
    const comp = makeCompetition({
      id: 'MF-RESCHEDULE',
      fencer_count: 24,
      earliest_start: 180, // forces late pool start → overruns dayEnd
      latest_end: 270,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // Must have succeeded and fit within the day
    expect(result.de_total_end ?? result.de_end).toBeLessThanOrEqual(dayEnd(result.assigned_day, config))

    // Retry path must have moved pool_start earlier than the forced late start
    expect(result.pool_start!).toBeLessThan(180)

    // Exactly one DEADLINE_BREACH warning (from the reschedule)
    const breachWarns = state.bottlenecks.filter(
      b => b.cause === BottleneckCause.DEADLINE_BREACH && b.competition_id === 'MF-RESCHEDULE',
    )
    expect(breachWarns).toHaveLength(1)

    // No unresolvable error
    const breachError = state.bottlenecks.find(
      b => b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    )
    expect(breachError).toBeUndefined()
  })

  it('throws SchedulingError with DEADLINE_BREACH_UNRESOLVABLE when day is too short', () => {
    // Day is only 30 minutes — no competition can fit; findEarlierSlotSameDay will also fail
    const config = makeConfig({
      DAY_LENGTH_MINS: 30,
      LATEST_START_OFFSET: 0,
      dayConfigs: [{ day_start_time: 0, day_end_time: 30 }],
      days_available: 1,
    })
    const comp = makeCompetition({
      id: 'MF-UNRESOLVABLE',
      fencer_count: 100,
      earliest_start: 0,
      latest_end: 30,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)

    let thrown: SchedulingError | undefined
    try {
      scheduleCompetition(comp, 0, state, config, [comp])
    } catch (e) {
      thrown = e as SchedulingError
    }
    expect(thrown).toBeInstanceOf(SchedulingError)
    expect(thrown?.cause).toBe(BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE)

    const breachBottleneck = state.bottlenecks.find(
      b => b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    )
    expect(breachBottleneck).toBeDefined()
  })
})

// ──────────────────────────────────────────────
// SAME_DAY_VIOLATION
// ──────────────────────────────────────────────

describe('scheduleCompetition — SAME_DAY_VIOLATION', () => {
  it('throws SchedulingError when DE would cross into the next day', () => {
    // Day 0: 0–120 min (2 hours). Day 1: 120–240 min.
    // A competition with 64 fencers needs pool + admin gap + DE — easily 2h+.
    // The pools may fit but DE end will cross into day 1 (minute ≥ 120).
    const config = makeConfig({
      DAY_LENGTH_MINS: 120,
      LATEST_START_OFFSET: 120,
      days_available: 2,
      MAX_RESCHEDULE_ATTEMPTS: 0, // no retries — forces immediate SAME_DAY_VIOLATION
    })
    const comp = makeCompetition({
      id: 'MF-CROSS-DAY',
      fencer_count: 64,
      earliest_start: 0,
      latest_end: 240,
      strips_allocated: 12,
    })

    const state = createGlobalState(config)

    // With MAX_RESCHEDULE_ATTEMPTS=0, the first overrun throws immediately.
    // Either SAME_DAY_VIOLATION or DEADLINE_BREACH_UNRESOLVABLE depending on exact timing.
    let thrown: SchedulingError | undefined
    try {
      scheduleCompetition(comp, 0, state, config, [comp])
    } catch (e) {
      thrown = e as SchedulingError
    }
    expect(thrown).toBeInstanceOf(SchedulingError)
    expect([
      BottleneckCause.SAME_DAY_VIOLATION,
      BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    ]).toContain(thrown?.cause)
  })
})

// ──────────────────────────────────────────────
// Individual + team sequencing
// ──────────────────────────────────────────────

// ──────────────────────────────────────────────
// Per-event strip cap
// ──────────────────────────────────────────────

describe('scheduleCompetition — per-event strip cap', () => {
  it('pool_duration_actual is longer when max_pool_strip_pct forces batching', () => {
    // 85 fencers → ceil(85/7) = 13 pools.
    // With strips_total=24 and max_pool_strip_pct=0.50 → effectiveCap=floor(24*0.50)=12.
    // Using TWO ref policy (no double-duty), 50 refs: staffableStrips=min(12,13,25)=12.
    // batches=ceil(13/12)=2 → actual = 2 * baseline.
    // Without the cap (raw 24): staffableStrips=min(24,13,25)=13 → batches=1 → actual=baseline.
    // max_de_strip_pct: 1.0 so DE does not also get capped (this test is about pool caps only).
    const strips = makeStrips(24, 4)
    const config = makeConfig({
      strips,
      strips_total: 24,
      max_pool_strip_pct: 0.50,
      max_de_strip_pct: 1.0,
      days_available: 3,
    })
    const comp = makeCompetition({
      id: 'MF-CAP-TEST',
      fencer_count: 85,
      weapon: Weapon.FOIL,
      ref_policy: RefPolicy.TWO,
      strips_allocated: 12,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // With effectiveCap=12 and 13 pools, two batches are needed.
    // pool_duration_actual should be 2x pool_duration_baseline.
    expect(result.pool_duration_actual).toBe(result.pool_duration_baseline * 2)
    // The cap limits pool strips to 12 (fewer than the 13 pools available).
    expect(result.pool_strip_count).toBe(12)
  })

  it('pool_duration_actual equals baseline when no cap constraint (high pct)', () => {
    // 85 fencers → ceil(85/7) = 13 pools. max_pool_strip_pct=1.0 → effectiveCap=24.
    // staffableStrips=min(24,13,25)=13 → batches=1 → actual=baseline.
    const strips = makeStrips(24, 4)
    const config = makeConfig({
      strips,
      strips_total: 24,
      max_pool_strip_pct: 1.0,
      max_de_strip_pct: 1.0,
      days_available: 3,
    })
    const comp = makeCompetition({
      id: 'MF-NOCAP-TEST',
      fencer_count: 85,
      weapon: Weapon.FOIL,
      ref_policy: RefPolicy.TWO,
      strips_allocated: 13,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // All 13 pools run in one batch — actual equals baseline.
    expect(result.pool_duration_actual).toBe(result.pool_duration_baseline)
    // No cap: all 13 pools run simultaneously on 13 strips.
    expect(result.pool_strip_count).toBe(13)
  })

  it('per-competition max_pool_strip_pct_override takes precedence over global pct', () => {
    // 85 fencers → 13 pools. Global pct=0.50 (cap=12) but competition override=1.0 (cap=24).
    // With override, staffableStrips=min(24,13,25)=13 → batches=1 → actual=baseline.
    const strips = makeStrips(24, 4)
    const config = makeConfig({
      strips,
      strips_total: 24,
      max_pool_strip_pct: 0.50,
      max_de_strip_pct: 1.0,
      days_available: 3,
    })
    const comp = makeCompetition({
      id: 'MF-OVERRIDE-TEST',
      fencer_count: 85,
      weapon: Weapon.FOIL,
      ref_policy: RefPolicy.TWO,
      strips_allocated: 13,
      max_pool_strip_pct_override: 1.0, // override: use all strips
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, 0, state, config, [comp])

    // Override gives effectiveCap=24, so all 13 pools run in one batch.
    expect(result.pool_duration_actual).toBe(result.pool_duration_baseline)
    // Override lifts the cap: all 13 pools run simultaneously on 13 strips.
    expect(result.pool_strip_count).toBe(13)
  })
})

describe('scheduleCompetition — individual+team sequencing', () => {
  it('team event is delayed by INDIV_TEAM_MIN_GAP_MINS after individual ends', () => {
    // Use a single day with plenty of room for both events
    const config = makeConfig({
      days_available: 1,
    })

    // Small fencer counts so both fit on one day with the 2-hour gap
    const individual = makeCompetition({
      id: 'MF-IND',
      fencer_count: 10,
      event_type: EventType.INDIVIDUAL,
      weapon: Weapon.SABRE,
      category: Category.CADET,
      gender: Gender.MEN,
      strips_allocated: 4,
    })

    const team = makeCompetition({
      id: 'MF-TEAM',
      fencer_count: 8,
      event_type: EventType.TEAM,
      weapon: Weapon.SABRE,
      category: Category.CADET,
      gender: Gender.MEN,
      strips_allocated: 4,
    })

    const state = createGlobalState(config)
    const allComps = [individual, team]

    const indResult = scheduleCompetition(individual, 0, state, config, allComps)

    // Team event — same weapon/category/gender — must be sequenced after individual
    const teamResult = scheduleCompetition(team, 0, state, config, allComps)

    // Both on day 0 (only day available)
    expect(indResult.assigned_day).toBe(0)
    expect(teamResult.assigned_day).toBe(0)

    const indEnd = indResult.de_total_end ?? indResult.de_end ?? indResult.pool_end!
    const teamStart = teamResult.pool_start ?? teamResult.flight_a_start!
    expect(teamStart).toBeGreaterThanOrEqual(indEnd + config.INDIV_TEAM_MIN_GAP_MINS)

    // Verify SEQUENCING_CONSTRAINT bottleneck was emitted
    const seqBottleneck = state.bottlenecks.find(
      b => b.cause === BottleneckCause.SEQUENCING_CONSTRAINT,
    )
    expect(seqBottleneck).toBeDefined()
  })
})
