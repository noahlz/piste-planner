/**
 * The kept run (017 T2): what `keepRun` records of a `scheduleAll` result, and
 * the key that says whether it still applies. Every case reads the engine's own
 * allocations independently of `keepRun`, so the record is checked against the
 * scheduler and not against itself.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildTournamentConfig, buildPinnedPlacements } from '../../src/store/buildConfig.ts'
import {
  configKeyOf,
  keepRun,
  resultOnClockAxis,
  type KeptRun,
} from '../../src/store/keptRun.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { deriveEventSchedule } from '../../src/engine/derive.ts'
import { phaseSpans, phaseKey, unseatedPhases } from '../../src/engine/unseated.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { SCENARIO_IDS, type ScenarioId } from '../../src/data/tournaments.ts'
import { DAY_AXIS_SPACING_MINS, Phase, VideoPolicy } from '../../src/engine/types.ts'
import type { Competition, ScheduleResult, TournamentConfig } from '../../src/engine/types.ts'
import { makeScheduleResult } from '../helpers/factories.ts'
import { loadFlightedFixture } from '../helpers/flightedFixtures.ts'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

/** The engine on the store's current board with the store's current pins, as `runScheduleAll` calls it. */
function engineRun() {
  const state = useStore.getState()
  const { config, competitions } = buildTournamentConfig(state)
  const pins = buildPinnedPlacements(state)
  return { config, competitions, pins, run: scheduleAll(competitions, config, pins) }
}

const scenario = (id: ScenarioId) => () => applyPreset(id)
const template = (name: string) => () => {
  applyPreset('B1')
  useStore.getState().applyTemplate(name)
}

function pinAll(): void {
  for (const id of Object.keys(useStore.getState().placements)) useStore.getState().setPinned(id, true)
}

/** The kept run of the board's last `runScheduleAll`, which must exist. */
function keptRunOfStore(): KeptRun {
  const kept = useStore.getState().lastRun
  expect(kept, 'runScheduleAll kept the run').not.toBeNull()
  return kept as KeptRun
}

const allKeptPhases = (kept: KeptRun) =>
  Object.entries(kept.events).flatMap(([id, e]) => e.phases.map(p => ({ id, ...p })))

describe('resultOnClockAxis', () => {
  it('takes the day offset off every time field and leaves the rest alone', () => {
    const day = 2
    const off = day * DAY_AXIS_SPACING_MINS
    const result: ScheduleResult = {
      ...makeScheduleResult('X', day),
      pool_start: off + 600, pool_end: off + 700, pool_strip_count: 4,
      flight_a_start: off + 610, flight_a_end: off + 650,
      flight_b_start: off + 660, flight_b_end: off + 700,
      de_start: off + 720, de_end: off + 800,
      de_prelims_start: off + 810, de_prelims_end: off + 850,
      de_round_of_16_start: off + 860, de_round_of_16_end: off + 900,
      de_total_end: off + 950,
      pool_duration_actual: 100,
    }
    const shifted = resultOnClockAxis(result)
    expect([shifted.pool_start, shifted.pool_end]).toEqual([600, 700])
    expect([shifted.flight_a_start, shifted.flight_a_end]).toEqual([610, 650])
    expect([shifted.flight_b_start, shifted.flight_b_end]).toEqual([660, 700])
    expect([shifted.de_start, shifted.de_end]).toEqual([720, 800])
    expect([shifted.de_prelims_start, shifted.de_prelims_end]).toEqual([810, 850])
    expect([shifted.de_round_of_16_start, shifted.de_round_of_16_end]).toEqual([860, 900])
    expect(shifted.de_total_end).toBe(950)
    expect(shifted.pool_duration_actual).toBe(100)
    expect(shifted.pool_strip_count).toBe(4)
    expect(shifted.assigned_day).toBe(day)
  })

  it('keeps a null time null', () => {
    const shifted = resultOnClockAxis({ ...makeScheduleResult('X', 1), pool_start: DAY_AXIS_SPACING_MINS + 600 })
    expect(shifted.pool_start).toBe(600)
    expect(shifted.pool_end).toBeNull()
    expect(shifted.de_total_end).toBeNull()
  })

  it('does not mutate its input', () => {
    const result = { ...makeScheduleResult('X', 1), pool_start: DAY_AXIS_SPACING_MINS + 600 }
    resultOnClockAxis(result)
    expect(result.pool_start).toBe(DAY_AXIS_SPACING_MINS + 600)
  })
})

