import { describe, it, expect } from 'vitest'
import {
  ROW_HEIGHT_PX,
  blockHeight,
  blockWidth,
  blockX,
  blockY,
  eventTimeSegments,
  pxPerMinute,
} from '../../../src/components/canvas/geometry.ts'
import { deriveEventSchedule } from '../../../src/engine/derive.ts'
import type { DerivedEventSchedule } from '../../../src/engine/derive.ts'
import { DeMode, Phase } from '../../../src/engine/types.ts'
import { RowHeightStep } from '../../../src/store/viewState.ts'
import {
  makeCompetition,
  makeConfig,
  makePlacement,
  makeScheduleResult,
} from '../../helpers/factories.ts'

// Minutes from midnight, matching src/engine/constants.ts.
const EIGHT_AM = 480
const NINE_AM = 540
const SEVEN_AM = 420
const TEN_PM = 1320

/**
 * Derives one event through the real engine so these expectations break if the
 * engine's field shape changes. Every asserted minute below was also derived by
 * hand from `src/engine/derive.ts` before being written down.
 */
function derive(overrides: Parameters<typeof makeCompetition>[0]): DerivedEventSchedule {
  return deriveEventSchedule(makePlacement(), makeCompetition(overrides), makeConfig())
}

describe('pxPerMinute', () => {
  // timeZoom is MINUTES PER PIXEL (src/store/viewState.ts), so pxPerMinute is
  // its reciprocal. Three distinct zooms, because an inverted implementation
  // agrees with the correct one only at timeZoom === 1.
  it('is one at the default zoom of one minute per pixel', () => {
    expect(pxPerMinute(1)).toBe(1)
  })

  it('halves when each pixel covers two minutes', () => {
    expect(pxPerMinute(2)).toBe(0.5)
  })

  it('doubles when each pixel covers half a minute', () => {
    expect(pxPerMinute(0.5)).toBe(2)
  })
})

describe('blockX', () => {
  it('places 09:00 sixty pixels into an 08:00 window at one minute per pixel', () => {
    expect(blockX(NINE_AM, EIGHT_AM, 1)).toBe(60)
  })

  it('halves that offset when zoomed out to two minutes per pixel', () => {
    expect(blockX(NINE_AM, EIGHT_AM, 2)).toBe(30)
  })

  it('doubles that offset when zoomed in to half a minute per pixel', () => {
    expect(blockX(NINE_AM, EIGHT_AM, 0.5)).toBe(120)
  })

  it('returns a negative x for a start before the window, never clamping to zero', () => {
    expect(blockX(SEVEN_AM, EIGHT_AM, 1)).toBe(-60)
    expect(blockX(SEVEN_AM, EIGHT_AM, 2)).toBe(-30)
  })

  it('returns an x past the viewport for a start after the window, uncapped', () => {
    expect(blockX(TEN_PM, EIGHT_AM, 1)).toBe(840)
  })

  it('is zero at the window start itself', () => {
    expect(blockX(EIGHT_AM, EIGHT_AM, 4)).toBe(0)
  })
})

describe('blockWidth', () => {
  it('is the duration in pixels at one minute per pixel', () => {
    expect(blockWidth(105, 1)).toBe(105)
  })

  it('halves when zoomed out to two minutes per pixel', () => {
    expect(blockWidth(105, 2)).toBe(52.5)
  })

  it('doubles when zoomed in to half a minute per pixel', () => {
    expect(blockWidth(105, 0.5)).toBe(210)
  })

  it('is zero for a zero-length duration', () => {
    expect(blockWidth(0, 3)).toBe(0)
  })
})

describe('ROW_HEIGHT_PX', () => {
  it('steps discretely across compact, normal and tall', () => {
    expect(ROW_HEIGHT_PX).toEqual({
      [RowHeightStep.COMPACT]: 16,
      [RowHeightStep.NORMAL]: 24,
      [RowHeightStep.TALL]: 36,
    })
  })
})

describe('blockY', () => {
  it('is zero for the first row of the window', () => {
    expect(blockY(0, 0, RowHeightStep.NORMAL)).toBe(0)
  })

  it('multiplies the row offset by the step height at normal', () => {
    expect(blockY(5, 0, RowHeightStep.NORMAL)).toBe(120)
  })

  it('multiplies the row offset by the step height at compact', () => {
    expect(blockY(5, 0, RowHeightStep.COMPACT)).toBe(80)
  })

  it('multiplies the row offset by the step height at tall', () => {
    expect(blockY(5, 0, RowHeightStep.TALL)).toBe(180)
  })

  it('subtracts the window start row so a scrolled canvas shifts up', () => {
    expect(blockY(5, 3, RowHeightStep.NORMAL)).toBe(48)
  })

  it('returns a negative y for a row scrolled above the window', () => {
    expect(blockY(3, 5, RowHeightStep.NORMAL)).toBe(-48)
  })
})

describe('blockHeight', () => {
  it('is one row height for a single-strip block at each step', () => {
    expect(blockHeight(1, RowHeightStep.COMPACT)).toBe(16)
    expect(blockHeight(1, RowHeightStep.NORMAL)).toBe(24)
    expect(blockHeight(1, RowHeightStep.TALL)).toBe(36)
  })

  it('multiplies by the strip span for a multi-strip block', () => {
    expect(blockHeight(4, RowHeightStep.COMPACT)).toBe(64)
    expect(blockHeight(4, RowHeightStep.NORMAL)).toBe(96)
    expect(blockHeight(4, RowHeightStep.TALL)).toBe(144)
  })
})

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
