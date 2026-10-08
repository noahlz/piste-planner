import { describe, it, expect } from 'vitest'
import { phaseSpans, phaseKey, unseatedPhases, phaseRequiresVideo } from '../../src/engine/unseated.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { SCENARIO_IDS, type ScenarioId } from '../../src/data/tournaments.ts'
import { BottleneckCause, Phase, VideoPolicy } from '../../src/engine/types.ts'
import type { Competition, ScheduleResult, StripAllocation } from '../../src/engine/types.ts'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig, buildPinnedPlacements } from '../../src/store/buildConfig.ts'
import { makeCompetition, makeScheduleResult } from '../helpers/factories.ts'
import { loadFlightedFixture } from '../helpers/flightedFixtures.ts'

type PinMode = 'none' | 'all' | 'half'

/** Runs the engine on the store's current board with the store's current pins. */
function engineRun() {
  const state = useStore.getState()
  const { config, competitions } = buildTournamentConfig(state)
  return scheduleAll(competitions, config, buildPinnedPlacements(state))
}

/**
 * The app route for one scenario, then (for 'all' and 'half') the re-run with
 * pins, as `tmp/measure017pins.test.ts` measured it. 'half' pins every second
 * placed event in id order.
 */
function runScenario(setup: () => void, mode: PinMode) {
  useStore.setState(useStore.getInitialState(), true)
  setup()
  runScheduleAll()
  if (mode !== 'none') {
    Object.keys(useStore.getState().placements).sort().forEach((id, k) => {
      if (mode === 'all' || k % 2 === 0) useStore.getState().setPinned(id, true)
    })
    runScheduleAll()
  }
  return engineRun()
}

const scenario = (id: ScenarioId) => () => applyPreset(id)
const template = (name: string) => () => {
  applyPreset('B1')
  useStore.getState().applyTemplate(name)
}

/** A phase's window read straight off the result, independent of `phaseSpans`. */
function windowOf(result: ScheduleResult, phase: Phase): [number | null, number | null] {
  switch (phase) {
    case Phase.FLIGHT_A: return [result.flight_a_start, result.flight_a_end]
    case Phase.FLIGHT_B: return [result.flight_b_start, result.flight_b_end]
    case Phase.POOLS: return [result.pool_start, result.pool_end]
    case Phase.DE: return [result.de_start, result.de_end]
    case Phase.DE_PRELIMS: return [result.de_prelims_start, result.de_prelims_end]
    case Phase.DE_ROUND_OF_16: return [result.de_round_of_16_start, result.de_round_of_16_end]
    default: throw new Error(`no window for ${phase}`)
  }
}

/** A phase's strip count read straight off the result, independent of `phaseSpans`. */
function stripsOf(result: ScheduleResult, phase: Phase): number {
  switch (phase) {
    case Phase.FLIGHT_A: return result.flight_a_strips
    case Phase.FLIGHT_B: return result.flight_b_strips
    case Phase.POOLS: return result.pool_strip_count
    case Phase.DE: return result.de_strip_count
    case Phase.DE_PRELIMS: return result.de_prelims_strip_count
    case Phase.DE_ROUND_OF_16: return result.de_round_of_16_strip_count
    default: throw new Error(`no strip count for ${phase}`)
  }
}

/** Pins every placed event on the store's current board and re-runs, as `runScenario` does. */
function pinAllAndRerun() {
  Object.keys(useStore.getState().placements).forEach(id => useStore.getState().setPinned(id, true))
  runScheduleAll()
  return engineRun()
}

/** The engine's pinned-unclaimed (event, phase) set, less phases that last zero minutes. */
function pinnedUnclaimedKeys(run: ReturnType<typeof engineRun>): Set<string> {
  const keys = new Set<string>()
  for (const b of run.bottlenecks) {
    if (b.cause !== BottleneckCause.PINNED_UNCLAIMED) continue
    const [start, end] = windowOf(run.schedule[b.competition_id], b.phase)
    if (start === end) continue
    keys.add(phaseKey(b.competition_id, b.phase))
  }
  return keys
}

/** Spans across every scheduled event, so an empty-set assertion is not vacuous. */
const totalSpans = (run: ReturnType<typeof engineRun>): number =>
  Object.values(run.schedule).reduce((n, r) => n + phaseSpans(r).length, 0)

