/**
 * Invariant oracle for `Bottleneck.rule` and `Bottleneck.subjects` (014 D1–D3),
 * run over every producer the B1–B8 scenarios reach: `scheduleAll` and
 * `initialAnalysis`. For each bottleneck it proves the shape (kebab-case rule,
 * sorted de-duplicated string subjects), owner in subjects, subjects <-> message,
 * rule <-> cause (engine-native rules against `CAUSE_OF_RULE`, validation-derived
 * ones are RESOURCE_EXHAUSTION in Phase.VALIDATION), and rule membership in the
 * catalogue or `validateConfig`'s own ids. It does not pin which rule a given
 * producer reports. Exact pins exist only for some producers, in their own
 * tests. For the rest, the rule <-> cause table catches a swap across causes but
 * not a swap between rules that share a cause, such as the three
 * DAY_RESOURCE_SUMMARY rules or first/last-day-longer-than-middle. Which
 * producers fire is the drift ledger's concern, and producers a scenario never
 * reaches are not exercised here.
 *
 * The subjects -> message direction applies to engine-native rules only (two
 * validation rules list ids their message does not name) and couples to wording
 * on purpose, as a one-time cross-check that subjects name what the message names. A future switch to
 * display names in messages must update it.
 *
 * Since 016 the oracle also bounds a set `day` to the scenario's days and
 * requires every day-scoped rule the scenarios reach to carry a day. B1-B8 emit
 * no hard-separation-violated finding, so that rule's day is pinned only in
 * concurrentScheduler.test.ts.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { BottleneckRule, Phase, ValidationMode } from '../../src/engine/types.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { initialAnalysis } from '../../src/engine/analysis.ts'
import { validateConfig } from '../../src/engine/validation.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'
import { checkInvariants, namesCompetition } from '../helpers/bottleneckInvariants.ts'

const catalogue = new Set<string>(Object.values(BottleneckRule))

/**
 * Scenarios whose `initialAnalysis` raises no warning, pinned at exactly zero so
 * a new warning is noticed rather than silently skipped. B5 is here because
 * 015's factory builds the SJCC as the app does – the regional all-advance cut
 * and single-stage DEs – and the converged B5 raises none (measured 015,
 * 2026-10-05). Every other scenario must raise at least one.
 */
const SCENARIOS_WITHOUT_ANALYSIS_WARNINGS: readonly (typeof SCENARIO_IDS)[number][] = ['B5']

describe('namesCompetition', () => {
  it('does not find an id inside a longer id that extends it', () => {
    expect(namesCompetition('VET-M-EPEE-IND-VCMB is late', 'VET-M-EPEE-IND')).toBe(false)
  })

  it('does not find an id inside a longer id that prefixes it', () => {
    expect(namesCompetition('X-VET-M-EPEE-IND is late', 'VET-M-EPEE-IND')).toBe(false)
  })

  it('finds the short id when the longer one is also present', () => {
    expect(namesCompetition('VET-M-EPEE-IND-VCMB and VET-M-EPEE-IND: late', 'VET-M-EPEE-IND')).toBe(true)
  })
})

function runScenario(id: (typeof SCENARIO_IDS)[number]) {
  const { fencerCounts, days, strips, videoStrips, tournamentType } = SCENARIOS[id]
  const competitions = buildCompetitions(fencerCounts, tournamentType)
  const config = tournamentConfig(days, strips, videoStrips, tournamentType)
  const { schedule, bottlenecks } = scheduleAll(competitions, config)
  const dayAssignments = Object.fromEntries(
    Object.values(schedule).map(sr => [sr.competition_id, sr.assigned_day]),
  )
  const analysis = initialAnalysis(config, competitions, dayAssignments)
  const validationRules = new Set<string>(
    validateConfig(config, competitions, ValidationMode.BINDING).map(ve => ve.rule),
  )
  return { competitions, bottlenecks, warnings: analysis.warnings, validationRules, days }
}

