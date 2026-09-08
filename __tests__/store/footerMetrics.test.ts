import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import {
  selectFooterMetrics,
  selectPlacementCounts,
  type FooterMetric,
} from '../../src/store/derived.ts'
import { makePlacement } from '../helpers/factories.ts'
import { CutMode, DeMode } from '../../src/engine/types.ts'

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
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 1, start_time: 480, strip_count: 1 }),
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
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 2 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 2 }),
  })
}

/**
 * One event, two overflowing segments, against a 4-strip total. Both events
 * carry the same 24-fencer, single-stage-DE shape (4 pools, bracket 32), so
 * their pool durations and DE start times land identically — `JR-M-EPEE-IND`
 * (sorted first) asks for 2 pool strips and 3 DE strips and fits both; `JR-W-
 * EPEE-IND` asks for 3 pool strips (only 2 left after JR-M's pool) and 3 DE
 * strips (only 1 left after JR-M's DE) and overflows both times. Measured:
 * `assignStripLanes` marks both of JR-W's segments `overflow: true` and both
 * of JR-M's `false` — one event, two overflowing blocks, the case
 * `computePlacementCounts` must not double-count into `unplaced`.
 */
function twoSegmentOverflow(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(1)
  s.setStrips(4)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    s.updateCompetition(id, {
      fencer_count: 24,
      cut_mode: CutMode.DISABLED,
      de_mode: DeMode.SINGLE_STAGE,
    })
  }
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 2 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 3 }),
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
   * 872 is `ScheduleResult.de_total_end` for JR-M-EPEE-IND — the same figure
   * `scorecardMetrics.test.ts` pinned for `finish:tournament`.
   */
  it('finish:tournament is the latest de_total_end', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(872)
  })

  /** `selectDerivedRefRequirements` for B5 peaks at 116, on day 0. */
  it('refs:peak-total is the peak across days', () => {
    b5()
    expect(metric('refs:peak-total').value).toBe(116)
  })

  /**
   * 52348 strip-minutes used against 151200 available (3 days x 60 strips x
   * 840-minute window).
   */
  it('strips:utilization is used strip-minutes over available, across all in-range blocks', () => {
    b5()
    expect(metric('strips:utilization').value).toBeCloseTo(34.62169312169312, 10)
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
   */
  it('nulls strips:utilization when no strip-minutes are available, while finish still reads', () => {
    zeroStrips()
    expect(metric('strips:utilization').value).toBeNull()
    expect(metric('finish:tournament').value).toBe(905)
  })
})

// ──────────────────────────────────────────────
// day_out_of_range: an event pushed off the canvas
// ──────────────────────────────────────────────

describe('selectFooterMetrics — a placement pushed out of range', () => {
  /**
   * `strips:utilization` moves from 34.62169312169312 (B5 in full) to
   * 31.776455026455025 once CDT-W-FOIL-IND's own strip-minutes drop out of
   * the sum.
   */
  it('drops strips:utilization\'s value once the event is out of range', () => {
    b5()
    const before = metric('strips:utilization').value
    expect(before).toBeCloseTo(34.62169312169312, 10)

    useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 3 })
    const after = metric('strips:utilization').value

    expect(after).toBeCloseTo(31.776455026455025, 10)
    expect(after).not.toBe(before)
  })

  /**
   * B5's finish column ties four ways at 872 (JR-M-EPEE-IND, JR-W-EPEE-IND,
   * CDT-M-EPEE-IND, CDT-W-EPEE-IND); moving any one of them out of range
   * leaves `finish:tournament` at 872. All four have to move to see it drop,
   * to 867 — the next-highest in-range finish.
   */
  it('drops finish:tournament to the next in-range finish once every event tied at the top has moved', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(872)

    for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'CDT-M-EPEE-IND', 'CDT-W-EPEE-IND']) {
      useStore.getState().updatePlacement(id, { day: 3 })
    }

    expect(metric('finish:tournament').value).toBe(867)
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
    // Halving the strips halves the denominator: 52348 / 75600 = 69.2433…
    expect(second.find((m) => m.id === 'strips:utilization')?.value)
      .toBeCloseTo(69.24338624338624, 10)
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

