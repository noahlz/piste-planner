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
  // Exact values verified by hand against deBlockDurations algorithm:
  // 1. Compute bout counts (totalBouts, r16Bouts, prelimsBouts)
  // 2. Allocate proportionally via Math.round
  // 3. Enforce 30-min finals floor, redistribute remainder
  it('bracket 64, total 120 min → exact phase split', () => {
    expect(deBlockDurations(64, 120)).toEqual({ prelims_dur: 3, r16_dur: 87, finals_dur: 30 })
  })

  it('bracket 32, total 90 min → exact phase split', () => {
    expect(deBlockDurations(32, 90)).toEqual({ prelims_dur: 0, r16_dur: 60, finals_dur: 30 })
  })

  it('bracket 8, total 45 min → exact phase split', () => {
    expect(deBlockDurations(8, 45)).toEqual({ prelims_dur: 0, r16_dur: 15, finals_dur: 30 })
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
