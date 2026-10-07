import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import {
  RunState,
  selectDrawnSchedule,
  selectFooterMetrics,
  selectPlacementCounts,
  type FooterMetric,
} from '../../src/store/derived.ts'
import { makePlacement } from '../helpers/factories.ts'
import { runAndMoveHeadline } from '../helpers/drawnFixtures.ts'
import { DeMode } from '../../src/engine/types.ts'

/**
 * T011b — `selectFooterMetrics` and `selectPlacementCounts` (research D7;
 * data-model.md §10; tasks.md decision 5).
 *
 * Re-targets `scorecardMetrics.test.ts` (deleted here). The retired
 * scorecard's eleven rows, its collapsed/expanded tiers, its frozen baseline
 * and its per-metric block keys are gone with it (D7) — the footer is three rows,
 * finish/refs/strips, values only. The per-day finish rows, the sabre peak,
 * the day-balance spread and the findings counts have no subject to measure
 * any more, so their cases go with them; the canvas-invariant and
 * duplicate-key cases guarded `blockKeys`, which no longer exists.
 *
 * Every number below is carried over unchanged from `scorecardMetrics.test.ts`,
 * where it was measured on 2026-08-31 by driving the fixture through the
 * app's own path and reading the engine's output — see that file's history
 * (deleted, but in git log) for the full provenance chain. Nothing here is
 * recomputed by the formula the selector uses.
 *
 * 024 group A, 2026-10-06 – the B5 and zero-strip numbers moved with the
 * 2026-27 Operations Manual planning times: pools on the pool-of-7 basis and
 * DEs derived per round from bout time (METHODOLOGY.md §Pool Duration
 * Estimation and §DE Duration, Ops Manual p.17). Each new number was derived
 * by hand from those sections and the scheduler's placements, then confirmed
 * against the engine. B5's placements (days, 08:00 starts, strip budgets) did
 * not move, only their durations.
 *
 * 024 group B, 2026-10-06 – the day moved to 9:00 with a 19:00 soft target
 * and a 600-minute planning day (Ops Manual 2026-27 p.17, METHODOLOGY.md
 * §Inputs and Appendix A §Timing Constants). B5's events start at 9:00, so
 * every finish moves 60 minutes later while each block's length and strip
 * count, and so the strip-minutes used, do not. Utilization's denominator
 * moves from 840-minute days to 600-minute days. The hand-placed fixtures
 * start at the new 9:00 day start (540), as they started at 8:00 before.
 *
 * 024 group D, 2026-10-06 – B5 is re-coloured under the Ops Manual p.20
 * same-day rules (planning attributes the move to D.2, the Junior–Cadet rest
 * day removed; METHODOLOGY.md §Rest Day Preference and §Overlapping-Population
 * Separation). Each day now holds four events: day 0 CDT-W-SABRE, JR-M-EPEE,
 * JR-M-SABRE, JR-W-FOIL; day 1 CDT-M-EPEE, CDT-M-FOIL, CDT-W-EPEE, JR-W-SABRE;
 * day 2 CDT-M-SABRE, CDT-W-FOIL, JR-M-FOIL, JR-W-EPEE. No event's start, strip
 * budget or duration moved, so the finish and utilization numbers hold; the
 * ref peak and the overflow counts move with the day membership.
 */

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

/**
 * B5 (SJCC, 3 days, 60 strips, 12 events) driven through `applyPreset` →
 * `runScheduleAll`, the same route `src/store/boot.ts` takes. All 12 events
 * place (`__tests__/store/appPathParity.test.ts` pins B5 at 12).
 */
function b5(): void {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset('B5')
  runScheduleAll()
}

/** B5's competition set and days, with nothing placed. */
function b5Unplaced(): void {
  useStore.setState(useStore.getInitialState(), true)
  applyPreset('B5')
}

/**
 * Zero strips. The only fixture where strip-minutes available is 0, so it is
 * the one that reaches `strips:utilization === null`.
 */
function zeroStrips(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(0)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    useStore.getState().updateCompetition(id, { fencer_count: 8 })
  }
  useStore.getState().setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 540, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 1, start_time: 540, strip_count: 1 }),
  })
}

/**
 * Two events on one day, both starting at the same minute, each needing 2
 * strips against a 3-strip total. The first (`JR-M-EPEE-IND`, sorted first by
 * `assignStripLanes`'s day/start/competition-id order) fits at strips 0-1; the
 * second (`JR-W-EPEE-IND`) needs a 2-strip run out of the one strip left and
 * overflows. Its DE segment runs later, past its own pools, and does not
 * overlap the other event's pools either, so this is exactly one overflow
 * block — measured, not assumed, by the `selectPlacementCounts` case below.
 */
