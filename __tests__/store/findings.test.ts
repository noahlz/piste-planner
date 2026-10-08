import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { phaseSpans } from '../../src/engine/unseated.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DAY_AXIS_SPACING_MINS, DeMode, Phase, Weapon } from '../../src/engine/types.ts'
import {
  RunState,
  selectDerivedSchedule,
  selectDerivedFindings,
  selectDrawnSchedule,
  selectPlacementCounts,
} from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import { UNPLACED_WORDING, moveDay, pinAll, runAndMoveHeadline, runAndPinAll, runPreset } from '../helpers/drawnFixtures.ts'
import { competitionLabel } from '../../src/lib/competitionLabels.ts'
import { formatClock } from '../../src/lib/time.ts'

/**
 * 013 T030 (phase-5 contract, contracts/phase5-contract.md §1) — the unified
 * findings list. `selectFindings`, `FindingSeverity` and
 * `LATE_FINISH_WINDOW_MINS` do not exist in `src/store/derived.ts` yet, so
 * every case here is red for the same reason: the cast-through-unknown
 * accessors below throw before an assertion runs (same pattern as
 * `dismissals.test.ts`'s `findingIdentity` wrapper), keeping this file
 * tsc-clean ahead of the export.
 *
 * Correction (013 T032 review follow-up): the paragraph this replaces claimed
 * no INFO/Note row exists anywhere in this codebase and dropped both the
 * §1.1/§1.2 INFO → Note mapping case and §2.2's "Note rows are undismissable"
 * case on that basis. Half of that claim held and half did not:
 * - `src/engine/validation.ts`'s `ValidationError` rows (§1.1) are indeed
 *   always ERROR or WARN — `err`/`structural`/`notice`/`policy` never
 *   construct `BottleneckSeverity.INFO` — so §1.1 alone has no INFO witness.
 * - But `src/engine/analysis.ts`'s `Bottleneck` rows (§1.2) do: Pass 6 (cut
 *   summary, `analysis.ts:245-258`) emits one `BottleneckSeverity.INFO`
 *   warning per cut-enabled competition, unconditionally. `threeEventsOverlappingOnDayZero`
 *   below is JUNIOR-category and cut-enabled by default, so it already raises
 *   three of them — `analysis:cut-summary:<id>:<id>:-` per competition (016
 *   Task C id format). Both cases
 *   are written below against that row rather than dropped.
 */

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

interface Finding {
  id: string
  severity: string
  where: string
  day: number | null
  message: string
  target: string | null
  /** 016 Task C: false for Blocking, Note and `hard-separation-violated` rows. */
  dismissable: boolean
  /** 016 Task D: every on-board competition the row names, sorted and unique. */
  subjects: string[]
}

function selectFindings(state: StoreState): Finding[] {
  const mod = derivedModule as unknown as { selectFindings?: (s: StoreState) => Finding[] }
  if (!mod.selectFindings) {
    throw new Error('derived.ts does not yet export selectFindings (013 T030)')
  }
  return mod.selectFindings(state)
}

function findingSeverityValues(): string[] {
  const mod = derivedModule as unknown as { FindingSeverity?: Record<string, string> }
  if (!mod.FindingSeverity) {
    throw new Error('derived.ts does not yet export FindingSeverity (013 T030)')
  }
  return Object.values(mod.FindingSeverity)
}

function lateFinishWindowMins(): number {
  const mod = derivedModule as unknown as { LATE_FINISH_WINDOW_MINS?: number }
  if (mod.LATE_FINISH_WINDOW_MINS === undefined) {
    throw new Error('derived.ts does not yet export LATE_FINISH_WINDOW_MINS (013 T030)')
  }
  return mod.LATE_FINISH_WINDOW_MINS
}

// Smallest drift-ledger scenario (12 events) — copied from dismissals.test.ts,
// which established this as the standard non-trivial B-scenario setup for
// store-level tests in this directory.
function setupB5(): void {
  const scenario = SCENARIOS.B5
  const state = useStore.getState()
  state.setTournamentType(scenario.tournamentType)
  state.setDays(scenario.days)
  state.setStrips(scenario.strips)
  state.setVideoStrips(scenario.videoStrips)
  state.selectCompetitions(Object.keys(scenario.fencerCounts))
  for (const [id, fencer_count] of Object.entries(scenario.fencerCounts)) {
    useStore.getState().updateCompetition(id, { fencer_count })
  }
}

/**
 * Copied verbatim from `__tests__/store/daySummaries.test.ts` (the proven
 * overflow fixture: one DE phase overflows at 4 strips, day 0). Since 024 group
 * A (2026-10-06) it is JR-M-FOIL-IND's, not JR-M-EPEE-IND's: a pool of 8 takes
 * 160 minutes in both weapons (METHODOLOGY.md §Pool Duration Estimation), so
 * JR-M-EPEE-IND's DE runs 670-710 on 3 strips and JR-M-FOIL-IND's, starting
 * at 690 with 1 strip free, overflows. Day 0 finishes at 730.
 * See that file for why this fixture's third event is needed to make the
 * lane packer's own interval-overlap logic exercise itself, rather than
 * `twoJuniorEpeeOnSeparateDays`'s one-event-per-day layout.
 */
function threeEventsOverlappingOnDayZero(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(4)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND', 'JR-M-FOIL-IND']) {
    s.updateCompetition(id, { fencer_count: 8 })
  }
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 1, start_time: 480, strip_count: 1 }),
    'JR-M-FOIL-IND': makePlacement({ day: 0, start_time: 500, strip_count: 1 }),
  })
}

/**
 * Two individual epee events, same fencer count, same day, same start
 * minute and strip request, gender the only difference — for the late-finish
 * tie-break (contract §1.4, `derived.ts:573-579`). Pool/DE duration is a pure
 * function of weapon, category and fencer count, not gender, so both events'
 * phases land on identical minutes: measured (throwaway script, not
 * predicted) at pools 480-704 (1 strip each) and DE 735-769 (4 strips each).
 * Since 024 group A (2026-10-06): pools 480-640 and DE 670-710, derived from
 * the pool of 8's 160 minutes and one 20-minute wave each for R8 and the semis.
 * 8 strips covers the DE phase's simultaneous demand (4 + 4) without either
 * event overflowing.
 */
function tiedEpeeEventsOnDayZero(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(1)
  s.setStrips(8)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    s.updateCompetition(id, { fencer_count: 8 })
  }
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
  })
}

/**
 * Two individually-placed epee events, one per day, each grossly over strip
 * capacity (60 fencers → 9 pools against 1 strip). Measured with a
 * throwaway scratch script, not predicted: this raises the venue-level
 * `day-pools-exceed-strips` bottleneck (`Bottleneck.competition_id === ''`,
 * Pass 0 of `initialAnalysis`) once per over-capacity day, so the two warnings
 * share rule, an (empty) competition_id and (empty) subjects, and differ only
 * by `Bottleneck.day` – the field 016 Task C's row id ends in. The same setup
 * also raises one `pools-exceed-strip-cap-unflighted` warning per competition
 * (owner and subject set, no day) and one video-demand warning per day.
 */
function twoDaysOverCapacity(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(2)
  s.setStrips(1)
  s.setVideoStrips(0)
  s.selectCompetitions(['D1-M-EPEE-IND', 'D1-W-EPEE-IND'])
  s.updateCompetition('D1-M-EPEE-IND', { fencer_count: 60 })
  s.updateCompetition('D1-W-EPEE-IND', { fencer_count: 60 })
  s.setPlacementsFromAuto({
    'D1-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'D1-W-EPEE-IND': makePlacement({ day: 1, start_time: 480, strip_count: 1 }),
  })
}

describe('selectFindings — row shape (contract §1)', () => {
  it('gives every row an id, a known severity, a where, a message, and typed day/target', () => {
    threeEventsOverlappingOnDayZero()
    const rows = selectFindings(useStore.getState())
    const severities = findingSeverityValues()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(typeof row.id).toBe('string')
      expect(row.id.length).toBeGreaterThan(0)
      expect(severities).toContain(row.severity)
      expect(typeof row.where).toBe('string')
      expect(row.where.length).toBeGreaterThan(0)
      expect(typeof row.message).toBe('string')
      expect(row.message.length).toBeGreaterThan(0)
      expect(row.day === null || typeof row.day === 'number').toBe(true)
      expect(row.target === null || typeof row.target === 'string').toBe(true)
      expect(typeof row.dismissable, `row ${row.id} carries a boolean dismissable`).toBe('boolean')
    }
  })
})