describe('unseatedPhases against the engine\'s pinned-unclaimed warnings', () => {
  // Distinct (event, phase) pairs the engine flagged PINNED_UNCLAIMED on a
  // pin-all and a pin-half re-run, measured at 114d99314b (tmp/measure017pins.json).
  const ALL = [8, 14, 10, 12, 3, 37, 8, 48]
  const HALF = [0, 1, 0, 2, 0, 9, 0, 10]

  it.each(SCENARIO_IDS.map((id, i) => [id, ALL[i], HALF[i]] as const))(
    '%s: matches the warnings after a pin-all (%i) and a pin-half (%i) re-run',
    (id, allCount, halfCount) => {
      const all = runScenario(scenario(id), 'all')
      expect(pinnedUnclaimedKeys(all).size).toBe(allCount)
      expect(unseatedPhases(all)).toEqual(pinnedUnclaimedKeys(all))

      const half = runScenario(scenario(id), 'half')
      expect(pinnedUnclaimedKeys(half).size).toBe(halfCount)
      expect(unseatedPhases(half)).toEqual(pinnedUnclaimedKeys(half))
    },
  )

  it.each(SCENARIO_IDS)('%s: is empty after an unpinned run', (id) => {
    const run = runScenario(scenario(id), 'none')
    expect(totalSpans(run)).toBeGreaterThan(0)
    expect(unseatedPhases(run).size).toBe(0)
  })

  it('is empty after an unpinned run of each of the 10 templates', () => {
    const names = Object.keys(TEMPLATES)
    expect(names).toHaveLength(10)
    for (const name of names) {
      const run = runScenario(template(name), 'none')
      expect(totalSpans(run), name).toBeGreaterThan(0)
      expect(unseatedPhases(run).size, name).toBe(0)
    }
  })
})

describe('zero-length and empty phases are never phases', () => {
  const V80 = 'VET-W-SABRE-IND-V80'

  it('B8 V80\'s zero-length round of 16 is in no span and never unseated', () => {
    const none = runScenario(scenario('B8'), 'none')
    const r = none.schedule[V80]
    expect([r.de_round_of_16_start, r.de_round_of_16_end]).toEqual([3570, 3570])
    expect(phaseSpans(r).map(s => s.phase)).toContain(Phase.POOLS)
    expect(phaseSpans(r).map(s => s.phase)).not.toContain(Phase.DE_ROUND_OF_16)

    const all = runScenario(scenario('B8'), 'all')
    // [M] The engine flags no zero-length phase PINNED_UNCLAIMED on any of
    // B1–B8, so the absence below is not "the engine said nothing". The phase is
    // still a zero-length window with no allocation, and only the guards in
    // `phaseSpans` and `unseatedPhases` keep it out.
    const r2 = all.schedule[V80]
    expect([r2.de_round_of_16_start, r2.de_round_of_16_end]).toEqual([3570, 3570])
    const seated = all.strip_allocations.flat().some(a => a.event_id === V80 && a.phase === Phase.DE_ROUND_OF_16)
    expect(seated).toBe(false)
    expect(unseatedPhases(all).has(phaseKey(V80, Phase.DE_ROUND_OF_16))).toBe(false)
  })

  it('a one-pool flighted event has an empty FLIGHT_B, no span for it, and none unseated', () => {
    const id = loadFlightedFixture('ONE_POOL')
    runScheduleAll()
    const run = pinAllAndRerun()
    const r = run.schedule[id]
    expect(r.flight_b_start).not.toBeNull()
    expect(r.flight_b_end).toBe(r.flight_b_start)
    const spans = phaseSpans(r).map(s => s.phase)
    expect(spans).toContain(Phase.FLIGHT_A)
    expect(spans).not.toContain(Phase.FLIGHT_B)
    expect(unseatedPhases(run).has(phaseKey(id, Phase.FLIGHT_B))).toBe(false)
  })

  it('a many-pools flighted event spans FLIGHT_A then FLIGHT_B, never POOLS', () => {
    const id = loadFlightedFixture('MANY_POOLS')
    runScheduleAll()
    const run = engineRun()
    const spans = phaseSpans(run.schedule[id])
    expect(spans.slice(0, 2).map(s => s.phase)).toEqual([Phase.FLIGHT_A, Phase.FLIGHT_B])
    expect(spans.map(s => s.phase)).not.toContain(Phase.POOLS)
    expect(spans[0].end).toBeLessThan(spans[1].start)
  })

  it('a many-pools flighted event seats both flights, so an unpinned run leaves nothing unseated', () => {
    const id = loadFlightedFixture('MANY_POOLS')
    runScheduleAll()
    const run = engineRun()
    const seated = run.strip_allocations.flat().filter(a => a.event_id === id).map(a => a.phase)
    expect(seated).toContain(Phase.FLIGHT_A)
    expect(seated).toContain(Phase.FLIGHT_B)
    expect(unseatedPhases(run).size).toBe(0)
  })
})

