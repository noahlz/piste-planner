import { crossoverPenalty, isAgeBandedVet, vetBandRank } from './crossover.ts'
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
 * same-day separations (via `crossoverPenalty`), the regional Group 1 window
 * and the Vet co-day (`vetCoDaySplitFindings`). The checks are independent, so
 * a pair can carry both a hard and a window finding.
 * `labelOf` names events in messages (default: the id). The caller filters
 * out unplaced and out-of-range events. A placed id with no competition is
 * skipped. Output is sorted by day, then subjects, then rule, and a split
 * co-day, which has no day, sorts as day 0.
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

  const dayById = new Map(known.map(p => [p.competition_id, p.day]))
  findings.push(...vetCoDaySplitFindings(competitions, id => dayById.get(id), labelOf))

  const key = (f: Bottleneck) => f.subjects.join(',')
  return findings.sort(
    (a, b) =>
      (a.day ?? 0) - (b.day ?? 0) || cmp(key(a), key(b)) || cmp(a.rule, b.rule),
  )
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * A split Vet co-day (METHODOLOGY §Veteran Age-Group Co-Day Rule, 021 default
 * 9): one WARN per gender and weapon whose age-banded Veteran individual
 * events sit on more than one day. A pin or the least-bad fallback causes it.
 * `dayOf` is the final day map, pins included, and an event it gives no day is
 * left out. The finding names every band of that gender and weapon that has a
 * day, oldest first (`VET_BANDS_OLDEST_FIRST`) with its 1-based day, and is
 * owned by the oldest. It has no `day`, since it spans several. The scheduler
 * calls it over its day map and `checkPlacementRules` over the board's placed
 * days, so the two apply one rule to their own input: the scheduler counts an
 * event that has a day but later fails to place, while the board leaves out
 * every unplaced event. Output is sorted by subjects. One pass over
 * `competitions` and one over each group – the only loop bounds.
 */
export function vetCoDaySplitFindings(
  competitions: Competition[],
  dayOf: (competitionId: string) => number | undefined,
  labelOf: (competition: Competition) => string = c => c.id,
): Bottleneck[] {
  const groups = new Map<string, { competition: Competition; day: number; rank: number }[]>()
  for (const c of competitions) {
    if (!isAgeBandedVet(c)) continue
    const day = dayOf(c.id)
    if (day === undefined) continue
    const key = `${c.gender}|${c.weapon}`
    const group = groups.get(key) ?? []
    group.push({ competition: c, day, rank: vetBandRank(c.vet_age_group) })
    groups.set(key, group)
  }

  const findings: Bottleneck[] = []
  for (const group of groups.values()) {
    if (new Set(group.map(g => g.day)).size < 2) continue
    const oldestFirst = [...group].sort(
      (a, b) => a.rank - b.rank || cmp(a.competition.id, b.competition.id),
    )
    const bands = oldestFirst.map(g => `${labelOf(g.competition)} on Day ${g.day + 1}`).join(', ')
    findings.push({
      competition_id: oldestFirst[0].competition.id,
      phase: Phase.DAY_ASSIGNMENT,
      cause: BottleneckCause.VET_CO_DAY_SPLIT,
      rule: BottleneckRule.VET_CO_DAY_SPLIT,
      subjects: group.map(g => g.competition.id).sort(),
      severity: BottleneckSeverity.WARN,
      delay_mins: 0,
      message: `The age-banded Veteran events of one gender and weapon are split across days: ${bands}`,
    })
  }
  return findings.sort((a, b) => cmp(a.subjects.join(','), b.subjects.join(',')))
}