describe('selectFindings — severity map from ValidationError (contract §1.1)', () => {
  it('maps an ERROR-severity structural finding to Blocking, with no target/day and the field as where', () => {
    setupB5()
    useStore.getState().setStrips(0)
    const state = useStore.getState()
    const stripsError = selectDerivedFindings(state).validationErrors.find(
      (e) => e.rule === 'strips-total-positive',
    )
    expect(stripsError, 'expected the strips-total-positive structural error').toBeDefined()
    const id = findingIdentity(stripsError!)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === id)
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Blocking')
    expect(row?.target).toBeNull()
    expect(row?.day).toBeNull()
    expect(row?.where).toBe('strips_total')
  })

  it('maps a WARN-severity notice finding to Warning', () => {
    setupB5()
    useStore.getState().setDays(1)
    const state = useStore.getState()
    const rangeNotice = selectDerivedFindings(state).validationErrors.find(
      (e) => e.rule === 'days-available-range',
    )
    expect(rangeNotice, 'expected the days-available-range notice').toBeDefined()
    const id = findingIdentity(rangeNotice!)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === id)
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Warning')
  })
})

describe('selectFindings — target/day/where for a competition-subject validation row (contract §1.1/§1.5)', () => {
  it('reads target and day off the subject competition placement, and where off "Day N · label"', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const videoNotice = selectDerivedFindings(state).validationErrors.find(
      (e) => e.rule === 'video-dead-config' && e.subjects.includes('JR-M-EPEE-IND'),
    )
    expect(videoNotice, 'expected a video-dead-config notice for JR-M-EPEE-IND').toBeDefined()
    const id = findingIdentity(videoNotice!)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === id)
    expect(row).toBeDefined()
    expect(row?.target).toBe('JR-M-EPEE-IND')
    expect(row?.subjects).toEqual(['JR-M-EPEE-IND'])
    expect(row?.day).toBe(0)

    const schedule = selectDerivedSchedule(state)
    const comp = schedule.competitions.find((c) => c.id === 'JR-M-EPEE-IND')
    expect(comp, 'expected JR-M-EPEE-IND in the derived schedule competitions').toBeDefined()
    expect(row?.where).toBe(`Day 1 · ${competitionLabel(comp!)}`)
  })
})

/**
 * 016 Task C (spec §2): the §1.2 row id is
 * `analysis:<rule>:<competition_id>:<subjects joined by +>:<day or ->`,
 * replacing `analysis:<cause>:<competition_id>:<ordinal>`.
 */
describe('selectFindings — bottleneck row id is rule, owner, subjects and day (016 spec §2)', () => {
  it('builds every analysis id from rule, owner, subjects and day, keeps them unique, and reads target/day for a named competition', () => {
    twoDaysOverCapacity()
    const state = useStore.getState()
    const warnings = selectDerivedFindings(state).analysis.warnings
    expect(warnings.length).toBeGreaterThan(0)

    const rows = selectFindings(state)

    for (const warning of warnings) {
      const expectedId =
        `analysis:${warning.rule}:${warning.competition_id}:${warning.subjects.join('+')}:${warning.day ?? '-'}`
      expect(
        rows.some((r) => r.id === expectedId),
        `expected a row with id ${expectedId}`,
      ).toBe(true)
    }

    // Two venue warnings sharing rule, empty owner and empty subjects differ by day alone.
    expect(rows.some((r) => r.id === 'analysis:day-pools-exceed-strips:::0')).toBe(true)
    expect(rows.some((r) => r.id === 'analysis:day-pools-exceed-strips:::1')).toBe(true)

    const analysisIds = rows.filter((r) => r.id.startsWith('analysis:')).map((r) => r.id)
    expect(new Set(analysisIds).size).toBe(analysisIds.length)

    // An owned, single-subject warning with no day ends in "-".
    const deficitRow = rows.find(
      (r) => r.id === 'analysis:pools-exceed-strip-cap-unflighted:D1-M-EPEE-IND:D1-M-EPEE-IND:-',
    )
    expect(deficitRow).toBeDefined()
    expect(deficitRow?.target).toBe('D1-M-EPEE-IND')
    expect(deficitRow?.day).toBe(0)
  })
})

describe('selectFindings — INFO bottleneck maps to a Note row (contract §1.2, corrected header comment above)', () => {
  it('reads the cut-summary INFO warning as a Note row at the analysis:cut-summary id', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const warnings = selectDerivedFindings(state).analysis.warnings
    const cutSummaries = warnings.filter((w) => w.cause === 'CUT_SUMMARY')
    expect(cutSummaries.length).toBe(3)
    expect(cutSummaries.every((w) => w.severity === 'INFO')).toBe(true)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'analysis:cut-summary:JR-M-EPEE-IND:JR-M-EPEE-IND:-')
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Note')
  })
})

/**
 * 017 T5a (spec §4): the Unplaced rows read the drawn model, one row per event
 * it counts as unplaced, never the lane packer's overflow. Before T5a these
 * rows came one per overflowing block of `assignStripLanes`, with ids
 * `unplaced:<id>:<phase>`; the run-less overflow fixture's
 * `unplaced:JR-M-FOIL-IND:DE` was the case this describe used to pin.
 */
