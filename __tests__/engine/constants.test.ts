import { describe, it, expect } from 'vitest'
import {
  INDIV_TEAM_HARD_BLOCKS,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
  VIDEO_STAGE_ROUND,
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

describe('SOFT_SEPARATION_PAIRS', () => {
  it('has exactly 3 entries', () => {
    expect(SOFT_SEPARATION_PAIRS).toHaveLength(3)
  })

  it('contains [DIV1, CADET] with penalty 5.0', () => {
    const entry = SOFT_SEPARATION_PAIRS.find(
      (e) => e.pair[0] === Category.DIV1 && e.pair[1] === Category.CADET,
    )
    expect(entry).toBeDefined()
    expect(entry?.penalty).toBe(5.0)
  })

  it('contains [DIV1, DIV2] with penalty 3.0', () => {
    const entry = SOFT_SEPARATION_PAIRS.find(
      (e) => e.pair[0] === Category.DIV1 && e.pair[1] === Category.DIV2,
    )
    expect(entry).toBeDefined()
    expect(entry?.penalty).toBe(3.0)
  })

  it('contains [DIV1, DIV3] with penalty 3.0', () => {
    const entry = SOFT_SEPARATION_PAIRS.find(
      (e) => e.pair[0] === Category.DIV1 && e.pair[1] === Category.DIV3,
    )
    expect(entry).toBeDefined()
    expect(entry?.penalty).toBe(3.0)
  })
})
