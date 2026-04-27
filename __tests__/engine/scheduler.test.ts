import { describe, it, expect } from 'vitest'
import {
  Category,
  EventType,
  Gender,
  TournamentType,
  Weapon,
  DeMode,
  VideoPolicy,
  RefPolicy,
  BottleneckCause,
  BottleneckSeverity,
  Phase,
  VetAgeGroup,
} from '../../src/engine/types.ts'
import type {
  Competition,
  ScheduleResult,
} from '../../src/engine/types.ts'
import {
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { scheduleAll, sortWithPairs, postScheduleWarnings, postScheduleDiagnostics, postScheduleDayBreakdown } from '../../src/engine/scheduler.ts'
import { createGlobalState } from '../../src/engine/resources.ts'
import {
  makeStrips,
  makeConfig,
  makeCompetition,
  makeScheduleResult,
} from '../helpers/factories.ts'

/**
 * Builds full Competition objects from a template's catalogue IDs.
 * Uses catalogue entries for demographic fields, applies sensible defaults
 * for scheduling parameters based on category.
 */
function competitionsFromTemplate(templateName: string, fencerCount = 24): Competition[] {
  const ids = TEMPLATES[templateName]
  if (!ids) throw new Error(`Unknown template: ${templateName}`)

  return ids.map(id => {
    const entry = findCompetition(id)
    if (!entry) throw new Error(`Catalogue entry not found: ${id}`)

    const cut = DEFAULT_CUT_BY_CATEGORY[entry.category]
    const videoPolicy = DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category]

    return makeCompetition({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,
      fencer_count: fencerCount,
      cut_mode: cut.mode,
      cut_value: cut.value,
      de_video_policy: videoPolicy,
      de_mode: videoPolicy === VideoPolicy.REQUIRED
        ? DeMode.STAGED
        : DeMode.SINGLE_STAGE,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

// ──────────────────────────────────────────────
// scheduleAll — integration tests using templates
// ──────────────────────────────────────────────

describe('scheduleAll — template integration', () => {
  it('NAC Youth (3 days, 24 events): all events scheduled, no day overflow', () => {
    // Refs increased from 40/20 to 60/30 to accommodate the larger ADMIN_GAP_MINS (30 min),
    // which raises each competition's total duration and tightens daily resource budgets.
    const config = makeConfig({
      days_available: 3,
      // 96 strips / 24 video: capacity-aware day assignment may cluster more events
      // per day than before. With tiny fencer counts (fencer_count=10), the capacity
      // penalty thresholds are not reached, so events don't self-balance as they would
      // in a real tournament. Extra strips prevent resource-window exhaustion when
      // many events concentrate on the same day. Each Cadet R16 needs 4 video strips;
      // up to 6 concurrent R16 phases (all 6 Cadet events on one day) need 24.
      strips: makeStrips(96, 24),
      MAX_RESCHEDULE_ATTEMPTS: 8,
    })
    // fencer_count=10: minimum that produces ≥2 promoted fencers with 20% PERCENTAGE cut
    // (round(10 × 0.20) = 2). Using 6 would fail validation.
    const comps = competitionsFromTemplate('NAC Youth', 10)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // All 24 events scheduled
    expect(Object.keys(schedule)).toHaveLength(comps.length)

    // Every result has an assigned_day within bounds
    for (const result of Object.values(schedule) as ScheduleResult[]) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(3)
    }

    // No unresolvable errors
    const errors = bottlenecks.filter((b: { severity: string }) => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
  })

  it('ROC Div1A/Vet (2 days, 42 events): all events fit in 2 days', () => {
    // 42 events (D1A: 6 IND + VET: 36 IND across 6 age groups), small fields of 8
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(96, 4),
    })
    const comps = competitionsFromTemplate('ROC Div1A/Vet', 8)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(comps.length)

    for (const result of Object.values(schedule) as ScheduleResult[]) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(2)
    }

    const errors = bottlenecks.filter((b: { severity: string }) => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
  })

  it('RYC Weekend (2 days, 18 events): all events scheduled', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(56, 2),
    })
    const comps = competitionsFromTemplate('RYC Weekend', 8)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(comps.length)

    for (const result of Object.values(schedule) as ScheduleResult[]) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(2)
    }

    const errors = bottlenecks.filter((b: { severity: string }) => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// scheduleAll — constraint scenarios
// ──────────────────────────────────────────────

describe('scheduleAll — constraint scenarios', () => {
  it('constrained strips (16 strips, many competitions) generates bottlenecks', () => {
    const config = makeConfig({
      days_available: 3,
      strips: makeStrips(16, 2),
    })
    // 6 small events across different demographics on constrained strips
    const comps = [
      makeCompetition({ id: 'c1', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 16, strips_allocated: 6 }),
      makeCompetition({ id: 'c2', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.FOIL, fencer_count: 16, strips_allocated: 6 }),
      makeCompetition({ id: 'c3', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.EPEE, fencer_count: 16, strips_allocated: 6 }),
      makeCompetition({ id: 'c4', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 16, strips_allocated: 6 }),
      makeCompetition({ id: 'c5', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.SABRE, fencer_count: 16, strips_allocated: 6 }),
      makeCompetition({ id: 'c6', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.SABRE, fencer_count: 16, strips_allocated: 6 }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // All events should still be scheduled (may have delays)
    expect(Object.keys(schedule)).toHaveLength(comps.length)

    // Expect at least one resource-contention bottleneck from strip/ref pressure
    const contentionCauses = new Set([
      BottleneckCause.STRIP_CONTENTION,
      BottleneckCause.REFEREE_CONTENTION,
      BottleneckCause.STRIP_AND_REFEREE_CONTENTION,
    ])
    const contentionBottlenecks = bottlenecks.filter(b => contentionCauses.has(b.cause as typeof BottleneckCause.STRIP_CONTENTION))
    expect(contentionBottlenecks.length).toBeGreaterThan(0)
  })

  it('zero video strips produces no VIDEO_STRIP_CONTENTION bottlenecks', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(48, 0), // no video strips
    })
    // Small non-conflicting events with BEST_EFFORT video on zero video strips
    const comps = [
      makeCompetition({ id: 'c1', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 6, strips_allocated: 4 }),
      makeCompetition({ id: 'c2', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 6, strips_allocated: 4 }),
      makeCompetition({ id: 'c3', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.SABRE, fencer_count: 6, strips_allocated: 4 }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(comps.length)

    const videoBottlenecks = bottlenecks.filter(
      (b: { cause: string }) => b.cause === BottleneckCause.VIDEO_STRIP_CONTENTION,
    )
    expect(videoBottlenecks).toHaveLength(0)
  })

  it('single-day-equivalent: 6 non-conflicting events all fit within same valid config', () => {
    // days_available must be >= 2 for valid config; use 2 days but events should still land on day 0
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(32, 4),
    })
    // 6 small events across different weapons/genders to minimize crossover
    const comps = [
      makeCompetition({ id: 'c1', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.FOIL, fencer_count: 8, strips_allocated: 4 }),
      makeCompetition({ id: 'c2', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.FOIL, fencer_count: 8, strips_allocated: 4 }),
      makeCompetition({ id: 'c3', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.EPEE, fencer_count: 8, strips_allocated: 4 }),
      makeCompetition({ id: 'c4', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.EPEE, fencer_count: 8, strips_allocated: 4 }),
      makeCompetition({ id: 'c5', category: Category.DIV1A, gender: Gender.MEN, weapon: Weapon.SABRE, fencer_count: 8, strips_allocated: 4 }),
      makeCompetition({ id: 'c6', category: Category.DIV1A, gender: Gender.WOMEN, weapon: Weapon.SABRE, fencer_count: 8, strips_allocated: 4 }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // All 6 events should schedule with no errors
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
    expect(Object.keys(schedule)).toHaveLength(6)
  })
})

// ──────────────────────────────────────────────
// sortWithPairs
// ──────────────────────────────────────────────

describe('sortWithPairs', () => {
  it('priority competition immediately before its flighted partner', () => {
    const config = makeConfig()
    const priority = makeCompetition({
      id: 'priority-comp',
      is_priority: true,
      flighting_group_id: 'group-1',
      fencer_count: 100,
    })
    const flighted = makeCompetition({
      id: 'flighted-comp',
      flighted: true,
      flighting_group_id: 'group-1',
      fencer_count: 100,
    })
    const other = makeCompetition({
      id: 'other-comp',
      fencer_count: 50,
      category: Category.DIV1A,
    })

    const comps = [flighted, other, priority]
    const sorted = sortWithPairs(comps, config)

    const priorityIdx = sorted.findIndex((c: Competition) => c.id === 'priority-comp')
    const flightedIdx = sorted.findIndex((c: Competition) => c.id === 'flighted-comp')

    // Priority must be immediately before its flighted partner
    expect(flightedIdx).toBe(priorityIdx + 1)
  })

  it('most constrained competitions first (by constraint_score)', () => {
    const config = makeConfig()
    // Competition with tighter window → higher constraint score
    const tight = makeCompetition({
      id: 'tight',
      earliest_start: 480,
      latest_end: 600,
      category: Category.CADET,
      weapon: Weapon.SABRE,
      ref_policy: RefPolicy.TWO,
    })
    const loose = makeCompetition({
      id: 'loose',
      earliest_start: 0,
      latest_end: 9999,
      category: Category.DIV1A,
      weapon: Weapon.EPEE,
      ref_policy: RefPolicy.ONE,
    })

    const sorted = sortWithPairs([loose, tight], config)

    // tight should come first (higher constraint_score)
    expect(sorted[0].id).toBe('tight')
    expect(sorted[1].id).toBe('loose')
  })

  it('optional events after all mandatory', () => {
    const config = makeConfig()
    const mandatory = makeCompetition({ id: 'mandatory', optional: false })
    const optional = makeCompetition({ id: 'optional', optional: true })

    const sorted = sortWithPairs([optional, mandatory], config)

    expect(sorted[0].id).toBe('mandatory')
    expect(sorted[1].id).toBe('optional')
  })
})

// ──────────────────────────────────────────────
// postScheduleWarnings
// ──────────────────────────────────────────────

describe('postScheduleWarnings', () => {
  it('4-day tournament, first day longest: warning generated', () => {
    const config = makeConfig({ days_available: 4 })

    // Build schedule where day 0 ends much later than middle days
    const schedule: Record<string, ScheduleResult> = {}
    // Day 0: long event (pool 480..600, DE 615..900)
    schedule['long-event'] = {
      ...makeScheduleResult('long-event', 0),
      pool_start: 480,
      pool_end: 600,
      de_total_end: 900,
    }
    // Day 1: short event (pool 1320..1380, DE 1395..1500)
    schedule['day1-event'] = {
      ...makeScheduleResult('day1-event', 1),
      pool_start: 1320,
      pool_end: 1380,
      de_total_end: 1500,
    }
    // Day 2: short event (pool 2160..2220, DE 2235..2340)
    schedule['day2-event'] = {
      ...makeScheduleResult('day2-event', 2),
      pool_start: 2160,
      pool_end: 2220,
      de_total_end: 2340,
    }
    // Day 3: short event (pool 3000..3060, DE 3075..3180)
    schedule['day3-event'] = {
      ...makeScheduleResult('day3-event', 3),
      pool_start: 3000,
      pool_end: 3060,
      de_total_end: 3180,
    }

    const warnings = postScheduleWarnings(schedule, config)

    // Day 0 duration: 900 - dayStart(0)=0 = 900 min
    // Middle days (1-2) avg: (660 + 660) / 2 = 660 min
    // 900 > 660 → first-day warning fires
    const firstDayWarning = warnings.find((w: { message: string }) => w.message.includes('First day'))
    expect(firstDayWarning).toBeDefined()

    // Day 3 duration: 3180 - dayStart(3)=2520 = 660 min = avg middle → no warning
    const lastDayWarning = warnings.find((w: { message: string }) => w.message.includes('Last day'))
    expect(lastDayWarning).toBeUndefined()
  })

  it('4-day tournament, first day only 5% over avg middle → no warning (below 10% threshold)', () => {
    // dayStart(d) = d * DAY_LENGTH_MINS (840) when dayConfigs is empty.
    // Target avg middle = 600 min. Middle events end at dayStart + 600.
    // First day: 630 min (5% over 600). Threshold 10%: 630 <= 600*1.1=660 → no warn.
    const config = makeConfig({ days_available: 4 })
    const schedule: Record<string, ScheduleResult> = {}

    // Day 0: dayStart=0; ends at 0+630=630 → duration 630
    schedule['day0-event'] = {
      ...makeScheduleResult('day0-event', 0),
      pool_start: 0,
      pool_end: 300,
      de_total_end: 630,
    }
    // Day 1 (middle): dayStart=840; ends at 840+600=1440 → duration 600
    schedule['day1-event'] = {
      ...makeScheduleResult('day1-event', 1),
      pool_start: 840,
      pool_end: 1100,
      de_total_end: 1440,
    }
    // Day 2 (middle): dayStart=1680; ends at 1680+600=2280 → duration 600
    schedule['day2-event'] = {
      ...makeScheduleResult('day2-event', 2),
      pool_start: 1680,
      pool_end: 1940,
      de_total_end: 2280,
    }
    // Day 3 (last): dayStart=2520; ends at 2520+500=3020 → duration 500 (no last-day warning)
    schedule['day3-event'] = {
      ...makeScheduleResult('day3-event', 3),
      pool_start: 2520,
      pool_end: 2720,
      de_total_end: 3020,
    }

    const warnings = postScheduleWarnings(schedule, config)

    // First day: 630, avg middle: 600. 630 <= 660 → no warning.
    const firstDayWarning = warnings.find((w: { message: string }) => w.message.includes('First day'))
    expect(firstDayWarning).toBeUndefined()
  })

  it('4-day tournament, first day 15% over avg middle → warning fires', () => {
    // Middle avg = 600 min. First day = 690 (15% over). 690 > 600*1.1=660 → fires.
    const config = makeConfig({ days_available: 4 })
    const schedule: Record<string, ScheduleResult> = {}

    // Day 0: dayStart=0; ends at 690 → duration 690
    schedule['day0-event'] = {
      ...makeScheduleResult('day0-event', 0),
      pool_start: 0,
      pool_end: 350,
      de_total_end: 690,
    }
    // Day 1 (middle): dayStart=840; ends at 840+600=1440 → duration 600
    schedule['day1-event'] = {
      ...makeScheduleResult('day1-event', 1),
      pool_start: 840,
      pool_end: 1100,
      de_total_end: 1440,
    }
    // Day 2 (middle): dayStart=1680; ends at 1680+600=2280 → duration 600
    schedule['day2-event'] = {
      ...makeScheduleResult('day2-event', 2),
      pool_start: 1680,
      pool_end: 1940,
      de_total_end: 2280,
    }
    // Day 3 (last): dayStart=2520; ends at 2520+500=3020 → duration 500 (no last-day warning)
    schedule['day3-event'] = {
      ...makeScheduleResult('day3-event', 3),
      pool_start: 2520,
      pool_end: 2720,
      de_total_end: 3020,
    }

    const warnings = postScheduleWarnings(schedule, config)

    // First day: 690, avg middle: 600. 690 > 660 → fires.
    const firstDayWarning = warnings.find((w: { message: string }) => w.message.includes('First day'))
    expect(firstDayWarning).toBeDefined()
  })

  it('3-day tournament: no first/last day warning (only applies to 4+)', () => {
    const config = makeConfig({ days_available: 3 })

    const schedule: Record<string, ScheduleResult> = {}
    schedule['day0-event'] = {
      ...makeScheduleResult('day0-event', 0),
      pool_start: 480,
      pool_end: 600,
      de_total_end: 900,
    }
    schedule['day1-event'] = {
      ...makeScheduleResult('day1-event', 1),
      pool_start: 1320,
      pool_end: 1380,
      de_total_end: 1500,
    }

    const warnings = postScheduleWarnings(schedule, config)

    expect(warnings).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// scheduleAll — validation integration
// ──────────────────────────────────────────────

describe('scheduleAll — validation integration', () => {
  it('returns ERROR bottleneck and empty schedule when strips_total is zero', () => {
    // strips_total=0 is an ERROR-level validation failure; scheduling should bail out
    const config = makeConfig({
      strips: makeStrips(0, 0),
    })
    const comps = [
      makeCompetition({ id: 'c1' }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(0)
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain('strips_total')
  })

  it('carries WARN bottleneck forward and still schedules when REQUIRED video + SINGLE_STAGE', () => {
    // REQUIRED video policy with SINGLE_STAGE de_mode is a WARN, not an ERROR,
    // so scheduling should proceed and the warning should appear in bottlenecks
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(24, 4),
    })
    const comps = [
      makeCompetition({
        id: 'warn-comp',
        de_video_policy: VideoPolicy.REQUIRED,
        de_mode: DeMode.SINGLE_STAGE,
        fencer_count: 8,
        strips_allocated: 4,
      }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // Competition should still be scheduled
    expect(Object.keys(schedule)).toHaveLength(1)
    // WARN bottleneck from validation should be present
    const warns = bottlenecks.filter(b => b.severity === BottleneckSeverity.WARN)
    expect(warns.length).toBeGreaterThan(0)
    expect(warns.some(w => w.message.includes('REQUIRED video policy'))).toBe(true)
  })
})

// ──────────────────────────────────────────────
// scheduleAll — graceful degradation (BUG-1)
// ──────────────────────────────────────────────

describe('scheduleAll — graceful degradation on resource exhaustion', () => {
  it('returns partial schedule with ERROR bottleneck when mandatory competition fails', () => {
    // 2 days (minimum valid) with very limited strips — early competitions fit but
    // later ones exhaust all time slots and fail to schedule.
    // Using diverse demographics (different category/gender/weapon per pair) avoids
    // triggering same-population validation errors.
    const config = makeConfig({
      tournament_type: TournamentType.RJCC,
      days_available: 2,
      strips: makeStrips(4, 0),
    })

    // 10 competitions each wanting all 4 strips, across enough demographic variation
    // to avoid same-population errors (max 2 per population for 2 days)
    const weapons = [Weapon.FOIL, Weapon.EPEE, Weapon.SABRE] as const
    const genders = [Gender.MEN, Gender.WOMEN] as const
    const categories = [Category.DIV1, Category.DIV1A, Category.DIV2, Category.DIV3, Category.JUNIOR, Category.CADET] as const
    const competitions: Competition[] = Array.from({ length: 10 }, (_, i) =>
      makeCompetition({
        id: `COMP-${i}`,
        gender: genders[i % 2],
        category: categories[i % categories.length],
        weapon: weapons[i % 3],
        event_type: EventType.INDIVIDUAL,
        fencer_count: 16,
        strips_allocated: 4,
        // Wide-open time window so validation doesn't reject on earliest/latest
        earliest_start: 0,
        latest_end: 9999,
      }),
    )

    // Should NOT throw — should return partial results
    const result = scheduleAll(competitions, config)

    // At least 2 competitions should have been scheduled (4 strips supports ≥ 2 events)
    expect(Object.keys(result.schedule).length).toBeGreaterThanOrEqual(2)
    // But not all — at least 2 should have failed given strip exhaustion across 10 events
    expect(Object.keys(result.schedule).length).toBeLessThanOrEqual(competitions.length - 2)
    // Failed competitions produce ERROR bottlenecks
    const errorBottlenecks = result.bottlenecks.filter(
      (b) => b.severity === BottleneckSeverity.ERROR,
    )
    expect(errorBottlenecks.length).toBeGreaterThan(0)
    for (const b of errorBottlenecks) {
      expect(b.competition_id).toMatch(/^COMP-\d+$/)
      expect(b.message).toEqual(expect.stringContaining('No'))
      expect(b.phase).toBe('SCHEDULING')
    }
  })

  it('still throws non-SchedulingError exceptions', () => {
    expect(() =>
      scheduleAll([], null as unknown as Parameters<typeof scheduleAll>[1]),
    ).toThrow(TypeError)
  })
})

// ──────────────────────────────────────────────
// scheduleAll — repair loop
// ──────────────────────────────────────────────

describe('scheduleAll — repair loop', () => {
  it('moves events to a viable day when their coloring-assigned day is too short', () => {
    // Day 0: 60 min — too short for pools + DE with 16 fencers (~90+ min needed).
    // Day 1: normal 840 min — events can schedule here.
    // DSatur coloring is capacity-unaware, so it may assign events to day 0.
    // The repair loop detects the failure and moves them to day 1.
    const config = makeConfig({
      days_available: 2,
      dayConfigs: [
        { day_start_time: 0, day_end_time: 60 },
        { day_start_time: 840, day_end_time: 1680 },
      ],
      strips: makeStrips(24, 4),
    })

    // Two non-conflicting events (different demographics = no hard constraints)
    const comps = [
      makeCompetition({
        id: 'repair-1',
        fencer_count: 16,
        strips_allocated: 4,
        gender: Gender.MEN,
        weapon: Weapon.FOIL,
        category: Category.DIV1A,
      }),
      makeCompetition({
        id: 'repair-2',
        fencer_count: 16,
        strips_allocated: 4,
        gender: Gender.WOMEN,
        weapon: Weapon.EPEE,
        category: Category.DIV1A,
      }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // Both should be scheduled with no errors
    expect(Object.keys(schedule)).toHaveLength(2)
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)

    // Both events must end up on day 1 (day 0 is too short for any event)
    expect(schedule['repair-1'].assigned_day).toBe(1)
    expect(schedule['repair-2'].assigned_day).toBe(1)

    // If the repair loop ran, it leaves a DEADLINE_BREACH WARN bottleneck with "repaired".
    // If coloring assigned directly to day 1, no repair bottleneck exists — both are valid.
    // The key assertion is that both events end up on day 1 regardless of path.
  })

  it('produces ERROR bottleneck when no day can fit the event', () => {
    // Both days are 30 min with 1 strip — 100 fencers need far more time and strips.
    // Neither the coloring-assigned day nor any repair alternative can fit.
    const config = makeConfig({
      tournament_type: TournamentType.RJCC,
      days_available: 2,
      dayConfigs: [
        { day_start_time: 0, day_end_time: 30 },
        { day_start_time: 840, day_end_time: 870 },
      ],
      strips: makeStrips(1, 0),
    })

    const comps = [
      makeCompetition({
        id: 'impossible-1',
        fencer_count: 100,
        strips_allocated: 1,
        gender: Gender.MEN,
        weapon: Weapon.FOIL,
        category: Category.DIV1,
        earliest_start: 0,
        latest_end: 9999,
      }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // Event should not be scheduled
    expect(Object.keys(schedule)).toHaveLength(0)
    // At least one ERROR bottleneck produced
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors.length).toBeGreaterThan(0)
  })
})

// ──────────────────────────────────────────────
// scheduleAll — postScheduleWarnings integration
// ──────────────────────────────────────────────

describe('scheduleAll — postScheduleWarnings integration', () => {
  it('4-day tournament with imbalanced first day: POST_SCHEDULE bottlenecks appear in result', () => {
    // Force day 0 to be much longer by packing it with heavy competitions (latest_end: 840
    // constrains them to day 0 only, since dayStart(0)=0 and day 0 ends at 840 in default config).
    // Middle days (1–2) get a single light competition each, producing a short duration.
    // This guarantees postScheduleWarnings fires a "First day" warning.
    const config = makeConfig({
      days_available: 4,
      strips: makeStrips(64, 4),
    })

    // Heavy events locked to day 0 (latest_end=840 means they cannot start after 840=dayStart(1))
    const day0Comps = [
      makeCompetition({ id: 'd0-foil-m',   gender: Gender.MEN,   weapon: Weapon.FOIL,  category: Category.DIV1A, fencer_count: 32, strips_allocated: 8, latest_end: 840 }),
      makeCompetition({ id: 'd0-foil-w',   gender: Gender.WOMEN, weapon: Weapon.FOIL,  category: Category.DIV1A, fencer_count: 32, strips_allocated: 8, latest_end: 840 }),
      makeCompetition({ id: 'd0-epee-m',   gender: Gender.MEN,   weapon: Weapon.EPEE,  category: Category.DIV1A, fencer_count: 32, strips_allocated: 8, latest_end: 840 }),
      makeCompetition({ id: 'd0-epee-w',   gender: Gender.WOMEN, weapon: Weapon.EPEE,  category: Category.DIV1A, fencer_count: 32, strips_allocated: 8, latest_end: 840 }),
    ]

    // Light events that can roam freely (will land on days 1–3)
    const lightComps = [
      makeCompetition({ id: 'light-1', gender: Gender.MEN,   weapon: Weapon.SABRE, category: Category.DIV2, fencer_count: 6, strips_allocated: 2, earliest_start: 840  }),
      makeCompetition({ id: 'light-2', gender: Gender.WOMEN, weapon: Weapon.SABRE, category: Category.DIV2, fencer_count: 6, strips_allocated: 2, earliest_start: 840  }),
      makeCompetition({ id: 'light-3', gender: Gender.MEN,   weapon: Weapon.FOIL,  category: Category.DIV2, fencer_count: 6, strips_allocated: 2, earliest_start: 840  }),
      makeCompetition({ id: 'light-4', gender: Gender.WOMEN, weapon: Weapon.FOIL,  category: Category.DIV2, fencer_count: 6, strips_allocated: 2, earliest_start: 840  }),
    ]

    const comps = [...day0Comps, ...lightComps]
    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // Determine what postScheduleWarnings would produce for this schedule
    const expectedWarnings = postScheduleWarnings(schedule, config)

    // The test is only meaningful if the schedule actually produces an imbalance
    expect(expectedWarnings.length).toBeGreaterThan(0)

    // All postScheduleWarnings must appear in the scheduleAll bottleneck list
    // Filter by cause to exclude DAY_RESOURCE_SUMMARY entries added by postScheduleDayBreakdown
    const warningBottlenecks = bottlenecks.filter(
      b => b.phase === 'POST_SCHEDULE' && b.cause === BottleneckCause.SCHEDULE_ACCEPTED_WITH_WARNINGS,
    )
    expect(warningBottlenecks).toHaveLength(expectedWarnings.length)
    for (const w of expectedWarnings) {
      expect(warningBottlenecks.some(b => b.message === w.message)).toBe(true)
    }
  })

  it('3-day tournament: no POST_SCHEDULE bottlenecks in scheduleAll result', () => {
    const config = makeConfig({
      days_available: 3,
      strips: makeStrips(32, 4),
    })
    const comps = [
      makeCompetition({ id: 'c1', gender: Gender.MEN,   weapon: Weapon.FOIL,  category: Category.DIV1A, fencer_count: 16, strips_allocated: 4 }),
      makeCompetition({ id: 'c2', gender: Gender.WOMEN, weapon: Weapon.EPEE,  category: Category.DIV1A, fencer_count: 16, strips_allocated: 4 }),
      makeCompetition({ id: 'c3', gender: Gender.MEN,   weapon: Weapon.SABRE, category: Category.DIV1A, fencer_count: 16, strips_allocated: 4 }),
    ]

    const { bottlenecks } = scheduleAll(comps, config)

    const postBottlenecks = bottlenecks.filter(b => b.phase === 'POST_SCHEDULE')
    expect(postBottlenecks).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// postScheduleDiagnostics
// ──────────────────────────────────────────────

describe('postScheduleDiagnostics', () => {
  const resourceExhaustionError = {
    competition_id: 'failing-comp',
    phase: Phase.SCHEDULING,
    cause: BottleneckCause.RESOURCE_EXHAUSTION,
    severity: BottleneckSeverity.ERROR,
    delay_mins: 0,
    message: 'No feasible day found',
  }

  it('emits strip recommendation when strips_total < recommended', () => {
    // 64 fencers → ceil(64/7)=10 pools → recommendStripCount = ceil(10/0.80)=13
    const comps = [
      makeCompetition({ id: 'big-event', fencer_count: 64, weapon: Weapon.FOIL }),
    ]
    const config = makeConfig({ strips: makeStrips(4, 0) })

    const result = postScheduleDiagnostics(comps, config, [resourceExhaustionError])

    const stripRec = result.filter(b => b.message.includes('Strips: need'))
    expect(stripRec).toHaveLength(1)
    expect(stripRec[0].cause).toBe(BottleneckCause.RESOURCE_RECOMMENDATION)
    expect(stripRec[0].severity).toBe(BottleneckSeverity.INFO)
    expect(stripRec[0].phase).toBe('POST_SCHEDULE')
    expect(stripRec[0].message).toContain('13')
    expect(stripRec[0].message).toContain('have 4')
    expect(stripRec[0].message).toContain('add 9 more')
  })

  it('emits nothing when no RESOURCE_EXHAUSTION errors exist', () => {
    const comps = [
      makeCompetition({ id: 'event-1', fencer_count: 64, weapon: Weapon.FOIL }),
    ]
    const config = makeConfig({ strips: makeStrips(4, 0) })

    // No bottlenecks at all
    expect(postScheduleDiagnostics(comps, config, [])).toHaveLength(0)

    // Only WARN-severity items (not ERROR)
    const warnOnly = [{
      ...resourceExhaustionError,
      severity: BottleneckSeverity.WARN,
    }]
    expect(postScheduleDiagnostics(comps, config, warnOnly)).toHaveLength(0)
  })

  it('emits nothing when strips meet recommendation', () => {
    // 70 fencers → 10 pools → recommendStripCount = ceil(10/0.80) = 13
    // Config has 48 strips → 13 < 48, no strip recommendation
    const comps = [
      makeCompetition({ id: 'foil-event', fencer_count: 70, weapon: Weapon.FOIL }),
    ]
    const config = makeConfig({
      strips: makeStrips(48, 0),
    })

    const result = postScheduleDiagnostics(comps, config, [resourceExhaustionError])

    const recommendations = result.filter(b => b.cause === BottleneckCause.RESOURCE_RECOMMENDATION)
    expect(recommendations).toHaveLength(0)
  })
})

describe('postScheduleDayBreakdown', () => {
  it('returns empty when no ERROR bottlenecks exist', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    const comps = [makeCompetition({ id: 'event-1', fencer_count: 20 })]

    const result = postScheduleDayBreakdown(comps, config, state)
    expect(result).toHaveLength(0)
  })

  it('emits per-day strip summary for days with failed events', () => {
    const config = makeConfig()
    const state = createGlobalState(config)
    // Schedule one competition on day 0
    state.schedule['event-1'] = makeScheduleResult('event-1', 0)
    // Add an ERROR bottleneck for a different competition (unscheduled)
    state.bottlenecks.push({
      competition_id: 'event-2',
      phase: Phase.SCHEDULING,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: 'Failed',
    })

    const comps = [
      makeCompetition({ id: 'event-1', fencer_count: 20 }),
      makeCompetition({ id: 'event-2', fencer_count: 20 }),
    ]

    const result = postScheduleDayBreakdown(comps, config, state)

    // Should have summaries for all days (event-2 was unscheduled → all days relevant)
    const daySummaries = result.filter(b => b.cause === BottleneckCause.DAY_RESOURCE_SUMMARY)
    expect(daySummaries.length).toBeGreaterThan(0)
    expect(daySummaries.every(b => b.phase === Phase.POST_SCHEDULE)).toBe(true)
    expect(daySummaries.every(b => b.competition_id === '')).toBe(true)
    // Verify message content includes strip-hours data
    const stripSummaries = daySummaries.filter(b => b.message.includes('strip-hours'))
    expect(stripSummaries.length).toBeGreaterThan(0)
  })

  it('emits video-stage contention diagnostic for staged DEs', () => {
    const config = makeConfig({})
    const state = createGlobalState(config)

    const comps = [
      makeCompetition({ id: 'staged-1', fencer_count: 20, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
      makeCompetition({ id: 'staged-2', fencer_count: 20, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
      makeCompetition({ id: 'staged-3', fencer_count: 20, de_mode: DeMode.STAGED, de_round_of_16_strips: 4 }),
    ]

    // Schedule all on day 0
    for (const c of comps) {
      state.schedule[c.id] = makeScheduleResult(c.id, 0)
    }

    // Need an ERROR bottleneck to trigger postScheduleDayBreakdown
    state.bottlenecks.push({
      competition_id: 'staged-1',
      phase: Phase.SCHEDULING,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: 'Failed',
    })

    const result = postScheduleDayBreakdown(comps, config, state)
    const videoStage = result.filter(b => b.message.includes('video-stage'))

    expect(videoStage).toHaveLength(1)
    // Video-stage contention emits INFO (no configured refs to compare against)
    expect(videoStage[0].severity).toBe(BottleneckSeverity.INFO)
    expect(videoStage[0].message).toContain('12 refs')
    expect(videoStage[0].message).toContain('3 staged events')
  })

  it('does not emit video-stage diagnostic for single-stage DEs', () => {
    const config = makeConfig()
    const state = createGlobalState(config)

    const comps = [
      makeCompetition({ id: 'single-1', fencer_count: 20, de_mode: DeMode.SINGLE_STAGE }),
      makeCompetition({ id: 'single-2', fencer_count: 20, de_mode: DeMode.SINGLE_STAGE }),
    ]

    for (const c of comps) {
      state.schedule[c.id] = makeScheduleResult(c.id, 0)
    }

    state.bottlenecks.push({
      competition_id: 'single-1',
      phase: Phase.SCHEDULING,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: 'Failed',
    })

    const result = postScheduleDayBreakdown(comps, config, state)
    const videoStage = result.filter(b => b.message.includes('video-stage'))
    expect(videoStage).toHaveLength(0)
  })

  it('severity is INFO for normal load (strip-hours within capacity)', () => {
    // With 24 strips × 14 hours = 336 strip-hours, a 20-fencer event won't exceed capacity
    const config = makeConfig()
    const state = createGlobalState(config)
    state.schedule['event-1'] = makeScheduleResult('event-1', 0)
    state.bottlenecks.push({
      competition_id: 'event-1',
      phase: Phase.SCHEDULING,
      cause: BottleneckCause.RESOURCE_EXHAUSTION,
      severity: BottleneckSeverity.ERROR,
      delay_mins: 0,
      message: 'Failed',
    })

    const comps = [makeCompetition({ id: 'event-1', fencer_count: 20 })]
    const result = postScheduleDayBreakdown(comps, config, state)

    const stripSummaries = result.filter(b => b.message.includes('strip-hours'))
    expect(stripSummaries.length).toBeGreaterThan(0)
    expect(stripSummaries[0].severity).toBe(BottleneckSeverity.INFO)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// scheduleAll — Vet age-descending pool start (F3b)
// ──────────────────────────────────────────────────────────────────────────────

describe('scheduleAll — Vet age-descending pool start (F3b)', () => {
  it('Vet age-banded M Foil ind siblings start pools in age-descending order', () => {
    // All three events have identical fencer counts and strip allocations.
    // Without the new key 3.5, VET40 would sort first because its categoryWeight
    // (0.8) produces higher strip demand than VET60/VET80 (0.6 each), which is
    // key #4 in the comparator chain. Key 3.5 (Vet age-descending tiebreaker)
    // overrides that and produces:
    //   VET80.pool_start < VET60.pool_start < VET40.pool_start
    //
    // Strip count is set to exactly match each event's strips_allocated (2 each),
    // with 2 total strips. This forces strict serialization: the next event cannot
    // start until the previous one finishes and releases its strips. With 2 total
    // strips and each event wanting 2, they must run one at a time.
    //
    // fencer_count kept small (6) so pool rounds are short and the test runs fast.
    // The Vet co-day rule (F2b) places all three events on the same day; the test
    // asserts that fact explicitly before comparing pool_starts (pool_start is
    // global minutes-from-midnight, so a cross-day comparison would be misleading).
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(2, 0),
    })

    const comps = [
      makeCompetition({
        id: 'vet40',
        category: Category.VETERAN,
        event_type: EventType.INDIVIDUAL,
        gender: Gender.MEN,
        weapon: Weapon.FOIL,
        vet_age_group: VetAgeGroup.VET40,
        fencer_count: 6,
        strips_allocated: 2,
      }),
      makeCompetition({
        id: 'vet60',
        category: Category.VETERAN,
        event_type: EventType.INDIVIDUAL,
        gender: Gender.MEN,
        weapon: Weapon.FOIL,
        vet_age_group: VetAgeGroup.VET60,
        fencer_count: 6,
        strips_allocated: 2,
      }),
      makeCompetition({
        id: 'vet80',
        category: Category.VETERAN,
        event_type: EventType.INDIVIDUAL,
        gender: Gender.MEN,
        weapon: Weapon.FOIL,
        vet_age_group: VetAgeGroup.VET80,
        fencer_count: 6,
        strips_allocated: 2,
      }),
    ]

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // All three events must be scheduled with no errors
    expect(schedule['vet80']).toBeDefined()
    expect(schedule['vet60']).toBeDefined()
    expect(schedule['vet40']).toBeDefined()
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)

    // The Vet co-day rule must place all three on the same day. If this fails,
    // the pool_start ordering check below would compare across days, which is
    // not what F3b is testing.
    const days = new Set([
      schedule['vet80'].assigned_day,
      schedule['vet60'].assigned_day,
      schedule['vet40'].assigned_day,
    ])
    expect(days.size).toBe(1)

    // pool_start is `number | null`. Pin it to a number before the ordering
    // assertions so a null (e.g. from a partial scheduling result) becomes a
    // visible test failure rather than a vacuous comparison.
    const vet80Start = schedule['vet80'].pool_start
    const vet60Start = schedule['vet60'].pool_start
    const vet40Start = schedule['vet40'].pool_start
    expect(vet80Start).not.toBeNull()
    expect(vet60Start).not.toBeNull()
    expect(vet40Start).not.toBeNull()

    // Pool starts must be strictly age-descending: VET80 first, VET40 last.
    // Strict serialization (2 strips shared across all 3 events with 2 each) means
    // each event's pools start only after the previous event fully finishes.
    expect(vet80Start).toBeLessThan(vet60Start as number)
    expect(vet60Start).toBeLessThan(vet40Start as number)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// HISTORICAL NOTE — phase-major scheduling attempt (Stage 6 Task 3, 2026-04-22)
// ──────────────────────────────────────────────────────────────────────────────
//
// We attempted to flip the per-day inner loop in `scheduler.ts` from event-major
// (schedule event A's full phase chain → then B's → then C's) to phase-major
// (schedule POOLS for all events → then DE_PRELIMS for all events → ...).
//
// The change introduced two correctness issues and a density regression:
//
// 1. Cross-event strip rollback was ORDER-DEPENDENT under the old
//    `strip_free_at` scalar representation: multiple events' txLogs interleaved
//    allocations on the same strip across phases (event A pool used strip 0
//    until 150; event B pool used strip 0 from 150 to 300). On failure, rolling
//    back event A first then B (or vice versa) could not restore correct state
//    because `strip_free_at` stored only the latest endTime, not a full history.
//
//    Phase A (2026-04-26) replaced `strip_free_at` with
//    `strip_allocations: StripAllocation[][]` and rolls back by object-identity
//    splice — order-independent and complete. This issue is now resolved at the
//    data-model level; the density regression in (2) is the remaining blocker
//    on a phase-major flip.
//
// 2. Density regression — several B-scenarios lost events compared to baseline.
//    Phase-major caused events' R16/Finals phases to cluster in time and
//    compete for the small pool of video strips simultaneously, producing
//    NO_WINDOW failures that event-major avoided by serializing per-event.
//    Specifically: baseline B5 = 3 scheduled → phase-major = 0 scheduled.
//    Baseline B7 = 4 → phase-major = 0.
//    Same-day recovery via `scheduleCompetition` did not fully compensate
//    because scheduleCompetition itself calls the same phase schedulers with
//    the same resource constraints.
//
// Decision: revert the per-day loop to event-major. Keep the structural
// refactor — `phaseSchedulers.ts` extraction, `EventTxLog`, `rollbackEvent` —
// since these are independently useful (used internally by `scheduleCompetition`
// as a thin orchestrator).
//
// If revisited: need a strip-allocation model that supports unordered rollback
// (interval list per strip) AND a density-improvement mechanism that doesn't
// create video-strip contention spikes across concurrent DE phases.
// ──────────────────────────────────────────────────────────────────────────────

