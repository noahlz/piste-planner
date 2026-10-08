import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { BottleneckRule, DeMode, Phase, Weapon } from '../../src/engine/types.ts'
import type { Competition, Placement, RefRequirementsByDay, ScheduleResult } from '../../src/engine/types.ts'
import { computeRefRequirements, refDemandFromSchedule } from '../../src/engine/refs.ts'
import { phaseKey } from '../../src/engine/unseated.ts'
import type { KeptRun } from '../../src/store/keptRun.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import { makeCompetition, makeConfig, makePlacement, makeScheduleResult } from '../helpers/factories.ts'
import { drawnFromDerived, moveDay, runAndMoveHeadline, runPreset } from '../helpers/drawnFixtures.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import type { DerivedSchedule } from '../../src/store/derived.ts'
import {
  RunState,
  buildRefDemandByDay,
  selectDerivedSchedule,
  selectDerivedFindings,
  selectDerivedRefRequirements,
  selectDrawnSchedule,
  selectPlacementCounts,
} from '../../src/store/derived.ts'
import { deriveSized } from '../helpers/derive.ts'

// Smallest drift-ledger scenario (12 events) — realistic roster for exercising
// derived selectors against real catalogue data.
function setupB5(): void {
  const scenario = SCENARIOS.B5
  const state = useStore.getState()
  state.setTournamentType(scenario.tournamentType)
  state.setDays(scenario.days)
  state.setStrips(scenario.strips)
  state.setVideoStrips(scenario.videoStrips)
  state.selectCompetitions(Object.keys(scenario.fencerCounts))
  for (const [id, fencer_count] of Object.entries(scenario.fencerCounts)) {
    useStore.getState().updateCompetition(id, { fencer_count })
  }
}

beforeEach(() => {
  // Resets store state only. The selectors' module-level memo caches persist
  // across tests, which is benign: they are pure functions of their deps, so a
  // cache hit can only return the value a fresh compute would produce.
  useStore.setState(useStore.getInitialState())
})

describe('selectDerivedSchedule', () => {
  it('derives a ScheduleResult per placed event, carrying the placement day', () => {
    setupB5()
    const ids = Object.keys(SCENARIOS.B5.fencerCounts)
    const placements: Record<string, Placement> = {}
    ids.forEach((id, i) => {
      placements[id] = makePlacement({ day: i % 3, start_time: 480, strip_count: 4 })
    })
    useStore.getState().setPlacementsFromAuto(placements)

    const schedule = selectDerivedSchedule(useStore.getState())
    for (const id of ids) {
      expect(schedule.events[id]).toBeDefined()
      expect(schedule.events[id].result.assigned_day).toBe(placements[id].day)
    }
  })

  it('omits events with no placement', () => {
    setupB5()
    const schedule = selectDerivedSchedule(useStore.getState())
    expect(Object.keys(schedule.events)).toEqual([])
  })

  it('reflects a placement update immediately, without a fresh scheduleAll run', () => {
    setupB5()
    const id = 'JR-M-EPEE-IND'
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 0 }) })
    expect(selectDerivedSchedule(useStore.getState()).events[id].result.assigned_day).toBe(0)

    useStore.getState().updatePlacement(id, { day: 2 })

    expect(selectDerivedSchedule(useStore.getState()).events[id].result.assigned_day).toBe(2)
  })

  it('flags day_out_of_range for a placement beyond days_available, while still deriving blocks', () => {
    setupB5() // days_available = 3
    const id = 'JR-M-EPEE-IND'
    useStore.getState().setPlacementsFromAuto({ [id]: makePlacement({ day: 5 }) })

    const view = selectDerivedSchedule(useStore.getState()).events[id]
    expect(view.day_out_of_range).toBe(true)
    expect(view.result.pool_start).not.toBeNull()
  })
})

