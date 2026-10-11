import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createGlobalState,
  findAvailableStripsInWindow,
  allocateInterval,
  releaseEventAllocations,
  nextFreeTime,
  snapToSlot,
  poolMayUseVideoStrips,
  poolVideoDays,
} from '../../src/engine/resources.ts'
import type { PoolVideoDay } from '../../src/engine/resources.ts'
import * as resourcesModule from '../../src/engine/resources.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { BottleneckCause, BottleneckRule, DeMode, Phase, VideoPolicy } from '../../src/engine/types.ts'
import { makeBottleneck, makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { SCENARIOS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'

// ──────────────────────────────────────────────
// Constants & Helpers
// ──────────────────────────────────────────────

const STANDARD_STRIPS_TOTAL = 24
const STANDARD_VIDEO_STRIPS = 4

const TEST_EVT = 'test-evt'

// ──────────────────────────────────────────────
// snapToSlot
// ──────────────────────────────────────────────

describe('snapToSlot', () => {
  it('0 → 0 (already on boundary)', () => {
    expect(snapToSlot(0)).toBe(0)
  })

  it('2 → 5 (partway, rounds up)', () => {
    expect(snapToSlot(2)).toBe(5)
  })

  it('5 → 5 (on boundary, no change)', () => {
    expect(snapToSlot(5)).toBe(5)
  })

  it('6 → 10 (just past boundary)', () => {
    expect(snapToSlot(6)).toBe(10)
  })

  it('480 → 480 (day start, already aligned)', () => {
    expect(snapToSlot(480)).toBe(480)
  })

  it('482 → 485 (2 min past day start)', () => {
    expect(snapToSlot(482)).toBe(485)
  })

  it('783 → 785 (13:03 → 13:05, independent test from spec)', () => {
    expect(snapToSlot(783)).toBe(785)
  })

  it('785 → 785 (on boundary, no change)', () => {
    expect(snapToSlot(785)).toBe(785)
  })
})

// ──────────────────────────────────────────────
// createGlobalState
// ──────────────────────────────────────────────

describe('createGlobalState', () => {
  it('strip_allocations has one empty list per strip', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    expect(state.strip_allocations).toHaveLength(STANDARD_STRIPS_TOTAL)
    expect(state.strip_allocations.every(list => list.length === 0)).toBe(true)
  })

  it('schedule, bottlenecks, and ref_demand_by_day start empty', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    expect(state.schedule).toEqual({})
    expect(state.bottlenecks).toEqual([])
    expect(state.ref_demand_by_day).toEqual({})
  })
})

// ──────────────────────────────────────────────
// nextFreeTime
// ──────────────────────────────────────────────

describe('nextFreeTime', () => {
  it('empty allocation list → 0', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    expect(nextFreeTime(state, 0)).toBe(0)
  })

  it('returns latest end_time across allocations', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, TEST_EVT, Phase.POOLS, [0], 60, 120)
    allocateInterval(state, TEST_EVT, Phase.DE, [0], 240, 360)
    expect(nextFreeTime(state, 0)).toBe(360)
  })

  it('returns max even when allocations are inserted out of order', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // Insert later allocation first; allocateInterval keeps the list sorted by start_time
    allocateInterval(state, TEST_EVT, Phase.DE, [0], 240, 360)
    allocateInterval(state, TEST_EVT, Phase.POOLS, [0], 60, 120)
    expect(nextFreeTime(state, 0)).toBe(360)
  })
})

// ──────────────────────────────────────────────
// allocateInterval
// ──────────────────────────────────────────────

describe('allocateInterval', () => {
  it('shares a single StripAllocation object across all listed strips', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-1', Phase.POOLS, [0, 1, 2], 60, 180)
    // Same object reference in every strip's list — rollback can splice from all in one pass.
    expect(state.strip_allocations[0][0]).toBe(state.strip_allocations[1][0])
    expect(state.strip_allocations[1][0]).toBe(state.strip_allocations[2][0])
  })

  it('records event_id, phase, start_time, and end_time on the StripAllocation', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-1', Phase.DE_ROUND_OF_16, [0, 1], 60, 180)
    const alloc = state.strip_allocations[0][0]
    expect(alloc.event_id).toBe('evt-1')
    expect(alloc.phase).toBe(Phase.DE_ROUND_OF_16)
    expect(alloc.start_time).toBe(60)
    expect(alloc.end_time).toBe(180)
  })
})

