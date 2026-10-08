import type { Category, Competition, ScheduleResult } from './types.ts'
import { Category as CategoryEnum, EventType, TournamentType, VetAgeGroup } from './types.ts'
import {
  CROSSOVER_GRAPH,
  DIV1_DIV1A_HARD_PAIR,
  GROUP_1_MANDATORY,
  GROUP_1_SOFT_TYPES,
  GROUP_2_SOFT_SEPARATIONS,
  INDIV_TEAM_CROSS_LEVEL_BLOCKS,
  PENALTY_WEIGHTS,
  PROXIMITY_GRAPH,
  PROXIMITY_PENALTY_WEIGHTS,
  SOFT_SEPARATION_PAIRS,
} from './constants.ts'
import type { Group2Side } from './constants.ts'

// ──────────────────────────────────────────────
// Penalty matrix
// ──────────────────────────────────────────────

function pairKey(a: Category, b: Category): string {
  return `${a}|${b}`
}

/**
 * Builds a symmetric penalty matrix from the crossover graph.
 * Direct edges are taken as-is; indirect (two-hop) edges are capped at 0.3.
 */
export function buildPenaltyMatrix(
  graph: Record<Category, Partial<Record<Category, number>>>,
): Map<string, number> {
  const matrix = new Map<string, number>()

  // Pass 1: direct edges
  for (const [a, neighbours] of Object.entries(graph) as [Category, Partial<Record<Category, number>>][]) {
    for (const [b, w] of Object.entries(neighbours) as [Category, number][]) {
      matrix.set(pairKey(a, b), w)
      matrix.set(pairKey(b, a), w)
    }
  }

  // Pass 2: two-hop indirect edges, capped at 0.3
  const categories = Object.keys(graph) as Category[]
  for (const a of categories) {
    const neighboursA = graph[a]
    for (const [b, wAB] of Object.entries(neighboursA) as [Category, number][]) {
      const neighboursB = graph[b] ?? {}
      for (const [c, wBC] of Object.entries(neighboursB) as [Category, number][]) {
        if (c === a) continue
        if (matrix.has(pairKey(a, c))) continue
        const indirect = Math.min(wAB * wBC, 0.3)
        matrix.set(pairKey(a, c), indirect)
        matrix.set(pairKey(c, a), indirect)
      }
    }
  }

  return matrix
}

// Built once at module level
const PENALTY_MATRIX = buildPenaltyMatrix(CROSSOVER_GRAPH)

// ──────────────────────────────────────────────
// Crossover penalty
// ──────────────────────────────────────────────

type CompFields = Pick<Competition, 'id' | 'category' | 'gender' | 'weapon' | 'event_type' | 'vet_age_group'>

const KNOWN_TOURNAMENT_TYPES: ReadonlySet<string> = new Set<string>(Object.values(TournamentType))

/** Unordered category-pair match. */
function isPair(a: Category, b: Category, x: Category, y: Category): boolean {
  return (x === a && y === b) || (x === b && y === a)
}

/** A Group 1 pair by category alone, for any mix of individual and team events (024 D10). */
function isGroup1Pair(a: Category, b: Category): boolean {
  return GROUP_1_MANDATORY.some(({ older, younger }) => isPair(a, b, older, younger))
}

/**
 * True when one event is the individual and the other the team of an
 * INDIV_TEAM_CROSS_LEVEL_BLOCKS pair (METHODOLOGY §Individual/Team Separation).
 * The caller has already matched weapon and gender. Checked before Group 1, so
 * these stay Infinity at every type, including the regional types where Group 1
 * is soft, and nothing in day assignment lowers them.
 */
function isIndivTeamCrossLevelBlock(c1: CompFields, c2: CompFields): boolean {
  if (c1.event_type === c2.event_type) return false
  const [indiv, team] = c1.event_type === EventType.INDIVIDUAL ? [c1, c2] : [c2, c1]
  return INDIV_TEAM_CROSS_LEVEL_BLOCKS.some(
    ({ indivCategory, teamCategory }) => indiv.category === indivCategory && team.category === teamCategory,
  )
}

