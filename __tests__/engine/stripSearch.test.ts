import { describe, it, expect } from 'vitest'
import {
  stripSearchRange, scanStripCounts, searchStripCount,
  busiestDayCompetitors, manualBaselineStrips,
  type StripCandidate,
} from '../../src/engine/stripSearch.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { aggregateStripHours } from '../../src/engine/capacity.ts'
import { suggestStripCount } from '../../src/engine/analysis.ts'
import { buildStrips } from '../../src/engine/stripBudget.ts'
import { makeConfig, makeCompetition } from '../helpers/factories.ts'
import { buildCompetitions, tournamentConfig, SCENARIOS } from '../helpers/scenarios.ts'
import { dayStart, EventType } from '../../src/engine/types.ts'
import type { Competition, TournamentConfig, PinnedPlacement } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// Fixtures
//
// Every number in the comments below is [M] measured directly, not derived by
// hand (tasks.md standing rule 8) — see the floor and ceiling pins in
// `stripSearchRange`'s test below, measured by the same probe that produced
// the numbers in this file's comments.
// ──────────────────────────────────────────────

/**
 * [MIN] B1 (24 events, days=4): strip-hour floor 34, manual baseline 53,
 * floor=53, ceiling=135, answer=53, so the scan is one candidate (53: 24/24).
 *
 * 024 group B, 2026-10-06 – floor 25 → 53 and answer 45 → 53. The floor is
 * now max(strip-hour floor, manual baseline) (Ops Manual 2026-27 p.17,
 * METHODOLOGY.md §Strip Count Suggestion). B1's 2910 competitors spread
 * largest-first over 4 days give 730 | 730 | 730 | 720, so the baseline is
 * ceil(730 / 14) = 53. The strip-hour floor moves 25 → 34 on the 600-minute
 * planning day (§Strip-Hour Capacity): ceil(1358.1 / (4 × 10)) = 34. 53 is
 * the plan's measured B1 `stripRecommendation` at row B.2. The floor no longer
 * undershoots on B1, so the minimality test runs on `undershootBoard` (B5
 * since 024 group D, B4 before it).
 *
 * 024, 2026-10-06 – floor 35 → 25 and answer 48 → 45 under the 2026-27 Ops
 * Manual planning times (p.17; METHODOLOGY.md §Pool Duration Estimation, §DE
 * Duration, §DE Capacity Estimation). Pools rebase to the pool of 7 and DEs
 * bill bouts × bout time, with a staged event's video-stage bouts on the video
 * budget only, so B1's general strip-hours fall to 1358.1 – an independent
 * recomputation from those sections, not from capacity.ts, gives the same
 * total and ceil(1358.1 / (4 × 14)) = 25. The answer 45 is the plan's
 * measured B1 `stripRecommendation` after group A. It is now the pool count
 * of D1-M-EPEE-IND (310 fencers, ceil(310/7) = 45 pools), so 44 places none.
 *
 * 015, 2026-10-05 – these moved from floor 36, placed@47=20 and a 13-candidate
 * scan because the converged factory stages every NAC event's DE (the app's
 * per-type DE mode) where the old factory staged only the 12 individual events
 * with required video. B1 is a NAC, so the DE mode is the one rule that changed
 * its events (the referee policy moved AUTO → TWO, which scores the same 2 refs
 * per pool). A probe rebuilt B1 with only `de_mode` reverted to the old rule
 * and got back floor 36 and placed@47=20.
 */
function minBoard(): { comps: Competition[], config: TournamentConfig } {
  return {
    comps: buildCompetitions(SCENARIOS.B1.fencerCounts, SCENARIOS.B1.tournamentType),
    config: tournamentConfig(4, 80, 12, SCENARIOS.B1.tournamentType),
  }
}

/**
 * [UNDER] B5 (12 events, days=3, SJCC): the cheapest board whose floor still
 * undershoots after group D. Its 1160 competitors spread largest first over
 * 3 days give 390 | 390 | 380, so the manual baseline is ceil(390 / 14) = 28,
 * above the strip-hour floor ceil(592.05 / (3 × 10)) = 20, so floor=28. The
 * answer is 29, the plan's measured B5 `stripRecommendation` at row D, and
 * [M] placed@28 = 11 of 12 (CDT-W-SABRE-IND unplaced). A two-candidate scan
 * (B2, the other undershooting board, has 24 events: floor 75, answer 77).
 *
 * 024 group D, 2026-10-06 – moved from B4. Group D's same-day rules bring B4's
 * answer down to its floor of 74 and B8's to its floor of 56, so neither
 * undershoots any more, while dropping the Junior–Cadet rest day (METHODOLOGY.md
 * §Rest Day Preference) takes B5's answer 28 → 29 over the same floor.
 */
