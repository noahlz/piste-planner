import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { Scorecard } from '../../../src/components/workbench/Scorecard.tsx'
import { Drawer } from '../../../src/components/workbench/Drawer.tsx'
import { useStore } from '../../../src/store/store.ts'
import { applyPreset } from '../../../src/store/presets.ts'
import { runScheduleAll } from '../../../src/store/runActions.ts'
import { serializeState } from '../../../src/store/serialization.ts'
import {
  DEFAULT_VIEW_STATE,
  VIEW_STATE_STORAGE_KEY,
  loadViewState,
  saveViewState,
} from '../../../src/store/viewState.ts'
import { makePlacement } from '../../helpers/factories.ts'

// 004 T046 — the scorecard (US3, FR-025/FR-029, ui-contract.md §Scorecard,
// research D9). The rules this file exists to hold:
//
//   - collapsed shows two metrics and expanded shows all of them, so the set
//     of rendered `data-metric` ids is asserted exactly, in contract order,
//     in both states — never "at least two exist";
//   - a loaded preset gives every metric a delta from the frozen baseline,
//     and no preset gives *no delta element at all* (research D9), which is
//     not the same as a zero delta;
//   - there is no aggregate score in either state (FR-025);
//   - hover and keyboard focus both name the driving blocks (FR-029).
//
// Every value below is a literal taken from the B1 preset through the
// *existing* selectors (selectDerivedSchedule / selectDerivedRefRequirements /
// selectDerivedFindings), not recomputed from the component's own arithmetic.
// Where each came from is recorded beside it.

// ── B1, auto-scheduled: 4 days, 80 strips, 24 events, all 24 placed in range.
//
// 004 US4 T063 — every constant in this block but B1_FINDINGS.INFO moved. B1
// is NAC, so two of US4's four changes reach it: D6 resolves all 24
// competitions' de_mode to STAGED, and T061a pre-allocates strips_allocated,
// which re-packs the four days. D5 does not — NAC resolves ref_policy to TWO,
// which resolveRefsPerPool already scored the same as AUTO — and neither does
// D7, since applyPreset always sets the video strip count. The per-metric
// account is in __tests__/store/scorecardBaseline.test.ts's B1_BASELINE, which
// pins the same numbers unformatted; the per-scenario one is in
// specs/004-p3-workbench-shell/drift-baseline.md §T062.
const B1_FINISH_TOURNAMENT = '17:30' // max de_total_end = 1050 → formatMinutes (was 17:17 / 1037)
const B1_FINISH_BY_DAY = ['17:30', '17:05', '16:20', '16:35'] // 1050 / 1025 / 980 / 995
const B1_PEAK_TOTAL = '194' // max peak_total_refs over the four ref rows (was 220)
const B1_PEAK_SABRE = '64' // max peak_saber_refs, reached on days 0, 1 and 3 (was 76)
const B1_UTILIZATION = '35.5%' // 95308 strip-min used ÷ 268800 available (was 41.4%)
const B1_BALANCE_SPREAD = '10.6%' // day utilizations 42.379 (max) − 31.783 (min)
const B1_FINDINGS = { ERROR: '0', WARN: '4', INFO: '12' }
// 0 validation errors and 4 WARN STRIP_CONTENTION; 12 INFO CUT_SUMMARY. The 12
// WARN de_video_policy are D6's: `video-dead-config` fires only on REQUIRED +
// SINGLE_STAGE (src/engine/validation.ts:212-215), which no NAC event is now.

// ── B1 with strips cut to 20, placements unchanged: the findings move.
const B1_STRIPS20_FINDINGS = { ERROR: '11', WARN: '17', INFO: '12' }
// +11 ERROR (10 resource_precondition and, new under T061a, 1
// feasibility-strip-hours — pre-allocated strips raise the estimate past the
// gate), +13 WARN (STRIP_DEFICIT_NO_FLIGHTING), INFO unchanged — so the deltas
// are +11, +13 and zero respectively.

const COLLAPSED_IDS = ['finish:tournament', 'refs:peak-total']

const B1_EXPANDED_IDS = [
  'finish:tournament',
  'refs:peak-total',
  'finish:day:0',
  'finish:day:1',
  'finish:day:2',
  'finish:day:3',
  'refs:peak-sabre',
  'strips:utilization',
  'days:balance-spread',
  'findings:ERROR',
  'findings:WARN',
  'findings:INFO',
]

