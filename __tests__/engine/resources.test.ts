import { describe, it, expect } from 'vitest'
import {
  createGlobalState,
  allocateStrips,
  findAvailableStrips,
  findAvailableStripsInWindow,
  allocateInterval,
  releaseEventAllocations,
  peakConcurrentStrips,
  nextFreeTime,
  allocateRefs,
  earliestResourceWindow,
  snapToSlot,
  rollbackEvent,
} from '../../src/engine/resources.ts'
import type { PoolContext } from '../../src/engine/resources.ts'
import { Weapon, Phase } from '../../src/engine/types.ts'
import type { EventTxLog } from '../../src/engine/types.ts'
import { makeConfig, makeStrips, makePoolContextConfig } from '../helpers/factories.ts'

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
// allocateStrips
// ──────────────────────────────────────────────

describe('allocateStrips', () => {
  it('allocate 4 strips at t=0..120 → each strip records one StripAllocation', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 0, 120, TEST_EVT, Phase.POOLS)
    for (const i of [0, 1, 2, 3]) {
      expect(state.strip_allocations[i]).toHaveLength(1)
      expect(state.strip_allocations[i][0]).toMatchObject({
        event_id: TEST_EVT,
        phase: Phase.POOLS,
        start_time: 0,
        end_time: 120,
      })
    }
  })

  it('unallocated strips remain empty after allocation', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 0, 120, TEST_EVT, Phase.POOLS)
    expect(state.strip_allocations[4]).toEqual([])
  })

  it('two non-overlapping intervals on the same strip both succeed', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0], 0, 120, TEST_EVT, Phase.POOLS)
    allocateStrips(state, [0], 120, 240, TEST_EVT, Phase.DE)
    expect(state.strip_allocations[0]).toHaveLength(2)
    expect(state.strip_allocations[0][0].end_time).toBe(120)
    expect(state.strip_allocations[0][1].start_time).toBe(120)
    expect(nextFreeTime(state, 0)).toBe(240)
  })

  it('inserting an earlier interval into a strip keeps the list sorted', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0], 240, 300, TEST_EVT, Phase.DE)
    allocateStrips(state, [0], 60, 120, TEST_EVT, Phase.POOLS)
    expect(state.strip_allocations[0][0].start_time).toBe(60)
    expect(state.strip_allocations[0][1].start_time).toBe(240)
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
// findAvailableStrips
// ──────────────────────────────────────────────

describe('findAvailableStrips', () => {
  it('24 strips, 20 allocated until t=600 → 4 available at t=480 (indices 20-23)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: 20 }, (_, i) => i), 0, 600, TEST_EVT, Phase.POOLS)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices).toEqual([20, 21, 22, 23])
    }
  })

  it('video_required=false → non-video strips preferred (returned first)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices.every(i => i >= 4)).toBe(true)
    }
  })

  it('video_required=true → only video-capable strips returned', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    const result = findAvailableStrips(state, config, 2, 480, true)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices.every(i => config.strips[i].video_capable)).toBe(true)
    }
  })

  it('video_required=true but all video strips busy → WAIT_UNTIL with earliest video free time', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 0, 660, TEST_EVT, Phase.POOLS)
    const result = findAvailableStrips(state, config, 2, 480, true)
    expect(result.type).toBe('WAIT_UNTIL')
    if (result.type === 'WAIT_UNTIL') {
      expect(result.waitUntil).toBe(660)
    }
  })

  it('not enough strips available at time → WAIT_UNTIL', () => {
    const config = makeConfig({ strips: makeStrips(4, 0) })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1], 0, 600, TEST_EVT, Phase.POOLS)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('WAIT_UNTIL')
  })

  it('video_required=false: when non-video strips are busy, falls back to video strips', () => {
    const config = makeConfig({ strips: makeStrips(8, 4) })
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5, 6, 7], 0, 600, TEST_EVT, Phase.POOLS)
    const result = findAvailableStrips(state, config, 2, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices.every(i => config.strips[i].video_capable)).toBe(true)
    }
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
    const result = findAvailableStripsInWindow(state, config, 2, 50, 60, false, undefined, 0)
    expect(result.fit).toBe('none')
    if (result.fit === 'none') {
      expect(result.reason).toBe('TIME')
      expect(result.earliest_next_start).toBe(400)
    }
  })

  it('honors poolContext: video strips excluded outside morning wave on multi-event days', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    // Busy 2 non-video strips (4, 5) for the whole day so non-video pool is shy
    allocateInterval(state, 'evt-prior', Phase.POOLS, [4, 5], 0, 9999)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    // atTime=180 is past morning wave (dayStart(0)+120 = 120) — video excluded.
    const result = findAvailableStripsInWindow(state, config, 20, 180, 60, false, poolContext)
    // 16 non-video free + video excluded → cannot satisfy 20.
    expect(result.fit).toBe('none')
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

// ──────────────────────────────────────────────
// allocateRefs
// ──────────────────────────────────────────────

describe('allocateRefs', () => {
  it('allocate 3 foil refs on day 0 → pushes one FOIL interval with count=3', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals[0]).toMatchObject({
      startTime: 480,
      endTime: 600,
      count: 3,
      weapon: Weapon.FOIL,
    })
  })

  it('allocate 3 epee refs on day 0 → pushes one EPEE interval with count=3', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.EPEE, 3, 480, 600)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals[0]).toMatchObject({
      startTime: 480,
      endTime: 600,
      count: 3,
      weapon: Weapon.EPEE,
    })
  })

  it('allocate saber refs on day 0 → pushes one SABRE interval', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.SABRE, 4, 480, 600)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals[0]).toMatchObject({
      startTime: 480,
      endTime: 600,
      count: 4,
      weapon: Weapon.SABRE,
    })
  })

  it('multiple allocations on same day accumulate intervals', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600)
    allocateRefs(state, 0, Weapon.FOIL, 2, 480, 660)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(2)
  })
})

