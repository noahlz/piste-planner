import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { eventTimeSegments } from '../../src/layout/segments.ts'
import type { DerivedEventSchedule } from '../../src/engine/derive.ts'
import { CutMode, DeMode, Phase } from '../../src/engine/types.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { selectDerivedSchedule } from '../../src/store/derived.ts'
import {
  makeCompetition,
  makeConfig,
  makePlacement,
  makeScheduleResult,
} from '../helpers/factories.ts'
import { deriveSized } from '../helpers/derive.ts'

/**
 * Derives one event through the real engine so these expectations break if the
 * engine's field shape changes. Every asserted minute below was also derived by
 * hand from `src/engine/derive.ts` before being written down.
 */
function derive(overrides: Parameters<typeof makeCompetition>[0]): DerivedEventSchedule {
  return deriveSized(makePlacement(), makeCompetition(overrides), makeConfig())
}

describe('eventTimeSegments', () => {
  // Every minute below is the engine's own output for the factory defaults
  // (24 foil fencers, 4 pools of 6, 4 strips, 09:00 start, 30-minute admin gap).
  // 024 group B moved `makePlacement`'s default start from 8:00 to the 9:00 day
  // start (Ops Manual 2026-27 p.17, METHODOLOGY.md §Inputs), so every minute
  // below is 60 later than group A's and every length is unchanged.
  // Since 024 a foil pool of 6 takes round(120 × 15/21) = 86 minutes
  // (METHODOLOGY.md §Pool Duration Estimation, Ops Manual p.17), and the DE is
  // derived per round at 20 minutes a bout (§DE Duration): 24 promoted into a
  // bracket of 32 on 16 strips is R32 (8 bouts), R16, QF and SF, one wave each,
  // so 4 × 20 = 80 minutes.
  it('splits a plain event into its pool block and its single-stage DE block', () => {
    expect(eventTimeSegments(derive({ id: 'plain' }))).toEqual([
      { phase: Phase.POOLS, startMinutes: 540, endMinutes: 626, stripCount: 4 },
      { phase: Phase.DE, startMinutes: 660, endMinutes: 740, stripCount: 16 },
    ])
  })

  it('splits a flighted event into flight A, flight B and the DE block', () => {
    // pool_start/pool_end still span both flights on the result, so a naive
    // implementation that checks pool_start first would emit an 540-731 block
    // covering the gap between the flights. Flight B waits the 15-minute flight
    // buffer alone, snap(626 + 15) = 645 (021 T3, METHODOLOGY §Runtime Decomposition).
    expect(eventTimeSegments(derive({ id: 'flighted', flighted: true }))).toEqual([
      { phase: Phase.FLIGHT_A, startMinutes: 540, endMinutes: 626, stripCount: 2 },
      { phase: Phase.FLIGHT_B, startMinutes: 645, endMinutes: 731, stripCount: 2 },
      { phase: Phase.DE, startMinutes: 765, endMinutes: 845, stripCount: 16 },
    ])
  })

  // 64 foil fencers make 4 pools of 7 and 6 of 6, averaging round(99.6) = 100
  // minutes over 3 waves on 4 strips. Div 1's video stage is the round of 16
  // (§Video Replay Policy), so the prelims run R64 (2 waves on 16 strips) and R32
  // (1 wave), 3 × 20 = 60 minutes, and the video block runs R16 (2 waves on 4
  // video strips), QF and SF, 4 × 20 = 80 minutes (§DE Phase Breakdown).
  it('splits a staged DE event into pools, prelims and the round of 16', () => {
    const staged = derive({ id: 'staged', de_mode: DeMode.STAGED, fencer_count: 64 })
    expect(eventTimeSegments(staged)).toEqual([
      { phase: Phase.POOLS, startMinutes: 540, endMinutes: 840, stripCount: 4 },
      { phase: Phase.DE_PRELIMS, startMinutes: 870, endMinutes: 930, stripCount: 16 },
      { phase: Phase.DE_ROUND_OF_16, startMinutes: 960, endMinutes: 1040, stripCount: 4 },
    ])
  })

  // 024 plan D5: a bracket of 2 has no counted round, so its DE takes 0
  // minutes on 0 strips (METHODOLOGY.md §DE Duration) and draws no block.
  it.each([DeMode.SINGLE_STAGE, DeMode.STAGED])(
    'skips the empty %s DE block of a bracket of 2',
    (de_mode) => {
      const bracketOf2 = derive({ id: 'bracket-of-2', fencer_count: 2, cut_mode: CutMode.DISABLED, de_mode })
      expect(eventTimeSegments(bracketOf2).map((s) => s.phase)).toEqual([Phase.POOLS])
    },
  )

  it('omits the medal tail, which de_total_end covers but no block draws', () => {
    const plain = derive({ id: 'plain' })
    const segments = eventTimeSegments(plain)

    // 740 + the 30-minute individual tail = 770
    expect(plain.result.de_total_end).toBe(770)
    expect(segments[segments.length - 1].endMinutes).toBe(740)
  })

  it('returns no segments when every start and end field is null', () => {
    const empty: DerivedEventSchedule = {
      result: makeScheduleResult('unplaced', 0),
      day_out_of_range: false,
    }
    expect(eventTimeSegments(empty)).toEqual([])
  })

  // FR-013: geometry is derived on read and never stored.
  it('yields deeply equal but freshly built segments on repeated derivation', () => {
    const staged = derive({ id: 'staged', de_mode: DeMode.STAGED, fencer_count: 64 })

    const first = eventTimeSegments(staged)
    const second = eventTimeSegments(staged)

    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(second[0]).not.toBe(first[0])
  })

  it('leaves the source DerivedEventSchedule untouched', () => {
    const staged = derive({ id: 'staged', de_mode: DeMode.STAGED, fencer_count: 64 })
    const before = structuredClone(staged)

    eventTimeSegments(staged)

    expect(staged).toEqual(before)
    expect(Object.keys(staged.result)).toEqual(Object.keys(before.result))
  })
})