/** Loads B1 the way boot() does: applyPreset then runScheduleAll (the point
 *  at which the baseline freezes — see the S6 brief §1). */
function loadB1(): void {
  applyPreset('B1')
  runScheduleAll()
}

/** A placed tournament reached without applyPreset — the shared-link case
 *  D9 calls "no preset". 2 days, so the per-day rows cannot be 4 by accident.
 *
 *  004 US4 T063 — the strip count went 24 to 32 to keep this fixture placing
 *  anything at all. T061a's cause: `strips_allocated` used to be 0, which
 *  zeroed the DE term of `estimateCompetitionStripHours`, so the upfront
 *  feasibility gate never fired here. Pre-allocated it does fire — measured,
 *  the run reported "883 strip-hours needed over 18 events; 672 available
 *  (2d × 24s × 14h) … Add 1 more day(s) OR 8 more strip(s)" and placed zero,
 *  which would have made the assertions below hold over an empty schedule.
 *  32 is the engine's own suggested repair and keeps the day count at 2, which
 *  the id list at the bottom of this case depends on; measured, it places 12. */
function loadWithoutPreset(): void {
  const state = useStore.getState()
  state.setDays(2)
  state.setStrips(32)
  state.setVideoStrips(4)
  state.applyTemplate('RYC Weekend')
  runScheduleAll()
}

function scorecard(): HTMLElement {
  return screen.getByRole('region', { name: 'Scorecard' })
}

function disclosure(): HTMLElement {
  return screen.getByRole('button', { name: 'Scorecard details' })
}

function metricIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-metric]')].map((el) => el.getAttribute('data-metric') ?? '')
}

function row(root: HTMLElement, id: string): HTMLElement {
  const el = root.querySelector(`[data-metric="${id}"]`)
  if (!el) throw new Error(`no metric row ${id}; present: ${metricIds(root).join(', ')}`)
  return el as HTMLElement
}

/** Collapses the whitespace a formatter may or may not put around a value. */
function norm(el: Element | null): string | null {
  if (!el) return null
  return (el.textContent ?? '').replace(/\s+/g, '')
}

function valueOf(root: HTMLElement, id: string): string | null {
  return norm(row(root, id).querySelector('[data-metric-value]'))
}

function deltaOf(root: HTMLElement, id: string): string | null {
  return norm(row(root, id).querySelector('[data-metric-delta]'))
}

// jsdom 26 ships no PointerEvent constructor, and React 19 does not listen for
// `pointerenter` at all: onPointerEnter/onPointerLeave are synthesised from
// delegated `pointerover`/`pointerout`. A probe component built before this
// file confirmed it — dispatching a bare `pointerenter` MouseEvent fired no
// handler, while `pointerover` with a null relatedTarget fired onPointerEnter.
// So drive the events React actually attaches, not the ones the prop is named
// after. (@testing-library/react's fireEvent.pointerEnter does the same
// remapping internally; doing it here keeps the reason visible.)
function pointerEnter(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, relatedTarget: null }))
  })
}

function pointerLeave(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: null }))
  })
}

beforeEach(() => {
  localStorage.removeItem(VIEW_STATE_STORAGE_KEY)
  useStore.setState(useStore.getInitialState())
})