describe('selectFindings — Unplaced rows read the drawn model (017 T5a, spec §4)', () => {
  const unplacedRows = (): Finding[] => selectFindings(useStore.getState()).filter((r) => r.severity === 'Unplaced')

  it('gives the headline move one re-run row naming the event on its new day', () => {
    const { id, day } = runAndMoveHeadline('B1')

    expect(unplacedRows()).toEqual([{
      id: `unplaced:${id}:room`,
      severity: 'Unplaced',
      where: `Day ${day + 1} · ${labelOfId(id)}`,
      day,
      message: UNPLACED_WORDING.RERUN,
      target: id,
      subjects: [id],
      dismissable: true,
    }])
  })

  it('clears the headline move\'s row once Auto-assign runs again', () => {
    runAndMoveHeadline('B1')
    expect(unplacedRows(), 'premise: the move left a row').toHaveLength(1)

    runScheduleAll()

    expect(unplacedRows()).toEqual([])
  })

  /** Every drawn block of the model as one comparable line, sorted. */
  function geometry(blocks: { competitionId: string; phase: string; day: number; startMinutes: number; endMinutes: number; strips: readonly number[] }[]): string[] {
    return blocks
      .map((b) => `${b.competitionId}|${b.phase}|d${b.day}|${b.startMinutes}-${b.endMinutes}|${b.strips.join(',')}`)
      .sort()
  }

  it.each(SCENARIO_IDS)('%s: Move day of every event to every other day moves no kept event and gives an unseated mover one re-run row', (scenario) => {
    runPreset(scenario)
    const saved = useStore.getState().placements
    const days = useStore.getState().days_available
    const before = geometry(selectDrawnSchedule(useStore.getState()).blocks)

    let unseatedMoves = 0
    for (const id of Object.keys(saved).sort()) {
      for (let day = 0; day < days; day++) {
        if (day === saved[id].day) continue
        useStore.setState({ placements: saved })
        moveDay(id, day)
        const model = selectDrawnSchedule(useStore.getState())
        const move = `${id} → day ${day + 1}`
        expect(model.runState, `${move}: premise: a placement edit keeps the board fresh`).toBe('fresh')

        const others = model.blocks.filter((b) => b.competitionId !== id)
        expect(geometry(others), `${move}: kept events hold their times and strips`)
          .toEqual(before.filter((line) => !line.startsWith(`${id}|`)))

        // The oracle reads the mover's drawn strips, not `unplacedIds`, which the
        // rows are built from. A zero-strip phase is never a block, so an empty
        // strip set is an unseated phase.
        const unseated = model.blocks.some((b) => b.competitionId === id && b.strips.length === 0)
        if (unseated) unseatedMoves++
        expect(
          unplacedRows().map((r) => [r.id, r.message]),
          `${move}: ${unseated ? 'one re-run row' : 'no row'}`,
        ).toEqual(unseated ? [[`unplaced:${id}:room`, UNPLACED_WORDING.RERUN]] : [])
      }
    }
    expect(unseatedMoves, 'premise: some moves leave the mover unseated').toBeGreaterThan(0)
  })

  it.each(SCENARIO_IDS)('%s: a pin-all re-run gives one pin-wording row per event with an unseated phase', (scenario) => {
    runAndPinAll(scenario)
    const model = selectDrawnSchedule(useStore.getState())
    const unseated = [...model.unplacedIds].sort()
    expect(unseated.length, 'premise: the re-run leaves pinned phases unseated').toBeGreaterThan(0)
    for (const id of unseated) expect(model.events[id].source, `${id} stays kept`).toBe('kept')

    const rows = unplacedRows().map((r) => [r.id, r.message]).sort()
    expect(rows).toEqual(unseated.map((id) => [`unplaced:${id}:room`, UNPLACED_WORDING.PIN]))
  })

  /**
   * P4 (a) and (b): while stale the board is not a schedule, so its unseated
   * phases raise no row. The out-of-range row stays, the events with no
   * placement still count in the footer, and one non-dismissable stale row
   * stands where the per-event rows were.
   */
  it('shows no unseated row after a settings edit, keeps the out-of-range row and adds the stale row', () => {
    runAndPinAll('B4')
    expect(unplacedRows().length, 'premise: the fresh board has unseated rows').toBeGreaterThan(0)
    const stranded = Object.keys(useStore.getState().placements).sort()[0]
    useStore.getState().updatePlacement(stranded, { day: 9 })

    // A setting B4's foil events read. B4 is a youth event set whose DE mode
    // already defaults to single stage, so a DE-mode override would change nothing.
    useStore.getState().setPoolRoundDuration(Weapon.FOIL, useStore.getState().pool_round_duration_table[Weapon.FOIL] + 15)
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: the settings edit makes the board stale').toBe('stale')
    expect(model.blocks.some((b) => b.unseated), 'premise: the stale board has unseated phases').toBe(true)

    // Source order, unsorted: the stale row stands where the per-event rows
    // were, ahead of the out-of-range rows (P4 (b)).
    expect(unplacedRows().map((r) => r.id)).toEqual(['stale:run', `unplaced:${stranded}:day`])
    expect(unplacedRows().find((r) => r.id === 'stale:run')).toEqual({
      id: 'stale:run',
      severity: 'Unplaced',
      where: 'Board',
      day: null,
      message: UNPLACED_WORDING.STALE,
      target: null,
      subjects: [],
      dismissable: false,
    })

    const selected = Object.keys(state.selectedCompetitions)
    const inRange = selected.filter((id) => {
      const placement = state.placements[id]
      return placement !== undefined && placement.day >= 0 && placement.day < state.days_available
    })
    expect(selected.length - inRange.length, 'premise: one stranded event plus events with no placement').toBeGreaterThan(1)
    const { placed, unplaced } = selectPlacementCounts(state)
    expect({ placed, unplaced }).toEqual({ placed: inRange.length, unplaced: selected.length - inRange.length })
  })

  /**
   * The usual stale board: a run, then an input edit after which every phase
   * still finds strips. B5 with 20 more strips is one (measured: B1-B8 under a
   * DE-mode override, a pool-duration change or one more video strip all leave
   * a phase unseated once the whole board is derived).
   */
  it('shows the stale row on a stale board where every phase is seated', () => {
    runPreset('B5')
    useStore.getState().setStrips(useStore.getState().strips_total + 20)
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: the strip edit makes the board stale').toBe('stale')
    expect(model.blocks.every((b) => !b.unseated), 'premise: every phase is seated').toBe(true)

    expect(unplacedRows().map((r) => [r.id, r.message])).toEqual([['stale:run', UNPLACED_WORDING.STALE]])
    expect(selectPlacementCounts(state)).toEqual({ placed: 12, unplaced: 0, pinned: 0 })
  })

  /**
   * Review focus 6: a pin whose strip count is above the engine's cap keeps
   * its own key (keptRun), so the drawn model still finds it where kept. If
   * the comparison used the engine's capped strip count, it would turn derived
   * and get the re-run wording.
   */
  it('keeps a pin above the engine\'s strip cap and gives it the pin wording when unseated', () => {
    // keptRun's pinAllWithOversizedPin order: the first id after one run.
    runPreset('B1')
    pinAll()
    const [oversizedId] = Object.keys(useStore.getState().placements)
    useStore.getState().updatePlacement(oversizedId, { strip_count: 40 })
    runScheduleAll()
    const model = selectDrawnSchedule(useStore.getState())
    expect(model.runState, 'premise: the board is fresh after the run').toBe('fresh')
    expect(model.events[oversizedId].result.pool_strip_count, 'premise: the engine capped the pool strips below the pin')
      .toBeLessThan(40)
    expect(model.unplacedIds.has(oversizedId), 'premise: the oversized pin is unseated').toBe(true)

    expect(model.events[oversizedId].source).toBe('kept')
    expect(unplacedRows().filter((r) => r.target === oversizedId).map((r) => [r.id, r.message]))
      .toEqual([[`unplaced:${oversizedId}:room`, UNPLACED_WORDING.PIN]])
  })

  /**
   * Spec §5: the pin toggle changes nothing, so the event stays kept and keeps
   * P3's wording though it is no longer pinned. P3's text assumes a live pin,
   * so the wording for this case is an open question for the owner. This
   * pins the spec's current answer until they rule.
   */
  it('keeps the pin wording for a kept unseated event unpinned after the run (owner ruling pending)', () => {
    runAndPinAll('B4')
    const [id] = [...selectDrawnSchedule(useStore.getState()).unplacedIds].sort()
    expect(id, 'premise: the pin-all re-run leaves an event unseated').toBeDefined()

    useStore.getState().setPinned(id, false)
    const model = selectDrawnSchedule(useStore.getState())
    expect(model.runState, 'premise: the pin toggle keeps the board fresh').toBe('fresh')
    expect(model.events[id].source, 'premise: the pin toggle keeps the entry').toBe('kept')

    expect(unplacedRows().filter((r) => r.target === id).map((r) => [r.id, r.message]))
      .toEqual([[`unplaced:${id}:room`, UNPLACED_WORDING.PIN]])
  })

  it('shows no unseated row on a board that was never run, only the stale row', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    expect(selectDrawnSchedule(state).blocks.some((b) => b.unseated), 'premise: an unseated phase is drawn').toBe(true)

    expect(unplacedRows().map((r) => r.id)).toEqual(['stale:run'])
  })
})

describe('selectFindings — stranded event Unplaced row (contract §1.3, FR-060)', () => {
  // On a run, so the board stays fresh and per-event rows could show: the
  // last assertion then means the stranded event gets no room row.
  it('flags an event hand-moved outside days_available, and draws no overflow-style row for it', () => {
    runPreset('B1')
    const id = Object.keys(useStore.getState().placements).sort()[0]
    useStore.getState().updatePlacement(id, { day: 9 })
    const state = useStore.getState()
    expect(selectDrawnSchedule(state).runState, 'premise: the board is fresh').toBe('fresh')

    const schedule = selectDerivedSchedule(state)
    expect(schedule.events[id]?.day_out_of_range).toBe(true)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === `unplaced:${id}:day`)
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Unplaced')
    expect(row?.target).toBe(id)
    expect(row?.day).toBeNull()
    expect(row?.where).toContain('out of range')

    expect(
      rows.some((r) => r.id.startsWith(`unplaced:${id}:`) && r.id !== `unplaced:${id}:day`),
    ).toBe(false)
  })
})

