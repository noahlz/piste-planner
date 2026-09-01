import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import {
  selectDerivedSchedule,
  selectScorecardMetrics,
  type ScorecardMetric,
} from '../../src/store/derived.ts'
import { assignStripLanes } from '../../src/components/canvas/lanes.ts'
import { makePlacement } from '../helpers/factories.ts'

/**
 * T045 — `selectScorecardMetrics` (S6 design brief §3).
 *
 * Every number below was **measured** on 2026-08-31 by driving the fixture
 * through the app's own path and reading the engine's output, then pinned
 * here as a literal. Nothing is recomputed by the formula the selector uses:
 * a test that re-derives its own expectation from the implementation's
 * arithmetic passes no matter what that arithmetic says, which is one of the
 * six vacuity shapes this feature has already been bitten by.
 *
 * Where a number came from is recorded beside it — the engine field it reads
 * off (`ScheduleResult.de_total_end`, `RefRequirementsByDay.peak_total_refs`,
 * …) and the fixture that produced it.
 */

// ──────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────

/**
 * B5 (SJCC, 3 days, 60 strips, 12 events) driven through `applyPreset` →
 * `runScheduleAll`, the same route `src/store/boot.ts` takes. All 12 events
 * place (`__tests__/store/appPathParity.test.ts` pins B5 at 12), so this is
 * the fixture the full metric table is measured on.
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

/** One day, one event — the `days:balance-spread` "fewer than 2 usable days" case. */
function singleDay(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(1)
  s.setStrips(20)
  s.setVideoStrips(4)
  s.selectCompetitions(['JR-M-EPEE-IND'])
  useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })
  useStore.getState().setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
  })
}

/**
 * Two days, but day 1's window is zero-length. `days_available` is 2 and
 * `dayConfigs` has two entries, so a spread computed over `days_available`
 * rather than over days with a positive window would return a number here
 * instead of null.
 */
function twoDaysOneUsable(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(2)
  s.setStrips(20)
  s.setVideoStrips(4)
  s.selectCompetitions(['JR-M-EPEE-IND'])
  useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })
  useStore.getState().updateDayConfig(1, { day_start_time: 600, day_end_time: 600 })
  useStore.getState().setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
  })
}

/**
 * Three competitions selected, two placed on the same day, one strip.
 *
 * Built to exercise the two findings shapes a hand-made fixture normally
 * misses (design brief §3, §6.2), both confirmed by dumping
 * `selectDerivedFindings` for this exact state:
 *
 * - `STRIP_CONTENTION` on `Phase.CAPACITY` arrives with an **empty**
 *   `competition_id` (`src/engine/analysis.ts:77-79`). It is counted and
 *   contributes no block keys.
 * - `JR-M-FOIL-IND` is selected but **unplaced**, so the three findings that
 *   name it (`video-dead-config`, `r16-over-cap`,
 *   `STRIP_DEFICIT_NO_FLIGHTING`) are counted and contribute no block keys
 *   either — it has no derived event and therefore no segments.
 *
 * `strips_total` is what makes the config constrained. Shrinking a fencer
 * count instead would throw out of `computePoolStructure`
 * (`src/engine/pools.ts:25`), which `initialAnalysis` calls for every
 * selected competition.
 */
function contendedTwoPlaced(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(1)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND']) {
    useStore.getState().updateCompetition(id, { fencer_count: 8 })
  }
  useStore.getState().setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
  })
}

/**
 * Zero strips. The only fixture where strip-minutes available is 0, so it is
 * the one that reaches `strips:utilization === null` and
 * `days:balance-spread === null` by way of "no usable day" rather than "one
 * day". It is also the only fixture with ERROR-severity findings, and one of
 * them (`strips-total-positive`) carries `subjects: ['strips_total']` — a
 * subject that is not a selected competition id and must contribute no keys.
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
 * Two events on day 0, the second starting the minute the first's pools end.
 * `sweepLine` takes a start before an end at a shared minute, so 575 is both
 * day 0's peak minute and the end of JR-M-SABRE-IND's pools — the state
 * `blocksOpenAt`'s half-open `[start, end)` exists to get right and that B5
 * never reaches.
 *
 * Found by grid search over `(strips, fencerCount, startB)` and measured
 * 2026-08-31: `peak_total_refs` 8 at `peak_time` 575, with
 * JR-M-SABRE-IND:POOLS at 480-575 and JR-W-EPEE-IND:POOLS at 575-799.
 */
function peakAtABlockBoundary(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(2)
  s.setStrips(6)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-SABRE-IND', 'JR-W-EPEE-IND'])
  useStore.getState().updateCompetition('JR-M-SABRE-IND', { fencer_count: 20 })
  useStore.getState().updateCompetition('JR-W-EPEE-IND', { fencer_count: 8 })
  useStore.getState().setPlacementsFromAuto({
    'JR-M-SABRE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 3 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 575, strip_count: 3 }),
  })
}

