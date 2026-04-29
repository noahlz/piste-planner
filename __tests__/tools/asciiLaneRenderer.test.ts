import { describe, it, expect } from 'vitest'
import { renderAsciiLanes } from '../../src/tools/asciiLaneRenderer.ts'
import type { Bottleneck, ScheduleResult, StripAllocation } from '../../src/engine/types.ts'
import {
  Phase,
  BottleneckCause,
  BottleneckSeverity,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeScheduleResult, makeStrips } from '../helpers/factories.ts'

// Helpers — keep test setup terse and meaningful.

function alloc(event_id: string, phase: Phase, start_time: number, end_time: number): StripAllocation {
  return { event_id, phase, start_time, end_time }
}

function emptyStripAllocations(stripCount: number): StripAllocation[][] {
  return Array.from({ length: stripCount }, () => [])
}

function findLineStartingWith(out: string, prefix: string): string | undefined {
  return out.split('\n').find(l => l.startsWith(prefix))
}

describe('renderAsciiLanes — single day, single event', () => {
  const config = makeConfig({
    days_available: 1,
    strips: makeStrips(4, 1),
  })
  const comp = makeCompetition({ id: 'EVT' })
  const schedule: Record<string, ScheduleResult> = {
    EVT: { ...makeScheduleResult('EVT', 0), pool_start: 0, pool_end: 120 },
  }
  const stripAllocs = emptyStripAllocations(4)
  // Strips 0-3 all run pools 0..120 — should group into one row.
  for (let i = 0; i < 4; i++) {
    stripAllocs[i].push(alloc('EVT', Phase.POOLS, 0, 120))
  }

  const out = renderAsciiLanes({
    schedule,
    strip_allocations: stripAllocs,
    bottlenecks: [],
    config,
    competitions: [comp],
  })

  it('renders a DAY 1 header with config metadata', () => {
    const header = out.split('\n')[0]
    expect(header).toContain('DAY 1')
    expect(header).toContain('strips: 4')
    expect(header).toContain('video: 1')
    expect(header).toContain('scheduled: 1')
  })

  it('groups all four strips into a single S01-S04 row', () => {
    const grouped = findLineStartingWith(out, 'S01-S04')
    expect(grouped).toBeDefined()
    // Pool spans 120 mins / 10 mins per char = 12 chars. Label '[P-EVT' fits inside.
    expect(grouped).toContain('[P-EVT')
    expect(grouped).toContain(']')
  })

  it('does not produce a separate per-strip row when allocations match', () => {
    expect(findLineStartingWith(out, 'S01 ')).toBeUndefined()
    expect(findLineStartingWith(out, 'S02 ')).toBeUndefined()
  })

  it('does not emit an UNSCHEDULED footer when every event is scheduled', () => {
    expect(out).not.toContain('UNSCHEDULED')
  })
})

describe('renderAsciiLanes — strip grouping splits on differing allocations', () => {
  const config = makeConfig({ days_available: 1, strips: makeStrips(6, 0) })
  const stripAllocs = emptyStripAllocations(6)
  // Strips 0-1 run event A; strips 2-5 idle.
  stripAllocs[0].push(alloc('A', Phase.POOLS, 0, 60))
  stripAllocs[1].push(alloc('A', Phase.POOLS, 0, 60))

  const out = renderAsciiLanes({
    schedule: { A: { ...makeScheduleResult('A', 0), pool_start: 0, pool_end: 60 } },
    strip_allocations: stripAllocs,
    bottlenecks: [],
    config,
    competitions: [makeCompetition({ id: 'A' })],
  })

  it('emits one row for the busy pair and one row for the idle remainder', () => {
    expect(findLineStartingWith(out, 'S01-S02')).toBeDefined()
    expect(findLineStartingWith(out, 'S03-S06')).toBeDefined()
  })

  it('idle strip group renders as all dots', () => {
    const idle = findLineStartingWith(out, 'S03-S06')!
    const lane = idle.slice('S03-S06'.length).trim()
    expect(lane).toMatch(/^\.+$/)
  })
})