describe('selectFindings — late finish rows, margin and boundary (contract §1.4)', () => {
  it('warns when the day finishes inside the window before close', () => {
    threeEventsOverlappingOnDayZero()
    // Day 0 finishes at 730, so a 760 close puts the finish 30 minutes inside
    // the 45-minute window, as 810 did against 780 before 024.
    useStore.getState().updateDayConfig(0, { day_end_time: 760 })
    const state = useStore.getState()

    const schedule = selectDrawnSchedule(state)
    const day0Blocks = schedule.blocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))
    const close = state.dayConfigs[0].day_end_time
    const targetBlock = day0Blocks.find((b) => b.endMinutes === finish)
    expect(targetBlock, 'expected a day-0 block reaching the measured finish').toBeDefined()

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'late-finish:day:0')
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Warning')
    expect(row?.day).toBe(0)
    expect(row?.target).toBe(targetBlock?.competitionId)

    const comp = schedule.competitions.find((c) => c.id === targetBlock?.competitionId)
    expect(comp).toBeDefined()
    expect(row?.where).toBe(`Day 1 · ${competitionLabel(comp!)}`)
    expect(row?.message).toContain(`${close - finish} minutes before`)
  })

  it('names the video stage when the day ends on one', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().setDeModeOverride(DeMode.STAGED)
    useStore.getState().setVideoStrips(4)
    const preState = useStore.getState()
    const preBlocks = selectDrawnSchedule(preState).blocks
    const day0Blocks = preBlocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))
    const last = day0Blocks.filter((b) => b.endMinutes === finish)
    expect(
      last.every((b) => b.phase === Phase.DE_ROUND_OF_16),
      'expected the day to end on a video-stage block',
    ).toBe(true)

    useStore.getState().updateDayConfig(0, { day_end_time: finish + 20 })

    const row = selectFindings(useStore.getState()).find((r) => r.id === 'late-finish:day:0')
    expect(row?.message).toContain(`Video stage finishes at ${formatClock(finish)}, 20 minutes before`)
  })

  it('raises no row at the boundary — finish exactly window-minutes before close is not late (strict >)', () => {
    threeEventsOverlappingOnDayZero()
    const preState = useStore.getState()
    const preBlocks = selectDrawnSchedule(preState).blocks
    const finish = Math.max(...preBlocks.filter((b) => b.day === 0).map((b) => b.endMinutes))

    useStore.getState().updateDayConfig(0, { day_end_time: finish + lateFinishWindowMins() })
    const state = useStore.getState()

    const rows = selectFindings(state)
    expect(rows.some((r) => r.id === 'late-finish:day:0')).toBe(false)
  })
})

describe('selectFindings — late finish tie-break picks the lower competition id (contract §1.4, derived.ts:573-579)', () => {
  it('names JR-M-EPEE-IND over JR-W-EPEE-IND when both blocks reach the same finish', () => {
    tiedEpeeEventsOnDayZero()
    const preState = useStore.getState()
    const preBlocks = selectDrawnSchedule(preState).blocks
    const day0Blocks = preBlocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))

    // Confirm the tie actually exists before trusting the target assertion
    // below — both events' blocks must reach the measured finish, and
    // both must be seated, so the tie is between two drawn phases and not
    // between a phase and one the board could not find strips for (017 T5b
    // moved this from the lane packer's overflow to the drawn model's
    // `unseated`).
    const mBlock = day0Blocks.find((b) => b.competitionId === 'JR-M-EPEE-IND' && b.endMinutes === finish)
    const wBlock = day0Blocks.find((b) => b.competitionId === 'JR-W-EPEE-IND' && b.endMinutes === finish)
    expect(mBlock, 'expected JR-M-EPEE-IND to reach the measured finish').toBeDefined()
    expect(wBlock, 'expected JR-W-EPEE-IND to reach the measured finish too — the tie this case pins').toBeDefined()
    expect(mBlock?.unseated).toBe(false)
    expect(wBlock?.unseated).toBe(false)

    useStore.getState().updateDayConfig(0, { day_end_time: finish + 20 })
    const state = useStore.getState()

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'late-finish:day:0')
    expect(row, 'expected a late-finish row once the day is shortened past the tied finish').toBeDefined()
    expect(row?.target).toBe('JR-M-EPEE-IND')
  })
})

// The board here was never run, so it is stale and the start-time edit is one
// more stale edit, not a hand move on a run (017 T5b review). The fresh-board
// hand move is pinned in 'late finish reads a hand-moved event' below.
describe('selectFindings — late finish overrun after a start-time edit, Blocking count unchanged (FR-025)', () => {
  it('reports minutes past close after an edit pushes the finish beyond it, without adding a Blocking row', () => {
    threeEventsOverlappingOnDayZero()
    // A real Blocking witness (013 T032 review follow-up): STAGED de mode
    // plus the fixture's default video_strips_total of 0 trips
    // video-r16-strip-shortfall (validation.ts, structural/ERROR) for every
    // JUNIOR competition, whose REQUIRED video policy needs R16 video strips
    // that do not exist. Measured (throwaway script, not predicted) to leave
    // placements and lanes intact — 6 blocks still drawn — unlike
    // strips_total = 0, which empties the lanes and would prove nothing
    // about a move happening "without adding a Blocking row".
    useStore.getState().setDeModeOverride(DeMode.STAGED)
    useStore.getState().updateDayConfig(0, { day_end_time: 810 })
    const beforeState = useStore.getState()
    const blockingBefore = selectFindings(beforeState).filter((r) => r.severity === 'Blocking').length
    expect(blockingBefore, 'expected the video-r16-strip-shortfall rows to already be Blocking').toBeGreaterThanOrEqual(1)

    useStore.getState().updatePlacement('JR-M-EPEE-IND', { start_time: 600 })
    const state = useStore.getState()

    const blocks = selectDrawnSchedule(state).blocks
    expect(blocks.length, 'expected the move to leave the lanes populated, not emptied').toBeGreaterThan(0)
    const day0Blocks = blocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))
    const close = state.dayConfigs[0].day_end_time
    expect(finish).toBeGreaterThan(close)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'late-finish:day:0')
    expect(row).toBeDefined()
    expect(row?.message).toContain(`${finish - close} minutes past`)

    const blockingAfter = rows.filter((r) => r.severity === 'Blocking').length
    expect(blockingAfter).toBeGreaterThanOrEqual(1)
    expect(blockingAfter).toBe(blockingBefore)
  })
})

/**
 * Two Junior épée events of 8 on the one day at the store's default hours,
 * 9:00 to the 19:00 target, each placed so its last block ends at the minute
 * given. Measured (throwaway probe, 2026-10-06): each runs 230 minutes from
 * its start to its last block end – a pool of 8 takes 160 minutes (§Pool
 * Duration Estimation), the 30-minute admin gap, then R8 and the semis in one
 * 20-minute wave each on 4 of the 8 strips, so neither overflows.
 */
const EPEE_OF_8_SPAN_MINS = 230

function twoEpeeEventsFinishingAt(mFinish: number, wFinish: number): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(1)
  s.setStrips(8)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    s.updateCompetition(id, { fencer_count: 8 })
  }
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: mFinish - EPEE_OF_8_SPAN_MINS, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: wFinish - EPEE_OF_8_SPAN_MINS, strip_count: 1 }),
  })

  // Premise: the default day ends at its 19:00 target, and the day's last
  // block ends where the fixture put it.
  const state = useStore.getState()
  expect(state.dayConfigs[0].day_end_time).toBe(1140)
  const blocks = selectDrawnSchedule(state).blocks
  expect(blocks.some((b) => b.unseated)).toBe(false)
  expect(Math.max(...blocks.map((b) => b.endMinutes))).toBe(Math.max(mFinish, wFinish))
}

/**
 * 024 D7, the app's late-day row: the store's late-finish row keeps comparing
 * the day's last block end against `day_end_time`, which is now the 19:00 soft
 * target, not the 22:00 hard end (METHODOLOGY.md §Same-Day Completion). It
 * keeps the 45-minute lead, so it warns of no slack from 18:15 and of a late
 * finish after 19:00, one row per late day, and it calls 19:00 the day's
 * target rather than its close, since work may run on to 22:00.
 */
describe('selectFindings — late finish against the 19:00 target (024 D7)', () => {
  function lateFinishRows(): Finding[] {
    return selectFindings(useStore.getState()).filter((r) => r.id.startsWith('late-finish:'))
  }

  it('raises one row for a day ending at 20:00, 60 minutes past the 19:00 target', () => {
    twoEpeeEventsFinishingAt(1200, 1170)

    const rows = lateFinishRows()
    expect(rows.map((r) => r.id)).toEqual(['late-finish:day:0'])
    expect(rows[0].target).toBe('JR-M-EPEE-IND')
    expect(rows[0].message).toContain(`finishes at ${formatClock(1200)}, 60 minutes past the day's target of ${formatClock(1140)}.`)
  })

  it('raises the no-slack row for a day ending at 18:30, inside the 45-minute lead', () => {
    twoEpeeEventsFinishingAt(1110, 1080)

    const rows = lateFinishRows()
    expect(rows.map((r) => r.id)).toEqual(['late-finish:day:0'])
    expect(rows[0].message).toContain(
      `finishes at ${formatClock(1110)}, 30 minutes before the day's target of ${formatClock(1140)}. No slack for a delayed round.`,
    )
  })

  // guard: 18:00 is 60 minutes before the target, outside the lead – no row today either.
  it('raises no row for a day ending at 18:00', () => {
    twoEpeeEventsFinishingAt(1080, 1050)

    expect(lateFinishRows()).toEqual([])
  })
})

