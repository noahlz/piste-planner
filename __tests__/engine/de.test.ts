import { describe, it, expect } from 'vitest'
import {
  nextPowerOf2,
  computeBracketSize,
  dePhasesForBracket,
  deBlockDurations,
  calculateDeDuration,
} from '../../src/engine/de.ts'
import { CutMode, EventType, Weapon } from '../../src/engine/types.ts'
import { DEFAULT_DE_DURATION_TABLE } from '../../src/engine/constants.ts'

describe('nextPowerOf2', () => {
  const cases: [number, number][] = [
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
  it('100 entries, 20% cut → 20 promoted → bracket 32', () => {
    expect(computeBracketSize(100, CutMode.PERCENTAGE, 20, EventType.INDIVIDUAL)).toBe(32)
  })

  it('64 entries, DISABLED → bracket 64', () => {
    expect(computeBracketSize(64, CutMode.DISABLED, 100, EventType.INDIVIDUAL)).toBe(64)
  })

  it('5 entries, DISABLED → bracket 8', () => {
    expect(computeBracketSize(5, CutMode.DISABLED, 100, EventType.INDIVIDUAL)).toBe(8)
  })
})

describe('dePhasesForBracket', () => {
  it('bracket 64 → [DE_PRELIMS, DE_ROUND_OF_16, DE_FINALS]', () => {
    expect(dePhasesForBracket(64)).toEqual(['DE_PRELIMS', 'DE_ROUND_OF_16', 'DE_FINALS'])
  })

  it('bracket 32 → [DE_ROUND_OF_16, DE_FINALS]', () => {
    expect(dePhasesForBracket(32)).toEqual(['DE_ROUND_OF_16', 'DE_FINALS'])
  })

  it('bracket 16 → [DE_ROUND_OF_16, DE_FINALS]', () => {
    expect(dePhasesForBracket(16)).toEqual(['DE_ROUND_OF_16', 'DE_FINALS'])
  })

  it('bracket 8 → [DE_FINALS]', () => {
    expect(dePhasesForBracket(8)).toEqual(['DE_FINALS'])
  })

  it('bracket 4 → [DE_FINALS]', () => {
    expect(dePhasesForBracket(4)).toEqual(['DE_FINALS'])
  })
})

describe('deBlockDurations', () => {
  it('bracket 64, total 120 min → prelims + r16 + finals sum to ~120, finals ≥ 30', () => {
    const result = deBlockDurations(64, 120)
    expect(result.prelims_dur + result.r16_dur + result.finals_dur).toBe(120)
    expect(result.finals_dur).toBeGreaterThanOrEqual(30)
    expect(result.prelims_dur).toBeGreaterThan(0)
    expect(result.r16_dur).toBeGreaterThan(0)
  })

  it('bracket 32, total 90 min → no prelims, r16 + finals sum to ~90', () => {
    const result = deBlockDurations(32, 90)
    expect(result.prelims_dur).toBe(0)
    expect(result.r16_dur + result.finals_dur).toBe(90)
    expect(result.finals_dur).toBeGreaterThanOrEqual(30)
    expect(result.r16_dur).toBeGreaterThan(0)
  })

  it('bracket 8, total 45 min → no prelims, finals ≥ 30', () => {
    // totalBouts=4, prelims=0, r16=3, finals=1
    // Proportional finals = round(45*1/4)=11 → floored to 30, remaining=15 goes to r16
    const result = deBlockDurations(8, 45)
    expect(result.prelims_dur).toBe(0)
    expect(result.r16_dur + result.finals_dur).toBe(45)
    expect(result.finals_dur).toBeGreaterThanOrEqual(30)
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
