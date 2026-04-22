import { describe, it, expect } from 'vitest'
import {
  createGlobalState,
  allocateStrips,
  releaseStrips,
  findAvailableStrips,
  allocateRefs,
  releaseRefs,
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
  it('strip_free_at has one entry per strip, all initialized to 0', () => {
    // dayStart(0, config) = 0 when dayConfigs is empty (PRD Section 12.1: T=0 = Day 0 start)
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    expect(state.strip_free_at).toHaveLength(STANDARD_STRIPS_TOTAL)
    expect(state.strip_free_at.every(t => t === 0)).toBe(true)
  })

  it('schedule, bottlenecks, and refs_in_use_by_day start empty', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    expect(state.schedule).toEqual({})
    expect(state.bottlenecks).toEqual([])
    expect(state.refs_in_use_by_day).toEqual({})
  })
})

// ──────────────────────────────────────────────
// allocateStrips / releaseStrips
// ──────────────────────────────────────────────

describe('allocateStrips / releaseStrips', () => {
  it('allocate 4 strips at t=0 for 120 min → those strips have free_at=120', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 120)
    expect(state.strip_free_at[0]).toBe(120)
    expect(state.strip_free_at[1]).toBe(120)
    expect(state.strip_free_at[2]).toBe(120)
    expect(state.strip_free_at[3]).toBe(120)
  })

  it('unallocated strips remain at initial value after allocation', () => {
    // dayStart(0, config) = 0 when dayConfigs is empty
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 120)
    expect(state.strip_free_at[4]).toBe(0)
  })

  it('allocate then re-allocate strip → free_at updated to later time', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0], 120)
    allocateStrips(state, [0], 240)
    expect(state.strip_free_at[0]).toBe(240)
  })

  it('releaseStrips — strips already at endTime remain unchanged (idempotent)', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 120)
    releaseStrips(state, [0, 1, 2, 3], 120)
    // already at 120, release is a no-op
    expect(state.strip_free_at[0]).toBe(120)
  })

  it('releaseStrips — strips with free_at past endTime are not rolled back', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateStrips(state, [0], 240)
    releaseStrips(state, [0], 120)
    // strip is busy until 240; releasing at 120 should be a no-op
    expect(state.strip_free_at[0]).toBe(240)
  })
})

// ──────────────────────────────────────────────
// findAvailableStrips
// ──────────────────────────────────────────────