/**
 * 017 T5b (spec §4): the late-finish rows read the drawn model, so right after
 * a run they follow the scheduler's own DE ends, waits included, not
 * `deriveEventSchedule`'s DEs started straight after the pools. The expected
 * rows are built from a second `scheduleAll` over the same inputs (the boot
 * run has no pins): per day, the latest phase end of the scheduler's results
 * on the clock axis, the lowest id among the events reaching it, and the
 * 45-minute lead before the day's target.
 *
 * Measured before T5b (2026-10-07), the late-finish row counts at boot read
 * 1 / 2 / 2 / 3 / 0 / 2 / 3 / 1 on B1–B8, off the lane packer at derived
 * times. The scheduler's DE ends give 1 / 3 / 4 / 3 / 0 / 3 / 3 / 2.
 */
describe('selectFindings — late finish follows the kept DE ends (017 T5b)', () => {
  it.each(SCENARIO_IDS)('%s: one row per day whose scheduler finish is late, naming its event', (id) => {
    runPreset(id)
    const state = useStore.getState()
    const { config, competitions } = buildTournamentConfig(state)
    const { schedule } = scheduleAll(competitions, config)

    const latest = new Map<number, { finish: number; culprit: string }>()
    for (const eventId of Object.keys(schedule).sort()) {
      const result = schedule[eventId]
      const shift = result.assigned_day * DAY_AXIS_SPACING_MINS
      for (const span of phaseSpans(result)) {
        const end = span.end - shift
        const best = latest.get(result.assigned_day)
        if (best === undefined || end > best.finish) latest.set(result.assigned_day, { finish: end, culprit: eventId })
      }
    }
    const expected = [...latest.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([day, { finish }]) => finish > state.dayConfigs[day].day_end_time - lateFinishWindowMins())
      .map(([day, { finish, culprit }]) => ({ id: `late-finish:day:${day}`, target: culprit, finishesAt: formatClock(finish) }))

    const rows = selectFindings(state)
      .filter((r) => r.id.startsWith('late-finish:'))
      .map((r) => ({ id: r.id, target: r.target, finishesAt: /finishes at (.+?),/.exec(r.message)?.[1] }))
    expect(rows).toEqual(expected)
  })
})

/**
 * 017 T5b review: a fresh board with a hand-moved event (spec §5, Move day).
 * The mover is derived at its new day and every other event keeps its run, and
 * the day's late-finish row reads both. Measured 2026-10-07.
 */
describe('selectFindings — late finish reads a hand-moved event on a fresh board (017 T5b)', () => {
  function lateRow(day: number): Finding | undefined {
    return selectFindings(useStore.getState()).find((r) => r.id === `late-finish:day:${day}`)
  }

  /** Every block on `day` other than `id`'s, and its latest end. */
  function othersLatest(id: string, day: number): number {
    const blocks = selectDrawnSchedule(useStore.getState()).blocks
    return Math.max(...blocks.filter((b) => b.day === day && b.competitionId !== id).map((b) => b.endMinutes))
  }

  /**
   * B1's headline move puts D1-M-EPEE-IND on day 1 at its old start. Since 018 T1
   * (Div 1 promotes 75% at a NAC, 233 into the 256 bracket) its derived
   * DE_ROUND_OF_16 ends at 1080 (18:00), 20 minutes earlier than at 80%, which is
   * outside the 45-minute lead before the 19:00 target, so the move alone no
   * longer makes day 1 late. The new trigger is a later start: nudging the
   * mover 30 minutes later on day 1 shifts its derived end to 1110 (18:30), inside
   * the lead, while the kept events on day 1 still end by 1060, outside it. So
   * only the mover makes day 1 late.
   */
  it('names the mover when only its derived end makes the day late', () => {
    const { id, day } = runAndMoveHeadline('B1')
    const stateMoved = useStore.getState()
    const limit = stateMoved.dayConfigs[day].day_end_time - lateFinishWindowMins()
    expect(selectDrawnSchedule(stateMoved).events[id].source, 'premise: the mover is derived').toBe('derived')
    expect(lateRow(day), 'premise: moved to day 1 at its old start, the mover ends at 1080, outside the lead').toBeUndefined()

    const moverLast = Math.max(...selectDrawnSchedule(stateMoved).blocks.filter((b) => b.competitionId === id).map((b) => b.endMinutes))
    expect(moverLast, 'premise: the mover\'s last block ends at 1080, outside the lead').toBe(1080)

    useStore.getState().updatePlacement(id, { start_time: stateMoved.placements[id].start_time + 30 })
    const state = useStore.getState()
    expect(selectDrawnSchedule(state).runState, 'premise: a hand move keeps the board fresh').toBe(RunState.FRESH)
    expect(selectDrawnSchedule(state).events[id].source, 'premise: the nudged mover is still derived').toBe('derived')
    const kept = othersLatest(id, day)
    expect(kept, 'premise: the kept events on the day end at 1060').toBe(1060)
    expect(kept, 'premise: 1060 is outside the lead, so not late').toBeLessThanOrEqual(limit)

    const row = lateRow(day)
    expect(row?.target).toBe('D1-M-EPEE-IND')
    expect(row?.message).toContain(`finishes at ${formatClock(1110)}, 30 minutes before the day's target`)
  })

  /**
   * An unseated block still ends where it is drawn, so it still counts toward
   * the day's finish (derived.ts's late-finish comment). B2 after a run, with
   * CDT-M-EPEE-TEAM moved to day 0 at 12:00: its DE finds no free strips and
   * ends at 1205 (20:05), above the kept events' 1165 on that day (1185 before
   * 018 T1, when Div 1 promoted 80%).
   */
  it('counts an unseated block\'s end toward the day\'s finish', () => {
    runPreset('B2')
    useStore.getState().updatePlacement('CDT-M-EPEE-TEAM', { day: 0, start_time: 720 })
    const drawn = selectDrawnSchedule(useStore.getState())
    expect(drawn.runState, 'premise: a hand move keeps the board fresh').toBe(RunState.FRESH)
    const last = drawn.blocks.filter((b) => b.competitionId === 'CDT-M-EPEE-TEAM' && b.endMinutes === 1205)
    expect(last.map((b) => [b.phase, b.unseated]), 'premise: the mover\'s DE is unseated and ends at 1205').toEqual([[Phase.DE, true]])
    expect(othersLatest('CDT-M-EPEE-TEAM', 0), 'premise: the kept events on day 0 end earlier').toBe(1165)

    const row = lateRow(0)
    expect(row?.target).toBe('CDT-M-EPEE-TEAM')
    expect(row?.message).toContain(`finishes at ${formatClock(1205)}, 65 minutes past the day's target`)
  })
})

describe('selectFindings — no referee comparison (FR-026)', () => {
  it('never mentions referees, on B1 after a full schedule run', () => {
    applyPreset('B1')
    runScheduleAll()
    const state = useStore.getState()
    const rows = selectFindings(state)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => !/referee/i.test(r.message))).toBe(true)
  })
})