describe('renderAsciiLanes — multi-phase event on same strip', () => {
  const config = makeConfig({ days_available: 1, strips: makeStrips(2, 0) })
  const stripAllocs = emptyStripAllocations(2)
  // Pools then DE_PRELIMS then DE_ROUND_OF_16, sequential on strip 0.
  stripAllocs[0].push(alloc('X', Phase.POOLS, 0, 60))
  stripAllocs[0].push(alloc('X', Phase.DE_PRELIMS, 60, 120))
  stripAllocs[0].push(alloc('X', Phase.DE_ROUND_OF_16, 120, 180))

  const out = renderAsciiLanes({
    schedule: { X: makeScheduleResult('X', 0) },
    strip_allocations: stripAllocs,
    bottlenecks: [],
    config,
    competitions: [makeCompetition({ id: 'X' })],
  })

  const stripRow = findLineStartingWith(out, 'S01 ')!

  it('shows abbreviations for each phase in order', () => {
    const idxP = stripRow.indexOf('[P-')
    const idxDEP = stripRow.indexOf('[DEP')
    const idxR16 = stripRow.indexOf('[R16')
    expect(idxP).toBeGreaterThan(0)
    expect(idxDEP).toBeGreaterThan(idxP)
    expect(idxR16).toBeGreaterThan(idxDEP)
  })

  it('separates strip 0 from idle strip 1', () => {
    expect(findLineStartingWith(out, 'S02 ')).toBeDefined()
  })
})

describe('renderAsciiLanes — multi-day rendering', () => {
  const config = makeConfig({ days_available: 3, strips: makeStrips(2, 0) })
  const stripAllocs = emptyStripAllocations(2)
  // Day 0 = mins 0-840; day 1 = 840-1680; day 2 = 1680-2520.
  stripAllocs[0].push(alloc('E1', Phase.POOLS, 0, 60))
  stripAllocs[0].push(alloc('E2', Phase.POOLS, 900, 960)) // Day 1
  stripAllocs[0].push(alloc('E3', Phase.POOLS, 1740, 1800)) // Day 2

  const out = renderAsciiLanes({
    schedule: {
      E1: makeScheduleResult('E1', 0),
      E2: makeScheduleResult('E2', 1),
      E3: makeScheduleResult('E3', 2),
    },
    strip_allocations: stripAllocs,
    bottlenecks: [],
    config,
    competitions: [
      makeCompetition({ id: 'E1' }),
      makeCompetition({ id: 'E2' }),
      makeCompetition({ id: 'E3' }),
    ],
  })

  it('emits a header per day', () => {
    expect(out).toMatch(/DAY 1/)
    expect(out).toMatch(/DAY 2/)
    expect(out).toMatch(/DAY 3/)
  })

  it('places each event in its own day section, not on every day', () => {
    const dayBlocks = out.split(/\n(?=DAY )/)
    expect(dayBlocks).toHaveLength(3)
    expect(dayBlocks[0]).toContain('[P-E1')
    expect(dayBlocks[0]).not.toContain('[P-E2')
    expect(dayBlocks[1]).toContain('[P-E2')
    expect(dayBlocks[1]).not.toContain('[P-E3')
    expect(dayBlocks[2]).toContain('[P-E3')
  })
})

describe('renderAsciiLanes — UNSCHEDULED footer', () => {
  const config = makeConfig({ days_available: 1, strips: makeStrips(2, 0) })
  const stripAllocs = emptyStripAllocations(2)
  const bottlenecks: Bottleneck[] = [
    {
      competition_id: 'FAILED',
      phase: Phase.DE_PRELIMS,
      cause: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: 'no time',
    },
  ]

  const out = renderAsciiLanes({
    schedule: {},
    strip_allocations: stripAllocs,
    bottlenecks,
    config,
    competitions: [makeCompetition({ id: 'FAILED' }), makeCompetition({ id: 'OK' })],
  })

  it('lists every event missing from schedule', () => {
    expect(out).toContain('UNSCHEDULED (2):')
    expect(out).toContain('FAILED -')
    expect(out).toContain('OK -')
  })

  it('attaches the ERROR-severity bottleneck reason where available', () => {
    expect(out).toMatch(/FAILED - DEADLINE_BREACH_UNRESOLVABLE at DE_PRELIMS/)
  })

  it('falls back to a generic reason when no bottleneck names the event', () => {
    expect(out).toMatch(/OK - no terminating phase reached/)
  })
})

describe('renderAsciiLanes — column width budget', () => {
  // 80-strip / 14-hour config is the worst-case display target per the plan.
  const config = makeConfig({ days_available: 1, strips: makeStrips(80, 8) })
  const out = renderAsciiLanes({
    schedule: {},
    strip_allocations: emptyStripAllocations(80),
    bottlenecks: [],
    config,
    competitions: [],
  })

  it('keeps every line within 120 columns', () => {
    for (const line of out.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(120)
    }
  })

  it('time axis labels include both day endpoints', () => {
    const axis = out.split('\n')[1]
    expect(axis).toContain('08:00')
    expect(axis).toContain('21:00')
  })
})