// ──────────────────────────────────────────────
// releaseEventAllocations
// ──────────────────────────────────────────────

describe('releaseEventAllocations', () => {
  it('removes every allocation for the event across all strips', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-A', Phase.POOLS, [0, 1, 2], 60, 180)
    allocateInterval(state, 'evt-A', Phase.DE, [3, 4], 240, 360)
    allocateInterval(state, 'evt-B', Phase.POOLS, [5], 60, 180)

    releaseEventAllocations(state, 'evt-A')

    expect(state.strip_allocations[0]).toHaveLength(0)
    expect(state.strip_allocations[1]).toHaveLength(0)
    expect(state.strip_allocations[2]).toHaveLength(0)
    expect(state.strip_allocations[3]).toHaveLength(0)
    expect(state.strip_allocations[4]).toHaveLength(0)
    // evt-B untouched
    expect(state.strip_allocations[5]).toHaveLength(1)
    expect(state.strip_allocations[5][0].event_id).toBe('evt-B')
  })

  it('deletes the schedule entry for the released event', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.schedule['evt-A'] = { competition_id: 'evt-A' } as never
    state.schedule['evt-B'] = { competition_id: 'evt-B' } as never

    releaseEventAllocations(state, 'evt-A')

    expect(state.schedule['evt-A']).toBeUndefined()
    expect(state.schedule['evt-B']).toBeDefined()
  })

  it('removes bottlenecks tagged with the event id, leaves other events alone', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.bottlenecks.push(
      makeBottleneck({ competition_id: 'evt-A', message: 'x' }),
      makeBottleneck({ competition_id: 'evt-B', delay_mins: 20, message: 'y' }),
    )

    releaseEventAllocations(state, 'evt-A')

    expect(state.bottlenecks).toHaveLength(1)
    expect(state.bottlenecks[0].competition_id).toBe('evt-B')
  })

  it('keeps a bottleneck owned by another event that only names the released one in its subjects', () => {
    const state = createGlobalState(makeConfig())
    state.bottlenecks.push(
      makeBottleneck({
        competition_id: 'evt-A',
        subjects: ['evt-A', 'evt-B'],
        cause: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
        rule: BottleneckRule.HARD_SEPARATION_VIOLATED,
        message: 'evt-A and evt-B share a day',
      }),
    )

    releaseEventAllocations(state, 'evt-B')

    expect(state.bottlenecks).toHaveLength(1)
    expect(state.bottlenecks[0].competition_id).toBe('evt-A')
    expect(state.bottlenecks[0].rule).toBe(BottleneckRule.HARD_SEPARATION_VIOLATED)
  })

  it('removes a multi-subject bottleneck when its owner is released', () => {
    const state = createGlobalState(makeConfig())
    state.bottlenecks.push(
      makeBottleneck({ competition_id: 'evt-A', subjects: ['evt-A', 'evt-B'], message: 'evt-A and evt-B share a day' }),
    )

    releaseEventAllocations(state, 'evt-A')

    expect(state.bottlenecks).toEqual([])
  })
})

// ──────────────────────────────────────────────
// releaseEventAllocations — attempt_id filtering
// ──────────────────────────────────────────────