describe('selectFindings — dismissal filtering (contract §2.2)', () => {
  // 017 T5a: the row comes from the headline move's unseated derived event,
  // not from the run-less overflow fixture, which now raises only the stale row.
  it('filters a dismissed Unplaced row from the list but records the dismissal', () => {
    const { id } = runAndMoveHeadline('B1')
    const before = selectFindings(useStore.getState())
    const unplacedRow = before.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow?.id, 'expected the headline move\'s Unplaced row').toBe(`unplaced:${id}:room`)

    useStore.getState().dismissFinding(unplacedRow!.id)

    const after = selectFindings(useStore.getState())
    expect(after.some((r) => r.id === unplacedRow!.id)).toBe(false)
    expect(useStore.getState().dismissedFindings[unplacedRow!.id]).toBe(true)
  })

  it('leaves a Blocking row in the list and records no dismissal for it (guard no-op)', () => {
    setupB5()
    useStore.getState().setStrips(0)
    const state = useStore.getState()
    const stripsError = selectDerivedFindings(state).validationErrors.find(
      (e) => e.rule === 'strips-total-positive',
    )
    expect(stripsError).toBeDefined()
    const blockingId = findingIdentity(stripsError!)

    const before = selectFindings(state)
    const blockingRow = before.find((r) => r.id === blockingId)
    expect(blockingRow).toBeDefined()
    expect(blockingRow?.severity).toBe('Blocking')

    useStore.getState().dismissFinding(blockingId)

    const after = selectFindings(useStore.getState())
    expect(after.some((r) => r.id === blockingId)).toBe(true)
    expect(useStore.getState().dismissedFindings).toEqual({})
  })

  it('leaves a Note row in the list and records no dismissal for it (guard no-op, corrected header comment above)', () => {
    threeEventsOverlappingOnDayZero()
    const noteId = 'analysis:cut-summary:JR-M-EPEE-IND:JR-M-EPEE-IND:-'
    const before = selectFindings(useStore.getState())
    const noteRow = before.find((r) => r.id === noteId)
    expect(noteRow).toBeDefined()
    expect(noteRow?.severity).toBe('Note')

    useStore.getState().dismissFinding(noteId)

    const after = selectFindings(useStore.getState())
    expect(after.some((r) => r.id === noteId)).toBe(true)
    expect(useStore.getState().dismissedFindings).toEqual({})
  })
})

describe('selectFindings — severity order (contract §1.6)', () => {
  it('orders every Blocking row before every non-Blocking row', () => {
    setupB5()
    useStore.getState().setStrips(0)
    useStore.getState().setDays(1)
    const rows = selectFindings(useStore.getState())

    const blockingIndices = rows.reduce<number[]>((acc, r, i) => (r.severity === 'Blocking' ? [...acc, i] : acc), [])
    const nonBlockingIndices = rows.reduce<number[]>((acc, r, i) => (r.severity !== 'Blocking' ? [...acc, i] : acc), [])
    expect(blockingIndices.length).toBeGreaterThan(0)
    expect(nonBlockingIndices.length).toBeGreaterThan(0)
    expect(Math.max(...blockingIndices)).toBeLessThan(Math.min(...nonBlockingIndices))
  })
})

/**
 * 013 T033 (phase6-contract.md §9, FR-054-FR-061) — a pinned collision must
 * survive `runScheduleAll`. Today `runScheduleAll` (`runActions.ts:34`) calls
 * the two-argument `scheduleAll` and the one-argument `setPlacementsFromAuto`,
 * so every pin is dropped and every placement is rewritten by the ordinary
 * auto-scheduler (§10's predicted reason for this dispatch). Once T034 wires
 * `buildPinnedPlacements` and the `keep` set through, both events here are
 * pinned, so neither reaches the ordinary scheduling loop at all — the engine
 * preclaims each one exactly where it was pinned (§6) and
 * `setPlacementsFromAuto(placements, pinnedIds)` carries both placements back
 * verbatim (§9.2), reproducing the same collision this case measures below
 * against `state.placements` alone, before any run.
 */
describe('selectFindings — a pinned collision survives Auto-assign, naming the second pin (013 T033, phase6-contract §9)', () => {
  it('keeps both pins in place after a run and flags only the greater-id pin as Unplaced', () => {
    useStore.setState(useStore.getInitialState(), true)
    const s = useStore.getState()
    s.setTournamentType('NAC')
    s.setDays(1)
    s.setStrips(3)
    s.setVideoStrips(0)
    s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
    // [M] measured (throwaway scratch script, not predicted): computePoolStructure
    // (pools.ts:33) gives n_pools = 2 for both 10 and 14 fencers. The pool cap
    // (buildConfig.ts:109, 0.80 of strips_total) floors 3 strips to 2, so each
    // event's granted pool_strip_count (derive.ts's grantedStrips) is 2 — pinning
    // both to the same day and start puts 2 + 2 = 4 strips against 3 physical
    // ones, a real collision rather than a shared minute that happens to fit.
    // The two fencer counts (10 vs 14) are close enough to share the same pool
    // cap but different enough that the two events' DE blocks land clear of each
    // other (measured 590-658 vs 680-890), so only the Pools phase collides.
    s.updateCompetition('JR-M-EPEE-IND', { fencer_count: 10 })
    s.updateCompetition('JR-W-EPEE-IND', { fencer_count: 14 })
    s.setDeModeOverride(DeMode.SINGLE_STAGE)
    s.setPlacementsFromAuto({
      'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 3 }),
      'JR-W-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 3 }),
    })
    s.setPinned('JR-M-EPEE-IND', true)
    s.setPinned('JR-W-EPEE-IND', true)

    runScheduleAll()
    const state = useStore.getState()

    const mPlacement = state.placements['JR-M-EPEE-IND']
    const wPlacement = state.placements['JR-W-EPEE-IND']
    expect(mPlacement, 'expected JR-M-EPEE-IND to still have a placement after the run').toBeDefined()
    expect(mPlacement?.pinned).toBe(true)
    expect(mPlacement?.day).toBe(0)
    expect(mPlacement?.start_time).toBe(480)
    expect(wPlacement, 'expected JR-W-EPEE-IND to still have a placement after the run').toBeDefined()
    expect(wPlacement?.pinned).toBe(true)
    expect(wPlacement?.day).toBe(0)
    expect(wPlacement?.start_time).toBe(480)

    const rows = selectFindings(state)
    const unplacedRows = rows.filter((r) => r.severity === 'Unplaced')
    // 017 T5a: the row reads the kept run. The engine pre-claims pins in
    // (day, start, id) order (`compareIds`), so the lower id (JR-M-EPEE-IND)
    // claims its pool strips first and the greater id (JR-W-EPEE-IND) is the
    // pin it could not seat. It stays kept, so its row carries the pin
    // wording (P3), not the re-run wording.
    expect(unplacedRows.map((r) => [r.id, r.target, r.message])).toEqual([
      ['unplaced:JR-W-EPEE-IND:room', 'JR-W-EPEE-IND', UNPLACED_WORDING.PIN],
    ])
  })
})

// ──────────────────────────────────────────────
// 016 Task C – hand placements are checked against the same-day rules, and
// day-scoped findings carry their day (spec §1–§3, plan Task C).
// ──────────────────────────────────────────────

const JR_FOIL = 'JR-M-FOIL-IND'
const CDT_FOIL = 'CDT-M-FOIL-IND'
const HARD_PREFIX = 'analysis:hard-separation-violated:'

function analysisRows(prefix: string): Finding[] {
  return selectFindings(useStore.getState()).filter((r) => r.id.startsWith(prefix))
}

function labelOfId(id: string): string {
  const competition = selectDerivedSchedule(useStore.getState()).competitions.find((c) => c.id === id)
  if (!competition) throw new Error(`fixture: ${id} is not selected`)
  return competitionLabel(competition)
}

/**
 * Junior and Cadet Men's Foil, placed by hand. At a NAC the pair is Group 1
 * and hard: they may never share a day (Ops Manual p.20, METHODOLOGY.md
 * §Overlapping-Population Separation). At a ROC it is windowed instead. Three
 * days at 9:00, 40 strips, so nothing else about the pair is tight. With
 * `withDayWindows: false` it skips `setDays`, so the store keeps its default
 * three days and no day windows at all.
 */
function juniorAndCadetFoil(
  tournamentType: 'NAC' | 'ROC',
  jr: { day: number; start: number },
  cdt: { day: number; start: number },
  { withDayWindows = true }: { withDayWindows?: boolean } = {},
): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType(tournamentType)
  if (withDayWindows) s.setDays(3)
  s.setStrips(40)
  s.setVideoStrips(8)
  s.selectCompetitions([JR_FOIL, CDT_FOIL])
  s.updateCompetition(JR_FOIL, { fencer_count: 24 })
  s.updateCompetition(CDT_FOIL, { fencer_count: 24 })
  s.setPlacementsFromAuto({
    [JR_FOIL]: makePlacement({ day: jr.day, start_time: jr.start, strip_count: 4 }),
    [CDT_FOIL]: makePlacement({ day: cdt.day, start_time: cdt.start, strip_count: 4 }),
  })
}

