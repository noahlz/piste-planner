import { describe, it, expect } from 'vitest'
import {
  schedulePoolPhase,
  scheduleDePrelimsPhase,
  scheduleR16Phase,
  scheduleDeFinalsPhase,
  scheduleSingleStageDePhase,
  scheduleBronzePhase,
} from '../../src/engine/phaseSchedulers.ts'
import type { PartialScheduleResult } from '../../src/engine/phaseSchedulers.ts'
import type { EventTxLog } from '../../src/engine/types.ts'
import { DeMode, EventType, VideoPolicy } from '../../src/engine/types.ts'
import { createGlobalState } from '../../src/engine/resources.ts'
import { computePoolStructure, weightedPoolDuration } from '../../src/engine/pools.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

function freshTxLog(): EventTxLog {
  return { stripChanges: [], refEvents: [] }
}

// Day 0, 8 AM in minutes-from-midnight
const DAY = 0
const NOT_BEFORE = 480 // 8:00 AM

// ──────────────────────────────────────────────
// schedulePoolPhase
// ──────────────────────────────────────────────

describe('schedulePoolPhase', () => {
  it('pool duration equals weightedPoolDuration × batchCount (1 batch when strips plentiful)', () => {
    // 64 fencers → 10 pools of 6/7 (4 pools of 7, 6 pools of 6).
    // Config: 24 strips, 20 foil_epee_refs AUTO → staffableStrips=min(19,10,10)=10 → 1 batch.
    // wDuration for FOIL: avg(4×147 + 6×105)/10 = 122 min.
    // So poolEnd - poolStart must equal exactly 122 (1 batch × 122).
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({ id: 'pool-test', fencer_count: 64 })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    const result = schedulePoolPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      [competition],
      partialResult,
      txLog,
    )

    const poolStructure = computePoolStructure(64)
    const wDuration = weightedPoolDuration(poolStructure, competition.weapon, config.pool_round_duration_table)

    // Single-batch case: duration must equal exactly 1 × wDuration
    expect(result.poolEnd - (partialResult.pool_start ?? NOT_BEFORE)).toBe(wDuration)
    // pool_start set in partialResult
    expect(partialResult.pool_start).toBe(NOT_BEFORE)
    // pool_end set correctly
    expect(partialResult.pool_end).toBe(result.poolEnd)
    // pool_duration_baseline reflects the weighted duration
    expect(partialResult.pool_duration_baseline).toBe(wDuration)
  })

  it('pool_strip_count equals min(n_pools, strips_available)', () => {
    // 64 fencers → 10 pools. Cap: floor(24 * 0.8) = 19. Refs: min(19, 10, 10) = 10.
    // So exactly 10 strips allocated (min(10 pools, 19 cap) = 10).
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({ id: 'pool-strip-count', fencer_count: 64 })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    schedulePoolPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      [competition],
      partialResult,
      txLog,
    )

    expect(partialResult.pool_strip_count).toBe(10)
  })

  it('emits ref release_events with the correct count after pool allocation', () => {
    // AUTO policy, 20 foil_epee_refs, 10 pools → refs_per_pool=2 → refs_needed=20.
    // allocateRefs pushes one release_event for foil_epee with count=20.
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({ id: 'pool-refs', fencer_count: 64 })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    schedulePoolPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      [competition],
      partialResult,
      txLog,
    )

    // 20 refs allocated — one release_event pushed to txLog
    expect(txLog.refEvents.length).toBeGreaterThan(0)
    const totalReleased = txLog.refEvents.reduce((sum, e) => sum + e.event.count, 0)
    expect(totalReleased).toBe(20)
  })

  it('two-batch case: poolEnd - poolStart === wDuration × 2 when strips are capped below pool count', () => {
    // 100 fencers → ceil(100/7) = 15 pools.
    // max_pool_strip_pct=0.50 → cap = floor(24 * 0.5) = 12.
    // TWO ref policy, 100 refs → refs_per_pool=2 → staffable = min(12, 15, 50) = 12.
    // batchCount = ceil(15/12) = 2. actual_duration = 2 × wDuration.
    const config = makeConfig({
      max_pool_strip_pct: 0.50,
      max_de_strip_pct: 1.0,
      referee_availability: [
        { day: 0, foil_epee_refs: 100, three_weapon_refs: 50, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 100, three_weapon_refs: 50, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 100, three_weapon_refs: 50, source: 'ACTUAL' },
      ],
    })
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'two-batch',
      fencer_count: 100,
      ref_policy: 'TWO' as const,
    })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    const result = schedulePoolPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      [competition],
      partialResult,
      txLog,
    )

    const poolStructure = computePoolStructure(100)
    const wDuration = weightedPoolDuration(poolStructure, competition.weapon, config.pool_round_duration_table)

    // Two batches: actual_duration = 2 × wDuration
    const elapsed = result.poolEnd - (partialResult.pool_start ?? NOT_BEFORE)
    expect(elapsed).toBe(wDuration * 2)
  })
})