/**
 * B5, then CDT-W-FOIL-IND's placement moved to day 3. `days_available` is 3,
 * so days 0-2 are the only valid range and day 3 sets
 * `derived.day_out_of_range` (`src/engine/derive.ts:247`). The event still
 * derives a `ScheduleResult` — the flag only marks the placement, it does not
 * stop derivation — but `assignStripLanes` draws it no row
 * (`src/components/canvas/lanes.ts:138-144`), and the selector's own two
 * `day_out_of_range` skips (`scorecardBlocks`, `src/store/derived.ts:277`,
 * and `latestFinish`, `src/store/derived.ts:341`) are built to agree with it.
 */
function b5OneOutOfRange(): void {
  b5()
  useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 3 })
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function metrics(): ScorecardMetric[] {
  return selectScorecardMetrics(useStore.getState())
}

function metric(id: string): ScorecardMetric {
  const found = metrics().find((m) => m.id === id)
  expect(found, `no metric with id "${id}" — ids present: ${metrics().map((m) => m.id).join(', ')}`)
    .toBeDefined()
  return found as ScorecardMetric
}

/** Sorted so an assertion pins the key *set*, not the selector's emission order. */
function keys(id: string): string[] {
  return [...metric(id).blockKeys].sort()
}

/** Every `${competitionId}:${phase}` the canvas actually draws for this state. */
function canvasKeys(): string[] {
  const state = useStore.getState()
  const schedule = selectDerivedSchedule(state)
  return assignStripLanes(schedule.events, state.strips_total)
    .map((b) => `${b.competitionId}:${b.phase}`)
}

/** B5's 24 drawn blocks — 12 events, each a POOLS and a DE segment. */
const B5_ALL_KEYS = [
  'CDT-M-EPEE-IND:DE', 'CDT-M-EPEE-IND:POOLS',
  'CDT-M-FOIL-IND:DE', 'CDT-M-FOIL-IND:POOLS',
  'CDT-M-SABRE-IND:DE', 'CDT-M-SABRE-IND:POOLS',
  'CDT-W-EPEE-IND:DE', 'CDT-W-EPEE-IND:POOLS',
  'CDT-W-FOIL-IND:DE', 'CDT-W-FOIL-IND:POOLS',
  'CDT-W-SABRE-IND:DE', 'CDT-W-SABRE-IND:POOLS',
  'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
  'JR-M-FOIL-IND:DE', 'JR-M-FOIL-IND:POOLS',
  'JR-M-SABRE-IND:DE', 'JR-M-SABRE-IND:POOLS',
  'JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS',
  'JR-W-FOIL-IND:DE', 'JR-W-FOIL-IND:POOLS',
  'JR-W-SABRE-IND:DE', 'JR-W-SABRE-IND:POOLS',
]

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

