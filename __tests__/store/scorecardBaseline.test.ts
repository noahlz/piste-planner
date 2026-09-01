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
 * is day 0's 36.0238…% less day 2's 32.5595…%; the 12 WARN findings are 12
 * `video-dead-config` validation errors, with `analysis.warnings` empty.
 *
 * 004 US4 T063 — five entries moved: finish:tournament 972 to 872, day 0 972
 * to 872, day 1 867 to 872, days:balance-spread 18.5158… to 3.4642… and
 * findings:WARN 13 to 12. T061a's cause, alone. B5 is SJCC: its D6 de_mode
 * default is SINGLE_STAGE, the value the store hardcoded before; its D5
 * ref_policy resolves to TWO, which is what AUTO already scored; and
 * applyPreset sets its 12 video strips explicitly, so D7 has no null to fill.
 * Pre-allocated strips_allocated re-packed B5 from an uneven day spread onto
 * four events per day, which moved which events sit where, removed the one
 * late pool start that produced 972, flattened the balance spread and cleared
 * the day-level contention warning. `__tests__/store/scorecardMetrics.test.ts`
 * carries the per-metric account; the per-scenario one is in
 * `specs/004-p3-workbench-shell/drift-baseline.md` §T062.
 */
const B5_BASELINE: ScorecardBaseline = {
  'finish:tournament': 872,
  'refs:peak-total': 116,
  'finish:day:0': 872,
  'finish:day:1': 872,
  'finish:day:2': 872,
  'refs:peak-sabre': 56,
  'strips:utilization': 34.62169312169312,
  'days:balance-spread': 3.4642857142857153,
  'findings:ERROR': 0,
  'findings:WARN': 12,
  'findings:INFO': 0,
}

/**
 * B1 (the boot preset): 4 days, 80 strips, 24 events, all placed.
 *
 * 004 US4 T063 — every entry but `findings:ERROR` and `findings:INFO` moved.
 * B1 is NAC, so two of US4's four changes reach it. D6 resolves all 24
 * competitions to STAGED, which splits each DE into a prelims and a
 * round-of-16 block and retires the twelve `video-dead-config` WARN that only
 * fire on REQUIRED + SINGLE_STAGE — findings:WARN 16 to 4, the four remaining
 * being day-level `STRIP_CONTENTION`. T061a's pre-allocated strips re-pack the
 * four days, moving every finish and both ref peaks. D5 does not reach it: NAC
 * resolves ref_policy to TWO, which `resolveRefsPerPool` already scored the
 * same as AUTO. Neither does D7: applyPreset sets B1's video strips.
 */