function oneOverflowBlock(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(1)
  s.setStrips(3)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    useStore.getState().updateCompetition(id, { fencer_count: 8 })
  }
  useStore.getState().setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 540, strip_count: 2 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 540, strip_count: 2 }),
  })
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function metrics(): FooterMetric[] {
  return selectFooterMetrics(useStore.getState())
}

function metric(id: string): FooterMetric {
  const found = metrics().find((m) => m.id === id)
  expect(found, `no metric with id "${id}" — ids present: ${metrics().map((m) => m.id).join(', ')}`)
    .toBeDefined()
  return found as FooterMetric
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

// ──────────────────────────────────────────────
// The metric table (research D7)
// ──────────────────────────────────────────────

describe('selectFooterMetrics — the three rows', () => {
  it('emits exactly the three ids, in order, with the brief\'s kind and a non-empty label', () => {
    b5()
    expect(metrics().map((m) => m.id)).toEqual([
      'finish:tournament',
      'refs:peak-total',
      'strips:utilization',
    ])
    const kinds = Object.fromEntries(metrics().map((m) => [m.id, m.kind]))
    expect(kinds).toEqual({
      'finish:tournament': 'time',
      'refs:peak-total': 'count',
      'strips:utilization': 'percent',
    })
    for (const m of metrics()) {
      expect(m.label, `metric "${m.id}" has no label`).toBeTruthy()
    }
  })

  /**
   * 910 is `ScheduleResult.de_total_end` for JR-M-EPEE-IND (872 before 024,
   * 850 after group A's 8:00 start). 120 épée fencers make 12 pools of 7 and 6
   * of 6, averaging round(108.67) = 109 minutes in one wave on 18 strips: pools
   * 540–649 from the 9:00 start. The DE starts at the next slot after the
   * 30-minute gap, 680, and a bracket of 128 with 120 promoted runs R128 (56
   * bouts, 4 waves on 16 strips), R64 (2), then R32 through the semis (1
   * each), 10 × 20 = 200 minutes to 880, plus the 30-minute tail.
   */
  it('finish:tournament is the latest de_total_end', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(910)
  })

  /**
   * `selectDerivedRefRequirements` for B5 peaks at 118, on day 0 at 9:00 (116
   * before 024 group D). SJCC resolves two refs per pool, and day 0's four pool
   * blocks all start at 540 on 13 + 18 + 18 + 10 = 59 strips: 59 × 2 = 118.
   * Days 1 and 2 hold 58 and 55 pool strips at 9:00, so 116 and 110.
   */
  it('refs:peak-total is the peak across days', () => {
    b5()
    expect(metric('refs:peak-total').value).toBe(118)
  })

  /**
   * 43975 strip-minutes used against 108000 available (3 days x 60 strips x
   * 600-minute day, 9:00–19:00; 151200 on 840-minute days before 024 group B).
   * 52348 used before 024. The 43975 is the sum of each event's pool block
   * (minutes × its strip budget) and DE block (minutes × 16).
   */
  it('strips:utilization is used strip-minutes over available, across all in-range blocks', () => {
    b5()
    expect(metric('strips:utilization').value).toBeCloseTo((43975 / 108000) * 100, 10)
  })
})

// ──────────────────────────────────────────────
// A day that runs past its 19:00 target (024 D7)
// ──────────────────────────────────────────────

describe('selectFooterMetrics — a day that runs past the 19:00 target', () => {
  /**
   * The denominator stays the day window, 9:00 to the 19:00 soft target, even
   * though work may run on to the 22:00 hard end (METHODOLOGY.md §Same-Day
   * Completion). A day past 19:00 can then read above 100%, which is the honest
   * signal (024 D7).
   *
   * One Junior épée event of 8 on 4 strips at the default 9:00–19:00 hours,
   * placed at 17:10. Measured (throwaway probe, 2026-10-06): its pool of 8
   * runs 1030–1190 on 1 strip (160 minutes), and after the 30-minute gap its
   * single-stage DE runs R8 and the semis in one 20-minute wave each on 3
   * strips (the 80% DE cap of 4), 1220–1260, the block ending at 21:00. Used:
   * 160 × 1 + 40 × 3 = 280 strip-minutes. Available: 4 strips × 600 minutes
   * = 2400, so 11.67% – not 280 / (4 × 780) = 8.97% against the hard window.
   */
  it('keeps strips × 600 minutes as the denominator for a block ending at 21:00', () => {
    useStore.setState(useStore.getInitialState(), true)
    const s = useStore.getState()
    s.setTournamentType('NAC')
    s.setDays(1)
    s.setStrips(4)
    s.setVideoStrips(0)
    s.selectCompetitions(['JR-M-EPEE-IND'])
    s.updateCompetition('JR-M-EPEE-IND', { fencer_count: 8 })
    s.setDeModeOverride(DeMode.SINGLE_STAGE)
    s.setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 1030, strip_count: 1 }),
    })
    expect(useStore.getState().dayConfigs).toEqual([{ day_start_time: 540, day_end_time: 1140 }])

    expect(metric('strips:utilization').value).toBeCloseTo((280 / 2400) * 100, 10)
  })
})