describe('releaseEventAllocations — attempt_id filtering', () => {
  it('default (no attempt_id): removes all bottlenecks for the event regardless of attempt_id field', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.bottlenecks.push(
      makeBottleneck({ competition_id: 'evt-A', message: 'a1', attempt_id: 1 }),
      makeBottleneck({ competition_id: 'evt-A', message: 'a2', attempt_id: 2 }),
      makeBottleneck({ competition_id: 'evt-A', message: 'a-noattempt' }),
      makeBottleneck({ competition_id: 'evt-B', delay_mins: 20, message: 'b' }),
    )

    releaseEventAllocations(state, 'evt-A')

    expect(state.bottlenecks).toHaveLength(1)
    expect(state.bottlenecks[0].competition_id).toBe('evt-B')
  })

  it('attempt_id=1: removes only bottlenecks with matching event_id AND attempt_id=1; leaves others', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.bottlenecks.push(
      makeBottleneck({ competition_id: 'evt-A', message: 'a-attempt1', attempt_id: 1 }),
      makeBottleneck({ competition_id: 'evt-A', message: 'a-attempt2', attempt_id: 2 }),
      makeBottleneck({ competition_id: 'evt-A', message: 'a-noattempt' }),
      makeBottleneck({ competition_id: 'evt-B', delay_mins: 20, message: 'b-attempt1', attempt_id: 1 }),
    )

    releaseEventAllocations(state, 'evt-A', 1)

    expect(state.bottlenecks).toHaveLength(3)
    // evt-A attempt_id=2 survives
    expect(state.bottlenecks.find(b => b.message === 'a-attempt2')).toBeDefined()
    // evt-A with no attempt_id survives
    expect(state.bottlenecks.find(b => b.message === 'a-noattempt')).toBeDefined()
    // evt-B attempt_id=1 survives (different event)
    expect(state.bottlenecks.find(b => b.message === 'b-attempt1')).toBeDefined()
    // evt-A attempt_id=1 is gone
    expect(state.bottlenecks.find(b => b.message === 'a-attempt1')).toBeUndefined()
  })

  it('cross-event isolation: removing evt-A attempt_id=1 leaves evt-B bottlenecks completely untouched', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.bottlenecks.push(
      makeBottleneck({ competition_id: 'evt-A', message: 'a-attempt1', attempt_id: 1 }),
      makeBottleneck({ competition_id: 'evt-B', delay_mins: 20, message: 'b-attempt1', attempt_id: 1 }),
      makeBottleneck({ competition_id: 'evt-B', delay_mins: 20, message: 'b-noattempt' }),
    )

    releaseEventAllocations(state, 'evt-A', 1)

    expect(state.bottlenecks).toHaveLength(2)
    expect(state.bottlenecks.every(b => b.competition_id === 'evt-B')).toBe(true)
  })
})

// ──────────────────────────────────────────────
// findAvailableStripsInWindow
// ──────────────────────────────────────────────

