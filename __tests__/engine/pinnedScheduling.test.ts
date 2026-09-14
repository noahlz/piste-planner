/**
 * Red tests for 013 T033 — pinned scheduling (dispatch A).
 *
 * `scheduleAll` does not take a third argument yet (contract
 * `phase6-contract.md` §1, §3, §6, engine-contract.md, research.md D1). Every
 * call below goes through `scheduleAllWithPins`, a cast over the two-arg
 * export, with a local `PinnedPlacement` mirroring the contract's shape.
 * T034 re-points the cast at the real export once the parameter exists.
 *
 * Every pin's `start_time` is computed on the scheduler axis exactly as the
 * contract requires: `dayStart(day, config) + offset`, never a raw clock
 * time. `dayStart` falls through to `d * config.DAY_LENGTH_MINS` here because
 * `tournamentConfig` (via `makeConfig`) leaves `dayConfigs` empty — the same
 * axis the drift ledger and `stripSearch.test.ts` fixtures run on.
 *
 * Every fixture number in a comment below is [M] measured directly against
 * this worktree (baseline commit 71180db6e7), never predicted by hand.
 */
import { describe, it, expect } from 'vitest'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { buildConstraintGraph } from '../../src/engine/constraintGraph.ts'
import { computeStripCap } from '../../src/engine/stripBudget.ts'
import { dayStart, BottleneckSeverity, Phase } from '../../src/engine/types.ts'
import type { Competition, TournamentConfig, PinnedPlacement } from '../../src/engine/types.ts'
import { buildCompetitions, tournamentConfig, SCENARIOS, SCENARIO_IDS } from '../helpers/scenarios.ts'
import type { ScenarioId } from '../helpers/scenarios.ts'

// T034 re-pointed this at the real export: `PinnedPlacement` is imported from
// `src/engine/types.ts` above and `scheduleAll` takes the third argument for
// real, so the local interface and the cast the red version needed are gone.
// The alias name is kept so every call site below reads as it did.
const scheduleAllWithPins = scheduleAll

/** B1: 24 events, 4 days, 80 strips (12 video) — the ledger's cheapest fixture. */
function b1(): { comps: Competition[], config: TournamentConfig } {
  return {
    comps: buildCompetitions(SCENARIOS.B1.fencerCounts),
    config: tournamentConfig(4, 80, 12, SCENARIOS.B1.tournamentType),
  }
}

