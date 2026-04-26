/**
 * Within-day event sequencing.
 *
 * Determines the order in which events assigned to the same day should be
 * processed for resource allocation. Larger, mandatory, and youth-priority
 * events receive earlier (prime morning) slots.
 */

import { Category, EventType, VetAgeGroup } from './types.ts'
import type { Competition, TournamentConfig } from './types.ts'
import { categoryWeight, estimateCompetitionStripHours } from './capacity.ts'

/**
 * Returns true if the competition is a youth-priority category (Y8 or Y10)
 * that must start in the first slot of the day.
 */
function isYouthPriority(comp: Competition): boolean {
  return comp.category === Category.Y8 || comp.category === Category.Y10
}

/**
 * Numeric sort weight for age-banded Vet groups where older = lower (sorts earlier).
 * VET_COMBINED is intentionally absent — the helper returns null if either event
 * lacks an age-banded group, ensuring graceful fallthrough to the next sort key.
 */
const VET_AGE_ORDER: Partial<Record<VetAgeGroup, number>> = {
  [VetAgeGroup.VET80]: 0,
  [VetAgeGroup.VET70]: 1,
  [VetAgeGroup.VET60]: 2,
  [VetAgeGroup.VET50]: 3,
  [VetAgeGroup.VET40]: 4,
}

/**
 * Returns a non-null sort key (weight(a) − weight(b)) when both events are
 * Veteran INDIVIDUAL events with the same gender and weapon and both have
 * age-banded vet_age_group values (VET40–VET80, not VET_COMBINED or null).
 * A negative result places `a` before `b` (older age group first).
 * Returns null for all other pairs so the caller falls through to the next key.
 */
function vetAgeOrderingKey(a: Competition, b: Competition): number | null {
  if (
    a.category !== Category.VETERAN ||
    b.category !== Category.VETERAN ||
    a.event_type !== EventType.INDIVIDUAL ||
    b.event_type !== EventType.INDIVIDUAL ||
    a.gender !== b.gender ||
    a.weapon !== b.weapon
  ) {
    return null
  }

  const weightA = a.vet_age_group !== null ? VET_AGE_ORDER[a.vet_age_group] : undefined
  const weightB = b.vet_age_group !== null ? VET_AGE_ORDER[b.vet_age_group] : undefined

  if (weightA === undefined || weightB === undefined) return null

  return weightA - weightB
}

/**
 * Sorts events assigned to the same day for optimal within-day resource
 * allocation. Earlier positions in the returned array correspond to earlier
 * (prime morning) scheduling slots.
 *
 * Sort key (composite, all descending):
 *   1. Y8/Y10 first — must start in the first slot of the day
 *   2. Mandatory before optional
 *   3. Individual before team — when a same-day pair exists (same weapon + gender + category)
 *   3.5. Vet age-descending for sibling pairs — VET80 → VET70 → VET60 → VET50 → VET40
 *        (applies only to same-gender, same-weapon, age-banded Veteran INDIVIDUAL pairs)
 *   4. Strip demand descending — strips_allocated × categoryWeight
 *   5. Duration descending — total_strip_hours (longest events start earlier)
 *
 * After sorting, any flighted partner (is_priority === false, same flighting_group_id)
 * is moved to immediately follow its priority event.
 */
export function sequenceEventsForDay(
  events: Competition[],
  config: TournamentConfig,
): Competition[] {
  // Pre-compute sort keys to avoid repeated calculations during comparison.
  const stripDemand = new Map<string, number>()
  const stripHours = new Map<string, number>()

  for (const comp of events) {
    stripDemand.set(comp.id, comp.strips_allocated * categoryWeight(comp))
    stripHours.set(comp.id, estimateCompetitionStripHours(comp, config).total_strip_hours)
  }

  // Sort a copy — do not mutate the input array.
  const sorted = [...events].sort((a, b) => {
    // 1. Y8/Y10 first
    const youthA = isYouthPriority(a) ? 1 : 0
    const youthB = isYouthPriority(b) ? 1 : 0
    if (youthB !== youthA) return youthB - youthA

    // 2. Mandatory before optional
    const mandatoryA = a.optional ? 0 : 1
    const mandatoryB = b.optional ? 0 : 1
    if (mandatoryB !== mandatoryA) return mandatoryB - mandatoryA

    // 3. Individual before team
    const indivA = a.event_type === EventType.INDIVIDUAL ? 1 : 0
    const indivB = b.event_type === EventType.INDIVIDUAL ? 1 : 0
    if (indivB !== indivA) return indivB - indivA

    // 3.5. Vet age-descending for sibling pairs (same gender + weapon, age-banded).
    // Returns null for non-sibling pairs (fall through to key 4) or 0 for identical
    // age groups (also falls through — same-population is enforced elsewhere).
    const vetKey = vetAgeOrderingKey(a, b)
    if (vetKey !== null && vetKey !== 0) return vetKey

    // 4. Strip demand descending
    const demandDiff = (stripDemand.get(b.id) ?? 0) - (stripDemand.get(a.id) ?? 0)
    if (demandDiff !== 0) return demandDiff

    // 5. Duration descending
    return (stripHours.get(b.id) ?? 0) - (stripHours.get(a.id) ?? 0)
  })

  // Post-sort: move each priority event's flighted partner to immediately after it.
  // Bounded: at most events.length priority events, each scan is O(n). Total O(n²).
  for (let i = 0; i < sorted.length; i++) {
    const comp = sorted[i]
    if (!comp.is_priority || comp.flighting_group_id === null) continue

    const groupId = comp.flighting_group_id
    const partnerIdx = sorted.findIndex(
      (c, j) => j !== i && !c.is_priority && c.flighting_group_id === groupId,
    )
    if (partnerIdx === -1) continue

    // Partner should sit at i+1. If it's already there, skip.
    const targetIdx = i + 1
    if (partnerIdx === targetIdx) continue

    // Remove partner from current position and insert after priority event.
    const [partner] = sorted.splice(partnerIdx, 1)
    // After splice, the target insertion index may have shifted if partner was before targetIdx.
    const insertAt = partnerIdx < targetIdx ? targetIdx - 1 : targetIdx
    sorted.splice(insertAt, 0, partner)
  }

  return sorted
}
