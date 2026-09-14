import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { assignStripLanes } from '../../src/layout/lanes.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DeMode } from '../../src/engine/types.ts'
import { selectDaySummaries, selectDerivedSchedule, selectDerivedFindings } from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import type { DaySummary } from '../../src/store/derived.ts'

/**
 * 013 T025 (phase-3 contract) — `selectDaySummaries` (data-model.md §9,
 * contracts/phase3-contract.md). One row per day, read from the same
 * `assignStripLanes` output the footer and the canvas already agree on
 * (constitution, "each fact has exactly one home") — never a private
 * re-flattening of the schedule.
 *
 * `findings` counts `selectFindings(state)` rows whose `day` equals that day
 * (013 T030, phase5-contract.md §1.7) — the unified list spanning validation
 * errors, bottleneck warnings, Unplaced overflow/stranded rows and Late
 * finish rows, already filtered to undismissed. This supersedes the earlier
 * "validationErrors only" contract: `daySummariesFromBlocks` now takes the
 * findings list directly rather than re-deriving it from `validationErrors` +
 * `dismissedFindings` + `placementDays`.
 */

/** Shape of a row from `selectFindings` (013 T030, phase5-contract.md §1) — only the fields this file reads. */
interface Finding {
  id: string
  severity: string
  day: number | null
}

/**
 * `selectFindings` — the unified findings selector T030 adds to
 * src/store/derived.ts (phase5-contract.md §1). Cast through `unknown` so
 * this file compiles clean before the export exists — the TDD failure is a
 * runtime "is not a function" TypeError here, not a tsc error.
 */
function selectFindings(state: StoreState): Finding[] {
  return (derivedModule as unknown as { selectFindings: (s: StoreState) => Finding[] }).selectFindings(state)
}

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('selectDaySummaries — one row per day (data-model.md §9)', () => {
  it('returns one summary per day in [0, days_available), day ascending', () => {
    applyPreset('B1')
    runScheduleAll()
    const state = useStore.getState()

    const summaries = selectDaySummaries(state)

    expect(summaries.map((s) => s.day)).toEqual(
      Array.from({ length: state.days_available }, (_, i) => i),
    )
  })
})

/**
 * Two JUNIOR epee individual events (category JUNIOR → de_video_policy
 * REQUIRED by default, src/engine/constants.ts DEFAULT_VIDEO_POLICY_BY_CATEGORY),
 * with the tournament-wide DE mode overridden to SINGLE_STAGE
 * (setDeModeOverride) — REQUIRED + SINGLE_STAGE is dead config
 * (src/engine/validation.ts:217, rule 'video-dead-config'), a WARN-severity
 * notice in both validation modes, so both events carry one such finding
 * regardless of placement.
 *
 * JR-M-EPEE-IND is placed on day 0, JR-W-EPEE-IND on day 1; day 2 gets no
 * placement at all, for the "day with nothing" cases. 4 strips total and 1
 * strip each avoids any overflow, keeping this fixture about day summaries,
 * not about the lane packer's overflow behavior (already covered elsewhere,
 * __tests__/store/footerMetrics.test.ts).
 */
function twoJuniorEpeeOnSeparateDays(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(4)
  s.setVideoStrips(0)
  s.selectCompetitions(['JR-M-EPEE-IND', 'JR-W-EPEE-IND'])
  for (const id of ['JR-M-EPEE-IND', 'JR-W-EPEE-IND']) {
    s.updateCompetition(id, { fencer_count: 8 })
  }
  s.setDeModeOverride(DeMode.SINGLE_STAGE)
  s.setPlacementsFromAuto({
    'JR-M-EPEE-IND': makePlacement({ day: 0, start_time: 480, strip_count: 1 }),
    'JR-W-EPEE-IND': makePlacement({ day: 1, start_time: 480, strip_count: 1 }),
  })
}

/** Expected events/finish/unplaced for one day, derived from assignStripLanes — never typed by hand.
 *
 * `peakStrips` is deliberately not computed here (test-quality-reviewer
 * finding on 05103d5ff4): this used to re-implement `peakStripsOnDay`'s own
 * half-open interval-overlap loop, so an off-by-one shared by both
 * implementations would have passed unnoticed. It is asserted separately
 * below as a literal, reasoned out from the fixture's own block times. */
function expectedBlockFields(
  blocks: ReturnType<typeof assignStripLanes>,
  day: number,
): Pick<DaySummary, 'events' | 'finish' | 'unplaced'> {
  const dayBlocks = blocks.filter((b) => b.day === day)
  if (dayBlocks.length === 0) {
    return { events: 0, finish: null, unplaced: 0 }
  }
  const events = new Set(dayBlocks.map((b) => b.competitionId)).size
  const finish = Math.max(...dayBlocks.map((b) => b.endMinutes))
  const unplaced = dayBlocks.filter((b) => b.overflow).length
  return { events, finish, unplaced }
}

