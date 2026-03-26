import { Weapon, CutMode, EventType } from './types.ts'
import type { DeBlockDurations } from './types.ts'
import { DE_FINALS_MIN_MINS } from './constants.ts'
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
 * PRD Section 10.1:
 * - bracket ≥ 64: prelims (top-half bouts before round of 16) + R16 + finals
 * - bracket ≥ 16: R16 + finals
 * - bracket < 16: finals only
 */
export function dePhasesForBracket(bracketSize: number): string[] {
  if (bracketSize >= 64) {
    return ['DE_PRELIMS', 'DE_ROUND_OF_16', 'DE_FINALS']
  }
  if (bracketSize >= 16) {
    return ['DE_ROUND_OF_16', 'DE_FINALS']
  }
  return ['DE_FINALS']
}

/**
 * Splits total DE time across phases proportionally by bout count.
 *
 * PRD Section 10.2 bout allocation:
 * - total_bouts = bracket_size / 2
 * - prelims_bouts = max(total_bouts - 30 - 1, 0)  (rounds above 32)
 * - r16_bouts = min(30, total_bouts - 1)  (rounds 16 through SF)
 * - finals_bouts = 1  (gold medal bout only, 30-min hard floor)
 *
 * If proportional finals allocation < DE_FINALS_MIN_MINS, finals is set to 30
 * and the remainder is redistributed to prelims and r16 proportionally.
 */
export function deBlockDurations(bracketSize: number, totalDeDuration: number): DeBlockDurations {
  const totalBouts = bracketSize / 2
  // finals = 1 bout (gold medal only); finals_dur computed as remainder after prelims + r16
  const r16Bouts = Math.min(30, totalBouts - 1)
  const prelimsBouts = Math.max(totalBouts - 30 - 1, 0)

  if (totalBouts <= 0) {
    return { prelims_dur: 0, r16_dur: 0, finals_dur: totalDeDuration }
  }

  let prelimsDur = Math.round((totalDeDuration * prelimsBouts) / totalBouts)
  let r16Dur = Math.round((totalDeDuration * r16Bouts) / totalBouts)
  let finalsDur = totalDeDuration - prelimsDur - r16Dur

  // 30-min hard floor for the finals (gold medal) block
  if (finalsDur < DE_FINALS_MIN_MINS) {
    finalsDur = Math.min(DE_FINALS_MIN_MINS, totalDeDuration)
    const remaining = totalDeDuration - finalsDur
    const nonFinalsBouts = prelimsBouts + r16Bouts
    if (nonFinalsBouts === 0) {
      prelimsDur = 0
      r16Dur = 0
    } else {
      prelimsDur = Math.round((prelimsBouts / nonFinalsBouts) * remaining)
      r16Dur = remaining - prelimsDur
    }
  }

  return { prelims_dur: prelimsDur, r16_dur: r16Dur, finals_dur: finalsDur }
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
