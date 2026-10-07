/**
 * The strip assigner (017 T3, spec §3): kept phases stay on the scheduler's
 * own indices, and derived (hand-moved or stale) phases are offered to the
 * engine's own strip search around them, each event whole, in (day, event
 * start, id, phase) order (P5).
 *
 * Real boards come from the store's own run (`runScheduleAll` and its
 * `lastRun`), so every kept index checked here is the engine's, read back
 * independently of `assignStrips`.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { buildPinnedPlacements, buildTournamentConfig } from '../../src/store/buildConfig.ts'
import type { KeptEvent, KeptRun } from '../../src/store/keptRun.ts'
import { assignStrips, KeptStripOutOfRangeError } from '../../src/layout/strips.ts'
import type { DrawnBlock, DrawnEventInput } from '../../src/layout/strips.ts'
import { deriveEventSchedule } from '../../src/engine/derive.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { phaseKey, unseatedPhases } from '../../src/engine/unseated.ts'
import { compareIds } from '../../src/engine/order.ts'
import { snapToSlot } from '../../src/engine/resources.ts'
import { TEMPLATES } from '../../src/engine/catalogue.ts'
import { SCENARIO_IDS, type ScenarioId } from '../../src/data/tournaments.ts'
import { Phase, PlacementSource, VideoPolicy } from '../../src/engine/types.ts'
import type { Competition, ScheduleResult, TournamentConfig } from '../../src/engine/types.ts'
import { makeCompetition, makeConfig, makeScheduleResult, makeStrips } from '../helpers/factories.ts'
import { loadFlightedFixture } from '../helpers/flightedFixtures.ts'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

// ──────────────────────────────────────────────
// Real boards
// ──────────────────────────────────────────────

interface Board {
  kept: KeptRun
  config: TournamentConfig
  competitions: Competition[]
}

/** The store's board right after `runScheduleAll`, with the run it kept. */
function runBoard(load: () => void): Board {
  load()
  runScheduleAll()
  const state = useStore.getState()
  expect(state.lastRun, 'runScheduleAll kept the run').not.toBeNull()
  return { kept: state.lastRun as KeptRun, ...buildTournamentConfig(state) }
}

const scenario = (id: ScenarioId) => () => applyPreset(id)
const template = (name: string) => () => {
  applyPreset('B1')
  useStore.getState().applyTemplate(name)
}

const BOARDS: [string, () => void][] = [
  ...SCENARIO_IDS.map((id): [string, () => void] => [id, scenario(id)]),
  ...Object.keys(TEMPLATES).map((name): [string, () => void] => [`template ${name}`, template(name)]),
]

function keptInput(event: KeptEvent): DrawnEventInput {
  return {
    result: event.result,
    day_out_of_range: false,
    keptStrips: Object.fromEntries(event.phases.map(p => [p.phase, p.strips])),
  }
}

function keptInputs(kept: KeptRun, except?: string): Record<string, DrawnEventInput> {
  const inputs: Record<string, DrawnEventInput> = {}
  for (const [id, event] of Object.entries(kept.events)) {
    if (id !== except) inputs[id] = keptInput(event)
  }
  return inputs
}

function competitionOf(board: Board, id: string): Competition {
  const competition = board.competitions.find(c => c.id === id)
  expect(competition, `competition ${id}`).toBeDefined()
  return competition as Competition
}

/** One event moved to `day` at its kept start, as Move day writes it, and derived from there. */
function movedInput(board: Board, id: string, day: number): DrawnEventInput {
  const key = board.kept.events[id].placementKey
  const placement = { ...key, day, strips: null, source: PlacementSource.MANUAL, pinned: false }
  return { ...deriveEventSchedule(placement, competitionOf(board, id), board.config), keptStrips: null }
}

/** Every placed event derived from its store placement, as a stale board draws. */
function derivedInputs(board: Board): Record<string, DrawnEventInput> {
  const { placements } = useStore.getState()
  const inputs: Record<string, DrawnEventInput> = {}
  for (const competition of board.competitions) {
    const placement = placements[competition.id]
    if (placement) {
      inputs[competition.id] = {
        ...deriveEventSchedule(placement, competition, board.config),
        keptStrips: null,
      }
    }
  }
  return inputs
}

