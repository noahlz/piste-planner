import { describe, it, expect } from 'vitest'
import {
  nextPowerOf2,
  computeBracketSize,
  dePhasesForBracket,
  deBlockDurations,
  calculateDeDuration,
  perBoutDuration,
} from '../../src/engine/de.ts'
import { CutMode, EventType, Weapon, Phase, Category, VetAgeGroup, tailEstimateMins } from '../../src/engine/types.ts'
import { DEFAULT_DE_DURATION_TABLE } from '../../src/engine/constants.ts'

describe('nextPowerOf2', () => {
  // n<=0 returns 1: bracket size must be at least 1 (degenerate input → smallest valid bracket)
  const cases: [number, number][] = [
    [0, 1],
    [-5, 1],
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [16, 16],
    [17, 32],
    [20, 32],
    [33, 64],
    [100, 128],
    [256, 256],
  ]

  it.each(cases)('nextPowerOf2(%i) → %i', (input, expected) => {
    expect(nextPowerOf2(input)).toBe(expected)
  })
})

describe('computeBracketSize', () => {
  it('100 entries, 20% cut → 80 promoted → bracket 128', () => {
    // cutValue=20 means cut 20%, keep 80%: round(100 * 0.8) = 80 → nextPowerOf2(80) = 128
    expect(computeBracketSize(100, CutMode.PERCENTAGE, 20, EventType.INDIVIDUAL)).toBe(128)
  })

  it('64 entries, DISABLED → bracket 64', () => {
    expect(computeBracketSize(64, CutMode.DISABLED, 100, EventType.INDIVIDUAL)).toBe(64)
  })

  it('5 entries, DISABLED → bracket 8', () => {
    expect(computeBracketSize(5, CutMode.DISABLED, 100, EventType.INDIVIDUAL)).toBe(8)
  })
})

describe('dePhasesForBracket', () => {
  it('bracket 64 → [DE_PRELIMS, DE_ROUND_OF_16]', () => {
    expect(dePhasesForBracket(64)).toEqual([Phase.DE_PRELIMS, Phase.DE_ROUND_OF_16])
  })

  it('bracket 32 → [DE_ROUND_OF_16]', () => {
    expect(dePhasesForBracket(32)).toEqual([Phase.DE_ROUND_OF_16])
  })

  it('bracket 16 → [DE_ROUND_OF_16]', () => {
    expect(dePhasesForBracket(16)).toEqual([Phase.DE_ROUND_OF_16])
  })

  it('bracket 8 → [DE_ROUND_OF_16] (tiny bracket absorbed into r16 phase)', () => {
    expect(dePhasesForBracket(8)).toEqual([Phase.DE_ROUND_OF_16])
  })

  it('bracket 4 → [DE_ROUND_OF_16] (tiny bracket absorbed into r16 phase)', () => {
    expect(dePhasesForBracket(4)).toEqual([Phase.DE_ROUND_OF_16])
  })
})

describe('deBlockDurations', () => {
  // Bout split: totalBouts = bracketSize / 2
  //   r16Bouts   = min(30, totalBouts - 1)  — rounds 16 through SF
  //   prelimsBouts = max(totalBouts - 30 - 1, 0)  — rounds above 32
  //   finals_bouts = 1 (gold) — unallocated; becomes tail estimate
  //
  // Proportional formula (no finals floor):
  //   prelims_dur = round(totalDe * prelimsBouts / totalBouts)
  //   r16_dur     = round(totalDe * r16Bouts    / totalBouts)
  //
  // Return shape has exactly { prelims_dur, r16_dur } — no finals_dur.

  it('bracket 64, total 120 min → { prelims_dur, r16_dur } only (no finals_dur)', () => {
    // totalBouts=32, r16Bouts=min(30,31)=30, prelimsBouts=max(32-30-1,0)=1
    // prelims_dur = round(120 * 1/32) = round(3.75) = 4
    // r16_dur     = round(120 * 30/32) = round(112.5) = 113
    // sum(4+113) = 117 ≤ 120 (one bout's share — the gold — is unallocated)
    const result = deBlockDurations(64, 120)
    expect(result).not.toHaveProperty('finals_dur')
    expect(result).toHaveProperty('prelims_dur', 4)
    expect(result).toHaveProperty('r16_dur', 113)
    expect(result.prelims_dur + result.r16_dur).toBeLessThanOrEqual(120)
  })

  it('bracket 32, total 90 min → { prelims_dur, r16_dur } only (no finals_dur)', () => {
    // totalBouts=16, r16Bouts=min(30,15)=15, prelimsBouts=max(16-30-1,0)=0
    // prelims_dur = round(90 * 0/16) = 0
    // r16_dur     = round(90 * 15/16) = round(84.375) = 84
    const result = deBlockDurations(32, 90)
    expect(result).not.toHaveProperty('finals_dur')
    expect(result).toHaveProperty('prelims_dur', 0)
    expect(result).toHaveProperty('r16_dur', 84)
    expect(result.prelims_dur + result.r16_dur).toBeLessThanOrEqual(90)
  })

  it('bracket 8, total 45 min → r16_dur covers R16+QF+SF bouts proportionally (no finals_dur)', () => {
    // totalBouts=4, r16Bouts=min(30,3)=3, prelimsBouts=max(4-30-1,0)=0
    // prelims_dur = round(45 * 0/4) = 0
    // r16_dur     = round(45 * 3/4) = round(33.75) = 34
    // gold's 1-bout share (≈11 min) is unallocated — becomes tail estimate
    const result = deBlockDurations(8, 45)
    expect(result).not.toHaveProperty('finals_dur')
    expect(result).toHaveProperty('prelims_dur', 0)
    expect(result).toHaveProperty('r16_dur', 34)
    expect(result.prelims_dur + result.r16_dur).toBeLessThanOrEqual(45)
  })

  it('bracket 4 (very small): r16_bouts=1, prelims_bouts=0 → r16_dur = half of total', () => {
    // totalBouts=2, r16Bouts=min(30,1)=1, prelimsBouts=max(2-30-1,0)=0
    // prelims_dur = round(totalDe * 0/2) = 0
    // r16_dur     = round(totalDe * 1/2) = totalDe/2
    const totalDe = 30
    const result = deBlockDurations(4, totalDe)
    expect(result).not.toHaveProperty('finals_dur')
    expect(result).toHaveProperty('prelims_dur', 0)
    expect(result).toHaveProperty('r16_dur', Math.round(totalDe * 1 / 2))
  })

  it('edge case totalBouts <= 0: returns { prelims_dur: 0, r16_dur: totalDeDuration }', () => {
    // bracketSize=0 → totalBouts=0, hit guard path
    const result = deBlockDurations(0, 60)
    expect(result).not.toHaveProperty('finals_dur')
    expect(result).toHaveProperty('prelims_dur', 0)
    expect(result).toHaveProperty('r16_dur', 60)
  })
})

