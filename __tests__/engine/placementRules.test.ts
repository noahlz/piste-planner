import { describe, it, expect } from 'vitest'
import { checkPlacementRules } from '../../src/engine/placementRules.ts'
import type { PlacedEvent } from '../../src/engine/placementRules.ts'
import {
  BottleneckCause,
  BottleneckRule,
  BottleneckSeverity,
  Category,
  EventType,
  Gender,
  Phase,
  TournamentType,
  VetAgeGroup,
  Weapon,
} from '../../src/engine/types.ts'
import type { Competition, Bottleneck } from '../../src/engine/types.ts'
import { makeCompetition } from '../helpers/factories.ts'

/** Day 1 (0-based) opens at 08:00, every other day at 09:00, so a floor read from the wrong day shows. */
const dayStartClock = (day: number) => (day === 1 ? 480 : 540)

const comp = (id: string, overrides: Partial<Competition> = {}) => makeCompetition({ id, ...overrides })
const at = (competition_id: string, day: number, pool_start = 540): PlacedEvent => ({ competition_id, day, pool_start })

const hard = (findings: Bottleneck[]) => findings.filter(f => f.rule === BottleneckRule.HARD_SEPARATION_VIOLATED)
const windows = (findings: Bottleneck[]) =>
  findings.filter(
    f => f.rule === BottleneckRule.REGIONAL_WINDOW_HONOURED || f.rule === BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
  )

interface HardCase {
  name: string
  a: Partial<Competition>
  b: Partial<Competition>
  type?: TournamentType
}

const HARD_CASES: HardCase[] = [
  {
    name: 'same population, individual and team of one category, gender and weapon',
    a: { category: Category.DIV2, event_type: EventType.INDIVIDUAL },
    b: { category: Category.DIV2, event_type: EventType.TEAM },
  },
  {
    name: 'Veteran combined against an age-banded Veteran individual',
    a: { category: Category.VETERAN, vet_age_group: VetAgeGroup.VET_COMBINED },
    b: { category: Category.VETERAN, vet_age_group: VetAgeGroup.VET50 },
  },
  {
    name: 'at ROC, where Group 1 is soft: the relaxable individual/team block (Div 1 individual, Junior team)',
    a: { category: Category.DIV1, event_type: EventType.INDIVIDUAL },
    b: { category: Category.JUNIOR, event_type: EventType.TEAM },
    type: TournamentType.ROC,
  },
  {
    name: 'Div 1 and Div 1A',
    a: { category: Category.DIV1 },
    b: { category: Category.DIV1A },
  },
  {
    name: 'Group 1 at a national type (Junior and Cadet)',
    a: { category: Category.JUNIOR },
    b: { category: Category.CADET },
  },
]