// ──────────────────────────────────────────────
// The metric table (design brief §3)
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — the metric table on B5', () => {
  it('emits exactly the brief\'s ids, in render order, with collapsed rows first', () => {
    b5()
    expect(metrics().map((m) => m.id)).toEqual([
      'finish:tournament',
      'refs:peak-total',
      'finish:day:0',
      'finish:day:1',
      'finish:day:2',
      'refs:peak-sabre',
      'strips:utilization',
      'days:balance-spread',
      'findings:ERROR',
      'findings:WARN',
      'findings:INFO',
    ])
  })

  it('marks only the two collapsed metrics collapsed, and every other expanded', () => {
    b5()
    const tiers = Object.fromEntries(metrics().map((m) => [m.id, m.tier]))
    expect(tiers).toEqual({
      'finish:tournament': 'collapsed',
      'refs:peak-total': 'collapsed',
      'finish:day:0': 'expanded',
      'finish:day:1': 'expanded',
      'finish:day:2': 'expanded',
      'refs:peak-sabre': 'expanded',
      'strips:utilization': 'expanded',
      'days:balance-spread': 'expanded',
      'findings:ERROR': 'expanded',
      'findings:WARN': 'expanded',
      'findings:INFO': 'expanded',
    })
  })

  it('carries the brief\'s kind on every metric', () => {
    b5()
    const kinds = Object.fromEntries(metrics().map((m) => [m.id, m.kind]))
    expect(kinds).toEqual({
      'finish:tournament': 'time',
      'refs:peak-total': 'count',
      'finish:day:0': 'time',
      'finish:day:1': 'time',
      'finish:day:2': 'time',
      'refs:peak-sabre': 'count',
      'strips:utilization': 'percent',
      'days:balance-spread': 'percent',
      'findings:ERROR': 'count',
      'findings:WARN': 'count',
      'findings:INFO': 'count',
    })
  })

  it('gives every metric a non-empty label', () => {
    b5()
    for (const m of metrics()) {
      expect(m.label, `metric "${m.id}" has no label`).toBeTruthy()
      expect(typeof m.label).toBe('string')
    }
  })

  /**
   * 872 is `ScheduleResult.de_total_end` for JR-M-EPEE-IND. `latestFinish`
   * keeps the first strict maximum, and JR-M-EPEE-IND is first in the store's
   * insertion order among the four events that reach 872.
   *
   * 004 US4 T063 — was 972, CDT-W-FOIL-IND's, "the only B5 event that reaches
   * it". T061a's cause, alone: B5 is SJCC, whose D6 default is SINGLE_STAGE
   * (the value the store hardcoded before) and whose D5 ref_policy resolves to
   * TWO (what AUTO already scored), and applyPreset sets B5's 12 video strips
   * explicitly so D7 never fills anything in. Measured on this fixture: all 12
   * competitions still come out SINGLE_STAGE, every ref_policy is TWO, and the
   * one thing that moved is strips_allocated, 0 to ceil(fencers/7). That
   * re-packed B5 from an uneven day spread onto 4/4/4, and CDT-W-FOIL-IND —
   * the one event the scheduler used to start late at pool_start 585 — now
   * starts at 480 on day 2 and finishes at 867. No B5 event starts late any
   * more, so the 100-minute tail that produced 972 is gone.
   */
  it('finish:tournament is the latest de_total_end and names that event\'s segments', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(872)
    expect(keys('finish:tournament')).toEqual(['JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS'])
  })

  /**
   * Per-day `de_total_end` maxima, one metric per day, each naming its own
   * day's argmax event.
   *
   * 004 US4 T063 — was 972 / 867 / 872 naming CDT-W-FOIL-IND, JR-W-FOIL-IND
   * and CDT-M-EPEE-IND. T061a's re-pack (see above) moved which events sit on
   * which day, so days 0 and 1 report different events now. The three values
   * are equal, which they were not before, so the guard the old comment relied
   * on — "days 1 and 2 differ, so a metric reporting the tournament figure
   * would fail on two of three rows" — is gone. What still distinguishes a
   * per-day metric from a tournament-wide one is the **keys**: three different
   * events are named, one per day, and a row echoing the tournament figure
   * would name JR-M-EPEE-IND on all three.
   */
  it('finish:day:<d> reports each day\'s own latest event, one metric per day', () => {
    b5()
    expect(metric('finish:day:0').value).toBe(872)
    expect(metric('finish:day:1').value).toBe(872)
    expect(metric('finish:day:2').value).toBe(872)

    expect(keys('finish:day:0')).toEqual(['JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS'])
    expect(keys('finish:day:1')).toEqual(['JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS'])
    expect(keys('finish:day:2')).toEqual(['CDT-M-EPEE-IND:DE', 'CDT-M-EPEE-IND:POOLS'])
  })

  /**
   * `selectDerivedRefRequirements` for B5 is
   * `[{day:0, peak_total_refs:116, peak_saber_refs:32, peak_time:480},
   *   {day:1, 116, 36, 480}, {day:2, 112, 56, 480}]`.
   *
   * 116 is the max; day 0 is the first day to reach it. Day 0's `peak_time`
   * is 480 and all four of its events have a POOLS block open then, while no
   * DE block has started yet. A metric that named the whole day would emit
   * eight keys here, not four.
   *
   * 004 US4 T063 — the value is unchanged at 116 and one key moved,
   * JR-W-EPEE-IND:POOLS out and CDT-W-EPEE-IND:POOLS in. T061a's re-pack: the
   * two events swapped days (JR-W-EPEE-IND to day 1, CDT-W-EPEE-IND to day 0)
   * and day 0 went from five events to four. The old comment's evidence — that
   * CDT-W-FOIL-IND's 585 pool start excluded it from a five-event day — is
   * gone with it, since every B5 event now starts at 480.
   */
  it('refs:peak-total is the peak across days, keyed to the blocks open at that day\'s peak time', () => {
    b5()
    expect(metric('refs:peak-total').value).toBe(116)
    expect(keys('refs:peak-total')).toEqual([
      'CDT-M-FOIL-IND:POOLS',
      'CDT-W-EPEE-IND:POOLS',
      'JR-M-EPEE-IND:POOLS',
      'JR-W-SABRE-IND:POOLS',
    ])
  })

  /**
   * 56 is `peak_saber_refs` on day 2 — a different day from the total peak
   * (day 0), which is what makes this metric worth its own row.
   *
   * **The brief's blockKeys rule for this metric is ambiguous** and this is
   * the reading asserted here: the argmax day is the day with the highest
   * `peak_saber_refs` (day 2), and the time used is that same row's
   * `peak_time` — `RefRequirementsByDay` carries no sabre-specific peak time
   * (`src/engine/refs.ts:97-101` computes `peak_time` from the total sweep
   * only), so the total peak time of the sabre-peak day is the closest thing
   * available. The alternative reading — day 0's `peak_time` because day 0 is
   * the *total* peak day — would name `JR-W-SABRE-IND:POOLS` and light blocks
   * on a day whose sabre peak is not the 56 being reported. If T048 takes the
   * other reading, this test is where it surfaces; settle it, do not relax it.
   */
  it('refs:peak-sabre is the sabre peak, keyed to the sabre blocks open at that day\'s peak time', () => {
    b5()
    expect(metric('refs:peak-sabre').value).toBe(56)
    expect(keys('refs:peak-sabre')).toEqual(['CDT-M-SABRE-IND:POOLS', 'CDT-W-SABRE-IND:POOLS'])
  })

  /**
   * The half-open end bound, which B5 cannot reach: none of its peak minutes
   * coincides with a block's end, so `[start, end)` and `[start, end]` name the
   * same blocks there.
   *
   * This is not a hypothetical boundary. `sweepLine` processes starts before
   * ends at the same minute — "matching the OR model where handoff is instant"
   * (`src/engine/refs.ts:48-51`) — so the peak instant it reports routinely
   * coincides with some other block's end. A closed interval would light a
   * block that has already finished, on the metric whose whole job is to say
   * which blocks are being refereed at the peak.
   *
   * Measured 2026-08-31 by driving this fixture through selectScorecardMetrics:
   * day 0's peak is 8 refs at minute 575, and 575 is exactly where
   * JR-M-SABRE-IND's pools end and JR-W-EPEE-IND's begin.
   */
  it('excludes a block that ends exactly at the peak minute', () => {
    peakAtABlockBoundary()

    expect(metric('refs:peak-total').value).toBe(8)
    expect(keys('refs:peak-total')).toEqual(['JR-W-EPEE-IND:POOLS'])
    // The sabre row reports 6 and names nothing, for the same reason: the only
    // sabre block on its day had already ended at that minute. A metric
    // reporting a non-zero number while lighting nothing is a real product
    // state here, not a bug — the number is the day's sabre peak, the keys are
    // what is open at the instant the row reports.
    expect(metric('refs:peak-sabre').value).toBe(6)
    expect(keys('refs:peak-sabre')).toEqual([])
  })

  /**
   * 52348 strip-minutes used against 151200 available (3 days x 60 strips x
   * 840-minute window), which is 34.6216931…%. The used figure is the sum
   * over B5's 24 drawn blocks of `(end - start) x stripCount`; it is not
   * `days x strips x hours` of anything, so a utilization that forgot the
   * strip count would read far lower and one that used wall-clock span would
   * read far higher.
   */
  it('strips:utilization is used strip-minutes over available, as a percentage of all in-range blocks', () => {
    b5()
    expect(metric('strips:utilization').value).toBeCloseTo(34.62169312169312, 10)
    expect(keys('strips:utilization')).toEqual(B5_ALL_KEYS)
  })

  /**
   * Per-day utilizations are 36.0238…% (day 0), 35.2817…% (day 1) and
   * 32.5595…% (day 2); the spread is day 0 minus day 2 = 3.4642… percentage
   * points. Blocks come from both the max day (0) and the min day (2), four
   * events each — sixteen keys, not the twenty-four of `strips:utilization`
   * and not the eight of day 0 alone.
   *
   * 004 US4 T063 — was 18.5158… over a 5/3/4 day spread (max day 0 at
   * 44.5595…%, min day 1 at 26.0436…%). T061a's cause, alone: pre-allocated
   * strips_allocated re-packed B5 onto four events per day, which is what
   * flattens the spread by a factor of five, and moved the min from day 1 to
   * day 2. The metric is still max minus min and still names exactly those two
   * days' blocks.
   */
  it('days:balance-spread is max minus min per-day utilization, keyed to both days', () => {
    b5()
    expect(metric('days:balance-spread').value).toBeCloseTo(3.4642857142857153, 10)
    expect(keys('days:balance-spread')).toEqual([
      // day 0 — the most-utilized day, four events
      'CDT-M-FOIL-IND:DE', 'CDT-M-FOIL-IND:POOLS',
      'CDT-W-EPEE-IND:DE', 'CDT-W-EPEE-IND:POOLS',
      'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
      'JR-W-SABRE-IND:DE', 'JR-W-SABRE-IND:POOLS',
      // day 2 — the least-utilized day, four events
      'CDT-M-EPEE-IND:DE', 'CDT-M-EPEE-IND:POOLS',
      'CDT-M-SABRE-IND:DE', 'CDT-M-SABRE-IND:POOLS',
      'CDT-W-FOIL-IND:DE', 'CDT-W-FOIL-IND:POOLS',
      'CDT-W-SABRE-IND:DE', 'CDT-W-SABRE-IND:POOLS',
      // day 1's four events are named by neither
    ].sort())
  })

  /**
   * `selectDerivedFindings` for B5 emits twelve `video-dead-config` WARN
   * validation errors — one per competition, each with `subjects: [<its id>]`
   * — and nothing else, at any severity.
   *
   * 004 US4 T063 — was 13, and the thirteenth was a day-level
   * `STRIP_CONTENTION` on `Phase.CAPACITY` carrying an empty
   * `competition_id`. T061a's cause, alone: `computeDerivedFindings` feeds
   * `initialAnalysis` a day per competition taken from the placements, and
   * pre-allocated strips re-packed B5 from an uneven spread onto four events
   * per day, so no day's pool total crosses the contention threshold any more.
   * Measured, not inferred: `analysis.warnings` is empty for this fixture now,
   * and the twelve `video-dead-config` errors are all that remain — which is
   * also why the key assertion below still names all twelve competitions.
   *
   * **This case has lost the discrimination it was written for.** 13-against-12
   * was the whole point: it proved `analysis.warnings` was being counted at
   * all, because a metric that ignored them would read 12. At 12 the two
   * readings are indistinguishable here. The property is still held in this
   * file by `contendedTwoPlaced` below, whose nine WARN include a
   * `Phase.CAPACITY` and two `Phase.DE` warnings that name nobody — so a
   * selector that dropped `analysis.warnings` would read 3 there, not 9. Do
   * not treat this case as covering that any more.
   */
  it('findings:<severity> counts validation errors and analysis warnings together', () => {
    b5()
    expect(metric('findings:ERROR').value).toBe(0)
    expect(metric('findings:WARN').value).toBe(12)
    expect(metric('findings:INFO').value).toBe(0)
  })

  it('findings:WARN names every competition its findings name, and nothing for the day-level one', () => {
    b5()
    expect(keys('findings:WARN')).toEqual(B5_ALL_KEYS)
    expect(keys('findings:ERROR')).toEqual([])
    expect(keys('findings:INFO')).toEqual([])
  })
})

