/**
 * Within-day event sequencing.
 *
 * Determines the order in which events assigned to the same day should be
 * processed for resource allocation. Larger, mandatory, and youth-priority
 * events receive earlier (prime morning) slots.
 */

import { Category, EventType } from './types.ts'
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
 * Sorts events assigned to the same day for optimal within-day resource
 * allocation. Earlier positions in the returned array correspond to earlier
 * (prime morning) scheduling slots.
 *
 * Sort key (composite, all descending):
 *   1. Y8/Y10 first — must start in the first slot of the day
 *   2. Mandatory before optional
 *   3. Individual before team — when a same-day pair exists (same weapon + gender + category)
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
