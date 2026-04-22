/**
 * Phase scheduler tests — Stage 6 Task 1A scaffolding.
 *
 * All tests are expected to FAIL with "not implemented" until Task 1B fills
 * in the function bodies. They verify correct signatures and return shapes.
 */
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
import { DeMode, EventType } from '../../src/engine/types.ts'
import { createGlobalState } from '../../src/engine/resources.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Shared helpers
// ──────────────────────────────────────────────

function freshTxLog(): EventTxLog {
  return { stripChanges: [], refIntervalIdxs: [] }
}

// Day 0, 8 AM in minutes-from-midnight
const DAY = 0
const NOT_BEFORE = 480 // 8:00 AM

// ──────────────────────────────────────────────
// schedulePoolPhase
// ──────────────────────────────────────────────

describe('schedulePoolPhase', () => {
  it('returns { poolEnd } > notBefore and populates pool_start in partialResult', () => {
    const config = makeConfig({ strips: Array.from({ length: 24 }, (_, i) => ({ id: `strip-${i + 1}`, video_capable: i < 4 })) })
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

    expect(result.poolEnd).toBeTypeOf('number')
    expect(result.poolEnd).toBeGreaterThan(NOT_BEFORE)
    expect(partialResult.pool_start).toBeTypeOf('number')
    expect(txLog.stripChanges.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// scheduleDePrelimsPhase
// ──────────────────────────────────────────────

describe('scheduleDePrelimsPhase', () => {
  it('returns { prelimsEnd } and populates de_prelims_start/end in partialResult', () => {
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

    expect(result.prelimsEnd).toBeTypeOf('number')
    expect(result.prelimsEnd).toBeGreaterThan(NOT_BEFORE)
    expect(partialResult.de_prelims_start).toBeTypeOf('number')
    expect(partialResult.de_prelims_end).toBeTypeOf('number')
  })
})

// ──────────────────────────────────────────────
// scheduleR16Phase
// ──────────────────────────────────────────────

describe('scheduleR16Phase', () => {
  it('returns { r16End } and populates de_round_of_16_start/end in partialResult', () => {
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

    expect(result.r16End).toBeTypeOf('number')
    expect(result.r16End).toBeGreaterThan(NOT_BEFORE)
    expect(partialResult.de_round_of_16_start).toBeTypeOf('number')
    expect(partialResult.de_round_of_16_end).toBeTypeOf('number')
  })
})

// ──────────────────────────────────────────────
// scheduleDeFinalsPhase
// ──────────────────────────────────────────────

describe('scheduleDeFinalsPhase', () => {
  it('returns { finalsEnd, finalsStripIndices } and populates de_finals_start/end', () => {
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

    expect(result.finalsEnd).toBeTypeOf('number')
    expect(result.finalsEnd).toBeGreaterThan(NOT_BEFORE)
    expect(Array.isArray(result.finalsStripIndices)).toBe(true)
    expect(result.finalsStripIndices.length).toBeGreaterThan(0)
    expect(partialResult.de_finals_start).toBeTypeOf('number')
    expect(partialResult.de_finals_end).toBeTypeOf('number')
  })
})

// ──────────────────────────────────────────────
// scheduleSingleStageDePhase
// ──────────────────────────────────────────────

describe('scheduleSingleStageDePhase', () => {
  it('returns { deEnd, deStripIndices } and populates de_start/end in partialResult', () => {
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

    expect(result.deEnd).toBeTypeOf('number')
    expect(result.deEnd).toBeGreaterThan(NOT_BEFORE)
    expect(Array.isArray(result.deStripIndices)).toBe(true)
    expect(result.deStripIndices.length).toBeGreaterThan(0)
    expect(partialResult.de_start).toBeTypeOf('number')
    expect(partialResult.de_end).toBeTypeOf('number')
  })
})

// ──────────────────────────────────────────────
// scheduleBronzePhase
// ──────────────────────────────────────────────

describe('scheduleBronzePhase', () => {
  it('allocates a separate strip for bronze and sets de_bronze_strip_id in partialResult', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // Team events get a bronze bout
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

    expect(partialResult.de_bronze_strip_id).toBeTypeOf('string')
    expect(partialResult.de_bronze_strip_id).not.toBe(config.strips[0].id)
  })
})
