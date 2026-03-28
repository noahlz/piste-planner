import { describe, it, expect } from 'vitest'
import {
  Category,
  Gender,
  Weapon,
  DeMode,
  VideoPolicy,
  RefPolicy,
  BottleneckCause,
  BottleneckSeverity,
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
import { scheduleAll, sortWithPairs, postScheduleWarnings } from '../../src/engine/scheduler.ts'
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
        ? DeMode.STAGED_DE_BLOCKS
        : DeMode.SINGLE_BLOCK,
      strips_allocated: Math.max(2, Math.ceil(fencerCount / 7)),
    })
  })
}

// ──────────────────────────────────────────────
// scheduleAll — integration tests using templates
// ──────────────────────────────────────────────

describe('scheduleAll — template integration', () => {
  it('NAC Youth (3 days, 24 events): all events scheduled, no day overflow', () => {
    const config = makeConfig({
      days_available: 3,
      strips: makeStrips(64, 4),
      referee_availability: Array.from({ length: 3 }, (_, i) => ({
        day: i, foil_epee_refs: 40, sabre_refs: 20, source: 'ACTUAL' as const,
      })),
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
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 80, sabre_refs: 40, source: 'ACTUAL' as const,
      })),
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
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 36, sabre_refs: 18, source: 'ACTUAL' as const,
      })),
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
      referee_availability: Array.from({ length: 3 }, (_, i) => ({
        day: i, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' as const,
      })),
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

    // Expect at least some bottlenecks from resource contention or scheduling pressure
    expect(bottlenecks.length).toBeGreaterThan(0)
  })

  it('zero video strips produces no VIDEO_STRIP_CONTENTION bottlenecks', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(48, 0), // no video strips
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' as const,
      })),
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
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' as const,
      })),
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

  it('carries WARN bottleneck forward and still schedules when REQUIRED video + SINGLE_BLOCK', () => {
    // REQUIRED video policy with SINGLE_BLOCK de_mode is a WARN, not an ERROR,
    // so scheduling should proceed and the warning should appear in bottlenecks
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(24, 4),
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' as const,
      })),
    })
    const comps = [
      makeCompetition({
        id: 'warn-comp',
        de_video_policy: VideoPolicy.REQUIRED,
        de_mode: DeMode.SINGLE_BLOCK,
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
      tournament_type: 'RJCC',
      days_available: 2,
      strips: makeStrips(4, 0),
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 10, sabre_refs: 10, source: 'ACTUAL' as const,
      })),
    })

    // 10 competitions each wanting all 4 strips, across enough demographic variation
    // to avoid same-population errors (max 2 per population for 2 days)
    const weapons = ['FOIL', 'EPEE', 'SABRE'] as const
    const genders = ['MEN', 'WOMEN'] as const
    const categories = ['DIV1', 'DIV1A', 'DIV2', 'DIV3', 'JUNIOR', 'CADET'] as const
    const competitions: Competition[] = Array.from({ length: 10 }, (_, i) =>
      makeCompetition({
        id: `COMP-${i}`,
        gender: genders[i % 2],
        category: categories[i % categories.length],
        weapon: weapons[i % 3],
        event_type: 'INDIVIDUAL',
        fencer_count: 16,
        strips_allocated: 4,
        // Wide-open time window so validation doesn't reject on earliest/latest
        earliest_start: 0,
        latest_end: 9999,
      }),
    )

    // Should NOT throw — should return partial results
    const result = scheduleAll(competitions, config)

    // At least some competitions should have been scheduled
    expect(Object.keys(result.schedule).length).toBeGreaterThan(0)
    // But not all — some should have failed
    expect(Object.keys(result.schedule).length).toBeLessThan(competitions.length)
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
      referee_availability: Array.from({ length: 4 }, (_, i) => ({
        day: i, foil_epee_refs: 40, sabre_refs: 20, source: 'ACTUAL' as const,
      })),
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

    // All POST_SCHEDULE warnings must appear in the scheduleAll bottleneck list
    const postBottlenecks = bottlenecks.filter(b => b.phase === 'POST_SCHEDULE')
    expect(postBottlenecks).toHaveLength(expectedWarnings.length)
    for (const w of expectedWarnings) {
      expect(postBottlenecks.some(b => b.message === w.message)).toBe(true)
    }
  })

  it('3-day tournament: no POST_SCHEDULE bottlenecks in scheduleAll result', () => {
    const config = makeConfig({
      days_available: 3,
      strips: makeStrips(32, 4),
      referee_availability: Array.from({ length: 3 }, (_, i) => ({
        day: i, foil_epee_refs: 20, sabre_refs: 10, source: 'ACTUAL' as const,
      })),
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