// ──────────────────────────────────────────────
// earliestResourceWindow
// ──────────────────────────────────────────────

describe('earliestResourceWindow', () => {
  // PRD Section 12.1: T=0 = Day 0 08:00 AM. dayStart(0, config) = 0 * 840 = 0.
  // LATEST_START_OFFSET=480 → latest start = 0 + 480 = 480 (equivalent to 4pm wall clock).
  // Day 0 end = 0 + 840 = 840.

  it('strips all free → returns notBefore (snapped to slot)', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const result = earliestResourceWindow(4, false, 60, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(60)
    }
  })

  it('strips busy until t=120 → returns t=120 (snapped to slot)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 0, 120, TEST_EVT, Phase.POOLS)
    const result = earliestResourceWindow(4, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(120)
    }
  })

  it('delay > THRESHOLD_MINS → STRIP_CONTENTION bottleneck emitted', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS), THRESHOLD_MINS: 10 })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 0, 60, TEST_EVT, Phase.POOLS)
    const result = earliestResourceWindow(4, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      const stripContention = result.bottlenecks.find(b => b.cause === 'STRIP_CONTENTION')
      expect(stripContention).toBeDefined()
    }
  })

  it('start time exceeds DAY_START + LATEST_START_OFFSET → NO_WINDOW', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 0, 500, TEST_EVT, Phase.POOLS)
    const result = earliestResourceWindow(4, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
  })

  it('notBefore not on slot boundary → snapped up to next slot', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const result = earliestResourceWindow(4, false, 15, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(30)
    }
  })

  it('MAX_RESCHEDULE_ATTEMPTS exhausted → NO_WINDOW', () => {
    const config = makeConfig({
      strips: makeStrips(2, 0),
      MAX_RESCHEDULE_ATTEMPTS: 1,
      LATEST_START_OFFSET: 120,
      DAY_LENGTH_MINS: 120,
    })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1], 0, 9999, TEST_EVT, Phase.POOLS)
    const result = earliestResourceWindow(4, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
  })
})

// ──────────────────────────────────────────────
// earliestResourceWindow NO_WINDOW reason
// ──────────────────────────────────────────────

describe('earliestResourceWindow NO_WINDOW reason', () => {
  it('TIME reason — notBefore already past latestStart', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const result = earliestResourceWindow(4, false, 500, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
    if (result.type === 'NO_WINDOW') {
      expect(result.reason?.kind).toBe('TIME')
      if (result.reason?.kind === 'TIME') {
        expect(result.reason.latest_start).toBe(480)
      }
    }
  })

  it('strip scarcity surfaces as TIME reason (STRIPS branch proven unreachable)', () => {
    const config = makeConfig({
      strips: makeStrips(4, 0),
      LATEST_START_OFFSET: 60,
      DAY_LENGTH_MINS: 120,
    })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 0, 9999, TEST_EVT, Phase.POOLS)
    const result = earliestResourceWindow(4, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
    if (result.type === 'NO_WINDOW') {
      expect(result.reason).toBeDefined()
      expect(result.reason?.kind).toBe('TIME')
    }
  })
})

// ──────────────────────────────────────────────
// rollbackEvent
// ──────────────────────────────────────────────