describe('Bottleneck rule and subjects invariants', () => {
  const scenarios = {} as Record<(typeof SCENARIO_IDS)[number], ReturnType<typeof runScenario>>
  beforeAll(() => {
    for (const id of SCENARIO_IDS) scenarios[id] = runScenario(id)
  })

  for (const id of SCENARIO_IDS) {
    it(`scheduleAll bottlenecks of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, bottlenecks, validationRules, days } = scenarios[id]
      const ids = competitions.map(c => c.id)
      expect(bottlenecks.length, `${id} bottlenecks checked`).toBeGreaterThan(0)
      for (const b of bottlenecks) checkInvariants(b, ids, validationRules, days)
    })

    it(`initialAnalysis warnings of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, warnings, validationRules, days } = scenarios[id]
      const ids = competitions.map(c => c.id)
      if (SCENARIOS_WITHOUT_ANALYSIS_WARNINGS.includes(id)) {
        expect(
          warnings,
          `${id} now emits initialAnalysis warnings. Confirm they are expected, then remove ${id} from SCENARIOS_WITHOUT_ANALYSIS_WARNINGS. The invariant loop checks them.`,
        ).toHaveLength(0)
      } else {
        expect(warnings.length, `${id} warnings checked`).toBeGreaterThan(0)
      }
      for (const b of warnings) checkInvariants(b, ids, validationRules, days)
    })
  }

  // 016 Task A: the day-scoped rules always carry their day. A rule listed here
  // that no scenario reaches is covered by its producer's own test instead.
  it('every day-scoped finding the scenarios reach carries a day', () => {
    const dayScoped = new Set<string>([
      BottleneckRule.DAY_POOLS_EXCEED_STRIPS,
      BottleneckRule.MULTIPLE_FLIGHTED_SAME_DAY,
      BottleneckRule.DAY_VIDEO_DEMAND_EXCEEDS_VIDEO_STRIPS,
      BottleneckRule.HARD_SEPARATION_VIOLATED,
      BottleneckRule.REGIONAL_WINDOW_HONOURED,
      BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
      BottleneckRule.DAY_ENDS_PAST_TARGET,
      BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE,
      BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE,
      BottleneckRule.DAY_STRIP_HOURS_SUMMARY,
      BottleneckRule.DAY_REF_PEAK_SUMMARY,
      BottleneckRule.DAY_VIDEO_DE_REF_SUMMARY,
    ])
    const reached = SCENARIO_IDS.flatMap(id => [...scenarios[id].bottlenecks, ...scenarios[id].warnings])
      .filter(b => dayScoped.has(b.rule))
    expect(reached.length).toBeGreaterThan(0)
    for (const b of reached) expect(b.day, `day of ${b.rule} "${b.message}"`).toBeTypeOf('number')
  })

  it('the scenarios between them check at least one validation-derived bottleneck', () => {
    const derived = SCENARIO_IDS.flatMap(id => scenarios[id].bottlenecks.filter(
      b => b.phase === Phase.VALIDATION && !catalogue.has(b.rule),
    ))
    expect(derived.length).toBeGreaterThan(0)
  })

  it('a global validation-derived bottleneck carries its finding rule and subjects', () => {
    const config = makeConfig({ strips: makeStrips(0, 0) })
    const finding = validateConfig(config, [], ValidationMode.BINDING).find(f => f.rule === 'strips-total-positive')
    expect(finding).toBeDefined()

    const derived = scheduleAll([], config).bottlenecks.find(b => b.message === finding?.message)
    expect(derived?.rule).toBe(finding?.rule)
    expect(derived?.subjects).toEqual(finding?.subjects)
  })

  it('a per-event validation-derived bottleneck carries its finding rule and competition id', () => {
    const config = makeConfig()
    const comp = makeCompetition({ id: 'X-M-EPEE-IND', fencer_count: 1 })
    const finding = validateConfig(config, [comp], ValidationMode.BINDING).find(f => f.rule === 'fencer-count-bounds')
    expect(finding?.subjects).toEqual(['X-M-EPEE-IND'])

    const derived = scheduleAll([comp], config).bottlenecks.find(b => b.message === finding?.message)
    expect(derived?.rule).toBe(finding?.rule)
    expect(derived?.subjects).toEqual(finding?.subjects)
  })

  it('a same-population bottleneck passes the oracle though its message names the group, not the event ids', () => {
    const config = makeConfig({ days_available: 2 })
    const competitions = ['SP-1', 'SP-2', 'SP-3'].map(id => makeCompetition({ id }))
    const findings = validateConfig(config, competitions, ValidationMode.BINDING)
    const finding = findings.find(f => f.rule === 'same-population')
    expect(finding?.subjects).toEqual(['SP-1', 'SP-2', 'SP-3'])

    const derived = scheduleAll(competitions, config).bottlenecks.find(b => b.rule === 'same-population')
    expect(derived).toBeDefined()
    checkInvariants(derived!, competitions.map(c => c.id), new Set(findings.map(f => f.rule)))
  })
})
