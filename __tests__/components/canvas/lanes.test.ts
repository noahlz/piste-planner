import { describe, it, expect } from 'vitest'
import {
  assignStripLanes,
  type BlockPlacement,
} from '../../../src/components/canvas/lanes.ts'
import type { DerivedEventSchedule } from '../../../src/engine/derive.ts'
import { Phase } from '../../../src/engine/types.ts'
import { makeScheduleResult } from '../../helpers/factories.ts'

// 004 T037 — which rows a block occupies.
//
// `Placement.strips` is `number[] | null` and is always null in P3
// (src/store/runActions.ts), so a placement carries a strip *count*, never
// strip indices. Something has to choose the rows or every block on a day
// piles onto strip 1, and this module is that choice.
//
// Every expected `firstStrip` below is a literal. The rule is first fit over
// half-open time ranges, and an expectation recomputed from that same rule
// could not detect the rule being wrong.

/** One event whose only drawable segment is a pool block. */
function poolEvent(
  id: string,
  day: number,
  startMinutes: number,
  endMinutes: number,
  stripCount: number,
  dayOutOfRange = false,
): DerivedEventSchedule {
  return {
    result: {
      ...makeScheduleResult(id, day),
      pool_start: startMinutes,
      pool_end: endMinutes,
      pool_strip_count: stripCount,
    },
    day_out_of_range: dayOutOfRange,
  }
}

/** One event with both a pool block and a single-stage DE block. */
function poolAndDeEvent(
  id: string,
  day: number,
  pool: [number, number, number],
  de: [number, number, number],
): DerivedEventSchedule {
  const base = poolEvent(id, day, pool[0], pool[1], pool[2])
  return {
    ...base,
    result: {
      ...base.result,
      de_start: de[0],
      de_end: de[1],
      de_strip_count: de[2],
    },
  }
}

function lane(placements: BlockPlacement[], id: string, phase: Phase = Phase.POOLS): BlockPlacement {
  const found = placements.find((p) => p.competitionId === id && p.phase === phase)
  if (!found) throw new Error(`no ${phase} placement for ${id}`)
  return found
}

/** `id:PHASE` for each placement, in the order the module returned them. */
function order(placements: BlockPlacement[]): string[] {
  return placements.map((p) => `${p.competitionId}:${p.phase}`)
}

describe('assignStripLanes packs one day (FR-012)', () => {
  it('gives two blocks that overlap in time strip runs that do not overlap', () => {
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 585, 4),
        b: poolEvent('b', 0, 480, 585, 4),
      },
      8,
    )

    expect(lane(placements, 'a').firstStrip).toBe(0)
    expect(lane(placements, 'b').firstStrip).toBe(4)
    expect(lane(placements, 'a').overflow).toBe(false)
    expect(lane(placements, 'b').overflow).toBe(false)
  })

  it('lets two blocks that never share a minute share the same strips', () => {
    // Time ranges are half-open, so b starting exactly as a ends is free to
    // take a's strips back.
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 540, 4),
        b: poolEvent('b', 0, 540, 600, 4),
      },
      8,
    )

    expect(lane(placements, 'a').firstStrip).toBe(0)
    expect(lane(placements, 'b').firstStrip).toBe(0)
  })

  it('reuses the lowest run that has come free rather than appending above the last block', () => {
    // a holds 0-1 until 540 and b holds 2-3 until 600. c starts at 550, by
    // which point 0-1 is free again: appending would put it on 4.
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 540, 2),
        b: poolEvent('b', 0, 480, 600, 2),
        c: poolEvent('c', 0, 550, 600, 2),
      },
      6,
    )

    expect(lane(placements, 'a').firstStrip).toBe(0)
    expect(lane(placements, 'b').firstStrip).toBe(2)
    expect(lane(placements, 'c').firstStrip).toBe(0)
  })

  it('keeps each day’s strips to itself', () => {
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 585, 4),
        b: poolEvent('b', 1, 480, 585, 4),
      },
      8,
    )

    expect(lane(placements, 'a').firstStrip).toBe(0)
    expect(lane(placements, 'b').firstStrip).toBe(0)
  })

  it('lanes an event’s pool and DE blocks separately', () => {
    const placements = assignStripLanes(
      { plain: poolAndDeEvent('plain', 0, [480, 585, 4], [615, 699, 16]) },
      24,
    )

    expect(lane(placements, 'plain', Phase.POOLS)).toMatchObject({
      day: 0,
      startMinutes: 480,
      endMinutes: 585,
      stripCount: 4,
      firstStrip: 0,
      overflow: false,
    })
    expect(lane(placements, 'plain', Phase.DE)).toMatchObject({
      startMinutes: 615,
      endMinutes: 699,
      stripCount: 16,
      firstStrip: 0,
      overflow: false,
    })
  })
})

