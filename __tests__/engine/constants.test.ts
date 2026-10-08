import { describe, it, expect } from 'vitest'
import {
  INDIV_TEAM_CROSS_LEVEL_BLOCKS,
  DEFAULT_CUT_BY_CATEGORY,
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
  MAX_DE_FIELD,
  GROUP_1_MANDATORY,
  GROUP_1_SOFT_TYPES,
  DIV1_DIV1A_HARD_PAIR,
  PENALTY_WEIGHTS,
  REST_DAY_PAIRS,
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

// METHODOLOGY.md §Bracket Sizing – S8 p.37, no DE bracket is larger than 256.
describe('MAX_DE_FIELD', () => {
  it('is 256', () => {
    expect(MAX_DE_FIELD).toBe(256)
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

describe('INDIV_TEAM_CROSS_LEVEL_BLOCKS', () => {
  it('has exactly 2 entries', () => {
    expect(INDIV_TEAM_CROSS_LEVEL_BLOCKS).toHaveLength(2)
  })

  it('contains DIV1/JUNIOR and JUNIOR/DIV1 (cross-category indv/team only)', () => {
    expect(INDIV_TEAM_CROSS_LEVEL_BLOCKS).toContainEqual({
      indivCategory: Category.DIV1,
      teamCategory: Category.JUNIOR,
    })
    expect(INDIV_TEAM_CROSS_LEVEL_BLOCKS).toContainEqual({
      indivCategory: Category.JUNIOR,
      teamCategory: Category.DIV1,
    })
  })

  it('does NOT contain VETERAN/VETERAN — same-weapon Vet ind/team is a same-population block', () => {
    expect(INDIV_TEAM_CROSS_LEVEL_BLOCKS).not.toContainEqual({
      indivCategory: Category.VETERAN,
      teamCategory: Category.VETERAN,
    })
  })
})

// The factory in __tests__/helpers/scenarios.ts reads these shared tables, so
// parity cannot catch a wrong row in them (024 plan D8). Exact contents guard them.
// METHODOLOGY.md §Default Cuts by Age Category.
describe('REGIONAL_CUT_OVERRIDES', () => {
  it('holds exactly Cadet, Junior and Div 1, each DISABLED / 100 (Y14 advances 100% by default instead)', () => {
    const disabledAt100 = { mode: CutMode.DISABLED, value: 100 }
    expect(REGIONAL_CUT_OVERRIDES).toEqual({
      [Category.CADET]: disabledAt100,
      [Category.JUNIOR]: disabledAt100,
      [Category.DIV1]: disabledAt100,
    })
  })
})

describe('REGIONAL_CUT_TOURNAMENT_TYPES', () => {
  it('holds exactly ROC, RYC, SYC, RJCC and SJCC', () => {
    expect([...REGIONAL_CUT_TOURNAMENT_TYPES].sort()).toEqual([
      TournamentType.ROC,
      TournamentType.RYC,
      TournamentType.SYC,
      TournamentType.RJCC,
      TournamentType.SJCC,
    ].sort())
  })
})

// METHODOLOGY.md §Default Cuts by Age Category. Exact contents, so a wrong or
// added row fails here (024 plan D8). Y14 advances everyone by default: S8 p.38
// – Y14 SYC & NAC, 100% promoted. The default is type-independent.
describe('DEFAULT_CUT_BY_CATEGORY', () => {
  // 018 T1 (R4): Div 1 cuts 25% (75% promoted, S8 p.37 – Div I National
  // Championships, NACs and July Challenge). Cadet and Junior stay at 20%.
  it('holds exactly the spec table: Div 1 cuts 25%, Cadet and Junior cut 20%, every other category advances 100%', () => {
    const allAdvance = { mode: CutMode.DISABLED, value: 100 }
    const cut20 = { mode: CutMode.PERCENTAGE, value: 20 }
    const cut25 = { mode: CutMode.PERCENTAGE, value: 25 }
    expect(DEFAULT_CUT_BY_CATEGORY).toEqual({
      [Category.Y8]: allAdvance,
      [Category.Y10]: allAdvance,
      [Category.Y12]: allAdvance,
      [Category.Y14]: allAdvance,
      [Category.VETERAN]: allAdvance,
      [Category.DIV1A]: allAdvance,
      [Category.DIV2]: allAdvance,
      [Category.DIV3]: allAdvance,
      [Category.CADET]: cut20,
      [Category.JUNIOR]: cut20,
      [Category.DIV1]: cut25,
    })
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
  it('Y8 has no edges — METHODOLOGY §Departures From the Manual says Y8 can and should share a day with Y10 (L9)', () => {
    // Y8→Y10 was Y8's only direct edge (0.8). Removing it is what research.md
    // D5 calls "removes the edge and invents no bonus" — the specification
    // states the preference, not a magnitude, so the fix is silence, not a
    // negative weight.
    expect(CROSSOVER_GRAPH[Category.Y8]).toEqual({})
  })
})

// METHODOLOGY §Overlapping-Population Separation (Group 1), Ops Manual p.20 – Group 1.
describe('Group 1 constants', () => {
  it('GROUP_1_MANDATORY holds the six Group 1 pairs, older side first', () => {
    expect(GROUP_1_MANDATORY).toEqual([
      { older: Category.DIV1, younger: Category.JUNIOR },
      { older: Category.JUNIOR, younger: Category.CADET },
      { older: Category.DIV1, younger: Category.CADET },
      { older: Category.Y12, younger: Category.Y10 },
      { older: Category.Y14, younger: Category.Y12 },
      { older: Category.CADET, younger: Category.Y14 },
    ])
  })

  it('Div 1–Div 1A has its own always-hard constant (Appendix B departure)', () => {
    expect(DIV1_DIV1A_HARD_PAIR).toEqual([Category.DIV1, Category.DIV1A])
  })

  it('Group 1 is soft at exactly ROC, RYC and RJCC', () => {
    expect([...GROUP_1_SOFT_TYPES].sort()).toEqual(
      [TournamentType.RJCC, TournamentType.ROC, TournamentType.RYC],
    )
  })

  it('the regional Group 1 pair penalty is 5.0 (Appendix A §Penalty Weights)', () => {
    expect(PENALTY_WEIGHTS.REGIONAL_GROUP_1_PAIR).toBe(5.0)
  })
})

// METHODOLOGY §Rest Day Preference, Ops Manual p.20 – Group 2. The Junior–Cadet
// rest day is a Junior Olympic Championships rule, which no modelled type is.
describe('REST_DAY_PAIRS', () => {
  it('holds only the Junior–Div 1 pair', () => {
    expect(REST_DAY_PAIRS).toEqual([[Category.JUNIOR, Category.DIV1]])
  })
})

describe('SOFT_SEPARATION_PAIRS', () => {
  it('has exactly 2 entries – Div 1–Cadet is a Group 1 pair, not a soft separation', () => {
    expect(SOFT_SEPARATION_PAIRS).toHaveLength(2)
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
