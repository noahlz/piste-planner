import { describe, it, expect } from 'vitest'
import { eventTimeSegments } from '../../src/layout/segments.ts'
import { deriveEventSchedule } from '../../src/engine/derive.ts'
import type { DerivedEventSchedule } from '../../src/engine/derive.ts'
import { CutMode, DeMode, Phase } from '../../src/engine/types.ts'
import {
  makeCompetition,
  makeConfig,
  makePlacement,
  makeScheduleResult,
} from '../helpers/factories.ts'

/**
 * Derives one event through the real engine so these expectations break if the
 * engine's field shape changes. Every asserted minute below was also derived by
 * hand from `src/engine/derive.ts` before being written down.
 */
function derive(overrides: Parameters<typeof makeCompetition>[0]): DerivedEventSchedule {
  return deriveEventSchedule(makePlacement(), makeCompetition(overrides), makeConfig())
}

describe('eventTimeSegments', () => {
  // Every minute below is the engine's own output for the factory defaults
  // (24 foil fencers, 4 pools of 6, 4 strips, 08:00 start, 30-minute admin gap).
  // Since 024 a foil pool of 6 takes round(120 × 15/21) = 86 minutes
  // (METHODOLOGY.md §Pool Duration Estimation, Ops Manual p.17), and the DE is
  // derived per round at 20 minutes a bout (§DE Duration): 24 promoted into a
  // bracket of 32 on 16 strips is R32 (8 bouts), R16, QF and SF, one wave each,
  // so 4 × 20 = 80 minutes.
  it('splits a plain event into its pool block and its single-stage DE block', () => {
    expect(eventTimeSegments(derive({ id: 'plain' }))).toEqual([
      { phase: Phase.POOLS, startMinutes: 480, endMinutes: 566, stripCount: 4 },
      { phase: Phase.DE, startMinutes: 600, endMinutes: 680, stripCount: 16 },
    ])
  })

  it('splits a flighted event into flight A, flight B and the DE block', () => {
    // pool_start/pool_end still span both flights on the result, so a naive
    // implementation that checks pool_start first would emit an 480-686 block
    // covering the gap between the flights.
    expect(eventTimeSegments(derive({ id: 'flighted', flighted: true }))).toEqual([
      { phase: Phase.FLIGHT_A, startMinutes: 480, endMinutes: 566, stripCount: 2 },
      { phase: Phase.FLIGHT_B, startMinutes: 600, endMinutes: 686, stripCount: 2 },
      { phase: Phase.DE, startMinutes: 720, endMinutes: 800, stripCount: 16 },
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
      { phase: Phase.POOLS, startMinutes: 480, endMinutes: 780, stripCount: 4 },
      { phase: Phase.DE_PRELIMS, startMinutes: 810, endMinutes: 870, stripCount: 16 },
      { phase: Phase.DE_ROUND_OF_16, startMinutes: 900, endMinutes: 980, stripCount: 4 },
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

    expect(plain.result.de_total_end).toBe(710)
    expect(segments[segments.length - 1].endMinutes).toBe(680)
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