describe('findAvailableStripsInWindow', () => {
  it('all strips empty → returns first `count` candidates (non-video preferred)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    const result = findAvailableStripsInWindow(state, config, 4, 60, 120, false)
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') {
      // Non-video strips are 4..23
      expect(result.strip_indices.every(i => i >= 4)).toBe(true)
      expect(result.strip_indices).toHaveLength(4)
    }
  })

  it('no overlap: existing allocation ends before requested window starts → strip is available', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    // Strip 4 busy 0..60, then free for [120, 240]
    allocateInterval(state, 'evt-prior', Phase.POOLS, [4], 0, 60)
    const result = findAvailableStripsInWindow(state, config, 1, 120, 120, false)
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') {
      // First available non-video strip is index 4 (its allocation ended at 60, well before 120)
      expect(result.strip_indices).toContain(4)
    }
  })

  it('partial overlap: existing allocation overlaps requested window → strip is busy', () => {
    const config = makeConfig({ strips: makeStrips(2, 0) })
    const state = createGlobalState(config)
    // Strip 0 busy 60..200; requested window [120, 240] overlaps
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 60, 200)
    // Strip 1 busy 200..300; requested window [120, 240] overlaps
    allocateInterval(state, 'evt-prior', Phase.POOLS, [1], 200, 300)
    const result = findAvailableStripsInWindow(state, config, 1, 120, 120, false)
    expect(result.fit).toBe('none')
  })

  it('full overlap: existing allocation fully contains requested window → strip is busy', () => {
    const config = makeConfig({ strips: makeStrips(1, 0) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 1000)
    const result = findAvailableStripsInWindow(state, config, 1, 100, 200, false)
    expect(result.fit).toBe('none')
  })

  it('touching intervals are NOT considered overlapping (existing.end == requested.start)', () => {
    const config = makeConfig({ strips: makeStrips(1, 0) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 120)
    const result = findAvailableStripsInWindow(state, config, 1, 120, 120, false)
    expect(result.fit).toBe('ok')
  })

  it('video_required=true filters to video-capable strips only', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    const result = findAvailableStripsInWindow(state, config, 2, 60, 120, true)
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') {
      expect(result.strip_indices.every(i => config.strips[i].video_capable)).toBe(true)
    }
  })

  it('miss with reason=STRIPS: not enough candidate strips of the right kind exist at all', () => {
    const config = makeConfig({ strips: makeStrips(2, 0) })
    const state = createGlobalState(config)
    const result = findAvailableStripsInWindow(state, config, 4, 60, 120, false)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('STRIPS')
      expect(result.earliest_next_start).toBeNull()
    }
  })

  it('miss with earliest_next_start: count strips become free at the count-th smallest end_time', () => {
    const config = makeConfig({ strips: makeStrips(4, 0) })
    const state = createGlobalState(config)
    // Strip 0 busy until 100, strip 1 busy until 200, strip 2 busy until 300, strip 3 busy until 400
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 100)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [1], 0, 200)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [2], 0, 300)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [3], 0, 400)
    // Need 3 strips at t=50 — none free yet; the 3rd-soonest becomes free at 300.
    const result = findAvailableStripsInWindow(state, config, 3, 50, 60, false)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.earliest_next_start).toBe(300)
    }
  })

  it('count-strips-simultaneously-free invariant: a single strip with two intervals does not double-count', () => {
    const config = makeConfig({ strips: makeStrips(2, 0) })
    const state = createGlobalState(config)
    // Strip 0 has gaps [60..120] busy, then [200..260] busy. Strip 1 always free.
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 60, 120)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 200, 260)
    // Request window [80, 180] (overlaps strip 0's first allocation). Need 2 strips.
    const result = findAvailableStripsInWindow(state, config, 2, 80, 100, false)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('STRIPS')
    }
  })

  it('reason=TIME when earliest_next_start + duration would push past the day-end', () => {
    // A hard end 120 minutes after the day start, so on the fallback axis
    // dayHardEnd(0) = 120 (024 D7 – the hard end, not the day length, clamps).
    const config = makeConfig({
      strips: makeStrips(2, 0),
      DAY_HARD_END_MINS: 540 + 120,
    })
    const state = createGlobalState(config)
    // Both strips busy until t=200 (past day 0 end of 120).
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 200)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [1], 0, 200)
    const result = findAvailableStripsInWindow(state, config, 2, 50, 60, false)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('TIME')
      expect(result.earliest_next_start).toBe(200)
    }
  })

  // An explicit `day` clamps at that day's configured hard end, not its soft
  // target: work may run past the target (METHODOLOGY.md §Same-Day Completion).
  // Day 0's window is short and non-uniform – target 300, hard end 480 – so
  // neither the target nor the fallback axis's hard end (780) gives the answer.
  describe('explicit day parameter clamps at the dayConfigs hard end', () => {
    function missOnDay0(duration: number) {
      const config = makeConfig({
        strips: makeStrips(2, 0),
        dayConfigs: [
          { day_start_time: 0, day_end_time: 300, day_hard_end_time: 480 },
          { day_start_time: 1440, day_end_time: 2040, day_hard_end_time: 2220 },
        ],
      })
      const state = createGlobalState(config)
      // Both strips busy until t=400 – past day 0's target, before its hard end.
      allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 400)
      allocateInterval(state, 'evt-prior', Phase.POOLS, [1], 0, 400)
      return findAvailableStripsInWindow(state, config, 2, 50, duration, false, 0)
    }

    it('a next window ending past the target but by the hard end is a STRIPS miss', () => {
      const result = missOnDay0(60) // next window [400, 460]
      expect(result.fit).toBe('none')
      if (result.fit === 'none') {
        expect(result.reason).toBe('STRIPS')
        expect(result.earliest_next_start).toBe(400)
      }
    })

    // guard: past the hard end is TIME today as well.
    it('a next window ending past the hard end is a TIME miss', () => {
      const result = missOnDay0(100) // next window [400, 500]
      expect(result.fit).toBe('none')
      if (result.fit === 'none') {
        expect(result.reason).toBe('TIME')
        expect(result.earliest_next_start).toBe(400)
      }
    })
  })
})

// ──────────────────────────────────────────────
// Video Strip Preservation (021 T8, METHODOLOGY.md §Video Strip Preservation)
//
// The morning-wave, single-event-day and mid-day cases Phase D deleted
// (4ef8fa96fa), rewritten so the day holds a REQUIRED video phase: the rule
// first built (ff07f33476) had no video-day scope, and V26 leaves a day with no
// REQUIRED phase open to pools all day.
// ──────────────────────────────────────────────

