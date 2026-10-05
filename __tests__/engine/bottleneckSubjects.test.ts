/**
 * Invariant oracle for `Bottleneck.rule` and `Bottleneck.subjects` (014 D1–D3),
 * run over every producer the B1–B8 scenarios reach: `scheduleAll` and
 * `initialAnalysis`. Producers a scenario never reaches are covered by the
 * type system, since both fields are required.
 */
import { describe, it, expect } from 'vitest'
import { BottleneckRule, ValidationMode } from '../../src/engine/types.ts'
import type { Bottleneck } from '../../src/engine/types.ts'
import { scheduleAll } from '../../src/engine/scheduler.ts'
import { initialAnalysis } from '../../src/engine/analysis.ts'
import { validateConfig } from '../../src/engine/validation.ts'
import { SCENARIOS, SCENARIO_IDS, buildCompetitions, tournamentConfig } from '../helpers/scenarios.ts'
import { makeCompetition, makeConfig, makeStrips } from '../helpers/factories.ts'

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ID_CHAR = /[A-Za-z0-9_-]/

/** True when `id` appears in `message` as a whole token, not inside a longer id. */
function namesCompetition(message: string, id: string): boolean {
  let from = message.indexOf(id)
  while (from !== -1) {
    const before = message[from - 1]
    const after = message[from + id.length]
    if ((before === undefined || !ID_CHAR.test(before)) && (after === undefined || !ID_CHAR.test(after))) {
      return true
    }
    from = message.indexOf(id, from + 1)
  }
  return false
}

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
  return { competitions, bottlenecks, analysis: analysis.warnings, validationRules }
}

function checkInvariants(
  b: Bottleneck,
  competitionIds: string[],
  validationRules: Set<string>,
): void {
  const where = `${b.cause} "${b.message}"`
  expect(b.rule, `rule of ${where}`).toMatch(KEBAB_CASE)
  const catalogue = new Set<string>(Object.values(BottleneckRule))
  expect(catalogue.has(b.rule) || validationRules.has(b.rule), `unknown rule ${b.rule}`).toBe(true)

  for (const s of b.subjects) expect(typeof s, `subject of ${where}`).toBe('string')
  expect(b.subjects, `subjects of ${where}`).toEqual([...new Set(b.subjects)].sort())
  expect(['', ...b.subjects], `owner of ${where}`).toContain(b.competition_id)

  const named = competitionIds.filter(id => namesCompetition(b.message, id))
  for (const id of named) expect(b.subjects, `${id} named by ${where}`).toContain(id)
  for (const s of b.subjects) {
    if (competitionIds.includes(s)) expect(namesCompetition(b.message, s), `${s} in ${where}`).toBe(true)
  }
}

describe('Bottleneck rule and subjects invariants', () => {
  const scenarios = Object.fromEntries(SCENARIO_IDS.map(id => [id, runScenario(id)]))

  for (const id of SCENARIO_IDS) {
    it(`scheduleAll bottlenecks of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, bottlenecks, validationRules } = scenarios[id]
      const ids = competitions.map(c => c.id)
      for (const b of bottlenecks) checkInvariants(b, ids, validationRules)
    })

    it(`initialAnalysis warnings of ${id} carry a rule and the competitions they name`, () => {
      const { competitions, analysis, validationRules } = scenarios[id]
      const ids = competitions.map(c => c.id)
      for (const b of analysis) checkInvariants(b, ids, validationRules)
    })
  }

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