// ──────────────────────────────────────────────
// The null cases
// ──────────────────────────────────────────────

describe('selectFooterMetrics — null values', () => {
  it('nulls finish:tournament when nothing is placed, and zeroes the other two', () => {
    b5Unplaced()
    expect(metric('finish:tournament').value).toBeNull()
    expect(metric('refs:peak-total').value).toBe(0)
    expect(metric('strips:utilization').value).toBe(0)
  })

  /**
   * Zero strips: no strip-minutes available at all. The finish metric still
   * reads — only the denominator-dependent one goes null.
   *
   * 840 (905 before 024, 780 from an 8:00 start after group A): one épée pool
   * of 8 is 28 bouts, round(120 × 28/21) = 160 minutes, 540–700 from the 9:00
   * start. A NAC Junior event promotes 6 of 8 into a bracket of 8, below its
   * round-of-16 video stage, so the whole DE is the video block. Its R8 (2
   * bouts) and semis (2) each take 2 waves on the one strip a grant of 0
   * counts as, 4 × 20 = 80 minutes from 730 to 810, plus the 30-minute tail.
   */
  it('nulls strips:utilization when no strip-minutes are available, while finish still reads', () => {
    zeroStrips()
    expect(metric('strips:utilization').value).toBeNull()
    expect(metric('finish:tournament').value).toBe(840)
  })
})

// ──────────────────────────────────────────────
// day_out_of_range: an event pushed off the canvas
// ──────────────────────────────────────────────

describe('selectFooterMetrics — a placement pushed out of range', () => {
  /**
   * `strips:utilization` moves from 43975 / 108000 (B5 in full) to
   * 40535 / 108000 once CDT-W-FOIL-IND's own 3440 strip-minutes (pools
   * 120 × 10, DE 140 × 16) drop out of the sum. 108000 is 3 days × 60 strips
   * × the 600-minute day (024 group B).
   */
  it('drops strips:utilization\'s value once the event is out of range', () => {
    b5()
    const before = metric('strips:utilization').value
    expect(before).toBeCloseTo((43975 / 108000) * 100, 10)

    useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 3 })
    const after = metric('strips:utilization').value

    expect(after).toBeCloseTo((40535 / 108000) * 100, 10)
    expect(after).not.toBe(before)
  })

  /**
   * B5's finish column ties three ways at 910 (JR-M-EPEE-IND, JR-M-FOIL-IND,
   * CDT-M-EPEE-IND, the three 120-fencer foil and épée events, whose pool and
   * DE times are equal since 024); moving any one of them out of range leaves
   * `finish:tournament` at 910. All three have to move to see it drop, to 860 —
   * the next-highest in-range finish, JR-W-FOIL-IND's and CDT-W-FOIL-IND's
   * (10 pools of 7 from 540 to 660, the DE from 690, 7 waves to 830, plus the
   * tail).
   */
  it('drops finish:tournament to the next in-range finish once every event tied at the top has moved', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(910)

    for (const id of ['JR-M-EPEE-IND', 'JR-M-FOIL-IND', 'CDT-M-EPEE-IND']) {
      useStore.getState().updatePlacement(id, { day: 3 })
    }

    expect(metric('finish:tournament').value).toBe(860)
  })
})

// ──────────────────────────────────────────────
// Purity and memoization
// ──────────────────────────────────────────────

describe('selectFooterMetrics — pure function of store inputs', () => {
  it('returns the identical reference across calls when nothing changed', () => {
    b5()
    const first = selectFooterMetrics(useStore.getState())
    const second = selectFooterMetrics(useStore.getState())
    expect(second).toBe(first)
  })

  it('ignores a store change outside scheduleDeps', () => {
    b5()
    const first = selectFooterMetrics(useStore.getState())
    // undismissFinding always calls set(), replacing Zustand's top-level
    // state object, but dismissedFindings is not a scheduleDeps entry.
    useStore.getState().undismissFinding('never-dismissed')
    expect(selectFooterMetrics(useStore.getState())).toBe(first)
  })

  it('recomputes once a depended-on input changes', () => {
    b5()
    const first = selectFooterMetrics(useStore.getState())
    useStore.getState().setStrips(30)
    const second = selectFooterMetrics(useStore.getState())

    expect(second).not.toBe(first)
    // Halving the strips halves the denominator: 43975 / (3 × 30 × 600) =
    // 43975 / 54000 = 81.435…
    expect(second.find((m) => m.id === 'strips:utilization')?.value)
      .toBeCloseTo((43975 / 54000) * 100, 10)
  })

  it('writes nothing back to the store', () => {
    b5()
    const before = useStore.getState()
    selectFooterMetrics(before)
    // Any set() call would hand back a new top-level object.
    expect(useStore.getState()).toBe(before)
  })
})