describe('Scorecard collapsed and expanded sets (ui-contract §Scorecard)', () => {
  it('renders exactly the two collapsed-tier metrics, in contract order, and none of the expanded ones', () => {
    loadB1()
    render(<Scorecard />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'false')
    // Exact and ordered: "two rows exist" would still pass if the collapsed
    // tier leaked a third metric or swapped one for another.
    expect(metricIds(scorecard())).toEqual(COLLAPSED_IDS)

    for (const id of COLLAPSED_IDS) {
      expect(row(scorecard(), id).querySelector('[data-metric-label]')).not.toBeNull()
      expect(row(scorecard(), id).querySelector('[data-metric-value]')).not.toBeNull()
    }
  })

  it('expands to every metric, one finish row per day, in contract order, under a stable button name', () => {
    loadB1()
    render(<Scorecard />)

    fireEvent.click(disclosure())

    // The accessible name does not change with the state — aria-expanded does
    // (S6 brief §4). getByRole would throw here if the label flipped to
    // "Collapse scorecard".
    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(metricIds(scorecard())).toEqual(B1_EXPANDED_IDS)

    // The disclosure names the list it controls, so what aria-expanded refers
    // to is not left to proximity. Asserted through the attribute rather than
    // against a literal id, which pins the pairing instead of the string.
    const controls = disclosure().getAttribute('aria-controls')
    expect(controls).toBeTruthy()
    const list = scorecard().querySelector(`#${controls}`)
    expect(list?.querySelectorAll('[data-metric]')).toHaveLength(B1_EXPANDED_IDS.length)
  })

  it('renders no aggregate score in either state (FR-025)', () => {
    loadB1()
    render(<Scorecard />)

    expect(new Set(metricIds(scorecard()))).toEqual(new Set(COLLAPSED_IDS))
    expect(scorecard().textContent).not.toMatch(/\bscore\b/i)
    expect(scorecard().textContent).not.toMatch(/\boverall\b/i)

    fireEvent.click(disclosure())

    expect(new Set(metricIds(scorecard()))).toEqual(new Set(B1_EXPANDED_IDS))
    expect(scorecard().textContent).not.toMatch(/\bscore\b/i)
    expect(scorecard().textContent).not.toMatch(/\boverall\b/i)
  })
})

describe('Scorecard values against the B1 preset', () => {
  it('renders each metric formatted by its kind, from the derived schedule', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())
    const card = scorecard()

    expect(valueOf(card, 'finish:tournament')).toBe(B1_FINISH_TOURNAMENT)
    B1_FINISH_BY_DAY.forEach((expected, day) => {
      expect(valueOf(card, `finish:day:${day}`)).toBe(expected)
    })
    expect(valueOf(card, 'refs:peak-total')).toBe(B1_PEAK_TOTAL)
    expect(valueOf(card, 'refs:peak-sabre')).toBe(B1_PEAK_SABRE)
    expect(valueOf(card, 'strips:utilization')).toBe(B1_UTILIZATION)
    expect(valueOf(card, 'days:balance-spread')).toBe(B1_BALANCE_SPREAD)
    expect(valueOf(card, 'findings:ERROR')).toBe(B1_FINDINGS.ERROR)
    expect(valueOf(card, 'findings:WARN')).toBe(B1_FINDINGS.WARN)
    expect(valueOf(card, 'findings:INFO')).toBe(B1_FINDINGS.INFO)
  })

  it('renders each row its own label, with the day rows numbered from 1', () => {
    // The rows are located by data-metric everywhere else in this file, so the
    // strings a person actually reads are otherwise unasserted — the selector
    // suite only checks that a label is truthy, which cannot see two rows
    // sharing one label or a day row numbered from 0.
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())

    const label = (id: string) =>
      scorecard().querySelector(`[data-metric="${id}"] [data-metric-label]`)?.textContent

    expect(label('finish:tournament')).toBe('Tournament finish')
    expect(label('refs:peak-total')).toBe('Peak referees')
    expect(label('refs:peak-sabre')).toBe('Peak sabre referees')
    // 1-based, matching the day numbering in EventBlock's accessible name.
    expect(label('finish:day:0')).toBe('Day 1 finish')
    expect(label('finish:day:3')).toBe('Day 4 finish')
  })
})