// ──────────────────────────────────────────────
// Findings: the shapes a hand-built fixture misses
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — findings on a constrained fixture', () => {
  /**
   * Measured from `selectDerivedFindings` for `contendedTwoPlaced`:
   *
   * - `validationErrors`: three ERROR `video-r16-strip-shortfall` (one per
   *   selected competition) plus one ERROR `feasibility-video-strip-hours`
   *   whose subject is `feasibility_video`, and three WARN `r16-over-cap`.
   * - `analysis.warnings`: one WARN `STRIP_CONTENTION` on `CAPACITY` and two
   *   WARN on `DE`, all three with an empty `competition_id`, three WARN
   *   `STRIP_DEFICIT_NO_FLIGHTING` on `POOLS` (one per competition), and three
   *   INFO `CUT_SUMMARY` on `CUT`.
   *
   * ERROR is therefore 4, WARN is 3 + 1 + 2 + 3 = 9 and INFO is 3.
   *
   * 004 US4 T063 — was ERROR 0, WARN 10, INFO 3. D6's cause, on both moves.
   * This fixture sets NAC explicitly, so its de_mode resolves AUTO to STAGED,
   * and it sets `setVideoStrips(0)`, so `video_strips_total` is 0 rather than
   * the null D7 would have filled in. `validateConfig` reads STAGED + REQUIRED
   * + `video_strips_total < de_round_of_16_strips` as a structural error
   * (src/engine/validation.ts:218-225), which is the three new ERRORs, and the
   * feasibility pass adds a fourth for the video strip-hours a staged R16 now
   * needs. The same switch retires the three WARN `video-dead-config`, which
   * fire only on REQUIRED + SINGLE_STAGE (validation.ts:212-215), while the
   * staged DE adds two day-level `DE` warnings — validation WARN 6 to 3,
   * analysis WARN 4 to 6, so the total goes 10 to 9. T061a moves nothing here:
   * it sets
   * strips_allocated to max(2, ceil(8/7)) = 2, and the only strip rule on this
   * path, `resource-precondition-strips`, compares `n_pools` (1) against
   * `strips_total` (1) and never reads strips_allocated (validation.ts:245).
   */
  it('counts the day-level warning and the per-competition ones together', () => {
    contendedTwoPlaced()
    expect(metric('findings:ERROR').value).toBe(4)
    expect(metric('findings:WARN').value).toBe(9)
    expect(metric('findings:INFO').value).toBe(3)
  })

  /**
   * Nine WARN findings between them name three competitions, but only two of
   * those are placed. `JR-M-FOIL-IND` has no placement, so it has no derived
   * event and no segments, and the day-level warnings name nobody at all.
   * Four keys, not six, and not zero.
   *
   * 004 US4 T063 — the phase in each key moved from `DE` to `DE_ROUND_OF_16`.
   * D6's cause: under the resolved STAGED de_mode `eventTimeSegments` emits
   * `DE_PRELIMS`/`DE_ROUND_OF_16` in place of the single `DE`
   * (src/components/canvas/geometry.ts:143-152), and at 8 fencers the bracket
   * has no prelim round, so `DE_ROUND_OF_16` is the only DE segment drawn.
   */
  it('emits keys only for the named competitions that actually have blocks', () => {
    contendedTwoPlaced()
    expect(keys('findings:WARN')).toEqual([
      'JR-M-EPEE-IND:DE_ROUND_OF_16', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE_ROUND_OF_16', 'JR-W-EPEE-IND:POOLS',
    ])
    expect(keys('findings:INFO')).toEqual([
      'JR-M-EPEE-IND:DE_ROUND_OF_16', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE_ROUND_OF_16', 'JR-W-EPEE-IND:POOLS',
    ])
  })

  /**
   * Zero strips reaches five ERRORs: `strips-total-positive` (global), one
   * `resource-precondition-strips` per competition, and one
   * `video-r16-strip-shortfall` per competition. The global error's `subjects`
   * is `['strips_total']`, which is not a selected competition id — it must
   * contribute no keys, so ERROR names the two placed competitions and nothing
   * else, which is what this case exists to hold.
   *
   * 004 US4 T063 — was 3, and the keys said `:DE`. D6's cause on both, the
   * same as the constrained fixture above: this fixture sets NAC explicitly and
   * `setVideoStrips(0)`, so the resolved STAGED de_mode raises one
   * `video-r16-strip-shortfall` per competition and `eventTimeSegments` draws
   * `DE_ROUND_OF_16` in place of `DE`. The two `resource-precondition-strips`
   * are unchanged — they compare `n_pools` against `strips_total`, which
   * T061a's strips_allocated does not enter.
   */
  it('ignores a subject that is not a selected competition id', () => {
    zeroStrips()
    expect(metric('findings:ERROR').value).toBe(5)
    expect(keys('findings:ERROR')).toEqual([
      'JR-M-EPEE-IND:DE_ROUND_OF_16', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE_ROUND_OF_16', 'JR-W-EPEE-IND:POOLS',
    ])
  })
})

