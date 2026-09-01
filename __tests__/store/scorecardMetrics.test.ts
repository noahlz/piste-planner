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
   * 972 is `ScheduleResult.de_total_end` for CDT-W-FOIL-IND, the only B5
   * event that reaches it — the next highest is 872, shared by three events.
   * CDT-W-FOIL-IND is the one B5 event the scheduler starts late (pool_start
   * 585 rather than 480), which is what puts it 100 minutes past the pack.
   */
  it('finish:tournament is the latest de_total_end and names that event\'s segments', () => {
    b5()
    expect(metric('finish:tournament').value).toBe(972)
    expect(keys('finish:tournament')).toEqual(['CDT-W-FOIL-IND:DE', 'CDT-W-FOIL-IND:POOLS'])
  })

  /**
   * Per-day `de_total_end` maxima. Day 0's equals the tournament's because
   * CDT-W-FOIL-IND is on day 0; days 1 and 2 differ from it and from each
   * other, so a per-day metric that quietly reported the tournament figure
   * would fail on two of the three rows.
   */
  it('finish:day:<d> reports each day\'s own latest event, one metric per day', () => {
    b5()
    expect(metric('finish:day:0').value).toBe(972)
    expect(metric('finish:day:1').value).toBe(867)
    expect(metric('finish:day:2').value).toBe(872)

    expect(keys('finish:day:0')).toEqual(['CDT-W-FOIL-IND:DE', 'CDT-W-FOIL-IND:POOLS'])
    expect(keys('finish:day:1')).toEqual(['JR-W-FOIL-IND:DE', 'JR-W-FOIL-IND:POOLS'])
    expect(keys('finish:day:2')).toEqual(['CDT-M-EPEE-IND:DE', 'CDT-M-EPEE-IND:POOLS'])
  })

  /**
   * `selectDerivedRefRequirements` for B5 is
   * `[{day:0, peak_total_refs:116, peak_saber_refs:32, peak_time:480},
   *   {day:1, 92, 36, 480}, {day:2, 116, 56, 480}]`.
   *
   * 116 is the max; day 0 is the first day to reach it. Day 0's `peak_time`
   * is 480, and four of that day's five events have a POOLS block open at
   * 480 — CDT-W-FOIL-IND's pools start at 585, so it is excluded, and no DE
   * block has started yet. A metric that named the whole day would emit ten
   * keys here, not four.
   */
  it('refs:peak-total is the peak across days, keyed to the blocks open at that day\'s peak time', () => {
    b5()
    expect(metric('refs:peak-total').value).toBe(116)
    expect(keys('refs:peak-total')).toEqual([
      'CDT-M-FOIL-IND:POOLS',
      'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:POOLS',
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
   * Per-day utilizations are 44.5595…% (day 0), 26.0436…% (day 1) and
   * 33.2619…% (day 2); the spread is day 0 minus day 1 = 18.5158… percentage
   * points. Blocks come from both the max day (0: five events) and the min
   * day (1: three events) — sixteen keys, not the twenty-four of
   * `strips:utilization` and not the ten of day 0 alone.
   */
  it('days:balance-spread is max minus min per-day utilization, keyed to both days', () => {
    b5()
    expect(metric('days:balance-spread').value).toBeCloseTo(18.51587301587302, 10)
    expect(keys('days:balance-spread')).toEqual([
      // day 0 — the most-utilized day, five events
      'CDT-M-FOIL-IND:DE', 'CDT-M-FOIL-IND:POOLS',
      'CDT-W-FOIL-IND:DE', 'CDT-W-FOIL-IND:POOLS',
      'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS',
      'JR-W-SABRE-IND:DE', 'JR-W-SABRE-IND:POOLS',
      // day 1 — the least-utilized day, three events
      'JR-M-FOIL-IND:DE', 'JR-M-FOIL-IND:POOLS',
      'JR-M-SABRE-IND:DE', 'JR-M-SABRE-IND:POOLS',
      'JR-W-FOIL-IND:DE', 'JR-W-FOIL-IND:POOLS',
      // day 2's four events are named by neither
    ].sort())
  })

  /**
   * `selectDerivedFindings` for B5 emits twelve `video-dead-config`
   * WARN validation errors — one per competition, each with
   * `subjects: [<its id>]` — plus exactly one `analysis.warnings` entry: a
   * `STRIP_CONTENTION` on `Phase.CAPACITY` with an **empty**
   * `competition_id`. Nothing at ERROR or INFO severity.
   *
   * So WARN counts 13 while only 12 competitions are named: the day-level
   * warning is counted and contributes no keys. A count of 12 would mean
   * `analysis.warnings` was not being counted at all.
   */
  it('findings:<severity> counts validation errors and analysis warnings together', () => {
    b5()
    expect(metric('findings:ERROR').value).toBe(0)
    expect(metric('findings:WARN').value).toBe(13)
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
   * - `validationErrors`: six WARN — `video-dead-config` and `r16-over-cap`
   *   for each of the three selected competitions.
   * - `analysis.warnings`: one WARN `STRIP_CONTENTION` on `CAPACITY` with an
   *   empty `competition_id`, three WARN `STRIP_DEFICIT_NO_FLIGHTING` on
   *   `POOLS` (one per competition), and three INFO `CUT_SUMMARY` on `CUT`.
   *
   * WARN is therefore 6 + 1 + 3 = 10 and INFO is 3.
   */
  it('counts the day-level warning and the per-competition ones together', () => {
    contendedTwoPlaced()
    expect(metric('findings:ERROR').value).toBe(0)
    expect(metric('findings:WARN').value).toBe(10)
    expect(metric('findings:INFO').value).toBe(3)
  })

  /**
   * Ten WARN findings between them name three competitions, but only two of
   * those are placed. `JR-M-FOIL-IND` has no placement, so it has no derived
   * event and no segments, and the day-level warning names nobody at all.
   * Four keys, not six, and not zero.
   */
  it('emits keys only for the named competitions that actually have blocks', () => {
    contendedTwoPlaced()
    expect(keys('findings:WARN')).toEqual([
      'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS',
    ])
    expect(keys('findings:INFO')).toEqual([
      'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS',
    ])
  })

  /**
   * Zero strips is the one configuration that reaches ERROR severity:
   * `strips-total-positive` (global) plus one `resource-precondition-strips`
   * per competition. The global error's `subjects` is `['strips_total']`,
   * which is not a selected competition id — it must contribute no keys, so
   * ERROR names the two placed competitions and nothing else.
   */
  it('ignores a subject that is not a selected competition id', () => {
    zeroStrips()
    expect(metric('findings:ERROR').value).toBe(3)
    expect(keys('findings:ERROR')).toEqual([
      'JR-M-EPEE-IND:DE', 'JR-M-EPEE-IND:POOLS',
      'JR-W-EPEE-IND:DE', 'JR-W-EPEE-IND:POOLS',
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
   * at 151200, and the 13 findings do not depend on placement. Asserting the
   * zeros is the point — a blanket "nothing placed ⇒ all null" would pass a
   * test that only checked the nulls.
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

  /** One day: no second day to spread against. */
  it('nulls days:balance-spread on a one-day tournament, while the day still has a utilization', () => {
    singleDay()
    expect(metric('days:balance-spread').value).toBeNull()
    expect(metric('strips:utilization').value).toBeCloseTo(15.238095238095239, 10)
    expect(metric('finish:day:0').value).toBe(929)
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
   * 15.238…, not null — and the utilization denominator would be 33600
   * rather than 16800, halving the percentage to 7.619…
   */
  it('nulls days:balance-spread when only one day has a positive window, and excludes that day from the denominator', () => {
    twoDaysOneUsable()
    expect(metric('days:balance-spread').value).toBeNull()
    expect(metric('strips:utilization').value).toBeCloseTo(15.238095238095239, 10)
    expect(metric('finish:day:1').value).toBeNull()
  })

  /** Zero strips: no strip-minutes available at all, and so no usable day. */
  it('nulls strips:utilization and days:balance-spread when no strip-minutes are available', () => {
    zeroStrips()
    expect(metric('strips:utilization').value).toBeNull()
    expect(metric('days:balance-spread').value).toBeNull()
    // The blocks still exist and the finish metrics still read — only the
    // two denominators are gone.
    expect(metric('finish:tournament').value).toBe(900)
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