describe('memoization', () => {
  it('returns the identical reference across calls when nothing changed', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })

    const first = selectDerivedSchedule(useStore.getState())
    const second = selectDerivedSchedule(useStore.getState())
    expect(second).toBe(first)
  })

  it('ignores unrelated store changes — same output reference even after an unrelated set() call', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    // A store update to a field selectDerivedSchedule does not depend on still
    // replaces the top-level state object reference in Zustand — memoization
    // must be keyed on the relevant slices, not on that identity.
    // undismissFinding always calls set() (even for an id that was never
    // dismissed), and dismissedFindings is not a scheduleDeps entry.
    useStore.getState().undismissFinding('unrelated-finding-id')
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).toBe(first)
  })

  it('returns a new reference once a depended-on input changes', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    useStore.getState().updatePlacement('JR-M-EPEE-IND', { day: 1 })
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).not.toBe(first)
  })

  it('recomputes when a competition config changes', () => {
    setupB5()
    useStore.getState().setPlacementsFromAuto({ 'JR-M-EPEE-IND': makePlacement() })
    const first = selectDerivedSchedule(useStore.getState())

    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })
    const second = selectDerivedSchedule(useStore.getState())

    expect(second).not.toBe(first)
    expect(second.events['JR-M-EPEE-IND'].result.entry_fencer_count).toBe(40)
  })

  it('memoizes selectDerivedFindings and selectDerivedRefRequirements independently of each other', () => {
    setupB5()
    const f1 = selectDerivedFindings(useStore.getState())
    const r1 = selectDerivedRefRequirements(useStore.getState())

    // Interleaved re-reads: if the two selectors shared one cache slot,
    // computing r1 would have evicted f1, and this re-read would rebuild it.
    expect(selectDerivedFindings(useStore.getState())).toBe(f1)
    expect(selectDerivedRefRequirements(useStore.getState())).toBe(r1)
  })
})

describe('selectDerivedFindings', () => {
  it('reports validation errors from current inputs – a zero strip count surfaces and clears', () => {
    setupB5()
    useStore.getState().setStrips(0)
    const broken = selectDerivedFindings(useStore.getState())
    expect(broken.validationErrors.some((e) => e.field === 'strips_total')).toBe(true)

    useStore.getState().setStrips(SCENARIOS.B5.strips)
    const fixed = selectDerivedFindings(useStore.getState())
    expect(fixed.validationErrors.some((e) => e.field === 'strips_total')).toBe(false)
  })

  it('uses a placement day for day assignment when present, falling back to round-robin otherwise', () => {
    // Two 1-pool events (fencer_count <= 9), 1 strip total: any single event
    // alone (1 pool) does not exceed capacity, but two on the same day (2
    // pools) does — day 1: ... capacity warning below.
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(3)
    useStore.getState().setStrips(1)
    useStore.getState().selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 8 })
    useStore.getState().updateCompetition('JR-W-EPEE-IND', { fencer_count: 8 })

    // No placements: round-robin fallback (i % days_available) puts these two
    // events on different days (0 and 1) — no capacity warning.
    const noPlacements = selectDerivedFindings(useStore.getState())
    expect(noPlacements.analysis.warnings.some(w => w.rule === BottleneckRule.DAY_POOLS_EXCEED_STRIPS)).toBe(false)

    // Both manually placed on the same day — placement day wins over the
    // round-robin fallback, producing the capacity warning.
    useStore.getState().setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 0 }),
      'JR-W-EPEE-IND': makePlacement({ day: 0 }),
    })
    const withPlacements = selectDerivedFindings(useStore.getState())
    expect(withPlacements.analysis.warnings.some(
      w => w.rule === BottleneckRule.DAY_POOLS_EXCEED_STRIPS && w.message.includes('Day 1:'),
    )).toBe(true)
  })

  /**
   * 017 T5b (spec §4): the rule check and the first and last day WARN read the
   * drawn model, so the app's rows equal the scheduler's. At 017 B4's kept run
   * had a first day of 790 minutes against a shortest middle day of 755, while
   * `deriveEventSchedule`'s times, whose DEs start straight after the pools,
   * measured no WARN at all (2026-10-07).
   *
   * 018 T2 (2026-10-07): B4's premise moved from the first day to the last. R1
   * places three more B4 events past the old day end, which lengthens Day 3 to
   * 900 minutes against a shortest middle day of 885, and the first-day WARN no
   * longer fires. Over derived times (no kept run) B4 still warns on the last
   * day, but with different numbers: "Last day (Day 3, 760 min) ... (725 min)".
   * B4 no longer exercises the first-day half, so B3 (which T2 leaves unchanged)
   * covers it: the kept run warns first 635 / 595 and last 605 / 595, while
   * derived times give first 630 / 565 and last 585 / 565.
   */
  const FIRST_LAST_RULES: string[] = [BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE, BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE]

  function keptRunWarnings(preset: 'B3' | 'B4') {
    runPreset(preset)
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const scheduler = scheduleAll(competitions, config).bottlenecks.filter((b) => FIRST_LAST_RULES.includes(b.rule))
    const app = selectDerivedFindings(state).analysis.warnings.filter((w) => FIRST_LAST_RULES.includes(w.rule))
    return { scheduler, app }
  }

  it('measures the last day on the kept run, as the scheduler does (B4)', () => {
    const { scheduler, app } = keptRunWarnings('B4')
    expect(scheduler.map((b) => b.message), 'premise: the scheduler warns on B4\'s last day').toEqual([
      'Last day (Day 3, 900 min) is not shorter than the shortest middle day (885 min)',
    ])
    expect(app).toEqual(scheduler)
  })

  it('measures the first and last day on the kept run, as the scheduler does (B3)', () => {
    const { scheduler, app } = keptRunWarnings('B3')
    expect(scheduler.map((b) => b.message), 'premise: the scheduler warns on B3\'s first and last day').toEqual([
      'First day (Day 1, 635 min) is not shorter than the shortest middle day (595 min)',
      'Last day (Day 4, 605 min) is not shorter than the shortest middle day (595 min)',
    ])
    expect(app).toEqual(scheduler)
  })
})