// ──────────────────────────────────────────────
// selectPlacementCounts (data-model.md §10)
// ──────────────────────────────────────────────

/**
 * 017 T5a (spec §2, §4): the counts read the drawn model. An event is unplaced
 * when it has no in-range placement, or a block the model counts as unplaced
 * (unseated on a fresh board). The lane packer's overflow no longer counts, so
 * the B5 run that read 8 / 4 (four 16-strip DE blocks with no contiguous free
 * run among 60 strips) reads the engine's 12 / 0.
 */
describe('selectPlacementCounts', () => {
  it('measures placed, unplaced and pinned on B5', () => {
    b5()
    const counts = selectPlacementCounts(useStore.getState())
    const selectedCount = Object.keys(useStore.getState().selectedCompetitions).length
    expect(selectedCount).toBe(12)
    expect(counts).toEqual({ placed: 12, unplaced: 0, pinned: 0 })
  })

  /**
   * `updatePlacement` always marks its target `pinned: true` (`store.ts`'s
   * `updatePlacement`, unconditionally, regardless of the partial passed) —
   * the same call a hand-drag or a hand-edit makes. Pinning an event in place
   * – day and time unchanged – keeps it on the run's strips (the pin flag is
   * not part of the kept key), so it counts once in `pinned` and moves neither
   * `placed` nor `unplaced`.
   */
  it('counts a pinned placement once in pinned, leaving placed and unplaced unchanged', () => {
    b5()
    useStore.getState().updatePlacement('JR-M-EPEE-IND', {})

    expect(selectPlacementCounts(useStore.getState())).toEqual({ placed: 12, unplaced: 0, pinned: 1 })
  })

  /**
   * B5's headline move (CDT-M-EPEE-IND to the next day) leaves its POOLS and
   * DE without free strips around the kept events. One event with two
   * unseated phases counts once, in `unplaced`, and once in `pinned`, since
   * Move day pins it. Before 017 the same once-per-event rule was pinned
   * against two overflowing packer segments (`twoSegmentOverflow`).
   */
  it('counts a hand-moved event with two unseated phases once, in unplaced and in pinned', () => {
    const { id } = runAndMoveHeadline('B5')
    const state = useStore.getState()
    const counted = selectDrawnSchedule(state).blocks.filter((b) => b.competitionId === id && b.countsAsUnplaced)
    expect(counted.length, 'premise: two of the mover\'s phases are unseated').toBe(2)

    expect(selectPlacementCounts(state)).toEqual({ placed: 11, unplaced: 1, pinned: 1 })
  })

  /**
   * `days_available` is 3 for B5, so day 9 is out of range. Moving
   * JR-M-EPEE-IND there drops it from `placed` and adds it to `unplaced`.
   * Every other event stays kept on its run strips, so nothing else moves.
   */
  it('counts an out-of-range day in unplaced, not placed', () => {
    b5()
    useStore.getState().updatePlacement('JR-M-EPEE-IND', { day: 9 })

    const counts = selectPlacementCounts(useStore.getState())
    expect(counts.placed).toBe(11)
    expect(counts.unplaced).toBe(1)
  })

  /**
   * `oneOverflowBlock` above is built so one of JR-W-EPEE-IND's phases has
   * nowhere to fit. Its placements are written with no run, so the board is
   * stale, and a stale board is not a schedule: its unseated phases are not
   * counted as unplaced (017 P4 (a)). Before 017 this case read 1 / 1 from
   * the packer's overflow.
   */
  it('counts an unseated event as placed on a stale board', () => {
    oneOverflowBlock()
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: a board that was never run is stale').toBe(RunState.STALE)
    expect(model.blocks.some((b) => b.competitionId === 'JR-W-EPEE-IND' && b.unseated), 'premise: JR-W-EPEE-IND draws unseated').toBe(true)

    expect(selectPlacementCounts(state)).toEqual({ placed: 2, unplaced: 0, pinned: 0 })
  })
})
