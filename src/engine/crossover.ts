import type { Category, Competition, ScheduleResult } from './types.ts'
import { Category as CategoryEnum, EventType, VetAgeGroup } from './types.ts'
import {
  CROSSOVER_GRAPH,
  GROUP_1_MANDATORY,
  PENALTY_WEIGHTS,
  PROXIMITY_GRAPH,
  PROXIMITY_PENALTY_WEIGHTS,
} from './constants.ts'

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

function isGroup1Mandatory(a: Category, b: Category): boolean {
  return GROUP_1_MANDATORY.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  )
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
 * Returns the penalty for scheduling two competitions on the same day.
 * Returns Infinity when the pairing would be a hard conflict.
 *
 * Hard-conflict checks in order:
 *   1. Same-population (same category+gender+weapon, Vet-aware).
 *   2. VET_COMBINED ↔ age-banded Vet ind (same gender+weapon): fencers typically
 *      enter both, so they must be on different days.
 *   3. GROUP_1_MANDATORY pairs (checked before PENALTY_MATRIX because some
 *      mandatory pairs, e.g. Div1↔Div1A, have no edge in CROSSOVER_GRAPH).
 */
export function crossoverPenalty(c1: CompFields, c2: CompFields): number {
  if (isSamePopulation(c1, c2)) return Infinity
  if (isVetCombinedAgeBandedBlock(c1, c2)) return Infinity
  if (c1.gender !== c2.gender) return 0.0
  if (c1.weapon !== c2.weapon) return 0.0

  if (isGroup1Mandatory(c1.category, c2.category)) return Infinity

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