describe('selectPlacementCounts', () => {
  it('measures placed, unplaced and pinned on B5', () => {
    b5()
    const counts = selectPlacementCounts(useStore.getState())
    const selectedCount = Object.keys(useStore.getState().selectedCompetitions).length
    expect(selectedCount).toBe(12)
    // Re-measured 2026-09-07 against the fixed selector (data-model.md §10:
    // "an event the packer could not fit is unplaced whatever the store
    // says"). `assignStripLanes` marks three DE blocks overflowing —
    // JR-M-EPEE-IND, JR-W-EPEE-IND and CDT-W-SABRE-IND, one block each — so
    // `overflowing.size` is 3, not a block count that happened to also be 3.
    // Each of those three events is excluded from `placed` and counted once
    // in `unplaced` instead of twice, so `placed` drops from the prior
    // (incorrect) 12 to 9 and `placed + unplaced` now equals the selected
    // count exactly rather than exceeding it.
    expect(counts).toEqual({ placed: 9, unplaced: 3, pinned: 0 })
    expect(counts.placed + counts.unplaced).toBe(selectedCount)
  })

  /**
   * `updatePlacement` always marks its target `pinned: true` (`store.ts`'s
   * `updatePlacement`, unconditionally, regardless of the partial passed) —
   * the same call a hand-drag or a hand-edit makes. JR-M-EPEE-IND is one of
   * B5's three overflowing events (see the case above), so pinning it in
   * place — day and time unchanged — does not move it out of `unplaced`: it
   * counts once in `pinned` and stays excluded from `placed`.
   */
  it('counts a pinned placement once, in both placed and pinned', () => {
    b5()
    useStore.getState().updatePlacement('JR-M-EPEE-IND', {})

    const counts = selectPlacementCounts(useStore.getState())
    expect(counts.pinned).toBe(1)
    expect(counts.placed).toBe(9)
    // The three baseline overflow events (see the case above) are unaffected
    // by pinning a placement that was already in range.
    expect(counts.unplaced).toBe(3)
  })

  /**
   * `days_available` is 3 for B5, so day 9 is out of range. Moving
   * JR-M-EPEE-IND there drops it from `placed` and adds it to `unplaced` from
   * the placements loop alone — but it also removes its own segments from
   * `assignStripLanes`'s packing for its day (`day_out_of_range` events are
   * skipped there), which frees room that resolves its own overflow and,
   * measured, leaves the other two baseline overflow events (JR-W-EPEE-IND,
   * CDT-W-SABRE-IND) unaffected. Net: 9 placed (12 selected minus the 1
   * out-of-range minus the 2 remaining overflow) and 3 unplaced (1
   * out-of-range plus 2 overflow), not the 11-placed figure a
   * packing-independent count would give.
   */
  it('counts an out-of-range day in unplaced, not placed', () => {
    b5()
    useStore.getState().updatePlacement('JR-M-EPEE-IND', { day: 9 })

    const counts = selectPlacementCounts(useStore.getState())
    expect(counts.placed).toBe(9)
    expect(counts.unplaced).toBe(3)
  })

  /**
   * `oneOverflowBlock` above is built so exactly one segment — one of
   * JR-W-EPEE-IND's — has nowhere to fit. Its placement is in-range, but the
   * overflowing segment excludes it from `placed`: 1 placed (JR-M-EPEE-IND
   * only), 1 unplaced (JR-W-EPEE-IND, once, via `overflowing.size`), and the
   * sum equals the two selected events exactly — an overflowing event is
   * unplaced, not double-counted as both placed and unplaced.
   */
  it('adds exactly one overflow block to unplaced', () => {
    oneOverflowBlock()
    const counts = selectPlacementCounts(useStore.getState())
    const selectedCount = Object.keys(useStore.getState().selectedCompetitions).length

    expect(selectedCount).toBe(2)
    expect(counts.placed).toBe(1)
    expect(counts.unplaced).toBe(1)
    expect(counts.placed + counts.unplaced).toBe(selectedCount)
  })

  /**
   * `twoSegmentOverflow` above is built so JR-W-EPEE-IND's pool *and* DE
   * segments both overflow. Before the fix, `unplaced` summed overflowing
   * *blocks* and would have counted it twice; the fix keys overflow by
   * competition id, so it counts once, in `unplaced`, and is excluded from
   * `placed` — `placed + unplaced` equals the two selected events exactly,
   * the same invariant the single-segment case above measures.
   */
  it('counts an event with two overflowing segments once, in unplaced only', () => {
    twoSegmentOverflow()
    const counts = selectPlacementCounts(useStore.getState())
    const selectedCount = Object.keys(useStore.getState().selectedCompetitions).length

    expect(selectedCount).toBe(2)
    expect(counts.placed).toBe(1)
    expect(counts.unplaced).toBe(1)
    expect(counts.placed + counts.unplaced).toBe(selectedCount)
  })
})
