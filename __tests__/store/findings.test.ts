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
 * Two contract-required sub-cases are not written here, both confirmed by
 * research before this file was written, not assumed:
 * - §1.1's INFO → Note mapping: `src/engine/validation.ts` never constructs
 *   a `BottleneckSeverity.INFO` finding (grep confirms no such literal in
 *   the file) and a scan of every B1-B8 preset via `runScheduleAll` turned
 *   up no INFO-severity `validationErrors` row either. There is no real row
 *   to assert against, and the contract's own instruction is to drop the
 *   case rather than fabricate one.
 * - §2.2's "Note rows are undismissable" sub-case of dismissal filtering,
 *   for the same reason — no INFO/Note row exists on any fixture in this
 *   codebase to dismiss.
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

describe('selectFindings — late finish overrun via a hand move, Blocking count unchanged (FR-025)', () => {
  it('reports minutes past close after a move pushes the finish beyond it, without adding a Blocking row', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updateDayConfig(0, { day_end_time: 810 })
    const beforeState = useStore.getState()
    const blockingBefore = selectFindings(beforeState).filter((r) => r.severity === 'Blocking').length

    useStore.getState().updatePlacement('JR-M-EPEE-IND', { start_time: 600 })
    const state = useStore.getState()

    const schedule = selectDerivedSchedule(state)
    const blocks = assignStripLanes(schedule.events, state.strips_total)
    const day0Blocks = blocks.filter((b) => b.day === 0)
    const finish = Math.max(...day0Blocks.map((b) => b.endMinutes))
    const close = state.dayConfigs[0].day_end_time
    expect(finish).toBeGreaterThan(close)

    const rows = selectFindings(state)
    const row = rows.find((r) => r.id === 'late-finish:day:0')
    expect(row).toBeDefined()
    expect(row?.message).toContain(`${finish - close} minutes past`)

    const blockingAfter = rows.filter((r) => r.severity === 'Blocking').length
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