// ──────────────────────────────────────────────
// The null cases (design brief §3)
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — null values', () => {
  /**
   * With nothing placed, the finish metrics have no event to read a
   * `de_total_end` off and are null. Everything else still has a value: the
   * ref rows exist and read zero, the strip-minute denominator is unchanged
   * at 151200, and 13 findings are raised. Asserting the zeros is the point —
   * a blanket "nothing placed ⇒ all null" would pass a test that only checked
   * the nulls.
   *
   * 004 US4 T063 — this case is unchanged and still reads 13, while placed B5
   * above now reads 12. The findings therefore *do* depend on placement:
   * `computeDerivedFindings` derives its per-competition day from
   * `state.placements` when there is one and from a round-robin `i %
   * days_available` when there is not, and the unplaced round-robin spread
   * still crosses the day-level contention threshold that T061a's re-pack
   * cleared for the placed one. An earlier revision of this comment claimed
   * the opposite; it was correct only while the two spreads happened to agree.
   */
  it('nulls only the finish metrics when nothing is placed, and zeroes the rest', () => {
    b5Unplaced()
    expect(metric('finish:tournament').value).toBeNull()
    expect(metric('finish:day:0').value).toBeNull()
    expect(metric('finish:day:1').value).toBeNull()
    expect(metric('finish:day:2').value).toBeNull()

    expect(metric('refs:peak-total').value).toBe(0)
    expect(metric('refs:peak-sabre').value).toBe(0)
    expect(metric('strips:utilization').value).toBe(0)
    expect(metric('days:balance-spread').value).toBe(0)
    expect(metric('findings:WARN').value).toBe(13)

    for (const m of metrics()) {
      expect(m.blockKeys, `metric "${m.id}" named blocks with nothing placed`).toEqual([])
    }
  })

  /**
   * One day: no second day to spread against.
   *
   * 004 US4 T063 — utilization moved 15.2380… to 9.2619… and the finish 929 to
   * 930. D6's cause, and the denominator did not move: 1 day x 20 strips x 840
   * minutes is still 16800, while the used strip-minutes fell 2560 to 1556.
   * This fixture sets NAC explicitly, so its de_mode resolves to STAGED, and
   * at 40 fencers the bracket has no prelim round — the single DE segment is
   * replaced by a shorter `DE_ROUND_OF_16` alone (measured: POOLS 480-784 x4
   * then DE_ROUND_OF_16 815-900 x4). Fewer DE strip-minutes drawn, so a lower
   * utilization over the same denominator. D7 does not reach this fixture
   * either: it calls `setVideoStrips(4)`, so nothing is left null to resolve.
   */
  it('nulls days:balance-spread on a one-day tournament, while the day still has a utilization', () => {
    singleDay()
    expect(metric('days:balance-spread').value).toBeNull()
    expect(metric('strips:utilization').value).toBeCloseTo(9.261904761904761, 10)
    expect(metric('finish:day:0').value).toBe(930)
    expect(metrics().map((m) => m.id)).toEqual([
      'finish:tournament',
      'refs:peak-total',
      'finish:day:0',
      'refs:peak-sabre',
      'strips:utilization',
      'days:balance-spread',
      'findings:ERROR',
      'findings:WARN',
      'findings:INFO',
    ])
  })

  /**
   * Two days, one of them a zero-length window. `days_available` is 2, so a
   * spread counted over days rather than over *usable* days would return
   * 9.2619…, not null — and the utilization denominator would be 33600
   * rather than 16800, halving the percentage to 4.6309…
   *
   * 004 US4 T063 — 15.2380… to 9.2619…, D6's cause, for the reason given on
   * the one-day case above. The two fixtures share their competition and
   * fencer count, so they share the number.
   */
  it('nulls days:balance-spread when only one day has a positive window, and excludes that day from the denominator', () => {
    twoDaysOneUsable()
    expect(metric('days:balance-spread').value).toBeNull()
    expect(metric('strips:utilization').value).toBeCloseTo(9.261904761904761, 10)
    expect(metric('finish:day:1').value).toBeNull()
  })

  /**
   * `twoDaysOneUsable` pins the `window > 0` guard only at `window === 0`,
   * where both branches give the same 0 — the fixture already satisfies the
   * branch it exists to test. A window that *ends before it starts* is the
   * branch that differs: without the guard day 1 contributes −1200
   * strip-minutes, the denominator shrinks from 16800 to 15600, and
   * utilization reads 9.974% instead of 9.262% — higher than reality rather
   * than lower, which is the direction that misleads. The brief's wording
   * ("missing or **non-positive** day windows contribute 0") is only half held
   * without this.
   *
   * 004 US4 T063 — 15.2380… to 9.2619…, D6's cause, the same fixture and the
   * same reason as the two cases above. The guard's arithmetic is re-derived
   * against the new numerator: 1556 over 15600 is 9.974%, against 1556 over
   * 16800 at 9.262%.
   */
  it('contributes zero for a day whose window ends before it starts', () => {
    useStore.setState(useStore.getInitialState(), true)
    const s = useStore.getState()
    s.setTournamentType('NAC')
    s.setDays(2)
    s.setStrips(20)
    s.setVideoStrips(4)
    s.selectCompetitions(['JR-M-EPEE-IND'])
    useStore.getState().updateCompetition('JR-M-EPEE-IND', { fencer_count: 40 })
    useStore.getState().updateDayConfig(1, { day_start_time: 600, day_end_time: 540 })
    useStore.getState().setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
    })

    expect(metric('strips:utilization').value).toBeCloseTo(9.261904761904761, 10)
    expect(metric('days:balance-spread').value).toBeNull()
  })

  /** Zero strips: no strip-minutes available at all, and so no usable day. */
  it('nulls strips:utilization and days:balance-spread when no strip-minutes are available', () => {
    zeroStrips()
    expect(metric('strips:utilization').value).toBeNull()
    expect(metric('days:balance-spread').value).toBeNull()
    // The blocks still exist and the finish metrics still read — only the
    // two denominators are gone.
    //
    // 004 US4 T063 — 900 to 905. D6's cause: this fixture sets NAC, so its
    // de_mode resolves to STAGED and JR-M-EPEE-IND's DE runs as a
    // DE_ROUND_OF_16 ending at 875 rather than the single DE it ran before,
    // carrying `de_total_end` with it. The nulls either side of it are
    // untouched, which is what the case is for.
    expect(metric('finish:tournament').value).toBe(905)
  })
})