describe('findAvailableStrips', () => {
  it('24 strips, 20 allocated until t=600 → 4 available at t=480 (indices 20-23)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    // Allocate first 20 strips until t=600
    allocateStrips(state, Array.from({ length: 20 }, (_, i) => i), 600)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices).toEqual([20, 21, 22, 23])
    }
  })

  it('video_required=false → non-video strips preferred (returned first)', () => {
    // 4 video strips at indices 0-3, 20 non-video at 4-23
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      // All returned strips should be non-video (indices 4+)
      expect(result.stripIndices.every(i => i >= 4)).toBe(true)
    }
  })

  it('video_required=true → only video-capable strips returned', () => {
    // First 4 strips are video-capable
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
    // Allocate all 4 video strips (indices 0-3) until t=660
    allocateStrips(state, [0, 1, 2, 3], 660)
    const result = findAvailableStrips(state, config, 2, 480, true)
    expect(result.type).toBe('WAIT_UNTIL')
    if (result.type === 'WAIT_UNTIL') {
      expect(result.waitUntil).toBe(660)
    }
  })

  it('not enough strips available at time → WAIT_UNTIL', () => {
    // Only 2 strips available but need 4
    const config = makeConfig({ strips: makeStrips(4, 0) })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1], 600)
    const result = findAvailableStrips(state, config, 4, 480, false)
    expect(result.type).toBe('WAIT_UNTIL')
  })

  it('video_required=false: when non-video strips are busy, falls back to video strips', () => {
    // 4 video (0-3) and 4 non-video (4-7). Non-video all busy.
    const config = makeConfig({ strips: makeStrips(8, 4) })
    const state = createGlobalState(config)
    allocateStrips(state, [4, 5, 6, 7], 600) // all non-video busy
    const result = findAvailableStrips(state, config, 2, 480, false)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      // Should fall back to video strips
      expect(result.stripIndices.every(i => config.strips[i].video_capable)).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────
// allocateRefs / releaseRefs
// ──────────────────────────────────────────────

describe('allocateRefs / releaseRefs', () => {
  it('allocate 3 foil refs on day 0 → foil_epee_in_use increases by 3', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600)
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(3)
  })

  it('allocate 3 epee refs on day 0 → foil_epee_in_use increases by 3', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.EPEE, 3, 480, 600)
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(3)
  })

  it('allocate saber refs on day 0 → saber_in_use increases', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.SABRE, 4, 480, 600)
    expect(state.refs_in_use_by_day[0].saber_in_use).toBe(4)
  })

  it('allocateRefs records a release_event at endTime', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600)
    const events = state.refs_in_use_by_day[0].release_events
    expect(events.some(e => e.time === 600 && e.type === 'foil_epee' && e.count === 3)).toBe(true)
  })

  it('releaseRefs foil: foil_epee_in_use decreases', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600)
    releaseRefs(state, 0, Weapon.FOIL, 3, 600)
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(0)
  })

  it('releaseRefs saber: saber_in_use decreases', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.SABRE, 4, 480, 600)
    releaseRefs(state, 0, Weapon.SABRE, 4, 600)
    expect(state.refs_in_use_by_day[0].saber_in_use).toBe(0)
  })

  it('releaseRefs does not go below zero', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    allocateRefs(state, 0, Weapon.FOIL, 2, 480, 600)
    releaseRefs(state, 0, Weapon.FOIL, 5, 600) // release more than allocated
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(0)
  })
})

// ──────────────────────────────────────────────
// earliestResourceWindow
// ──────────────────────────────────────────────

describe('earliestResourceWindow', () => {
  // PRD Section 12.1: T=0 = Day 0 08:00 AM. dayStart(0, config) = 0 * 840 = 0.
  // LATEST_START_OFFSET=480 → latest start = 0 + 480 = 480 (equivalent to 4pm wall clock).
  // Day 0 end = 0 + 840 = 840.

  it('strips and refs all free → returns notBefore (snapped to slot)', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // notBefore=60 (1hr into day 0), already on slot boundary
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 60, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(60)
    }
  })

  it('strips busy until t=120 → returns t=120 (snapped to slot)', () => {
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    // notBefore=0; all strips busy until t=120
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 120)
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(120)
    }
  })

  it('delay > THRESHOLD_MINS → STRIP_CONTENTION bottleneck emitted', () => {
    // notBefore=0; strips busy until t=60 (60-min delay > THRESHOLD_MINS=10)
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS), THRESHOLD_MINS: 10 })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 60)
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      const stripContention = result.bottlenecks.find(b => b.cause === 'STRIP_CONTENTION')
      expect(stripContention).toBeDefined()
    }
  })

  it('start time exceeds DAY_START + LATEST_START_OFFSET → NO_WINDOW', () => {
    // dayStart(0)=0, LATEST_START_OFFSET=480 → latestStart=480
    // Strips busy until 500 (past latest start)
    const config = makeConfig({ strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS) })
    const state = createGlobalState(config)
    allocateStrips(state, Array.from({ length: STANDARD_STRIPS_TOTAL }, (_, i) => i), 500)
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
  })

  it('refs constrained → REFEREE_CONTENTION bottleneck when delay > THRESHOLD', () => {
    // 24 strips free, but refs all in use until t=60
    const config = makeConfig({
      strips: makeStrips(STANDARD_STRIPS_TOTAL, STANDARD_VIDEO_STRIPS),
      referee_availability: [{ day: 0, foil_epee_refs: 4, three_weapon_refs: 0, source: 'ACTUAL' as const }],
    })
    const state = createGlobalState(config)
    // Allocate all 4 foil/epee refs until t=60
    allocateRefs(state, 0, Weapon.FOIL, 4, 0, 60)
    // Request 4 strips + 4 refs at t=0 — strips free but refs busy until t=60
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.startTime).toBe(60) // snapped from 60 → 60 (already on boundary)
      // Only refs are constrained (strips are free), so cause must be exactly REFEREE_CONTENTION
      const refContention = result.bottlenecks.find(
        (b: { cause: string }) => b.cause === 'REFEREE_CONTENTION',
      )
      expect(refContention).toBeDefined()
    }
  })

  it('notBefore not on slot boundary → snapped up to next slot', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // notBefore=15 (not on 30-min boundary) → snaps to 30
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 15, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      // 15 snaps to 30
      expect(result.startTime).toBe(30)
    }
  })

  it('MAX_RESCHEDULE_ATTEMPTS exhausted → NO_WINDOW', () => {
    // Force repeated WAIT_UNTIL responses by having only 2 strips but requesting 4.
    // Each iteration advances candidate, but strips never become sufficient within day bounds.
    const config = makeConfig({
      strips: makeStrips(2, 0),
      MAX_RESCHEDULE_ATTEMPTS: 1,
      LATEST_START_OFFSET: 120,
      DAY_LENGTH_MINS: 120,
    })
    const state = createGlobalState(config)
    // Both strips busy until well past day end
    allocateStrips(state, [0, 1], 9999)
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
  })
})