const blocksOf = (blocks: DrawnBlock[], id: string) => blocks.filter(b => b.competitionId === id)

/** Pairs of seated blocks that share a strip on one day at overlapping minutes (half-open). */
function overlaps(blocks: DrawnBlock[]): string[] {
  const found: string[] = []
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]
      const b = blocks[j]
      if (a.day !== b.day) continue
      if (!(a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes)) continue
      const shared = a.strips.filter(s => b.strips.includes(s))
      if (shared.length > 0) found.push(`${a.competitionId}/${a.phase} × ${b.competitionId}/${b.phase}`)
    }
  }
  return found
}

// ──────────────────────────────────────────────
// Small hand-built boards
// ──────────────────────────────────────────────

/** Strips 0..video-1 are video, the rest are not (`makeStrips`). */
const smallConfig = (total: number, video: number) => makeConfig({ strips: makeStrips(total, video) })

function poolResult(id: string, day: number, start: number, end: number, stripCount: number): ScheduleResult {
  return {
    ...makeScheduleResult(id, day),
    pool_start: start,
    pool_end: end,
    pool_strip_count: stripCount,
  }
}

const derived = (result: ScheduleResult): DrawnEventInput =>
  ({ result, day_out_of_range: false, keptStrips: null })

const keptPool = (result: ScheduleResult, strips: number[]): DrawnEventInput =>
  ({ result, day_out_of_range: false, keptStrips: { [Phase.POOLS]: strips } })

const comps = (...ids: string[]) => ids.map(id => makeCompetition({ id }))

const only = (blocks: DrawnBlock[], id: string): DrawnBlock => {
  const mine = blocksOf(blocks, id)
  expect(mine, `one block for ${id}`).toHaveLength(1)
  return mine[0]
}

// ──────────────────────────────────────────────

