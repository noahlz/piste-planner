import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { assignStripLanes } from '../../src/layout/lanes.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DeMode } from '../../src/engine/types.ts'
import { selectDerivedSchedule, selectDerivedFindings } from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import { competitionLabel } from '../../src/lib/competitionLabels.ts'
import { phaseDisplay } from '../../src/lib/blockLabels.ts'

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
 *   three of them — `analysis:CUT_SUMMARY:<id>:0` per competition. Both cases
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
 * overflow fixture: JR-M-EPEE-IND's DE phase overflows at 4 strips, day 0).
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
 * STRIP_CONTENTION bottleneck (`Bottleneck.competition_id === ''`, Pass 0 of
 * `initialAnalysis`) once per over-capacity day, so the two warnings share a
 * cause and an (empty) competition_id — the case §1.2's id rule needs a
 * trailing ordinal to disambiguate. The same setup also raises one
 * STRIP_DEFICIT_NO_FLIGHTING and one VIDEO_STRIP_CONTENTION warning per
 * competition/day, each a unique cause+competition_id pair on its own, so
 * this fixture exercises both the duplicate and non-duplicate branches of
 * the id rule together.
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
      (e) => e.rule === 'video-dead-config' && e.subjects?.includes('JR-M-EPEE-IND'),
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

describe('selectFindings — bottleneck ids disambiguate duplicate cause+competition_id (contract §1.2)', () => {
  it('assigns a 0-based ordinal per cause+competition_id, keeps every analysis id unique, and reads target/day for a named competition', () => {
    twoDaysOverCapacity()
    const state = useStore.getState()
    const warnings = selectDerivedFindings(state).analysis.warnings
    expect(warnings.length).toBeGreaterThan(0)

    const rows = selectFindings(state)

    const seenPerKey = new Map<string, number>()
    for (const warning of warnings) {
      const key = `${warning.cause}:${warning.competition_id}`
      const n = seenPerKey.get(key) ?? 0
      const expectedId = `analysis:${warning.cause}:${warning.competition_id}:${n}`
      expect(
        rows.some((r) => r.id === expectedId),
        `expected a row with id ${expectedId}`,
      ).toBe(true)
      seenPerKey.set(key, n + 1)
    }

    // The duplicate branch: two STRIP_CONTENTION warnings (one per
    // over-capacity day) share cause and an empty competition_id.
    expect(rows.some((r) => r.id === 'analysis:STRIP_CONTENTION::0')).toBe(true)
    expect(rows.some((r) => r.id === 'analysis:STRIP_CONTENTION::1')).toBe(true)

    const analysisIds = rows.filter((r) => r.id.startsWith('analysis:')).map((r) => r.id)
    expect(new Set(analysisIds).size).toBe(analysisIds.length)

    // The non-duplicate, non-empty-competition_id branch.
    const deficitRow = rows.find((r) => r.id === 'analysis:STRIP_DEFICIT_NO_FLIGHTING:D1-M-EPEE-IND:0')
    expect(deficitRow).toBeDefined()
    expect(deficitRow?.target).toBe('D1-M-EPEE-IND')
    expect(deficitRow?.day).toBe(0)
  })
})

describe('selectFindings — INFO bottleneck maps to a Note row (contract §1.2, corrected header comment above)', () => {
  it('reads the cut-summary INFO warning as a Note row at the analysis:CUT_SUMMARY id', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const warnings = selectDerivedFindings(state).analysis.warnings
    const cutSummaries = warnings.filter((w) => w.cause === 'CUT_SUMMARY')
    expect(cutSummaries.length).toBe(3)
    expect(cutSummaries.every((w) => w.severity === 'INFO')).toBe(true)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'analysis:CUT_SUMMARY:JR-M-EPEE-IND:0')
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
    expect(block.competitionId).toBe('JR-M-EPEE-IND')

    const rows = selectFindings(state)
    const unplacedRows = rows.filter((r) => r.severity === 'Unplaced')
    expect(unplacedRows).toHaveLength(1)

    const row = rows.find((r) => r.id === `unplaced:${block.competitionId}:${block.phase}`)
    expect(row).toBeDefined()
    expect(row?.id).toBe('unplaced:JR-M-EPEE-IND:DE')
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
    useStore.getState().updateDayConfig(0, { day_end_time: 810 })
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
    const noteId = 'analysis:CUT_SUMMARY:JR-M-EPEE-IND:0'
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