describe('tailEstimateMins', () => {
  it('returns 30 for EventType.INDIVIDUAL', () => {
    expect(tailEstimateMins(EventType.INDIVIDUAL)).toBe(30)
  })

  it('returns 60 for EventType.TEAM', () => {
    expect(tailEstimateMins(EventType.TEAM)).toBe(60)
  })
})

describe('calculateDeDuration', () => {
  it('FOIL, bracket 32 → 90 (from default table)', () => {
    expect(calculateDeDuration(Weapon.FOIL, 32, DEFAULT_DE_DURATION_TABLE)).toBe(90)
  })

  it('SABRE, bracket 16 → 45', () => {
    expect(calculateDeDuration(Weapon.SABRE, 16, DEFAULT_DE_DURATION_TABLE)).toBe(45)
  })

  it('all weapon × bracket size combinations return expected values', () => {
    for (const weapon of Object.values(Weapon)) {
      const table = DEFAULT_DE_DURATION_TABLE[weapon]
      for (const [bracketStr, expected] of Object.entries(table)) {
        const bracket = Number(bracketStr)
        expect(
          calculateDeDuration(weapon, bracket, DEFAULT_DE_DURATION_TABLE),
          `${weapon} bracket ${bracket}`,
        ).toBe(expected)
      }
    }
  })
})

describe('perBoutDuration', () => {
  // base = DE_BOUT_DURATION[weapon] (foil/epee 20, sabre 15 after strip-changeover overhead)
  // YOUTH_VET_BOUT_DELTA (-5) applies when category is Y8 or Y10, or vet_age_group is non-null.
  // Y12, Y14, and senior (DIV1) categories take the plain weapon duration.
  const cases: [string, Weapon, Category, VetAgeGroup | null, number][] = [
    // senior (DIV1) — unaffected, plain weapon duration
    ['FOIL + DIV1 (senior) → 20', Weapon.FOIL, Category.DIV1, null, 20],
    ['EPEE + DIV1 (senior) → 20', Weapon.EPEE, Category.DIV1, null, 20],
    ['SABRE + DIV1 (senior) → 15', Weapon.SABRE, Category.DIV1, null, 15],

    // Y10 — delta across all three weapons
    ['FOIL + Y10 → 15 (20-5)', Weapon.FOIL, Category.Y10, null, 15],
    ['EPEE + Y10 → 15 (20-5)', Weapon.EPEE, Category.Y10, null, 15],
    ['SABRE + Y10 → 10 (15-5)', Weapon.SABRE, Category.Y10, null, 10],

    // Y8 — delta across all three weapons
    ['FOIL + Y8 → 15 (20-5)', Weapon.FOIL, Category.Y8, null, 15],
    ['EPEE + Y8 → 15 (20-5)', Weapon.EPEE, Category.Y8, null, 15],
    ['SABRE + Y8 → 10 (15-5)', Weapon.SABRE, Category.Y8, null, 10],

    // every VetAgeGroup — delta applies, keyed off vet_age_group not category
    ['FOIL + VETERAN:VET40 → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET40, 15],
    ['FOIL + VETERAN:VET50 → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET50, 15],
    ['FOIL + VETERAN:VET60 → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET60, 15],
    ['FOIL + VETERAN:VET70 → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET70, 15],
    ['FOIL + VETERAN:VET80 → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET80, 15],
    ['FOIL + VETERAN:VET_COMBINED → 15 (20-5)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET_COMBINED, 15],
    // VETERAN category with no age group set → 20, unaffected: the delta keys off
    // vet_age_group, not category, so a null age group gets nothing subtracted
    // even though the category is VETERAN.
    ['FOIL + VETERAN, vet_age_group null → 20 (no delta without an age group)', Weapon.FOIL, Category.VETERAN, null, 20],

    // Y12, Y14 — explicitly unaffected
    ['FOIL + Y12 → 20 (unaffected)', Weapon.FOIL, Category.Y12, null, 20],
    ['FOIL + Y14 → 20 (unaffected)', Weapon.FOIL, Category.Y14, null, 20],

    // Both predicates true at once (Y8 + a set vet_age_group) → a single delta,
    // not two: 20 - 5 = 15, never 10.
    ['FOIL + Y8 + VETERAN:VET40 → 15, single delta not double', Weapon.FOIL, Category.Y8, VetAgeGroup.VET40, 15],
  ]

  it.each(cases)('%s', (_description, weapon, category, vetAgeGroup, expected) => {
    expect(perBoutDuration(weapon, category, vetAgeGroup)).toBe(expected)
  })
})
