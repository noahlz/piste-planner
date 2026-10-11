/**
 * DSatur graph coloring for tournament day assignment, one pass over every
 * day the organizer chose.
 *
 * DSatur is a greedy graph-coloring heuristic that always colors the vertex
 * with the highest "saturation degree" next – that is, the uncolored vertex
 * whose already-colored neighbors use the most distinct colors. This
 * prioritizes the most constrained events first, and ties are broken by
 * hard-edge degree then by packing footprint (strips × category weight).
 *
 * Tournament day assignment maps directly to graph coloring: events are
 * vertices, scheduling conflicts are edges, and days are colors. Hard edges
 * (weight === Infinity) block a color outright, so hard constraints are
 * guaranteed by construction rather than relying on penalty dominance. Soft
 * edges contribute penalties that steer the heuristic toward better schedules
 * without forbidding any assignment. For realistic tournament sizes (n <= 54
 * events), the O(n³) runtime is negligible.
 *
 * Standard DSatur looks for the fewest colours. Here the colour count is not
 * searched for: it is the organizer's `days_available`, and one pass colours
 * every event over all of those days (METHODOLOGY.md §Day Count). Load
 * balancing spreads the events across them – every event already on a day
 * adds a flat cost, and a day's capacity penalty rises with its fill ratio
 * (strip-hours / day capacity). From 3 days up the first and last colours hold
 * 0.8 of a middle day's capacity (Ops Manual p.20 – Group 2).
 *
 * 021 removed a "fewest days" pass that ran before this one. It ran at
 * `days_available` with the soft terms on, so on B1–B8 at 2–4 days it
 * returned every chosen day (at 5 days B5, B7 and RJCC Weekend got 4), and no
 * target fill after it changed a board (audit CAL-P1, CAL-CAP).
 *
 * References:
 *   - DSatur algorithm: https://en.wikipedia.org/wiki/DSatur
 *   - Graph coloring concepts: https://www.youtube.com/watch?v=h9wxtqoa1jY
 */

import type { Competition, TournamentConfig, PinnedPlacement } from './types.ts'
import { Category, EventType, VetAgeGroup, Weapon } from './types.ts'
import { saberPileupPenalty } from './dayAssignment.ts'
import type { ConstraintGraph } from './constraintGraph.ts'
import { categoryWeight, estimateCompetitionStripHours } from './capacity.ts'
import { getProximityWeight, findIndividualCounterpart } from './crossover.ts'
import {
  REST_DAY_PAIRS,
  SAME_DAY_BONUS_PAIRS,
  PENALTY_WEIGHTS,
  CAPACITY_PENALTY_CURVE,
  FIRST_LAST_DAY_CAPACITY_FACTOR,
} from './constants.ts'

// ──────────────────────────────────────────────
// Load-balancing constants
// ──────────────────────────────────────────────

/**
 * Per-event base cost for adding to an already-used day. Provides uniform
 * spread pressure when capacity fill is low. Matches the pre-Stage-5 flat
 * load balance so small tournaments that never saturate capacity behave the
 * same as before.
 */
const LOAD_BALANCE_FULLNESS = 0.5

/**
 * Capacity penalty for a candidate day's fill ratio. Exported for unit tests.
 *
 * We only penalize approaching / past 100% fill. Earlier-triggering curves
 * (starting at 60% fill) over-steered events in mid-loaded days and caused
 * regressions in large multi-day tournaments where several days naturally
 * land in the 0.6-0.8 range. Keeping the ramp near 1.0 targets the actual
 * failure mode: packing a day past its raw strip-hour capacity.
 */
export function capacityPenalty(fillRatio: number): number {
  if (fillRatio <= 0.85) return 0
  if (fillRatio <= 1.0) {
    // Linear ramp 0.85 → 1.0 mapping to 0 → 3.0
    return (fillRatio - 0.85) / 0.15 * 3.0
  }
  // Past capacity: strong push. OVERFLOW_PENALTY provides upper cap.
  return Math.min(CAPACITY_PENALTY_CURVE.OVERFLOW_PENALTY, 3.0 + (fillRatio - 1.0) * 10.0)
}