/**
 * The soft-separation penalty for a pair, or `undefined` when the pair is not
 * listed (METHODOLOGY §Other Soft Preferences, `SOFT_SEPARATION_PAIRS` in
 * `constants.ts`). The table holds only DIV1↔DIV2 and DIV1↔DIV3, both at 3.0 –
 * DIV1↔CADET is a Group 1 pair (`GROUP_1_MANDATORY`) and is not looked up here.
 *
 * These are policy numbers, not crossover fractions, which is why they live in
 * their own table rather than in `CROSSOVER_GRAPH`: that graph means "fraction
 * of fencers in category A who also compete in B", capped at 0.8, and it feeds
 * `buildPenaltyMatrix`'s two-hop derivation. 3.0 is neither a fraction nor
 * something to derive indirect edges from.
 */
function softSeparationPenalty(a: Category, b: Category): number | undefined {
  return SOFT_SEPARATION_PAIRS.find(
    ({ pair: [x, y] }) => (x === a && y === b) || (x === b && y === a),
  )?.penalty
}

/**
 * The Group 2 soft-separation penalty for a pair, or `undefined` when no
 * GROUP_2_SOFT_SEPARATIONS row matches (Ops Manual p.20 – Group 2, METHODOLOGY
 * §Other Soft Preferences). The caller has already matched weapon and gender.
 * A side matches on category and, where it names one, event type, in either
 * argument order.
 */
function group2SoftSeparationPenalty(c1: CompFields, c2: CompFields): number | undefined {
  const matches = (c: CompFields, side: Group2Side) =>
    side.categories.includes(c.category) && (side.eventType === null || side.eventType === c.event_type)
  return GROUP_2_SOFT_SEPARATIONS.find(
    ({ sides: [x, y] }) => (matches(c1, x) && matches(c2, y)) || (matches(c1, y) && matches(c2, x)),
  )?.penalty
}

/**
 * Same-population check (METHODOLOGY §Same-Population Conflicts).
 *
 * Two competitions are same-population (must NOT share a day, hard at every
 * relaxation level) when they share category + gender + weapon, with one
 * Veteran-specific refinement:
 *
 * - For non-Veteran categories: same category + gender + weapon is enough.
 * - For Veteran categories: "category" is the (VETERAN, vet_age_group) pair.
 *   - ind+ind or team+team → same-population only if vet_age_group matches.
 *   - ind+team → always same-population (the team event spans all Vet age
 *     groups, so a Vet team cannot share a day with any Vet individual of
 *     the same gender+weapon).
 */
function isSamePopulation(c1: CompFields, c2: CompFields): boolean {
  if (c1.category !== c2.category) return false
  if (c1.gender !== c2.gender) return false
  if (c1.weapon !== c2.weapon) return false

  if (c1.category === CategoryEnum.VETERAN) {
    // ind+team always blocks: Vet team spans every Vet age group.
    if (c1.event_type !== c2.event_type) return true
    // ind+ind or team+team: must share vet_age_group to be same population.
    return c1.vet_age_group === c2.vet_age_group
  }

  return true
}

const VET_AGE_BANDED: ReadonlySet<VetAgeGroup> = new Set([
  VetAgeGroup.VET40,
  VetAgeGroup.VET50,
  VetAgeGroup.VET60,
  VetAgeGroup.VET70,
  VetAgeGroup.VET80,
])

/**
 * Hard-blocks a VET_COMBINED individual event from sharing a day with any
 * age-banded Veteran individual event (VET40–VET80) of the same gender and weapon.
 *
 * Fencers typically enter their primary age-banded event AND VET_COMBINED, so
 * those two must NOT share a day. The check is order-symmetric and does not
 * fire for team events or for cross-gender / cross-weapon pairs.
 */
