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
  // 018 T2 (2026-10-07): pin-all B4 12 → 18 and B6 37 → 44, pin-half B4 2 → 5. The last phase may
  // now end past the hard end (R1), so B4 places three more events (21 → 24) and
  // B6 six more (45 → 51). These are re-measured counts whose unclaimed sets
  // reshuffle: B4 pin-all gains CDT-W-FOIL, CDT-W-SABRE and the existing
  // CDT-M-SABRE-IND, and B6 pin-all gains 12 phases and loses 5, only 4 of them
  // from newly placed events. B6 pin-half holds at 9 by coincidence, and every
  // other scenario holds.
  // 021 T4 (2026-10-09): pin-all B3 10 → 11, B5 3 → 4, B6 44 → 53 and B8 48 → 47,
  // pin-half B3 0 → 1, B6 9 → 8 and B8 10 → 13. Weapon balance (METHODOLOGY
  // §Weapon Balance) re-colours the day maps of B1, B3, B5, B6, B7 and B8, and
  // B6 places 53 events (from 51), so each re-run pins a different board. B1
  // and B7 hold although their day maps moved, and B2 and B4 are unchanged.
  // 021 T6a (2026-10-09): pin-all B8 47 → 28 and pin-half B8 13 → 8. The Vet
  // co-day stagger binds (METHODOLOGY §Cross-Event Dependency Edges, owner ruling
  // O1), so B8's age-banded Vet bands start 60 minutes apart instead of
  // together, and each re-run pins that less crowded board. No day map moves,
  // and the other seven scenarios hold.
  // [M] 2026-10-10, 021 T8: pin-all B2 14 → 15, pin-all B8 28 → 22 and pin-half
  // B8 8 → 2, Video Strip Preservation (METHODOLOGY §Video Strip Preservation).
  // On a multi-event day holding a REQUIRED video phase a pool starting after the
  // start-of-day wave takes general strips only, so B2's and B8's video days
  // re-time and each re-run pins a different board, whose pinned pools claim
  // under the same rule. No day map moves, B2 pin-half holds at 1, and B1 and
  // B3–B7 hold (B3's re-timed days pin to the same counts).
  // [M] 2026-10-10, 021 T5: pin-half B6 8 → 9, the Y8↔Y10 same-day bonus
  // (METHODOLOGY Appendix A, owner rulings O6 and O12). B6's Y8-W-EPEE-IND and
  // Y8-W-FOIL-IND swap days to join their Y10s, so the half-pinned re-run pins a
  // different board. Pin-all B6 holds at 53, and the other seven scenarios hold.
  const ALL = [8, 15, 11, 18, 4, 53, 8, 22]
  const HALF = [0, 1, 1, 5, 0, 9, 0, 2]

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
    // 021 T4 (2026-10-09): 3570 → 635. Weapon balance moves V80's co-day group
    // from day 2 to day 0, and its round of 16 stays zero-length there.
    // 021 T6a (2026-10-09): 635 → 575. The Vet co-day stagger binds, so V80, the
    // oldest band, starts its pools at day start (it started at day start + 60,
    // with the younger bands it now leads), and every phase after moves 60 earlier.
    expect([r.de_round_of_16_start, r.de_round_of_16_end]).toEqual([575, 575])
    expect(phaseSpans(r).map(s => s.phase)).toContain(Phase.POOLS)
    expect(phaseSpans(r).map(s => s.phase)).not.toContain(Phase.DE_ROUND_OF_16)

    const all = runScenario(scenario('B8'), 'all')
    // [M] The engine flags no zero-length phase PINNED_UNCLAIMED on any of
    // B1–B8, so the absence below is not "the engine said nothing". The phase is
    // still a zero-length window with no allocation, and only the guards in
    // `phaseSpans` and `unseatedPhases` keep it out.
    const r2 = all.schedule[V80]
    expect([r2.de_round_of_16_start, r2.de_round_of_16_end]).toEqual([575, 575])
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