const B1_BASELINE: ScorecardBaseline = {
  'finish:tournament': 1050,
  'refs:peak-total': 194,
  'finish:day:0': 1050,
  'finish:day:1': 1025,
  'finish:day:2': 980,
  'finish:day:3': 995,
  'refs:peak-sabre': 64,
  'strips:utilization': 35.456845238095234,
  'days:balance-spread': 10.59672619047619,
  'findings:ERROR': 0,
  'findings:WARN': 4,
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
   * goes 34.6216…% to 69.2433…% and the spread 3.4642 to 6.9285. The
   * baseline reads the pre-edit numbers. Without the live assertion this test
   * would pass against an implementation that never captured anything and
   * against one that recaptured an unchanged value.
   *
   * 004 US4 T063 — only the spread moved, 37.0317… to 6.9285…, and it is the
   * B5 baseline spread's own halving carried through. T061a's cause, by way of
   * the flatter day spread recorded on B5_BASELINE above.
   */
  it('setStrips moves the live metrics and leaves the baseline where it was', () => {
    loadPreset('B5')
    useStore.getState().setStrips(30)

    expect(liveValue('strips:utilization')).toBeCloseTo(69.24338624338624, 10)
    expect(liveValue('days:balance-spread')).toBeCloseTo(6.928571428571431, 10)
    expectBaseline(useStore.getState().scorecardBaseline, B5_BASELINE)
  })

  /**
   * Cutting CDT-M-EPEE-IND from 70 fencers to 20 shortens its pools and DE, so
   * day 2's finish falls and `strips:utilization` goes 34.6216…% to 32.1296…%.
   *
   * 004 US4 T067 — the edit was CDT-W-FOIL-IND until T063's re-pack made this
   * case prove nothing. CDT-W-FOIL-IND used to be B5's unique latest-finishing
   * event at 972, so cutting it was what moved the tournament finish, 972 down
   * to the 872 shared by the next three. After T061a it finishes at 867 on day
   * 2 and 872 is already the finish before the edit, which left both finish
   * assertions vacuously true while the case's **name** went on promising a
   * movement — and the name is what the next reader greps for.
   *
   * The edit now targets day 2's argmax, CDT-M-EPEE-IND at 872. Cutting it
   * drops `finish:day:2` to CDT-W-FOIL-IND's 867, a real movement against the
   * 872 the frozen baseline still holds. `finish:tournament` and
   * `finish:day:0` are kept at 872 deliberately: days 0 and 1 still finish
   * there, so together the three show a day-level movement that does not reach
   * the tournament row — and all four assertions still guard the baseline's
   * independence from the live metrics.
   */
  it('updateCompetition moves the live finish and leaves the baseline where it was', () => {
    loadPreset('B5')
    useStore.getState().updateCompetition('CDT-M-EPEE-IND', { fencer_count: 20 })

    // The movement: B5_BASELINE holds 872 for this same id.
    expect(liveValue('finish:day:2')).toBe(867)
    expect(liveValue('finish:tournament')).toBe(872)
    expect(liveValue('finish:day:0')).toBe(872)
    expect(liveValue('strips:utilization')).toBeCloseTo(32.12962962962963, 10)
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

    // 004 US4 T063 — finish:tournament 1157 to 1007, T061a's re-pack of the
    // 9 events this 30-strip run places. The other three numbers did not move.
    expect(Object.keys(useStore.getState().placements)).toHaveLength(9)
    expect(liveValue('finish:tournament')).toBe(1007)
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

  /**
   * 004 US4 T063 — this case needed a new vehicle. It used to move
   * CDT-W-FOIL-IND to `{ day: 2, start_time: 480 }` and read day 0's finish
   * dropping 972 to 872, with the explicit `start_time` load-bearing because
   * CDT-W-FOIL-IND was the one B5 event the scheduler started late at 585.
   * T061a's re-pack put CDT-W-FOIL-IND on **day 2 at 480 already**, so that
   * exact update became a no-op and every assertion under it passed against a
   * store nothing had changed — the vacuity shape the old comment was written
   * to avoid, arriving by a different route.
   *
   * The replacement is still one hand placement and still moves a live metric:
   * day 3 is outside `days_available`, so `scorecardBlocks` drops the event's
   * two segments and `strips:utilization` falls 34.6216…% to 31.7764…%. That
   * figure is cross-pinned by `__tests__/store/scorecardMetrics.test.ts`,
   * which measures the same move. The finishes are asserted unmoved rather
   * than dropped: B5's finish column ties four ways at 872 now, so no single
   * placement can move it, and saying so is what keeps the next reader from
   * mistaking a tie for a broken skip.
   */
  it('is not moved by a hand placement either', () => {
    loadPreset('B5')
    useStore.getState().updatePlacement('CDT-W-FOIL-IND', { day: 3 })

    expect(liveValue('strips:utilization')).toBeCloseTo(31.776455026455025, 10)
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
    expect(baseline['finish:day:3']).toBe(995) // 004 US4 T063: was 943, see B1_BASELINE
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

describe('scorecardBaseline — a schedule with nothing placed', () => {
  /**
   * The capture rule's edge case: a tournament that places nothing still
   * gets a baseline, over an empty placement map, rather than staying null.
   *
   * Until 008 landed, B2 was a live vehicle for this: its team events
   * reached the engine with a PERCENTAGE cut, which `validateConfig`
   * reported as a BINDING error, and `scheduleAllConcurrent` returned an
   * **empty schedule** after that validation pass rather than throwing
   * (`src/engine/concurrentScheduler.ts:186-204` — the design brief's §1 says
   * `scheduleAll` throws for B2 and B8 and `runScheduleAll` returns early at
   * `src/store/runActions.ts:20`; measured, it does not, for either preset).
   * `runScheduleAll` reached `setPlacementsFromAuto({})` on its own, and the
   * capture rule — `loadedPresetId !== null && scorecardBaseline === null` —
   * fired on that empty map.
   *
   * 008's team `cut_mode` fix means B2 now schedules 24 events
   * (`__tests__/store/appPathParity.test.ts` pins it there), so the preset
   * that used to demonstrate this edge case no longer does. This case builds
   * the empty state directly instead: `loadPreset('B2')` still loads B2's
   * competitions and fencer counts, but `setPlacementsFromAuto({})` is
   * called by hand in place of `runScheduleAll()`'s own scheduling pass,
   * landing the store in the same state a failed-to-schedule preset used to
   * reach unassisted.
   */
  it('captures a baseline over zero placements when the preset schedules nothing', () => {
    applyPreset('B2')
    useStore.getState().setPlacementsFromAuto({})

    expect(Object.keys(useStore.getState().placements)).toHaveLength(0)
    const baseline = useStore.getState().scorecardBaseline
    expect(baseline).not.toBeNull()
    expect((baseline as ScorecardBaseline)['finish:tournament']).toBeNull()
    expect((baseline as ScorecardBaseline)['finish:day:0']).toBeNull()
  })
})