// ──────────────────────────────────────────────
// The canvas invariant
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — every key names a block the canvas draws', () => {
  /**
   * The scorecard names blocks and the canvas draws them, so a key no block
   * carries is a highlight that never appears. `assignStripLanes` is the
   * canvas's own answer to "which blocks exist" (design brief §3 has the
   * selector share its two rules — the `day_out_of_range` skip and
   * `eventTimeSegments` — for exactly this reason).
   */
  it.each([
    ['B5 through the app path', b5],
    ['a constrained fixture with an unplaced competition', contendedTwoPlaced],
    ['zero strips', zeroStrips],
  ])('holds for %s', (_label, fixture) => {
    fixture()
    const drawn = new Set(canvasKeys())
    expect(drawn.size, 'fixture drew no blocks — the invariant would hold vacuously').toBeGreaterThan(0)

    for (const m of metrics()) {
      for (const key of m.blockKeys) {
        expect(
          drawn.has(key),
          `metric "${m.id}" named block "${key}", which assignStripLanes does not produce. `
            + `Drawn: ${[...drawn].sort().join(', ')}`,
        ).toBe(true)
      }
    }
  })

  it('emits no duplicate key within one metric', () => {
    b5()
    for (const m of metrics()) {
      expect(new Set(m.blockKeys).size, `metric "${m.id}" repeated a block key`).toBe(m.blockKeys.length)
    }
  })
})

