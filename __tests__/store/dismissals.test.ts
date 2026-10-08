import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import type { StoreState } from '../../src/store/store.ts'
import { selectDerivedFindings } from '../../src/store/derived.ts'
import * as derivedModule from '../../src/store/derived.ts'
import { serializeState, deserializeState } from '../../src/store/serialization.ts'
import * as validationEngine from '../../src/engine/validation.ts'
import { BottleneckSeverity, DeMode } from '../../src/engine/types.ts'
import type { ValidationError } from '../../src/engine/types.ts'
import { SCENARIOS } from '../helpers/scenarios.ts'
import { makePlacement } from '../helpers/factories.ts'
import { runAndMoveHeadline } from '../helpers/drawnFixtures.ts'

// This file supersedes the "dismissalsSlice" block in placements.test.ts,
// which pins T008's unguarded dismissFinding/undismissFinding (any id
// succeeds, no check against a current finding). T021's commit must update
// that block to match the guarded behavior below — placements.test.ts is
// left untouched here per the task's instruction not to edit it in T019.

/**
 * `findingIdentity` — the identity helper T021 adds to src/engine/validation.ts
 * (research D4, data-model.md §Finding): `${rule}:${subjects.join('+')}`.
 * Duplicated from __tests__/engine/validation.test.ts's identical wrapper
 * rather than shared, since the export itself (not a test helper) is the
 * contract. Cast through `unknown` so this file compiles clean before the
 * export exists — the TDD failure is a runtime error here, not a tsc error.
 */
function findingIdentity(finding: ValidationError): string {
  const engine = validationEngine as unknown as { findingIdentity?: (f: ValidationError) => string }
  if (!engine.findingIdentity) {
    throw new Error('validation.ts does not yet export findingIdentity (T021)')
  }
  return engine.findingIdentity(finding)
}

// Smallest drift-ledger scenario (12 events) — realistic roster, matching the
// setupB5 pattern used across __tests__/store/*.test.ts.
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

/** First WARN-severity finding from the derived findings surface, or undefined. */
function currentWarnFinding(): ValidationError | undefined {
  return selectDerivedFindings(useStore.getState()).validationErrors.find(
    f => f.severity === BottleneckSeverity.WARN,
  )
}

/** First ERROR-severity finding from the derived findings surface, or undefined. */
function currentErrorFinding(): ValidationError | undefined {
  return selectDerivedFindings(useStore.getState()).validationErrors.find(
    f => f.severity === BottleneckSeverity.ERROR,
  )
}

/** Shape of a row from `selectFindings` (013 T030, phase5-contract.md §1) — only the fields this file reads. */
interface Finding {
  id: string
  severity: string
}

/**
 * `selectFindings` — the unified findings selector T030 adds to
 * src/store/derived.ts (phase5-contract.md §1). Cast through `unknown` so
 * this file compiles clean before the export exists (same pattern as
 * `findingIdentity` above) — the TDD failure is a runtime "is not a
 * function" TypeError here, not a tsc error.
 */
function selectFindings(state: StoreState): Finding[] {
  return (derivedModule as unknown as { selectFindings: (s: StoreState) => Finding[] }).selectFindings(state)
}

