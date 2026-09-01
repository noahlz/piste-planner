import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { bootstrap } from '../../src/store/boot.ts'
import { encodeToUrl, serializeState, deserializeState } from '../../src/store/serialization.ts'
import { selectScorecardMetrics, type ScorecardBaseline } from '../../src/store/derived.ts'
import type { ScenarioId } from '../../src/data/tournaments.ts'

/**
 * T044 — the frozen scorecard baseline (research D9, S6 design brief §1).
 *
 * The rule under test: `setLoadedPresetId` clears the baseline, and
 * `setPlacementsFromAuto` captures it exactly when a preset is loaded and no
 * baseline is held. Boot and the picker both go `applyPreset(id)` then
 * `runScheduleAll()`, so neither is special-cased; a shared-URL boot calls
 * neither, so it never captures one.
 *
 * Every expected number below was measured on 2026-08-31 by running the
 * preset through the app's own path and reading the engine's output, then
 * pinned as a literal. The baseline's whole job is to *not* move, so an
 * expectation recomputed from the live selector would agree with a broken
 * implementation that recaptured on every edit.
 */

/**
 * B5's metrics immediately after `applyPreset('B5')` + `runScheduleAll()`.
 *
 * Sources: `finish:*` are `ScheduleResult.de_total_end` maxima; `refs:*` are
 * `RefRequirementsByDay.peak_total_refs` / `peak_saber_refs` maxima across
 * B5's three days; `strips:utilization` is 52348 used strip-minutes over
 * 151200 available (3 days x 60 strips x 840 minutes); `days:balance-spread`
 * is day 0's 44.5595…% less day 1's 26.0436…%; the 13 WARN findings are 12
 * `video-dead-config` validation errors plus one day-level `STRIP_CONTENTION`
 * analysis warning.
 */
const B5_BASELINE: ScorecardBaseline = {
  'finish:tournament': 972,
  'refs:peak-total': 116,
  'finish:day:0': 972,
  'finish:day:1': 867,
  'finish:day:2': 872,
  'refs:peak-sabre': 56,
  'strips:utilization': 34.62169312169312,
  'days:balance-spread': 18.51587301587302,
  'findings:ERROR': 0,
  'findings:WARN': 13,
  'findings:INFO': 0,
}

/** B1 (the boot preset): 4 days, 80 strips, 24 events, all placed. */
const B1_BASELINE: ScorecardBaseline = {
  'finish:tournament': 1037,
  'refs:peak-total': 220,
  'finish:day:0': 962,
  'finish:day:1': 1037,
  'finish:day:2': 977,
  'finish:day:3': 943,
  'refs:peak-sabre': 76,
  'strips:utilization': 41.36755952380952,
  'days:balance-spread': 9.836309523809533,
  'findings:ERROR': 0,
  'findings:WARN': 16,
  'findings:INFO': 12,
}

/**
 * `toEqual` on floats is exact, and two of these values are irrational in
 * binary. Compare id-for-id so a percentage can be matched to a tolerance
 * while every integer metric is still pinned exactly.
 */
function expectBaseline(actual: ScorecardBaseline | null, expected: ScorecardBaseline): void {
  expect(actual, 'no baseline was captured').not.toBeNull()
  expect(actual, 'no scorecardBaseline field on the store').not.toBeUndefined()
  const baseline = actual as ScorecardBaseline
  expect(Object.keys(baseline).sort()).toEqual(Object.keys(expected).sort())
  for (const [id, value] of Object.entries(expected)) {
    if (value !== null && !Number.isInteger(value)) {
      expect(baseline[id], `baseline["${id}"]`).toBeCloseTo(value, 10)
    } else {
      expect(baseline[id], `baseline["${id}"]`).toBe(value)
    }
  }
}

function liveValue(id: string): number | null {
  const found = selectScorecardMetrics(useStore.getState()).find((m) => m.id === id)
  expect(found, `no live metric with id "${id}"`).toBeDefined()
  return found!.value
}

