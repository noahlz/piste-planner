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
 * The subjects -> message direction couples to wording on purpose, as a one-time
 * cross-check that subjects name what the message names. A future switch to
 * display names in messages must update it.
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
  const competitions = buildCompetitions(fencerCounts)
  const config = tournamentConfig(days, strips, videoStrips, tournamentType)
  const { schedule, bottlenecks } = scheduleAll(competitions, config)
  const dayAssignments = Object.fromEntries(
    Object.values(schedule).map(sr => [sr.competition_id, sr.assigned_day]),
  )
  const analysis = initialAnalysis(config, competitions, dayAssignments)
  const validationRules = new Set<string>(
    validateConfig(config, competitions, ValidationMode.BINDING).map(ve => ve.rule),
  )
  return { competitions, bottlenecks, warnings: analysis.warnings, validationRules }
}

describe('Bottleneck rule and subjects invariants', () => {
  const scenarios = {} as Record<(typeof SCENARIO_IDS)[number], ReturnType<typeof runScenario>>
  beforeAll(() => {
    for (const id of SCENARIO_IDS) scenarios[id] = runScenario(id)
  })

  for (const id of SCENARIO_IDS) {
    it(`scheduleAll bottlenecks of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, bottlenecks, validationRules } = scenarios[id]
      const ids = competitions.map(c => c.id)
      expect(bottlenecks.length, `${id} bottlenecks checked`).toBeGreaterThan(0)
      for (const b of bottlenecks) checkInvariants(b, ids, validationRules)
    })

    it(`initialAnalysis warnings of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, warnings, validationRules } = scenarios[id]
      const ids = competitions.map(c => c.id)
      expect(warnings.length, `${id} warnings checked`).toBeGreaterThan(0)
      for (const b of warnings) checkInvariants(b, ids, validationRules)
    })
  }

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
})