/**
 * Copied from __tests__/store/daySummaries.test.ts's
 * `threeEventsOverlappingOnDayZero` (phase5-contract.md §8 fixture notes) —
 * NAC, 3 days, 4 strips: JR-M-EPEE-IND day 0 @480, JR-W-EPEE-IND day 1 @480,
 * JR-M-FOIL-IND day 0 @500, 8 fencers each, SINGLE_STAGE.
 *
 * 024 group A, 2026-10-06 – blocks derived from METHODOLOGY.md §Pool Duration
 * Estimation and §DE Duration (Ops Manual p.17). A pool of 8 is 28 bouts,
 * 120 × 28/21 = 160 minutes for épée and foil alike, and 6 promoted into a
 * bracket of 8 run R8 and the semis in one wave each on 3 strips, 40 minutes:
 * JR-M-EPEE-IND pool 480-640 (1 strip), DE 670-710 (3 strips);
 * JR-M-FOIL-IND pool 500-660, DE 690-730 (3 strips, overflow – only 1 strip
 * is free at 690). Day 0 finish 730. Before 024 the épée pool ran longer, so
 * JR-M-EPEE-IND's DE was the one that overflowed and day 0 finished at 780.
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

beforeEach(() => {
  useStore.setState(useStore.getInitialState())
})

describe('dismissFinding — advisory-only guard (US3, data-model.md §Dismissals, spec clarification 2026-08-28)', () => {
  it('succeeds when the id matches a current WARN-severity finding', () => {
    setupB5()
    useStore.getState().setDays(1) // outside 2-4 → notice kind, WARN in both modes
    const warn = currentWarnFinding()
    expect(warn, 'expected a WARN finding from days_available=1').toBeDefined()
    const id = findingIdentity(warn!)

    useStore.getState().dismissFinding(id)

    expect(useStore.getState().dismissedFindings[id]).toBe(true)
  })

  it('rejects dismissing an ERROR-severity finding id — no state change', () => {
    setupB5()
    useStore.getState().setStrips(0) // structural ERROR in every mode
    const error = currentErrorFinding()
    expect(error, 'expected an ERROR finding from strips_total=0').toBeDefined()
    const id = findingIdentity(error!)

    useStore.getState().dismissFinding(id)

    expect(useStore.getState().dismissedFindings).toEqual({})
  })

  it('rejects dismissing an id that matches no current finding — no state change', () => {
    setupB5()

    useStore.getState().dismissFinding('no-such-rule:NOPE')

    expect(useStore.getState().dismissedFindings).toEqual({})
  })
})

describe('dismissals are sticky through rule flicker (spec US3 acceptance 2/4, edge case)', () => {
  it('stays dismissed while the rule is absent, and matches the same identity when the rule fires again with a different magnitude', () => {
    setupB5()
    useStore.getState().setDays(1)
    // Filtered explicitly by field (not currentWarnFinding()'s "first WARN")
    // because this test later asserts the days=5 finding's identity equals
    // this one's — that only holds if this is actually the days_available
    // finding, not whichever notice happens to be assembled first.
    const warn1 = selectDerivedFindings(useStore.getState()).validationErrors.find(f => f.field === 'days_available')
    expect(warn1, 'expected a days_available finding for days=1').toBeDefined()
    const id = findingIdentity(warn1!)
    useStore.getState().dismissFinding(id)
    expect(useStore.getState().dismissedFindings[id]).toBe(true)

    // Rule stops firing: back inside the 2-4 recommended range.
    useStore.getState().setDays(3)
    const gone = selectDerivedFindings(useStore.getState()).validationErrors.find(f => f.field === 'days_available')
    expect(gone, 'days_available finding should not fire for days=3').toBeUndefined()
    expect(useStore.getState().dismissedFindings[id]).toBe(true) // still sticky while absent

    // Rule fires again on the same subject, with a different magnitude (5 vs. 1).
    useStore.getState().setDays(5)
    const warn2 = selectDerivedFindings(useStore.getState()).validationErrors.find(f => f.field === 'days_available')
    expect(warn2, 'days_available finding should fire again for days=5').toBeDefined()
    expect(findingIdentity(warn2!)).toBe(id) // same rule + subject → same identity, still dismissed
    expect(useStore.getState().dismissedFindings[id]).toBe(true)
  })

  it('only undismissFinding removes a dismissal — unrelated store actions never clear it', () => {
    setupB5()
    useStore.getState().setDays(1)
    const warn = currentWarnFinding()
    const id = findingIdentity(warn!)
    useStore.getState().dismissFinding(id)

    useStore.getState().setStrips(SCENARIOS.B5.strips + 4)
    useStore.getState().updateCompetition(Object.keys(SCENARIOS.B5.fencerCounts)[0], { fencer_count: 30 })
    expect(useStore.getState().dismissedFindings[id]).toBe(true)

    useStore.getState().undismissFinding(id)
    expect(useStore.getState().dismissedFindings[id]).toBeUndefined()
  })
})

// specs/003-p2-derived-state/contracts/serialization-v2.md (removed; git show 0ab5bd2dc9:specs/003-p2-derived-state/contracts/serialization-v2.md)
describe('dismissedFindings serialization round-trip (serialization-v2, SC-001)', () => {
  it('a store-level dismissal survives serializeState → deserializeState exactly', () => {
    setupB5()
    useStore.getState().setDays(1)
    const warn = currentWarnFinding()
    expect(warn).toBeDefined()
    const id = findingIdentity(warn!)
    useStore.getState().dismissFinding(id)
    expect(useStore.getState().dismissedFindings[id]).toBe(true)

    const json = serializeState(useStore.getState())
    const result = deserializeState(json)
    if ('error' in result) throw new Error(`deserializeState failed: ${result.error}`)

    expect(result.state.dismissedFindings).toEqual({ [id]: true })
  })

  it('an unknown dismissed-finding identity loads fine as a sticky record through the store', () => {
    setupB5()
    const json = serializeState(useStore.getState())
    const parsed = JSON.parse(json) as { dismissedFindings: string[] }
    parsed.dismissedFindings = ['no-such-rule:UNKNOWN-EVENT-ID']
    const result = deserializeState(JSON.stringify(parsed))
    if ('error' in result) throw new Error(`deserializeState failed: ${result.error}`)

    useStore.setState(result.state)

    expect(useStore.getState().dismissedFindings).toEqual({ 'no-such-rule:UNKNOWN-EVENT-ID': true })
  })
})

describe('dismissFinding — widened to the unified findings list (013 T030, contract §2.2)', () => {
  // 017 T5a: the row comes from a run plus the headline Move day, whose moved
  // event finds no free strips. The run-less overflow fixture this used
  // (`unplaced:JR-M-FOIL-IND:DE`) is stale now and raises only the stale row.
  it('dismissing an Unplaced row id records it and removes it from selectFindings', () => {
    runAndMoveHeadline('B1')
    const unplaced = selectFindings(useStore.getState()).find((f) => f.severity === 'Unplaced')
    // Located by severity, then the id is asserted as a literal — a fixture
    // drift reports as a wrong id here rather than a missing row.
    expect(unplaced?.id).toBe('unplaced:D1-M-EPEE-IND:room')

    useStore.getState().dismissFinding(unplaced!.id)

    expect(useStore.getState().dismissedFindings[unplaced!.id]).toBe(true)
    expect(selectFindings(useStore.getState()).some((f) => f.id === unplaced!.id)).toBe(false)
  })

  it('dismissing the stale row is a no-op (017 P4: it is not dismissable)', () => {
    threeEventsOverlappingOnDayZero()
    const unplaced = selectFindings(useStore.getState()).filter((f) => f.severity === 'Unplaced')
    expect(unplaced.map((f) => f.id), 'a board that was never run shows no unseated row').toEqual(['stale:run'])

    useStore.getState().dismissFinding('stale:run')

    expect(useStore.getState().dismissedFindings).toEqual({})
    expect(selectFindings(useStore.getState()).some((f) => f.id === 'stale:run')).toBe(true)
  })

  it('dismissing a Late finish row id records it and filters it', () => {
    threeEventsOverlappingOnDayZero()
    // Day 0 finishes at 730, so a 760 close puts the finish 30 minutes inside
    // the 45-minute late-finish window, as 810 did against 780 before 024.
    useStore.getState().updateDayConfig(0, { day_end_time: 760 })
    const lateFinish = selectFindings(useStore.getState()).find((f) => f.id === 'late-finish:day:0')
    expect(lateFinish, 'expected a Late finish finding for day 0').toBeDefined()

    useStore.getState().dismissFinding('late-finish:day:0')

    expect(useStore.getState().dismissedFindings['late-finish:day:0']).toBe(true)
    expect(selectFindings(useStore.getState()).some((f) => f.id === 'late-finish:day:0')).toBe(false)
  })

  it('dismissing a Blocking row id is a no-op', () => {
    // The existing "rejects dismissing an ERROR-severity finding id" case
    // above already proves this through `findingIdentity`. This asserts the
    // same guard through the row's id as read off `selectFindings`.
    setupB5()
    useStore.getState().setStrips(0) // structural ERROR in every mode
    const blocking = selectFindings(useStore.getState()).find((f) => f.severity === 'Blocking')
    expect(blocking, 'expected a Blocking finding from strips_total=0').toBeDefined()

    useStore.getState().dismissFinding(blocking!.id)

    expect(useStore.getState().dismissedFindings).toEqual({})
    expect(selectFindings(useStore.getState()).some((f) => f.id === blocking!.id)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// 016 Task C – a hard same-day rule break cannot be dismissed (R1), and a
// day-scoped dismissal stays with its day (spec §2, review focus 4).
// ──────────────────────────────────────────────

const HARD_PAIR_DAY_ONE = 'analysis:hard-separation-violated:CDT-M-FOIL-IND:CDT-M-FOIL-IND+JR-M-FOIL-IND:0'

/** Junior and Cadet Men's Foil placed by hand together on Day 1 of a NAC: a hard pair (R1). */
function hardPairOnDayOne(): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(40)
  s.setVideoStrips(8)
  s.selectCompetitions(['JR-M-FOIL-IND', 'CDT-M-FOIL-IND'])
  s.updateCompetition('JR-M-FOIL-IND', { fencer_count: 24 })
  s.updateCompetition('CDT-M-FOIL-IND', { fencer_count: 24 })
  s.setPlacementsFromAuto({
    'JR-M-FOIL-IND': makePlacement({ day: 0, start_time: 540, strip_count: 4 }),
    'CDT-M-FOIL-IND': makePlacement({ day: 0, start_time: 540, strip_count: 4 }),
  })
}