// ──────────────────────────────────────────────
// day_out_of_range: an event pushed off the canvas
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — a placement pushed out of range', () => {
  it('names no block for the out-of-range event, in any metric', () => {
    b5OneOutOfRange()
    for (const m of metrics()) {
      expect(m.blockKeys.includes('CDT-W-FOIL-IND:DE'), `metric "${m.id}" named CDT-W-FOIL-IND:DE`)
        .toBe(false)
      expect(m.blockKeys.includes('CDT-W-FOIL-IND:POOLS'), `metric "${m.id}" named CDT-W-FOIL-IND:POOLS`)
        .toBe(false)
    }
  })

  /**
   * `strips:utilization` moves from 34.62169312169312 (B5 in full, measured
   * in the table above) to 31.776455026455025 once CDT-W-FOIL-IND's own
   * strip-minutes drop out of the sum — both read straight off
   * `selectScorecardMetrics`, before and after the placement update, on
   * 2026-08-31. The 22 remaining keys are B5's 24 (`B5_ALL_KEYS`) minus
   * CDT-W-FOIL-IND's two.
   */
  it('drops strips:utilization\'s value and that event\'s two keys once it is out of range', () => {
    b5()
    const before = metric('strips:utilization').value
    expect(before).toBeCloseTo(34.62169312169312, 10)

    useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 3 })
    const after = metric('strips:utilization').value

    expect(after).toBeCloseTo(31.776455026455025, 10)
    expect(after).not.toBe(before)
    expect(keys('strips:utilization')).toEqual(
      B5_ALL_KEYS.filter((k) => !k.startsWith('CDT-W-FOIL-IND:')),
    )
  })

  /**
   * `finish:tournament` moves from 872 to 867, the next-highest in-range
   * finish, and `finish:day:0` from 872 to 852, once the events holding 872
   * are out of range.
   *
   * 004 US4 T063 — this case needed a new vehicle, not just new numbers. It
   * used to move one event: CDT-W-FOIL-IND was B5's unique argmax at 972, and
   * pushing it out of range dropped the tournament finish to 872. T061a's
   * re-pack (see `finish:tournament` in the table above) removed the late
   * pool start that produced 972, and B5's finish column now **ties four ways
   * at 872** — JR-M-EPEE-IND, JR-W-EPEE-IND, CDT-M-EPEE-IND and
   * CDT-W-EPEE-IND. With a four-way tie, moving any one of them out of range
   * leaves `finish:tournament` at 872 whether the skip below exists or not,
   * so a one-event version of this case would assert nothing. All four go, and
   * 867 is what is left. Measured, not derived: 867 is JR-W-FOIL-IND's
   * `de_total_end` on day 1, and day 0 falls to CDT-M-FOIL-IND's 852.
   *
   * `latestFinish` (`src/store/derived.ts:337-354`) carries its own
   * `day_out_of_range` skip, separate from `scorecardBlocks`'s: it reads
   * `de_total_end` straight off `schedule.events` rather than walking
   * `blocks`, so a mutation of that skip is invisible to the
   * strips:utilization case above and needs its own proof. Without the skip,
   * `latestFinish(null)` would still find the four moved events' 872 the max
   * (its `assigned_day` filter only applies to the per-day calls, not the
   * tournament-wide one), while its `blockKeys` lookup goes through
   * `keysByCompetition`, which `scorecardBlocks`'s own (intact) skip has
   * already emptied of them — so the failure surfaces as a wrong value (872)
   * paired with an empty key list, not as a moved event's own keys appearing.
   */
  it('drops finish:tournament and the day it left to the next in-range finish', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(872)
    expect(metric('finish:day:0').value).toBe(872)

    // All four, for the tie described above — three moves leaves 872 standing.
    for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'CDT-M-EPEE-IND', 'CDT-W-EPEE-IND']) {
      useStore.getState().updatePlacement(id, { day: 3 })
    }

    expect(metric('finish:tournament').value).toBe(867)
    expect(keys('finish:tournament')).toEqual(['JR-W-FOIL-IND:DE', 'JR-W-FOIL-IND:POOLS'])

    expect(metric('finish:day:0').value).toBe(852)
    expect(keys('finish:day:0')).toEqual(['CDT-M-FOIL-IND:DE', 'CDT-M-FOIL-IND:POOLS'])
  })
})