describe('phaseSpans', () => {
  it('reads each window and strip count off the result, with no zero-length span', () => {
    const run = runScenario(scenario('B1'), 'none')
    for (const result of Object.values(run.schedule)) {
      expect(phaseSpans(result).length).toBeGreaterThan(0)
      for (const span of phaseSpans(result)) {
        const [start, end] = windowOf(result, span.phase)
        expect([span.start, span.end]).toEqual([start, end])
        expect(span.stripCount).toBe(stripsOf(result, span.phase))
        expect(span.end).toBeGreaterThan(span.start)
      }
    }
  })

  it.each([
    ['D1-M-EPEE-IND', [Phase.POOLS, Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16]],
    ['VET-M-FOIL-TEAM', [Phase.POOLS, Phase.DE]],
  ])('lists B1 event %s\'s phases in drawing order and no other', (id, phases) => {
    const run = runScenario(scenario('B1'), 'none')
    expect(phaseSpans(run.schedule[id]).map(s => s.phase)).toEqual(phases)
  })

  it('skips a window that runs backwards as it skips an empty one', () => {
    const backwards = { ...makeScheduleResult('X', 0), pool_start: 700, pool_end: 600, pool_strip_count: 2 }
    expect(phaseSpans(backwards)).toEqual([])
  })
})

describe('unseatedPhases, one input per guard', () => {
  const X = phaseKey('X', Phase.POOLS)
  const seat: StripAllocation = { event_id: 'X', phase: Phase.POOLS, start_time: 600, end_time: 700 }
  const runOf = (pool: Partial<ScheduleResult>, allocations: StripAllocation[]) => ({
    schedule: { X: { ...makeScheduleResult('X', 0), ...pool } },
    strip_allocations: allocations.length > 0 ? [allocations] : [],
  })

  it('ignores a zero-length phase that has strips and no allocation', () => {
    const run = runOf({ pool_start: 600, pool_end: 600, pool_strip_count: 2 }, [])
    expect(unseatedPhases(run)).toEqual(new Set())
  })

  it('ignores a phase with no strips to claim', () => {
    const run = runOf({ pool_start: 600, pool_end: 700, pool_strip_count: 0 }, [])
    expect(unseatedPhases(run)).toEqual(new Set())
  })

  it('names a phase with strips, time and no allocation', () => {
    const run = runOf({ pool_start: 600, pool_end: 700, pool_strip_count: 2 }, [])
    expect(unseatedPhases(run)).toEqual(new Set([X]))
  })

  it('ignores that phase once an allocation seats it', () => {
    const run = runOf({ pool_start: 600, pool_end: 700, pool_strip_count: 2 }, [seat])
    expect(unseatedPhases(run)).toEqual(new Set())
  })
})

describe('phaseKey', () => {
  it('is one string per (event, phase), distinct across either part', () => {
    const keys = [
      phaseKey('A', Phase.POOLS), phaseKey('A', Phase.DE), phaseKey('B', Phase.POOLS),
    ]
    expect(new Set(keys).size).toBe(3)
    expect(phaseKey('A', Phase.DE)).toBe(phaseKey('A', Phase.DE))
  })
})

describe('phaseRequiresVideo', () => {
  const comp = (policy: VideoPolicy): Competition => makeCompetition({ de_video_policy: policy })

  it('is true only for the round of 16 under a required policy', () => {
    expect(phaseRequiresVideo(Phase.DE_ROUND_OF_16, comp(VideoPolicy.REQUIRED))).toBe(true)
    for (const phase of [Phase.POOLS, Phase.FLIGHT_A, Phase.FLIGHT_B, Phase.DE, Phase.DE_PRELIMS]) {
      expect(phaseRequiresVideo(phase, comp(VideoPolicy.REQUIRED))).toBe(false)
    }
  })

  it('is false for the round of 16 under any other policy', () => {
    for (const policy of Object.values(VideoPolicy).filter(p => p !== VideoPolicy.REQUIRED)) {
      expect(phaseRequiresVideo(Phase.DE_ROUND_OF_16, comp(policy))).toBe(false)
    }
  })
})