function isVetCombinedAgeBandedBlock(c1: CompFields, c2: CompFields): boolean {
  if (c1.category !== CategoryEnum.VETERAN) return false
  if (c2.category !== CategoryEnum.VETERAN) return false
  if (c1.event_type !== EventType.INDIVIDUAL) return false
  if (c2.event_type !== EventType.INDIVIDUAL) return false
  if (c1.gender !== c2.gender) return false
  if (c1.weapon !== c2.weapon) return false

  const c1IsCombined = c1.vet_age_group === VetAgeGroup.VET_COMBINED
  const c2IsCombined = c2.vet_age_group === VetAgeGroup.VET_COMBINED
  const c1IsAgeBanded = c1.vet_age_group !== null && VET_AGE_BANDED.has(c1.vet_age_group)
  const c2IsAgeBanded = c2.vet_age_group !== null && VET_AGE_BANDED.has(c2.vet_age_group)

  return (c1IsCombined && c2IsAgeBanded) || (c2IsCombined && c1IsAgeBanded)
}

/**
 * Returns the penalty for scheduling two competitions on the same day at a
 * tournament of `tournamentType`. Returns Infinity when the pairing would be a
 * hard conflict. Throws on an unknown tournament type, whatever the pair.
 *
 * Hard-conflict checks in order, all at every type:
 *   1. Same-population (same category+gender+weapon, Vet-aware).
 *   2. VET_COMBINED ↔ age-banded Vet ind (same gender+weapon): fencers typically
 *      enter both, so they must be on different days.
 *   3. INDIV_TEAM_CROSS_LEVEL_BLOCKS (Div 1 ind ↔ Junior team, Junior ind ↔ Div 1
 *      team), before Group 1 so they stay hard where Group 1 is soft.
 *   4. DIV1_DIV1A_HARD_PAIR (Appendix B departure).
 *
 * Then the Group 1 pairs (Ops Manual p.20 – Group 1): Infinity at NAC, SYC and
 * SJCC, and REGIONAL_GROUP_1_PAIR at the GROUP_1_SOFT_TYPES (METHODOLOGY
 * §Overlapping-Population Separation (Group 1)). Checked before PENALTY_MATRIX,
 * whose 0.8 edges would otherwise score these pairs.
 *
 * Then SOFT_SEPARATION_PAIRS, which is soft (finite) but overrides the matrix:
 * a listed pair takes its stated penalty whether or not CROSSOVER_GRAPH has an
 * edge for it. Placed AFTER the Group 1 test so a Group 1 pair keeps its Group 1
 * value, and BEFORE PENALTY_MATRIX so the specified value wins over the graph's
 * (research.md D6).
 *
 * Then GROUP_2_SOFT_SEPARATIONS (Ops Manual p.20 – Group 2), on the same terms:
 * after every block and Group 1, so a pair they already separate stays as it
 * is, and before PENALTY_MATRIX, whose 0.8 DIV2↔DIV3 edge it overrides.
 */
export function crossoverPenalty(c1: CompFields, c2: CompFields, tournamentType: TournamentType): number {
  if (!KNOWN_TOURNAMENT_TYPES.has(tournamentType)) {
    throw new Error(`crossoverPenalty: unknown tournament type ${String(tournamentType)}`)
  }

  if (isSamePopulation(c1, c2)) return Infinity
  if (isVetCombinedAgeBandedBlock(c1, c2)) return Infinity
  if (c1.gender !== c2.gender) return 0.0
  if (c1.weapon !== c2.weapon) return 0.0

  if (isIndivTeamCrossLevelBlock(c1, c2)) return Infinity
  if (isPair(c1.category, c2.category, ...DIV1_DIV1A_HARD_PAIR)) return Infinity

  if (isGroup1Pair(c1.category, c2.category)) {
    return GROUP_1_SOFT_TYPES.has(tournamentType) ? PENALTY_WEIGHTS.REGIONAL_GROUP_1_PAIR : Infinity
  }

  const softPenalty = softSeparationPenalty(c1.category, c2.category)
  if (softPenalty !== undefined) return softPenalty

  const group2Penalty = group2SoftSeparationPenalty(c1, c2)
  if (group2Penalty !== undefined) return group2Penalty

  return PENALTY_MATRIX.get(pairKey(c1.category, c2.category)) ?? 0.0
}