describe('keepRun against the scheduler\'s own allocations', () => {
  /**
   * Every invariant the spec's boot conditions put on a kept run, read off the
   * engine's `strip_allocations` by a route that never calls `keepRun`.
   */
  function expectKeptRunMatchesEngine(label: string, setup: () => void): number {
    useStore.setState(useStore.getInitialState(), true)
    setup()
    runScheduleAll()
    const kept = keptRunOfStore()
    const { config, competitions, run } = engineRun()
    const byId = new Map(competitions.map(c => [c.id, c]))

    // (event, phase) -> strip index -> intervals, on the scheduler axis.
    const allocated = new Map<string, Map<number, { start: number; end: number }[]>>()
    run.strip_allocations.forEach((strip, index) => {
      for (const a of strip) {
        const key = phaseKey(a.event_id, a.phase)
        if (!allocated.has(key)) allocated.set(key, new Map())
        const perStrip = allocated.get(key)!
        perStrip.set(index, [...(perStrip.get(index) ?? []), { start: a.start_time, end: a.end_time }])
      }
    })

    let phaseCount = 0
    const occupied = new Map<string, { start: number; end: number; who: string }[]>()
    for (const [id, result] of Object.entries(run.schedule)) {
      if (result.pool_start === null) {
        expect(kept.events[id], `${label} ${id}: unscheduled event is not kept`).toBeUndefined()
        continue
      }
      const event = kept.events[id]
      expect(event, `${label} ${id}: kept`).toBeDefined()
      const spans = phaseSpans(result)
      const offset = result.assigned_day * DAY_AXIS_SPACING_MINS
      // The kept phases are exactly the engine's, in drawing order, on the clock axis.
      expect(event.phases.map(p => p.phase), `${label} ${id}`).toEqual(spans.map(s => s.phase))
      event.phases.forEach((phase, i) => {
        phaseCount += 1
        const span = spans[i]
        expect([phase.startMinutes, phase.endMinutes], `${label} ${id} ${phase.phase}`)
          .toEqual([span.start - offset, span.end - offset])
        expect(phase.stripCount, `${label} ${id} ${phase.phase}`).toBe(span.stripCount)

        const perStrip = allocated.get(phaseKey(id, phase.phase))
        const indices = [...(perStrip?.keys() ?? [])].sort((a, b) => a - b)
        expect([...phase.strips], `${label} ${id} ${phase.phase} strips`).toEqual(indices)
        expect(phase.strips.length, `${label} ${id} ${phase.phase} count`).toBe(phase.stripCount)
        for (const intervals of perStrip?.values() ?? []) {
          for (const interval of intervals) {
            expect([interval.start, interval.end]).toEqual([span.start, span.end])
          }
        }
        // No two phases share a strip index on one day at overlapping minutes.
        for (const strip of phase.strips) {
          const slot = `${result.assigned_day}:${strip}`
          for (const other of occupied.get(slot) ?? []) {
            const overlaps = phase.startMinutes < other.end && other.start < phase.endMinutes
            expect(overlaps, `${label} strip ${strip} day ${result.assigned_day}: ${id} ${phase.phase} vs ${other.who}`).toBe(false)
          }
          occupied.set(slot, [
            ...(occupied.get(slot) ?? []),
            { start: phase.startMinutes, end: phase.endMinutes, who: `${id} ${phase.phase}` },
          ])
        }
        // A phase that must run on video strips holds only video strips.
        const competition = byId.get(id) as Competition
        if (phase.phase === Phase.DE_ROUND_OF_16 && competition.de_video_policy === VideoPolicy.REQUIRED) {
          for (const strip of phase.strips) {
            expect(config.strips[strip].video_capable, `${label} ${id} r16 strip ${strip}`).toBe(true)
          }
        }
      })
    }
    // Total phases kept equals total phases the engine timed (so none lost or invented).
    const enumerated = Object.values(run.schedule).reduce(
      (n, r) => n + (r.pool_start === null ? 0 : phaseSpans(r).length), 0,
    )
    expect(phaseCount, label).toBe(enumerated)
    return phaseCount
  }

  it.each(SCENARIO_IDS)('%s: kept phases are the allocation intervals, strips and counts', (id) => {
    const count = expectKeptRunMatchesEngine(id, scenario(id))
    expect(count).toBeGreaterThan(0)
  })

  it('keeps every phase of the 10 templates the same way', () => {
    const names = Object.keys(TEMPLATES)
    expect(names).toHaveLength(10)
    for (const name of names) {
      expect(expectKeptRunMatchesEngine(name, template(name)), name).toBeGreaterThan(0)
    }
  })

  it('B8: keeps 148 phases and does not keep VET-W-SABRE-IND-V80\'s zero-length round of 16', () => {
    expect(expectKeptRunMatchesEngine('B8', scenario('B8'))).toBe(148)
    const v80 = keptRunOfStore().events['VET-W-SABRE-IND-V80']
    expect(v80).toBeDefined()
    expect(v80.phases.map(p => p.phase)).not.toContain(Phase.DE_ROUND_OF_16)
    // Premise: the engine did time it, at zero length.
    const { run } = engineRun()
    expect(run.schedule['VET-W-SABRE-IND-V80'].de_round_of_16_start)
      .toBe(run.schedule['VET-W-SABRE-IND-V80'].de_round_of_16_end)
  })

  it('does not throw on a zero-length phase with no allocation', () => {
    applyPreset('B8')
    const { config, competitions, run, pins } = engineRun()
    expect(() => keepRun(run, config, competitions, pins)).not.toThrow()
  })

  it('B1: kept strips of a day-1 phase use that day\'s own clock minutes, not the scheduler axis', () => {
    applyPreset('B1')
    runScheduleAll()
    const phases = allKeptPhases(keptRunOfStore())
    expect(phases.length).toBeGreaterThan(0)
    for (const phase of phases) {
      expect(phase.startMinutes).toBeLessThan(DAY_AXIS_SPACING_MINS)
      expect(phase.endMinutes).toBeGreaterThan(phase.startMinutes)
    }
  })

  it('stores each event\'s result on the clock axis', () => {
    applyPreset('B1')
    runScheduleAll()
    const kept = keptRunOfStore()
    const { run } = engineRun()
    for (const [id, event] of Object.entries(kept.events)) {
      expect(event.result).toEqual(resultOnClockAxis(run.schedule[id]))
    }
  })
})

