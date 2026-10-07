import { describe, it, expect } from 'vitest'
import { computeRefRequirements, peakDeRefDemand, refDemandFromSchedule } from '../../src/engine/refs.ts'
import { DeMode, Phase, Weapon } from '../../src/engine/types.ts'
import type { Competition, RefDemandByDay, ScheduleResult } from '../../src/engine/types.ts'
import { phaseKey, unseatedPhases } from '../../src/engine/unseated.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { makeConfig, makeCompetition, makeScheduleResult } from '../helpers/factories.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'

// ──────────────────────────────────────────────
// peakDeRefDemand
// ──────────────────────────────────────────────

// DE_REFS (1) per strip of the video block's ask, min(4, bracketSize / 2)
// (METHODOLOGY.md §DE Modes; 024 plan D6 – one reading of the video ask). The
// default competition has 24 fencers, cut disabled: bracket 32.
describe('peakDeRefDemand', () => {
  const config = makeConfig()

  it('STAGED, bracket 32 → DE_REFS × min(4, 16) = 4, no captain addend', () => {
    const comp = makeCompetition({ de_mode: DeMode.STAGED })
    expect(peakDeRefDemand(comp, config)).toBe(4)
  })

  it('SINGLE_STAGE reads the same video ask: bracket 32 → 4', () => {
    const comp = makeCompetition({ de_mode: DeMode.SINGLE_STAGE, strips_allocated: 8 })
    expect(peakDeRefDemand(comp, config)).toBe(4)
  })

  it('strips_allocated above the video ask is capped, not added', () => {
    const comp = makeCompetition({ strips_allocated: 12 })
    expect(peakDeRefDemand(comp, config)).toBe(4)
  })

  it('bracket 4 → DE_REFS × min(4, 2) = 2', () => {
    const comp = makeCompetition({ fencer_count: 3, de_mode: DeMode.STAGED })
    expect(peakDeRefDemand(comp, config)).toBe(2)
  })

  // METHODOLOGY.md §DE Duration 'No counted round': a bracket of 2 asks no
  // strips, so its DE needs no referee (024 plan D5).
  it('a bracket of 2 has no DE and demands no DE refs', () => {
    const comp = makeCompetition({ fencer_count: 2, de_mode: DeMode.STAGED })
    expect(peakDeRefDemand(comp, config)).toBe(0)
  })
})


// ──────────────────────────────────────────────
// computeRefRequirements
// ──────────────────────────────────────────────

