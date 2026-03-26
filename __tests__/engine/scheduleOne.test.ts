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
} from '../../src/engine/types.ts'
import { createGlobalState } from '../../src/engine/resources.ts'
import { SchedulingError } from '../../src/engine/dayAssignment.ts'
import { makeStrips, makeConfig, makeCompetition } from '../helpers/factories.ts'

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

    const result = scheduleCompetition(comp, state, config, [comp])

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

    const result = scheduleCompetition(comp, state, config, [comp])

    // 24 fencers → 4 pools of 6 → pool_strips = min(n_pools=4, allocated=8) = 4
    expect(result.pool_strips_count).toBe(4)
    // AUTO ref policy, 20 foil_epee refs → 2 refs/pool × 4 pools = 8
    expect(result.pool_refs_count).toBe(8)
    // bracket=32, deOptimal=16 → engine allocates 16 strips from available pool
    expect(result.de_strips_count).toBe(16)
  })

  it('marks strips as occupied during the pool phase', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const comp = makeCompetition({ id: 'MF-DIV1', fencer_count: 24 })

    scheduleCompetition(comp, state, config, [comp])

    // Some strips should be occupied past day start
    const occupiedStrips = state.strip_free_at.filter(t => t > dayStart(0, config))
    expect(occupiedStrips.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// Flighted (standalone)
// ──────────────────────────────────────────────

describe('scheduleCompetition — flighted standalone', () => {
  it('schedules Flight A + buffer + Flight B + admin gap + DE', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const comp = makeCompetition({
      id: 'MF-CADET',
      fencer_count: 80,
      category: Category.CADET,
      flighted: true,
      strips_allocated: 12,
      weapon: Weapon.FOIL,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

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
    // 24 strips, 12 needed per flight — no contention, Flight B should start on time
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
    scheduleCompetition(comp, state, config, [comp])

    const result = state.schedule['MS-CADET']
    expect(result.flight_a_start).not.toBeNull()
    expect(result.flight_b_start).not.toBeNull()
    expect(result.flight_a_start!).toBeLessThan(result.flight_b_start!)
    expect(result.use_flighting).toBe(true)

    // With abundant strips no FLIGHT_B_DELAYED bottleneck should be emitted.
    // NOTE: Forcing a FLIGHT_B_DELAYED scenario requires a concurrent external competition
    // holding ALL strip-pool strips occupied past flightBIdeal. Since the strip used by
    // Flight A is always released before flightBIdeal, single-competition unit tests cannot
    // trigger this path. This scenario is covered by master scheduler integration tests.
    const delayed = state.bottlenecks.find(b => b.cause === BottleneckCause.FLIGHT_B_DELAYED)
    expect(delayed).toBeUndefined()
  })
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
    const priorityResult = scheduleCompetition(priority, state, config, allComps)

    // Priority should have strips allocated
    expect(priorityResult.pool_strips_count).toBeGreaterThan(0)

    // Now schedule the flighted comp
    const flightedResult = scheduleCompetition(flighted, state, config, allComps)
    expect(flightedResult.pool_strips_count).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// STAGED_DE_BLOCKS
// ──────────────────────────────────────────────

describe('scheduleCompetition — STAGED_DE_BLOCKS', () => {
  it('bracket 64 produces DE_PRELIMS + DE_ROUND_OF_16 + DE_FINALS', () => {
    // Need enough video strips for dayAssignment (which wrongly checks video for pools)
    const config = makeConfig({ strips: makeStrips(24, 12) })
    // 64 fencers, cut disabled → bracket 64
    const comp = makeCompetition({
      id: 'MF-DIV1-STAGED',
      fencer_count: 64,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 12,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

    // All three blocks populated
    expect(result.de_prelims_start).not.toBeNull()
    expect(result.de_prelims_end).not.toBeNull()
    expect(result.de_round_of_16_start).not.toBeNull()
    expect(result.de_round_of_16_end).not.toBeNull()
    expect(result.de_finals_start).not.toBeNull()
    expect(result.de_finals_end).not.toBeNull()

    // Ordering: prelims < R16 < finals
    expect(result.de_prelims_end!).toBeLessThanOrEqual(result.de_round_of_16_start!)
    expect(result.de_round_of_16_end!).toBeLessThanOrEqual(result.de_finals_start!)
  })

  it('bracket 16 produces DE_ROUND_OF_16 + DE_FINALS (no prelims)', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    // 16 fencers → bracket 16
    const comp = makeCompetition({
      id: 'MF-DIV1-STAGED16',
      fencer_count: 16,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

    // No prelims
    expect(result.de_prelims_start).toBeNull()
    expect(result.de_prelims_end).toBeNull()

    // R16 and finals present
    expect(result.de_round_of_16_start).not.toBeNull()
    expect(result.de_round_of_16_end).not.toBeNull()
    expect(result.de_finals_start).not.toBeNull()
    expect(result.de_finals_end).not.toBeNull()
  })

  it('video policy REQUIRED uses video strips for R16 and finals', () => {
    const config = makeConfig({ strips: makeStrips(24, 12) })
    const comp = makeCompetition({
      id: 'MF-DIV1-VIDEO',
      fencer_count: 16,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

    // 16 fencers → bracket 16 → de_round_of_16_strips = comp setting (4), de_finals_strips = comp setting (2)
    expect(result.de_round_of_16_strips).toBe(4)
    expect(result.de_finals_strips).toBe(2)
  })

  it('video policy FINALS_ONLY: R16 does NOT use video strips, finals DO use video strips', () => {
    // Only 2 video strips (strips 0-1), 22 non-video (strips 2-23).
    // FINALS_ONLY → R16 allocates from non-video pool (4 strips requested, only 2 video available).
    //              finals allocate from video pool (finalsVideoRequired=true).
    // This verifies the per-block video flag split: r16VideoRequired=false, finalsVideoRequired=true.
    const strips = makeStrips(24, 2) // strips 0-1 are video_capable
    const config = makeConfig({
      strips,
      strips_total: 24,
      video_strips_total: 2,
    })

    const comp = makeCompetition({
      id: 'MF-FINALS-ONLY',
      fencer_count: 16,
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.FINALS_ONLY,
      // Requesting 4 R16 strips — only 2 video available, so R16 must use non-video
      de_round_of_16_strips: 4,
      de_finals_strips: 2,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

    // Both phases scheduled successfully
    expect(result.de_round_of_16_start).not.toBeNull()
    expect(result.de_finals_start).not.toBeNull()

    // R16 got 4 strips (pulled from non-video pool, not limited to 2 video strips)
    expect(result.de_round_of_16_strips).toBe(4)

    // Finals used video strips (de_finals_strips=2, video_strips_total=2)
    expect(result.de_finals_strips).toBe(2)

    // The fact that de_round_of_16_strips=4 was satisfied with only 2 video strips available
    // proves R16 used non-video strips — if videoRequired were true for R16, it could only
    // get 2 strips (video_strips_total=2) and de_round_of_16_strips would be ≤2.
  })
})

// ──────────────────────────────────────────────
// Team bronze bout
// ──────────────────────────────────────────────

describe('scheduleCompetition — team bronze bout', () => {
  it('TEAM event gets bronze bout simultaneous with gold on separate strip', () => {
    const config = makeConfig()
    const comp = makeCompetition({
      id: 'MF-TEAM',
      fencer_count: 16,
      event_type: EventType.TEAM,
      de_mode: DeMode.SINGLE_BLOCK,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

    // Bronze bout should be populated for TEAM event
    expect(result.de_bronze_start).not.toBeNull()
    expect(result.de_bronze_end).not.toBeNull()
    expect(result.de_bronze_strip_id).not.toBeNull()

    // de_total_end should be max of de_end/de_finals_end and de_bronze_end
    expect(result.de_total_end).not.toBeNull()
  })

  it('emits DE_FINALS_BRONZE_NO_STRIP when no free strip for bronze', () => {
    // Minimal strips so all are occupied by gold
    const strips = makeStrips(1, 0)
    const config = makeConfig({
      strips,
      strips_total: 1,
      video_strips_total: 0,
    })
    const comp = makeCompetition({
      id: 'MF-TEAM-NOSTRIP',
      fencer_count: 8,
      event_type: EventType.TEAM,
      de_mode: DeMode.SINGLE_BLOCK,
      strips_allocated: 1,
    })

    const state = createGlobalState(config)
    scheduleCompetition(comp, state, config, [comp])

    const bronzeBottleneck = state.bottlenecks.find(
      b => b.cause === BottleneckCause.DE_FINALS_BRONZE_NO_STRIP,
    )
    expect(bronzeBottleneck).toBeDefined()
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
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
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
    const result = scheduleCompetition(comp, state, config, [comp])

    // Must finish by day end and no DEADLINE_BREACH bottleneck
    expect(result.de_total_end ?? result.de_end).toBeLessThanOrEqual(dayEnd(result.assigned_day, config))
    const breachBottleneck = state.bottlenecks.find(
      b => b.cause === BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
    )
    expect(breachBottleneck).toBeUndefined()
  })

  it('successfully reschedules to an earlier slot and emits DEADLINE_BREACH warning', () => {
    // Day is 240 min. With earliest_start=180, pool phase starts at 180 and
    // overruns dayEnd (180 + ~90 = 270 > 240). findEarlierSlotSameDay finds
    // time 0 (strips free), retry from 0 succeeds (~90 + 15 + 60 = 165 < 240).
    const config = makeConfig({
      DAY_LENGTH_MINS: 240,
      LATEST_START_OFFSET: 240,
      days_available: 1,
      MAX_RESCHEDULE_ATTEMPTS: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
    })
    const comp = makeCompetition({
      id: 'MF-RESCHEDULE',
      fencer_count: 24,
      earliest_start: 180, // forces late pool start → overruns dayEnd
      latest_end: 240,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)
    const result = scheduleCompetition(comp, state, config, [comp])

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
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
    })
    const comp = makeCompetition({
      id: 'MF-UNRESOLVABLE',
      fencer_count: 100,
      earliest_start: 0,
      latest_end: 30,
      strips_allocated: 8,
    })

    const state = createGlobalState(config)

    // Must throw a SchedulingError — not just any error
    expect(() => scheduleCompetition(comp, state, config, [comp])).toThrow(SchedulingError)
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
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
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
    // Assert it throws a SchedulingError (either SAME_DAY_VIOLATION or
    // DEADLINE_BREACH_UNRESOLVABLE depending on exact timing).
    expect(() => scheduleCompetition(comp, state, config, [comp])).toThrow(SchedulingError)
  })
})

// ──────────────────────────────────────────────
// Individual + team sequencing
// ──────────────────────────────────────────────

describe('scheduleCompetition — individual+team sequencing', () => {
  it('team event is delayed by INDIV_TEAM_MIN_GAP_MINS after individual ends', () => {
    // Use a single day with plenty of room for both events
    const config = makeConfig({
      days_available: 1,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' },
      ],
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

    const indResult = scheduleCompetition(individual, state, config, allComps)

    // Team event — same weapon/category/gender — must be sequenced after individual
    const teamResult = scheduleCompetition(team, state, config, allComps)

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