describe('assignStrips: kept phases', () => {
  it.each(BOARDS)('%s: every kept phase draws at its kept times on its kept indices, none unseated', (_name, load) => {
    const board = runBoard(load)
    const blocks = assignStrips(keptInputs(board.kept), board.config, board.competitions)

    const expected = Object.entries(board.kept.events).flatMap(([id, event]) =>
      event.phases.map(p => ({
        id, phase: p.phase, start: p.startMinutes, end: p.endMinutes, strips: [...p.strips],
      })))
    const drawn = blocks.map(b => ({
      id: b.competitionId, phase: b.phase, start: b.startMinutes, end: b.endMinutes, strips: [...b.strips],
    }))
    const order = (a: { id: string; phase: string }, b: { id: string; phase: string }) =>
      compareIds(a.id, b.id) || compareIds(a.phase, b.phase)

    expect(expected.length).toBeGreaterThan(0)
    expect(drawn.sort(order)).toEqual(expected.sort(order))
    expect(blocks.filter(b => b.unseated)).toEqual([])
  })

  it('a pinned phase the run could not seat draws unseated, exactly the engine\'s unseated set', () => {
    applyPreset('B1')
    runScheduleAll()
    for (const id of Object.keys(useStore.getState().placements)) useStore.getState().setPinned(id, true)
    runScheduleAll()
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const engine = unseatedPhases(scheduleAll(competitions, config, buildPinnedPlacements(state)))

    const blocks = assignStrips(keptInputs(state.lastRun as KeptRun), config, competitions)
    const drawnUnseated = blocks.filter(b => b.unseated).map(b => phaseKey(b.competitionId, b.phase))

    // 8 is the B1 pin-all unseated count the 017 plan records for T1.
    expect(engine.size).toBe(8)
    expect(new Set(drawnUnseated)).toEqual(engine)
    for (const block of blocks.filter(b => b.unseated)) {
      expect(block.strips).toEqual([])
      expect(block.runs).toEqual([])
    }
  })

  it('a kept phase the run left no strips draws unseated and claims nothing', () => {
    const events = {
      K: { ...keptPool(poolResult('K', 0, 600, 700, 2), []), keptStrips: {} },
      D: derived(poolResult('D', 0, 600, 700, 2)),
    }
    const blocks = assignStrips(events, smallConfig(2, 0), comps('K', 'D'))
    expect(only(blocks, 'K')).toMatchObject({ unseated: true, strips: [], runs: [] })
    expect(only(blocks, 'D')).toMatchObject({ unseated: false, strips: [0, 1] })
  })

  it.each([4, -1, 1.5])('a kept index %s outside the day\'s 4 strips throws the named error', strip => {
    const events = { K: keptPool(poolResult('K', 0, 600, 700, 2), [0, strip]) }
    let thrown: unknown
    try {
      assignStrips(events, smallConfig(4, 0), comps('K'))
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(KeptStripOutOfRangeError)
    expect(thrown).toMatchObject({ competitionId: 'K', phase: Phase.POOLS, strip })
  })
})

describe('assignStrips: derived phases take the engine\'s candidate order', () => {
  it('a phase takes the first free non-video strips', () => {
    const events = {
      K: keptPool(poolResult('K', 0, 600, 700, 1), [2]),
      D: derived(poolResult('D', 0, 600, 700, 2)),
    }
    const block = only(assignStrips(events, smallConfig(6, 2), comps('K', 'D')), 'D')
    expect(block.strips).toEqual([3, 4])
    expect(block.unseated).toBe(false)
  })

  it('a phase wider than the free non-video strips spills onto video strips', () => {
    const events = {
      K: keptPool(poolResult('K', 0, 600, 700, 1), [2]),
      D: derived(poolResult('D', 0, 600, 700, 5)),
    }
    const block = only(assignStrips(events, smallConfig(6, 2), comps('K', 'D')), 'D')
    expect(block.strips).toEqual([0, 1, 3, 4, 5])
    expect(block.runs).toEqual([{ first: 0, count: 2 }, { first: 3, count: 3 }])
  })

  it.each([
    ['before', 600, 700],
    ['overlapping', 800, 900],
  ])('under REQUIRED only the round of 16 is video-only: pools %s it take non-video strips', (_name, poolStart, poolEnd) => {
    const result = {
      ...poolResult('R', 0, poolStart, poolEnd, 2),
      de_round_of_16_start: 800, de_round_of_16_end: 900, de_round_of_16_strip_count: 2,
    }
    const competition = makeCompetition({ id: 'R', de_video_policy: VideoPolicy.REQUIRED })
    const blocks = assignStrips({ R: derived(result) }, smallConfig(6, 2), [competition])
    expect(blocks.find(b => b.phase === Phase.POOLS)?.strips).toEqual([2, 3])
    expect(blocks.find(b => b.phase === Phase.DE_ROUND_OF_16)?.strips).toEqual([0, 1])
  })

  it.each([
    [VideoPolicy.REQUIRED, [0, 1]],
    [VideoPolicy.BEST_EFFORT, [2, 3]],
  ])('a round of 16 under %s takes strips %j', (policy, strips) => {
    const result = {
      ...makeScheduleResult('R', 0),
      de_round_of_16_start: 600, de_round_of_16_end: 700, de_round_of_16_strip_count: 2,
    }
    const competition = makeCompetition({ id: 'R', de_video_policy: policy })
    const block = only(assignStrips({ R: derived(result) }, smallConfig(6, 2), [competition]), 'R')
    expect(block.phase).toBe(Phase.DE_ROUND_OF_16)
    expect(block.strips).toEqual(strips)
  })
})

describe('assignStrips: collateral (spec §3)', () => {
  /** Boards whose sweep seats none of the moved phases (B5 seated 0 of 48 when T3 was reviewed). */
  const BOARDS_SEATING_NO_MOVE: ReadonlySet<string> = new Set(['B5'])

  it.each(SCENARIO_IDS)('%s: moving any event to another day moves no kept strip and overlaps nothing', id => {
    const board = runBoard(scenario(id))
    const days = board.config.days_available
    const failures: string[] = []
    let movedSeated = 0
    for (const moved of Object.keys(board.kept.events).sort(compareIds)) {
      const others = keptInputs(board.kept, moved)
      const alone = assignStrips(others, board.config, board.competitions)
      if (alone.length === 0) failures.push(`${moved}: the kept board drew nothing`)
      for (let offset = 1; offset < days; offset++) {
        const day = (board.kept.events[moved].placementKey.day + offset) % days
        const blocks = assignStrips(
          { ...others, [moved]: movedInput(board, moved, day) }, board.config, board.competitions)
        const keptAfter = blocks.filter(b => b.competitionId !== moved)
        if (JSON.stringify(keptAfter) !== JSON.stringify(alone)) failures.push(`${moved}→${day}: kept moved`)
        const clash = overlaps(blocks)
        if (clash.length > 0) failures.push(`${moved}→${day}: ${clash[0]}`)
        movedSeated += blocksOf(blocks, moved).filter(b => !b.unseated).length
      }
    }
    expect(failures).toEqual([])
    // The overlap half is exercised only where moved phases get seats. B5's other days are full,
    // so it seats none of its moved phases and its overlap check holds trivially.
    expect(movedSeated > 0, `${movedSeated} moved phases seated`).toBe(!BOARDS_SEATING_NO_MOVE.has(id))
  })

  it('an unseated phase claims nothing, so a later phase still takes the strips it could not', () => {
    const events = {
      K: keptPool(poolResult('K', 0, 600, 700, 2), [0, 1]),
      A: derived(poolResult('A', 0, 600, 700, 3)),
      B: derived(poolResult('B', 0, 600, 700, 2)),
    }
    const blocks = assignStrips(events, smallConfig(4, 0), comps('K', 'A', 'B'))
    expect(only(blocks, 'A')).toMatchObject({
      unseated: true, strips: [], runs: [],
    })
    expect(only(blocks, 'B')).toMatchObject({ unseated: false, strips: [2, 3] })
  })

  it('a phase with no strips to claim is never unseated', () => {
    const events = { Z: derived(poolResult('Z', 0, 600, 700, 0)) }
    const block = only(assignStrips(events, smallConfig(4, 0), comps('Z')), 'Z')
    expect(block).toMatchObject({ unseated: false, strips: [] })
  })
})

describe('assignStrips: two hand moves on one day (P5, fixed order)', () => {
  const late = derived(poolResult('A-late', 0, 600, 700, 2))
  const early = derived(poolResult('Z-early', 0, 540, 660, 2))
  const two = comps('A-late', 'Z-early')

  it('a moved event alone takes the strips', () => {
    const blocks = assignStrips({ 'A-late': late }, smallConfig(2, 0), two)
    expect(only(blocks, 'A-late')).toMatchObject({ unseated: false, strips: [0, 1] })
  })

  it.each([
    ['later-start first', { 'A-late': late, 'Z-early': early }],
    ['earlier-start first', { 'Z-early': early, 'A-late': late }],
  ])('a second moved event with an earlier start is seated first and unseats it (%s)', (_name, events) => {
    const blocks = assignStrips(events, smallConfig(2, 0), two)
    expect(only(blocks, 'Z-early')).toMatchObject({ unseated: false, strips: [0, 1] })
    expect(only(blocks, 'A-late').unseated).toBe(true)
  })

  it.each([
    ['A first', ['A', 'B']],
    ['B first', ['B', 'A']],
  ])('the event with the earlier start is seated whole before a later event, even when their phases interleave (%s)', (_name, order) => {
    // A: pools 540–600 then DE 700–800, 2 strips each. B: pools 600–750 on all 4.
    // By phase start, B's pools would take all 4 strips before A's DE and unseat it.
    const a = {
      ...poolResult('A', 0, 540, 600, 2),
      de_start: 700, de_end: 800, de_strip_count: 2,
    }
    const inputs: Record<string, DrawnEventInput> = {
      A: derived(a),
      B: derived(poolResult('B', 0, 600, 750, 4)),
    }
    const events = Object.fromEntries(order.map(id => [id, inputs[id]]))
    const blocks = assignStrips(events, smallConfig(4, 0), comps('A', 'B'))
    expect(blocksOf(blocks, 'A').map(b => [b.phase, b.strips])).toEqual([
      [Phase.POOLS, [0, 1]],
      [Phase.DE, [0, 1]],
    ])
    expect(only(blocks, 'B')).toMatchObject({ unseated: true, strips: [] })
  })

  it('at one start the lower id by code point is seated first', () => {
    // 'B' (66) sorts before 'b' (98) by code point; the en locale puts 'b' first.
    const events = {
      'b-event': derived(poolResult('b-event', 0, 600, 700, 2)),
      'B-event': derived(poolResult('B-event', 0, 600, 700, 2)),
    }
    const blocks = assignStrips(events, smallConfig(2, 0), comps('b-event', 'B-event'))
    expect(only(blocks, 'B-event').unseated).toBe(false)
    expect(only(blocks, 'b-event').unseated).toBe(true)
  })
})

describe('assignStrips: days and zero-length phases (review focus 2 and 3)', () => {
  it('a day-0 and a day-1 phase at the same minutes do not contend', () => {
    const events = {
      K: keptPool(poolResult('K', 0, 600, 700, 2), [0, 1]),
      D: derived(poolResult('D', 1, 600, 700, 2)),
    }
    const blocks = assignStrips(events, smallConfig(2, 0), comps('K', 'D'))
    expect(only(blocks, 'D')).toMatchObject({ day: 1, unseated: false, strips: [0, 1] })
  })

  it('a zero-length phase is never offered, drawn or unseated', () => {
    const result = {
      ...poolResult('Z', 0, 600, 700, 2),
      de_round_of_16_start: 800, de_round_of_16_end: 800, de_round_of_16_strip_count: 4,
    }
    const blocks = assignStrips({ Z: derived(result) }, smallConfig(4, 0), comps('Z'))
    expect(blocks.map(b => b.phase)).toEqual([Phase.POOLS])
  })

  it('B8: VET-W-SABRE-IND-V80\'s zero-length round of 16 draws in neither the kept nor the derived board', () => {
    const board = runBoard(scenario('B8'))
    const v80 = 'VET-W-SABRE-IND-V80'
    for (const blocks of [
      assignStrips(keptInputs(board.kept), board.config, board.competitions),
      assignStrips(derivedInputs(board), board.config, board.competitions),
    ]) {
      expect(blocksOf(blocks, v80).length).toBeGreaterThan(0)
      expect(blocksOf(blocks, v80).map(b => b.phase)).not.toContain(Phase.DE_ROUND_OF_16)
    }
  })

  it('an event on a day outside the tournament draws no block', () => {
    const events = {
      X: { ...derived(poolResult('X', 5, 600, 700, 2)), day_out_of_range: true },
      Y: derived(poolResult('Y', 0, 600, 700, 2)),
    }
    const blocks = assignStrips(events, smallConfig(4, 0), comps('X', 'Y'))
    expect(blocks.map(b => b.competitionId)).toEqual(['Y'])
  })
})

describe('assignStrips: runs', () => {
  it('non-contiguous kept strips draw as maximal consecutive runs', () => {
    const events = { K: keptPool(poolResult('K', 0, 600, 700, 6), [7, 0, 1, 2, 8, 5]) }
    const block = only(assignStrips(events, smallConfig(10, 0), comps('K')), 'K')
    expect(block.strips).toEqual([0, 1, 2, 5, 7, 8])
    expect(block.runs).toEqual([{ first: 0, count: 3 }, { first: 5, count: 1 }, { first: 7, count: 2 }])
    expect(block.unseated).toBe(false)
  })

  it('a run starting past strip 0 keeps its own start', () => {
    const events = { K: keptPool(poolResult('K', 0, 600, 700, 2), [4, 5]) }
    const block = only(assignStrips(events, smallConfig(10, 0), comps('K')), 'K')
    expect(block.runs).toEqual([{ first: 4, count: 2 }])
  })
})

describe('assignStrips: capacity edges (moved from the retired lane packer)', () => {
  it('lets two derived phases that never share a minute take the same strips', () => {
    const events = {
      a: derived(poolResult('a', 0, 600, 700, 2)),
      b: derived(poolResult('b', 0, 700, 800, 2)),
    }
    const blocks = assignStrips(events, smallConfig(4, 0), comps('a', 'b'))
    expect(only(blocks, 'a').strips).toEqual([0, 1])
    expect(only(blocks, 'b').strips).toEqual([0, 1])
  })

  it('leaves a phase asking for more strips than the day has unseated', () => {
    const block = only(assignStrips({ big: derived(poolResult('big', 0, 600, 700, 5)) }, smallConfig(4, 0), comps('big')), 'big')
    expect(block).toMatchObject({ unseated: true, strips: [], runs: [], stripCount: 5 })
  })

  it('leaves every phase unseated on a day with no strips', () => {
    const events = { a: derived(poolResult('a', 0, 600, 700, 1)) }
    const block = only(assignStrips(events, smallConfig(0, 0), comps('a')), 'a')
    expect(block.unseated).toBe(true)
  })
})

describe('assignStrips: flighted events', () => {
  it('a derived many-pools flighted event draws both flights, FLIGHT_B after the flight buffer', () => {
    const id = loadFlightedFixture('MANY_POOLS')
    const board = runBoard(() => {})
    const input = movedInput(board, id, board.kept.events[id].placementKey.day)
    const events = { ...keptInputs(board.kept, id), [id]: input }
    const mine = blocksOf(assignStrips(events, board.config, board.competitions), id)

    const flightA = mine.find(b => b.phase === Phase.FLIGHT_A)
    const flightB = mine.find(b => b.phase === Phase.FLIGHT_B)
    expect(flightA, 'FLIGHT_A block').toBeDefined()
    expect(flightB, 'FLIGHT_B block').toBeDefined()
    for (const flight of [flightA!, flightB!]) {
      expect(flight.unseated, `${flight.phase} seated`).toBe(false)
      expect(flight.strips).toHaveLength(flight.stripCount)
    }
    // Moved to its own day and start, the derived FLIGHT_B starts where the scheduler started it.
    const keptFlightB = board.kept.events[id].phases.find(p => p.phase === Phase.FLIGHT_B)
    expect(flightB!.startMinutes).toBe(keptFlightB?.startMinutes)
    // Derive waits out the longer of the admin gap and the flight buffer, so the buffer is a floor.
    expect(flightB!.startMinutes).toBeGreaterThanOrEqual(
      snapToSlot(flightA!.endMinutes + board.config.FLIGHT_BUFFER_MINS))
    expect(mine.map(b => b.phase)).not.toContain(Phase.POOLS)
  })

  it('a one-pool flighted event\'s empty FLIGHT_B is never offered, kept or derived', () => {
    const id = loadFlightedFixture('ONE_POOL')
    const board = runBoard(() => {})
    for (const blocks of [
      assignStrips(keptInputs(board.kept), board.config, board.competitions),
      assignStrips(derivedInputs(board), board.config, board.competitions),
    ]) {
      expect(blocksOf(blocks, id).map(b => b.phase)).toContain(Phase.FLIGHT_A)
      expect(blocksOf(blocks, id).map(b => b.phase)).not.toContain(Phase.FLIGHT_B)
    }
  })
})

describe('assignStrips: output order', () => {
  it('is identical across two calls and whatever order the events arrive in', () => {
    const board = runBoard(scenario('B1'))
    const moved = Object.keys(board.kept.events).sort(compareIds)[0]
    const nextDay = (board.kept.events[moved].placementKey.day + 1) % board.config.days_available
    const events = { ...keptInputs(board.kept, moved), [moved]: movedInput(board, moved, nextDay) }
    const reversed = Object.fromEntries(Object.entries(events).reverse())

    const first = assignStrips(events, board.config, board.competitions)
    expect(first.length).toBeGreaterThan(0)
    expect(assignStrips(events, board.config, board.competitions)).toEqual(first)
    expect(assignStrips(reversed, board.config, board.competitions)).toEqual(first)
  })

  it('lists blocks by day, start, id by code point, then phase order', () => {
    const board = runBoard(scenario('B1'))
    const blocks = assignStrips(derivedInputs(board), board.config, board.competitions)
    expect(blocks.length).toBeGreaterThan(0)
    const sorted = [...blocks].sort((a, b) =>
      a.day - b.day || a.startMinutes - b.startMinutes || compareIds(a.competitionId, b.competitionId))
    expect(blocks).toEqual(sorted)
  })
})
