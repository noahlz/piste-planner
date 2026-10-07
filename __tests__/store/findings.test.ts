import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { assignStripLanes } from '../../src/layout/lanes.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DeMode, Phase } from '../../src/engine/types.ts'
import { selectDerivedSchedule, selectDerivedFindings } from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import { competitionLabel } from '../../src/lib/competitionLabels.ts'
import { formatClock } from '../../src/lib/time.ts'
import { phaseDisplay } from '../../src/lib/placementLabels.ts'

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

describe('selectFindings — Unplaced rows from lane overflow (contract §1.3)', () => {
  it('emits one Unplaced row per overflowing block, naming the strip count from the block itself', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const schedule = selectDerivedSchedule(state)
    const blocks = assignStripLanes(schedule.events, state.strips_total)
    const overflow = blocks.filter((b) => b.overflow)
    expect(overflow).toHaveLength(1)
    const block = overflow[0]
    expect(block.competitionId).toBe('JR-M-FOIL-IND')

    const rows = selectFindings(state)
    const unplacedRows = rows.filter((r) => r.severity === 'Unplaced')
    expect(unplacedRows).toHaveLength(1)

    const row = rows.find((r) => r.id === `unplaced:${block.competitionId}:${block.phase}`)
    expect(row).toBeDefined()
    expect(row?.id).toBe('unplaced:JR-M-FOIL-IND:DE')
    expect(row?.target).toBe(block.competitionId)
    expect(row?.day).toBe(block.day)
    expect(row?.where).toBe(`Day ${block.day + 1} · ${phaseDisplay(block.phase)}`)
    expect(row?.message).toContain(`${block.stripCount} strip`)
  })
})

describe('selectFindings — stranded event Unplaced row (contract §1.3, FR-060)', () => {
  it('flags an event hand-moved outside days_available, and draws no overflow-style row for it', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updatePlacement('JR-W-EPEE-IND', { day: 5 })
    const state = useStore.getState()

    const schedule = selectDerivedSchedule(state)
    expect(schedule.events['JR-W-EPEE-IND']?.day_out_of_range).toBe(true)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'unplaced:JR-W-EPEE-IND:day')
    expect(row).toBeDefined()
    expect(row?.severity).toBe('Unplaced')
    expect(row?.target).toBe('JR-W-EPEE-IND')
    expect(row?.day).toBeNull()
    expect(row?.where).toContain('out of range')

    expect(
      rows.some((r) => r.id.startsWith('unplaced:JR-W-EPEE-IND:') && r.id !== 'unplaced:JR-W-EPEE-IND:day'),
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

    const schedule = selectDerivedSchedule(state)
    const blocks = assignStripLanes(schedule.events, state.strips_total)
    const day0Blocks = blocks.filter((b) => b.day === 0)
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
    const preBlocks = assignStripLanes(selectDerivedSchedule(preState).events, preState.strips_total)
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
    const preSchedule = selectDerivedSchedule(preState)
    const preBlocks = assignStripLanes(preSchedule.events, preState.strips_total)
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
    const preSchedule = selectDerivedSchedule(preState)
    const preBlocks = assignStripLanes(preSchedule.events, preState.strips_total)
    const day0Blocks = preBlocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))

    // Confirm the tie actually exists before trusting the target assertion
    // below — both events' blocks must reach the measured finish, and
    // neither may have overflowed (an overflowing block is drawn at strip 0
    // regardless of its real timing, which would make this fixture prove
    // nothing about the tie-break itself).
    const mBlock = day0Blocks.find((b) => b.competitionId === 'JR-M-EPEE-IND' && b.endMinutes === finish)
    const wBlock = day0Blocks.find((b) => b.competitionId === 'JR-W-EPEE-IND' && b.endMinutes === finish)
    expect(mBlock, 'expected JR-M-EPEE-IND to reach the measured finish').toBeDefined()
    expect(wBlock, 'expected JR-W-EPEE-IND to reach the measured finish too — the tie this case pins').toBeDefined()
    expect(mBlock?.overflow).toBe(false)
    expect(wBlock?.overflow).toBe(false)

    useStore.getState().updateDayConfig(0, { day_end_time: finish + 20 })
    const state = useStore.getState()

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'late-finish:day:0')
    expect(row, 'expected a late-finish row once the day is shortened past the tied finish').toBeDefined()
    expect(row?.target).toBe('JR-M-EPEE-IND')
  })
})

describe('selectFindings — late finish overrun via a hand move, Blocking count unchanged (FR-025)', () => {
  it('reports minutes past close after a move pushes the finish beyond it, without adding a Blocking row', () => {
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

    const schedule = selectDerivedSchedule(state)
    const blocks = assignStripLanes(schedule.events, state.strips_total)
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
  const blocks = assignStripLanes(selectDerivedSchedule(state).events, state.strips_total)
  expect(blocks.some((b) => b.overflow)).toBe(false)
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
  it('filters a dismissed Unplaced row from the list but records the dismissal', () => {
    threeEventsOverlappingOnDayZero()
    const before = selectFindings(useStore.getState())
    const unplacedRow = before.find((r) => r.severity === 'Unplaced')
    expect(unplacedRow, 'expected an Unplaced row from the overflow fixture').toBeDefined()

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
    // The packer's own tie order — day, then start minute, then competition id
    // (lanes.ts:84-89) — gives the lower id (JR-M-EPEE-IND) the strip run first,
    // so the greater id (JR-W-EPEE-IND) is the one left over.
    expect(unplacedRows).toHaveLength(1)
    expect(unplacedRows[0]?.target).toBe('JR-W-EPEE-IND')
    expect(
      rows.some((r) => r.severity === 'Unplaced' && r.target === 'JR-M-EPEE-IND'),
    ).toBe(false)
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
  it('is true for Warning and Unplaced rows and false for Blocking and Note rows', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updateDayConfig(0, { day_end_time: 760 }) // a late-finish Warning
    const rows = selectFindings(useStore.getState())
    const bySeverity = (severity: string) => rows.filter((r) => r.severity === severity)
    expect(bySeverity('Unplaced').length).toBeGreaterThan(0)
    expect(bySeverity('Warning').length).toBeGreaterThan(0)
    expect(bySeverity('Note').length).toBeGreaterThan(0)
    for (const row of [...bySeverity('Unplaced'), ...bySeverity('Warning')]) {
      expect(row.dismissable, row.id).toBe(true)
    }
    for (const row of bySeverity('Note')) expect(row.dismissable, row.id).toBe(false)

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