// ──────────────────────────────────────────────
// scheduleDePrelimsPhase
// ──────────────────────────────────────────────

describe('scheduleDePrelimsPhase', () => {
  it('returns prelimsEnd > notBefore and populates de_prelims_start/end in partialResult', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'staged-128',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
    })
    const partialResult: PartialScheduleResult = { pool_end: NOT_BEFORE }
    const txLog = freshTxLog()

    const result = scheduleDePrelimsPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    // prelimsEnd is a positive finite minute value after notBefore
    expect(result.prelimsEnd).toBeGreaterThan(NOT_BEFORE)
    // partialResult fields are set
    expect(partialResult.de_prelims_start).toBe(NOT_BEFORE)
    expect(partialResult.de_prelims_end).toBe(result.prelimsEnd)
    // at least one strip was used (strip count > 0)
    expect(partialResult.de_prelims_strip_count).toBeGreaterThan(0)
    // strips were actually allocated: at least one strip freed past notBefore
    expect(txLog.stripChanges.length).toBeGreaterThan(0)
  })

  it('prelims duration scales inversely with strip count', () => {
    // With 64 strips the preliminary phase gets more strips and should finish sooner
    // than with only 4 strips.
    const fewConfig = makeConfig({ strips: makeStrips(4, 0), max_de_strip_pct: 1.0 })
    const manyConfig = makeConfig({ strips: makeStrips(64, 0), max_de_strip_pct: 1.0 })
    const competition = makeCompetition({
      id: 'staged-128-scale',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
    })

    const stateFew = createGlobalState(fewConfig)
    const partialFew: PartialScheduleResult = {}
    const resultFew = scheduleDePrelimsPhase(
      competition, DAY, NOT_BEFORE, stateFew, fewConfig, partialFew, freshTxLog(),
    )

    const stateMany = createGlobalState(manyConfig)
    const partialMany: PartialScheduleResult = {}
    const resultMany = scheduleDePrelimsPhase(
      competition, DAY, NOT_BEFORE, stateMany, manyConfig, partialMany, freshTxLog(),
    )

    // More strips → shorter elapsed time (earlier prelimsEnd)
    expect(resultFew.prelimsEnd).toBeGreaterThanOrEqual(resultMany.prelimsEnd)
  })
})

// ──────────────────────────────────────────────
// scheduleR16Phase
// ──────────────────────────────────────────────