// ──────────────────────────────────────────────
// Purity and memoization
// ──────────────────────────────────────────────

describe('selectScorecardMetrics — pure function of store inputs', () => {
  it('returns the identical reference across calls when nothing changed', () => {
    b5()
    const first = selectScorecardMetrics(useStore.getState())
    const second = selectScorecardMetrics(useStore.getState())
    expect(second).toBe(first)
  })

  it('ignores a store change outside scheduleDeps', () => {
    b5()
    const first = selectScorecardMetrics(useStore.getState())
    // undismissFinding always calls set(), replacing Zustand's top-level
    // state object, but dismissedFindings is not a scheduleDeps entry.
    useStore.getState().undismissFinding('never-dismissed')
    expect(selectScorecardMetrics(useStore.getState())).toBe(first)
  })

  it('recomputes once a depended-on input changes', () => {
    b5()
    const first = selectScorecardMetrics(useStore.getState())
    useStore.getState().setStrips(30)
    const second = selectScorecardMetrics(useStore.getState())

    expect(second).not.toBe(first)
    // Halving the strips halves the denominator: 52348 / 75600 = 69.2433…
    expect(second.find((m) => m.id === 'strips:utilization')?.value)
      .toBeCloseTo(69.24338624338624, 10)
  })

  it('writes nothing back to the store', () => {
    b5()
    const before = useStore.getState()
    selectScorecardMetrics(before)
    // Any set() call would hand back a new top-level object.
    expect(useStore.getState()).toBe(before)
  })
})
