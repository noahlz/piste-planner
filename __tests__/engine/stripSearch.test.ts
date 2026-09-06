import { describe, it, expect } from 'vitest'
import {
  stripSearchRange, scanStripCounts, searchStripCount,
  type StripCandidate,
} from '../../src/engine/stripSearch.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { aggregateStripHours } from '../../src/engine/capacity.ts'
import { suggestStripCount } from '../../src/engine/analysis.ts'
import { buildStrips } from '../../src/engine/stripBudget.ts'
import { makeConfig, makeCompetition } from '../helpers/factories.ts'
import { buildCompetitions, tournamentConfig, SCENARIOS } from '../helpers/scenarios.ts'
import type { Competition, TournamentConfig } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Fixtures
//
// Every number in the comments below is [M] measured directly, not derived by
// hand (tasks.md standing rule 8) — see the T005 dispatch report for the probe
// that produced them.
// ──────────────────────────────────────────────

/**
 * [MIN] B1 (24 events, days=4) — baseline.md §1 shows every one of the ten
 * measured templates undershoots at its floor, so the floor and the answer
 * differ by construction on any of them. B1 is the cheapest scenario fixture
 * available through the test helpers: floor=36, ceiling=135, answer=48,
 * placed@floor(36)=0, placed@47=20, placed@48=24. A full 36→48 scan (13
 * candidates) runs in ~18ms.
 */
function minBoard(): { comps: Competition[], config: TournamentConfig } {
  return {
    comps: buildCompetitions(SCENARIOS.B1.fencerCounts),
    config: tournamentConfig(4, 80, 12, SCENARIOS.B1.tournamentType),
  }
}

/**
 * [ONE] Four small events (8 fencers each, one pool apiece) at days=4: floor=1,
 * ceiling=2, and scheduleAll at 1 strip already places all four. The one-run
 * path — scanStripCounts must stop after its first candidate here.
 */
function oneRunBoard(): { comps: Competition[], config: TournamentConfig } {
  const config = makeConfig({ days_available: 4 })
  const comps = Array.from({ length: 4 }, (_, i) =>
    makeCompetition({ id: `one-${i}`, fencer_count: 8 }))
  return { comps, config }
}

/**
 * [NONE] One event with a 30-minute window (earliest_start=480, latest_end=510)
 * — too short for any pool round — alongside two ordinary events. floor=1,
 * ceiling=4: every one of the 4 candidates places at most 2 of the 3 events,
 * and the blocked event never places at any count in range.
 */
function noAnswerBoard(): { comps: Competition[], config: TournamentConfig } {
  const config = makeConfig({ days_available: 4 })
  const comps: Competition[] = [
    makeCompetition({ id: 'none-blocked', fencer_count: 20, earliest_start: 480, latest_end: 510 }),
    makeCompetition({ id: 'none-fine-1', fencer_count: 20 }),
    makeCompetition({ id: 'none-fine-2', fencer_count: 20 }),
  ]
  return { comps, config }
}

/** [EMPTY] Every competition has fencer_count 1 — suggestStripCount filters all of them out. */
function emptyBoard(): { comps: Competition[], config: TournamentConfig } {
  const config = makeConfig({ days_available: 4 })
  const comps: Competition[] = [
    makeCompetition({ id: 'e1', fencer_count: 1 }),
    makeCompetition({ id: 'e2', fencer_count: 1 }),
  ]
  return { comps, config }
}

/** Drives a `scanStripCounts` generator to completion, collecting every candidate. */
function drain(
  gen: Generator<StripCandidate, number | null, void>,
): { candidates: StripCandidate[], result: number | null } {
  const candidates: StripCandidate[] = []
  let next = gen.next()
  while (!next.done) {
    candidates.push(next.value)
    next = gen.next()
  }
  return { candidates, result: next.value }
}

describe('stripSearchRange', () => {
  it('is the two named rules — strip-hours floor and the old concurrency ceiling', () => {
    const { comps, config } = minBoard()
    const range = stripSearchRange(comps, config)
    expect(range).not.toBeNull()
    const expectedFloor = Math.max(
      1,
      Math.ceil(
        aggregateStripHours(comps, config).total_strip_hours
        / (config.days_available * config.DAY_LENGTH_MINS / 60),
      ),
    )
    const expectedCeiling = suggestStripCount(comps, config.days_available, config.max_pool_strip_pct)
    expect(range!.floor).toBe(expectedFloor)
    expect(range!.ceiling).toBe(expectedCeiling)
    expect(range!.floor).toBeLessThanOrEqual(range!.ceiling)
  })

  it('returns null when no competition is sizeable enough for suggestStripCount', () => {
    const { comps, config } = emptyBoard()
    expect(stripSearchRange(comps, config)).toBeNull()
  })
})