describe('computeRefRequirements', () => {
  it('single FOIL interval on day 0 → peak_total=3, peak_saber=0, peak_time=600', () => {
    const demandByDay: Record<number, RefDemandByDay> = {
      0: { intervals: [{ startTime: 600, endTime: 660, count: 3, weapon: Weapon.FOIL }] },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result).toEqual([{ day: 0, peak_total_refs: 3, peak_saber_refs: 0, peak_time: 600 }])
  })

  it('two non-overlapping intervals → peak equals max interval count', () => {
    // {600,660,2} ends at 660; {780,840,3} starts at 780 — gap=120, fully non-adjacent
    // Running sum never exceeds 3 (no overlap)
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 780, endTime: 840, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(3)
    expect(result[0].peak_time).toBe(780)
  })

  it('two overlapping FOIL intervals → peak is their sum at the overlap start', () => {
    // {600,720,2} overlaps with {660,780,3} — at t=660 running sum = 2+3 = 5
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 720, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 780, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(5)
    expect(result[0].peak_time).toBe(660)
  })

  it('mixed weapons → peak_total sums across weapons, peak_saber counts only SABRE', () => {
    // FOIL {600,660,2} overlaps SABRE {630,690,4} from t=630: total=6, saber=4
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 630, endTime: 690, count: 4, weapon: Weapon.SABRE },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(6)
    expect(result[0].peak_saber_refs).toBe(4)
    expect(result[0].peak_time).toBe(630)
  })

  it('tie-break: +count events before -count at same time → peak includes both concurrent intervals', () => {
    // A {600,660,2} ends at 660; B {660,720,3} starts at 660.
    // At t=660: +3 applied before -2, so running sum reaches 2+3=5 before dropping to 3.
    const demandByDay: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 720, count: 3, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demandByDay, 1)
    expect(result[0].peak_total_refs).toBe(5)
    expect(result[0].peak_time).toBe(660)
  })

  it('empty demandByDay → single zero entry for daysAvailable=1', () => {
    const result = computeRefRequirements({}, 1)
    expect(result).toEqual([{ day: 0, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 }])
  })

  it('multi-day: day 0 FOIL, day 1 empty, day 2 SABRE → 3 entries with correct peaks', () => {
    const demandByDay: Record<number, RefDemandByDay> = {
      0: { intervals: [{ startTime: 600, endTime: 660, count: 2, weapon: Weapon.FOIL }] },
      2: { intervals: [{ startTime: 540, endTime: 600, count: 3, weapon: Weapon.SABRE }] },
    }
    const result = computeRefRequirements(demandByDay, 3)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ day: 0, peak_total_refs: 2, peak_saber_refs: 0, peak_time: 600 })
    expect(result[1]).toEqual({ day: 1, peak_total_refs: 0, peak_saber_refs: 0, peak_time: 0 })
    expect(result[2]).toEqual({ day: 2, peak_total_refs: 3, peak_saber_refs: 3, peak_time: 540 })
  })

  it('daysAvailable = 0 → returns empty array', () => {
    expect(computeRefRequirements({}, 0)).toEqual([])
  })

  it('three overlapping FOIL intervals → peak is reached mid-stack', () => {
    // A: 600-720 count=1
    // B: 630-690 count=2   (A+B=3 at 630)
    // C: 660-680 count=4   (A+B+C=7 at 660 — peak mid-stack)
    const demand: Record<number, RefDemandByDay> = {
      0: {
        intervals: [
          { startTime: 600, endTime: 720, count: 1, weapon: Weapon.FOIL },
          { startTime: 630, endTime: 690, count: 2, weapon: Weapon.FOIL },
          { startTime: 660, endTime: 680, count: 4, weapon: Weapon.FOIL },
        ],
      },
    }
    const result = computeRefRequirements(demand, 1)
    expect(result[0].peak_total_refs).toBe(7)
    expect(result[0].peak_time).toBe(660)
  })
})

// ──────────────────────────────────────────────
// refDemandFromSchedule (016 Task E, spec §5)
// ──────────────────────────────────────────────