// ──────────────────────────────────────────────
// Proximity weight lookup
// ──────────────────────────────────────────────

/** Returns the proximity preference weight for two categories (0.0 if not in the graph). */
export function getProximityWeight(cat1: Category, cat2: Category): number {
  // VETERAN↔VETERAN is a self-pair entry in the graph
  for (const { cat1: a, cat2: b, weight } of PROXIMITY_GRAPH) {
    if ((cat1 === a && cat2 === b) || (cat1 === b && cat2 === a)) return weight
  }
  return 0.0
}

// ──────────────────────────────────────────────
// Proximity penalty
// ──────────────────────────────────────────────

/**
 * Returns the total proximity penalty for scheduling `competition` on `proposedDay`
 * relative to already-scheduled competitions.
 *
 * Negative values are bonuses (preferred scheduling distance).
 */
export function proximityPenalty(
  competition: CompFields,
  proposedDay: number,
  schedule: Record<string, ScheduleResult>,
  competitions: Competition[],
): number {
  let total = 0.0

  for (const c2 of competitions) {
    if (c2.id === competition.id) continue
    if (c2.gender !== competition.gender) continue
    if (c2.weapon !== competition.weapon) continue

    const sr = schedule[c2.id]
    if (!sr) continue

    const proxWeight = getProximityWeight(competition.category, c2.category)
    if (proxWeight === 0.0) continue

    const dayGap = Math.abs(proposedDay - sr.assigned_day)
    if (dayGap === 0) continue

    // Clamp day gap at 3 for the weights table lookup
    const clampedGap = Math.min(dayGap, 3)
    const rawPenalty = PROXIMITY_PENALTY_WEIGHTS[clampedGap] * proxWeight
    total += rawPenalty
  }

  return total
}

// ──────────────────────────────────────────────
// Individual/team proximity
// ──────────────────────────────────────────────

export function findIndividualCounterpart(
  competition: Competition,
  competitions: Competition[],
): Competition | undefined {
  return competitions.find(
    c =>
      c.id !== competition.id &&
      c.category === competition.category &&
      c.gender === competition.gender &&
      c.weapon === competition.weapon &&
      c.event_type === EventType.INDIVIDUAL,
  )
}

/**
 * For a TEAM competition, returns a scheduling incentive/penalty based on
 * how far the individual counterpart is from the proposed day.
 *
 * - gap=+1 (team day after individual): -0.4 bonus (ideal ordering)
 * - gap=0 (same day): 0.0 (handled elsewhere)
 * - gap=-1 (team before individual): 1.0 penalty (wrong order)
 * - |gap|>=2 (too far apart in either direction): 0.3 penalty
 */
export function individualTeamProximityPenalty(
  competition: Competition,
  proposedDay: number,
  schedule: Record<string, ScheduleResult>,
  competitions: Competition[],
): number {
  if (competition.event_type !== EventType.TEAM) return 0.0

  const ind = findIndividualCounterpart(competition, competitions)
  if (!ind) return 0.0

  const sr = schedule[ind.id]
  if (!sr) return 0.0

  const gap = proposedDay - sr.assigned_day

  if (gap === 1) return PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER
  if (gap === 0) return 0.0
  if (gap === -1) return PENALTY_WEIGHTS.TEAM_BEFORE_INDIVIDUAL
  // |gap| >= 2: too far apart in either direction
  return PENALTY_WEIGHTS.INDIV_TEAM_2_PLUS_DAYS
}
