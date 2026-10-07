import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { runAndMoveHeadline, runPreset } from '../helpers/drawnFixtures.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DeMode, Weapon } from '../../src/engine/types.ts'
import { SCENARIO_IDS } from '../../src/data/tournaments.ts'
import {
  selectDaySummaries,
  selectDerivedFindings,
  selectDrawnSchedule,
  selectPlacementCounts,
} from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import type { DaySummary, DrawnScheduleBlock } from '../../src/store/derived.ts'

/**
 * 013 T025 (phase-3 contract) — `selectDaySummaries` (data-model.md §9,
 * contracts/phase3-contract.md). One row per day, read from the drawn model's
 * blocks (`selectDrawnSchedule`, 017 T6a), the same blocks the footer counts
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
 * Two JUNIOR epee individual events (at the store's default NAC every
 * individual event's de_video_policy is REQUIRED, src/store/typeDefaults.ts
 * resolveVideoPolicy), with the tournament-wide DE mode overridden to SINGLE_STAGE
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

/** Expected events/finish/unplaced for one day, read off the drawn blocks — never typed by hand.
 *
 * `peakStrips` is deliberately not computed here (test-quality-reviewer
 * finding on 05103d5ff4): this used to re-implement `peakStripsOnDay`'s own
 * half-open interval-overlap loop, so an off-by-one shared by both
 * implementations would have passed unnoticed. It is asserted separately
 * below as a literal, reasoned out from the fixture's own block times. */
function expectedBlockFields(
  blocks: readonly DrawnScheduleBlock[],
  day: number,
): Pick<DaySummary, 'events' | 'finish' | 'unplaced'> {
  const dayBlocks = blocks.filter((b) => b.day === day)
  if (dayBlocks.length === 0) {
    return { events: 0, finish: null, unplaced: 0 }
  }
  const events = new Set(dayBlocks.map((b) => b.competitionId)).size
  const finish = Math.max(...dayBlocks.map((b) => b.endMinutes))
  const unplaced = new Set(dayBlocks.filter((b) => b.countsAsUnplaced).map((b) => b.competitionId)).size
  return { events, finish, unplaced }
}

/**
 * `twoJuniorEpeeOnSeparateDays` puts exactly one event per day, and a single
 * SINGLE_STAGE event's own pool-then-DE phases never overlap themselves
 * (pool 480-640, DE 670-710) — so that fixture never gave `peakStripsOnDay`'s
 * interval-overlap loop an actual overlap to resolve, and a version of it
 * that summed wrong across overlapping blocks would still pass. This adds a third
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

describe('selectDaySummaries — per-day fields, read off the drawn blocks', () => {
  it('matches events, finish and unplaced against the drawn model\'s own blocks', () => {
    threeEventsOverlappingOnDayZero()
    const state = useStore.getState()
    const { blocks } = selectDrawnSchedule(state)

    const summaries = selectDaySummaries(state)
    expect(summaries).toHaveLength(3)

    for (let day = 0; day < 3; day++) {
      const expected = expectedBlockFields(blocks, day)
      expect(summaries[day], `day ${day}`).toMatchObject({ day, ...expected })
    }
  })

  it('sums the strips held at the busiest instant, so an unseated phase adds none', () => {
    threeEventsOverlappingOnDayZero()
    const summaries = selectDaySummaries(useStore.getState())

    // Day 0, seated whole in (event start, id) order over 4 strips:
    // JR-M-EPEE-IND pool 480-640 on strip 0 and DE 670-710 on strips 0-2, then
    // JR-M-FOIL-IND pool 500-660 on strip 1 (strip 0 is busy) and DE 690-730,
    // which needs 3 strips while only strip 3 is free, so it holds none. The
    // busiest instant is 670-710, where JR-M-EPEE-IND's DE holds 3. Counting
    // the unseated DE's 3 requested strips would read 6, more than the 4 the
    // day has (017 spec §4).
    expect(summaries[0].peakStrips).toBe(3)
    // Day 1 carries only JR-W-EPEE-IND, whose own pool-then-DE never overlap
    // each other, so the peak is just its largest single block, the 3-strip DE.
    expect(summaries[1].peakStrips).toBe(3)
    // Day 2 has nothing placed.
    expect(summaries[2].peakStrips).toBe(0)
  })

  it.each(SCENARIO_IDS)('never claims more strips at peak than %s has, at boot or after the headline move', (scenario) => {
    runPreset(scenario)
    const atBoot = selectDaySummaries(useStore.getState())
    const stripsTotal = useStore.getState().strips_total
    for (const summary of atBoot) expect(summary.peakStrips, `boot day ${summary.day}`).toBeLessThanOrEqual(stripsTotal)

    runAndMoveHeadline(scenario)
    for (const summary of selectDaySummaries(useStore.getState())) {
      expect(summary.peakStrips, `moved day ${summary.day}`).toBeLessThanOrEqual(stripsTotal)
    }
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
      (e) => e.rule === 'video-dead-config' && e.subjects.includes('JR-M-EPEE-IND'),
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

  // 017 T5a: the Unplaced row comes from the headline Move day's unseated
  // event on its new day. The run-less overflow fixture this used is stale
  // now, and its one stale row belongs to no day.
  it('counts an Unplaced row on the day its unseated event sits on', () => {
    const { id, day } = runAndMoveHeadline('B1')
    const summaries = selectDaySummaries(useStore.getState())
    const findings = selectFindings(useStore.getState())

    const dayFindings = findings.filter((f) => f.day === day)
    expect(dayFindings.some((f) => f.id === `unplaced:${id}:room`), `expected the mover's Unplaced row on day ${day}`).toBe(true)
    expect(summaries[day].findings).toBe(dayFindings.length)
  })
})

describe('selectDaySummaries — unplaced counts the drawn model\'s events (017 spec §4)', () => {
  it('after the headline move, the moved event\'s band and the footer both count 1', () => {
    const { id, day } = runAndMoveHeadline('B1')
    const state = useStore.getState()
    expect(selectDrawnSchedule(state).unplacedIds, 'premise: the moved event is unplaced').toEqual(new Set([id]))

    const summaries = selectDaySummaries(state)
    expect(summaries[day].unplaced).toBe(1)
    expect(summaries.reduce((sum, s) => sum + s.unplaced, 0)).toBe(1)
    expect(selectPlacementCounts(state).unplaced).toBe(1)
  })

  it('after a settings edit, every band counts 0 unplaced', () => {
    runPreset('B1')
    const { setPoolRoundDuration, pool_round_duration_table } = useStore.getState()
    setPoolRoundDuration(Weapon.EPEE, pool_round_duration_table[Weapon.EPEE] + 30)
    const state = useStore.getState()
    const model = selectDrawnSchedule(state)
    expect(model.runState, 'premise: the settings edit makes the board stale').toBe('stale')
    expect(model.blocks.some((b) => b.unseated), 'premise: the stale board has unseated phases').toBe(true)

    expect(selectDaySummaries(state).map((s) => s.unplaced)).toEqual(Array.from({ length: state.days_available }, () => 0))
  })
})