function undershootBoard(): { comps: Competition[], config: TournamentConfig } {
  const s = SCENARIOS.B5
  return {
    comps: buildCompetitions(s.fencerCounts, s.tournamentType),
    config: tournamentConfig(s.days, s.strips, s.videoStrips, s.tournamentType),
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

/**
 * [BASE] Ten 20-fencer events (3 pools each) on one day: 200 competitors, so a
 * manual baseline of ceil(200 / 14) = 15, and a pool ceiling of
 * ceil(30 / 0.80) = 38. The baseline test asserts the strip-hour floor sits
 * below 15 rather than pinning it.
 */
function baselineBoard(): { comps: Competition[], config: TournamentConfig } {
  const config = makeConfig({ days_available: 1 })
  const comps = Array.from({ length: 10 }, (_, i) =>
    makeCompetition({ id: `base-${i}`, fencer_count: 20 }))
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
  it('is the named rules — max(strip-hours floor, manual baseline) and the old concurrency ceiling', () => {
    const { comps, config } = minBoard()
    const range = stripSearchRange(comps, config)
    expect(range).not.toBeNull()
    const stripHourFloor = Math.max(
      1,
      Math.ceil(
        aggregateStripHours(comps, config).total_strip_hours
        / (config.days_available * config.DAY_LENGTH_MINS / 60),
      ),
    )
    const expectedCeiling = suggestStripCount(comps, config.days_available, config.max_pool_strip_pct)
    expect(range!.floor).toBe(Math.max(stripHourFloor, manualBaselineStrips(comps, config)))
    expect(range!.ceiling).toBe(expectedCeiling)
    expect(range!.floor).toBeLessThanOrEqual(range!.ceiling)

    // [M] measured pins, not recomputed: a formula built from the same two
    // functions the implementation calls cannot fail when either regresses.
    // These are the literal B1 (days=4) numbers T005's probe measured.
    // 015, 2026-10-05 – floor 36 → 35 with the ceiling unchanged at 135: the
    // converged factory stages every NAC event's DE (see `minBoard`).
    // 024, 2026-10-06 – floor 35 → 25, ceiling unchanged: the 2026-27 planning
    // times (see `minBoard`).
    // 024 group B, 2026-10-06 – floor 25 → 53, ceiling unchanged: the
    // strip-hour floor is ceil(1358.1 / (4 × 10)) = 34 on the 600-minute day,
    // and the manual baseline ceil(730 / 14) = 53 is above it (see `minBoard`).
    expect(stripHourFloor).toBe(34)
    expect(range!.floor).toBe(53)
    expect(range!.ceiling).toBe(135)
  })

  it('returns null when no competition is sizeable enough for suggestStripCount', () => {
    const { comps, config } = emptyBoard()
    expect(stripSearchRange(comps, config)).toBeNull()
  })

  // 024, 2026-10-06 – the floor is max(strip-hour floor, manual baseline)
  // (Ops Manual 2026-27 p.17, METHODOLOGY.md §Strip Count Suggestion).
  it('starts at the manual baseline when it is above the strip-hour floor', () => {
    const { comps, config } = baselineBoard()
    const stripHourFloor = Math.ceil(
      aggregateStripHours(comps, config).total_strip_hours
      / (config.days_available * config.DAY_LENGTH_MINS / 60),
    )
    // Precondition: the baseline, ceil(200 / 14) = 15, is the larger of the two,
    // so a range that kept the strip-hour floor alone would start lower.
    expect(stripHourFloor).toBeLessThan(15)

    const range = stripSearchRange(comps, config)!
    expect(range.floor).toBe(15)
    // Ten 20-fencer events, 3 pools each, one day: ceil(30 / 0.80) = 38.
    expect(range.ceiling).toBe(38)
  })

  it('widens the window to [floor, floor + pool ceiling] when the floor is above the pool ceiling', () => {
    // A one-hour capacity day pushes the strip-hour floor far above the 38-strip
    // pool ceiling. The window then runs from the floor for one pool ceiling
    // more (024 D7), where it used to be a backwards range that threw.
    const { comps, config: base } = baselineBoard()
    const config: TournamentConfig = { ...base, DAY_LENGTH_MINS: 60 }
    const stripHourFloor = Math.ceil(aggregateStripHours(comps, config).total_strip_hours / 1)
    expect(stripHourFloor).toBeGreaterThan(38)

    const range = stripSearchRange(comps, config)!
    expect(range).toEqual({ floor: stripHourFloor, ceiling: stripHourFloor + 38 })
    const first = scanStripCounts(comps, config, range).next()
    expect(first.done).toBe(false)
    expect((first.value as StripCandidate).count).toBe(stripHourFloor)
  })
})

describe('busiestDayCompetitors', () => {
  it('spreads largest first, each event into the day with the fewest competitors so far', () => {
    // Listed smallest first on purpose. Largest first over 2 days: 70 | 42 + 35,
    // busiest 77. Filling in list order would give 35 + 70 | 42 = 105, and an
    // even split of the total would give 73.5.
    const comps = [35, 42, 70].map((n, i) => makeCompetition({ id: `c${i}`, fencer_count: n }))
    expect(busiestDayCompetitors(comps, makeConfig({ days_available: 2 }))).toBe(77)
  })

  it('counts a team event its entries as stored, one per team', () => {
    const comps = [
      makeCompetition({ id: 'team', event_type: EventType.TEAM, fencer_count: 12 }),
      makeCompetition({ id: 'ind', fencer_count: 20 }),
    ]
    expect(busiestDayCompetitors(comps, makeConfig({ days_available: 1 }))).toBe(32)
  })

  it('leaves out every competition outside MIN_FENCERS–MAX_FENCERS, as aggregateStripHours does', () => {
    const config = makeConfig({ days_available: 1 })
    const comps = [
      makeCompetition({ id: 'zero', fencer_count: 0 }),
      makeCompetition({ id: 'one', fencer_count: 1 }),
      makeCompetition({ id: 'over', fencer_count: config.MAX_FENCERS + 1 }),
      makeCompetition({ id: 'fine', fencer_count: 40 }),
    ]
    expect(busiestDayCompetitors(comps, config)).toBe(40)
  })
})

describe('manualBaselineStrips', () => {
  it('is the busiest day ÷ 14 rounded up, and does not scale when the organizer edits the hours', () => {
    // 150 competitors on one day: 150 / 14 = 10.7, so 11.
    const comps = [80, 70].map((n, i) => makeCompetition({ id: `m${i}`, fencer_count: n }))
    const config = makeConfig({ days_available: 1 })
    expect(manualBaselineStrips(comps, config)).toBe(11)

    // A widened 8:00–21:00 day changes the capacity day and the window, never
    // the divisor: 14 is competitors per strip per day, not a day length.
    const widened: TournamentConfig = {
      ...config,
      DAY_LENGTH_MINS: 780,
      dayConfigs: [{ day_start_time: 480, day_end_time: 1260, day_hard_end_time: 1320 }],
    }
    expect(manualBaselineStrips(comps, widened)).toBe(11)
  })
})

describe('scanStripCounts', () => {
  it('minimality from both sides: the floor undershoots and the answer is tight in both directions', () => {
    // B5, not B1: under group B's manual baseline B1's floor is its answer
    // (see `minBoard` and `undershootBoard`).
    const { comps, config } = undershootBoard()
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
    // since every measured template's events are all sizeable (specs/012-actionable-strip-suggestion/baseline.md §1 (removed; git show 0ab5bd2dc9:specs/012-actionable-strip-suggestion/baseline.md)).
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

// ──────────────────────────────────────────────
// T033 (dispatch D) — the search threading a `pinned` argument (phase6-contract
// §8). `searchStripCount` and `scanStripCounts` now take the argument for real
// (T034), so the casts the red version needed are gone.
//
// What the search counts as placed changed with them, and the change is what
// this case measures. A pin keeps its day and start whether or not it finds
// free strips, so its `pool_start` is never null and a pinned overflow is
// invisible to the old rule — worse, a pin that claims nothing consumes
// nothing, so the same board reads as *cheaper* with pins on it than without.
// `scanStripCounts` therefore subtracts every pin carrying a
// `PINNED_UNCLAIMED` bottleneck (research D1: "the smallest count that places
// every event around the pins").
// ──────────────────────────────────────────────

describe('search and schedule threading pins (T033)', () => {
  it('the answer accounts for the pins, and every pin lands at its own day and start', () => {
    const { comps, config } = minBoard()

    // [M] measured directly against this worktree, never predicted. The
    // no-pins answer on this board is 53. These two events' natural placement
    // there is D1-M-EPEE-IND day0@0 and D1-M-FOIL-IND day1@1440, so neither is
    // at day0@180 and pinning both there genuinely relocates both.
    //
    // 024 group B, 2026-10-06 – the no-pins answer 45 → 53, the manual
    // baseline ceil(730 / 14) (see `minBoard`), and FOIL's natural start
    // day1@840 → day1@1440 because the fallback day axis is now spaced 1440
    // apart (D7). The pinned answer stays 83.
    //
    // Their pool asks are 45 and 38 strips — `strips_allocated` and `n_pools`
    // agree here, since the ledger factory sizes both from the fencer count
    // (310 and 260 fencers). Pinned to the same minute they want 45 + 38 = 83
    // strips at once, well past the 53 the unpinned board needs, and [M] 83 is
    // exactly what the search returns: at 83 the pool cap is floor(0.8 × 83) =
    // 66, so neither ask is capped and the two fit the board exactly. At 82 the
    // board is one strip short and the later pin in (day, start, id) order —
    // FOIL, since 'D1-M-EPEE-IND' < 'D1-M-FOIL-IND' — cannot claim its pools.
    //
    // 024, 2026-10-06 – the pin moved from day0@300 to day0@180. Under the
    // 2026-27 DE times (Ops Manual p.17; METHODOLOGY.md §DE Duration, §DE Phase
    // Breakdown) D1-M-EPEE-IND is the spec's worked example: 248 promoted,
    // bracket 256, prelims 300 min on 16 strips and a video block of 80 min.
    // From 300 its pools end at 416 (116-min pool round), prelims run 450–750
    // and the video block 780–860, past the 840-minute day, so the pin could
    // never claim its video block at any count and the search returned null.
    // From 180 the video block ends at 740 and the tail at 770, which also
    // fits the 780-minute hard window group B brings.
    //
    // Four pins were tried first and can never have an answer: 45 + 38 + 30 +
    // 32 = 145 strips at one minute against a ceiling of 135.
    const pinDay = 0
    const pinOffset = 180 // multiple of SLOT_MINS (5)
    const pinStart = dayStart(pinDay, config) + pinOffset
    const pinnedIds = ['D1-M-EPEE-IND', 'D1-M-FOIL-IND']
    const pins: PinnedPlacement[] = pinnedIds.map(id => {
      const comp = comps.find(c => c.id === id)!
      return { competition_id: id, day: pinDay, start_time: pinStart, strip_count: comp.strips_allocated }
    })
    expect(pins.map(p => p.strip_count)).toEqual([45, 38])

    const noPinsAnswer = searchStripCount(comps, config)
    expect(noPinsAnswer).toBe(53)

    const n = searchStripCount(comps, config, pins)
    expect(typeof n).toBe('number')
    expect(n!).toBeGreaterThanOrEqual(noPinsAnswer!)

    const cfgAtN: TournamentConfig = {
      ...config, strips_total: n!, strips: buildStrips(n!, config.video_strips_total),
    }
    const atN = scheduleAll(comps, cfgAtN, pins)
    for (const comp of comps) {
      expect(atN.schedule[comp.id]!.pool_start).not.toBeNull()
    }
    for (const pin of pins) {
      const result = atN.schedule[pin.competition_id]!
      expect(result.assigned_day).toBe(pin.day)
      expect(result.pool_start).toBe(pin.start_time)
    }
    // Every pin claimed every phase — that is what makes `n` the count the
    // organizer can actually apply.
    expect(atN.bottlenecks.filter(b => b.cause === 'PINNED_UNCLAIMED')).toEqual([])

    const floor = stripSearchRange(comps, config)!.floor
    if (n! - 1 >= floor) {
      const cfgAtNMinusOne: TournamentConfig = {
        ...config, strips_total: n! - 1, strips: buildStrips(n! - 1, config.video_strips_total),
      }
      const atNMinusOne = scheduleAll(comps, cfgAtNMinusOne, pins)
      const placedCount = comps.filter(c => atNMinusOne.schedule[c.id]!.pool_start !== null).length
      const unclaimed = atNMinusOne.bottlenecks.filter(b => b.cause === 'PINNED_UNCLAIMED')
      // One strip fewer and the count stops working — either an event loses its
      // pool start, or a pin can no longer claim at its own time.
      expect(placedCount < comps.length || unclaimed.length > 0).toBe(true)
    }
  })
})
