import { describe, it, expect } from 'vitest'
import { eventTimeSegments } from '../../src/layout/segments.ts'
import { deriveEventSchedule } from '../../src/engine/derive.ts'
import type { DerivedEventSchedule } from '../../src/engine/derive.ts'
import { DeMode, Phase } from '../../src/engine/types.ts'
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
  it('splits a plain event into its pool block and its single-stage DE block', () => {
    expect(eventTimeSegments(derive({ id: 'plain' }))).toEqual([
      { phase: Phase.POOLS, startMinutes: 480, endMinutes: 585, stripCount: 4 },
      { phase: Phase.DE, startMinutes: 615, endMinutes: 699, stripCount: 16 },
    ])
  })

  it('splits a flighted event into flight A, flight B and the DE block', () => {
    // pool_start/pool_end still span both flights on the result, so a naive
    // implementation that checks pool_start first would emit an 480-720 block
    // covering the gap between the flights.
    expect(eventTimeSegments(derive({ id: 'flighted', flighted: true }))).toEqual([
      { phase: Phase.FLIGHT_A, startMinutes: 480, endMinutes: 585, stripCount: 2 },
      { phase: Phase.FLIGHT_B, startMinutes: 615, endMinutes: 720, stripCount: 2 },
      { phase: Phase.DE, startMinutes: 750, endMinutes: 834, stripCount: 16 },
    ])
  })

  it('splits a staged DE event into pools, prelims and the round of 16', () => {
    const staged = derive({ id: 'staged', de_mode: DeMode.STAGED, fencer_count: 64 })
    expect(eventTimeSegments(staged)).toEqual([
      { phase: Phase.POOLS, startMinutes: 480, endMinutes: 846, stripCount: 4 },
      { phase: Phase.DE_PRELIMS, startMinutes: 880, endMinutes: 885, stripCount: 16 },
      { phase: Phase.DE_ROUND_OF_16, startMinutes: 915, endMinutes: 1030, stripCount: 4 },
    ])
  })

  it('omits the medal tail, which de_total_end covers but no block draws', () => {
    const plain = derive({ id: 'plain' })
    const segments = eventTimeSegments(plain)

    expect(plain.result.de_total_end).toBe(729)
    expect(segments[segments.length - 1].endMinutes).toBe(699)
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