describe('scheduleR16Phase', () => {
  it('returns r16End > notBefore and populates de_round_of_16_start/end in partialResult', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'staged-r16',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
    })
    const partialResult: PartialScheduleResult = { de_prelims_end: NOT_BEFORE }
    const txLog = freshTxLog()

    const result = scheduleR16Phase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    expect(result.r16End).toBeGreaterThan(NOT_BEFORE)
    expect(partialResult.de_round_of_16_start).toBe(NOT_BEFORE)
    expect(partialResult.de_round_of_16_end).toBe(result.r16End)
    expect(partialResult.de_round_of_16_strip_count).toBeGreaterThan(0)
    // Strips allocated: txLog records strip reservation
    expect(txLog.stripChanges.length).toBeGreaterThan(0)
  })

  it('REQUIRED video policy: r16 allocates from video strips only', () => {
    // Only 4 video strips out of 24. With REQUIRED policy, R16 must use video strips.
    // de_round_of_16_strips default is 4 (makeCompetition default) — exactly the video strip count.
    const config = makeConfig({ strips: makeStrips(24, 4) })
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'r16-video',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    scheduleR16Phase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    // strip count is capped at video_strips_total (4) since REQUIRED demands video strips
    expect(partialResult.de_round_of_16_strip_count).toBeLessThanOrEqual(4)
  })
})

// ──────────────────────────────────────────────
// scheduleDeFinalsPhase
// ──────────────────────────────────────────────

describe('scheduleDeFinalsPhase', () => {
  it('returns finalsEnd > notBefore with non-empty finalsStripIndices and populates partialResult', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'staged-finals',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
    })
    const partialResult: PartialScheduleResult = { de_round_of_16_end: NOT_BEFORE }
    const txLog = freshTxLog()

    const result = scheduleDeFinalsPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    expect(result.finalsEnd).toBeGreaterThan(NOT_BEFORE)
    expect(result.finalsStripIndices.length).toBeGreaterThan(0)
    expect(partialResult.de_finals_start).toBe(NOT_BEFORE)
    expect(partialResult.de_finals_end).toBe(result.finalsEnd)
    expect(partialResult.de_finals_strip_count).toBe(result.finalsStripIndices.length)
  })

  it('finals duration is at least DE_FINALS_MIN_MINS', () => {
    // The engine clamps: finActual = max(blocks.finals_dur, config.DE_FINALS_MIN_MINS).
    // With 128 fencers the finals block should be >= 30 minutes (DE_FINALS_MIN_MINS default).
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'finals-min-dur',
      fencer_count: 128,
      de_mode: DeMode.STAGED,
    })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    const result = scheduleDeFinalsPhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    const elapsed = result.finalsEnd - NOT_BEFORE
    expect(elapsed).toBeGreaterThanOrEqual(config.DE_FINALS_MIN_MINS)
  })
})

// ──────────────────────────────────────────────
// scheduleSingleStageDePhase
// ──────────────────────────────────────────────

describe('scheduleSingleStageDePhase', () => {
  it('returns deEnd > notBefore with non-empty deStripIndices and populates de_start/end', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'single-stage-de',
      fencer_count: 64,
      de_mode: DeMode.SINGLE_STAGE,
    })
    const partialResult: PartialScheduleResult = { pool_end: NOT_BEFORE }
    const txLog = freshTxLog()

    const result = scheduleSingleStageDePhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    expect(result.deEnd).toBeGreaterThan(NOT_BEFORE)
    expect(result.deStripIndices.length).toBeGreaterThan(0)
    expect(partialResult.de_start).toBe(NOT_BEFORE)
    expect(partialResult.de_end).toBe(result.deEnd)
    expect(partialResult.de_strip_count).toBe(result.deStripIndices.length)
    // de_total_end is set and equals deEnd for a single-stage event
    expect(partialResult.de_total_end).toBe(result.deEnd)
  })

  it('de_duration_actual equals de_end - de_start', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'single-stage-dur',
      fencer_count: 64,
      de_mode: DeMode.SINGLE_STAGE,
    })
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    const result = scheduleSingleStageDePhase(
      competition,
      DAY,
      NOT_BEFORE,
      state,
      config,
      partialResult,
      txLog,
    )

    expect(partialResult.de_duration_actual).toBe(result.deEnd - (partialResult.de_start ?? NOT_BEFORE))
  })
})