describe('checkPlacementRules: hard same-day pairs', () => {
  it.each(HARD_CASES)('$name yields one WARN naming both events and the 1-based day', ({ a, b, type }) => {
    const competitions = [comp('zeta', a), comp('alpha', b)]
    const findings = checkPlacementRules(
      competitions,
      [at('zeta', 2), at('alpha', 2)],
      type ?? TournamentType.NAC,
      dayStartClock,
    )
    expect(hard(findings)).toHaveLength(1)
    const [f] = hard(findings)
    expect(f).toMatchObject({
      severity: BottleneckSeverity.WARN,
      rule: BottleneckRule.HARD_SEPARATION_VIOLATED,
      cause: BottleneckCause.UNAVOIDABLE_CROSSOVER_CONFLICT,
      phase: Phase.DAY_ASSIGNMENT,
      competition_id: 'alpha',
      subjects: ['alpha', 'zeta'],
      day: 2,
      delay_mins: 0,
    })
    expect(f.message).toContain('alpha')
    expect(f.message).toContain('zeta')
    expect(f.message).toContain('Day 3')
    expect(f.message).toContain('may never share a day')
  })

  it('names the day the pair shares, not day one', () => {
    const findings = checkPlacementRules(
      [comp('A', { category: Category.DIV1 }), comp('B', { category: Category.DIV1A })],
      [at('A', 1), at('B', 1)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].day).toBe(1)
    expect(findings[0].message).toBe('A and B are both on Day 2: they may never share a day')
  })

  it('gives exactly one hard finding to a pair that matches several hard rules', () => {
    // Div 1 individual / Junior team is a relaxable block AND a Group 1 pair.
    const findings = checkPlacementRules(
      [
        comp('div1-ind', { category: Category.DIV1, event_type: EventType.INDIVIDUAL }),
        comp('jun-team', { category: Category.JUNIOR, event_type: EventType.TEAM }),
      ],
      [at('div1-ind', 2), at('jun-team', 2)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe(BottleneckRule.HARD_SEPARATION_VIOLATED)
  })

  it.each([TournamentType.NAC, TournamentType.SYC, TournamentType.SJCC])('gives no window finding at %s', type => {
    const findings = checkPlacementRules(
      [comp('J', { category: Category.JUNIOR }), comp('C', { category: Category.CADET })],
      [at('J', 2, 900), at('C', 2, 540)],
      type,
      dayStartClock,
    )
    expect(windows(findings)).toEqual([])
    expect(hard(findings)).toHaveLength(1)
  })
})

describe('checkPlacementRules: nothing to report', () => {
  const sameCategory = { category: Category.DIV2 }

  it.each([
    ['different gender', { gender: Gender.WOMEN }],
    ['different weapon', { weapon: Weapon.EPEE }],
  ])('a same-category pair of %s on one day gives nothing', (_name, other) => {
    const findings = checkPlacementRules(
      [comp('A', sameCategory), comp('B', { ...sameCategory, ...other })],
      [at('A', 2), at('B', 2)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(findings).toEqual([])
  })

  it.each([
    ['gender', { gender: Gender.WOMEN }],
    ['weapon', { weapon: Weapon.EPEE }],
  ])('a Group 1 pair of different %s at ROC gives no window finding', (_name, other) => {
    const findings = checkPlacementRules(
      [comp('J', { category: Category.JUNIOR }), comp('C', { category: Category.CADET, ...other })],
      [at('J', 2, 900), at('C', 2, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toEqual([])
  })

  it('a hard pair on different days gives nothing', () => {
    const findings = checkPlacementRules(
      [comp('A', { category: Category.DIV1 }), comp('B', { category: Category.DIV1A })],
      [at('A', 1), at('B', 2)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(findings).toEqual([])
  })

  it('a Group 1 pair on different days at ROC gives nothing', () => {
    const findings = checkPlacementRules(
      [comp('J', { category: Category.JUNIOR }), comp('C', { category: Category.CADET })],
      [at('J', 1, 900), at('C', 2, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toEqual([])
  })

  it('skips a placed id that has no competition', () => {
    const findings = checkPlacementRules(
      [comp('A', { category: Category.DIV1 })],
      [at('A', 1), at('ghost', 1)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(findings).toEqual([])
  })

  it('still judges the real pair when a ghost id is placed beside it', () => {
    const findings = checkPlacementRules(
      [comp('A', { category: Category.DIV1 }), comp('B', { category: Category.DIV1A })],
      [at('ghost', 1), at('A', 1), at('B', 1)],
      TournamentType.NAC,
      dayStartClock,
    )
    expect(hard(findings)).toHaveLength(1)
  })

  it('gives nothing for no placements', () => {
    expect(checkPlacementRules([comp('A')], [], TournamentType.NAC, dayStartClock)).toEqual([])
  })
})

describe('checkPlacementRules: the regional Group 1 window', () => {
  // Day 1 opens 08:00, so its floor is 12:00 (720). Day 2 opens 09:00, floor 13:00 (780).
  const juniorCadet = [
    comp('older-jun', { category: Category.JUNIOR }),
    comp('young-cad', { category: Category.CADET }),
  ]

  it('gives no hard finding at ROC for a Group 1 pair', () => {
    const findings = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 1, 780), at('young-cad', 1, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(hard(findings)).toEqual([])
    expect(windows(findings)).toHaveLength(1)
  })

  it('reports an INFO note when the older side starts at or after the floor and the younger before it', () => {
    const findings = checkPlacementRules(
      juniorCadet,
      [at('young-cad', 1, 540), at('older-jun', 1, 780)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: BottleneckSeverity.INFO,
      rule: BottleneckRule.REGIONAL_WINDOW_HONOURED,
      cause: BottleneckCause.SEQUENCING_CONSTRAINT,
      phase: Phase.SEQUENCING,
      competition_id: 'older-jun',
      subjects: ['older-jun', 'young-cad'],
      day: 1,
      delay_mins: 0,
    })
    expect(findings[0].message).toBe(
      "older-jun and young-cad share Day 2 inside the regional Group 1 window: young-cad starts at 09:00 and older-jun's pools at 13:00, window floor 12:00",
    )
  })

  it('treats an older start exactly at the floor as honoured', () => {
    const findings = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 1, 720), at('young-cad', 1, 719)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings[0].rule).toBe(BottleneckRule.REGIONAL_WINDOW_HONOURED)
  })

  it.each([
    ['the older side starts one minute before the floor', 719, 540, '11:59', '09:00'],
    ['the younger side starts at the floor', 780, 720, '13:00', '12:00'],
  ])('reports a WARN when %s', (_name, olderStart, youngerStart, olderClock, youngerClock) => {
    const findings = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 1, olderStart), at('young-cad', 1, youngerStart)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      severity: BottleneckSeverity.WARN,
      rule: BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED,
      cause: BottleneckCause.SEQUENCING_CONSTRAINT,
      phase: Phase.SEQUENCING,
      competition_id: 'older-jun',
      subjects: ['older-jun', 'young-cad'],
      day: 1,
      delay_mins: 0,
    })
    expect(findings[0].message).toBe(
      `older-jun and young-cad share Day 2 and the regional Group 1 window is not honoured: young-cad starts at ${youngerClock} and older-jun's pools at ${olderClock}, window floor 12:00`,
    )
  })

  it('reads the floor from the placement day, not day zero', () => {
    // 12:30 clears day 1's 12:00 floor but not day 2's 13:00 floor.
    const onDay1 = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 1, 750), at('young-cad', 1, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    const onDay2 = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 2, 750), at('young-cad', 2, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(onDay1[0].rule).toBe(BottleneckRule.REGIONAL_WINDOW_HONOURED)
    expect(onDay2[0].rule).toBe(BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED)
    expect(onDay2[0].day).toBe(2)
  })

  it.each([TournamentType.ROC, TournamentType.RYC, TournamentType.RJCC])('judges the window at %s', type => {
    const findings = checkPlacementRules(
      juniorCadet,
      [at('older-jun', 1, 780), at('young-cad', 1, 540)],
      type,
      dayStartClock,
    )
    expect(windows(findings)).toHaveLength(1)
  })

  it('pairs an individual with a team of the other category', () => {
    const findings = checkPlacementRules(
      [
        comp('jun-team', { category: Category.JUNIOR, event_type: EventType.TEAM }),
        comp('cad-ind', { category: Category.CADET, event_type: EventType.INDIVIDUAL }),
      ],
      [at('jun-team', 1, 780), at('cad-ind', 1, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(windows(findings)).toHaveLength(1)
    expect(windows(findings)[0].competition_id).toBe('jun-team')
  })

  it('judges a hard pair that is also a Group 1 pair by both rules', () => {
    // Div 1 individual / Junior team is hard at every type AND a GROUP_1_MANDATORY pair.
    const findings = checkPlacementRules(
      [
        comp('div1-ind', { category: Category.DIV1, event_type: EventType.INDIVIDUAL }),
        comp('jun-team', { category: Category.JUNIOR, event_type: EventType.TEAM }),
      ],
      [at('div1-ind', 1, 780), at('jun-team', 1, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toHaveLength(2)
    expect(hard(findings)).toHaveLength(1)
    expect(windows(findings)).toHaveLength(1)
    expect(windows(findings)[0]).toMatchObject({
      rule: BottleneckRule.REGIONAL_WINDOW_HONOURED,
      competition_id: 'div1-ind',
      day: 1,
    })
    expect(hard(findings)[0].day).toBe(1)
  })

  it('reads the flight A start the caller passes for a flighted older event', () => {
    // The caller passes flight A's start as pool_start. Flight A at 11:30 is
    // before day 1's 12:00 floor, so the window is not honoured even though a
    // later flight B would clear it.
    const flighted = [
      comp('older-jun', { category: Category.JUNIOR, flighted: true, flighting_group_id: 'g1' }),
      comp('young-cad', { category: Category.CADET }),
    ]
    const flightAStart = 690
    const findings = checkPlacementRules(
      flighted,
      [at('older-jun', 1, flightAStart), at('young-cad', 1, 540)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings).toHaveLength(1)
    expect(findings[0].rule).toBe(BottleneckRule.REGIONAL_WINDOW_NOT_HONOURED)
    expect(findings[0].message).toContain("older-jun's pools at 11:30")
  })
})

describe('checkPlacementRules: output order', () => {
  const competitions = [
    comp('d1', { category: Category.DIV1 }),
    comp('d1a', { category: Category.DIV1A }),
    comp('j', { category: Category.JUNIOR }),
    comp('c', { category: Category.CADET }),
    comp('a-m', { category: Category.DIV2 }),
    comp('a-t', { category: Category.DIV2, event_type: EventType.TEAM }),
  ]
  const placed = [
    at('a-t', 2),
    at('c', 1),
    at('d1a', 1),
    at('a-m', 2),
    at('j', 1),
    at('d1', 1),
  ]

  it('sorts by day, then by subjects, then by rule', () => {
    const findings = checkPlacementRules(competitions, placed, TournamentType.NAC, dayStartClock)
    // Div 1, Junior and Cadet are the Group 1 trio, hard in every pair at NAC.
    expect(findings.map(f => [f.day, f.subjects?.join(',')])).toEqual([
      [1, 'c,d1'],
      [1, 'c,j'],
      [1, 'd1,d1a'],
      [1, 'd1,j'],
      [2, 'a-m,a-t'],
    ])
  })

  it('orders a pair by rule when it carries both a hard and a window finding', () => {
    const findings = checkPlacementRules(
      [
        comp('div1-ind', { category: Category.DIV1, event_type: EventType.INDIVIDUAL }),
        comp('jun-team', { category: Category.JUNIOR, event_type: EventType.TEAM }),
      ],
      [at('jun-team', 1, 540), at('div1-ind', 1, 780)],
      TournamentType.ROC,
      dayStartClock,
    )
    expect(findings.map(f => f.rule)).toEqual([
      BottleneckRule.HARD_SEPARATION_VIOLATED,
      BottleneckRule.REGIONAL_WINDOW_HONOURED,
    ])
  })

  it('returns the same findings whatever order the placements arrive in', () => {
    const forward = checkPlacementRules(competitions, placed, TournamentType.NAC, dayStartClock)
    const backward = checkPlacementRules(competitions, [...placed].reverse(), TournamentType.NAC, dayStartClock)
    expect(backward).toEqual(forward)
  })
})
