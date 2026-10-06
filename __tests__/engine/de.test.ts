import { describe, it, expect } from 'vitest'
import {
  nextPowerOf2,
  computeBracketSize,
  deBlocksFor,
  perBoutDuration,
  deRounds,
  deRoundsMinutes,
  splitAtVideoStage,
  videoStageRound,
  deVideoStripAsk,
  deStripFootprint,
} from '../../src/engine/de.ts'
import { CutMode, DeMode, EventType, Weapon, Category, VetAgeGroup, tailEstimateMins } from '../../src/engine/types.ts'
import {
  DE_BOUT_DURATION,
  DE_BOUT_DURATION_10_TOUCH,
  TEAM_MATCH_DURATION,
} from '../../src/engine/constants.ts'
import { makeCompetition, makeConfig } from '../helpers/factories.ts'

const BOUT_TIMES = { DE_BOUT_DURATION, DE_BOUT_DURATION_10_TOUCH, TEAM_MATCH_DURATION }

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

  // METHODOLOGY.md §Bracket Sizing: no DE bracket is larger than 256 (S8 p.37)
  it('280 entries, DISABLED → bracket 256, not 512', () => {
    expect(computeBracketSize(280, CutMode.DISABLED, 0, EventType.INDIVIDUAL)).toBe(256)
  })
})

// METHODOLOGY.md §Bracket Sizing: no DE bracket is larger than 256 (S8 p.37).
describe('deBlocksFor – oversized field', () => {
  it('280 fencers, cut disabled, single stage → bracket 256 whose first round has 128 bouts and no byes', () => {
    const blocks = deBlocksFor(
      makeCompetition({ fencer_count: 280, cut_mode: CutMode.DISABLED, de_mode: DeMode.SINGLE_STAGE }),
      makeConfig(),
    )
    expect(blocks.bracketSize).toBe(256)
    expect(blocks.general[0]).toEqual({ round: 256, bouts: 128 })
  })
})