// The store's `buildRefDemandByDay` body moved into the engine so the footer
// and the scheduler count the same intervals. Pools by `pool_refs_count`,
// flights by their own refs, DE phases by strips × DE_REFS, keyed by
// `assigned_day`, weapon from the competition, 0-count intervals dropped.
describe('refDemandFromSchedule', () => {
  const config = makeConfig({ DE_REFS: 2 })
  const foil = makeCompetition({ id: 'foil', weapon: Weapon.FOIL })

  function result(id: string, day: number, fields: Partial<ScheduleResult>): ScheduleResult {
    return { ...makeScheduleResult(id, day), ...fields }
  }

  function intervalsOn(results: ScheduleResult[], competitions: Competition[], day: number) {
    return refDemandFromSchedule(results, config, competitions)[day]?.intervals
  }

  it('counts a pool round by its pool_refs_count', () => {
    const pools = result('foil', 0, { pool_start: 480, pool_end: 600, pool_refs_count: 6 })
    expect(intervalsOn([pools], [foil], 0)).toEqual([
      { startTime: 480, endTime: 600, count: 6, weapon: Weapon.FOIL },
    ])
  })

  it('counts a flighted event by its two flights instead of its pool round', () => {
    const flighted = result('foil', 0, {
      pool_start: 480, pool_end: 720, pool_refs_count: 10,
      flight_a_start: 480, flight_a_end: 590, flight_a_refs: 5,
      flight_b_start: 605, flight_b_end: 720, flight_b_refs: 4,
    })
    expect(intervalsOn([flighted], [foil], 0)).toEqual([
      { startTime: 480, endTime: 590, count: 5, weapon: Weapon.FOIL },
      { startTime: 605, endTime: 720, count: 4, weapon: Weapon.FOIL },
    ])
  })

  it.each([
    ['single-stage DE', { de_start: 700, de_end: 820, de_strip_count: 8 }, 700, 820, 16],
    ['DE prelims', { de_prelims_start: 700, de_prelims_end: 760, de_prelims_strip_count: 6 }, 700, 760, 12],
    ['DE round of 16', { de_round_of_16_start: 780, de_round_of_16_end: 840, de_round_of_16_strip_count: 4 }, 780, 840, 8],
  ] as const)('counts a %s by its strips × DE_REFS', (_, fields, startTime, endTime, count) => {
    expect(intervalsOn([result('foil', 0, fields)], [foil], 0)).toEqual([
      { startTime, endTime, count, weapon: Weapon.FOIL },
    ])
  })

  // A bracket of 2 has no counted round, so its DE draws 0 strips over a
  // zero-length span (METHODOLOGY.md §DE Duration). It asks no referee.
  it('emits nothing for a block that asks no referee', () => {
    const duel = result('foil', 1, { de_start: 600, de_end: 600, de_strip_count: 0 })
    expect(refDemandFromSchedule([duel], config, [foil])).toEqual({})
  })

  it('drops only the 0-count block and keeps the same event\'s pool round', () => {
    const duel = result('foil', 1, {
      pool_start: 480, pool_end: 540, pool_refs_count: 2,
      de_start: 600, de_end: 600, de_strip_count: 0,
    })
    expect(intervalsOn([duel], [foil], 1)).toEqual([
      { startTime: 480, endTime: 540, count: 2, weapon: Weapon.FOIL },
    ])
  })

  it('takes the weapon from the result\'s competition', () => {
    const sabre = makeCompetition({ id: 'sabre', weapon: Weapon.SABRE })
    const pools = result('sabre', 0, { pool_start: 480, pool_end: 600, pool_refs_count: 3 })
    expect(intervalsOn([pools], [foil, sabre], 0)?.map((i) => i.weapon)).toEqual([Weapon.SABRE])
  })

  it('keys each result by its assigned_day', () => {
    const sabre = makeCompetition({ id: 'sabre', weapon: Weapon.SABRE })
    const byDay = refDemandFromSchedule([
      result('foil', 0, { pool_start: 480, pool_end: 600, pool_refs_count: 3 }),
      result('sabre', 2, { pool_start: 540, pool_end: 660, pool_refs_count: 4 }),
    ], config, [foil, sabre])
    expect(Object.keys(byDay).map(Number)).toEqual([0, 2])
    expect(byDay[2].intervals).toEqual([
      { startTime: 540, endTime: 660, count: 4, weapon: Weapon.SABRE },
    ])
  })

  it('skips a result whose competition is not given', () => {
    const orphan = result('missing', 0, { pool_start: 480, pool_end: 600, pool_refs_count: 3 })
    expect(refDemandFromSchedule([orphan], config, [foil])).toEqual({})
  })

  // 017 T9 (spec §7): a phase that holds no strips counts no referees. `skip`
  // names phases by `phaseKey`, and each pushed interval is one phase.
  describe('skip', () => {
    const pools = { pool_start: 480, pool_end: 600, pool_refs_count: 6 }
    const flights = {
      pool_start: 480, pool_end: 720, pool_refs_count: 10,
      flight_a_start: 480, flight_a_end: 590, flight_a_refs: 5,
      flight_b_start: 605, flight_b_end: 720, flight_b_refs: 4,
    }
    const staged = {
      ...pools,
      de_prelims_start: 700, de_prelims_end: 760, de_prelims_strip_count: 6,
      de_round_of_16_start: 780, de_round_of_16_end: 840, de_round_of_16_strip_count: 4,
    }
    const iv = (startTime: number, endTime: number, count: number) => ({ startTime, endTime, count, weapon: Weapon.FOIL })
    const POOLS_IV = iv(480, 600, 6)
    const PRELIMS_IV = iv(700, 760, 12)
    const R16_IV = iv(780, 840, 8)

    it.each([
      [Phase.POOLS, { ...pools, de_start: 700, de_end: 820, de_strip_count: 8 }, [iv(700, 820, 16)]],
      [Phase.DE, { ...pools, de_start: 700, de_end: 820, de_strip_count: 8 }, [POOLS_IV]],
      [Phase.FLIGHT_A, flights, [iv(605, 720, 4)]],
      [Phase.FLIGHT_B, flights, [iv(480, 590, 5)]],
      [Phase.DE_PRELIMS, staged, [POOLS_IV, R16_IV]],
      [Phase.DE_ROUND_OF_16, staged, [POOLS_IV, PRELIMS_IV]],
    ] as const)('leaves out a skipped %s and keeps the event\'s other phases', (phase, fields, kept) => {
      const skip = new Set([phaseKey('foil', phase)])
      expect(refDemandFromSchedule([result('foil', 0, fields)], config, [foil], skip)[0]?.intervals).toEqual(kept)
    })

    it('leaves another event\'s phase of the same name counted', () => {
      const skip = new Set([phaseKey('sabre', Phase.POOLS)])
      expect(refDemandFromSchedule([result('foil', 0, pools)], config, [foil], skip)[0]?.intervals).toEqual([POOLS_IV])
    })
  })
})