describe('Scorecard deltas (research D9)', () => {
  it('gives every metric a delta once a preset is loaded, and moves it when the numbers move', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())

    // First frame: the baseline is the state that was just captured, so every
    // delta is present and zero. Presence alone proves nothing about the
    // arithmetic — the edit below is what does.
    for (const id of B1_EXPANDED_IDS) {
      expect(deltaOf(scorecard(), id)).not.toBeNull()
    }

    // Cutting strips leaves the placements alone (no re-schedule) and moves
    // the findings: 11 errors and 13 more warnings appear, while the 12
    // CUT_SUMMARY infos do not move.
    act(() => {
      useStore.getState().setStrips(20)
    })
    const card = scorecard()

    expect(valueOf(card, 'findings:ERROR')).toBe(B1_STRIPS20_FINDINGS.ERROR)
    expect(valueOf(card, 'findings:WARN')).toBe(B1_STRIPS20_FINDINGS.WARN)
    expect(valueOf(card, 'findings:INFO')).toBe(B1_STRIPS20_FINDINGS.INFO)

    // The baseline is frozen at load, so these are deltas against 0 and 4,
    // not against the previous render. 004 US4 T063: the ERROR delta went +10
    // to +11 with the eleventh error described on B1_STRIPS20_FINDINGS; the
    // WARN delta is unchanged at +13 because both ends fell by the same 12.
    expect(deltaOf(card, 'findings:ERROR')).toBe('+11')
    expect(deltaOf(card, 'findings:WARN')).toBe('+13')
    // A metric that did not move still shows a delta, and it reads zero. The
    // sign a zero carries is not fixed by the contract, so only the magnitude
    // is asserted.
    expect((deltaOf(card, 'findings:INFO') ?? '').replace(/^[+−-]/, '')).toBe('0')
  })

  it('renders no delta element at all when no preset was loaded, collapsed or expanded', () => {
    loadWithoutPreset()
    // Precondition, not the assertion: this fixture reached a placed schedule
    // without applyPreset, which is what leaves the baseline uncaptured.
    expect(useStore.getState().loadedPresetId).toBeNull()
    expect(Object.keys(useStore.getState().placements).length).toBeGreaterThan(0)

    render(<Scorecard />)

    // Absent, not zero (D9). jsdom does no layout, so this is asserted as the
    // elements not being in the DOM — a hidden or zero-width delta would still
    // be found by querySelectorAll.
    expect(scorecard().querySelectorAll('[data-metric-delta]')).toHaveLength(0)

    fireEvent.click(disclosure())

    expect(scorecard().querySelectorAll('[data-metric-delta]')).toHaveLength(0)
    // Two days here, four in B1: the per-day rows follow days_available.
    expect(metricIds(scorecard())).toEqual([
      'finish:tournament',
      'refs:peak-total',
      'finish:day:0',
      'finish:day:1',
      'refs:peak-sabre',
      'strips:utilization',
      'days:balance-spread',
      'findings:ERROR',
      'findings:WARN',
      'findings:INFO',
    ])
  })

  /**
   * B1's latest finish is VET-M-FOIL-IND-VCMB at 1050 on day 0. Pushing it out
   * of range drops the tournament finish to VET-M-EPEE-IND-VCMB's 1025, a delta
   * of −25 minutes. formatMinutes floors, so a delta handed to it *signed*
   * renders "-0:25" and the row reads "−-0:25"; the magnitude goes through
   * Math.abs and the prefix carries the sign. No other case in this file
   * asserts a negative delta at all, let alone a negative time one.
   *
   * 004 US4 T063 — this case needed a new vehicle, not just new numbers.
   * B1's argmax event changed: VET-M-EPEE-IND-VCMB, which used to hold the
   * unique 1037, now finishes at 1025 behind VET-M-FOIL-IND-VCMB's 1050, so
   * moving it out of range left the tournament finish at 1050 and the case
   * would have asserted a delta that no longer existed. The event moved is now
   * the argmax; the delta is smaller (−0:25 rather than −1:00) but still
   * negative, still a time, and still the only one in this file.
   */
  it('renders a negative time delta as a signed clock time', () => {
    loadB1()
    act(() => {
      useStore.getState().updatePlacement('VET-M-FOIL-IND-VCMB', { day: 9 })
    })
    render(<Scorecard />)
    fireEvent.click(disclosure())

    expect(valueOf(scorecard(), 'finish:tournament')).toBe('17:05')
    expect(deltaOf(scorecard(), 'finish:tournament')).toBe('−0:25')
  })

  /**
   * A preset that later places nothing: the baseline still holds B1's 1050
   * while the live finish has no event to read at all. A delta needs both
   * sides, and `null - 1050` is −1050 rather than an error, so the guard is the
   * only thing between that and a row reading "—  −17:30".
   *
   * 004 US4 T063 — 1037 to 1050, B1's re-baselined finish; see B1_FINISH_*.
   */
  it('renders no delta once a metric\'s live value has gone null', () => {
    loadB1()
    act(() => {
      useStore.getState().setPlacementsFromAuto({})
    })
    render(<Scorecard />)

    expect(useStore.getState().scorecardBaseline!['finish:tournament']).toBe(1050)
    expect(valueOf(scorecard(), 'finish:tournament')).toBe('—')
    expect(row(scorecard(), 'finish:tournament').querySelector('[data-metric-delta]')).toBeNull()
  })

  /**
   * The mirror: a baseline captured over zero placements freezes
   * finish:tournament as null — the capture-rule edge case
   * scorecardBaseline.test.ts pins.
   *
   * Until 008 landed, B2 was a live vehicle for that (its team events reached
   * the engine with a PERCENTAGE cut, `validateConfig` reported it as a
   * BINDING error, and the scheduler returned an empty schedule), but 008's
   * team `cut_mode` fix means `applyPreset('B2')` + `runScheduleAll()` now
   * places 24 events. This case loads B2 for its competitions and fencer
   * counts, then forces the empty schedule by hand —
   * `setPlacementsFromAuto({})` in place of `runScheduleAll()` — the same
   * idiom the case above uses, so the baseline still captures over nothing
   * regardless of what B2 itself would now schedule.
   *
   * A later hand placement gives the metric a value with nothing to compare
   * it to, and `2775 - null` is 2775, not an error.
   *
   * 004 US4 T063 — 45:38 (2738) to 46:15 (2775). D6's cause: B2 is NAC, so
   * D1-M-EPEE-IND's de_mode resolves to STAGED and it runs DE_PRELIMS
   * 2470-2655 then DE_ROUND_OF_16 2685-2745 in place of the single DE block,
   * carrying `de_total_end` with it. `refs:peak-total` did not move.
   */
  it('renders no delta when the baseline entry itself was null', () => {
    applyPreset('B2')
    act(() => {
      useStore.getState().setPlacementsFromAuto({})
    })
    expect(useStore.getState().scorecardBaseline!['finish:tournament']).toBeNull()

    act(() => {
      useStore.getState().setPlacementsFromAuto({
        'D1-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 4 }),
      })
    })
    render(<Scorecard />)

    expect(valueOf(scorecard(), 'finish:tournament')).toBe('46:15')
    expect(row(scorecard(), 'finish:tournament').querySelector('[data-metric-delta]')).toBeNull()
    // refs:peak-total's baseline was 0, not null — that one does compare.
    expect(deltaOf(scorecard(), 'refs:peak-total')).toBe('+90')
  })

  /**
   * The metric set grows with days_available, so a day added after the capture
   * mints an id the frozen baseline cannot hold. D9's no-baseline rule applies
   * per metric, not only per tournament: no baseline entry means no delta
   * element, which is not the same DOM as a delta of zero.
   */
  it('renders no delta for a metric id the baseline never held', () => {
    loadB1()
    act(() => {
      useStore.getState().setDays(5)
    })
    render(<Scorecard />)
    fireEvent.click(disclosure())

    expect(useStore.getState().scorecardBaseline).not.toHaveProperty('finish:day:4')
    expect(valueOf(scorecard(), 'finish:day:4')).toBe('—')
    expect(row(scorecard(), 'finish:day:4').querySelector('[data-metric-delta]')).toBeNull()
    // The four days it does hold still carry one.
    expect(row(scorecard(), 'finish:day:3').querySelector('[data-metric-delta]')).not.toBeNull()
  })

  it('drops the sign when the rendered magnitude rounds the movement away', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())
    const dayEnd = useStore.getState().dayConfigs[0].day_end_time

    // 004 US4 T063 — both rendered values moved, 41.4%/41.3% to 35.4%/35.4%,
    // for B1's re-baselined utilization (see B1_UTILIZATION). The deltas are
    // what this case is about and neither moved: the baseline is frozen at
    // 35.456845, so +1 minute is still under a tenth of a point and +6 is
    // still over one. The two value assertions now read the same string, so
    // they no longer show the value moving — the deltas below are the only
    // thing distinguishing the two halves.

    // +1 minute of day 0 moves the utilization by 0.0105 points, less than the
    // one decimal the row shows. So a sign taken from the raw delta would
    // announce a direction the reader cannot see.
    act(() => {
      useStore.getState().updateDayConfig(0, { day_end_time: dayEnd + 1 })
    })
    expect(valueOf(scorecard(), 'strips:utilization')).toBe('35.4%')
    expect(deltaOf(scorecard(), 'strips:utilization')).toBe('0.0%')

    // +6 minutes moves it 0.0632 points, which does round to a tenth — and a
    // movement that shows keeps its sign.
    act(() => {
      useStore.getState().updateDayConfig(0, { day_end_time: dayEnd + 6 })
    })
    expect(valueOf(scorecard(), 'strips:utilization')).toBe('35.4%')
    expect(deltaOf(scorecard(), 'strips:utilization')).toBe('−0.1%')
  })
})

