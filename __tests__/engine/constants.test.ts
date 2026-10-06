import { describe, it, expect } from 'vitest'
import {
  INDIV_TEAM_RELAXABLE_BLOCKS,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
  VIDEO_STAGE_ROUND,
  SOFT_SEPARATION_PAIRS,
  DE_BOUT_DURATION,
  DE_BOUT_DURATION_10_TOUCH,
  TEAM_MATCH_DURATION,
  CROSSOVER_GRAPH,
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  DAY_START_MINS,
  DAY_END_MINS,
  DAY_HARD_END_MINS,
  DAY_LENGTH_MINS,
  COMPETITORS_PER_STRIP_PER_DAY,
} from '../../src/engine/constants.ts'
import { Category, CutMode, TournamentType, VetAgeGroup, Weapon } from '../../src/engine/types.ts'

// METHODOLOGY.md Appendix A §Timing Constants – the 2026-27 Ops Manual p.17 day.
describe('day timing constants', () => {
  it('DAY_START_MINS is 540 (9:00 AM)', () => {
    expect(DAY_START_MINS).toBe(540)
  })

  it('DAY_END_MINS is 1140 (7:00 PM, the soft target)', () => {
    expect(DAY_END_MINS).toBe(1140)
  })

  it('DAY_HARD_END_MINS is 1320 (10:00 PM)', () => {
    expect(DAY_HARD_END_MINS).toBe(1320)
  })

  it('DAY_LENGTH_MINS is 600, the 10-hour planning day', () => {
    expect(DAY_LENGTH_MINS).toBe(600)
  })

  it('COMPETITORS_PER_STRIP_PER_DAY is 14', () => {
    expect(COMPETITORS_PER_STRIP_PER_DAY).toBe(14)
  })
})

describe('DEFAULT_POOL_ROUND_DURATION_TABLE', () => {
  it('holds the pool-of-7 defaults: 120 foil, 120 épée, 60 sabre (Ops Manual p.17)', () => {
    expect(DEFAULT_POOL_ROUND_DURATION_TABLE).toEqual({
      [Weapon.FOIL]: 120,
      [Weapon.EPEE]: 120,
      [Weapon.SABRE]: 60,
    })
  })
})

describe('INDIV_TEAM_RELAXABLE_BLOCKS', () => {
  it('has exactly 2 entries', () => {
    expect(INDIV_TEAM_RELAXABLE_BLOCKS).toHaveLength(2)
  })

  it('contains DIV1/JUNIOR and JUNIOR/DIV1 (cross-category indv/team only)', () => {
    expect(INDIV_TEAM_RELAXABLE_BLOCKS).toContainEqual({
      indivCategory: Category.DIV1,
      teamCategory: Category.JUNIOR,
    })
    expect(INDIV_TEAM_RELAXABLE_BLOCKS).toContainEqual({
      indivCategory: Category.JUNIOR,
      teamCategory: Category.DIV1,
    })
  })

  it('does NOT contain VETERAN/VETERAN — same-weapon Vet ind/team is hard non-relaxable', () => {
    expect(INDIV_TEAM_RELAXABLE_BLOCKS).not.toContainEqual({
      indivCategory: Category.VETERAN,
      teamCategory: Category.VETERAN,
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

// Ops Manual 2026-27 p.19 – Video Replay (METHODOLOGY.md §Video Replay Policy).
// Every individual category sits at its tier. Y8 follows Y10 by interpretation.
describe('VIDEO_STAGE_ROUND', () => {
  it('lists every individual category at its p.19 tier: Div 1, Junior, Cadet 16, all others 8', () => {
    expect(VIDEO_STAGE_ROUND).toEqual({
      [Category.DIV1]: 16,
      [Category.JUNIOR]: 16,
      [Category.CADET]: 16,
      [Category.Y8]: 8,
      [Category.Y10]: 8,
      [Category.Y12]: 8,
      [Category.Y14]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET40}`]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET50}`]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET60}`]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET70}`]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET80}`]: 8,
      [`${Category.VETERAN}:${VetAgeGroup.VET_COMBINED}`]: 8,
      [Category.DIV1A]: 8,
      [Category.DIV2]: 8,
      [Category.DIV3]: 8,
    })
  })
})

// METHODOLOGY.md Appendix A §Timing Constants: minutes per DE bout or team match.
describe('DE bout times', () => {
  it.each([
    { name: 'DE_BOUT_DURATION (15-touch, with the 5-minute changeover)', table: () => DE_BOUT_DURATION, foil: 20, epee: 20, sabre: 13 },
    { name: 'DE_BOUT_DURATION_10_TOUCH (Y8, Y10, Veteran)', table: () => DE_BOUT_DURATION_10_TOUCH, foil: 15, epee: 15, sabre: 10 },
    { name: 'TEAM_MATCH_DURATION (as printed, no changeover)', table: () => TEAM_MATCH_DURATION, foil: 60, epee: 60, sabre: 30 },
  ])('$name is $foil foil / $epee épée / $sabre sabre', ({ table, foil, epee, sabre }) => {
    expect(table()).toEqual({ [Weapon.FOIL]: foil, [Weapon.EPEE]: epee, [Weapon.SABRE]: sabre })
  })
})

describe('CROSSOVER_GRAPH', () => {
  it('Y8 has no edges — METHODOLOGY:118 says Y8 CAN and SHOULD share a day with Y10 (L9)', () => {
    // Y8→Y10 was Y8's only direct edge (0.8). Removing it is what research.md
    // D5 calls "removes the edge and invents no bonus" — the specification
    // states the preference, not a magnitude, so the fix is silence, not a
    // negative weight.
    expect(CROSSOVER_GRAPH[Category.Y8]).toEqual({})
  })
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