describe('rollbackEvent', () => {
  function makeTxLog(): EventTxLog {
    return { stripAllocationsAdded: [], refEvents: [] }
  }

  it('strip rollback: removes recorded allocations and clears txLog', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLog = makeTxLog()
    allocateStrips(state, [0, 1, 2], 0, 600, TEST_EVT, Phase.POOLS, txLog)

    expect(state.strip_allocations[0]).toHaveLength(1)
    expect(state.strip_allocations[1]).toHaveLength(1)
    expect(state.strip_allocations[2]).toHaveLength(1)
    expect(txLog.stripAllocationsAdded).toHaveLength(3)

    rollbackEvent(state, txLog)

    expect(state.strip_allocations[0]).toHaveLength(0)
    expect(state.strip_allocations[1]).toHaveLength(0)
    expect(state.strip_allocations[2]).toHaveLength(0)
    expect(txLog.stripAllocationsAdded).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('ref rollback: removes the interval and clears txLog', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLog = makeTxLog()
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600, txLog)

    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)
    expect(txLog.refEvents).toHaveLength(1)

    rollbackEvent(state, txLog)

    expect(state.ref_demand_by_day[0].intervals).toHaveLength(0)
    expect(txLog.stripAllocationsAdded).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('combined rollback: strips AND refs both restored', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLog = makeTxLog()
    allocateStrips(state, [5, 6], 0, 720, TEST_EVT, Phase.POOLS, txLog)
    allocateRefs(state, 0, Weapon.SABRE, 2, 480, 720, txLog)

    expect(state.strip_allocations[5]).toHaveLength(1)
    expect(state.strip_allocations[6]).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)

    rollbackEvent(state, txLog)

    expect(state.strip_allocations[5]).toHaveLength(0)
    expect(state.strip_allocations[6]).toHaveLength(0)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(0)
    expect(txLog.stripAllocationsAdded).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('isolation: rolling back event E does not affect event F allocations', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLogE = makeTxLog()
    allocateStrips(state, [0, 1], 0, 600, 'evt-E', Phase.POOLS, txLogE)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600, txLogE)

    const txLogF = makeTxLog()
    allocateStrips(state, [2, 3], 0, 660, 'evt-F', Phase.POOLS, txLogF)
    allocateRefs(state, 0, Weapon.FOIL, 2, 480, 660, txLogF)

    expect(state.strip_allocations[2]).toHaveLength(1)
    expect(state.strip_allocations[3]).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(2)

    rollbackEvent(state, txLogE)

    // E's strips restored
    expect(state.strip_allocations[0]).toHaveLength(0)
    expect(state.strip_allocations[1]).toHaveLength(0)

    // F's strips untouched
    expect(state.strip_allocations[2]).toHaveLength(1)
    expect(state.strip_allocations[3]).toHaveLength(1)
    expect(state.strip_allocations[2][0].event_id).toBe('evt-F')

    // E's ref interval removed; F's interval remains
    expect(state.ref_demand_by_day[0].intervals).toHaveLength(1)
    expect(state.ref_demand_by_day[0].intervals[0]).toMatchObject({
      count: 2,
      endTime: 660,
      startTime: 480,
      weapon: Weapon.FOIL,
    })

    expect(txLogE.stripAllocationsAdded).toHaveLength(0)
    expect(txLogE.refEvents).toHaveLength(0)
    expect(txLogF.stripAllocationsAdded).toHaveLength(2)
    expect(txLogF.refEvents).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────
// findAvailableStrips — poolContext video rule
// ──────────────────────────────────────────────

describe('findAvailableStrips — poolContext video rule', () => {
  // 22 strips: 4 video (indices 0-3) + 18 non-video (indices 4-21)

  it('1. morning wave pool: video overflow allowed (atTime <= dayStart+120)', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5], 0, 9999, TEST_EVT, Phase.POOLS)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    const result = findAvailableStrips(state, config, 20, 30, false, poolContext)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices).toHaveLength(20)
      const videoUsed = result.stripIndices.filter(i => config.strips[i].video_capable)
      expect(videoUsed.length).toBeGreaterThan(0)
    }
  })

  it('2. after morning wave, multi-event day: video excluded, not enough non-video → WAIT_UNTIL', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5], 0, 9999, TEST_EVT, Phase.POOLS)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    const result = findAvailableStrips(state, config, 20, 180, false, poolContext)
    expect(result.type).toBe('WAIT_UNTIL')
  })

  it('3. after morning wave, single-event day: video overflow allowed', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5], 0, 9999, TEST_EVT, Phase.POOLS)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: true, day: 0 }
    const result = findAvailableStrips(state, config, 20, 180, false, poolContext)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices).toHaveLength(20)
      const videoUsed = result.stripIndices.filter(i => config.strips[i].video_capable)
      expect(videoUsed.length).toBeGreaterThan(0)
    }
  })

  it('4. no poolContext (DE phase): video overflow still allowed (existing behavior)', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5], 0, 9999, TEST_EVT, Phase.POOLS)
    const result = findAvailableStrips(state, config, 20, 90, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices).toHaveLength(20)
    }
  })

  it('5. videoRequired=true: only video strips regardless of poolContext', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    const result = findAvailableStrips(state, config, 2, 90, true, poolContext)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices.every(i => config.strips[i].video_capable)).toBe(true)
    }
  })
})