/**
 * `twoJuniorEpeeOnSeparateDays` puts exactly one event per day, and a single
 * SINGLE_STAGE event's own pool-then-DE phases never overlap themselves
 * (pool 480-704, DE 735-780) — so that fixture never gave `peakStripsOnDay`'s
 * interval-overlap loop an actual overlap to resolve, and a version of it
 * that summed wrong at a shared boundary would still pass. This adds a third
 * event, JR-M-FOIL-IND, on day 0 starting 20 minutes after JR-M-EPEE-IND —
 * close enough that both their pool phases and (since both derive similar
 * durations) their DE phases overlap.
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

describe('selectDaySummaries — per-day fields, derived from assignStripLanes', () => {
  it('matches events, finish and unplaced against an independently-computed assignStripLanes pass', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const schedule = selectDerivedSchedule(state)
    const blocks = assignStripLanes(schedule.events, state.strips_total)

    const summaries = selectDaySummaries(state)
    expect(summaries).toHaveLength(3)

    for (let day = 0; day < 3; day++) {
      const expected = expectedBlockFields(blocks, day)
      expect(summaries[day], `day ${day}`).toMatchObject({ day, ...expected })
    }
  })

  it('sums concurrent strip demand at the busiest instant of the day, half-open at the boundary', () => {
    threeEventsOverlappingOnDayZero()
    const summaries = selectDaySummaries(useStore.getState())

    // Day 0's four blocks: JR-M-EPEE-IND pool 480-704 (1 strip), JR-M-FOIL-IND
    // pool 500-696 (1 strip), JR-M-FOIL-IND DE 730-775 (3 strips), and
    // JR-M-EPEE-IND DE 735-780 (3 strips, drawn overflowing — 4 strips total
    // leaves no free run once JR-M-FOIL-IND's DE has taken 3 of them, but
    // `peakStripsOnDay` counts its demand regardless, since it measures
    // demand rather than occupancy). The busiest instant is minute 735, where
    // both DEs are running at once: 3 + 3 = 6. (JR-M-FOIL-IND's DE has
    // already started by 735 and JR-M-EPEE-IND's pool has already ended, so
    // neither pool block reaches this instant — the half-open interval rule
    // this asserts.)
    expect(summaries[0].peakStrips).toBe(6)
    // Day 1 carries only JR-W-EPEE-IND, whose own pool-then-DE never overlap
    // each other, so the peak is just its largest single block, the 3-strip DE.
    expect(summaries[1].peakStrips).toBe(3)
    // Day 2 has nothing placed.
    expect(summaries[2].peakStrips).toBe(0)
  })

  it('reports events 0, finish null and peakStrips 0 for a day with nothing placed on it', () => {
    twoJuniorEpeeOnSeparateDays() // day 2 has no placement
    const summaries = selectDaySummaries(useStore.getState())

    expect(summaries[2]).toMatchObject({ day: 2, events: 0, finish: null, peakStrips: 0, unplaced: 0 })
  })
})

describe('selectDaySummaries — findings, re-pointed to selectFindings (013 T030, contract §1.7)', () => {
  it('matches selectFindings filtered by day, and drops exactly one after dismissFinding', () => {
    twoJuniorEpeeOnSeparateDays()
    const state = useStore.getState()

    const derivedFindings = selectDerivedFindings(state)
    const jrM = derivedFindings.validationErrors.find(
      (e) => e.rule === 'video-dead-config' && e.subjects?.includes('JR-M-EPEE-IND'),
    )
    expect(jrM, 'expected a video-dead-config finding for JR-M-EPEE-IND').toBeDefined()
    const jrMId = findingIdentity(jrM!)

    const before = selectDaySummaries(useStore.getState())
    const findingsBefore = selectFindings(useStore.getState())
    // JR-M-EPEE-IND is placed on day 0, JR-W-EPEE-IND on day 1 — a
    // cross-selector check against `selectFindings`, not the literals
    // T025 measured against the narrower validationErrors-only column.
    for (let day = 0; day < 3; day++) {
      expect(before[day].findings, `day ${day}`).toBe(
        findingsBefore.filter((f) => f.day === day).length,
      )
    }
    expect(findingsBefore.some((f) => f.id === jrMId), 'expected the video-dead-config row in selectFindings').toBe(true)

    useStore.getState().dismissFinding(jrMId)

    const after = selectDaySummaries(useStore.getState())
    const findingsAfter = selectFindings(useStore.getState())
    for (let day = 0; day < 3; day++) {
      expect(after[day].findings, `day ${day}`).toBe(
        findingsAfter.filter((f) => f.day === day).length,
      )
    }
    // One dismissal drops exactly one, on the day the dismissed row belongs to.
    expect(after[0].findings).toBe(before[0].findings - 1)
    // Dismissing JR-M's finding does not touch JR-W's — a separate identity
    // (distinct subject), on a separate day.
    expect(after[1].findings).toBe(before[1].findings)
  })

  it('counts an Unplaced row on the day its overflowing block sits on', () => {
    threeEventsOverlappingOnDayZero()
    const summaries = selectDaySummaries(useStore.getState())
    const findings = selectFindings(useStore.getState())

    const day0Findings = findings.filter((f) => f.day === 0)
    expect(day0Findings.some((f) => f.severity === 'Unplaced'), 'expected an Unplaced row on day 0').toBe(true)
    expect(summaries[0].findings).toBeGreaterThanOrEqual(1)
    expect(summaries[0].findings).toBe(day0Findings.length)
  })
})