describe('Scorecard hover names the driving blocks (FR-029)', () => {
  it('sets the hovered metric id on pointer enter and clears it on leave', () => {
    loadB1()
    render(<Scorecard />)

    const finish = row(scorecard(), 'finish:tournament')
    pointerEnter(finish)
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')

    pointerLeave(finish)
    expect(useStore.getState().hoveredMetricId).toBeNull()

    // A second, different row: a handler that wrote one hard-coded id would
    // pass the first half of this case.
    const refs = row(scorecard(), 'refs:peak-total')
    pointerEnter(refs)
    expect(useStore.getState().hoveredMetricId).toBe('refs:peak-total')

    pointerLeave(refs)
    expect(useStore.getState().hoveredMetricId).toBeNull()
  })

  it('does the same on focus and blur, which is what makes it reachable by keyboard', () => {
    loadB1()
    render(<Scorecard />)

    const refs = row(scorecard(), 'refs:peak-total')
    // Without a tabindex the row is not focusable at all and FR-029 has no
    // keyboard path, so the attribute is part of the contract, not styling.
    expect(refs).toHaveAttribute('tabindex', '0')

    act(() => {
      refs.focus()
    })
    expect(document.activeElement).toBe(refs)
    expect(useStore.getState().hoveredMetricId).toBe('refs:peak-total')

    act(() => {
      refs.blur()
    })
    expect(useStore.getState().hoveredMetricId).toBeNull()

    const finish = row(scorecard(), 'finish:tournament')
    act(() => {
      finish.focus()
    })
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')
  })

  /**
   * The two modalities are held apart, so neither clears the other.
   *
   * Both cases above drive one modality at a time, and both pass against a
   * component that writes `null` on every leave and blur. Interleaved, that
   * component desynchronizes: the pointer visits a second row and leaves,
   * writing null, while focus has never moved — the focused row still carries
   * its ring and the canvas lights nothing. Worse in the middle, where two rows
   * look active and one drives.
   */
  it('hands the highlight back to the focused row when the pointer leaves another', () => {
    loadB1()
    render(<Scorecard />)

    const finish = row(scorecard(), 'finish:tournament')
    const refs = row(scorecard(), 'refs:peak-total')

    act(() => {
      finish.focus()
    })
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')

    // The pointer takes over while it rests on a row: the more recent intent.
    pointerEnter(refs)
    expect(useStore.getState().hoveredMetricId).toBe('refs:peak-total')

    // And hands back rather than clearing. Focus never moved.
    pointerLeave(refs)
    expect(document.activeElement).toBe(finish)
    expect(useStore.getState().hoveredMetricId).toBe('finish:tournament')

    // The focused row is still the one that can clear it.
    act(() => {
      finish.blur()
    })
    expect(useStore.getState().hoveredMetricId).toBeNull()
  })

  /**
   * FR-029 for a screen-reader user, which the highlight alone does not reach:
   * the blocks it lights are `role="img"` with a static accessible name, and
   * role="img" is not a live region, so changing those names would announce
   * nothing. Without this node a keyboard user tabs the rows, lights the canvas
   * on each one, and is told nothing at all.
   *
   * The counts are B1's measured driving-set sizes.
   *
   * 004 US4 T063 — 2 blocks became 3 and 1 became 0, and with them this case
   * **lost the singular half of the plural rule it was written to exercise
   * both ways.** Both causes are measured. The argmax event's segment count is
   * D6's: under the resolved STAGED de_mode VET-M-FOIL-IND-VCMB draws POOLS,
   * DE_PRELIMS and DE_ROUND_OF_16 rather than POOLS and DE. The sabre row's
   * zero is T061a's re-pack: `peak_saber_refs` now reaches its maximum of 64
   * on days 0, 1 and 3, the first of those is day 0, and day 0's total
   * `peak_time` is 480 — a minute at which no sabre block on that day is open.
   * A metric reporting a non-zero number while lighting nothing is a real
   * product state, documented on the same footing in
   * `__tests__/store/scorecardMetrics.test.ts`, so 0 is correct here rather
   * than a defect. No B1 metric has a driving set of exactly 1 any more, so
   * the singular branch of the `length === 1 ? '' : 's'` ternary is
   * **unasserted anywhere in this file**. Restoring it needs a new fixture,
   * which is test design rather than re-baselining and was left undone.
   */
  it('announces which metric is driving and how many blocks it lights', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())

    const status = () => scorecard().querySelector('[data-highlight-status]')
    expect(status()?.getAttribute('aria-live')).toBe('polite')
    // Present from the first frame and empty: a live region inserted at the
    // moment of the change is not reliably announced.
    expect(status()?.textContent).toBe('')

    pointerEnter(row(scorecard(), 'finish:tournament'))
    expect(status()?.textContent).toBe('Tournament finish: 3 blocks highlighted')

    pointerEnter(row(scorecard(), 'refs:peak-sabre'))
    expect(status()?.textContent).toBe('Peak sabre referees: 0 blocks highlighted')

    pointerLeave(row(scorecard(), 'refs:peak-sabre'))
    expect(status()?.textContent).toBe('')
  })
})