// ──────────────────────────────────────────────
// earliestResourceWindow NO_WINDOW reason
// ──────────────────────────────────────────────

describe('earliestResourceWindow NO_WINDOW reason', () => {
  // dayStart(0, config) = 0; LATEST_START_OFFSET=480 → latestStart=480; DAY_LENGTH_MINS=840 → dayEnd=840

  it('TIME reason — notBefore already past latestStart', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // notBefore=500 > latestStart=480 → immediate TIME reason
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 500, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
    if (result.type === 'NO_WINDOW') {
      expect(result.reason?.kind).toBe('TIME')
      if (result.reason?.kind === 'TIME') {
        expect(result.reason.latest_start).toBe(480)
      }
    }
  })

  it('strip scarcity surfaces as TIME reason (STRIPS branch proven unreachable)', () => {
    // The STRIPS branch in diagNoWindowReason requires findAvailableStrips to return FOUND
    // while stripFreeMax still pushes the candidate past latestStart. That cannot happen
    // because findAvailableStrips only returns strips whose freeAt <= candidate, so
    // stripFreeMax <= candidate always. Strip-caused failures arrive instead as WAIT_UNTIL,
    // which snaps past latestStart and fires the TIME branch first.
    //
    // This test confirms that outcome: all 4 strips busy until t=9999, LATEST_START_OFFSET=60
    // means latestStart=60. WAIT_UNTIL(9999) snaps to 10020 > 60 → NO_WINDOW with TIME reason.
    const config = makeConfig({
      strips: makeStrips(4, 0),
      LATEST_START_OFFSET: 60,
      DAY_LENGTH_MINS: 120,
    })
    const state = createGlobalState(config)
    allocateStrips(state, [0, 1, 2, 3], 9999)
    const result = earliestResourceWindow(4, 0, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
    if (result.type === 'NO_WINDOW') {
      expect(result.reason).toBeDefined()
      expect(result.reason?.kind).toBe('TIME')
    }
  })

  it('REFS reason — enough strips but refs tied up past day end', () => {
    // 24 strips free, but all 4 foil refs allocated until t=9999. earliestRefsTime
    // returns Infinity, so T=snapToSlot(Infinity)=Infinity > latestStart, triggering
    // diagNoWindowReason with candidate=0 <= latestStart and refs as binding constraint.
    const config = makeConfig({
      referee_availability: [
        { day: 0, foil_epee_refs: 4, three_weapon_refs: 0, source: 'ACTUAL' as const },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' as const },
      ],
      LATEST_START_OFFSET: 120,
      DAY_LENGTH_MINS: 240,
    })
    const state = createGlobalState(config)
    // Allocate all 4 foil refs until t=9999 — earliestRefsTime returns Infinity
    allocateRefs(state, 0, Weapon.FOIL, 4, 0, 9999)
    // Request 4 refs — strips are free but refs are tied up indefinitely
    const result = earliestResourceWindow(4, 4, Weapon.FOIL, false, 0, 0, state, config, 'comp-1', Phase.POOLS)
    expect(result.type).toBe('NO_WINDOW')
    if (result.type === 'NO_WINDOW') {
      expect(result.reason?.kind).toBe('REFS')
    }
  })
})