describe('dismissFinding — refuses a hard-separation row (016 R1)', () => {
  it('records no dismissal and leaves the row in the list', () => {
    hardPairOnDayOne()
    const id = HARD_PAIR_DAY_ONE
    const row = selectFindings(useStore.getState()).find((f) => f.id === id)
    expect(row, `premise: the hand-made pair raises ${id}`).toBeDefined()
    expect(row?.severity, 'a Warning, so the severity guard alone would let it through').toBe('Warning')

    useStore.getState().dismissFinding(id)

    expect(useStore.getState().dismissedFindings).toEqual({})
    expect(selectFindings(useStore.getState()).some((f) => f.id === id)).toBe(true)
  })

  // A save or shared URL can carry any dismissed id as a sticky record, so the
  // read side must hold R1 too, not only dismissFinding.
  it('stays shown when a loaded save already carries its id as dismissed', () => {
    hardPairOnDayOne()
    const parsed = JSON.parse(serializeState(useStore.getState())) as { dismissedFindings: string[] }
    parsed.dismissedFindings = [HARD_PAIR_DAY_ONE]
    const result = deserializeState(JSON.stringify(parsed))
    if ('error' in result) throw new Error(`deserializeState failed: ${result.error}`)

    useStore.setState(result.state)
    expect(useStore.getState().dismissedFindings, 'premise: the load kept the dismissal').toEqual({
      [HARD_PAIR_DAY_ONE]: true,
    })

    expect(selectFindings(useStore.getState()).some((f) => f.id === HARD_PAIR_DAY_ONE)).toBe(true)
  })
})