describe('selectDerivedRefRequirements', () => {
  it('derives ref requirements from placements, not from an internal scheduleAll run', () => {
    useStore.getState().setTournamentType('NAC')
    useStore.getState().setDays(3)
    useStore.getState().setStrips(20)
    useStore.getState().selectCompetitions(['JR-M-EPEE-IND'])
    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })

    // Force the placement onto day 2 — scheduleAll's own day-assignment
    // algorithm would very likely pick day 0 for a lone event, so demand
    // showing up on day 2 only is proof this reads placements, not a fresh run.
    useStore.getState().setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 2, start_time: 480, strip_count: 4 }),
    })

    const reqs = selectDerivedRefRequirements(useStore.getState())
    expect(reqs).toHaveLength(3)
    expect(reqs[0].peak_total_refs).toBe(0)
    expect(reqs[1].peak_total_refs).toBe(0)
    expect(reqs[2].peak_total_refs).toBeGreaterThan(0)
  })

  it('returns one zeroed entry per day when there are no placements', () => {
    setupB5()
    const reqs = selectDerivedRefRequirements(useStore.getState())
    expect(reqs).toHaveLength(3)
    for (const r of reqs) {
      expect(r.peak_total_refs).toBe(0)
      expect(r.peak_saber_refs).toBe(0)
    }
  })
})