describe('keepRun with pins', () => {
  /** B1 run once, every event pinned in place, the strip count of one pin raised past what its event can use. */
  function pinAllWithOversizedPin(): { oversizedId: string } {
    applyPreset('B1')
    runScheduleAll()
    const [oversizedId] = Object.keys(useStore.getState().placements)
    pinAll()
    useStore.getState().updatePlacement(oversizedId, { strip_count: 40 })
    return { oversizedId }
  }

  it('records a pinned event\'s key as the pin itself, so it equals the store placement after the run', () => {
    applyPreset('B1')
    runScheduleAll()
    pinAll()
    runScheduleAll()
    const kept = keptRunOfStore()
    for (const [id, placement] of Object.entries(useStore.getState().placements)) {
      expect(kept.events[id]?.placementKey, id).toEqual({
        day: placement.day,
        start_time: placement.start_time,
        strip_count: placement.strip_count,
      })
    }
  })

  it('keeps the pin a run was given in `pins`, on the scheduler axis', () => {
    applyPreset('B1')
    runScheduleAll()
    pinAll()
    const given = buildPinnedPlacements(useStore.getState())
    expect(given.length).toBeGreaterThan(0)
    runScheduleAll()
    expect(keptRunOfStore().pins).toEqual(given)
  })

  it('holds a pin whose strip count is above the engine\'s cap to the pin\'s own key', () => {
    const { oversizedId } = pinAllWithOversizedPin()
    runScheduleAll()
    const placement = useStore.getState().placements[oversizedId]
    expect(placement.strip_count, 'premise: the store keeps the oversized pin').toBe(40)
    const event = keptRunOfStore().events[oversizedId]
    expect(event.result.pool_strip_count, 'premise: the engine capped the pool strips below the pin')
      .toBeLessThan(40)
    expect(event.placementKey).toEqual({
      day: placement.day, start_time: placement.start_time, strip_count: 40,
    })
  })

  it.each(SCENARIO_IDS)('%s: a pinned event\'s result phase times equal deriveEventSchedule\'s', (id) => {
    applyPreset(id)
    runScheduleAll()
    pinAll()
    runScheduleAll()
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const byId = new Map(competitions.map(c => [c.id, c]))
    const kept = keptRunOfStore()
    // Only the pins: an event the first run left out (B4, B6) is placed by this
    // run and unpinned, so its times are the scheduler's and may wait for strips.
    const pinned = Object.entries(kept.events).filter(([eventId]) => state.placements[eventId].pinned)
    expect(pinned.length).toBeGreaterThan(0)
    for (const [eventId, event] of pinned) {
      const derived = deriveEventSchedule(state.placements[eventId], byId.get(eventId) as Competition, config).result
      const times = (r: ScheduleResult) => phaseSpans(r).map(s => [s.phase, s.start, s.end])
      expect(times(event.result), `${id} ${eventId}`).toEqual(times(derived))
    }
  })

  it('leaves a phase the engine could not seat in the record with no strips', () => {
    applyPreset('B1')
    runScheduleAll()
    pinAll()
    runScheduleAll()
    const { run } = engineRun()
    const unseated = unseatedPhases(run)
    expect(unseated.size, 'premise: a pin-all re-run leaves phases unseated').toBeGreaterThan(0)
    const kept = keptRunOfStore()
    for (const key of unseated) {
      const [id, phase] = key.split('|')
      const keptPhase = kept.events[id].phases.find(p => p.phase === phase)
      expect(keptPhase, key).toBeDefined()
      expect(keptPhase?.strips, key).toEqual([])
    }
  })
})

