import { describe, it, expect } from 'vitest'
import {
  Category,
  Gender,
  Weapon,
  EventType,
  DeMode,
  VideoPolicy,
  RefPolicy,
  CutMode,
  FencerCountType,
  DeStripRequirement,
  BottleneckCause,
  BottleneckSeverity,
} from '../../src/engine/types.ts'
import type {
  Competition,
  TournamentConfig,
  Strip,
  ScheduleResult,
} from '../../src/engine/types.ts'
import {
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  DEFAULT_DE_DURATION_TABLE,
  DEFAULT_CUT_BY_CATEGORY,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
} from '../../src/engine/constants.ts'
import { TEMPLATES, findCompetition } from '../../src/engine/catalogue.ts'
import { scheduleAll, sortWithPairs, postScheduleWarnings } from '../../src/engine/scheduler.ts'

// ──────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────

function makeStrips(total: number, videoCount: number): Strip[] {
  return Array.from({ length: total }, (_, i) => ({
    id: `strip-${i + 1}`,
    video_capable: i < videoCount,
  }))
}

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  const strips = overrides.strips ?? makeStrips(24, 4)
  const days = overrides.days_available ?? 3
  return {
    tournament_type: 'NAC',
    days_available: days,
    strips,
    strips_total: strips.length,
    video_strips_total: strips.filter(s => s.video_capable).length,
    referee_availability: Array.from({ length: days }, (_, i) => ({
      day: i,
      foil_epee_refs: 20,
      sabre_refs: 10,
      source: 'ACTUAL' as const,
    })),
    allow_sabre_ref_fillin: false,
    pod_captain_override: 'AUTO',
    DAY_START_MINS: 480,
    DAY_END_MINS: 1320,
    LATEST_START_MINS: 960,
    LATEST_START_OFFSET: 480,
    SLOT_MINS: 30,
    DAY_LENGTH_MINS: 840,
    ADMIN_GAP_MINS: 15,
    FLIGHT_BUFFER_MINS: 15,
    THRESHOLD_MINS: 10,
    DE_REFS: 1,
    DE_FINALS_MIN_MINS: 30,
    SAME_TIME_WINDOW_MINS: 30,
    INDIV_TEAM_MIN_GAP_MINS: 120,
    EARLY_START_THRESHOLD: 10,
    MAX_RESCHEDULE_ATTEMPTS: 3,
    MAX_FENCERS: 500,
    MIN_FENCERS: 2,
    pool_round_duration_table: DEFAULT_POOL_ROUND_DURATION_TABLE,
    de_duration_table: DEFAULT_DE_DURATION_TABLE,
    dayConfigs: [],
    ...overrides,
  }
}

function makeCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'test-comp',
    gender: Gender.MEN,
    category: Category.DIV1,
    weapon: Weapon.FOIL,
    event_type: EventType.INDIVIDUAL,
    fencer_count: 24,
    fencer_count_type: FencerCountType.ESTIMATED,
    ref_policy: RefPolicy.AUTO,
    earliest_start: 0,
    latest_end: 9999,
    optional: false,
    vet_age_group: null,
    use_single_pool_override: false,
    cut_mode: CutMode.DISABLED,
    cut_value: 100,
    de_mode: DeMode.SINGLE_BLOCK,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    de_finals_strip_id: null,
    de_finals_strip_requirement: DeStripRequirement.HARD,
    de_round_of_16_strips: 4,
    de_round_of_16_requirement: DeStripRequirement.HARD,
    de_finals_strips: 2,
    de_finals_requirement: DeStripRequirement.HARD,
    flighted: false,
    flighting_group_id: null,
    is_priority: false,
    strips_allocated: 8,
    ...overrides,
  }
}

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
    const comps = competitionsFromTemplate('NAC Youth', 6)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    // All 24 events scheduled
    expect(Object.keys(schedule)).toHaveLength(comps.length)

    // Every result has an assigned_day within bounds
    for (const result of Object.values(schedule)) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(3)
    }

    // No unresolvable errors
    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
  })

  it('ROC Div1A/Vet (2 days, 12 events): all events fit in 2 days', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(48, 4),
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' as const,
      })),
    })
    const comps = competitionsFromTemplate('ROC Div1A/Vet', 8)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(comps.length)

    for (const result of Object.values(schedule)) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(2)
    }

    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
    expect(errors).toHaveLength(0)
  })

  it('RYC Weekend (2 days, 18 events): all events scheduled', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(48, 2),
      referee_availability: Array.from({ length: 2 }, (_, i) => ({
        day: i, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' as const,
      })),
    })
    const comps = competitionsFromTemplate('RYC Weekend', 8)

    const { schedule, bottlenecks } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(comps.length)

    for (const result of Object.values(schedule)) {
      expect(result.assigned_day).toBeGreaterThanOrEqual(0)
      expect(result.assigned_day).toBeLessThan(2)
    }

    const errors = bottlenecks.filter(b => b.severity === BottleneckSeverity.ERROR)
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
      days_available: 1,
      strips: makeStrips(48, 0), // no video strips
      referee_availability: [
        { day: 0, foil_epee_refs: 30, sabre_refs: 15, source: 'ACTUAL' as const },
      ],
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
      b => b.cause === BottleneckCause.VIDEO_STRIP_CONTENTION,
    )
    expect(videoBottlenecks).toHaveLength(0)
  })

  it('single day, 6 non-conflicting events: all fit on day 0', () => {
    const config = makeConfig({
      days_available: 1,
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

    const { schedule } = scheduleAll(comps, config)

    expect(Object.keys(schedule)).toHaveLength(6)
    for (const result of Object.values(schedule)) {
      expect(result.assigned_day).toBe(0)
    }
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

    const priorityIdx = sorted.findIndex(c => c.id === 'priority-comp')
    const flightedIdx = sorted.findIndex(c => c.id === 'flighted-comp')

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
      ...makeResultShell('long-event', 0),
      pool_start: 480,
      pool_end: 600,
      de_total_end: 900,
    }
    // Day 1: short event (pool 1320..1380, DE 1395..1500)
    schedule['day1-event'] = {
      ...makeResultShell('day1-event', 1),
      pool_start: 1320,
      pool_end: 1380,
      de_total_end: 1500,
    }
    // Day 2: short event (pool 2160..2220, DE 2235..2340)
    schedule['day2-event'] = {
      ...makeResultShell('day2-event', 2),
      pool_start: 2160,
      pool_end: 2220,
      de_total_end: 2340,
    }
    // Day 3: short event (pool 3000..3060, DE 3075..3180)
    schedule['day3-event'] = {
      ...makeResultShell('day3-event', 3),
      pool_start: 3000,
      pool_end: 3060,
      de_total_end: 3180,
    }

    const warnings = postScheduleWarnings(schedule, config)

    // Day 0 duration: 900 - dayStart(0)=0 = 900 min
    // Middle days (1-2) avg: (660 + 660) / 2 = 660 min
    // 900 > 660 → first-day warning fires
    const firstDayWarning = warnings.find(w => w.message.includes('First day'))
    expect(firstDayWarning).toBeDefined()

    // Day 3 duration: 3180 - dayStart(3)=2520 = 660 min = avg middle → no warning
    const lastDayWarning = warnings.find(w => w.message.includes('Last day'))
    expect(lastDayWarning).toBeUndefined()
  })

  it('3-day tournament: no first/last day warning (only applies to 4+)', () => {
    const config = makeConfig({ days_available: 3 })

    const schedule: Record<string, ScheduleResult> = {}
    schedule['day0-event'] = {
      ...makeResultShell('day0-event', 0),
      pool_start: 480,
      pool_end: 600,
      de_total_end: 900,
    }
    schedule['day1-event'] = {
      ...makeResultShell('day1-event', 1),
      pool_start: 1320,
      pool_end: 1380,
      de_total_end: 1500,
    }

    const warnings = postScheduleWarnings(schedule, config)

    expect(warnings).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// Minimal ScheduleResult shell for postScheduleWarnings tests
// ──────────────────────────────────────────────

function makeResultShell(competitionId: string, assignedDay: number): ScheduleResult {
  return {
    competition_id: competitionId,
    assigned_day: assignedDay,
    use_flighting: false,
    is_priority: false,
    flighting_group_id: null,
    pool_start: null,
    pool_end: null,
    pool_strips_count: 0,
    pool_refs_count: 0,
    flight_a_start: null,
    flight_a_end: null,
    flight_a_strips: 0,
    flight_a_refs: 0,
    flight_b_start: null,
    flight_b_end: null,
    flight_b_strips: 0,
    flight_b_refs: 0,
    entry_fencer_count: 0,
    promoted_fencer_count: 0,
    bracket_size: 0,
    cut_mode: CutMode.DISABLED,
    cut_value: 0,
    de_mode: DeMode.SINGLE_BLOCK,
    de_video_policy: VideoPolicy.BEST_EFFORT,
    de_start: null,
    de_end: null,
    de_strips_count: 0,
    de_prelims_start: null,
    de_prelims_end: null,
    de_prelims_strips: 0,
    de_round_of_16_start: null,
    de_round_of_16_end: null,
    de_round_of_16_strips: 0,
    de_finals_start: null,
    de_finals_end: null,
    de_finals_strips: 0,
    de_bronze_start: null,
    de_bronze_end: null,
    de_bronze_strip_id: null,
    de_total_end: null,
    conflict_score: 0,
    pool_duration_baseline: 0,
    pool_duration_actual: 0,
    de_duration_baseline: 0,
    de_duration_actual: 0,
    sabre_fillin_used: false,
    constraint_relaxation_level: 0,
    accepted_warnings: [],
  }
}