/** The picker's path and boot's path are the same two calls (design brief §1). */
function loadPreset(id: ScenarioId): void {
  applyPreset(id)
  runScheduleAll()
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

// ──────────────────────────────────────────────
// Capture
// ──────────────────────────────────────────────

describe('scorecardBaseline — capture', () => {
  it('is null on a fresh store, with no preset loaded', () => {
    expect(useStore.getState().loadedPresetId).toBeNull()
    expect(useStore.getState().scorecardBaseline).toBeNull()
  })

  it('is still null after applyPreset alone — nothing is placed yet', () => {
    applyPreset('B5')
    expect(useStore.getState().loadedPresetId).toBe('B5')
    // Capturing here would freeze a baseline over zero placements and make
    // the app's first frame show an enormous delta on every metric.
    expect(useStore.getState().scorecardBaseline).toBeNull()
  })

  it('captures the preset\'s metrics once runScheduleAll places its events', () => {
    loadPreset('B5')
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  it('captures values that agree with the live metrics on the frame it was captured', () => {
    loadPreset('B5')
    const baseline = useStore.getState().scorecardBaseline as ScorecardBaseline
    for (const metric of selectScorecardMetrics(useStore.getState())) {
      expect(baseline[metric.id], `baseline["${metric.id}"] on the capture frame`).toBe(metric.value)
    }
  })

  it('holds values only — no labels, tiers, kinds or block keys', () => {
    loadPreset('B5')
    const baseline = useStore.getState().scorecardBaseline as ScorecardBaseline
    for (const [id, value] of Object.entries(baseline)) {
      expect(
        value === null || typeof value === 'number',
        `baseline["${id}"] is ${typeof value}; block keys are geometry and must not freeze`,
      ).toBe(true)
    }
  })
})

// ──────────────────────────────────────────────
// The baseline does not move
// ──────────────────────────────────────────────

describe('scorecardBaseline — frozen against edits', () => {
  /**
   * Halving the strips halves the strip-minute denominator, so utilization
   * goes 34.6216…% to 69.2433…% and the spread 18.5158 to 37.0317. The
   * baseline reads the pre-edit numbers. Without the live assertion this test
   * would pass against an implementation that never captured anything and
   * against one that recaptured an unchanged value.
   */
  it('setStrips moves the live metrics and leaves the baseline where it was', () => {
    loadPreset('B5')
    useStore.getState().setStrips(30)

    expect(liveValue('strips:utilization')).toBeCloseTo(69.24338624338624, 10)
    expect(liveValue('days:balance-spread')).toBeCloseTo(37.03174603174604, 10)
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  /**
   * CDT-W-FOIL-IND is B5's latest-finishing event at 972. Cutting it from 70
   * fencers to 20 shortens its pools and DE, and the tournament finish falls
   * back to the 872 shared by the next three events.
   */
  it('updateCompetition moves the live finish and leaves the baseline where it was', () => {
    loadPreset('B5')
    useStore.getState().updateCompetition('CDT-W-FOIL-IND', { fencer_count: 20 })

    expect(liveValue('finish:tournament')).toBe(872)
    expect(liveValue('finish:day:0')).toBe(872)
    expect(liveValue('strips:utilization')).toBeCloseTo(32.929232804232804, 10)
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  /**
   * D9 rejects baselining against the last auto-schedule, so a second
   * `Auto-schedule all` must not re-capture.
   *
   * The strips are halved first on purpose. Re-running `runScheduleAll` on
   * the *unchanged* B5 config reproduces the same placements — a
   * re-capturing implementation would write the identical baseline back and
   * the test would prove nothing. At 30 strips the scheduler places 9 of 12
   * events instead, and every metric moves, so a re-capture is visible.
   */
  it('a second runScheduleAll does not re-baseline, even when it changes every metric', () => {
    loadPreset('B5')
    useStore.getState().setStrips(30)
    runScheduleAll()

    expect(Object.keys(useStore.getState().placements)).toHaveLength(9)
    expect(liveValue('finish:tournament')).toBe(1157)
    expect(liveValue('refs:peak-total')).toBe(68)
    expect(liveValue('findings:WARN')).toBe(21)
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  it('survives all three edits in sequence', () => {
    loadPreset('B5')
    useStore.getState().setStrips(30)
    useStore.getState().updateCompetition('CDT-W-FOIL-IND', { fencer_count: 20 })
    runScheduleAll()

    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  it('is not moved by a hand placement either', () => {
    loadPreset('B5')
    useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 2, start_time: 480 })

    // CDT-W-FOIL-IND leaves day 0, so day 0's finish drops to the 872 its
    // remaining events reach. `start_time: 480` is load-bearing and asserted
    // rather than left implicit: CDT-W-FOIL-IND's scheduled pool_start is 585,
    // the one B5 event the scheduler starts late, so moving it *without* the
    // earlier start leaves the tournament finish at 972 rather than 872. An
    // unrequested input field that shifts a value the case only reasons about
    // is the vacuity shape this feature has already been bitten by.
    expect(liveValue('finish:day:0')).toBe(872)
    expect(liveValue('finish:tournament')).toBe(872)
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })
})

// ──────────────────────────────────────────────
// Re-arming
// ──────────────────────────────────────────────

describe('scorecardBaseline — loading another preset re-arms it', () => {
  it('clears the baseline the moment the new preset is recorded', () => {
    loadPreset('B5')
    expect(useStore.getState().scorecardBaseline).not.toBeNull()

    applyPreset('B1')

    expect(useStore.getState().loadedPresetId).toBe('B1')
    expect(useStore.getState().scorecardBaseline).toBeNull()
  })

  it('captures the new preset\'s metrics, not the old preset\'s', () => {
    loadPreset('B5')
    loadPreset('B1')

    expectBaseline(useStore.getState().scorecardBaseline, B1_BASELINE)
    // B5's ids for days it has and B1 does not would linger in a merged
    // baseline; B1 has four days, so it carries a finish:day:3 B5 never had.
    const baseline = useStore.getState().scorecardBaseline as ScorecardBaseline
    expect(baseline['finish:day:3']).toBe(943)
    expect(baseline['finish:tournament']).not.toBe(B5_BASELINE['finish:tournament'])
  })

  it('re-arms on reloading the same preset after an edit', () => {
    loadPreset('B5')
    useStore.getState().setStrips(30)
    loadPreset('B5')

    // applyPreset restores B5's 60 strips, so the recapture lands back on
    // B5's own numbers rather than on the edited ones.
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })
})

// ──────────────────────────────────────────────
// Boot
// ──────────────────────────────────────────────

describe('scorecardBaseline — boot', () => {
  it('captures the default preset\'s baseline on a plain boot, exactly as the picker does', () => {
    bootstrap('')

    expect(useStore.getState().loadedPresetId).toBe('B1')
    expectBaseline(useStore.getState().scorecardBaseline, B1_BASELINE)
  })

  it('reaches the same baseline as the picker path does for the same preset', () => {
    bootstrap('')
    const booted = useStore.getState().scorecardBaseline
    // Without this, two absent baselines would compare equal and the test
    // would pass against an implementation that captures nothing at all.
    expectBaseline(booted, B1_BASELINE)

    useStore.setState(useStore.getInitialState(), true)
    loadPreset('B1')

    expect(booted).toEqual(useStore.getState().scorecardBaseline)
  })

  it('captures nothing on a shared-URL boot — no preset is loaded (research D9)', () => {
    loadPreset('B5')
    const url = encodeToUrl(useStore.getState())

    useStore.setState(useStore.getInitialState(), true)
    bootstrap(url)

    // The link carried the sender's placements, so the recipient is looking
    // at a full schedule — with no preset behind it and so no deltas.
    expect(Object.keys(useStore.getState().placements)).toHaveLength(12)
    expect(useStore.getState().loadedPresetId).toBeNull()
    expect(useStore.getState().scorecardBaseline).toBeNull()
  })
})

// ──────────────────────────────────────────────
// Serialization
// ──────────────────────────────────────────────

/** Every key anywhere in a parsed JSON tree. */
function allKeys(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) allKeys(entry, out)
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      out.push(key)
      allKeys(child, out)
    }
  }
  return out
}

describe('scorecardBaseline — never serialized', () => {
  it('does not appear anywhere in serializeState\'s output', () => {
    loadPreset('B5')
    useStore.getState().setHoveredMetricId('finish:tournament')
    expect(useStore.getState().scorecardBaseline).not.toBeNull()

    const keys = allKeys(JSON.parse(serializeState(useStore.getState())))

    // A nested walk, not a top-level check: a baseline tucked under
    // `tournament` or `competitions` would pass the latter.
    expect(keys).not.toContain('scorecardBaseline')
    expect(keys).not.toContain('hoveredMetricId')
    expect(keys).not.toContain('loadedPresetId')
    // The walk is only meaningful if it is actually reaching nested keys.
    expect(keys).toContain('strips_total')
    expect(keys).toContain('fencer_count')
  })

  it('leaves a recipient of a round-tripped tournament with no baseline', () => {
    loadPreset('B5')
    const json = serializeState(useStore.getState())

    useStore.setState(useStore.getInitialState(), true)
    const result = deserializeState(json)
    expect(result).not.toHaveProperty('error')
    useStore.setState((result as { state: object }).state)

    expect(useStore.getState().scorecardBaseline).toBeNull()
    expect(useStore.getState().loadedPresetId).toBeNull()
    // The tournament itself did travel — the baseline is the only thing lost.
    expect(Object.keys(useStore.getState().placements)).toHaveLength(12)
    expect(useStore.getState().strips_total).toBe(60)
  })

  it('does not overwrite a recipient\'s own baseline with the sender\'s', () => {
    loadPreset('B5')
    const json = serializeState(useStore.getState())

    useStore.setState(useStore.getInitialState(), true)
    loadPreset('B1')
    const ownBaseline = useStore.getState().scorecardBaseline
    // Two absent baselines are identical to each other, so pin the
    // recipient's own before the load or the identity check proves nothing.
    expectBaseline(ownBaseline, B1_BASELINE)

    const result = deserializeState(json)
    useStore.setState((result as { state: object }).state)

    expect(useStore.getState().scorecardBaseline).toBe(ownBaseline)
  })
})

// ──────────────────────────────────────────────
// The failure case D9 accepts
// ──────────────────────────────────────────────

describe('scorecardBaseline — a preset that cannot schedule', () => {
  /**
   * B2 places nothing: its team events reach the engine with a PERCENTAGE
   * cut, which `validateConfig` reports as a BINDING error
   * (`__tests__/store/appPathParity.test.ts` pins B2 at 0).
   *
   * **Design brief §1 gets the mechanism wrong here.** It says `scheduleAll`
   * *throws* for B2 and B8, so `runScheduleAll` returns early
   * (`src/store/runActions.ts:20`), `setPlacementsFromAuto` is never called
   * and the baseline stays null. Measured: `scheduleAll` does not throw for
   * either — `scheduleAllConcurrent` returns an **empty schedule** after its
   * BINDING validation pass (`src/engine/concurrentScheduler.ts:186-204`),
   * exactly as `appPathParity.test.ts`'s B2 note records. `runScheduleAll`
   * therefore reaches `setPlacementsFromAuto({})`, and the brief's own
   * capture rule — `loadedPresetId !== null && scorecardBaseline === null` —
   * fires on an empty placement map.
   *
   * So the baseline for B2 is the metrics of a tournament with nothing on
   * it. That is what the rule produces and what this test pins; the brief's
   * "keeps `scorecardBaseline === null`" prose does not describe it. Backlog
   * item 008 is where B2/B8's zero placements get fixed, and this test is
   * what a later fix has to move.
   */
  it('captures a baseline over zero placements when the preset schedules nothing', () => {
    loadPreset('B2')

    expect(Object.keys(useStore.getState().placements)).toHaveLength(0)
    const baseline = useStore.getState().scorecardBaseline
    expect(baseline).not.toBeNull()
    expect((baseline as ScorecardBaseline)['finish:tournament']).toBeNull()
    expect((baseline as ScorecardBaseline)['finish:day:0']).toBeNull()
  })
})