/** A pool phase's day on the fallback axis (day 0 starts at 0), by default a multi-event video day. */
function poolDay(overrides: Partial<PoolVideoDay> = {}): PoolVideoDay {
  return { holds_required_video: true, single_event: false, day_start: 0, ...overrides }
}

describe('poolMayUseVideoStrips', () => {
  it.each([
    ['a multi-event video day at its start', poolDay(), 0, true],
    ['a multi-event video day inside the wave', poolDay(), 60, true],
    ['a multi-event video day at exactly day start + 120 (the wave includes that minute)', poolDay(), 120, true],
    ['a multi-event video day one minute after the wave', poolDay(), 121, false],
    ['a multi-event video day after the wave', poolDay(), 125, false],
    ['a multi-event video day after the wave, measured from a 9:00 day start', poolDay({ day_start: 540 }), 540 + 125, false],
    ['a multi-event video day inside the wave, measured from a 9:00 day start', poolDay({ day_start: 540 }), 540 + 120, true],
    ['a single-event video day after the wave', poolDay({ single_event: true }), 300, true],
    ['a day with no REQUIRED video phase after the wave', poolDay({ holds_required_video: false }), 300, true],
  ])('%s → %s', (_name, day, startTime, expected) => {
    expect(poolMayUseVideoStrips(day, startTime)).toBe(expected)
  })
})