describe('pinned scheduling (T033)', () => {
  it('case 1: six pins across three days hold exactly; the other eighteen still place', () => {
    const { comps, config } = b1()

    // Six real B1 ids at varied days/offsets; two on day 0 at different hours
    // (offset 60 vs 300). Targets deliberately differ from each id's natural
    // placement [M] (e.g. D1-M-EPEE-IND naturally lands day 0 / pool_start 0),
    // so a pass here can only mean the pin was honored, not a coincidence.
    const pins: PinnedPlacement[] = [
      { competition_id: 'D1-M-EPEE-IND', day: 0, start_time: dayStart(0, config) + 60, strip_count: 4 },
      { competition_id: 'D1-W-SABRE-IND', day: 0, start_time: dayStart(0, config) + 300, strip_count: 4 },
      { competition_id: 'D1-M-FOIL-IND', day: 1, start_time: dayStart(1, config) + 0, strip_count: 4 },
      { competition_id: 'VET-M-FOIL-TEAM', day: 1, start_time: dayStart(1, config) + 180, strip_count: 4 },
      { competition_id: 'JR-M-EPEE-IND', day: 2, start_time: dayStart(2, config) + 0, strip_count: 4 },
      { competition_id: 'JR-W-EPEE-IND', day: 2, start_time: dayStart(2, config) + 240, strip_count: 4 },
    ]

    const result = scheduleAllWithPins(comps, config, pins)

    for (const pin of pins) {
      const sr = result.schedule[pin.competition_id]
      expect(sr, pin.competition_id).toBeDefined()
      expect(sr.assigned_day, `${pin.competition_id} day`).toBe(pin.day)
      expect(sr.pool_start, `${pin.competition_id} pool_start`).toBe(pin.start_time)
    }

    const pinnedIds = new Set(pins.map(p => p.competition_id))
    const others = comps.filter(c => !pinnedIds.has(c.id))
    expect(others.length).toBe(18) // [M] B1 has 24 competitions total
    for (const c of others) {
      expect(result.schedule[c.id]?.pool_start, c.id).not.toBeNull()
    }
  })

  it('case 2: a hard-edge neighbour is kept off the pinned day, or the crossover is reported', () => {
    const { comps, config } = b1()

    // [M] buildConstraintGraph(comps) carries an Infinity edge between
    // D1-M-EPEE-IND and JR-M-EPEE-IND: both are Men's Epee individual events,
    // one Division 1 and one Junior — a GROUP_1_MANDATORY same-population
    // pair (constants.ts), which crossoverPenalty returns as Infinity before
    // buildConstraintGraph ever reaches the (irrelevant, since same
    // event_type) INDIV_TEAM_RELAXABLE_BLOCKS check.
    const graph = buildConstraintGraph(comps)
    const hardEdge = graph.get('D1-M-EPEE-IND')!
      .some(e => e.targetId === 'JR-M-EPEE-IND' && e.weight === Infinity)
    expect(hardEdge, 'fixture sanity: the pair must be hard-linked').toBe(true)

    // [M] Natural (no-pins) run places D1-M-EPEE-IND on day 0 and
    // JR-M-EPEE-IND on day 2. Day 3 is neither, so pinning EPEE to day 3
    // forces a real move rather than confirming a placement it already had.
    const pin: PinnedPlacement = {
      competition_id: 'D1-M-EPEE-IND', day: 3, start_time: dayStart(3, config), strip_count: 30,
    }
    const result = scheduleAllWithPins(comps, config, [pin])

    expect(result.schedule[pin.competition_id].assigned_day).toBe(pin.day)

    const neighbourDay = result.schedule['JR-M-EPEE-IND']?.assigned_day
    const crossoverWarning = result.bottlenecks.some(b =>
      b.severity === BottleneckSeverity.WARN
      && b.cause === 'UNAVOIDABLE_CROSSOVER_CONFLICT'
      && b.message.includes('D1-M-EPEE-IND')
      && b.message.includes('JR-M-EPEE-IND'))
    expect(neighbourDay !== pin.day || crossoverWarning).toBe(true)
  })

  it('case 3: the pool phase claims disjoint strips at exactly the pinned time', () => {
    const { comps, config } = b1()
    const pin: PinnedPlacement = {
      competition_id: 'D1-M-EPEE-IND', day: 0, start_time: dayStart(0, config) + 120, strip_count: 30,
    }
    const result = scheduleAllWithPins(comps, config, [pin])
    const sr = result.schedule[pin.competition_id]
    expect(sr.pool_start, 'pool_start pinned exactly').toBe(pin.start_time)

    const claimingStrips = result.strip_allocations.filter(allocs =>
      allocs.some(a => a.event_id === pin.competition_id && a.phase === Phase.POOLS && a.start_time === pin.start_time))

    expect(claimingStrips.length, 'strips claimed at the pinned time').toBe(sr.pool_strip_count)
    expect(claimingStrips.length).toBeGreaterThan(0)

    for (const allocs of claimingStrips) {
      const pinnedAlloc = allocs.find(a =>
        a.event_id === pin.competition_id && a.phase === Phase.POOLS && a.start_time === pin.start_time)!
      for (const other of allocs) {
        if (other === pinnedAlloc) continue
        const overlaps = other.start_time < pinnedAlloc.end_time && pinnedAlloc.start_time < other.end_time
        expect(overlaps, `${other.event_id}/${other.phase} overlaps the pinned pool on a claimed strip`).toBe(false)
      }
    }
  })

  // Case 4 pins every B1 event from a *different* config's natural
  // placement (4 days / 48 strips / 7 video, tournamentConfig(4, 48, 7, …) —
  // the same board case 5 uses, which places all 24 with zero ERROR
  // bottlenecks [M]), then runs the pinned call at the usual (4, 80, 12)
  // board. Reading the pins off that config's own output rather than the
  // pinned run's own no-pins result means a pass can only mean the pin was
  // honored: 19 of 24 ids land on a different (day, pool_start) pair between
  // the two boards [M], e.g. D1-W-EPEE-IND day 0 / 330 vs day 0 / 0, and
  // D1-W-SABRE-IND day 2 / 1845 vs day 0 / 165. With the third argument
  // discarded this case fails (verified by mutation — see final report).
  it('case 4: every event pinned holds every pin\'s day and start, same scheduled set', () => {
    const { comps, config } = b1()
    const sourceConfig = tournamentConfig(4, 48, 7, SCENARIOS.B1.tournamentType)
    const source = scheduleAll(comps, sourceConfig)

    const pins: PinnedPlacement[] = comps.map((c) => {
      const sr = source.schedule[c.id]
      return {
        competition_id: c.id,
        day: sr.assigned_day,
        start_time: sr.pool_start as number,
        strip_count: sr.pool_strip_count,
      }
    })
    // [M] all 24 B1 events place with a non-null pool_start under (4, 48, 7).
    expect(pins.every(p => p.start_time !== null)).toBe(true)

    const withPins = scheduleAllWithPins(comps, config, pins)
    for (const pin of pins) {
      const sr = withPins.schedule[pin.competition_id]
      expect(sr?.assigned_day, `${pin.competition_id} day`).toBe(pin.day)
      expect(sr?.pool_start, `${pin.competition_id} start`).toBe(pin.start_time)
    }
    // [M] all 24 hold day/start at (4, 80, 12) even though three
    // (JR-W-EPEE-IND POOLS, VET-W-FOIL-IND-VCMB DE, D1-W-FOIL-IND POOLS)
    // carry a PINNED_UNCLAIMED warning — guarantee 1 (day/start from the
    // seed) does not require the phase to have claimed strips.
    expect(new Set(Object.keys(withPins.schedule))).toEqual(new Set(comps.map(c => c.id)))
  })

  it('case 5: two pins whose combined strips exceed the board — the second is PINNED_UNCLAIMED', () => {
    const comps = buildCompetitions(SCENARIOS.B1.fencerCounts)
    // [M] computeStripCap(80, 0.80) = 64 (b1()'s config): no pair of B1's
    // pool phases needs more than 64 strips each, so 80-strip B1 can never
    // show two pins colliding on strip count. Dropping to 48 strips still
    // places all 24 events with zero ERROR bottlenecks [M], and
    // computeStripCap(48, 0.80) = 38 leaves room to force a collision with
    // two pins that individually stay under cap but jointly exceed the board.
    const config = tournamentConfig(4, 48, 7, SCENARIOS.B1.tournamentType)
    expect(computeStripCap(48, config.max_pool_strip_pct)).toBe(38)

    // 30 + 30 = 60 > 48 total strips. Sorted by (day, start, id) —
    // 'D1-M-EPEE-IND' < 'D1-M-FOIL-IND' (E < F) — EPEE is preclaimed first
    // and FOIL is the "second in order" contract §10/§6 predicts a
    // PINNED_UNCLAIMED warning for.
    const pin1: PinnedPlacement = {
      competition_id: 'D1-M-EPEE-IND', day: 0, start_time: dayStart(0, config) + 60, strip_count: 30,
    }
    const pin2: PinnedPlacement = {
      competition_id: 'D1-M-FOIL-IND', day: 0, start_time: dayStart(0, config) + 60, strip_count: 30,
    }
    const result = scheduleAllWithPins(comps, config, [pin1, pin2])

    const sr1 = result.schedule[pin1.competition_id]
    const sr2 = result.schedule[pin2.competition_id]
    expect(sr1.assigned_day, 'pin1 day').toBe(pin1.day)
    expect(sr1.pool_start, 'pin1 start').toBe(pin1.start_time)
    expect(sr2.assigned_day, 'pin2 day').toBe(pin2.day)
    expect(sr2.pool_start, 'pin2 start').toBe(pin2.start_time)

    // One WARN per phase node that could not claim, not one per pin: the engine
    // contract's item 4 and phase6-contract §6 both scope the warning to the
    // phase. So this reads the POOLS row specifically rather than counting every
    // row the pin carries.
    const warnsFor = (id: string) => result.bottlenecks.filter(b =>
      b.competition_id === id && b.severity === BottleneckSeverity.WARN && b.cause === 'PINNED_UNCLAIMED')

    // The earlier pin in (day, start, id) order — 'D1-M-EPEE-IND' <
    // 'D1-M-FOIL-IND' — preclaims first and gets its pools.
    expect(warnsFor(pin1.competition_id).filter(b => b.phase === Phase.POOLS)).toEqual([])

    const pin2Warns = warnsFor(pin2.competition_id)
    const pin2PoolWarns = pin2Warns.filter(b => b.phase === Phase.POOLS)
    expect(pin2PoolWarns).toHaveLength(1)
    expect(pin2PoolWarns[0].message).toContain(pin2.competition_id)
    expect(pin2PoolWarns[0].message).toContain(Phase.POOLS)

    // [M] measured, not predicted: the second pin carries a further
    // PINNED_UNCLAIMED on DE_ROUND_OF_16, and it is an independent collision on
    // *video* strips rather than a restatement of the pools one. Both events are
    // Division 1, so both carry a REQUIRED DE video policy and a 4-strip round
    // of 16, and this board has 7 video strips. EPEE's R16 holds video strips
    // 0-3 over 635-695 while FOIL's R16 wants 4 video strips over 585-645; the
    // windows overlap on 635-645, where only 3 video strips are left. 4 + 4 > 7.
    //
    // Asserted on shape rather than on that exact list, so a fixture whose DE
    // phases happen to fit still passes: every row names a distinct phase, so no
    // phase is ever reported twice and the pools row above is never one of a pair.
    expect(new Set(pin2Warns.map(b => b.phase)).size).toBe(pin2Warns.length)
    for (const warn of pin2Warns) {
      expect(warn.message).toContain(pin2.competition_id)
      expect(warn.message).toContain(warn.phase)
    }

    // Board not emptied. [M] At (4, 48, 7) with no pins, day 0 carries
    // D1-M-EPEE-IND, D1-W-EPEE-IND, VET-M-SABRE-IND-VCMB and
    // VET-W-SABRE-TEAM (4 events); the three not pinned here must still show
    // a pool start.
    const others = Object.keys(result.schedule)
      .filter(id => id !== pin1.competition_id && id !== pin2.competition_id)
    const day0OthersPlaced = others.filter(id =>
      result.schedule[id].assigned_day === 0 && result.schedule[id].pool_start !== null)
    expect(day0OthersPlaced.length).toBeGreaterThanOrEqual(1)
  })

  it('case 6: the no-pins path is byte-identical to scheduleAll on every B1-B8 scenario', () => {
    for (const id of SCENARIO_IDS as readonly ScenarioId[]) {
      const fixture = SCENARIOS[id]
      const comps = buildCompetitions(fixture.fencerCounts)
      const config = tournamentConfig(fixture.days, fixture.strips, fixture.videoStrips, fixture.tournamentType)
      expect(scheduleAllWithPins(comps, config, []), id).toEqual(scheduleAll(comps, config))
    }
  })

  // Case 7 reuses case 1's six pins, which already diverge from B1's
  // natural placement, so a pass cannot come from the ignored-argument path:
  // it asserts the pins actually landed at their day/start in the first
  // result (case 1 already proves that; re-asserting it here is what makes
  // this case's own pass meaningful) and only then that two calls with the
  // same pins agree.
  it('case 7: two calls with the same pins return equal results', () => {
    const { comps, config } = b1()
    const pins: PinnedPlacement[] = [
      { competition_id: 'D1-M-EPEE-IND', day: 0, start_time: dayStart(0, config) + 60, strip_count: 4 },
      { competition_id: 'D1-W-SABRE-IND', day: 0, start_time: dayStart(0, config) + 300, strip_count: 4 },
      { competition_id: 'D1-M-FOIL-IND', day: 1, start_time: dayStart(1, config) + 0, strip_count: 4 },
      { competition_id: 'VET-M-FOIL-TEAM', day: 1, start_time: dayStart(1, config) + 180, strip_count: 4 },
      { competition_id: 'JR-M-EPEE-IND', day: 2, start_time: dayStart(2, config) + 0, strip_count: 4 },
      { competition_id: 'JR-W-EPEE-IND', day: 2, start_time: dayStart(2, config) + 240, strip_count: 4 },
    ]
    const first = scheduleAllWithPins(comps, config, pins)
    for (const pin of pins) {
      const sr = first.schedule[pin.competition_id]
      expect(sr.assigned_day, `${pin.competition_id} day`).toBe(pin.day)
      expect(sr.pool_start, `${pin.competition_id} start`).toBe(pin.start_time)
    }

    const second = scheduleAllWithPins(comps, config, pins)
    expect(second).toEqual(first)
  })
})
