import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { applyPreset } from '../../src/store/presets.ts'
import { runScheduleAll } from '../../src/store/runActions.ts'
import { makePlacement } from '../helpers/factories.ts'
import { assignStripLanes } from '../../src/layout/lanes.ts'
import { findingIdentity } from '../../src/engine/validation.ts'
import { DeMode } from '../../src/engine/types.ts'
import { selectDaySummaries, selectDerivedSchedule, selectDerivedFindings } from '../../src/store/derived.ts'
import type { DaySummary } from '../../src/store/derived.ts'

/**
 * 013 T025 (phase-3 contract) — `selectDaySummaries` (data-model.md §9,
 * contracts/phase3-contract.md). One row per day, read from the same
 * `assignStripLanes` output the footer and the canvas already agree on
 * (constitution, "each fact has exactly one home") — never a private
 * re-flattening of the schedule.
 *
 * `findings` counts only `validationErrors`, not `analysis.warnings`
 * (bottlenecks). `findingIdentity` (src/engine/validation.ts, T021) gives
 * every `ValidationError` a stable id that `dismissFinding` and
 * `state.dismissedFindings` already key on — see `dismissFinding` in
 * src/store/store.ts:422, which only ever matches against
 * `validationErrors`. `analysis.warnings` (the bottleneck surface) has no
 * such identity function and nothing in the app can dismiss one, so a
 * bottleneck can never appear in `dismissedFindings` and "undismissed
 * bottleneck" is just "every bottleneck" — there is no dismissal behavior to
 * assert against it. This file counts `validationErrors` only, keyed by
 * `findingIdentity` and each finding's first subject's placement day.
 */

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

/** Expected events/finish/peakStrips/unplaced for one day, derived from assignStripLanes — never typed by hand. */
function expectedBlockFields(
  blocks: ReturnType<typeof assignStripLanes>,
  day: number,
): Pick<DaySummary, 'events' | 'finish' | 'peakStrips' | 'unplaced'> {
  const dayBlocks = blocks.filter((b) => b.day === day)
  if (dayBlocks.length === 0) {
    return { events: 0, finish: null, peakStrips: 0, unplaced: 0 }
  }
  const events = new Set(dayBlocks.map((b) => b.competitionId)).size
  const finish = Math.max(...dayBlocks.map((b) => b.endMinutes))
  // "sampled at every block startMinutes" (phase3-contract.md §DaySummary).
  const peakStrips = Math.max(
    ...dayBlocks.map((sample) =>
      dayBlocks
        .filter((b) => b.startMinutes <= sample.startMinutes && b.endMinutes > sample.startMinutes)
        .reduce((sum, b) => sum + b.stripCount, 0),
    ),
  )
  const unplaced = dayBlocks.filter((b) => b.overflow).length
  return { events, finish, peakStrips, unplaced }
}

describe('selectDaySummaries — per-day fields, derived from assignStripLanes', () => {
  it('matches events, finish, peakStrips and unplaced against an independently-computed assignStripLanes pass', () => {
    twoJuniorEpeeOnSeparateDays()
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

  it('reports events 0, finish null and peakStrips 0 for a day with nothing placed on it', () => {
    twoJuniorEpeeOnSeparateDays() // day 2 has no placement
    const summaries = selectDaySummaries(useStore.getState())

    expect(summaries[2]).toMatchObject({ day: 2, events: 0, finish: null, peakStrips: 0, unplaced: 0 })
  })
})

describe('selectDaySummaries — findings, keyed by validationErrors + findingIdentity', () => {
  it('counts an undismissed validation finding on the day its subject competition is placed, and drops it after dismissFinding', () => {
    twoJuniorEpeeOnSeparateDays()
    const state = useStore.getState()

    const findings = selectDerivedFindings(state)
    const jrM = findings.validationErrors.find(
      (e) => e.rule === 'video-dead-config' && e.subjects?.includes('JR-M-EPEE-IND'),
    )
    const jrW = findings.validationErrors.find(
      (e) => e.rule === 'video-dead-config' && e.subjects?.includes('JR-W-EPEE-IND'),
    )
    expect(jrM, 'expected a video-dead-config finding for JR-M-EPEE-IND').toBeDefined()
    expect(jrW, 'expected a video-dead-config finding for JR-W-EPEE-IND').toBeDefined()

    const before = selectDaySummaries(useStore.getState())
    // JR-M-EPEE-IND is placed on day 0, JR-W-EPEE-IND on day 1 — each day
    // carries the findings of the event placed on it, and there are two of
    // them per event, not one: alongside `video-dead-config` this fixture
    // also raises `r16-over-cap` (src/engine/validation.ts), because
    // `de_round_of_16_strips` is 4 against the DE cap of 3 that 4 strips
    // allow. Measured, not predicted (tasks.md standing rule 11) — T025 wrote
    // these as 1 from the one rule it had reasoned about.
    expect(before[0].findings).toBe(2)
    expect(before[1].findings).toBe(2)
    expect(before[2].findings).toBe(0)

    useStore.getState().dismissFinding(findingIdentity(jrM!))

    const after = selectDaySummaries(useStore.getState())
    // One dismissal drops exactly one: JR-M's `r16-over-cap` is a separate
    // identity and stays counted.
    expect(after[0].findings).toBe(1)
    // Dismissing JR-M's finding does not touch JR-W's — a separate identity
    // (distinct subject), on a separate day.
    expect(after[1].findings).toBe(2)
  })
})
