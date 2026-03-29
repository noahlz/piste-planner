import { describe, it, expect } from 'vitest'
import {
  INDIV_TEAM_HARD_BLOCKS,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
  VIDEO_STAGE_ROUND,
  FLIGHTING_ELIGIBLE_CATEGORIES,
  FLIGHTING_MIN_FENCERS,
  SOFT_SEPARATION_PAIRS,
} from '../../src/engine/constants.ts'
import { Category, CutMode, TournamentType, VetAgeGroup } from '../../src/engine/types.ts'

describe('INDIV_TEAM_HARD_BLOCKS', () => {
  it('has exactly 3 entries', () => {
    expect(INDIV_TEAM_HARD_BLOCKS).toHaveLength(3)
  })

  it('contains VETERAN/VETERAN, DIV1/JUNIOR, JUNIOR/DIV1', () => {
    expect(INDIV_TEAM_HARD_BLOCKS).toContainEqual({
      indivCategory: Category.VETERAN,
      teamCategory: Category.VETERAN,
    })
    expect(INDIV_TEAM_HARD_BLOCKS).toContainEqual({
      indivCategory: Category.DIV1,
      teamCategory: Category.JUNIOR,
    })
    expect(INDIV_TEAM_HARD_BLOCKS).toContainEqual({
      indivCategory: Category.JUNIOR,
      teamCategory: Category.DIV1,
    })
  })
})

describe('REGIONAL_CUT_OVERRIDES', () => {
  const disabledAt100 = { mode: CutMode.DISABLED, value: 100 }

  it.each([Category.Y14, Category.CADET, Category.JUNIOR, Category.DIV1])(
    'maps %s to mode DISABLED / value 100',
    (cat) => {
      expect(REGIONAL_CUT_OVERRIDES[cat]).toEqual(disabledAt100)
    }
  )
})

describe('REGIONAL_CUT_TOURNAMENT_TYPES', () => {
  it('contains ROC, SYC, RJCC, SJCC', () => {
    expect(REGIONAL_CUT_TOURNAMENT_TYPES.has(TournamentType.ROC)).toBe(true)
    expect(REGIONAL_CUT_TOURNAMENT_TYPES.has(TournamentType.SYC)).toBe(true)
    expect(REGIONAL_CUT_TOURNAMENT_TYPES.has(TournamentType.RJCC)).toBe(true)
    expect(REGIONAL_CUT_TOURNAMENT_TYPES.has(TournamentType.SJCC)).toBe(true)
  })
})

describe('VIDEO_STAGE_ROUND', () => {
  it.each([Category.DIV1, Category.JUNIOR, Category.CADET])(
    '%s → round 16',
    (cat) => {
      expect(VIDEO_STAGE_ROUND[cat]).toBe(16)
    }
  )

  it.each([Category.Y10, Category.Y12, Category.Y14])('%s → round 8', (cat) => {
    expect(VIDEO_STAGE_ROUND[cat]).toBe(8)
  })

  it.each([VetAgeGroup.VET50, VetAgeGroup.VET60, VetAgeGroup.VET70])(
    'VETERAN:%s → round 8',
    (ageGroup) => {
      expect(VIDEO_STAGE_ROUND[`${Category.VETERAN}:${ageGroup}`]).toBe(8)
    }
  )

  it.each([VetAgeGroup.VET40, VetAgeGroup.VET80, VetAgeGroup.VET_COMBINED])(
    'VETERAN:%s → round 4',
    (ageGroup) => {
      expect(VIDEO_STAGE_ROUND[`${Category.VETERAN}:${ageGroup}`]).toBe(4)
    }
  )
})

describe('FLIGHTING_ELIGIBLE_CATEGORIES', () => {
  it('has size 3', () => {
    expect(FLIGHTING_ELIGIBLE_CATEGORIES.size).toBe(3)
  })

  it('contains exactly CADET, JUNIOR, DIV1', () => {
    expect(FLIGHTING_ELIGIBLE_CATEGORIES.has(Category.CADET)).toBe(true)
    expect(FLIGHTING_ELIGIBLE_CATEGORIES.has(Category.JUNIOR)).toBe(true)
    expect(FLIGHTING_ELIGIBLE_CATEGORIES.has(Category.DIV1)).toBe(true)
  })
})

describe('FLIGHTING_MIN_FENCERS', () => {
  it('equals 200', () => {
    expect(FLIGHTING_MIN_FENCERS).toBe(200)
  })
})

describe('SOFT_SEPARATION_PAIRS', () => {
  it('has exactly 1 entry', () => {
    expect(SOFT_SEPARATION_PAIRS).toHaveLength(1)
  })

  it('contains [DIV1, CADET] with penalty 5.0', () => {
    expect(SOFT_SEPARATION_PAIRS[0].pair).toEqual([Category.DIV1, Category.CADET])
    expect(SOFT_SEPARATION_PAIRS[0].penalty).toBe(5.0)
  })
})