/**
 * Men's and Women's Div 1 épée of 60 against one strip: nine pools each, so
 * every day an event sits on raises its own `day-pools-exceed-strips` venue
 * warning (Pass 0 of `initialAnalysis`).
 */
function overCapacityEpee(days: Record<string, number>): void {
  useStore.setState(useStore.getInitialState(), true)
  const s = useStore.getState()
  s.setTournamentType('NAC')
  s.setDays(3)
  s.setStrips(1)
  s.setVideoStrips(0)
  s.selectCompetitions(Object.keys(days))
  for (const id of Object.keys(days)) s.updateCompetition(id, { fencer_count: 60 })
  s.setPlacementsFromAuto(
    Object.fromEntries(
      Object.entries(days).map(([id, day]) => [id, makePlacement({ day, start_time: 540, strip_count: 1 })]),
    ),
  )
}

const POOLS_DAY_2 = 'analysis:day-pools-exceed-strips:::1'
const POOLS_DAY_3 = 'analysis:day-pools-exceed-strips:::2'

function shownIds(): string[] {
  return selectFindings(useStore.getState()).map((f) => f.id)
}

// Review focus 4.
describe('dismissFinding — a day-scoped dismissal stays with its day (016 spec §2)', () => {
  it('hides the Day 2 instance and not the Day 3 one, even once Day 2 no longer raises it', () => {
    overCapacityEpee({ 'D1-M-EPEE-IND': 1, 'D1-W-EPEE-IND': 2 })
    expect(shownIds(), 'premise: both days raise the warning').toEqual(expect.arrayContaining([POOLS_DAY_2, POOLS_DAY_3]))

    useStore.getState().dismissFinding(POOLS_DAY_2)
    expect(shownIds()).not.toContain(POOLS_DAY_2)
    expect(shownIds()).toContain(POOLS_DAY_3)

    // One pool of 6 fits the strip, so Day 2's instance goes away. Under the
    // old ordinal ids Day 3's instance took over Day 2's dismissed id here.
    useStore.getState().updateCompetition('D1-M-EPEE-IND', { fencer_count: 6 })
    expect(shownIds()).toContain(POOLS_DAY_3)
  })

  it('shows the warning again when its event moves from the dismissed day to another', () => {
    overCapacityEpee({ 'D1-M-EPEE-IND': 1 })
    expect(shownIds(), 'premise: Day 2 raises the warning').toContain(POOLS_DAY_2)
    useStore.getState().dismissFinding(POOLS_DAY_2)
    expect(shownIds()).not.toContain(POOLS_DAY_2)

    useStore.getState().updatePlacement('D1-M-EPEE-IND', { day: 2 })

    expect(shownIds()).toContain(POOLS_DAY_3)
  })
})
