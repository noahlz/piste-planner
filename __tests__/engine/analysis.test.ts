import { describe, it, expect } from 'vitest'
import { initialAnalysis, genderEquityAllowableDiff, isRegionalQualifier, suggestStripCount } from '../../src/engine/analysis.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'
import {
  BottleneckCause,
  BottleneckSeverity,
  TournamentType,
  CutMode,
  DeMode,
  VideoPolicy,
} from '../../src/engine/types.ts'
import type { Competition, Bottleneck } from '../../src/engine/types.ts'

// ──────────────────────────────────────────────
// genderEquityAllowableDiff
// ──────────────────────────────────────────────

describe('genderEquityAllowableDiff', () => {
  it.each([
    // [larger_pools, expectedDiff] — table from PRD Section 9.1
    [1,  0],
    [2,  0],
    [3,  0],
    [4,  1],
    [5,  1],
    [7,  1],
    [8,  2],
    [10, 2],
    [11, 2],
    [12, 3],
    [15, 3],
    [20, 3],
  ])('larger_pools=%i → allowable diff %i', (largerPools: number, expected: number) => {
    expect(genderEquityAllowableDiff(largerPools)).toBe(expected)
  })
})

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Make a competition with fencer_count sized so pool count is predictable.
 *  ceil(n/7) pools: 168 fencers → 24 pools, 105 fencers → 15 pools, etc. */
function makeBigComp(id: string, fencerCount: number, overrides: Partial<Competition> = {}): Competition {
  return makeCompetition({ id, fencer_count: fencerCount, ...overrides })
}

// ──────────────────────────────────────────────
// Pass 0 — capacity warning
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 0: capacity warning', () => {
  it('warns when estimated pools/day exceeds strips_total', () => {
    // 4 competitions × 4 pools each = 16 pools, 1 day, 8 strips → warning
    const config = makeConfig({
      strips: makeStrips(8, 0),
      days_available: 1,
      dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
    })
    const competitions = Array.from({ length: 4 }, (_, i) =>
      makeCompetition({
        id: `COMP-${i}`,
        fencer_count: 24, // 24 fencers → 4 pools of 6
      }),
    )
    const dayAssignments: Record<string, number> = {}
    for (const c of competitions) dayAssignments[c.id] = 0

    const result = initialAnalysis(config, competitions, dayAssignments)

    const capacityWarnings = result.warnings.filter(
      (w) => w.phase === 'CAPACITY' && w.cause === BottleneckCause.STRIP_CONTENTION,
    )
    expect(capacityWarnings.length).toBe(1)
    expect(capacityWarnings[0].severity).toBe(BottleneckSeverity.WARN)
    expect(capacityWarnings[0].message).toContain('strips')
  })

  it('does not warn when pools/day fits within strip count', () => {
    // 2 competitions × 4 pools each = 8 pools, 1 day, 10 strips → no warning
    const config = makeConfig({
      strips: makeStrips(10, 0),
      days_available: 1,
      dayConfigs: [{ day_start_time: 480, day_end_time: 1320 }],
    })
    const competitions = [
      makeCompetition({ id: 'A', fencer_count: 24 }),
      makeCompetition({ id: 'B', fencer_count: 24 }),
    ]
    const dayAssignments: Record<string, number> = { A: 0, B: 0 }

    const result = initialAnalysis(config, competitions, dayAssignments)

    const capacityWarnings = result.warnings.filter((w) => w.phase === 'CAPACITY')
    expect(capacityWarnings.length).toBe(0)
  })
})