describe('selectFindings — a hand-made hard pair (016 spec §1, R1)', () => {
  it('shows exactly one non-dismissable Warning naming both events, on their shared day', () => {
    juniorAndCadetFoil('NAC', { day: 1, start: 540 }, { day: 1, start: 540 })

    const rows = analysisRows(HARD_PREFIX)
    expect(rows.map((r) => r.id)).toEqual([`${HARD_PREFIX}${CDT_FOIL}:${CDT_FOIL}+${JR_FOIL}:1`])
    const [row] = rows
    expect(row.severity).toBe('Warning')
    expect(row.dismissable).toBe(false)
    expect(row.day).toBe(1)
    expect(row.target).toBe(CDT_FOIL)
    expect(row.where).toBe(`Day 2 · ${labelOfId(CDT_FOIL)}`)
  })

  it('names both events by their label and says they may never share a day', () => {
    juniorAndCadetFoil('NAC', { day: 1, start: 540 }, { day: 1, start: 540 })

    const [row] = analysisRows(HARD_PREFIX)
    const jr = labelOfId(JR_FOIL)
    const cdt = labelOfId(CDT_FOIL)
    expect(row.message).toContain(jr)
    expect(row.message).toContain(cdt)
    expect(row.message).toContain('may never share a day')
    expect(row.message).not.toContain(JR_FOIL)
    expect(row.message).not.toContain(CDT_FOIL)
  })

  it('clears once one event is moved to another day', () => {
    juniorAndCadetFoil('NAC', { day: 1, start: 540 }, { day: 1, start: 540 })
    expect(analysisRows(HARD_PREFIX), 'premise: the pair is flagged while it shares Day 2').toHaveLength(1)

    useStore.getState().updatePlacement(JR_FOIL, { day: 2 })

    expect(analysisRows(HARD_PREFIX)).toEqual([])
  })

  // Review focus 1: days are reduced after the pair was placed on a dropped day.
  it('raises no rule finding for events left outside days_available, and does not crash', () => {
    juniorAndCadetFoil('NAC', { day: 2, start: 540 }, { day: 2, start: 540 })
    expect(analysisRows(HARD_PREFIX), 'premise: the pair is flagged on Day 3').toHaveLength(1)

    useStore.getState().setDays(2)

    const rows = selectFindings(useStore.getState())
    expect(rows.filter((r) => r.id.startsWith(HARD_PREFIX))).toEqual([])
    // The stranded events still say so – the rule check skipped them, the store did not lose them.
    expect(rows.some((r) => r.id === `unplaced:${JR_FOIL}:day`)).toBe(true)
    expect(rows.some((r) => r.id === `unplaced:${CDT_FOIL}:day`)).toBe(true)
    expect(rows.find((r) => r.id === `unplaced:${JR_FOIL}:day`)?.dismissable).toBe(true)
  })
})

/**
 * The regional Group 1 window (spec §1, R4). The pair shares Day 2 (index 1),
 * so a window floor read off the scheduler axis (1440 × day + 9:00 + 4 h)
 * instead of the store's clock axis (9:00 + 4 h = 13:00) would misjudge it.
 */
describe('selectFindings — the regional Group 1 window on a hand-made ROC pair (016 spec §1, R4)', () => {
  const OWNER_AND_SUBJECTS = `${JR_FOIL}:${CDT_FOIL}+${JR_FOIL}:1`

  it('shows a Note when the older side waits out the window', () => {
    juniorAndCadetFoil('ROC', { day: 1, start: 780 }, { day: 1, start: 540 })

    const rows = analysisRows('analysis:regional-window-')
    expect(rows.map((r) => r.id)).toEqual([`analysis:regional-window-honoured:${OWNER_AND_SUBJECTS}`])
    expect(rows[0].severity).toBe('Note')
    expect(rows[0].dismissable).toBe(false)
    expect(rows[0].day).toBe(1)
    expect(analysisRows(HARD_PREFIX), 'Group 1 is not hard at a regional type').toEqual([])
  })

  it('shows a dismissable Warning when both sides start before the window floor', () => {
    juniorAndCadetFoil('ROC', { day: 1, start: 540 }, { day: 1, start: 540 })

    const rows = analysisRows('analysis:regional-window-')
    expect(rows.map((r) => r.id)).toEqual([`analysis:regional-window-not-honoured:${OWNER_AND_SUBJECTS}`])
    expect(rows[0].severity).toBe('Warning')
    expect(rows[0].dismissable).toBe(true)
  })

  // The floor follows the store's own Day 2 window: opening at 10:00 moves it
  // to 10:00 + 4 h = 14:00, so 13:00 no longer waits it out and 14:00 does.
  it.each([
    { olderStart: 780, outcome: 'not-honoured' },
    { olderStart: 840, outcome: 'honoured' },
  ])('reads the floor off a Day 2 that opens at 10:00 (older at $olderStart: $outcome)', ({ olderStart, outcome }) => {
    juniorAndCadetFoil('ROC', { day: 1, start: olderStart }, { day: 1, start: 600 })
    useStore.getState().updateDayConfig(1, { day_start_time: 600 })

    expect(analysisRows('analysis:regional-window-').map((r) => r.id)).toEqual([
      `analysis:regional-window-${outcome}:${OWNER_AND_SUBJECTS}`,
    ])
  })

  it('falls back to the default day start when the store has no day windows yet', () => {
    juniorAndCadetFoil('ROC', { day: 1, start: 780 }, { day: 1, start: 540 }, { withDayWindows: false })
    expect(useStore.getState().dayConfigs, 'premise: no setDays, so no day windows').toEqual([])

    expect(analysisRows('analysis:regional-window-').map((r) => r.id)).toEqual([
      `analysis:regional-window-honoured:${OWNER_AND_SUBJECTS}`,
    ])
  })
})

describe('selectFindings — a day-scoped venue row reads its day (016 spec §2)', () => {
  it('reads "Day N" for the where and the day off Bottleneck.day, not "Venue"', () => {
    twoDaysOverCapacity()

    // Located by message, so this case fails on day and where alone, not on the id format.
    const rows = analysisRows('analysis:').filter((r) => r.message.includes('pools assigned'))
    expect(rows.map((r) => [r.message.slice(0, 6), r.day, r.where])).toEqual([
      ['Day 1:', 0, 'Day 1'],
      ['Day 2:', 1, 'Day 2'],
    ])
  })

  // guard: passes today. initialAnalysis takes a placed event's day as is, so a
  // stranded event raises a pools warning on a day the board does not have.
  it('reads a null day and Venue when an ownerless Bottleneck.day is outside days_available', () => {
    twoDaysOverCapacity()
    useStore.getState().updatePlacement('D1-W-EPEE-IND', { day: 5 })

    const stranded = selectFindings(useStore.getState()).find(
      (r) => r.id.startsWith('analysis:') && r.message.startsWith('Day 6:'),
    )
    expect(stranded, 'premise: analysis warns about the stranded event\'s Day 6').toBeDefined()
    expect(stranded?.day).toBeNull()
    expect(stranded?.where).toBe('Venue')
  })

  // The id names the condition with the raw Bottleneck.day, so two stranded
  // days stay apart where a "-" would merge them into one dismissal.
  it('keeps the raw out-of-range day in the id, so two stranded days stay distinct', () => {
    twoDaysOverCapacity()
    useStore.getState().updatePlacement('D1-M-EPEE-IND', { day: 4 })
    useStore.getState().updatePlacement('D1-W-EPEE-IND', { day: 5 })

    const poolsIds = selectFindings(useStore.getState())
      .map((r) => r.id)
      .filter((id) => id.startsWith('analysis:day-pools-exceed-strips:'))
    expect(poolsIds).toEqual(['analysis:day-pools-exceed-strips:::4', 'analysis:day-pools-exceed-strips:::5'])
  })
})

/**
 * Three Junior events of 8, one on each of Days 2–4 (indices 1–3), Day 1
 * empty. Every event takes the same time from its start, so a day's length is
 * its start offset plus that span: Day 2 starts at 9:00 (offset 0), Day 3 at
 * 10:00 (60), Day 4 at 11:00 (120). The last day (120) is not shorter than the
 * shortest middle day (60), the first (0) is. On the scheduler axis the
 * lengths would come out near −1440 × day instead and flag the first day, not
 * the last – the axis trap this fixture is built to catch.
 */
const FIRST_DAY_EVENT = 'JR-M-EPEE-IND'

