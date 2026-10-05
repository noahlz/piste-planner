import { expect } from 'vitest'
import { BottleneckCause, BottleneckRule, Phase } from '../../src/engine/types.ts'
import type { Bottleneck } from '../../src/engine/types.ts'

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/
const ID_CHAR = /[A-Za-z0-9_-]/

/**
 * The cause each engine-native rule is reported under. Typed as a full record
 * so adding a `BottleneckRule` without a row here fails the typecheck, and a
 * swap of ids across causes fails the oracle.
 */
export const CAUSE_OF_RULE: Record<BottleneckRule, BottleneckCause> = {
  [BottleneckRule.PER_EVENT_EXCLUSION_SUMMARY]: BottleneckCause.RESOURCE_EXHAUSTION,
  [BottleneckRule.DAY_ASSIGNMENT_RELAXED]: BottleneckCause.CONSTRAINT_RELAXED,
  [BottleneckRule.HARD_SEPARATION_VIOLATED]: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
  [BottleneckRule.PINNED_PHASE_UNCLAIMED]: BottleneckCause.PINNED_UNCLAIMED,
  [BottleneckRule.CROSS_EVENT_DEPENDENCY_DELAY]: BottleneckCause.SEQUENCING_CONSTRAINT,
  [BottleneckRule.PHASE_DEFERRED]: BottleneckCause.NO_WINDOW_DIAGNOSTIC,
  [BottleneckRule.STRIP_CONTENTION_DEFERRAL]: BottleneckCause.STRIP_CONTENTION,
  [BottleneckRule.FIRST_ATTEMPT_FAILED]: BottleneckCause.DEADLINE_BREACH,
  [BottleneckRule.EVENT_UNSCHEDULED]: BottleneckCause.DEADLINE_BREACH_UNRESOLVABLE,
  [BottleneckRule.PHASE_OVERRUNS_DAY_END]: BottleneckCause.SAME_DAY_VIOLATION,
  [BottleneckRule.VIDEO_PHASE_DELAYED]: BottleneckCause.VIDEO_STRIP_CONTENTION,
  [BottleneckRule.FLIGHT_B_DELAYED]: BottleneckCause.FLIGHT_B_DELAYED,
  [BottleneckRule.FIRST_DAY_LONGER_THAN_MIDDLE]: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
  [BottleneckRule.LAST_DAY_LONGER_THAN_MIDDLE]: BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
  [BottleneckRule.RESOURCE_LEVERS]: BottleneckCause.RESOURCE_RECOMMENDATION,
  [BottleneckRule.DAY_STRIP_HOURS_SUMMARY]: BottleneckCause.DAY_RESOURCE_SUMMARY,
  [BottleneckRule.DAY_REF_PEAK_SUMMARY]: BottleneckCause.DAY_RESOURCE_SUMMARY,
  [BottleneckRule.DAY_VIDEO_DE_REF_SUMMARY]: BottleneckCause.DAY_RESOURCE_SUMMARY,
  [BottleneckRule.DAY_POOLS_EXCEED_STRIPS]: BottleneckCause.STRIP_CONTENTION,
  [BottleneckRule.POOLS_EXCEED_STRIP_CAP_UNFLIGHTED]: BottleneckCause.STRIP_DEFICIT_NO_FLIGHTING,
  [BottleneckRule.MULTIPLE_FLIGHTED_SAME_DAY]: BottleneckCause.MULTIPLE_FLIGHTED_SAME_DAY,
  [BottleneckRule.DAY_VIDEO_DEMAND_EXCEEDS_VIDEO_STRIPS]: BottleneckCause.VIDEO_STRIP_CONTENTION,
  [BottleneckRule.FLIGHTING_GROUP_BOTH_VIDEO]: BottleneckCause.VIDEO_STRIP_CONTENTION,
  [BottleneckRule.CUT_SUMMARY]: BottleneckCause.CUT_SUMMARY,
  [BottleneckRule.FLIGHTING_PRIORITY_TIE]: BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
  [BottleneckRule.FLIGHTED_NOT_LARGEST]: BottleneckCause.FLIGHTING_GROUP_NOT_LARGEST,
  [BottleneckRule.FLIGHTING_GROUP_CROSSOVER_PENALTY]: BottleneckCause.SAME_DAY_DEMOGRAPHIC_CONFLICT,
}

/** True when `id` appears in `message` as a whole token, not inside a longer id. */
export function namesCompetition(message: string, id: string): boolean {
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

const CATALOGUE = new Set<string>(Object.values(BottleneckRule))

/**
 * Shape, owner, subjects <-> message, and rule <-> cause checks for one
 * bottleneck. `validationRules` are the ids `validateConfig` produced for the
 * same inputs, which a validation-derived bottleneck may carry.
 */
export function checkInvariants(
  b: Bottleneck,
  competitionIds: string[],
  validationRules: Set<string>,
): void {
  const where = `${b.cause} "${b.message}"`
  expect(b.rule, `rule of ${where}`).toMatch(KEBAB_CASE)
  expect(CATALOGUE.has(b.rule) || validationRules.has(b.rule), `unknown rule ${b.rule}`).toBe(true)

  if (CATALOGUE.has(b.rule)) {
    expect(b.cause, `cause of rule ${b.rule}`).toBe(CAUSE_OF_RULE[b.rule as BottleneckRule])
  } else {
    expect(b.cause, `cause of validation-derived ${b.rule}`).toBe(BottleneckCause.RESOURCE_EXHAUSTION)
    expect(b.phase, `phase of validation-derived ${b.rule}`).toBe(Phase.VALIDATION)
  }

  for (const s of b.subjects) expect(typeof s, `subject of ${where}`).toBe('string')
  expect(b.subjects, `subjects of ${where}`).toEqual([...new Set(b.subjects)].sort())
  expect(['', ...b.subjects], `owner of ${where}`).toContain(b.competition_id)

  const named = competitionIds.filter(id => namesCompetition(b.message, id))
  for (const id of named) expect(b.subjects, `${id} named by ${where}`).toContain(id)
  for (const s of b.subjects) {
    if (competitionIds.includes(s)) expect(namesCompetition(b.message, s), `${s} in ${where}`).toBe(true)
  }
}