// ──────────────────────────────────────────────
// Pass 1 — strip deficit
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 1: strip deficit', () => {
  it('30 pools (210 fencers) with 24 strips → STRIP_DEFICIT_NO_FLIGHTING warning + flighting suggestion', () => {
    // ceil(210/7) = 30 pools > 24 strips
    const config = makeConfig({ strips_total: 24 })
    const comp = makeBigComp('big-comp', 210)
    const result = initialAnalysis(config, [comp], { 'big-comp': 0 })

    const deficit = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.STRIP_DEFICIT_NO_FLIGHTING,
    )
    expect(deficit).toBeDefined()
    expect(deficit?.severity).toBe(BottleneckSeverity.WARN)
    expect(deficit?.competition_id).toBe('big-comp')
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.some((s: string) => s.includes('big-comp'))).toBe(true)
  })

  it('10 pools (70 fencers) with 24 strips → no strip deficit warning', () => {
    // ceil(70/7) = 10 pools <= 24 strips
    const config = makeConfig({ strips_total: 24 })
    const comp = makeBigComp('small-comp', 70)
    const result = initialAnalysis(config, [comp], { 'small-comp': 0 })

    const deficit = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.STRIP_DEFICIT_NO_FLIGHTING,
    )
    expect(deficit).toBeUndefined()
  })

  it('competition already flighted → no STRIP_DEFICIT_NO_FLIGHTING warning even if pools > strips', () => {
    const config = makeConfig({ strips_total: 24 })
    // 30 pools, but flighted = true
    const comp = makeBigComp('big-flighted', 210, { flighted: true })
    const result = initialAnalysis(config, [comp], { 'big-flighted': 0 })

    const deficit = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.STRIP_DEFICIT_NO_FLIGHTING,
    )
    expect(deficit).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// Pass 2 — flighting group suggestions
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 2: flighting group suggestions', () => {
  it('two competitions: 30 + 29 pools on same day → flighting group suggestion in result', () => {
    // ceil(210/7)=30, ceil(203/7)=29; 30+29=59 > 55 strips, each fits alone
    // Each fits within poolStripCap (floor(55×0.80)=44), combined (59) exceeds stripsTotal (55)
    const config = makeConfig({ strips_total: 55 })
    const c1 = makeBigComp('large', 210)   // 30 pools
    const c2 = makeBigComp('small', 203)   // 29 pools
    const result = initialAnalysis(config, [c1, c2], { large: 0, small: 0 })

    // Suggestions from suggestFlightingGroups are added as strings
    expect(result.suggestions).toHaveLength(1)
    expect(result.suggestions.some((s: string) => s.includes('large') || s.includes('small'))).toBe(true)
  })

  it('tied pool counts → FLIGHTING_GROUP_MANUAL_NEEDED warning in result', () => {
    // ceil(210/7)=30 pools each; 30+30=60 > 55, each fits alone
    // Each fits within poolStripCap (44), combined (60) exceeds stripsTotal (55)
    const config = makeConfig({ strips_total: 55 })
    const c1 = makeBigComp('tied-a', 210)
    const c2 = makeBigComp('tied-b', 210)
    const result = initialAnalysis(config, [c1, c2], { 'tied-a': 0, 'tied-b': 0 })

    const manualNeeded = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.FLIGHTING_GROUP_MANUAL_NEEDED,
    )
    expect(manualNeeded).toBeDefined()
    expect(manualNeeded?.severity).toBe(BottleneckSeverity.WARN)
  })
})