describe('buildRefDemandByDay', () => {
  // A bracket of 2 has no counted round, so its DE draws 0 strips over a zero-length
  // span (METHODOLOGY.md §DE Duration). It asks no referee, so it adds no interval.
  function bracketOfTwoSchedule(poolRefs: number | null): DerivedSchedule {
    const competition = makeCompetition({ id: 'duel', fencer_count: 2 })
    const pools =
      poolRefs === null ? {} : { pool_start: 480, pool_end: 540, pool_strip_count: 1, pool_refs_count: poolRefs }
    return {
      config: makeConfig(),
      competitions: [competition],
      events: {
        [competition.id]: {
          result: {
            ...makeScheduleResult(competition.id, 1),
            ...pools,
            de_start: 600,
            de_end: 600,
            de_strip_count: 0,
          },
          day_out_of_range: false,
        },
      },
    }
  }

  it('gives a day whose only DE is a bracket of 2 no interval at all', () => {
    expect(buildRefDemandByDay(drawnFromDerived(bracketOfTwoSchedule(null)))).toEqual({})
  })

  it('keeps the same event\'s pool interval and drops only the 0-count DE', () => {
    const byDay = buildRefDemandByDay(drawnFromDerived(bracketOfTwoSchedule(2)))

    expect(byDay[1].intervals).toEqual([
      { startTime: 480, endTime: 540, count: 2, weapon: Weapon.FOIL },
    ])
  })
})

/**
 * 017 T9 (spec §7, P4 (c)): the footer's referee peak counts the drawn model,
 * leaving out only the blocks it counts as unplaced. Right after a run that is
 * the scheduler's timeline (appPathParity.test.ts). After a hand move the moved
 * event counts at its derived times, less a phase with no free strip. While
 * stale every derived phase counts, seated or not.
 */
describe('selectDerivedRefRequirements counts the drawn board (017 T9)', () => {
  /** The per-day peaks of `results`, leaving out the phases `skip` names. */
  function sweep(results: ScheduleResult[], skip: ReadonlySet<string>): RefRequirementsByDay[] {
    const { config, competitions } = selectDrawnSchedule(useStore.getState())
    return computeRefRequirements(refDemandFromSchedule(results, config, competitions, skip), config.days_available)
  }

  // Not the headline move: on B1 that leaves only its DE_ROUND_OF_16 seated,
  // which moves no peak, so derived and kept times would sweep alike. This
  // mover's POOLS seats on day 2 and its DEs do not, so both halves count.
  it('counts a hand-moved event at its derived times, less the phases that find no strips', () => {
    const id = 'VET-M-SABRE-IND-VCMB'
    runPreset('B1')
    expect(useStore.getState().placements[id].day, 'premise: the run puts the mover off day 2').not.toBe(2)
    moveDay(id, 2)
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    const unseated = model.blocks.filter((b) => b.competitionId === id && b.countsAsUnplaced).map((b) => b.phase)
    expect(unseated, 'premise: the mover\'s DEs find no strips').toEqual([Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16])

    const kept = state.lastRun as KeptRun
    const competition = model.competitions.find((c) => c.id === id) as Competition
    const resultsWithMoverAt = (mover: ScheduleResult) => Object.keys(model.events).map((eventId) => {
      if (eventId === id) return mover
      expect(model.events[eventId].source, `premise: ${eventId} stays kept`).toBe('kept')
      return kept.events[eventId].result
    })
    const results = resultsWithMoverAt(deriveSized(state.placements[id], competition, model.config).result)
    const skip = new Set(unseated.map((phase) => phaseKey(id, phase)))
    expect(sweep(results, skip), 'premise: the unseated phases would move a peak').not.toEqual(sweep(results, new Set()))
    expect(sweep(resultsWithMoverAt(kept.events[id].result), skip), 'premise: the mover\'s derived times move a peak')
      .not.toEqual(sweep(results, skip))

    expect(selectDerivedRefRequirements(state)).toEqual(sweep(results, skip))
  })

  it('counts every derived phase on a stale board, including one that finds no strips', () => {
    const { id } = runAndMoveHeadline('B1')
    useStore.getState().updateCompetition(id, { fencer_count: useStore.getState().selectedCompetitions[id].fencer_count + 1 })
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: a fencer-count edit makes the board stale').toBe(RunState.STALE)
    for (const [eventId, event] of Object.entries(model.events)) {
      expect(event.source, `premise: ${eventId} is derived while stale`).toBe('derived')
    }
    const unseated = new Set(model.blocks.filter((b) => b.unseated).map((b) => phaseKey(b.competitionId, b.phase)))
    expect(unseated.size, 'premise: the stale board draws unseated phases').toBeGreaterThan(0)

    const results = Object.values(model.events).map(({ result }) => result)
    expect(sweep(results, unseated), 'premise: the unseated phases would move a peak').not.toEqual(sweep(results, new Set()))

    expect(selectDerivedRefRequirements(state)).toEqual(sweep(results, new Set()))
  })
})

