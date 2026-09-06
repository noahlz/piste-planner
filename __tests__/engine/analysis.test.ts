import { describe, it, expect } from 'vitest'
import { initialAnalysis, genderEquityAllowableDiff, isRegionalQualifier, suggestStripCount } from '../../src/engine/analysis.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'
import {
  BottleneckCause,
  BottleneckSeverity,
  Category,
  Gender,
  TournamentType,
  Weapon,
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
    // 4 comps × ceil(24/7)=4 pools each = 16 total pools; 8 strips available on day 1
    expect(capacityWarnings[0].message).toContain('~16 pools')
    expect(capacityWarnings[0].message).toContain('8 strips')
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
    // Three STAGED + REQUIRED competitions all on same day
    // Override to 2 video strips to trigger the warning
    const configWith2Video = makeConfig({
      strips_total: 24,
      video_strips_total: 2,
    })
    const comps = [
      makeBigComp('vid-1', 42, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-2', 42, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-3', 42, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
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
      makeBigComp('vid-1', 42, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('vid-2', 42, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
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
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const comp2 = makeBigComp('fg-vid-2', 203, {
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      gender: Gender.WOMEN,
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
      gender: Gender.MEN,
      weapon: Weapon.FOIL,
      category: Category.DIV1,
      fencer_count: 128,
    })
    const womens = makeCompetition({
      id: 'women-foil',
      gender: Gender.WOMEN,
      weapon: Weapon.FOIL,
      category: Category.DIV1,
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
      makeBigComp('comp-a', 140, { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }),
      makeBigComp('comp-b', 84, { cut_mode: CutMode.PERCENTAGE, cut_value: 25 }),
    ]
    const dayAssignments = { 'comp-a': 0, 'comp-b': 0 }

    const r1 = initialAnalysis(config, comps, dayAssignments)
    const r2 = initialAnalysis(config, comps, dayAssignments)

    expect(r1).toEqual(r2)
  })
})

// ──────────────────────────────────────────────
// suggestStripCount — busiest-day-sum rule (011 US2, research.md D4)
// ──────────────────────────────────────────────
//
// Pool counts referenced below (computePoolStructure: ceil(n/7) above 9
// fencers):
//   70 fencers → 10 pools
//   42 fencers → 6 pools
//   35 fencers → 5 pools
//
// The shared three-event set is built so the largest single event's demand
// (10) and the busiest day's summed demand (11, at days_available=2) differ
// by construction — a max-over-events implementation cannot pass these.
// New signature: suggestStripCount(competitions, daysAvailable, maxPoolStripPct).

describe('suggestStripCount', () => {
  const evtA = makeCompetition({ id: 'evt-a', fencer_count: 70 }) // 10 pools
  const evtB = makeCompetition({ id: 'evt-b', fencer_count: 42 }) // 6 pools
  const evtC = makeCompetition({ id: 'evt-c', fencer_count: 35 }) // 5 pools
  const threeEvents = [evtA, evtB, evtC]

  it('sizes for the busiest day, not the largest event, across multiple days', () => {
    // 2 days: LPT packs evt-a (10) alone, then evt-b+evt-c (6+5=11) into the
    // other day. Busiest day is 11. The MAX rule (today's dead
    // implementation) returns 10 — these differ, so a max-rule
    // implementation cannot pass this assertion.
    // ceil(11 / 0.80) = 14.
    expect(suggestStripCount(threeEvents, 2, 0.8)).toBe(14)
  })

  it('sums every event when there is only one day', () => {
    // 1 day: every event shares it, so the answer is the sum over ALL
    // events: 10 + 6 + 5 = 21. ceil(21 / 0.80) = 27. The MAX rule would
    // return 10 — far below this.
    expect(suggestStripCount(threeEvents, 1, 0.8)).toBe(27)
  })

  it('falls back to the single largest event when days outnumber events', () => {
    // 5 days, 3 events: each event lands alone in its own empty group before
    // any group holds two, so the busiest group's total IS the largest
    // single event's demand: 10. This is the one case where MAX and SUM
    // legitimately coincide — not proof of a max-rule implementation, just
    // the degenerate case where the two rules agree by construction.
    // ceil(10 / 0.80) = 13.
    expect(suggestStripCount(threeEvents, 5, 0.8)).toBe(13)
  })

  it('applies the max_pool_strip_pct divisor — different percentages give different answers', () => {
    // Same 3 events, 2 days → busiest day is 11 pools (see first test above).
    expect(suggestStripCount(threeEvents, 2, 0.8)).toBe(14) // ceil(11/0.80)=14
    expect(suggestStripCount(threeEvents, 2, 0.6)).toBe(19) // ceil(11/0.60)=19
  })

  it('is deterministic across repeated calls with identical inputs', () => {
    const first = suggestStripCount(threeEvents, 2, 0.8)
    const second = suggestStripCount(threeEvents, 2, 0.8)
    expect(first).toBe(second)
    expect(first).toBe(14)
  })

  it('adjusts even the single-event degenerate case for the pool strip percentage', () => {
    // One event, any day count: the busiest (only) group is that event's
    // pool count. Unlike today's dead max-rule (which returns the raw pool
    // count, 10, with no percentage applied), the suggestion divides by
    // max_pool_strip_pct: ceil(10 / 0.80) = 13.
    const solo = makeCompetition({ id: 'solo', fencer_count: 70 }) // 10 pools
    expect(suggestStripCount([solo], 3, 0.8)).toBe(13)
  })

  it('excludes an unsizeable competition from the partition and still sizes the rest', () => {
    // A mixed list: one competition below the minimum fencer count alongside a
    // sizeable one. `computePoolStructure` THROWS for fencer_count <= 1
    // (pools.ts:26), so an implementation that sizes every competition
    // unconditionally raises rather than returning a number. The invalid entry
    // contributes nothing to the partition and the valid one is sized normally:
    // busiest group is evt-c's 5 pools, ceil(5 / 0.80) = 7.
    const mixed = [makeCompetition({ id: 'bye', fencer_count: 1 }), evtC]
    expect(suggestStripCount(mixed, 2, 0.8)).toBe(7)
  })

  // Relocated from the deleted `src/store/__tests__/stripSuggestion.test.ts`
  // (011 T012). Both cases exercise `poolCountFor`'s inputs through the
  // suggestion, which the cases above never reach: every fixture there is a
  // multi-pool event with the override off.

  it('honours use_single_pool_override — one pool, not the fencer count divided', () => {
    // The override is honoured at exactly 10 fencers and nowhere else
    // (`pools.ts:28`), so 10 is the only count where the flag can be shown to
    // reach `poolCountFor`: 2 pools off, 1 pool on. The two answers differ, so
    // an implementation that drops the flag fails the second assertion.
    const split = makeCompetition({ id: 'split', fencer_count: 10, use_single_pool_override: false })
    const single = makeCompetition({ id: 'single', fencer_count: 10, use_single_pool_override: true })
    expect(suggestStripCount([split], 1, 0.8)).toBe(3) // ceil(2 / 0.80) = 3
    expect(suggestStripCount([single], 1, 0.8)).toBe(2) // ceil(1 / 0.80) = 2
  })

  it('sizes a competition small enough for a single pool (≤9 fencers)', () => {
    // 8 fencers form one pool without any override. The suggestion still
    // applies the percentage: ceil(1 / 0.80) = 2, not the bare pool count.
    const tiny = makeCompetition({ id: 'tiny', fencer_count: 8 })
    expect(suggestStripCount([tiny], 3, 0.8)).toBe(2)
  })

  describe('FR-010 — no sizeable competition reports the absence of an answer, not zero', () => {
    it('returns null for an empty competition list', () => {
      expect(suggestStripCount([], 2, 0.8)).toBeNull()
    })

    it('returns null when every competition has no fencers entered', () => {
      // The store's own starting state for a freshly selected event
      // (`defaultConfigForId` leaves `fencer_count` at 0), so this is the
      // condition the Suggest button meets before any count is typed. 0 is
      // below the same minimum as 1 and is skipped the same way — what must
      // not happen is the button writing 0 into the strip field.
      const empty = [
        makeCompetition({ id: 'empty-1', fencer_count: 0 }),
        makeCompetition({ id: 'empty-2', fencer_count: 0 }),
      ]
      expect(suggestStripCount(empty, 2, 0.8)).toBeNull()
    })

    it('returns null when every competition is below the minimum fencer count', () => {
      // fencer_count <= 1 cannot form a pool (computePoolStructure throws)
      // and is skipped, same as today's dead implementation. With nothing
      // left to size, the answer must be the ABSENCE of a number — the old
      // rule's 0 would be written into the strip field as a valid
      // configuration.
      const unsizeable = [
        makeCompetition({ id: 'bye-1', fencer_count: 1 }),
        makeCompetition({ id: 'bye-2', fencer_count: 1 }),
      ]
      expect(suggestStripCount(unsizeable, 2, 0.8)).toBeNull()
    })
  })
})
