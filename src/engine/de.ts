import { Weapon, CutMode, EventType, Phase } from './types.ts'
import type { DeBlockDurations } from './types.ts'
import { computeDeFencerCount } from './pools.ts'

/**
 * Returns the smallest power of 2 that is ≥ n.
 * Uses bit manipulation: for n > 1, right-shifts to find the highest bit,
 * then left-shifts back — rounding up if n is not already a power of 2.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1
  // Check if already a power of 2
  if ((n & (n - 1)) === 0) return n
  // Find next power of 2 via bit length
  return 1 << Math.ceil(Math.log2(n))
}

/**
 * Computes the DE bracket size for a competition.
 * Applies pool-round cuts via computeDeFencerCount, then rounds up to next power of 2.
 */
export function computeBracketSize(
  fencerCount: number,
  cutMode: CutMode,
  cutValue: number,
  eventType: EventType,
): number {
  const promoted = computeDeFencerCount(fencerCount, cutMode, cutValue, eventType)
  return nextPowerOf2(promoted)
}

/**
 * Returns the ordered list of DE phases for a given bracket size.
 *
 * Stop-at-semis model: the gold-medal bout is excluded from scheduled blocks
 * and covered by tailEstimateMins() instead. DE_FINALS is never returned here.
 *
 * - bracket ≥ 64: prelims (top-half bouts before round of 16) + R16
 * - bracket ≥ 16: R16 only
 * - bracket < 16: R16 only (tiny bracket absorbed into r16 phase; over-allocates
 *   strips slightly but keeps the model uniform)
 */
export function dePhasesForBracket(bracketSize: number): Phase[] {
  if (bracketSize >= 64) {
    return [Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16]
  }
  return [Phase.DE_ROUND_OF_16]
}

/**
 * Splits total DE time across two scheduled phases proportionally by bout count.
 *
 * Bout allocation:
 * - total_bouts   = bracket_size / 2
 * - prelims_bouts = max(total_bouts - 30 - 1, 0)  — rounds above 32 (bracket ≥ 64)
 * - r16_bouts     = min(30, total_bouts - 1)       — rounds 16 through SF
 * - finals_bouts  = 1 (gold medal only) — not allocated here; caller adds tailEstimateMins()
 *
 * Returns only the two scheduled blocks. The gold-bout share is intentionally
 * left out of both allocations and covered by the tail estimate.
 */
export function deBlockDurations(bracketSize: number, totalDeDuration: number): DeBlockDurations {
  const totalBouts = bracketSize / 2

  if (totalBouts <= 0) {
    return { prelims_dur: 0, r16_dur: totalDeDuration }
  }

  const r16Bouts = Math.min(30, totalBouts - 1)
  const prelimsBouts = Math.max(totalBouts - 30 - 1, 0)

  const prelimsDur = Math.round((totalDeDuration * prelimsBouts) / totalBouts)
  const r16Dur = Math.round((totalDeDuration * r16Bouts) / totalBouts)

  return { prelims_dur: prelimsDur, r16_dur: r16Dur }
}

/**
 * Looks up total DE duration from the provided duration table.
 * Returns the duration for the given weapon and bracket size.
 */
export function calculateDeDuration(
  weapon: Weapon,
  bracketSize: number,
  durationTable: Record<Weapon, Record<number, number>>,
): number {
  return durationTable[weapon][bracketSize]
}
