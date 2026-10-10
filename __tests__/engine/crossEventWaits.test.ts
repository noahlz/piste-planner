import { describe, it, expect } from 'vitest'
import { scheduleAllConcurrent } from '../../src/engine/concurrentScheduler.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import {
  assertAcyclicWaits,
  assertEveryEventResolved,
  passOverFailed,
  PredecessorState,
  resolveWaits,
  WaitAnchor,
} from '../../src/engine/crossEventWaits.ts'
import type { CrossEventWait, PredecessorStatus } from '../../src/engine/crossEventWaits.ts'
import { snapToSlot } from '../../src/engine/resources.ts'
import {
  BottleneckRule,
  BottleneckSeverity,
  Category,
  CutMode,
  DeMode,
  EventType,
  Gender,
  RefPolicy,
  TournamentType,
  VetAgeGroup,
  VideoPolicy,
  Weapon,
  dayStart,
} from '../../src/engine/types.ts'
import type { Bottleneck, Competition, PinnedPlacement, ScheduleResult, TournamentConfig } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { checkInvariants } from '../helpers/bottleneckInvariants.ts'
import { SCENARIOS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'

// The cross-event waits of METHODOLOGY §Cross-Event Dependency Edges (021 T6a,
// owner rulings O1 and O8): a younger Vet band's pools wait for the next-older
// present band's pools to start + 60 minutes, a team's pools wait for its
// individual counterpart's last phase to end + 120 minutes, and a wait on an
// event that is never placed is owed as if that event did not exist.
//
// The two gaps are written here as literals (60 – Appendix A "Vet co-day
// stagger", 120 – INDIV_TEAM_MIN_GAP_MINS) rather than read from the engine, so
// a change to either value fails these tests instead of following it.

/** Oldest first, the order the stagger runs in. */
const BANDS_OLDEST_FIRST = [
  VetAgeGroup.VET80,
  VetAgeGroup.VET70,
  VetAgeGroup.VET60,
  VetAgeGroup.VET50,
  VetAgeGroup.VET40,
] as const

/** A small men's épée event on single-stage DEs, so only a wait moves its start. */
function event(id: string, overrides: Partial<Competition> = {}): Competition {
  return makeCompetition({
    id,
    gender: Gender.MEN,
    weapon: Weapon.EPEE,
    fencer_count: 14,
    ref_policy: RefPolicy.ONE,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    de_mode: DeMode.SINGLE_STAGE,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    ...overrides,
  })
}

function vet(band: VetAgeGroup, overrides: Partial<Competition> = {}): Competition {
  return event(`v-${band}`, { category: Category.VETERAN, vet_age_group: band, ...overrides })
}

/**
 * Div 1 men's foil individual and team. On one day they share it through the
 * least-bad fallback.
 */
function pair(indOverrides: Partial<Competition> = {}): Competition[] {
  return [
    event('d1-ind', { category: Category.DIV1, weapon: Weapon.FOIL, ...indOverrides }),
    event('d1-team', { category: Category.DIV1, weapon: Weapon.FOIL, event_type: EventType.TEAM, fencer_count: 8 }),
  ]
}

/** One day on ample strips, so strip contention never delays a start. */
function oneDay(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return makeConfig({
    tournament_type: TournamentType.NAC,
    days_available: 1,
    strips: makeStrips(40, 0),
    max_pool_strip_pct: 1.0,
    max_de_strip_pct: 1.0,
    ...overrides,
  })
}

function placed(result: ReturnType<typeof scheduleAllConcurrent>, id: string): ScheduleResult {
  const r = result.schedule[id]
  expect(r, `${id} is placed`).toBeDefined()
  return r!
}

function poolStart(result: ReturnType<typeof scheduleAllConcurrent>, id: string): number {
  const start = placed(result, id).pool_start
  expect(start, `${id} pool start`).not.toBeNull()
  return start!
}

/** The end of an event's last phase: the single-stage DE, or the staged DE's R16. */
function lastPhaseEnd(r: ScheduleResult): number {
  const end = r.de_end ?? r.de_round_of_16_end
  expect(end, `${r.competition_id} last phase end`).not.toBeNull()
  return end!
}

function dependencyDelays(bottlenecks: Bottleneck[]): Bottleneck[] {
  return bottlenecks.filter(b => b.rule === BottleneckRule.CROSS_EVENT_DEPENDENCY_DELAY)
}

/** A latest end no phase can meet, so both attempts fail and the event is never placed. */
function unplaceable(config: TournamentConfig): Partial<Competition> {
  return { latest_end: dayStart(0, config) + 10 }
}

describe('the Vet co-day stagger binds', () => {
  it('starts each younger band exactly 60 minutes after the next-older band, not after it finishes', () => {
    const config = oneDay()
    const ds = dayStart(0, config)
    const result = scheduleAllConcurrent(BANDS_OLDEST_FIRST.map(b => vet(b)), config)

    BANDS_OLDEST_FIRST.forEach((band, i) => {
      expect(poolStart(result, `v-${band}`), band).toBe(ds + i * 60)
    })
    // Strict end-to-end serialization would start Vet 70 after Vet 80's last phase.
    expect(poolStart(result, 'v-VET70')).toBeLessThan(lastPhaseEnd(placed(result, 'v-VET80')))
  })

  it('anchors on a flighted older band\'s Flight A start, not its last phase end', () => {
    const config = oneDay()
    // 28 fencers make four pools of seven, two per flight.
    const result = scheduleAllConcurrent(
      [vet(VetAgeGroup.VET80, { flighted: true, fencer_count: 28 }), vet(VetAgeGroup.VET70)],
      config,
    )

    const flightAStart = placed(result, 'v-VET80').flight_a_start
    expect(flightAStart).not.toBeNull()
    expect(poolStart(result, 'v-VET70')).toBe(flightAStart! + 60)
  })

  it('makes a band wait on the next-older band present when the one between is absent', () => {
    const config = oneDay()
    const ds = dayStart(0, config)
    const result = scheduleAllConcurrent([vet(VetAgeGroup.VET80), vet(VetAgeGroup.VET60)], config)

    expect(poolStart(result, 'v-VET80')).toBe(ds)
    expect(poolStart(result, 'v-VET60')).toBe(ds + 60)
  })

  it('orders a larger younger band that the loop would otherwise pick first', () => {
    // At one ready time the comparator takes the larger strip ask first, so
    // without the hold Vet 50 (9 pools) is popped before Vet 60 (2 pools).
    const config = oneDay()
    const result = scheduleAllConcurrent(
      [vet(VetAgeGroup.VET60, { fencer_count: 10 }), vet(VetAgeGroup.VET50, { fencer_count: 60 })],
      config,
    )

    expect(poolStart(result, 'v-VET50')).toBe(poolStart(result, 'v-VET60') + 60)
  })

  it('anchors on an older band\'s actual start when contention delays it', () => {
    // A 56-fencer Y10 event fills the 8 strips first (Y8/Y10 win a tie on ready
    // time), so Vet 80 starts late, and Vet 70 follows its real start.
    const config = oneDay({ strips: makeStrips(8, 0) })
    const ds = dayStart(0, config)
    const result = scheduleAllConcurrent(
      [
        event('y10', { category: Category.Y10, gender: Gender.WOMEN, fencer_count: 56 }),
        vet(VetAgeGroup.VET80),
        vet(VetAgeGroup.VET70),
      ],
      config,
    )

    const olderStart = poolStart(result, 'v-VET80')
    expect(olderStart).toBeGreaterThan(ds)
    expect(poolStart(result, 'v-VET70')).toBe(olderStart + 60)
  })

  it('takes its floor from a pinned older band at seeding', () => {
    const config = oneDay()
    const pinStart = dayStart(0, config) + 30
    const pin: PinnedPlacement = { competition_id: 'v-VET80', day: 0, start_time: pinStart, strip_count: 2 }
    const result = scheduleAllConcurrent([vet(VetAgeGroup.VET80), vet(VetAgeGroup.VET70)], config, [pin])

    expect(poolStart(result, 'v-VET70')).toBe(pinStart + 60)
  })

  it('gives a band no wait on an older band that validation excluded', () => {
    // A one-fencer event is dropped before the loop, so it is never a predecessor.
    const config = oneDay()
    const result = scheduleAllConcurrent(
      [vet(VetAgeGroup.VET80, { fencer_count: 1 }), vet(VetAgeGroup.VET70)],
      config,
    )

    expect(result.schedule['v-VET80']).toBeUndefined()
    expect(poolStart(result, 'v-VET70')).toBe(dayStart(0, config))
    expect(dependencyDelays(result.bottlenecks)).toEqual([])
  })

  it('emits one dependency INFO per pushed band, with delay_mins equal to the push', () => {
    const config = oneDay()
    const ds = dayStart(0, config)
    const competitions = BANDS_OLDEST_FIRST.map(b => vet(b))
    const result = scheduleAllConcurrent(competitions, config)

    const delays = dependencyDelays(result.bottlenecks)
    expect(delays.map(b => [b.competition_id, b.delay_mins])).toEqual(
      BANDS_OLDEST_FIRST.slice(1).map(band => [`v-${band}`, poolStart(result, `v-${band}`) - ds]),
    )
    for (const b of delays) {
      expect(b.severity).toBe(BottleneckSeverity.INFO)
      checkInvariants(b, competitions.map(c => c.id), new Set())
    }
  })

  it('keeps a retried younger band at its floor, never back at day start', () => {
    // 40 fencers on 9 strips, pools capped at 3 and DEs at 2, so Vet 70 runs
    // for hours. Its latest end is set 30 minutes past where it ends from day
    // start (the control), so from day start + 60 neither attempt fits. A
    // retry that fell back to day start would place it.
    const config = oneDay({ strips: makeStrips(9, 0), max_pool_strip_pct: 0.35, max_de_strip_pct: 0.25 })
    const long = vet(VetAgeGroup.VET70, { fencer_count: 40 })
    const control = scheduleAllConcurrent([long], config)
    expect(poolStart(control, 'v-VET70')).toBe(dayStart(0, config))
    const bounded = { ...long, latest_end: lastPhaseEnd(placed(control, 'v-VET70')) + 30 }
    expect(scheduleAllConcurrent([bounded], config).schedule['v-VET70']).toBeDefined()

    const result = scheduleAllConcurrent([vet(VetAgeGroup.VET80, { fencer_count: 6 }), bounded], config)

    const retried = result.bottlenecks.filter(
      b => b.competition_id === 'v-VET70' && b.rule === BottleneckRule.FIRST_ATTEMPT_FAILED,
    )
    expect(retried).toHaveLength(1)
    expect(result.schedule['v-VET70']).toBeUndefined()
    // Each attempt's dependency INFO goes with that attempt's rollback.
    expect(dependencyDelays(result.bottlenecks).filter(b => b.competition_id === 'v-VET70')).toEqual([])
  })

  it('B8 runs to completion with every same-day age-banded pair staggered by at least 60 minutes', () => {
    const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS.B8
    const competitions = buildCompetitions(fencerCounts, tournamentType)
    const result = scheduleAll(competitions, tournamentConfig(days, strips, videoStrips, tournamentType))

    const banded = competitions.filter(
      c => c.event_type === EventType.INDIVIDUAL && c.vet_age_group !== null
        && (BANDS_OLDEST_FIRST as readonly VetAgeGroup[]).includes(c.vet_age_group),
    )
    const rank = (c: Competition) => BANDS_OLDEST_FIRST.indexOf(c.vet_age_group as (typeof BANDS_OLDEST_FIRST)[number])
    const broken: string[] = []
    let pairs = 0
    for (const older of banded) {
      for (const younger of banded) {
        if (older.gender !== younger.gender || older.weapon !== younger.weapon) continue
        if (rank(older) >= rank(younger)) continue
        const o = result.schedule[older.id]
        const y = result.schedule[younger.id]
        if (!o || !y || o.assigned_day !== y.assigned_day) continue
        pairs++
        if (y.pool_start! < o.pool_start! + 60) {
          broken.push(`${older.id}@${o.pool_start} ${younger.id}@${y.pool_start}`)
        }
      }
    }
    // Every gender and weapon holds all five bands on one co-day: 2 genders × 3
    // weapons × C(5,2) = 10 band pairs each.
    const GENDER_WEAPON_GROUPS = 6
    const BAND_PAIRS_PER_GROUP = 10
    expect(pairs).toBe(GENDER_WEAPON_GROUPS * BAND_PAIRS_PER_GROUP)
    expect(broken).toEqual([])
  })
})

// METHODOLOGY §Within-Day Age-Descending Order: no Veteran event has a fixed
// start offset. Owner ruling O1 took the 2-hour offset from Vet 60/70/80 and
// O13 (2026-10-10) retired Vet Combined's, so each starts at its own day's start
// unless a cross-event wait holds it back.
describe('no Veteran event has a fixed start offset (O1, O13)', () => {
  it('starts Vet Combined and the oldest co-day band each at its own day\'s start', () => {
    const NINE_AM = 9 * 60
    const EIGHT_AM = 8 * 60
    const window = (start: number) => ({ day_start_time: start, day_end_time: start + 600, day_hard_end_time: start + 780 })
    const config = makeConfig({
      tournament_type: TournamentType.NAC,
      days_available: 2,
      strips: makeStrips(40, 0),
      max_pool_strip_pct: 1.0,
      max_de_strip_pct: 1.0,
      dayConfigs: [window(NINE_AM), window(1440 + EIGHT_AM)],
    })
    // Vet Combined is hard-separated from the co-day, so one of the two sits on
    // day 2, whose 8:00 start differs from day 1's 9:00. The test does not fix
    // which, since day assignment is not what it pins.
    const competitions = [
      vet(VetAgeGroup.VET60),
      vet(VetAgeGroup.VET40),
      vet(VetAgeGroup.VET_COMBINED),
    ]
    const result = scheduleAllConcurrent(competitions, config)
    const combinedDay = placed(result, 'v-VET_COMBINED').assigned_day
    const coDay = placed(result, 'v-VET60').assigned_day

    expect([combinedDay, coDay].sort()).toEqual([0, 1])
    expect(poolStart(result, 'v-VET_COMBINED')).toBe(dayStart(combinedDay, config))
    expect(poolStart(result, 'v-VET60')).toBe(dayStart(coDay, config))
    // Vet 40 still waits on Vet 60 (the stagger), so it alone starts later.
    expect(poolStart(result, 'v-VET40')).toBe(dayStart(coDay, config) + 60)
  })
})

describe('the individual→team wait binds', () => {
  it('starts the team\'s pools 120 minutes after the individual\'s last phase ends, with one INFO for the push', () => {
    const config = oneDay()
    const ds = dayStart(0, config)
    const competitions = pair()
    const result = scheduleAllConcurrent(competitions, config)

    const floor = snapToSlot(lastPhaseEnd(placed(result, 'd1-ind')) + 120)
    expect(poolStart(result, 'd1-team')).toBe(floor)
    const delays = dependencyDelays(result.bottlenecks)
    expect(delays.map(b => [b.competition_id, b.delay_mins])).toEqual([['d1-team', floor - ds]])
    checkInvariants(delays[0], competitions.map(c => c.id), new Set())
  })

  it('waits on a staged individual\'s R16 end, not its prelims end', () => {
    const config = oneDay({ strips: makeStrips(40, 6) })
    const result = scheduleAllConcurrent(
      pair({ fencer_count: 60, de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      config,
    )

    const ind = placed(result, 'd1-ind')
    expect(ind.de_prelims_end).not.toBeNull()
    expect(ind.de_round_of_16_end).not.toBeNull()
    expect(poolStart(result, 'd1-team')).toBe(snapToSlot(ind.de_round_of_16_end! + 120))
    expect(poolStart(result, 'd1-team')).toBeGreaterThan(ind.de_prelims_end! + 120)
  })

  it('does not hold a team whose individual is on another day', () => {
    // The individual is pinned to day 2, and the team is placed on day 1.
    const config = oneDay({ days_available: 2 })
    const pin: PinnedPlacement = { competition_id: 'd1-ind', day: 1, start_time: dayStart(1, config), strip_count: 2 }
    const result = scheduleAllConcurrent(pair(), config, [pin])

    expect(placed(result, 'd1-team').assigned_day).toBe(0)
    expect(poolStart(result, 'd1-team')).toBe(dayStart(0, config))
  })
})

describe('a wait on an event that is never placed is owed as if it did not exist (O8)', () => {
  it('starts the younger band at day start when the older band fails both attempts', () => {
    const config = oneDay()
    const result = scheduleAllConcurrent(
      [vet(VetAgeGroup.VET80, unplaceable(config)), vet(VetAgeGroup.VET70)],
      config,
    )

    expect(result.schedule['v-VET80']).toBeUndefined()
    expect(poolStart(result, 'v-VET70')).toBe(dayStart(0, config))
    expect(dependencyDelays(result.bottlenecks)).toEqual([])
  })

  it('makes a band wait on the placed band above a middle band that is never placed', () => {
    // With Vet 70 gone, Vet 80 is the next-older band on the day, as when Vet 70 is absent.
    const config = oneDay()
    const ds = dayStart(0, config)
    const competitions = [vet(VetAgeGroup.VET80), vet(VetAgeGroup.VET70, unplaceable(config)), vet(VetAgeGroup.VET60)]
    const result = scheduleAllConcurrent(competitions, config)

    expect(result.schedule['v-VET70']).toBeUndefined()
    expect(poolStart(result, 'v-VET80')).toBe(ds)
    expect(poolStart(result, 'v-VET60')).toBe(ds + 60)
    const delays = dependencyDelays(result.bottlenecks)
    expect(delays.map(b => [b.competition_id, b.delay_mins, b.subjects])).toEqual([
      ['v-VET60', 60, ['v-VET60', 'v-VET80']],
    ])
    checkInvariants(delays[0], competitions.map(c => c.id), new Set())
  })

  it('starts a band at day start when no band above it is placed', () => {
    const config = oneDay()
    const result = scheduleAllConcurrent(
      [vet(VetAgeGroup.VET80, unplaceable(config)), vet(VetAgeGroup.VET70, unplaceable(config)), vet(VetAgeGroup.VET60)],
      config,
    )

    expect(poolStart(result, 'v-VET60')).toBe(dayStart(0, config))
    expect(dependencyDelays(result.bottlenecks)).toEqual([])
  })

  it('starts the team at day start when its individual fails both attempts', () => {
    const config = oneDay()
    const result = scheduleAllConcurrent(pair(unplaceable(config)), config)

    expect(result.schedule['d1-ind']).toBeUndefined()
    expect(poolStart(result, 'd1-team')).toBe(dayStart(0, config))
  })

  it('still holds a lapsed team that is the older side of a regional Group 1 pair to its window', () => {
    // At ROC the Div 1 team is the older side of a Div 1–Cadet pair, so its
    // pools keep the window floor of day start + 240 when the wait lapses.
    const config = oneDay({ tournament_type: TournamentType.ROC })
    const result = scheduleAllConcurrent(
      [
        event('cdt', { category: Category.CADET }),
        event('d1-ind', { category: Category.DIV1, ...unplaceable(config) }),
        event('d1-team', { category: Category.DIV1, event_type: EventType.TEAM, fencer_count: 8 }),
      ],
      config,
    )

    expect(result.schedule['d1-ind']).toBeUndefined()
    expect(poolStart(result, 'd1-team')).toBe(dayStart(0, config) + 240)
  })
})

/** A wait owed by `waiter_id` on `predecessor_id`. */
function wait(
  waiter_id: string,
  predecessor_id: string,
  gap = 60,
  anchor: WaitAnchor = WaitAnchor.FIRST_POOL_START,
): CrossEventWait {
  return { waiter_id, predecessor_id, anchor, gap }
}

describe('resolveWaits', () => {
  const statuses = (byId: Record<string, PredecessorStatus>) => (w: CrossEventWait) => byId[w.predecessor_id]
  const at = (time: number): PredecessorStatus => ({ state: PredecessorState.PLACED, time })

  it('holds the waiter while any predecessor is pending', () => {
    const resolution = resolveWaits(
      [wait('w', 'a'), wait('w', 'b', 120)],
      statuses({ a: at(600), b: { state: PredecessorState.PENDING } }),
    )
    expect(resolution).toEqual({ held: true })
  })

  it('takes the latest anchor + gap over the placed predecessors and names the binding one', () => {
    // The latest comes first, so a last-one-wins floor would read 660.
    const resolution = resolveWaits(
      [wait('w', 'b', 120, WaitAnchor.TERMINAL_END), wait('w', 'a')],
      statuses({ a: at(600), b: at(700) }),
    )
    expect(resolution).toEqual({ held: false, floor: 820, binding: ['b'] })
  })

  it('names every predecessor that sets the floor when two tie', () => {
    const resolution = resolveWaits(
      [wait('w', 'a'), wait('w', 'b', 120)],
      statuses({ a: at(660), b: at(600) }),
    )
    expect(resolution).toEqual({ held: false, floor: 720, binding: ['a', 'b'] })
  })

  it('gives no floor when no wait is left', () => {
    expect(resolveWaits([], statuses({}))).toEqual({ held: false, floor: null, binding: [] })
  })
})

describe('passOverFailed', () => {
  // The Vet chain 80 ← 70 ← 60 ← 50 on first-pool start, and a team on its
  // individual's last phase end.
  const waits = [
    wait('v70', 'v80'),
    wait('v60', 'v70'),
    wait('v50', 'v60'),
    wait('team', 'ind', 120, WaitAnchor.TERMINAL_END),
  ]
  const failedOf = (...ids: string[]) => (id: string) => ids.includes(id)

  it.each([
    ['keeps a wait whose predecessor has not failed', wait('v60', 'v70'), [], wait('v60', 'v70')],
    ['passes a band\'s wait to the band above a failed one, keeping its gap', wait('v60', 'v70'), ['v70'], wait('v60', 'v80')],
    ['passes over two failed bands', wait('v50', 'v60'), ['v60', 'v70'], wait('v50', 'v80')],
    ['lapses when no band above is left', wait('v60', 'v70'), ['v70', 'v80'], null],
    ['lapses a team\'s wait on a failed individual', wait('team', 'ind', 120, WaitAnchor.TERMINAL_END), ['ind'], null],
  ] as const)('%s', (_name, given, failed, expected) => {
    expect(passOverFailed(given, waits, failedOf(...failed))).toEqual(expected)
  })
})

describe('the waits\' bounds fail loudly', () => {
  it('throws on a cycle of waits and accepts a chain', () => {
    expect(() => assertAcyclicWaits([wait('b', 'a'), wait('c', 'b')])).not.toThrow()
    expect(() => assertAcyclicWaits([wait('b', 'a'), wait('a', 'c'), wait('c', 'b')])).toThrow(/cycle/)
  })

  it('throws when passing over failed predecessors goes round a cycle', () => {
    const cycle = [wait('a', 'b'), wait('b', 'a')]
    expect(() => passOverFailed(wait('w', 'a'), cycle, () => true)).toThrow(/cycle/)
  })

  it('throws when a held event never resolved, naming it and what it waits on', () => {
    const waits = [wait('v-VET70', 'v-VET80')]
    expect(() => assertEveryEventResolved([{ id: 'v-VET70', resolved: true }], waits)).not.toThrow()
    expect(() => assertEveryEventResolved(
      [{ id: 'v-VET80', resolved: true }, { id: 'v-VET70', resolved: false }],
      waits,
    )).toThrow(/v-VET70.*v-VET80/)
  })
})