// ──────────────────────────────────────────────
// rollbackEvent
// ──────────────────────────────────────────────

describe('rollbackEvent', () => {
  function makeTxLog(): EventTxLog {
    return { stripChanges: [], refEvents: [] }
  }

  it('strip rollback: restores strip_free_at to pre-allocation values and clears txLog', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // All strips start at 0 (dayStart(0) with empty dayConfigs)
    const initialFreeAt = state.strip_free_at[0]
    expect(initialFreeAt).toBe(0)

    const txLog = makeTxLog()
    allocateStrips(state, [0, 1, 2], 600, txLog)

    // Verify allocation took effect
    expect(state.strip_free_at[0]).toBe(600)
    expect(state.strip_free_at[1]).toBe(600)
    expect(state.strip_free_at[2]).toBe(600)
    expect(txLog.stripChanges).toHaveLength(3)

    rollbackEvent(state, txLog)

    // All three strips restored to initial value (0)
    expect(state.strip_free_at[0]).toBe(0)
    expect(state.strip_free_at[1]).toBe(0)
    expect(state.strip_free_at[2]).toBe(0)
    // txLog is cleared
    expect(txLog.stripChanges).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('ref rollback: restores foil_epee_in_use and release_events and clears txLog', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLog = makeTxLog()
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600, txLog)

    const dayRefs = state.refs_in_use_by_day[0]
    expect(dayRefs.foil_epee_in_use).toBe(3)
    expect(dayRefs.release_events).toHaveLength(1)
    expect(txLog.refEvents).toHaveLength(1)

    rollbackEvent(state, txLog)

    expect(dayRefs.foil_epee_in_use).toBe(0)
    expect(dayRefs.release_events).toHaveLength(0)
    expect(txLog.stripChanges).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('combined rollback: strips AND refs both restored', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const txLog = makeTxLog()
    allocateStrips(state, [5, 6], 720, txLog)
    allocateRefs(state, 0, Weapon.SABRE, 2, 480, 720, txLog)

    expect(state.strip_free_at[5]).toBe(720)
    expect(state.strip_free_at[6]).toBe(720)
    expect(state.refs_in_use_by_day[0].saber_in_use).toBe(2)
    expect(state.refs_in_use_by_day[0].release_events).toHaveLength(1)

    rollbackEvent(state, txLog)

    // Strips restored to initial value (0)
    expect(state.strip_free_at[5]).toBe(0)
    expect(state.strip_free_at[6]).toBe(0)
    // Refs restored
    expect(state.refs_in_use_by_day[0].saber_in_use).toBe(0)
    expect(state.refs_in_use_by_day[0].release_events).toHaveLength(0)
    // txLog cleared
    expect(txLog.stripChanges).toHaveLength(0)
    expect(txLog.refEvents).toHaveLength(0)
  })

  it('isolation: rolling back event E does not affect event F allocations', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    // Event E: strips [0, 1], 3 foil refs
    const txLogE = makeTxLog()
    allocateStrips(state, [0, 1], 600, txLogE)
    allocateRefs(state, 0, Weapon.FOIL, 3, 480, 600, txLogE)

    // Event F: strips [2, 3], 2 foil refs (different strip indices and second release_event)
    const txLogF = makeTxLog()
    allocateStrips(state, [2, 3], 660, txLogF)
    allocateRefs(state, 0, Weapon.FOIL, 2, 480, 660, txLogF)

    // Confirm state before rollback
    expect(state.strip_free_at[2]).toBe(660)
    expect(state.strip_free_at[3]).toBe(660)
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(5) // 3 + 2
    expect(state.refs_in_use_by_day[0].release_events).toHaveLength(2)

    // Roll back only E
    rollbackEvent(state, txLogE)

    // E's strips restored
    expect(state.strip_free_at[0]).toBe(0)
    expect(state.strip_free_at[1]).toBe(0)

    // F's strips untouched
    expect(state.strip_free_at[2]).toBe(660)
    expect(state.strip_free_at[3]).toBe(660)

    // In-use counter reduced by E's 3 refs; F's 2 remain
    expect(state.refs_in_use_by_day[0].foil_epee_in_use).toBe(2)

    // F's release_event (idx 1 before rollback, now the only remaining one) is still present
    expect(state.refs_in_use_by_day[0].release_events).toHaveLength(1)
    expect(state.refs_in_use_by_day[0].release_events[0].count).toBe(2)
    expect(state.refs_in_use_by_day[0].release_events[0].time).toBe(660)

    // txLogE is cleared; txLogF still has its entries (not mutated by E's rollback)
    expect(txLogE.stripChanges).toHaveLength(0)
    expect(txLogE.refEvents).toHaveLength(0)
    expect(txLogF.stripChanges).toHaveLength(2)
    expect(txLogF.refEvents).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────
// findAvailableStrips — poolContext video rule
// ──────────────────────────────────────────────

// Setup: config with dayStart(0)=0 and MORNING_WAVE_WINDOW_MINS=60, so morning wave
// ends at 60. 18 non-video strips (indices 4–21) and 4 video strips (indices 0–3).
// We need 20 strips total, forcing overflow into video territory.
//
// State: non-video strips 4–21 are free. Video strips 0–3 are free.
// Allocate non-video strips 4–21 at count 18; need 20 total so must use 2 video.
// Actually: make only 18 non-video free (busy 2 of them) + all 4 video free.

describe('findAvailableStrips — poolContext video rule', () => {
  // 22 strips: 4 video (indices 0-3) + 18 non-video (indices 4-21)
  // 18 non-video free + 4 video free = 22 free; requesting 20 needs video overflow

  // dayStart(0, config) = 0 * 840 = 0
  // morning wave: atTime <= 0 + 120 = 120
  // atTime=30 is within morning wave; atTime=180 is outside

  it('1. morning wave pool: video overflow allowed (atTime <= dayStart+120)', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    // Busy 2 non-video strips so only 16 non-video are free; 4 video free → 20 total
    allocateStrips(state, [4, 5], 9999)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    // atTime=30 is within morning wave (dayStart(0)=0 + 120 = 120, 30 <= 120)
    const result = findAvailableStrips(state, config, 20, 30, false, poolContext)
    // 16 non-video free + 4 video free = 20 total — should succeed including video
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
    // Busy 2 non-video strips → only 16 non-video free; 4 video free but excluded
    allocateStrips(state, [4, 5], 9999)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: false, day: 0 }
    // atTime=180 is after morning wave (dayStart(0)+120=120, 180 > 120)
    const result = findAvailableStrips(state, config, 20, 180, false, poolContext)
    // Only 16 non-video free, need 20, video excluded → WAIT_UNTIL
    expect(result.type).toBe('WAIT_UNTIL')
  })

  it('3. after morning wave, single-event day: video overflow allowed', () => {
    const config = makePoolContextConfig()
    const state = createGlobalState(config)
    // Busy 2 non-video strips → only 16 non-video free; 4 video free
    allocateStrips(state, [4, 5], 9999)
    const poolContext: PoolContext = { isPoolPhase: true, isSingleEventDay: true, day: 0 }
    // atTime=180 is after morning wave, but isSingleEventDay=true allows video overflow
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
    // Busy 2 non-video strips → only 16 non-video free; 4 video free
    allocateStrips(state, [4, 5], 9999)
    // No poolContext — existing overflow behavior preserved
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
    // atTime=90, videoRequired=true — poolContext is irrelevant for this path
    const result = findAvailableStrips(state, config, 2, 90, true, poolContext)
    expect(result.type).toBe('FOUND')
    if (result.type === 'FOUND') {
      expect(result.stripIndices.every(i => config.strips[i].video_capable)).toBe(true)
    }
  })
})