describe('eventTimeSegments on the reference tournaments', () => {
  // Characterisation (017 T1): captured at 114d99314b, before `eventTimeSegments`
  // delegated to `phaseSpans`. Each digest is the first 16 hex digits of the
  // SHA-256 of every event's segments, by id, after the app's own run – so the
  // move into the engine changed no span on B1–B8. B8's 148 matches the plan's
  // phase count for it.
  //
  // 018 T1 (2026-10-07): the B1, B2, B7 and B8 digests moved on purpose. Div 1
  // promotes 75% at a NAC (R4), so Div 1 R16 and later times shift. B8 also
  // has a VET R16 knock-on: seven day-1 VET R16s start later, so JR-W-EPEE's
  // prelims fall back onto 8 video strips from 1670 to 1850. Counts
  // (66, 66, 54, 148) and B3–B6 are unchanged.
  //
  // 018 T2 (2026-10-07): the B4 and B6 digests moved on purpose. A last phase
  // may now run past the 22:00 hard end (R1), so events the scheduler used to
  // drop are placed and drawn: B4 21 → 24 events (42 → 48 segments, two each)
  // and B6 45 → 51 (90 → 102). B1–B3, B5, B7 and B8 are unchanged.
  //
  // 021 T4 (2026-10-09): the B1, B3, B5, B6, B7 and B8 digests moved on
  // purpose. Weapon balance (METHODOLOGY §Weapon Balance, owner rulings O4 and
  // O7) re-colours their day maps, the same six scenarios the drift ledger
  // moves. B6 places 51 → 53 events (102 → 106 segments). B2 and B4 are
  // unchanged, and the other counts hold.
  //
  // 021 T6a (2026-10-09): the B8 digest moved on purpose. The Vet co-day
  // stagger binds (METHODOLOGY §Cross-Event Dependency Edges, owner ruling O1),
  // so B8's age-banded Vet bands start 60 minutes apart, and four D1 team events
  // on the same days start earlier as a knock-on (none waits on anything). Eight
  // events whose pool starts hold see their DE phases shift by strip contention
  // (JR-W-FOIL-IND ends 70 minutes earlier, D1-W-FOIL-IND 65 later). No day map
  // moves, B8 keeps its 148 segments, and B1–B7 are unchanged.
  const EXPECTED = {
    B1: ['2c69ff46cf84f560', 66], B2: ['38543891f24c5f71', 66], B3: ['7a643084a6030fbc', 72],
    B4: ['d2c0a3c4be181709', 48], B5: ['18197dd2e2268e2e', 24], B6: ['e5a90a710470baa3', 106],
    B7: ['12848ca4621bcf3a', 54], B8: ['70c2a3145dc7071a', 148],
  } as const

  it.each(SCENARIO_IDS)('%s: draws the same segments as before', (id) => {
    useStore.setState(useStore.getInitialState(), true)
    applyPreset(id)
    runScheduleAll()
    const events = selectDerivedSchedule(useStore.getState()).events
    const perEvent = Object.keys(events).sort().map(k => [k, eventTimeSegments(events[k])] as const)

    const digest = createHash('sha256').update(JSON.stringify(perEvent)).digest('hex').slice(0, 16)
    const count = perEvent.reduce((n, [, segments]) => n + segments.length, 0)
    // The segment list is the message, so a changed digest shows which event moved.
    expect([digest, count], JSON.stringify(perEvent)).toEqual(EXPECTED[id])
  })
})

describe('eventTimeSegments zero-length spans', () => {
  it('skips a pool block of zero minutes, as it skips a zero-minute DE block', () => {
    const result = { ...makeScheduleResult('zero', 0), pool_start: 600, pool_end: 600, pool_strip_count: 2 }
    expect(eventTimeSegments({ result, day_out_of_range: false })).toEqual([])
  })
})
