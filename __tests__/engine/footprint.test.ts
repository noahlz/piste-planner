import { describe, it, expect } from 'vitest'
import { deriveEventSchedule, estimateEventFootprint } from '../../src/engine/derive.ts'
import type { EventFootprint } from '../../src/engine/derive.ts'
import { computePoolStructure } from '../../src/engine/pools.ts'
import {
  DeMode, EventType, CutMode, PlacementSource,
} from '../../src/engine/types.ts'
import type {
  Competition, TournamentConfig, Placement, ScheduleResult,
} from '../../src/engine/types.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Builds the same synthetic placement estimateEventFootprint uses internally
 * (day 0, the day's clock start, one strip per pool) and derives it directly,
 * so tests assert against deriveEventSchedule's own output rather than a
 * hand-computed number — the whole point of T005 is that the two cannot
 * disagree because there is only one set of numbers.
 */
function deriveSynthetic(competition: Competition, config: TournamentConfig): ScheduleResult {
  const placement: Placement = {
    day: 0,
    start_time: config.dayConfigs[0]?.day_start_time ?? config.DAY_START_MINS,
    strip_count: computePoolStructure(competition.fencer_count, competition.use_single_pool_override).n_pools,
    strips: null,
    source: PlacementSource.AUTO,
    pinned: false,
  }
  return deriveEventSchedule(placement, competition, config).result
}

/**
 * Extracts the {strips, poolMinutes, deMinutes} triple from a live
 * ScheduleResult. deMinutes reads de_start for single-stage DE and falls
 * back to the first staged phase (de_prelims_start, then de_round_of_16_start)
 * when de_start stays null, matching derive.ts's staged-DE branch.
 */
function footprintFromResult(result: ScheduleResult): EventFootprint {
  const deStart = result.de_start ?? result.de_prelims_start ?? result.de_round_of_16_start
  if (result.pool_start === null || result.pool_end === null || result.de_total_end === null || deStart === null) {
    throw new Error('footprintFromResult: oracle produced a null geometry field')
  }
  return {
    strips: result.pool_strip_count,
    poolMinutes: result.pool_end - result.pool_start,
    deMinutes: result.de_total_end - deStart,
  }
}

// ──────────────────────────────────────────────
// Cases
// ──────────────────────────────────────────────

describe('estimateEventFootprint', () => {
  it('matches deriveEventSchedule for a default individual event', () => {
    const config = makeConfig()
    const competition = makeCompetition({ id: 'footprint-default', fencer_count: 24 })

    const expected = footprintFromResult(deriveSynthetic(competition, config))

    expect(estimateEventFootprint(competition, config)).toEqual(expected)
  })

  it('matches deriveEventSchedule for a flighted event, with poolMinutes spanning both flights', () => {
    const config = makeConfig()
    const competition = makeCompetition({ id: 'footprint-flighted', fencer_count: 40, flighted: true })

    const oracle = deriveSynthetic(competition, config)
    expect(oracle.use_flighting).toBe(true) // sanity: this scenario actually splits into flights
    const expected = footprintFromResult(oracle)

    expect(estimateEventFootprint(competition, config)).toEqual(expected)
  })

  it('matches deriveEventSchedule for a team event', () => {
    const config = makeConfig()
    const competition = makeCompetition({ id: 'footprint-team', fencer_count: 24, event_type: EventType.TEAM })

    const expected = footprintFromResult(deriveSynthetic(competition, config))

    expect(estimateEventFootprint(competition, config)).toEqual(expected)
  })

  it('matches deriveEventSchedule for a single-stage DE event, reading DE start from de_start', () => {
    const config = makeConfig()
    const competition = makeCompetition({
      id: 'footprint-de-single', fencer_count: 24, de_mode: DeMode.SINGLE_STAGE,
    })

    const oracle = deriveSynthetic(competition, config)
    expect(oracle.de_start).not.toBeNull() // sanity: single-stage branch actually populates de_start
    const expected = footprintFromResult(oracle)

    expect(estimateEventFootprint(competition, config)).toEqual(expected)
  })

  it('matches deriveEventSchedule for a staged DE event, reading DE start from the first staged phase', () => {
    const config = makeConfig()
    const competition = makeCompetition({
      id: 'footprint-de-staged', fencer_count: 70, de_mode: DeMode.STAGED, cut_mode: CutMode.DISABLED,
    })

    const oracle = deriveSynthetic(competition, config)
    // sanity: this scenario actually stages — de_start stays null, de_prelims_start does not
    expect(oracle.de_start).toBeNull()
    expect(oracle.de_prelims_start).not.toBeNull()
    const expected = footprintFromResult(oracle)

    expect(estimateEventFootprint(competition, config)).toEqual(expected)
  })

  // The five cases above compare estimateEventFootprint against deriveSynthetic
  // / footprintFromResult, which build the same synthetic placement and read
  // the same result fields the function under test does — agreement there
  // cannot fail if that shared construction itself drifts from the tables.
  // These two cases are literals worked out by hand from
  // DEFAULT_POOL_ROUND_DURATION_TABLE / DEFAULT_DE_DURATION_TABLE
  // (src/engine/constants.ts) and the pool/DE formulas (pools.ts, de.ts,
  // derive.ts), so a drift in the synthetic-placement contract itself would
  // show up here even though it can't show up above.
  it('matches a hand-derived literal for a default makeCompetition()', () => {
    const config = makeConfig()
    // makeCompetition() defaults (factories.ts:80): fencer_count 24, FOIL, DIV1,
    // MEN, INDIVIDUAL, cut_mode DISABLED, de_mode SINGLE_STAGE.
    // makeConfig() defaults: strips_total 24, max_pool_strip_pct/max_de_strip_pct 0.80.
    //
    // strips: computePoolStructure(24) -> n_pools = ceil(24/7) = 4, pool_sizes
    //   [6,6,6,6] (baseSize floor(24/4)=6, remainder 24%4=0). The synthetic
    //   placement requests strip_count = n_pools = 4, poolCap =
    //   floor(24*0.80) = 19, so grantedStrips(4, 19, 4) = 4.
    // poolMinutes: poolDurationForSize(FOIL, 6, table) = round(105 *
    //   BOUT_COUNTS[6]/BOUT_COUNTS[6]) = 105 for every pool (all size 6), so
    //   weightedPoolDuration = 105. estimatePoolDuration(4, 105, strips=4, _):
    //   staffableStrips = min(4,4) = 4, actual_batches = ceil(4/4) = 1,
    //   actual_duration = ceil(105*1) = 105.
    // deMinutes: computeDeFencerCount(24, DISABLED, ...) = 24 (DISABLED
    //   advances everyone). nextPowerOf2(24) = 32 (24 is not a power of 2;
    //   1 << ceil(log2(24)) = 1 << 5 = 32) -> bracketSize 32.
    //   calculateDeDuration(FOIL, 32, table) = 90 (DEFAULT_DE_DURATION_TABLE).
    //   deStripFootprint(32, 16) = max(1, min(floor(32/2)=16, 16)) = 16;
    //   deCap = floor(24*0.80) = 19, so deStrips = grantedStrips(16, 19) = 16.
    //   deSingleStageDuration(90, 32, 16, 16): totalBouts = floor(32/2) = 16,
    //   adjustedTotal = 90*(16-1)/16 = 84.375, ratio = min(16/16,1) = 1 ->
    //   round(84.375) = 84. deMinutes = deDuration (84) + tailEstimateMins
    //   (INDIVIDUAL) 30 = 114 (de_total_end - de_start telescopes to
    //   deDuration + tail; both add the same de_start/deStart offset).
    const competition = makeCompetition({ id: 'footprint-literal-default' })

    expect(estimateEventFootprint(competition, config)).toEqual({
      strips: 4,
      poolMinutes: 105,
      deMinutes: 114,
    })
  })

  it('matches a hand-derived literal for a one-pool event (fencer_count 7)', () => {
    const config = makeConfig()
    // fencer_count 7 is <= 9, so computePoolStructure(7) is one pool of 7
    // (single-pool branch, pools.ts:28-29) — n_pools = 1, pool_sizes = [7].
    //
    // strips: synthetic placement requests strip_count = n_pools = 1; poolCap
    //   = floor(24*0.80) = 19, so grantedStrips(1, 19, 1) = 1.
    // poolMinutes: poolDurationForSize(FOIL, 7, table) = round(105 *
    //   BOUT_COUNTS[7]/BOUT_COUNTS[6]) = round(105*21/15) = round(147) = 147
    //   (weightedPoolDuration of a single pool is that pool's own duration).
    //   estimatePoolDuration(1, 147, strips=1, _): staffableStrips = min(1,1)
    //   = 1, actual_batches = ceil(1/1) = 1, actual_duration = ceil(147) = 147.
    // deMinutes: computeDeFencerCount(7, DISABLED, ...) = 7. nextPowerOf2(7)
    //   = 8 (7 is not a power of 2; 1 << ceil(log2(7)) = 1 << 3 = 8) ->
    //   bracketSize 8. calculateDeDuration(FOIL, 8, table) = 45.
    //   deStripFootprint(8, 16) = max(1, min(floor(8/2)=4, 16)) = 4; deCap =
    //   19, so deStrips = grantedStrips(4, 19) = 4.
    //   deSingleStageDuration(45, 8, 4, 4): totalBouts = floor(8/2) = 4,
    //   adjustedTotal = 45*(4-1)/4 = 33.75, ratio = min(4/4,1) = 1 ->
    //   round(33.75) = 34. deMinutes = 34 + tailEstimateMins(INDIVIDUAL) 30 = 64.
    const competition = makeCompetition({ id: 'footprint-literal-one-pool', fencer_count: 7 })

    expect(estimateEventFootprint(competition, config)).toEqual({
      strips: 1,
      poolMinutes: 147,
      deMinutes: 64,
    })
  })
})
