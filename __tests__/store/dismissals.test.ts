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
 * JR-M-FOIL-IND day 0 @500, 8 fencers each, SINGLE_STAGE. Measured blocks:
 * JR-M-EPEE-IND pool 480-704 (1 strip), DE 735-780 (3 strips, overflow);
 * JR-M-FOIL-IND pool 500-696, DE 730-775 (3 strips). Day 0 finish 780.
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

describe('dismissedFindings serialization round-trip (contracts/serialization-v2.md, SC-001)', () => {
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
  it('dismissing an Unplaced row id records it and removes it from selectFindings', () => {
    threeEventsOverlappingOnDayZero()
    const unplaced = selectFindings(useStore.getState()).find((f) => f.severity === 'Unplaced')
    expect(unplaced, 'expected an Unplaced finding from the overflowing DE block').toBeDefined()
    // Located by severity, then the id is asserted as a literal — a fixture
    // drift reports as a wrong id here rather than a missing row.
    expect(unplaced!.id).toBe('unplaced:JR-M-EPEE-IND:DE')

    useStore.getState().dismissFinding(unplaced!.id)

    expect(useStore.getState().dismissedFindings[unplaced!.id]).toBe(true)
    expect(selectFindings(useStore.getState()).some((f) => f.id === unplaced!.id)).toBe(false)
  })

  it('dismissing a Late finish row id records it and filters it', () => {
    threeEventsOverlappingOnDayZero()
    useStore.getState().updateDayConfig(0, { day_end_time: 810 })
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