// Replaces the removed dePhasesForBracket / deBlockDurations: which rounds a
// staged DE puts in each block, and the block minutes at the full ask
// (METHODOLOGY.md §DE Phase Breakdown, §DE Duration). Cut disabled, so
// promoted = fencer_count.
describe('deBlocksFor – staged split', () => {
  const staged = (fencer_count: number, category: Category = Category.DIV1) =>
    deBlocksFor(makeCompetition({ fencer_count, category, de_mode: DeMode.STAGED }), makeConfig())
  const roundsOf = (blocks: ReturnType<typeof staged>) => ({
    general: blocks.general.map((r) => r.round),
    video: blocks.video.map((r) => r.round),
  })

  it.each([
    { fencers: 64, general: [64, 32], video: [16, 8, 4] },
    { fencers: 32, general: [32], video: [16, 8, 4] },
    { fencers: 16, general: [], video: [16, 8, 4] },
    { fencers: 8, general: [], video: [8, 4] },
    { fencers: 4, general: [], video: [4] },
  ])('Div 1, bracket $fencers, video from the round of 16: general $general, video $video', ({ fencers, general, video }) => {
    expect(roundsOf(staged(fencers))).toEqual({ general, video })
  })

  it('Y14, bracket 16, video from the round of 8: the round of 16 runs as prelims', () => {
    expect(roundsOf(staged(16, Category.Y14))).toEqual({ general: [16], video: [8, 4] })
  })

  it('worked example – Div 1 foil, 248 promoted: prelims 300 on 16 strips + video 80 on 4 = 380', () => {
    // Prelims R256–R32: (8 + 4 + 2 + 1) × 20 = 300. Video R16–SF on 4: (2 + 1 + 1) × 20 = 80.
    const blocks = staged(248)
    expect({ generalAsk: blocks.generalAsk, videoAsk: blocks.videoAsk }).toEqual({ generalAsk: 16, videoAsk: 4 })
    expect(blocks.baselineMinutes).toBe(380)
  })

  it('Div 1 foil, bracket 8: no prelims, video R8–SF on 4 strips = (1 + 1) × 20 = 40', () => {
    expect(staged(8).baselineMinutes).toBe(40)
  })

  it('a bracket of 2 has no counted round: no blocks and 0 minutes', () => {
    const blocks = staged(2)
    expect({
      general: blocks.general,
      video: blocks.video,
      generalAsk: blocks.generalAsk,
      videoAsk: blocks.videoAsk,
      minutes: blocks.baselineMinutes,
    }).toEqual({
      general: [],
      video: [],
      generalAsk: 0,
      videoAsk: 0,
      minutes: 0,
    })
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

// Replaces the removed calculateDeDuration / de_duration_table: a single-stage
// DE's minutes derive per round from the bout time (METHODOLOGY.md §DE
// Duration). 248 promoted on 16 strips is 8 + 4 + 2 + 1 + 1 + 1 + 1 = 18 waves.
describe('deBlocksFor – single stage minutes', () => {
  it.each([
    { label: 'Div 1 foil, 18 waves × 20', weapon: Weapon.FOIL, category: Category.DIV1, vet: null, expected: 360 },
    { label: 'Div 1 épée, 18 waves × 20', weapon: Weapon.EPEE, category: Category.DIV1, vet: null, expected: 360 },
    { label: 'Div 1 sabre, 18 waves × 13', weapon: Weapon.SABRE, category: Category.DIV1, vet: null, expected: 234 },
    { label: 'Vet 50 foil (10-touch), 18 waves × 15', weapon: Weapon.FOIL, category: Category.VETERAN, vet: VetAgeGroup.VET50, expected: 270 },
  ])('$label = $expected', ({ weapon, category, vet, expected }) => {
    const comp = makeCompetition({ fencer_count: 248, weapon, category, vet_age_group: vet })
    expect(deBlocksFor(comp, makeConfig()).baselineMinutes).toBe(expected)
  })

  it('every round runs on general strips: the whole DE is one block', () => {
    const blocks = deBlocksFor(makeCompetition({ fencer_count: 248 }), makeConfig())
    expect({ general: blocks.general.length, video: blocks.video.length }).toEqual({ general: 7, video: 0 })
  })

  it('team épée, 32 teams on 16 strips: (1 + 1 + 1 + 1) × 60 = 240', () => {
    // R32 16 matches, R16 8, QF 4, SF 2 – one wave each at the team match time.
    const comp = makeCompetition({ fencer_count: 32, weapon: Weapon.EPEE, event_type: EventType.TEAM })
    expect(deBlocksFor(comp, makeConfig()).baselineMinutes).toBe(240)
  })
})

// METHODOLOGY.md §DE Duration – Bout time: 15-touch for most individual events,
// 10-touch for Y8, Y10 and the Veteran category (any age group, or none), and
// the team match time for every team event.
describe('perBoutDuration', () => {
  const cases: [string, Weapon, Category, VetAgeGroup | null, EventType, number][] = [
    ['FOIL + DIV1 → 20 (15-touch)', Weapon.FOIL, Category.DIV1, null, EventType.INDIVIDUAL, 20],
    ['EPEE + DIV1 → 20 (15-touch)', Weapon.EPEE, Category.DIV1, null, EventType.INDIVIDUAL, 20],
    ['SABRE + DIV1 → 13 (15-touch)', Weapon.SABRE, Category.DIV1, null, EventType.INDIVIDUAL, 13],
    ['SABRE + Y12 → 13 (15-touch)', Weapon.SABRE, Category.Y12, null, EventType.INDIVIDUAL, 13],
    ['FOIL + Y14 → 20 (15-touch)', Weapon.FOIL, Category.Y14, null, EventType.INDIVIDUAL, 20],
    ['FOIL + Y10 → 15 (10-touch)', Weapon.FOIL, Category.Y10, null, EventType.INDIVIDUAL, 15],
    ['EPEE + Y10 → 15 (10-touch)', Weapon.EPEE, Category.Y10, null, EventType.INDIVIDUAL, 15],
    ['SABRE + Y10 → 10 (10-touch)', Weapon.SABRE, Category.Y10, null, EventType.INDIVIDUAL, 10],
    ['SABRE + Y8 → 10 (10-touch)', Weapon.SABRE, Category.Y8, null, EventType.INDIVIDUAL, 10],
    ['SABRE + VETERAN:VET40 → 10 (10-touch)', Weapon.SABRE, Category.VETERAN, VetAgeGroup.VET40, EventType.INDIVIDUAL, 10],
    ['FOIL + VETERAN:VET80 → 15 (10-touch)', Weapon.FOIL, Category.VETERAN, VetAgeGroup.VET80, EventType.INDIVIDUAL, 15],
    ['EPEE + VETERAN:VET_COMBINED → 15 (10-touch)', Weapon.EPEE, Category.VETERAN, VetAgeGroup.VET_COMBINED, EventType.INDIVIDUAL, 15],
    ['FOIL + VETERAN, no age group → 15 (the category alone is 10-touch)', Weapon.FOIL, Category.VETERAN, null, EventType.INDIVIDUAL, 15],
    ['FOIL + DIV1 team → 60 (team match)', Weapon.FOIL, Category.DIV1, null, EventType.TEAM, 60],
    ['EPEE + JUNIOR team → 60 (team match)', Weapon.EPEE, Category.JUNIOR, null, EventType.TEAM, 60],
    ['SABRE + VETERAN:VET_COMBINED team → 30 (team match beats 10-touch)', Weapon.SABRE, Category.VETERAN, VetAgeGroup.VET_COMBINED, EventType.TEAM, 30],
  ]

  it.each(cases)('%s', (_description, weapon, category, vetAgeGroup, eventType, expected) => {
    expect(perBoutDuration(weapon, category, vetAgeGroup, eventType, BOUT_TIMES)).toBe(expected)
  })
})

// METHODOLOGY.md §Bracket Sizing / §DE Duration: rounds from the first bracket
// round through the semis. Byes are not bouts, so the first round has
// promoted − bracket/2 bouts. The gold bout is not a counted round.
describe('deRounds', () => {
  it('foil 248 promoted (bracket 256): R256 120 bouts after 8 byes, then full rounds through the semis', () => {
    expect(deRounds(248)).toEqual([
      { round: 256, bouts: 120 },
      { round: 128, bouts: 64 },
      { round: 64, bouts: 32 },
      { round: 32, bouts: 16 },
      { round: 16, bouts: 8 },
      { round: 8, bouts: 4 },
      { round: 4, bouts: 2 },
    ])
  })

  it.each([
    { promoted: 17, first: { round: 32, bouts: 1 } },
    { promoted: 5, first: { round: 8, bouts: 1 } },
    { promoted: 3, first: { round: 4, bouts: 1 } },
    { promoted: 64, first: { round: 64, bouts: 32 } },
  ])('$promoted promoted: byes are not bouts, first round $first.round has $first.bouts', ({ promoted, first }) => {
    expect(deRounds(promoted)[0]).toEqual(first)
  })

  it('a bracket of 2 has no counted round', () => {
    expect(deRounds(2)).toEqual([])
  })
})

// METHODOLOGY.md §DE Duration and §DE Phase Breakdown worked examples: foil,
// 248 promoted, bracket 256, at 20 min a bout.
describe('deRoundsMinutes', () => {
  const FOIL_BOUT = 20
  // Built per test, so a missing export fails each test rather than collection.
  const rounds = () => deRounds(248)

  it('single stage on 16 strips: (8 + 4 + 2 + 1 + 1 + 1 + 1) × 20 = 360', () => {
    expect(deRoundsMinutes(rounds(), 16, FOIL_BOUT)).toBe(360)
  })

  it('staged at the round of 16: prelims 300 on 16 general strips, video 80 on 4 video strips', () => {
    const { prelims, video } = splitAtVideoStage(rounds(), 16)
    expect(deRoundsMinutes(prelims, 16, FOIL_BOUT)).toBe(300)
    expect(deRoundsMinutes(video, 4, FOIL_BOUT)).toBe(80)
  })

  it('re-derives at fewer granted strips: 8 general → 640, 2 video → 140', () => {
    // 8 strips: 15 + 8 + 4 + 2 + 1 + 1 + 1 waves. 2 strips: R16 4, QF 2, SF 1.
    expect(deRoundsMinutes(rounds(), 8, FOIL_BOUT)).toBe(640)
    expect(deRoundsMinutes(splitAtVideoStage(rounds(), 16).video, 2, FOIL_BOUT)).toBe(140)
  })

  it('a grant of 0 strips counts as 1', () => {
    expect(deRoundsMinutes(rounds(), 0, FOIL_BOUT)).toBe(deRoundsMinutes(rounds(), 1, FOIL_BOUT))
  })

  it('no counted round takes 0 minutes', () => {
    expect(deRoundsMinutes([], 16, FOIL_BOUT)).toBe(0)
  })
})

// METHODOLOGY.md §DE Phase Breakdown: prelims are the rounds above the
// video-stage round, the video block runs from it through the semis.
describe('splitAtVideoStage', () => {
  const roundsOf = (promoted: number, videoRound: number) => {
    const { prelims, video } = splitAtVideoStage(deRounds(promoted), videoRound)
    return { prelims: prelims.map((r) => r.round), video: video.map((r) => r.round) }
  }

  it.each([
    { promoted: 248, videoRound: 16, prelims: [256, 128, 64, 32], video: [16, 8, 4] },
    { promoted: 64, videoRound: 8, prelims: [64, 32, 16], video: [8, 4] },
    { promoted: 16, videoRound: 16, prelims: [], video: [16, 8, 4] },
    { promoted: 8, videoRound: 16, prelims: [], video: [8, 4] },
    { promoted: 8, videoRound: 8, prelims: [], video: [8, 4] },
  ])('$promoted promoted, video from $videoRound: prelims $prelims, video $video', ({ promoted, videoRound, prelims, video }) => {
    expect(roundsOf(promoted, videoRound)).toEqual({ prelims, video })
  })
})

describe('videoStageRound', () => {
  it.each([
    { category: Category.DIV1, vetAgeGroup: null, expected: 16 },
    { category: Category.CADET, vetAgeGroup: null, expected: 16 },
    { category: Category.Y8, vetAgeGroup: null, expected: 8 },
    { category: Category.DIV2, vetAgeGroup: null, expected: 8 },
    { category: Category.VETERAN, vetAgeGroup: VetAgeGroup.VET40, expected: 8 },
    { category: Category.VETERAN, vetAgeGroup: null, expected: 8 },
  ])('$category / $vetAgeGroup → round of $expected', ({ category, vetAgeGroup, expected }) => {
    expect(videoStageRound(category, vetAgeGroup)).toBe(expected)
  })
})

// METHODOLOGY.md §DE Modes: a video block asks min(4, bracket/2) video strips,
// and a bracket of 2 – no counted round – asks none (§DE Duration 'No counted
// round'; 024 plan D5).
describe('deVideoStripAsk', () => {
  it.each([
    { bracket: 256, expected: 4 },
    { bracket: 8, expected: 4 },
    { bracket: 4, expected: 2 },
    { bracket: 2, expected: 0 },
  ])('bracket $bracket → $expected', ({ bracket, expected }) => {
    expect(deVideoStripAsk(bracket)).toBe(expected)
  })
})

// METHODOLOGY.md §DE Modes: a general DE block asks min(bracket/2, footprint),
// and a bracket of 2 asks none (§DE Duration 'No counted round'; 024 plan D5).
describe('deStripFootprint', () => {
  it('bracket 4 asks min(4/2, 16) = 2 strips', () => {
    expect(deStripFootprint(4, 16)).toBe(2)
  })

  it('a bracket of 2 has no counted round and asks no strips', () => {
    expect(deStripFootprint(2, 16)).toBe(0)
  })
})
