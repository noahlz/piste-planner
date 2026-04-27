import { describe, it, expect } from 'vitest'
import { allocatePods } from '../../src/engine/pods.ts'
import {
  createGlobalState,
  allocateInterval,
  releaseEventAllocations,
} from '../../src/engine/resources.ts'
import { Phase } from '../../src/engine/types.ts'
import type { StripAllocation } from '../../src/engine/types.ts'
import { makeConfig, makeStrips } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const TEST_EVT = 'evt-test'
const START = 600
const DURATION = 60
const END = START + DURATION

/** Collect every StripAllocation in the state, paired with its strip index. */
function allAllocations(state: ReturnType<typeof createGlobalState>): Array<{ strip: number; alloc: StripAllocation }> {
  const out: Array<{ strip: number; alloc: StripAllocation }> = []
  for (let i = 0; i < state.strip_allocations.length; i++) {
    for (const alloc of state.strip_allocations[i]) {
      out.push({ strip: i, alloc })
    }
  }
  return out
}

// ──────────────────────────────────────────────
// allocatePods — pod sizing
// ──────────────────────────────────────────────

describe('allocatePods — pod sizing', () => {
  it('total=8, pod_size=4 → 2 full pods of 4 with 8 allocations total', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      8, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(2)
    expect(result!.pods[0].strip_indices).toHaveLength(4)
    expect(result!.pods[1].strip_indices).toHaveLength(4)

    const allocs = allAllocations(state)
    expect(allocs).toHaveLength(8)
    // Every allocation has a pod_id matching one of the two pods
    const podIds = new Set(result!.pods.map(p => p.id))
    for (const { alloc } of allocs) {
      expect(alloc.pod_id).toBeDefined()
      expect(podIds.has(alloc.pod_id!)).toBe(true)
    }
  })

  it('total=6, pod_size=4 → first pod 4 strips, second pod 2 strips (partial)', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      6, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(2)
    expect(result!.pods[0].strip_indices).toHaveLength(4)
    expect(result!.pods[1].strip_indices).toHaveLength(2)
    expect(allAllocations(state)).toHaveLength(6)
  })

  it('total=1, pod_size=4 → single partial pod of 1 strip (Finals case)', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_PRELIMS,
      1, 4, START, DURATION, true,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(1)
    expect(result!.pods[0].strip_indices).toHaveLength(1)
    expect(allAllocations(state)).toHaveLength(1)
  })

  it('total=4, pod_size=1 → 4 single-strip pods (pod_size=1 supported)', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      4, 1, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(4)
    for (const pod of result!.pods) {
      expect(pod.strip_indices).toHaveLength(1)
    }
    expect(allAllocations(state)).toHaveLength(4)
  })
})

// ──────────────────────────────────────────────
// allocatePods — video preference
// ──────────────────────────────────────────────