// ──────────────────────────────────────────────
// Pass 3 — one flighted per day
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 3: one flighted per day', () => {
  it('two flighted competitions estimated same day → MULTIPLE_FLIGHTED_SAME_DAY warning', () => {
    const config = makeConfig()
    const c1 = makeBigComp('flt-1', 70, { flighted: true })
    const c2 = makeBigComp('flt-2', 70, { flighted: true })
    const result = initialAnalysis(config, [c1, c2], { 'flt-1': 1, 'flt-2': 1 })

    const warn = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.MULTIPLE_FLIGHTED_SAME_DAY,
    )
    expect(warn).toBeDefined()
    expect(warn?.severity).toBe(BottleneckSeverity.WARN)
  })

  it('two flighted competitions on different days → no MULTIPLE_FLIGHTED_SAME_DAY warning', () => {
    const config = makeConfig()
    const c1 = makeBigComp('flt-1', 70, { flighted: true })
    const c2 = makeBigComp('flt-2', 70, { flighted: true })
    const result = initialAnalysis(config, [c1, c2], { 'flt-1': 0, 'flt-2': 1 })

    const warn = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.MULTIPLE_FLIGHTED_SAME_DAY,
    )
    expect(warn).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// Pass 4 — video strip peak demand
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 4: video strip demand', () => {
  it('peak concurrent video-required DEs (3) exceeds video_strips_total (2) → VIDEO_STRIP_CONTENTION warning', () => {
    // Three STAGED_DE_BLOCKS + REQUIRED competitions all on same day
    // Override to 2 video strips to trigger the warning
    const configWith2Video = makeConfig({
      strips_total: 24,
      video_strips_total: 2,
    })
    const comps = [
      makeBigComp('vid-1', 42, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-2', 42, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-3', 42, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
    ]
    const dayAssignments = { 'vid-1': 0, 'vid-2': 0, 'vid-3': 0 }

    const result = initialAnalysis(configWith2Video, comps, dayAssignments)

    const warn = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.VIDEO_STRIP_CONTENTION,
    )
    expect(warn).toBeDefined()
    expect(warn?.severity).toBe(BottleneckSeverity.WARN)
  })

  it('no video-required DEs → no VIDEO_STRIP_CONTENTION warning', () => {
    const config = makeConfig()
    // All BEST_EFFORT — no video contention possible
    const comps = [
      makeBigComp('noVid-1', 42, { de_video_policy: VideoPolicy.BEST_EFFORT }),
      makeBigComp('noVid-2', 42, { de_video_policy: VideoPolicy.BEST_EFFORT }),
    ]
    const result = initialAnalysis(config, comps, { 'noVid-1': 0, 'noVid-2': 0 })

    const warn = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.VIDEO_STRIP_CONTENTION,
    )
    expect(warn).toBeUndefined()
  })

  it('video-required DEs that fit within video_strips_total → no VIDEO_STRIP_CONTENTION warning', () => {
    // 2 REQUIRED on same day, 4 video strips available → no contention
    const config = makeConfig() // 4 video strips
    const comps = [
      makeBigComp('vid-1', 42, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-2', 42, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
    ]
    const result = initialAnalysis(config, comps, { 'vid-1': 0, 'vid-2': 0 })

    const warn = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.VIDEO_STRIP_CONTENTION,
    )
    expect(warn).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// Pass 5 — flighting group video conflict
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 5: flighting group video conflict', () => {
  it('both competitions in suggested flighting group require video → VIDEO_STRIP_CONTENTION warning', () => {
    // Two competitions whose combined pools exceed strips, triggering a flighting suggestion.
    // Both have REQUIRED video, which should produce a flighting-video conflict warning.
    // ceil(210/7)=30, ceil(203/7)=29; 30+29=59 > 55 strips, each fits within poolStripCap (44)
    const config = makeConfig({ strips_total: 55 })
    const comp1 = makeBigComp('fg-vid-1', 210, {
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const comp2 = makeBigComp('fg-vid-2', 203, {
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      gender: 'WOMEN',
    })
    const result = initialAnalysis(config, [comp1, comp2], { 'fg-vid-1': 0, 'fg-vid-2': 0 })

    // Should have a flighting suggestion (Pass 2) and a video conflict warning (Pass 5)
    expect(result.suggestions.length).toBeGreaterThan(0)
    const videoWarn = result.warnings.find(
      (w: Bottleneck) =>
        w.cause === BottleneckCause.VIDEO_STRIP_CONTENTION && w.message.includes('Flighting group'),
    )
    expect(videoWarn).toBeDefined()
  })
})

// ──────────────────────────────────────────────
// Pass 6 — cut summary
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 6: cut summary', () => {
  it('PERCENTAGE 20%, 100 fencers → cut summary INFO: 20 promoted, bracket 32', () => {
    const config = makeConfig()
    // cutValue=20 means cut 20%, keep 80%: round(100 * 0.8) = 80 promoted; nextPowerOf2(80) = 128
    const comp = makeBigComp('cuts-comp', 100, {
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const result = initialAnalysis(config, [comp], { 'cuts-comp': 0 })

    const cutInfo = result.warnings.find(
      (w: Bottleneck) => w.competition_id === 'cuts-comp' && w.cause === BottleneckCause.CUT_SUMMARY,
    )
    expect(cutInfo).toBeDefined()
    expect(cutInfo?.severity).toBe(BottleneckSeverity.INFO)
    expect(cutInfo?.message).toMatch(/80/)
    expect(cutInfo?.message).toMatch(/128/)
  })

  it('DISABLED cut_mode → no cut summary', () => {
    const config = makeConfig()
    const comp = makeBigComp('no-cuts', 100, { cut_mode: CutMode.DISABLED })
    const result = initialAnalysis(config, [comp], { 'no-cuts': 0 })

    const cutInfo = result.warnings.find(
      (w: Bottleneck) => w.competition_id === 'no-cuts' && w.severity === BottleneckSeverity.INFO,
    )
    expect(cutInfo).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// Pass 7 — gender equity cap validation (removed from pipeline; genderEquityAllowableDiff still exported)
// ──────────────────────────────────────────────

describe('initialAnalysis — Pass 7: gender equity', () => {
  it('equal fencer counts (both 128) → no GENDER_EQUITY_CAP_VIOLATION', () => {
    const config = makeConfig({ tournament_type: TournamentType.NAC })
    const mens = makeCompetition({
      id: 'men-foil',
      gender: 'MEN',
      weapon: 'FOIL',
      category: 'DIV1',
      fencer_count: 128,
    })
    const womens = makeCompetition({
      id: 'women-foil',
      gender: 'WOMEN',
      weapon: 'FOIL',
      category: 'DIV1',
      fencer_count: 128,
    })
    const result = initialAnalysis(config, [mens, womens], { 'men-foil': 0, 'women-foil': 0 })

    const violation = result.warnings.find(
      (w: Bottleneck) => w.cause === BottleneckCause.GENDER_EQUITY_CAP_VIOLATION,
    )
    expect(violation).toBeUndefined()
  })
})

// ──────────────────────────────────────────────
// isRegionalQualifier
// ──────────────────────────────────────────────

describe('isRegionalQualifier', () => {
  it.each([
    ['RYC', true],
    ['RJCC', true],
    ['ROC', true],
    ['SYC', true],
    ['SJCC', true],
    ['NAC', false],
  ] as const)('%s → %s', (tournamentType, expected) => {
    expect(isRegionalQualifier(makeConfig({ tournament_type: tournamentType }))).toBe(expected)
  })
})

// ──────────────────────────────────────────────
// Statelessness
// ──────────────────────────────────────────────

describe('initialAnalysis — statelessness', () => {
  it('calling twice with same input produces identical output', () => {
    const config = makeConfig({ tournament_type: TournamentType.NAC })
    const comps = [
      makeBigComp('comp-a', 140, { de_mode: DeMode.STAGED_DE_BLOCKS, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('comp-b', 84, { cut_mode: CutMode.PERCENTAGE, cut_value: 25 }),
    ]
    const dayAssignments = { 'comp-a': 0, 'comp-b': 0 }

    const r1 = initialAnalysis(config, comps, dayAssignments)
    const r2 = initialAnalysis(config, comps, dayAssignments)

    expect(r1).toEqual(r2)
  })
})

// ──────────────────────────────────────────────
// suggestStripCount
// ──────────────────────────────────────────────

describe('suggestStripCount', () => {
  it('returns max pool count across all competitions', () => {
    // comp-a: 24 fencers → ceil(24/7)=4 pools; comp-b: 49 fencers → ceil(49/7)=7 pools
    const compA = makeCompetition({ id: 'comp-a', fencer_count: 24 }) // 4 pools
    const compB = makeCompetition({ id: 'comp-b', fencer_count: 49 }) // 7 pools

    expect(suggestStripCount([compA, compB])).toBe(7)
  })

  it('returns the single competition pool count with one competition', () => {
    // 70 fencers → ceil(70/7) = 10 pools
    const comp = makeCompetition({ id: 'solo', fencer_count: 70 })

    expect(suggestStripCount([comp])).toBe(10)
  })

  it('returns 0 for empty competition list', () => {
    expect(suggestStripCount([])).toBe(0)
  })

  it('skips competitions with fencer_count <= 1 (no pools to run)', () => {
    const invalid = makeCompetition({ id: 'invalid', fencer_count: 1 })
    const valid = makeCompetition({ id: 'valid', fencer_count: 14 }) // ceil(14/7)=2 pools

    expect(suggestStripCount([invalid, valid])).toBe(2)
  })
})