describe('scanStripCounts', () => {
  it('minimality from both sides: the floor undershoots and the answer is tight in both directions', () => {
    const { comps, config } = minBoard()
    const range = stripSearchRange(comps, config)!
    const { candidates, result } = drain(scanStripCounts(comps, config, range))

    // Precondition: the floor itself must not place every event, or a scan
    // that returned its own starting point would pass this test wrongly.
    expect(candidates[0]!.count).toBe(range.floor)
    expect(candidates[0]!.placesAll).toBe(false)

    expect(result).not.toBeNull()
    const count = result!

    const atCount = scheduleAll(comps, { ...config, strips_total: count, strips: buildStrips(count, config.video_strips_total) })
    const placedAtCount = Object.values(atCount.schedule).filter(r => r.pool_start !== null).length
    expect(placedAtCount).toBe(comps.length)

    const atCountMinusOne = scheduleAll(comps, { ...config, strips_total: count - 1, strips: buildStrips(count - 1, config.video_strips_total) })
    const placedAtCountMinusOne = Object.values(atCountMinusOne.schedule).filter(r => r.pool_start !== null).length
    expect(placedAtCountMinusOne).toBeLessThan(comps.length)
  })

  it('the one-run path: a floor that already places everything yields exactly one candidate', () => {
    const { comps, config } = oneRunBoard()
    const range = stripSearchRange(comps, config)!
    const { candidates, result } = drain(scanStripCounts(comps, config, range))

    expect(candidates).toHaveLength(1)
    expect(candidates[0]!.count).toBe(range.floor)
    expect(candidates[0]!.placesAll).toBe(true)
    expect(result).toBe(range.floor)
  })

  it('absence, not the bound: a board no strip count can place exhausts the range and returns null', () => {
    const { comps, config } = noAnswerBoard()
    const range = stripSearchRange(comps, config)!
    const { candidates, result } = drain(scanStripCounts(comps, config, range))

    expect(result).toBeNull()
    expect(candidates).toHaveLength(range.ceiling - range.floor + 1)
    expect(candidates[candidates.length - 1]!.count).toBe(range.ceiling)
    expect(candidates[candidates.length - 1]!.placesAll).toBe(false)
  })

  it('floor above ceiling throws on the first advance, naming both numbers', () => {
    const { comps, config } = minBoard()
    const gen = scanStripCounts(comps, config, { floor: 12, ceiling: 7 })
    expect(() => gen.next()).toThrow(/12/)
    // A fresh generator, since a thrown generator cannot be advanced again.
    const gen2 = scanStripCounts(comps, config, { floor: 12, ceiling: 7 })
    expect(() => gen2.next()).toThrow(/7/)
  })

  it('placed means what the app means: non-null pool_start, and required is the sizeable-event count', () => {
    const { comps: minComps, config } = minBoard()
    // One unsizeable competition added so `required` (sizeable events) diverges
    // from `competitions.length` — the assertion below has no teeth otherwise,
    // since every measured template's events are all sizeable (baseline.md §1).
    const comps = [...minComps, makeCompetition({ id: 'unsizeable', fencer_count: 1 })]
    const range = stripSearchRange(comps, config)!
    const { candidates } = drain(scanStripCounts(comps, config, range))
    const first = candidates[0]!

    const cfg = { ...config, strips_total: first.count, strips: buildStrips(first.count, config.video_strips_total) }
    const expectedPlaced = Object.values(scheduleAll(comps, cfg).schedule).filter(r => r.pool_start !== null).length
    const expectedRequired = comps.filter(
      c => c.fencer_count >= config.MIN_FENCERS && c.fencer_count <= config.MAX_FENCERS,
    ).length

    expect(first.placed).toBe(expectedPlaced)
    expect(first.required).toBe(expectedRequired)
    expect(expectedRequired).not.toBe(comps.length)
  })
})

describe('searchStripCount', () => {
  it('no sizeable competition returns null', () => {
    const { comps, config } = emptyBoard()
    expect(searchStripCount(comps, config)).toBeNull()
  })

  it('never returns above the old suggestStripCount rule', () => {
    const { comps, config } = minBoard()
    const count = searchStripCount(comps, config)
    const oldRule = suggestStripCount(comps, config.days_available, config.max_pool_strip_pct)
    expect(count).not.toBeNull()
    expect(count!).toBeLessThanOrEqual(oldRule!)
  })

  it('returns null, never the ceiling, when no count places every event', () => {
    const { comps, config } = noAnswerBoard()
    expect(searchStripCount(comps, config)).toBeNull()
  })

  it('is deterministic across repeated calls on the same input', () => {
    const { comps, config } = minBoard()
    const first = searchStripCount(comps, config)
    const second = searchStripCount(comps, config)
    expect(first).toBe(second)
  })
})
