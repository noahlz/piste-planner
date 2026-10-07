import { crossoverPenalty } from './crossover.ts'
import { GROUP_1_MANDATORY, GROUP_1_SOFT_TYPES, REGIONAL_GROUP_1_WINDOW_MINS } from './constants.ts'
import {
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  Phase,
  formatClockMins,
} from './types.ts'
import type { Bottleneck, Competition, TournamentType } from './types.ts'

/**
 * One hand-placed event. `day` is the store's 0-based day, `pool_start` is on
 * the clock axis (minutes from midnight of that day), and a flighted event
 * carries flight A's start.
 */
export type PlacedEvent = { competition_id: string; day: number; pool_start: number }

/**
 * Judges hand placements against the same rules the scheduler enforces: hard
 * same-day separations (via `crossoverPenalty`) and the regional Group 1
 * window. The two checks are independent, so a pair can carry both findings.
 * `labelOf` names events in messages (default: the id). The caller filters
 * out unplaced and out-of-range events. A placed id with no competition is
 * skipped. Output is sorted by day, then subjects, then rule.
 */
export function checkPlacementRules(
  competitions: Competition[],
  placed: PlacedEvent[],
  tournamentType: TournamentType,
  dayStartClock: (day: number) => number,
  labelOf: (competition: Competition) => string = c => c.id,
): Bottleneck[] {
  const byId = new Map(competitions.map(c => [c.id, c]))
  const known = placed.filter(p => byId.has(p.competition_id))
  const windowApplies = GROUP_1_SOFT_TYPES.has(tournamentType)
  const findings: Bottleneck[] = []

  // O(n²) over the placements – the only loop bound.
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const p1 = known[i]
      const p2 = known[j]
      if (p1.day !== p2.day) continue
      const c1 = byId.get(p1.competition_id)!
      const c2 = byId.get(p2.competition_id)!
      const day = p1.day
      const subjects = [c1.id, c2.id].sort()
      const [first, second] = subjects.map(id => labelOf(byId.get(id)!))

      if (crossoverPenalty(c1, c2, tournamentType) === Infinity) {
        findings.push({
          competition_id: subjects[0],
          phase: Phase.DAY_ASSIGNMENT,
          cause: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
          rule: BottleneckRule.HARD_SEPARATION_VIOLATED,
          subjects,
          severity: BottleneckSeverity.WARN,
          delay_mins: 0,
          day,
          message: `${first} and ${second} are both on Day ${day + 1}: they may never share a day`,
        })
      }

      if (!windowApplies || c1.gender !== c2.gender || c1.weapon !== c2.weapon) continue
      const pairs: [Competition, PlacedEvent, Competition, PlacedEvent][] = [
        [c1, p1, c2, p2],
        [c2, p2, c1, p1],
      ]
      for (const [older, op, younger, yp] of pairs) {
        if (!GROUP_1_MANDATORY.some(m => m.older === older.category && m.younger === younger.category)) continue
        const floor = dayStartClock(day) + REGIONAL_GROUP_1_WINDOW_MINS
        const honoured = op.pool_start >= floor && yp.pool_start < floor
        const starts =
          `${labelOf(younger)} starts at ${formatClockMins(yp.pool_start)} and ${labelOf(older)}'s pools at ` +
          `${formatClockMins(op.pool_start)}, window floor ${formatClockMins(floor)}`
        const shared = `${labelOf(older)} and ${labelOf(younger)} share Day ${day + 1}`
        findings.push({
          competition_id: older.id,
          phase: Phase.SEQUENCING,
          cause: BottleneckCause.SEQUENCING_CONSTRAINT,
          rule: honoured ? BottleneckRule.REGIONAL_WINDOW_HONOURED : BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
          subjects,
          severity: honoured ? BottleneckSeverity.INFO : BottleneckSeverity.WARN,
          delay_mins: 0,
          day,
          message: honoured
            ? `${shared} inside the regional Group 1 window: ${starts}`
            : `${shared} and the regional Group 1 window is not honoured: ${starts}`,
        })
      }
    }
  }

  const key = (f: Bottleneck) => f.subjects.join(',')
  return findings.sort(
    (a, b) =>
      (a.day ?? 0) - (b.day ?? 0) || cmp(key(a), key(b)) || cmp(a.rule, b.rule),
  )
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