// ──────────────────────────────────────────────
// The scheduler's referee peak is its own timeline (017 T9, spec §7)
// ──────────────────────────────────────────────

/**
 * METHODOLOGY.md §Ref Demand Derivation (amended for 017): the scheduler
 * reports the peak of its own timeline, each phase at the times it allocated,
 * waits included, less any phase that holds no strips (`unseatedPhases`).
 */
describe('scheduleAll reports the peak of its own timeline (017 T9)', () => {
  function run(id: ScenarioId) {
    const { fencerCounts, tournamentType, days, strips, videoStrips } = SCENARIOS[id]
    const competitions = buildCompetitions(fencerCounts, tournamentType)
    const config = tournamentConfig(days, strips, videoStrips, tournamentType)
    return { config, competitions, ...scheduleAll(competitions, config) }
  }

  it.each(SCENARIO_IDS)('%s: every day\'s peak is a sweep of the scheduler\'s own intervals', (id) => {
    const { config, competitions, ...result } = run(id)
    const timeline = refDemandFromSchedule(Object.values(result.schedule), config, competitions, unseatedPhases(result))
    expect(result.ref_requirements_by_day).toEqual(computeRefRequirements(timeline, config.days_available))
  })

  /**
   * The spec's Expected drift table: the days whose total or sabre peak moves
   * from the drawn board (016 Task E) back to the timeline. Every other
   * scenario-day holds, which the drift ledger's snapshot pins.
   */
  const MOVED: [ScenarioId, number, { total: number; sabre: number }][] = [
    ['B1', 1, { total: 210, sabre: 64 }], ['B1', 2, { total: 134, sabre: 56 }],
    ['B2', 0, { total: 228, sabre: 90 }], ['B2', 3, { total: 136, sabre: 70 }],
    ['B4', 1, { total: 80, sabre: 44 }], ['B4', 2, { total: 80, sabre: 54 }],
    ['B6', 0, { total: 78, sabre: 48 }], ['B6', 1, { total: 68, sabre: 20 }], ['B6', 2, { total: 64, sabre: 32 }],
    ['B7', 0, { total: 156, sabre: 64 }], ['B7', 2, { total: 156, sabre: 70 }],
    ['B8', 0, { total: 212, sabre: 56 }], ['B8', 1, { total: 146, sabre: 56 }], ['B8', 2, { total: 136, sabre: 48 }],
  ]

  it.each(MOVED)('%s day %i reads the spec\'s timeline peak', (id, day, expected) => {
    const row = run(id).ref_requirements_by_day?.[day]
    expect({ total: row?.peak_total_refs, sabre: row?.peak_saber_refs }).toEqual(expected)
  })
})