describe('findAvailableStripsInWindow – a pool phase on a video day', () => {
  // 22 strips: 4 video (0–3) and 18 general (4–21). Strips 4 and 5 are busy all
  // day, so a 20-strip pool needs video strips: 16 general strips are free.
  function busyGeneralBoard() {
    const config = makeConfig({ strips: makeStrips(22, 4) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [4, 5], 0, 9999)
    return { config, state }
  }

  const videoStripsIn = (config: ReturnType<typeof makeConfig>, indices: number[]) =>
    indices.filter(i => config.strips[i].video_capable)

  it('inside the start-of-day wave a pool may overflow onto video strips (guard)', () => {
    const { config, state } = busyGeneralBoard()
    const result = findAvailableStripsInWindow(state, config, 20, 30, 60, false, 0, poolDay())
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') expect(videoStripsIn(config, result.strip_indices)).toHaveLength(4)
  })

  it('after the wave on a multi-event day a pool is refused video strips, and too few general strips exist', () => {
    const { config, state } = busyGeneralBoard()
    const result = findAvailableStripsInWindow(state, config, 20, 180, 60, false, 0, poolDay())
    expect(result).toEqual({ fit: 'none', earliest_next_start: null, reason: 'STRIPS' })
  })

  it('after the wave on a single-event day a pool may overflow onto video strips (guard)', () => {
    const { config, state } = busyGeneralBoard()
    const result = findAvailableStripsInWindow(state, config, 20, 180, 60, false, 0, poolDay({ single_event: true }))
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') expect(videoStripsIn(config, result.strip_indices)).toHaveLength(4)
  })

  it('after the wave on a day with no REQUIRED video phase a pool may overflow onto video strips (guard)', () => {
    const { config, state } = busyGeneralBoard()
    const result = findAvailableStripsInWindow(state, config, 20, 180, 60, false, 0, poolDay({ holds_required_video: false }))
    expect(result.fit).toBe('ok')
    if (result.fit === 'ok') expect(videoStripsIn(config, result.strip_indices)).toHaveLength(4)
  })

  // The boundary is inclusive ("<="), measured against "<" in 021 T8 Step 1.
  it.each([
    [120, 'ok'],
    [125, 'none'],
  ])('a pool starting at day start + %i takes video strips: %s', (startTime, fit) => {
    const { config, state } = busyGeneralBoard()
    expect(findAvailableStripsInWindow(state, config, 20, startTime, 60, false, 0, poolDay()).fit).toBe(fit)
  })

  it('a miss inside the wave whose strips free up only after it reports when the general strips free up', () => {
    // Video 0–1 free at 200, general 2–3 free at 400. Two strips at 60: by 200 the
    // wave (0–120) is over, so the video strips never count and the pool waits for 400.
    const config = makeConfig({ strips: makeStrips(4, 2) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0, 1], 0, 200)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [2, 3], 0, 400)
    const result = findAvailableStripsInWindow(state, config, 2, 60, 60, false, 0, poolDay())
    expect(result).toEqual({ fit: 'none', earliest_next_start: 400, reason: 'STRIPS' })
  })

  it('a miss after the wave reports when the general strips free up, not the video strips', () => {
    const config = makeConfig({ strips: makeStrips(4, 2) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [2, 3], 0, 400)
    const result = findAvailableStripsInWindow(state, config, 2, 180, 60, false, 0, poolDay())
    expect(result).toEqual({ fit: 'none', earliest_next_start: 400, reason: 'STRIPS' })
  })
})

describe('poolVideoDays', () => {
  const staged = (id: string) => makeCompetition({ id, de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED })
  const plain = (id: string) => makeCompetition({ id })

  it('reads each day\'s REQUIRED video phase, event count and start', () => {
    const days = poolVideoDays(
      [
        { day: 0, competition: staged('A') },
        { day: 0, competition: plain('B') },
        { day: 1, competition: staged('C') },
        { day: 2, competition: plain('D') },
        { day: 2, competition: plain('E') },
      ],
      d => 540 + d * 1440,
    )
    expect(Object.fromEntries(days)).toEqual({
      0: { holds_required_video: true, single_event: false, day_start: 540 },
      1: { holds_required_video: true, single_event: true, day_start: 1980 },
      2: { holds_required_video: false, single_event: false, day_start: 3420 },
    })
  })

  it('a STAGED event under BEST_EFFORT video and a REQUIRED one run Single Stage hold no REQUIRED video phase', () => {
    const days = poolVideoDays(
      [
        { day: 0, competition: makeCompetition({ id: 'A', de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.BEST_EFFORT }) },
        { day: 0, competition: makeCompetition({ id: 'B', de_mode: DeMode.SINGLE_STAGE, de_video_policy: VideoPolicy.REQUIRED }) },
      ],
      () => 0,
    )
    expect(days.get(0)?.holds_required_video).toBe(false)
  })
})

// ──────────────────────────────────────────────
// findAvailableStripsInWindow — day-inference precondition (T015)
//
// The day-end clamp's inference fallback (`floor(startTime / 1440)`, used only
// when `day` is omitted) infers a day from the time alone and ignores per-day
// windows, so the scheduler must never rely on it. Both call sites in
// concurrentScheduler.ts's `tryAllocate` always pass `day` explicitly, so the
// fallback is unreachable from a real scheduling run.
//
// Two guards, each doing what it is good at:
//
// - The spy below runs a real multi-day scheduleAll and asserts every call
//   that actually reaches findAvailableStripsInWindow carries a defined
//   `day`. It is robust to formatting and renaming, and it is the only
//   mechanism that would catch an actual `undefined` reaching the function at
//   runtime. Known coverage limit: the STAGED-DE precheck site (:902) only
//   fires when a DE_PRELIMS/DE_R16 node doesn't fit before dayHardEnd, so an
//   ordinary scenario run exercises only the general strip-claim site
//   (:914-916). Not worth an elaborate scenario to force the precheck path —
//   that's exactly why the backstop below doesn't depend on either site
//   being hit at runtime.
// - The backstop is a hardened static check with two parts. First, there are
//   exactly two findAvailableStripsInWindow call sites in the file, so a
//   third one added elsewhere is caught even if the spy never reaches it.
//   Second, each call site's argument list is split at paren/bracket/brace
//   depth 0 and its arity checked against the function's 8-parameter
//   signature (`state, config, count, startTime, duration, videoRequired,
//   day, poolVideoDay` – `day` is index 6, the pool video day of 021 T8 index
//   7). Dropping an argument at either site, including the STAGED-DE precheck
//   (:902) the spy cannot reach, drops arity below 8 and fails here. Both
//   parts strip comments and do a
//   balanced-paren scan rather than a lazy `)` match, so a trailing comment,
//   a variable rename, or a nested call in an earlier argument (e.g.
//   `Math.max(0, x)`) does not fool them. Arity checks structure, not
//   identifier text, so renaming `day` to `dayIndex` still passes.
//
//   The pool video day (index 7) is also checked not to be the bare token
//   `undefined` at either site, since that keeps arity at 8.
//
//   Residual gap: an explicit `undefined` passed in the `day` position keeps
//   arity at 8 and slips past the backstop. The spy would catch that at the
//   reachable site (:914-916) but not at the STAGED-DE precheck (:902) – the
//   same reachability limit noted above. Neither the spy nor the token check
//   sees a pool video day that is `undefined` at run time through a variable
//   (for example a `poolVideoDay` computed wrongly), which the behaviour tests
//   in `videoStripPreservation.test.ts` cover instead.
// ──────────────────────────────────────────────

describe('findAvailableStripsInWindow — day-inference precondition (T015)', () => {
  const SCHEDULER_PATH = resolve(process.cwd(), 'src/engine/concurrentScheduler.ts')

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('every call recorded during a real multi-day scheduleAll run passes a defined day', () => {
    const spy = vi.spyOn(resourcesModule, 'findAvailableStripsInWindow')
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B1
    const competitions = buildCompetitions(fencerCounts, tournamentType)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)

    scheduleAll(competitions, config)

    // A spy that recorded zero calls proves nothing about the call sites —
    // confirm it actually intercepted the by-name import concurrentScheduler.ts
    // uses (the same live-binding mechanism placements.test.ts's scheduleAll
    // spy relies on).
    expect(spy.mock.calls.length).toBeGreaterThan(0)

    for (const call of spy.mock.calls) {
      const day = call[6]
      expect(day, `findAvailableStripsInWindow called with day=${String(day)}`).toBeDefined()
    }
  })

  it('backstop: exactly two findAvailableStripsInWindow call sites exist in concurrentScheduler.ts, each passing all 8 arguments (day is index 6, the pool phase\'s video day index 7)', () => {
    const source = readFileSync(SCHEDULER_PATH, 'utf-8')
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')

    const callSites = findBalancedCallSites(stripped, 'findAvailableStripsInWindow')

    // tryAllocate has exactly two call sites: the STAGED-DE pre-check probe
    // and the strip-claim call every phase kind uses. A third call site added
    // anywhere in the file — reachable by the spy above or not — should fail
    // this count.
    expect(callSites).toHaveLength(2)

    // Arity check: each site must pass all 8 parameters of
    // findAvailableStripsInWindow(state, config, count, startTime, duration,
    // videoRequired, day, poolVideoDay). This catches a dropped `day` argument
    // at the STAGED-DE precheck site (:902), which the spy above cannot reach —
    // see the "residual gap" note in the block comment above this describe —
    // and a dropped pool video day (021 T8), which would let a pool take video
    // strips mid-day on a video day. The pool video day is also checked not to
    // be the bare token `undefined`, a structural check that a rename still
    // passes.
    for (const site of callSites) {
      const args = splitTopLevelArgs(site.slice('findAvailableStripsInWindow('.length, -1))
      expect(args.length, `expected 8 arguments (day at index 6, pool video day at 7) in call site: ${site}`).toBe(8)
      expect(args[7], `pool video day passed as a bare undefined in call site: ${site}`).not.toBe('undefined')
    }
  })
})