describe('assignStripLanes overflow (constitution IV)', () => {
  it('overflows a block asking for more strips than the day has at all', () => {
    const placements = assignStripLanes({ big: poolEvent('big', 0, 480, 585, 5) }, 4)

    expect(lane(placements, 'big').firstStrip).toBe(0)
    expect(lane(placements, 'big').overflow).toBe(true)
  })

  it('overflows every block when the day has no strips', () => {
    const placements = assignStripLanes({ a: poolEvent('a', 0, 480, 585, 1) }, 0)

    expect(placements).toHaveLength(1)
    expect(lane(placements, 'a').overflow).toBe(true)
  })

  it('overflows a block the day is full for, and still lanes the one after it', () => {
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 600, 4),
        b: poolEvent('b', 0, 480, 600, 4),
        c: poolEvent('c', 0, 600, 700, 4),
      },
      4,
    )

    expect(lane(placements, 'a')).toMatchObject({ firstStrip: 0, overflow: false })
    expect(lane(placements, 'b')).toMatchObject({ firstStrip: 0, overflow: true })
    expect(lane(placements, 'c')).toMatchObject({ firstStrip: 0, overflow: false })
  })

  it('does not let an overflowed block occupy the strips it was drawn on', () => {
    // a fills every strip until 600, so b overflows and is drawn at strip 0.
    // c overlaps b in time and asks for the same two strips: it must get 0,
    // because a block that found no room holds no room either. Recording b's
    // occupancy would push c to strip 2.
    const placements = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 600, 4),
        b: poolEvent('b', 0, 500, 700, 2),
        c: poolEvent('c', 0, 610, 700, 2),
      },
      4,
    )

    expect(lane(placements, 'a')).toMatchObject({ firstStrip: 0, overflow: false })
    expect(lane(placements, 'b')).toMatchObject({ firstStrip: 0, overflow: true })
    expect(lane(placements, 'c')).toMatchObject({ firstStrip: 0, overflow: false })
  })
})

describe('assignStripLanes skips what the canvas has no row for', () => {
  it('draws nothing for an out-of-range day while still laning its neighbour', () => {
    const placements = assignStripLanes(
      {
        plain: poolEvent('plain', 0, 480, 585, 4),
        stray: poolEvent('stray', 3, 480, 585, 4, true),
      },
      8,
    )

    expect(order(placements)).toEqual(['plain:POOLS'])
  })
})

describe('assignStripLanes is deterministic', () => {
  it('orders by day, then start, then competition id', () => {
    const placements = assignStripLanes(
      {
        zulu: poolEvent('zulu', 0, 480, 540, 1),
        alpha: poolEvent('alpha', 0, 480, 540, 1),
        early: poolEvent('early', 0, 420, 480, 1),
        tomorrow: poolEvent('tomorrow', 1, 400, 460, 1),
      },
      8,
    )

    expect(order(placements)).toEqual([
      'early:POOLS',
      'alpha:POOLS',
      'zulu:POOLS',
      'tomorrow:POOLS',
    ])
  })

  it('breaks a tie on day, start and id with a fixed phase order', () => {
    // Contrived — the engine never starts a DE at the pool start — but it is
    // the last tie the ordering has to settle, and an unsettled tie is a
    // lane assignment that jitters between renders.
    const placements = assignStripLanes(
      { same: poolAndDeEvent('same', 0, [480, 540, 2], [480, 540, 2]) },
      8,
    )

    expect(order(placements)).toEqual(['same:POOLS', 'same:DE'])
    expect(lane(placements, 'same', Phase.POOLS).firstStrip).toBe(0)
    expect(lane(placements, 'same', Phase.DE).firstStrip).toBe(2)
  })

  it('answers the same lanes however the events were keyed in', () => {
    const forwards = assignStripLanes(
      {
        a: poolEvent('a', 0, 480, 585, 4),
        b: poolEvent('b', 0, 480, 585, 4),
        c: poolEvent('c', 0, 480, 585, 4),
      },
      12,
    )
    const backwards = assignStripLanes(
      {
        c: poolEvent('c', 0, 480, 585, 4),
        b: poolEvent('b', 0, 480, 585, 4),
        a: poolEvent('a', 0, 480, 585, 4),
      },
      12,
    )

    expect(forwards).toEqual(backwards)
    expect(forwards.map((p) => p.firstStrip)).toEqual([0, 4, 8])
  })
})
