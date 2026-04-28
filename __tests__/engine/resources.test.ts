import { describe, it, expect } from 'vitest'
import {
  createGlobalState,
  findAvailableStripsInWindow,
  allocateInterval,
  releaseEventAllocations,
  peakConcurrentStrips,
  nextFreeTime,
  snapToSlot,
} from '../../src/engine/resources.ts'
import { Phase } from '../../src/engine/types.ts'
import { makeConfig, makeStrips } from '../helpers/factories.ts'

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

  it('15 → 30 (halfway, rounds up)', () => {
    expect(snapToSlot(15)).toBe(30)
  })

  it('30 → 30 (on boundary, no change)', () => {
    expect(snapToSlot(30)).toBe(30)
  })

  it('31 → 60 (just past boundary)', () => {
    expect(snapToSlot(31)).toBe(60)
  })

  it('45 → 60', () => {
    expect(snapToSlot(45)).toBe(60)
  })

  it('60 → 60 (on boundary)', () => {
    expect(snapToSlot(60)).toBe(60)
  })

  it('480 → 480 (day start, already aligned)', () => {
    expect(snapToSlot(480)).toBe(480)
  })

  it('495 → 510 (15 min past hour)', () => {
    expect(snapToSlot(495)).toBe(510)
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

  it('records pod_id when provided', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-1', Phase.DE_ROUND_OF_16, [0, 1], 60, 180, 'pod-A')
    expect(state.strip_allocations[0][0].pod_id).toBe('pod-A')
  })

  it('omits pod_id when not provided', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-1', Phase.POOLS, [0], 60, 180)
    expect(state.strip_allocations[0][0].pod_id).toBeUndefined()
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
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'x' } as never,
      { competition_id: 'evt-B', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 20, message: 'y' } as never,
    )

    releaseEventAllocations(state, 'evt-A')

    expect(state.bottlenecks).toHaveLength(1)
    expect(state.bottlenecks[0].competition_id).toBe('evt-B')
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
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a1', attempt_id: 1 },
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a2', attempt_id: 2 },
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a-noattempt' },
      { competition_id: 'evt-B', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 20, message: 'b' },
    )

    releaseEventAllocations(state, 'evt-A')

    expect(state.bottlenecks).toHaveLength(1)
    expect(state.bottlenecks[0].competition_id).toBe('evt-B')
  })

  it('attempt_id=1: removes only bottlenecks with matching event_id AND attempt_id=1; leaves others', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    state.bottlenecks.push(
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a-attempt1', attempt_id: 1 },
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a-attempt2', attempt_id: 2 },
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a-noattempt' },
      { competition_id: 'evt-B', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 20, message: 'b-attempt1', attempt_id: 1 },
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
      { competition_id: 'evt-A', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 10, message: 'a-attempt1', attempt_id: 1 },
      { competition_id: 'evt-B', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 20, message: 'b-attempt1', attempt_id: 1 },
      { competition_id: 'evt-B', phase: Phase.POOLS, cause: 'STRIP_CONTENTION', severity: 'WARN', delay_mins: 20, message: 'b-noattempt' },
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
    // Use a config where DAY_LENGTH_MINS=120 so dayHardEnd(0) = 120.
    const config = makeConfig({
      strips: makeStrips(2, 0),
      DAY_LENGTH_MINS: 120,
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

  it('explicit day parameter honors non-uniform dayConfigs day_end_time', () => {
    // dayConfigs override: day 0 ends early (at t=300) while DAY_LENGTH_MINS=840.
    // Without `day` the helper would infer day 0 and clamp at 0+840=840 — wrong.
    // With `day=0` explicitly supplied, the helper uses dayEnd(0)=300 instead.
    const config = makeConfig({
      strips: makeStrips(2, 0),
      DAY_LENGTH_MINS: 840,
      dayConfigs: [
        { day_start_time: 0, day_end_time: 300 },
        { day_start_time: 840, day_end_time: 1680 },
      ],
    })
    const state = createGlobalState(config)
    // Both strips busy until t=400 — past day 0's overridden end of 300.
    allocateInterval(state, 'evt-prior', Phase.POOLS, [0], 0, 400)
    allocateInterval(state, 'evt-prior', Phase.POOLS, [1], 0, 400)
    const result = findAvailableStripsInWindow(state, config, 2, 50, 60, false, 0)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('TIME')
      expect(result.earliest_next_start).toBe(400)
    }
  })
})

// ──────────────────────────────────────────────
// peakConcurrentStrips
// ──────────────────────────────────────────────

describe('peakConcurrentStrips', () => {
  it('returns 0 for an empty state', () => {
    const config = makeConfig({ strips: makeStrips(4, 1) })
    const state = createGlobalState(config)
    const result = peakConcurrentStrips(state, config, { start: 0, end: 1000 })
    expect(result.total).toBe(0)
    expect(result.video).toBe(0)
  })

  it('counts overlapping intervals at peak time', () => {
    const config = makeConfig({ strips: makeStrips(4, 1) })
    const state = createGlobalState(config)
    // Strip 0 (video) used 0..200; strip 1 used 60..180; strip 2 used 100..150.
    // Peak = 3 simultaneous strips in [100, 150]; video subset = 1 (strip 0).
    allocateInterval(state, 'evt-A', Phase.POOLS, [0], 0, 200)
    allocateInterval(state, 'evt-B', Phase.POOLS, [1], 60, 180)
    allocateInterval(state, 'evt-C', Phase.POOLS, [2], 100, 150)
    const result = peakConcurrentStrips(state, config, { start: 0, end: 300 })
    expect(result.total).toBe(3)
    expect(result.video).toBe(1)
  })

  it('clips allocations to the requested window', () => {
    const config = makeConfig({ strips: makeStrips(2, 0) })
    const state = createGlobalState(config)
    // Two non-overlapping intervals; window only sees the first.
    allocateInterval(state, 'evt-A', Phase.POOLS, [0], 0, 100)
    allocateInterval(state, 'evt-B', Phase.POOLS, [1], 200, 300)
    const result = peakConcurrentStrips(state, config, { start: 0, end: 150 })
    expect(result.total).toBe(1)
  })

  it('touching intervals on different strips do not double-count at the seam', () => {
    const config = makeConfig({ strips: makeStrips(2, 0) })
    const state = createGlobalState(config)
    allocateInterval(state, 'evt-A', Phase.POOLS, [0], 0, 100)
    allocateInterval(state, 'evt-B', Phase.POOLS, [1], 100, 200)
    const result = peakConcurrentStrips(state, config, { start: 0, end: 300 })
    expect(result.total).toBe(1)
  })
})