/**
 * Splits a call's argument text into its arguments, trimmed, at paren/
 * bracket/brace depth 0, so a nested call in one argument (e.g.
 * `Math.max(0, node.ready_time)`) is not mistaken for two arguments. A single
 * trailing comma before the closing paren does not count as an extra,
 * absent argument.
 */
function splitTopLevelArgs(argsText: string): string[] {
  const trimmed = argsText.trim()
  if (trimmed === '') return []
  const args: string[] = []
  let depth = 0
  let current = ''
  for (const ch of trimmed) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      args.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim() !== '') args.push(current.trim())
  return args
}

/**
 * Finds every call site of `fnName(...)` in `source` with a balanced-paren
 * scan, so a nested call in an earlier argument (e.g. `Math.max(0, x)`)
 * doesn't truncate the match the way a lazy `\)` regex would. Callers are
 * expected to strip comments first — this scan has no notion of them.
 */
function findBalancedCallSites(source: string, fnName: string): string[] {
  const marker = `${fnName}(`
  const sites: string[] = []
  let searchFrom = 0
  while (true) {
    const start = source.indexOf(marker, searchFrom)
    if (start === -1) break
    let depth = 1
    let i = start + marker.length
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') depth--
      i++
    }
    sites.push(source.slice(start, i))
    searchFrom = i
  }
  return sites
}