describe('keepRun on flighted events', () => {
  it('keeps FLIGHT_A and FLIGHT_B of a many-pools event as separate phases', () => {
    const id = loadFlightedFixture('MANY_POOLS')
    runScheduleAll()
    const event = keptRunOfStore().events[id]
    const phases = event.phases.map(p => p.phase)
    expect(phases.slice(0, 2)).toEqual([Phase.FLIGHT_A, Phase.FLIGHT_B])
    expect(phases).not.toContain(Phase.POOLS)
    const [a, b] = event.phases
    expect(a.strips.length).toBeGreaterThan(0)
    expect(b.strips.length).toBeGreaterThan(0)
    expect(b.startMinutes).toBeGreaterThan(a.endMinutes)
  })

  it('does not keep the empty FLIGHT_B of a one-pool event', () => {
    const id = loadFlightedFixture('ONE_POOL')
    runScheduleAll()
    const phases = keptRunOfStore().events[id].phases.map(p => p.phase)
    expect(phases).toContain(Phase.FLIGHT_A)
    expect(phases).not.toContain(Phase.FLIGHT_B)
  })
})

describe('configKeyOf', () => {
  /** The config and competitions the store builds for B1, fresh each call. */
  const inputs = () => {
    useStore.setState(useStore.getInitialState(), true)
    applyPreset('B1')
    return buildTournamentConfig(useStore.getState())
  }

  /** A value that differs from `value` whatever its type. */
  function perturb(value: unknown): unknown {
    if (typeof value === 'number') return Number.isFinite(value) ? value + 1 : 7
    if (typeof value === 'string') return `${value}!`
    if (typeof value === 'boolean') return !value
    if (value === null) return 0
    if (Array.isArray(value)) return [...value, 'extra']
    return { ...(value as object), extra: 1 }
  }

  it('is equal for equal inputs built twice', () => {
    const first = inputs()
    const second = inputs()
    expect(configKeyOf(first.config, first.competitions))
      .toBe(configKeyOf(second.config, second.competitions))
  })

  it('is a non-empty string', () => {
    const { config, competitions } = inputs()
    expect(configKeyOf(config, competitions).length).toBeGreaterThan(0)
  })

  it('does not depend on the order object keys were written in', () => {
    const { config, competitions } = inputs()
    const reversed = (o: object) => Object.fromEntries(Object.entries(o).reverse())
    expect(configKeyOf(reversed(config) as TournamentConfig, competitions.map(reversed) as Competition[]))
      .toBe(configKeyOf(config, competitions))
  })

  const configFields = Object.keys(inputs().config)
  const competitionFields = Object.keys(inputs().competitions[0])

  it.each(configFields)('differs when config.%s changes', (field) => {
    const { config, competitions } = inputs()
    const before = configKeyOf(config, competitions)
    const changed = { ...config, [field]: perturb((config as unknown as Record<string, unknown>)[field]) }
    expect(configKeyOf(changed as TournamentConfig, competitions)).not.toBe(before)
  })

  it.each(competitionFields)('differs when a competition\'s %s changes', (field) => {
    const { config, competitions } = inputs()
    const before = configKeyOf(config, competitions)
    const [first, ...rest] = competitions
    const changed = { ...first, [field]: perturb((first as unknown as Record<string, unknown>)[field]) }
    expect(configKeyOf(config, [changed as Competition, ...rest])).not.toBe(before)
  })

  it('differs when a value deep inside a nested field changes', () => {
    const { config, competitions } = inputs()
    const before = configKeyOf(config, competitions)
    const dayConfigs = config.dayConfigs.map((d, i) => (i === 0 ? { ...d, day_hard_end_time: d.day_hard_end_time + 1 } : d))
    const table = { ...config.pool_round_duration_table, EPEE: config.pool_round_duration_table.EPEE + 1 }
    const strips = config.strips.map((s, i) => (i === 0 ? { ...s, video_capable: !s.video_capable } : s))
    for (const changed of [{ dayConfigs }, { pool_round_duration_table: table }, { strips }]) {
      expect(configKeyOf({ ...config, ...changed } as TournamentConfig, competitions)).not.toBe(before)
    }
  })

  it('differs when the competition list is reordered', () => {
    const { config, competitions } = inputs()
    expect(competitions.length).toBeGreaterThan(1)
    const swapped = [competitions[1], competitions[0], ...competitions.slice(2)]
    expect(configKeyOf(config, swapped)).not.toBe(configKeyOf(config, competitions))
  })

  it('differs when a competition is dropped', () => {
    const { config, competitions } = inputs()
    expect(configKeyOf(config, competitions.slice(1))).not.toBe(configKeyOf(config, competitions))
  })

  it('tells Infinity, -Infinity, NaN and null apart, in every Competition\'s latest_end', () => {
    const { config, competitions } = inputs()
    const withLatestEnd = (value: number | null) =>
      configKeyOf(config, competitions.map(c => ({ ...c, latest_end: value as number })))
    expect(competitions[0].latest_end, 'premise: the store builds an infinite latest_end').toBe(Infinity)
    const keys = [Infinity, -Infinity, NaN, null].map(withLatestEnd)
    expect(new Set(keys).size).toBe(4)
    // And it still tells a finite number from each of them.
    expect(keys).not.toContain(withLatestEnd(1440))
  })

  it('tells the number 1 from the string "1"', () => {
    const { config, competitions } = inputs()
    const withDays = (value: unknown) => configKeyOf({ ...config, days_available: value as number }, competitions)
    expect(withDays(1)).not.toBe(withDays('1'))
  })
})