describe('Scorecard expansion is a viewer preference (T051, research D10)', () => {
  it('opens in the expansion the viewer last stored', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, scorecardExpanded: true })
    loadB1()
    render(<Scorecard />)

    expect(disclosure()).toHaveAttribute('aria-expanded', 'true')
    expect(metricIds(scorecard())).toEqual(B1_EXPANDED_IDS)
  })

  it('writes the expansion back merged with the view state it does not own', () => {
    // Drawer.tsx's precedent: read the whole stored state, spread it, change
    // one field. Writing a fresh object would silently reset every one of
    // these, none of which the scorecard owns.
    saveViewState({
      ...DEFAULT_VIEW_STATE,
      viewMode: 'schedule',
      rowHeightStep: 'tall',
      timeZoom: 3,
      timeScroll: 900,
      rowScroll: 7,
      drawerHeight: 321,
      scorecardExpanded: false,
    })
    loadB1()
    render(<Scorecard />)

    fireEvent.click(disclosure())

    const stored = loadViewState()
    expect(stored.scorecardExpanded).toBe(true)
    expect(stored.viewMode).toBe('schedule')
    expect(stored.rowHeightStep).toBe('tall')
    expect(stored.timeZoom).toBe(3)
    expect(stored.timeScroll).toBe(900)
    expect(stored.rowScroll).toBe(7)
    expect(stored.drawerHeight).toBe(321)

    // And collapsing again writes the other way, rather than only ever
    // latching to true.
    fireEvent.click(disclosure())
    expect(loadViewState().scorecardExpanded).toBe(false)
    expect(loadViewState().drawerHeight).toBe(321)
  })

  it('keeps the expansion out of a shared link (ui-contract §Serialization)', () => {
    loadB1()
    render(<Scorecard />)
    fireEvent.click(disclosure())
    expect(loadViewState().scorecardExpanded).toBe(true)

    const serialized = JSON.parse(serializeState(useStore.getState())) as unknown
    expect(JSON.stringify(serialized)).not.toContain('scorecardExpanded')
    expect(JSON.stringify(serialized)).not.toContain('scorecardBaseline')
    expect(JSON.stringify(serialized)).not.toContain('hoveredMetricId')
  })
})

describe('the drawer holds the scorecard and the findings list (FR-006)', () => {
  it('renders both at a small drawer height', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, drawerHeight: 96 })
    loadB1()
    render(<Drawer />)

    const drawer = screen.getByRole('region', { name: 'Drawer' })
    expect(drawer).toContainElement(scorecard())
    expect(screen.getByText('Analysis Output')).toBeInTheDocument()
  })

  it('renders both at a large drawer height', () => {
    saveViewState({ ...DEFAULT_VIEW_STATE, drawerHeight: 640 })
    loadB1()
    render(<Drawer />)

    const drawer = screen.getByRole('region', { name: 'Drawer' })
    expect(drawer).toContainElement(scorecard())
    expect(screen.getByText('Analysis Output')).toBeInTheDocument()
  })
})