describe('allocatePods — video preference', () => {
  it('video_required=true selects only video-capable strips', () => {
    // 8 video + 16 non-video; ask for 4 strips in 1 pod with video required
    const config = makeConfig({ strips: makeStrips(24, 8) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      4, 4, START, DURATION, true,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(1)
    for (const idx of result!.pods[0].strip_indices) {
      expect(config.strips[idx].video_capable).toBe(true)
    }
  })

  it('video_required=true fails when not enough video strips are available', () => {
    // Only 2 video strips but request 4
    const config = makeConfig({ strips: makeStrips(24, 2) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      4, 4, START, DURATION, true,
    )

    expect(result).toBeNull()
    expect(allAllocations(state)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// allocatePods — multi-pod allocation
// ──────────────────────────────────────────────

describe('allocatePods — multi-pod allocation', () => {
  it('writes one StripAllocation per strip with distinct pod_ids per pod', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      12, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    expect(result!.pods).toHaveLength(3)

    // Distinct pod_ids
    const ids = result!.pods.map(p => p.id)
    expect(new Set(ids).size).toBe(3)

    // Group allocations by pod_id and check each pod has exactly pod_size allocations
    const byPod = new Map<string, StripAllocation[]>()
    for (const { alloc } of allAllocations(state)) {
      const list = byPod.get(alloc.pod_id!) ?? []
      list.push(alloc)
      byPod.set(alloc.pod_id!, list)
    }
    expect(byPod.size).toBe(3)
    for (const id of ids) {
      expect(byPod.get(id)!.length).toBe(4)
    }
  })

  it('start_time and end_time match input on every allocation', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      8, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    for (const { alloc } of allAllocations(state)) {
      expect(alloc.start_time).toBe(START)
      expect(alloc.end_time).toBe(END)
      expect(alloc.event_id).toBe(TEST_EVT)
      expect(alloc.phase).toBe(Phase.DE_ROUND_OF_16)
    }
  })
})

// ──────────────────────────────────────────────
// allocatePods — no-window miss
// ──────────────────────────────────────────────

describe('allocatePods — no-window miss', () => {
  it('returns null and writes nothing when not enough strips are free', () => {
    // 4 total strips, fully blocked by an existing allocation in the window
    const config = makeConfig({ strips: makeStrips(4, 0) })
    const state = createGlobalState(config)

    // Pre-block all 4 strips for the requested window
    allocateInterval(state, 'blocker', Phase.POOLS, [0, 1, 2, 3], START, END)
    const before = allAllocations(state).length

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      4, 4, START, DURATION, false,
    )

    expect(result).toBeNull()
    // No new allocations written for our event
    const after = allAllocations(state)
    expect(after).toHaveLength(before)
    for (const { alloc } of after) {
      expect(alloc.event_id).not.toBe(TEST_EVT)
    }
  })

  it('returns null when total_strip_count is 0', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_PRELIMS,
      0, 4, START, DURATION, false,
    )

    expect(result).toBeNull()
    expect(allAllocations(state)).toHaveLength(0)
  })

  it('returns null when pod_size is 0', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_PRELIMS,
      4, 0, START, DURATION, false,
    )

    expect(result).toBeNull()
    expect(allAllocations(state)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// allocatePods — rollback via releaseEventAllocations
// ──────────────────────────────────────────────

describe('allocatePods — rollback', () => {
  it('releaseEventAllocations removes every entry written by the pod allocation', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    // Pre-existing allocation for a different event — must survive rollback
    allocateInterval(state, 'other-evt', Phase.POOLS, [0, 1], 60, 120)
    const beforeOther = allAllocations(state).length

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      8, 4, START, DURATION, false,
    )
    expect(result).not.toBeNull()

    releaseEventAllocations(state, TEST_EVT)

    const after = allAllocations(state)
    expect(after).toHaveLength(beforeOther)
    for (const { alloc } of after) {
      expect(alloc.event_id).not.toBe(TEST_EVT)
    }
    // The other event's allocation is intact
    expect(after.filter(a => a.alloc.event_id === 'other-evt')).toHaveLength(2)
  })
})

// ──────────────────────────────────────────────
// allocatePods — pod ID scheme
// ──────────────────────────────────────────────

describe('allocatePods — pod IDs', () => {
  it('pod IDs follow the documented scheme `${event_id}-${phaseSlug}-pod${i}`', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, 'evt123', Phase.DE_ROUND_OF_16,
      8, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    expect(result!.pods.map(p => p.id)).toEqual([
      'evt123-de_round_of_16-pod0',
      'evt123-de_round_of_16-pod1',
    ])
  })

  it('pod IDs are unique within a single call', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      16, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    const ids = result!.pods.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('pod strip indices are pairwise disjoint across pods', () => {
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)

    const result = allocatePods(
      state, config, TEST_EVT, Phase.DE_ROUND_OF_16,
      8, 4, START, DURATION, false,
    )

    expect(result).not.toBeNull()
    // No strip index appears in more than one pod's strip_indices.
    const allIndices = [...result!.pods[0].strip_indices, ...result!.pods[1].strip_indices]
    expect(new Set(allIndices).size).toBe(allIndices.length)
  })
})