/**
 * 017 T5a (spec §2, §4): the footer's counts read the drawn model's one
 * unplaced predicate, never the lane packer. An event is unplaced when it has
 * no in-range placement or a block the model counts as unplaced.
 */
describe('selectPlacementCounts reads the drawn model (017 T5a)', () => {
  it('counts the headline move\'s event once, though two of its phases find no strips', () => {
    const { id } = runAndMoveHeadline('B1')
    const state = useStore.getState()
    const counted = selectDrawnSchedule(state).blocks.filter((b) => b.competitionId === id && b.countsAsUnplaced)
    expect(counted.map((b) => b.phase), 'premise: the mover\'s POOLS and DE_PRELIMS find no strips')
      .toEqual([Phase.POOLS, Phase.DE_PRELIMS])

    expect(selectPlacementCounts(state)).toEqual({ placed: 23, unplaced: 1, pinned: 1 })
  })

  it('reads 24 placed again once Auto-assign runs after the headline move', () => {
    runAndMoveHeadline('B1')

    runScheduleAll()

    expect(selectPlacementCounts(useStore.getState())).toEqual({ placed: 24, unplaced: 0, pinned: 1 })
  })

  it('counts no unseated phase as unplaced on a stale board (review focus 10)', () => {
    runAndMoveHeadline('B1')
    useStore.getState().setDeModeOverride(DeMode.SINGLE_STAGE)
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: a settings edit makes the board stale').toBe(RunState.STALE)
    expect(model.blocks.some((b) => b.unseated), 'premise: the stale board draws unseated phases').toBe(true)

    expect(selectPlacementCounts(state)).toEqual({ placed: 24, unplaced: 0, pinned: 1 })
  })
})

describe('an event the engine cannot size counts as not placed (018 T4)', () => {
  // Fresh-page order: the count is edited before any selector has run on it,
  // so a throw cannot hide behind the memo cache.
  function runB1WithCount(fencer_count: number): string {
    runPreset('B1')
    const id = 'JR-M-FOIL-IND'
    useStore.getState().updateCompetition(id, { fencer_count })
    expect(useStore.getState().placements[id], 'premise: the event keeps its placement').toBeDefined()
    return id
  }

  it.each([0, 1, 1.5, Infinity])('%s: the drawn board leaves it out and the footer counts it unplaced', (n) => {
    const id = runB1WithCount(n)
    const state = useStore.getState()
    const drawn = selectDrawnSchedule(state)
    expect(drawn.events[id]).toBeUndefined()
    expect(drawn.blocks.some((b) => b.competitionId === id)).toBe(false)
    expect(selectDerivedSchedule(state).events[id]).toBeUndefined()
    expect(selectPlacementCounts(state)).toEqual({ placed: 23, unplaced: 1, pinned: 0 })
  })

  it.each([0, 1, 1.5, Infinity])('%s: the findings carry the fencer-count-bounds ERROR', (n) => {
    const id = runB1WithCount(n)
    const findings = selectDerivedFindings(useStore.getState())
    expect(findings.validationErrors.filter((e) => e.rule === 'fencer-count-bounds').map((e) => e.subjects))
      .toEqual([[id]])
  })

  it('guard: a count of 2 is still drawn and counted placed', () => {
    const id = runB1WithCount(2)
    const state = useStore.getState()
    expect(selectDrawnSchedule(state).events[id]).toBeDefined()
    expect(selectPlacementCounts(state)).toEqual({ placed: 24, unplaced: 0, pinned: 0 })
  })
})