function oneJuniorEventOnEachOfDaysTwoToFour(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(4)
  s.setStrips(8)
  s.setVideoStrips(0)
  const ids = [FIRST_DAY_EVENT, 'JR-W-EPEE-IND', 'JR-M-FOIL-IND']
  s.selectCompetitions(ids)
  for (const id of ids) s.updateCompetition(id, { fencer_count: 8 })
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    [FIRST_DAY_EVENT]: makePlacement({ day: 1, start_time: 540, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 2, start_time: 600, strip_count: 1 }),
    'JR-M-FOIL-IND': makePlacement({ day: 3, start_time: 660, strip_count: 1 }),
  })
}

describe('selectFindings — first and last day WARN from the placements (016 spec §3)', () => {
  const FIRST = 'analysis:first-day-longer-than-middle:'
  const LAST = 'analysis:last-day-longer-than-middle:'

  it('flags the last day, on its own day, when the first used day is not day 0', () => {
    oneJuniorEventOnEachOfDaysTwoToFour()

    const rows = analysisRows(LAST)
    expect(rows.map((r) => [r.id, r.day, r.where, r.severity])).toEqual([
      [`${LAST}::3`, 3, 'Day 4', 'Warning'],
    ])
    expect(analysisRows(FIRST)).toEqual([])
  })

  it('follows a hand move that makes the first day as long as the middle one', () => {
    oneJuniorEventOnEachOfDaysTwoToFour()
    expect(analysisRows(FIRST), 'premise: the first day starts out shorter').toEqual([])

    useStore.getState().updatePlacement(FIRST_DAY_EVENT, { start_time: 720 })

    expect(analysisRows(FIRST).map((r) => [r.id, r.day, r.where])).toEqual([[`${FIRST}::1`, 1, 'Day 2']])
  })

  // Review focus 1: a stranded event must not count as a used day. Read on its
  // own, Day 6 would become the "last" day with a hugely negative length and
  // the real Day 4 WARN would go.
  it('leaves a stranded event out of the used days', () => {
    oneJuniorEventOnEachOfDaysTwoToFour()
    const STRANDED = 'JR-W-FOIL-IND'
    const s = useStore.getState()
    s.addCompetition(STRANDED)
    s.updateCompetition(STRANDED, { fencer_count: 8 })
    s.setPlacementsFromAuto({
      ...useStore.getState().placements,
      [STRANDED]: makePlacement({ day: 5, start_time: 540, strip_count: 1 }),
    })
    expect(
      selectFindings(useStore.getState()).some((r) => r.id === `unplaced:${STRANDED}:day`),
      'premise: the event sits on a day the tournament does not have',
    ).toBe(true)

    expect(analysisRows(LAST).map((r) => r.id)).toEqual([`${LAST}::3`])
    expect(analysisRows(FIRST)).toEqual([])
  })
})

describe('selectFindings — a bottleneck row id survives its sibling disappearing (016 spec §2)', () => {
  it('keeps the Day 3 pools row at the same id when the Day 2 one goes away', () => {
    useStore.setState(useStore.getInitialState(), true)
    const s = useStore.getState()
    s.setTournamentType('NAC')
    s.setDays(3)
    s.setStrips(1)
    s.setVideoStrips(0)
    s.selectCompetitions(['D1-M-EPEE-IND', 'D1-W-EPEE-IND'])
    s.updateCompetition('D1-M-EPEE-IND', { fencer_count: 60 })
    s.updateCompetition('D1-W-EPEE-IND', { fencer_count: 60 })
    s.setPlacementsFromAuto({
      'D1-M-EPEE-IND': makePlacement({ day: 1, start_time: 540, strip_count: 1 }),
      'D1-W-EPEE-IND': makePlacement({ day: 2, start_time: 540, strip_count: 1 }),
    })
    // Located by message, not id, so the old ordinal id is what fails below.
    // Each day also raises a video-demand warning that starts "Day N:", so the
    // match is on the pools wording too.
    const poolsRow = (day: string) =>
      selectFindings(useStore.getState()).find(
        (r) => r.id.startsWith('analysis:') && r.message.startsWith(`${day}:`) && r.message.includes('pools assigned'),
      )
    const dayThreeId = () => poolsRow('Day 3')?.id
    expect(dayThreeId()).toBe('analysis:day-pools-exceed-strips:::2')

    // One pool of 6 fits the one strip, so the Day 2 warning goes away.
    useStore.getState().updateCompetition('D1-M-EPEE-IND', { fencer_count: 6 })
    expect(poolsRow('Day 2'), 'premise: the Day 2 sibling is gone').toBeUndefined()

    expect(dayThreeId()).toBe('analysis:day-pools-exceed-strips:::2')
  })
})

describe('selectFindings — dismissable by severity and rule (016 spec §2, R1)', () => {
  it('is true for Warning and per-event Unplaced rows and false for Blocking, Note and the stale row', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updateDayConfig(0, { day_end_time: 760 }) // a late-finish Warning
    const rows = selectFindings(useStore.getState())
    const bySeverity = (severity: string) => rows.filter((r) => r.severity === severity)
    expect(bySeverity('Warning').length).toBeGreaterThan(0)
    expect(bySeverity('Note').length).toBeGreaterThan(0)
    for (const row of bySeverity('Warning')) expect(row.dismissable, row.id).toBe(true)
    for (const row of bySeverity('Note')) expect(row.dismissable, row.id).toBe(false)
    // The board was never run, so its one Unplaced row is the stale row (P4 (b)).
    expect(bySeverity('Unplaced').map((r) => [r.id, r.dismissable])).toEqual([['stale:run', false]])

    // The per-event rows: the headline move's re-run row, and a stranded event's
    // row. The stranded event leaves another day, so the strips it frees cannot
    // seat the mover.
    const { id, day } = runAndMoveHeadline('B1')
    const { placements } = useStore.getState()
    const stranded = Object.keys(placements).sort().find((other) => other !== id && placements[other].day !== day)!
    useStore.getState().updatePlacement(stranded, { day: 9 })
    const perEvent = selectFindings(useStore.getState()).filter((r) => r.severity === 'Unplaced')
    expect(perEvent.map((r) => [r.id, r.dismissable]).sort()).toEqual([
      [`unplaced:${id}:room`, true],
      [`unplaced:${stranded}:day`, true],
    ])

    setupB5()
    useStore.getState().setStrips(0)
    const blocking = selectFindings(useStore.getState()).filter((r) => r.severity === 'Blocking')
    expect(blocking.length).toBeGreaterThan(0)
    for (const row of blocking) expect(row.dismissable, row.id).toBe(false)
  })
})

// guard: passes today. R2 keeps the engine's late-day finding out of the panel.
describe('selectFindings — the engine late-day finding stays out (016 R2)', () => {
  it('adds no day-ends-past-target row and keeps the late-finish row as it was', () => {
    twoEpeeEventsFinishingAt(1200, 1170)

    const rows = selectFindings(useStore.getState())
    expect(rows.filter((r) => r.id.startsWith('analysis:day-ends-past-target:'))).toEqual([])
    const late = rows.filter((r) => r.id.startsWith('late-finish:'))
    expect(late.map((r) => [r.id, r.severity, r.day, r.target])).toEqual([
      ['late-finish:day:0', 'Warning', 0, 'JR-M-EPEE-IND'],
    ])
    expect(late[0].message).toBe(
      `DE finishes at ${formatClock(1200)}, 60 minutes past the day's target of ${formatClock(1140)}.`,
    )
  })
})

describe('selectFindings — a row carries every event it names (016 spec §4, Task D)', () => {
  it('lists both events of a hand-made hard pair, sorted', () => {
    juniorAndCadetFoil('NAC', { day: 1, start: 540 }, { day: 1, start: 540 })

    const [row] = analysisRows(HARD_PREFIX)
    expect(row.subjects).toEqual([CDT_FOIL, JR_FOIL])
  })

  it('lists just the target for a single-event row', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updatePlacement('JR-W-EPEE-IND', { day: 5 })

    const row = selectFindings(useStore.getState()).find((r) => r.id === 'unplaced:JR-W-EPEE-IND:day')
    expect(row?.subjects).toEqual(['JR-W-EPEE-IND'])
  })

  it('lists no event for a global validation row', () => {
    setupB5()
    useStore.getState().setStrips(0)
    const state = useStore.getState()
    const stripsError = selectDerivedFindings(state).validationErrors.find(
      (e) => e.rule === 'strips-total-positive',
    )
    expect(stripsError, 'expected the strips-total-positive structural error').toBeDefined()

    const row = selectFindings(state).find((r) => r.id === findingIdentity(stripsError!))
    expect(row?.subjects).toEqual([])
  })
})
