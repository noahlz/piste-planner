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
})