// ──────────────────────────────────────────────
// scheduleBronzePhase
// ──────────────────────────────────────────────

describe('scheduleBronzePhase', () => {
  it('allocates a separate strip for bronze and de_bronze_strip_id !== gold strip id', () => {
    // Strip 0 is reserved for gold. Bronze must use a different strip.
    const config = makeConfig()
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'team-bronze',
      event_type: EventType.TEAM,
      fencer_count: 8,
      de_mode: DeMode.SINGLE_STAGE,
    })
    // Pretend strip index 0 is already reserved for gold
    const goldStripIndices = [0]
    const partialResult: PartialScheduleResult = {
      de_finals_start: NOT_BEFORE,
      de_finals_end: NOT_BEFORE + 60,
    }
    const txLog = freshTxLog()

    scheduleBronzePhase(
      competition,
      DAY,
      NOT_BEFORE,
      NOT_BEFORE + 60,
      goldStripIndices,
      state,
      config,
      partialResult,
      txLog,
      false,
    )

    // Bronze must be on a different strip than gold
    expect(partialResult.de_bronze_strip_id).not.toBeNull()
    expect(partialResult.de_bronze_strip_id).not.toBe(config.strips[0].id)
    // Bronze timing is concurrent with finals
    expect(partialResult.de_bronze_start).toBe(NOT_BEFORE)
    expect(partialResult.de_bronze_end).toBe(NOT_BEFORE + 60)
  })

  it('emits DE_FINALS_BRONZE_NO_STRIP bottleneck when all strips are occupied by gold', () => {
    // Only 1 strip total — gold takes index 0, no strip left for bronze.
    const strips = makeStrips(1, 0)
    const config = makeConfig({ strips, strips_total: 1, video_strips_total: 0 })
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'team-bronze-nostrip',
      event_type: EventType.TEAM,
      fencer_count: 8,
      de_mode: DeMode.SINGLE_STAGE,
    })
    const goldStripIndices = [0]
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    scheduleBronzePhase(
      competition,
      DAY,
      NOT_BEFORE,
      NOT_BEFORE + 60,
      goldStripIndices,
      state,
      config,
      partialResult,
      txLog,
      false,
    )

    // No strip allocated when all are taken by gold
    expect(partialResult.de_bronze_strip_id).toBeUndefined()
    // A bottleneck is emitted indicating the failure
    const bronzeBottleneck = state.bottlenecks.find(b => b.cause === 'DE_FINALS_BRONZE_NO_STRIP')
    expect(bronzeBottleneck).toBeDefined()
  })

  it('prefers non-video strip for non-video bronze over video strip', () => {
    // 2 video strips (indices 0-1), 22 non-video (indices 2-23).
    // Gold takes video strip 0. With videoRequired=false, bronze should prefer non-video (index 2+).
    const config = makeConfig({ strips: makeStrips(24, 2) })
    const state = createGlobalState(config)
    const competition = makeCompetition({
      id: 'bronze-prefer-nonvideo',
      event_type: EventType.TEAM,
      fencer_count: 8,
    })
    const goldStripIndices = [0] // gold on video strip 0
    const partialResult: PartialScheduleResult = {}
    const txLog = freshTxLog()

    scheduleBronzePhase(
      competition,
      DAY,
      NOT_BEFORE,
      NOT_BEFORE + 60,
      goldStripIndices,
      state,
      config,
      partialResult,
      txLog,
      false, // videoRequired = false
    )

    expect(partialResult.de_bronze_strip_id).not.toBeNull()
    // Bronze strip should be a non-video strip (not video strips 0 or 1)
    const bronzeStrip = config.strips.find(s => s.id === partialResult.de_bronze_strip_id)
    expect(bronzeStrip?.video_capable).toBe(false)
  })
})