/**
 * Share of a middle day's strip-hours colour `color` gets in an `nDays`-colour
 * pass: FIRST_LAST_DAY_CAPACITY_FACTOR for colours 0 and nDays − 1 from 3 days
 * up, 1 otherwise (Ops Manual p.20 – Group 2; METHODOLOGY.md §First and Last
 * Day Capacity). Exported for unit tests.
 */
export function dayCapacityFactor(color: number, nDays: number): number {
  if (nDays < 3) return 1
  return color === 0 || color === nDays - 1 ? FIRST_LAST_DAY_CAPACITY_FACTOR : 1
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/** Returns the number of distinct colors among hard-edge neighbors. */
function saturationDegree(
  id: string,
  graph: ConstraintGraph,
  coloring: Map<string, number>,
): number {
  const edges = graph.get(id) ?? []
  const neighborColors = new Set<number>()
  for (const edge of edges) {
    if (edge.weight === Infinity) {
      const c = coloring.get(edge.targetId)
      if (c !== undefined) neighborColors.add(c)
    }
  }
  return neighborColors.size
}

/** Returns the number of hard-edge neighbors (graph degree for tie-breaking). */
function hardEdgeDegree(id: string, graph: ConstraintGraph): number {
  const edges = graph.get(id) ?? []
  return edges.filter(e => e.weight === Infinity).length
}

/**
 * Checks if any REST_DAY_PAIRS pair applies between this competition and a
 * same-gender, same-weapon competition colored on an adjacent day.
 */
function isRestDayPair(cat1: Competition['category'], cat2: Competition['category']): boolean {
  return REST_DAY_PAIRS.some(
    ([a, b]) => (a === cat1 && b === cat2) || (a === cat2 && b === cat1),
  )
}

/**
 * Returns the proximity weight for a category pair (0.0 if not in PROXIMITY_GRAPH).
 * Delegates to getProximityWeight from crossover.ts.
 */
function proximityWeight(cat1: Competition['category'], cat2: Competition['category']): number {
  return getProximityWeight(cat1, cat2)
}

/**
 * Individual/team ordering penalty computed from coloring state.
 *
 * For a TEAM event being colored on day `d`, finds its individual counterpart
 * (same category, gender, weapon). If the counterpart is already colored on day `d2`:
 *   gap = d - d2
 *   gap === 1  -> -0.4 bonus (ideal: team day after individual)
 *   gap === 0  ->  0.0 (same day, fine)
 *   gap === -1 ->  1.0 penalty (team before individual)
 *   |gap| >= 2 ->  0.3 penalty
 */
function individualTeamOrderingPenalty(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  if (competition.event_type !== EventType.TEAM) return 0.0

  const ind = findIndividualCounterpart(competition, competitions)
  if (!ind) return 0.0

  const indDay = coloring.get(ind.id)
  if (indDay === undefined) return 0.0

  const gap = proposedDay - indDay
  if (gap === 1) return PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER
  if (gap === 0) return 0.0
  if (gap === -1) return PENALTY_WEIGHTS.TEAM_BEFORE_INDIVIDUAL
  return PENALTY_WEIGHTS.INDIV_TEAM_2_PLUS_DAYS // |gap| >= 2
}

const VET_AGE_BANDED_GROUPS: ReadonlySet<VetAgeGroup> = new Set([
  VetAgeGroup.VET40,
  VetAgeGroup.VET50,
  VetAgeGroup.VET60,
  VetAgeGroup.VET70,
  VetAgeGroup.VET80,
])

/**
 * VET_COMBINED day-after preference (F3c).
 *
 * For a VET_COMBINED individual event being colored on `proposedDay`, finds the
 * first age-banded Vet individual sibling (same gender + weapon, vet_age_group in
 * {VET40, VET50, VET60, VET70, VET80}) that has already been colored. Per the
 * Co-Day rule (F3a), all age-banded siblings share the same day, so any colored
 * sibling represents the whole co-day group.
 *
 * Penalty map (reuses INDIV_TEAM ordering weights):
 *   gap === 1  → INDIV_TEAM_DAY_AFTER   (-0.4 bonus: VET_COMBINED on day after co-day — ideal)
 *   gap === -1 → TEAM_BEFORE_INDIVIDUAL  (1.0 penalty: VET_COMBINED before co-day)
 *   |gap| >= 2 → INDIV_TEAM_2_PLUS_DAYS  (0.3 penalty: too far apart)
 *   gap === 0  → 0.0 (defensive — blocked by F3a hard rule, but safe to handle)
 *
 * Returns 0.0 if `competition` is not VET_COMBINED ind, or if no age-banded
 * sibling has been colored yet.
 */
function vetCombinedOrderingPenalty(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  if (competition.category !== Category.VETERAN) return 0.0
  if (competition.event_type !== EventType.INDIVIDUAL) return 0.0
  if (competition.vet_age_group !== VetAgeGroup.VET_COMBINED) return 0.0

  // Find the first age-banded sibling that is already colored
  let siblingDay: number | undefined
  for (const other of competitions) {
    if (other.id === competition.id) continue
    if (other.category !== Category.VETERAN) continue
    if (other.event_type !== EventType.INDIVIDUAL) continue
    if (other.vet_age_group === null) continue
    if (!VET_AGE_BANDED_GROUPS.has(other.vet_age_group)) continue
    if (other.gender !== competition.gender) continue
    if (other.weapon !== competition.weapon) continue
    const day = coloring.get(other.id)
    if (day !== undefined) {
      siblingDay = day
      break
    }
  }

  if (siblingDay === undefined) return 0.0

  const gap = proposedDay - siblingDay
  if (gap === 1) return PENALTY_WEIGHTS.INDIV_TEAM_DAY_AFTER
  if (gap === 0) return 0.0 // defensive: F3a hard rule prevents this
  if (gap === -1) return PENALTY_WEIGHTS.TEAM_BEFORE_INDIVIDUAL
  return PENALTY_WEIGHTS.INDIV_TEAM_2_PLUS_DAYS // |gap| >= 2
}

/**
 * Group 3 cross-weapon preference (Ops Manual p.20 – Group 3, METHODOLOGY
 * §Other Soft Preferences "Cross-Weapon Same Demographic").
 *
 * For `competition` on `proposedDay`, adds CROSS_WEAPON_SAME_DEMOGRAPHIC for
 * each event already coloured on that day with the same category, gender and
 * event type in a different weapon. Every category is covered, and VETERAN
 * pairs must also share `vet_age_group`. Lives here rather than in the
 * constraint graph because `crossoverPenalty` returns 0 across weapons, so
 * these pairs have no edge.
 */
export function crossWeaponSameDemographicPenalty(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  let total = 0.0
  for (const other of competitions) {
    if (other.id === competition.id) continue
    if (coloring.get(other.id) !== proposedDay) continue
    if (other.weapon === competition.weapon) continue
    if (other.category !== competition.category) continue
    if (other.gender !== competition.gender) continue
    if (other.event_type !== competition.event_type) continue
    if (competition.category === Category.VETERAN && other.vet_age_group !== competition.vet_age_group) continue
    total += PENALTY_WEIGHTS.CROSS_WEAPON_SAME_DEMOGRAPHIC
  }
  return total
}

/** The two weapon classes of Ops Manual p.20 – Group 2: right-of-way (foil and sabre) and épée. */
const isEpee = (c: Competition): boolean => c.weapon === Weapon.EPEE

/**
 * Weapon balance (Ops Manual p.20 – Group 2, METHODOLOGY §Weapon Balance, 021
 * O4 and O7): the goal is that no day holds only one weapon class.
 *
 * Judged on `proposedDay` with `competition` added, over every event already
 * coloured there – both genders and team events count together:
 *   - the day would hold one class only (it was empty, or held that class
 *     alone)                                   → +WEAPON_BALANCE
 *   - the event brings the missing class to a day that held only the other
 *                                              → −WEAPON_BALANCE
 *   - the day already held both classes        → 0
 * The value is flat, whatever the event's size. Returns 0 when the tournament
 * (`competitions`) has no event of one class at all.
 */
export function weaponBalancePenalty(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  let tournamentHasEpee = false
  let tournamentHasRow = false
  let dayHasEpee = false
  let dayHasRow = false
  for (const other of competitions) {
    const epee = isEpee(other)
    if (epee) tournamentHasEpee = true
    else tournamentHasRow = true
    if (other.id === competition.id) continue
    if (coloring.get(other.id) !== proposedDay) continue
    if (epee) dayHasEpee = true
    else dayHasRow = true
  }
  if (!tournamentHasEpee || !tournamentHasRow) return 0

  if (dayHasEpee && dayHasRow) return 0
  const selfIsEpee = isEpee(competition)
  // The day held only the class the event lacks: the event balances it.
  if ((selfIsEpee && dayHasRow) || (!selfIsEpee && dayHasEpee)) {
    return -PENALTY_WEIGHTS.WEAPON_BALANCE
  }
  // Empty, or holding the event's own class alone: the day stays one-class.
  return PENALTY_WEIGHTS.WEAPON_BALANCE
}

/** The SAME_DAY_BONUS_PAIRS value for an unordered category pair, or 0 when it is not one. */
function sameDayBonusWeight(cat1: Category, cat2: Category): number {
  for (const [a, b, weight] of SAME_DAY_BONUS_PAIRS) {
    if ((a === cat1 && b === cat2) || (a === cat2 && b === cat1)) return weight
  }
  return 0
}

/**
 * Same-day bonus for Y8 with Y10 (021 O6, O12 – METHODOLOGY §Departures From the
 * Manual, Appendix A). Y10 with Div 3 earns nothing – the two share no fencers
 * and day assignment places them by its other terms (O15).
 *
 * For `competition` on `proposedDay`, adds the pair's (negative) weight for each
 * event already coloured on that day that forms a SAME_DAY_BONUS_PAIRS pair with
 * it in the same weapon and gender. The lookup is unordered, so the bonus is the
 * same whichever event DSatur colours first. Lives here rather than in the
 * constraint graph, which keeps no weight-0 edge.
 */
export function sameDayBonus(
  competition: Competition,
  proposedDay: number,
  competitions: Competition[],
  coloring: Map<string, number>,
): number {
  let total = 0.0
  for (const other of competitions) {
    if (other.id === competition.id) continue
    if (coloring.get(other.id) !== proposedDay) continue
    if (other.weapon !== competition.weapon) continue
    if (other.gender !== competition.gender) continue
    total += sameDayBonusWeight(competition.category, other.category)
  }
  return total
}

/**
 * Computes the soft penalty for assigning `id` color `c`, given current coloring.
 * Includes:
 *   - direct soft-edge neighbor penalties (weight !== Infinity)
 *   - rest-day penalties for adjacent days (same gender + weapon, REST_DAY_PAIRS)
 *   - proximity terms by day gap (same gender + weapon, PROXIMITY_GRAPH): a
 *     bonus at a gap of 1, nothing at 2, a penalty at 3 or more
 *   - individual/team ordering penalties
 *   - VET_COMBINED day-after preference (F3c)
 *   - the Group 3 cross-weapon preference
 *   - weapon balance (no day holds one weapon class)
 *   - the Y8↔Y10 same-day bonus
 *   - saber pileup
 *   - load balancing: a flat cost per event already on the day, plus the
 *     capacity penalty for the day's fill
 */
function colorPenalty(
  id: string,
  c: number,
  graph: ConstraintGraph,
  coloring: Map<string, number>,
  compMap: Map<string, Competition>,
  competitions: Competition[],
  stripHoursMap: Map<string, number>,
  dayCapacity: number, // a middle day's strip-hours
  nDays: number,
): number {
  const edges = graph.get(id) ?? []
  const self = compMap.get(id)!
  let total = 0.0

  for (const edge of edges) {
    const neighborColor = coloring.get(edge.targetId)
    if (neighborColor !== c) continue

    // Valid-color logic filters out hard-edge same-color days, so only soft
    // edges reach here – except in the least-bad fallback, where a hard edge
    // adds Infinity and every candidate day may tie.
    total += edge.weight
  }

  // Rest-day and proximity adjustments — graph neighbors of the same gender and
  // weapon, banded by day gap (METHODOLOGY §Rest Day Preference and §Proximity
  // Preference):
  //   gap 1     – rest-day check, plus the PROXIMITY_1_DAY bonus
  //   gap 2     – neutral, neither term
  //   gap 3+    – the PROXIMITY_3_PLUS_DAYS penalty
  // The rest-day check stays at gap 1 alone. A rest-day violation is the claim
  // that two events sit on adjacent days, and nothing wider (research.md D7).
  for (const edge of edges) {
    const neighborColor = coloring.get(edge.targetId)
    if (neighborColor === undefined) continue

    const dayGap = Math.abs(c - neighborColor)
    if (dayGap !== 1 && dayGap < 3) continue // same day and gap 2 carry no term

    const neighbor = compMap.get(edge.targetId)
    if (!neighbor) continue
    if (neighbor.gender !== self.gender) continue
    if (neighbor.weapon !== self.weapon) continue

    const proxW = proximityWeight(self.category, neighbor.category)

    if (dayGap === 1) {
      if (isRestDayPair(self.category, neighbor.category)) {
        total += PENALTY_WEIGHTS.REST_DAY_VIOLATION
      }
      if (proxW > 0) {
        total += PENALTY_WEIGHTS.PROXIMITY_1_DAY * proxW
      }
    } else if (proxW > 0) {
      total += PENALTY_WEIGHTS.PROXIMITY_3_PLUS_DAYS * proxW
    }
  }

  // Individual/team ordering
  total += individualTeamOrderingPenalty(self, c, competitions, coloring)
  // VET_COMBINED day-after preference (F3c)
  total += vetCombinedOrderingPenalty(self, c, competitions, coloring)
  // Group 3 cross-weapon preference (Ops Manual p.20 – Group 3)
  total += crossWeaponSameDemographicPenalty(self, c, competitions, coloring)
  // Weapon balance: no day holds one weapon class (Ops Manual p.20 – Group 2)
  total += weaponBalancePenalty(self, c, competitions, coloring)
  // Y8 with Y10 share a day (bonus, 021 O6, O12)
  total += sameDayBonus(self, c, competitions, coloring)

  // Saber pileup: discourage concentrating saber events on a single day, a
  // structural staffing risk (METHODOLOGY.md §Saber Pileup).
  total += saberPileupPenalty(self, c, coloring, competitions)

  // Load balancing: per-event flat cost plus staged capacity-fill penalty.
  let sumStripHours = 0
  let eventsOnDay = 0
  for (const [otherId, otherDay] of coloring) {
    if (otherDay === c) {
      sumStripHours += stripHoursMap.get(otherId) ?? 0
      eventsOnDay++
    }
  }
  total += eventsOnDay * LOAD_BALANCE_FULLNESS
  // The first and last colours hold 0.8 of a middle day from 3 days up
  // (Ops Manual p.20 – Group 2, METHODOLOGY.md §First and Last Day Capacity).
  const capacity = dayCapacity * dayCapacityFactor(c, nDays)
  if (capacity > 0) {
    total += capacityPenalty(sumStripHours / capacity)
  }

  return total
}

/**
 * Veteran Age-Group Co-Day Rule (METHODOLOGY §Veteran Age-Group Co-Day Rule).
 *
 * Binds age-banded Vet individual events (VET40–VET80, same gender + weapon)
 * to the same day. Explicitly excludes VET_COMBINED: because fencers typically
 * enter their age-banded event AND VET_COMBINED, VET_COMBINED must land on a
 * different day and must never be pulled into the co-day group.
 *
 * If `self` is an age-banded Vet individual event and a sibling age-banded Vet
 * individual event (same gender + weapon) is already colored, the sibling's day
 * is the required color for `self`. The DSatur loop restricts valid colors to
 * that day; the rule is hard, not a soft pull.
 *
 * Returns the required color, or null if the rule does not bind (self is
 * not an age-banded Vet ind, or no age-banded sibling has been colored yet).
 */
function vetCoDayRequiredColor(
  self: Competition,
  coloring: Map<string, number>,
  competitions: Competition[],
): number | null {
  if (self.category !== Category.VETERAN) return null
  if (self.event_type !== EventType.INDIVIDUAL) return null
  // VET_COMBINED must never join the co-day group.
  if (self.vet_age_group === VetAgeGroup.VET_COMBINED) return null

  for (const other of competitions) {
    if (other.id === self.id) continue
    if (other.category !== Category.VETERAN) continue
    if (other.event_type !== EventType.INDIVIDUAL) continue
    // Skip VET_COMBINED siblings — they are not part of the co-day group.
    if (other.vet_age_group === VetAgeGroup.VET_COMBINED) continue
    if (other.gender !== self.gender) continue
    if (other.weapon !== self.weapon) continue
    const day = coloring.get(other.id)
    if (day !== undefined) return day
  }

  return null
}

// ──────────────────────────────────────────────
// Core DSatur loop
// ──────────────────────────────────────────────

/**
 * One hard edge (weight === Infinity) that a least-bad-color fallback broke:
 * `id` was placed on a day `targetId` already held. Both endpoints are named so
 * a caller can report the pair without re-deriving it from the day map. The
 * pair is unordered – it is recorded once, when the second of the two is
 * colored.
 */
export type HardEdgeViolation = { id: string; targetId: string }

/**
 * Runs one pass of DSatur graph coloring over all competitions, choosing each
 * one's colour in `[0, nDays)` by `colorPenalty`.
 *
 * `seed` fixes colours the caller has already decided — the pinned events
 * (013 research D1). Seeded ids start coloured and never enter `uncolored`,
 * so saturation, blocked colours, the Vet co-day rule and the soft penalties
 * all see them as already-coloured neighbours. An empty seed leaves the loop
 * exactly as it was (FR-058).
 */
function dsaturLoop(
  graph: ConstraintGraph,
  competitions: Competition[],
  nDays: number,
  compMap: Map<string, Competition>,
  packingFootprint: Map<string, number>,
  stripHoursMap: Map<string, number>,
  dayCapacity: number,
  seed: ReadonlyMap<string, number>,
): {
  coloring: Map<string, number>
  violations: HardEdgeViolation[]
} {
  const coloring = new Map<string, number>(seed)
  const violations: HardEdgeViolation[] = []

  // All competition IDs that need coloring. A seeded id is already coloured.
  const uncolored = new Set<string>(
    seed.size > 0
      ? competitions.filter(c => !seed.has(c.id)).map(c => c.id)
      : competitions.map(c => c.id),
  )

  // Max iterations = number of competitions (bounded, no infinite loop)
  const maxIter = competitions.length
  for (let iter = 0; iter < maxIter && uncolored.size > 0; iter++) {
    // Pick uncolored vertex with highest saturation. Ties by hard-edge degree,
    // then by packing footprint (largest first).
    let bestId: string | null = null
    let bestSat = -1
    let bestDeg = -1
    let bestFootprint = -1

    for (const id of uncolored) {
      const sat = saturationDegree(id, graph, coloring)
      const deg = hardEdgeDegree(id, graph)
      const fp = packingFootprint.get(id) ?? 0

      if (
        sat > bestSat ||
        (sat === bestSat && deg > bestDeg) ||
        (sat === bestSat && deg === bestDeg && fp > bestFootprint)
      ) {
        bestId = id
        bestSat = sat
        bestDeg = deg
        bestFootprint = fp
      }
    }

    if (!bestId) break // should not happen

    const id = bestId
    const self = compMap.get(id)!
    const edges = graph.get(id) ?? []

    // Determine blocked colors (from hard-edge neighbors already colored)
    const blockedColors = new Set<number>()
    for (const edge of edges) {
      if (edge.weight === Infinity) {
        const neighborColor = coloring.get(edge.targetId)
        if (neighborColor !== undefined) blockedColors.add(neighborColor)
      }
    }

    // Vet Co-Day Rule: if a sibling Vet ind (same gender + weapon) is already
    // colored, restrict valid colors to that day. Hard rule per METHODOLOGY
    // §Veteran Age-Group Co-Day Rule.
    const requiredColor = vetCoDayRequiredColor(self, coloring, competitions)

    // Valid colors in [0, nDays)
    const allColors = Array.from({ length: nDays }, (_, i) => i)
    const validColors = (requiredColor !== null
      ? (blockedColors.has(requiredColor) ? [] : [requiredColor])
      : allColors.filter(c => !blockedColors.has(c)))

    // Pick best valid color by soft penalty
    let chosenColor: number
    if (validColors.length > 0) {
      let bestColor = validColors[0]
      let bestPenalty = colorPenalty(id, validColors[0], graph, coloring, compMap, competitions, stripHoursMap, dayCapacity, nDays)
      for (let ci = 1; ci < validColors.length; ci++) {
        const p = colorPenalty(id, validColors[ci], graph, coloring, compMap, competitions, stripHoursMap, dayCapacity, nDays)
        if (p < bestPenalty) {
          bestPenalty = p
          bestColor = validColors[ci]
        }
      }
      chosenColor = bestColor
    } else {
      // No valid color — pick least-bad color
      chosenColor = 0
      let bestPenalty = colorPenalty(id, 0, graph, coloring, compMap, competitions, stripHoursMap, dayCapacity, nDays)
      for (let c = 1; c < nDays; c++) {
        const p = colorPenalty(id, c, graph, coloring, compMap, competitions, stripHoursMap, dayCapacity, nDays)
        if (p < bestPenalty) {
          bestPenalty = p
          chosenColor = c
        }
      }

      // A least-bad color is placed on a day that hard neighbours already
      // hold. Record every such pair — without this the break is silent: the
      // coloring reports no warning and no error.
      for (const edge of edges) {
        if (edge.weight !== Infinity) continue
        if (coloring.get(edge.targetId) === chosenColor) {
          violations.push({ id, targetId: edge.targetId })
        }
      }
    }

    coloring.set(id, chosenColor)
    uncolored.delete(id)
  }

  return { coloring, violations }
}

// ──────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────

/**
 * Assigns each competition to a tournament day (0-indexed) by one DSatur pass
 * over the constraint graph, colouring with every day the organizer chose
 * (METHODOLOGY.md §Day Count).
 *
 * Returns `effectiveDays` – the number of distinct days `dayMap` uses – and
 * `violations`, the hard edges the least-bad-color fallback broke to produce
 * `dayMap`.
 */
export function assignDaysByColoring(
  graph: ConstraintGraph,
  competitions: Competition[],
  config: TournamentConfig,
  pinned: readonly PinnedPlacement[] = [],
): {
  dayMap: Map<string, number>
  effectiveDays: number
  violations: HardEdgeViolation[]
} {
  // Build lookup maps
  const compMap = new Map<string, Competition>()
  for (const c of competitions) compMap.set(c.id, c)

  // Precompute packing footprint: strips_allocated × categoryWeight
  const packingFootprint = new Map<string, number>()
  for (const c of competitions) {
    packingFootprint.set(c.id, c.strips_allocated * categoryWeight(c))
  }

  // Precompute strip-hours per competition (capacity-weighted for load balancing).
  // Multiplying by categoryWeight gives heavyweight categories (DIV1, JUNIOR,
  // CADET) more effective footprint than their raw strip-hours, so capacity
  // scoring treats a 300-fencer DIV1 event as heavier than a 300-fencer DIV3.
  const stripHoursMap = new Map<string, number>()
  for (const c of competitions) {
    const raw = estimateCompetitionStripHours(c, config).total_strip_hours
    stripHoursMap.set(c.id, raw * categoryWeight(c))
  }

  // The 10-hour planning day, not the hard window (METHODOLOGY.md §Strip-Hour
  // Capacity, Ops Manual 2026-27 p.17).
  const dayCapacity = config.strips_total * (config.DAY_LENGTH_MINS / 60)

  // The pins, as a colouring the pass starts from. Empty when there are no
  // pins, which is what keeps the no-pins path identical (013 FR-058).
  const seed = new Map<string, number>()
  for (const pin of pinned) seed.set(pin.competition_id, pin.day)

  // A pin's day is the caller's to keep inside [0, days_available)
  // (PinnedPlacement, and buildConfig drops one that is not), so the colours
  // are exactly the organizer's days.
  const { coloring, violations } = dsaturLoop(
    graph, competitions, config.days_available, compMap, packingFootprint,
    stripHoursMap, dayCapacity, seed,
  )

  // The colouring is the day map: each event keeps the day its penalty picked,
  // and no day is renumbered, so a pin stays on the day the caller fixed it to
  // (research D1) and `violations` names pairs that share a day in `dayMap`.
  return {
    dayMap: coloring,
    effectiveDays: new Set(coloring.values()).size,
    violations,
  }
}
