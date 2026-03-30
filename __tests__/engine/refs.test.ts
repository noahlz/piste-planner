import { describe, it, expect } from 'vitest'
import { podCaptainsNeeded, refsAvailableOnDay, calculateOptimalRefs, preliminaryDayAssign } from '../../src/engine/refs.ts'
import { PodCaptainOverride, DeMode, Weapon, Category, Gender } from '../../src/engine/types.ts'
import type { TournamentConfig, DayRefereeAvailability, Competition } from '../../src/engine/types.ts'
import {
  DEFAULT_POOL_ROUND_DURATION_TABLE,
  DEFAULT_DE_DURATION_TABLE,
} from '../../src/engine/constants.ts'

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function makeConfig(overrides: Partial<TournamentConfig> = {}): TournamentConfig {
  return {
    tournament_type: 'NAC',
    days_available: 2,
    strips: [],
    strips_total: 12,
    video_strips_total: 2,
    referee_availability: [],
    pod_captain_override: PodCaptainOverride.AUTO,
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

function makeAvailability(day: number, foil_epee_refs: number, saber_refs: number): DayRefereeAvailability {
  return { day, foil_epee_refs, saber_refs, source: 'ACTUAL' }
}

// Minimal Competition factory — only fields refs.ts needs
function makeCompetition(overrides: Partial<Competition> = {}): Competition {
  return {
    id: 'test-comp',
    gender: 'MEN',
    category: 'DIV1',
    weapon: Weapon.FOIL,
    event_type: 'INDIVIDUAL',
    fencer_count: 32,
    ref_policy: 'AUTO',
    earliest_start: 0,
    latest_end: 840,
    optional: false,
    vet_age_group: null,
    use_single_pool_override: false,
    cut_mode: 'DISABLED',
    cut_value: 100,
    de_mode: DeMode.SINGLE_BLOCK,
    de_video_policy: 'BEST_EFFORT',
    de_finals_strip_id: null,
    de_finals_strip_requirement: 'IF_AVAILABLE',
    de_round_of_16_strips: 4,
    de_round_of_16_requirement: 'IF_AVAILABLE',
    de_finals_strips: 4,
    de_finals_requirement: 'IF_AVAILABLE',
    flighted: false,
    flighting_group_id: null,
    is_priority: false,
    strips_allocated: 4,
    ...overrides,
  }
}

// ──────────────────────────────────────────────
// podCaptainsNeeded
// ──────────────────────────────────────────────

describe('podCaptainsNeeded', () => {
  it('DISABLED override → 0 regardless of strips', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.DISABLED, DeMode.SINGLE_BLOCK, 32, 'DE_FINALS', 12)).toBe(0)
  })

  it('FORCE_4 override with 12 strips → ceil(12/4) = 3', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.FORCE_4, DeMode.SINGLE_BLOCK, 32, 'DE_FINALS', 12)).toBe(3)
  })

  it('AUTO, SINGLE_BLOCK, bracket ≤32, 8 strips → ceil(8/4) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_BLOCK, 32, 'DE_FINALS', 8)).toBe(2)
  })

  it('AUTO, SINGLE_BLOCK, bracket 64, 16 strips → ceil(16/8) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_BLOCK, 64, 'DE_FINALS', 16)).toBe(2)
  })

  it('AUTO, STAGED, DE_ROUND_OF_16 phase, 4 strips → ceil(4/4) = 1', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.STAGED_DE_BLOCKS, 64, 'DE_ROUND_OF_16', 4)).toBe(1)
  })

  it('AUTO, STAGED, DE_FINALS phase, 8 strips → ceil(8/8) = 1', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.STAGED_DE_BLOCKS, 64, 'DE_FINALS', 8)).toBe(1)
  })

  it('AUTO, SINGLE_BLOCK, bracket ≤32, 9 strips → ceil(9/4) = 3', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.AUTO, DeMode.SINGLE_BLOCK, 16, 'DE_FINALS', 9)).toBe(3)
  })

  it('FORCE_4 with 7 strips → ceil(7/4) = 2', () => {
    expect(podCaptainsNeeded(PodCaptainOverride.FORCE_4, DeMode.SINGLE_BLOCK, 64, 'DE_FINALS', 7)).toBe(2)
  })
})

// ──────────────────────────────────────────────
// refsAvailableOnDay
// ──────────────────────────────────────────────

describe('refsAvailableOnDay', () => {
  const config = makeConfig({
    days_available: 2,
    referee_availability: [
      makeAvailability(0, 10, 5),
      makeAvailability(1, 8, 3),
    ],
  })

  it('SABRE weapon → saber_refs only', () => {
    expect(refsAvailableOnDay(0, Weapon.SABRE, config)).toBe(5)
  })

  it('FOIL weapon → foil_epee_refs + saber_refs (saber refs cross over)', () => {
    expect(refsAvailableOnDay(0, Weapon.FOIL, config)).toBe(15)
  })

  it('EPEE weapon → foil_epee_refs + saber_refs (saber refs cross over)', () => {
    expect(refsAvailableOnDay(0, Weapon.EPEE, config)).toBe(15)
  })

  it('day 1, SABRE → 3 saber refs only', () => {
    expect(refsAvailableOnDay(1, Weapon.SABRE, config)).toBe(3)
  })

  it('day 1, FOIL → 11 (8 + 3)', () => {
    expect(refsAvailableOnDay(1, Weapon.FOIL, config)).toBe(11)
  })

  it('out-of-bounds day index → 0', () => {
    expect(refsAvailableOnDay(99, Weapon.FOIL, config)).toBe(0)
  })
})

// ──────────────────────────────────────────────
// preliminaryDayAssign
// ──────────────────────────────────────────────

describe('preliminaryDayAssign', () => {
  it('single competition → assigned to day 0', () => {
    const config = makeConfig({ days_available: 2 })
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL })
    const result = preliminaryDayAssign([comp], config)
    expect(result.get('foil-1')).toBe(0)
  })

  it('two non-conflicting competitions → both can land on day 0', () => {
    // Different genders: no crossover penalty → greedy assigns both to lowest-penalty day
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-foil', weapon: Weapon.FOIL, gender: Gender.MEN }),
      makeCompetition({ id: 'women-foil', weapon: Weapon.FOIL, gender: Gender.WOMEN }),
    ]
    const result = preliminaryDayAssign(comps, config)
    // No crossover between genders — both should land on day 0 (lowest index first)
    expect(result.get('men-foil')).toBe(0)
    expect(result.get('women-foil')).toBe(0)
  })

  it('two conflicting same-gender competitions → assigned to different days', () => {
    // CADET + JUNIOR same gender+weapon have crossover penalty > 0
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-cadet-foil', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.CADET }),
      makeCompetition({ id: 'men-junior-foil', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.JUNIOR }),
    ]
    const result = preliminaryDayAssign(comps, config)
    // Crossover between CADET+JUNIOR (same gender+weapon) forces them onto different days
    expect(result.get('men-cadet-foil')).not.toBe(result.get('men-junior-foil'))
  })

  it('constraint-scored assignment avoids conflicts that round-robin would create', () => {
    // Input order is arranged so round-robin (idx % 2) puts MEN_CADET and MEN_JUNIOR
    // on the same day (idx 0 and 2 both → day 0). They have Infinity crossover
    // (GROUP_1_MANDATORY pair), so round-robin produces an avoidable conflict.
    //
    // Constraint-scored processes the most-constrained events first and assigns
    // MEN_JUNIOR to day 1 (lowest penalty against day 0 which already has MEN_CADET).
    const config = makeConfig({ days_available: 2 })
    const comps = [
      makeCompetition({ id: 'men-cadet', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.CADET }),
      makeCompetition({ id: 'women-div1', weapon: Weapon.FOIL, gender: Gender.WOMEN, category: Category.DIV1 }),
      makeCompetition({ id: 'men-junior', weapon: Weapon.FOIL, gender: Gender.MEN, category: Category.JUNIOR }),
      makeCompetition({ id: 'women-junior', weapon: Weapon.FOIL, gender: Gender.WOMEN, category: Category.JUNIOR }),
    ]
    const result = preliminaryDayAssign(comps, config)

    // Constraint-scored separates the Infinity-crossover pair (MEN_CADET + MEN_JUNIOR)
    expect(result.get('men-cadet')).not.toBe(result.get('men-junior'))
  })
})

// ──────────────────────────────────────────────
// calculateOptimalRefs
// ──────────────────────────────────────────────

describe('calculateOptimalRefs', () => {
  it('returns one entry per day in config', () => {
    const config = makeConfig({ days_available: 2 })
    const foilComp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([foilComp], config)
    expect(result).toHaveLength(2)
    expect(result[0].day).toBe(0)
    expect(result[1].day).toBe(1)
  })

  it('all results have source=OPTIMAL', () => {
    const config = makeConfig({ days_available: 1 })
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 10, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result.every(r => r.source === 'OPTIMAL')).toBe(true)
  })

  it('foil competition assigned to day 0 → foil_epee demand = 5 on day 0', () => {
    const config = makeConfig({ days_available: 1 })
    // 20-fencer foil comp: 3 pools of ~7 (pool demand=3), DE bracket=32 w/ 4 R16 strips + 1 pod captain = 5
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result[0].foil_epee_refs).toBe(5)
    expect(result[0].saber_refs).toBe(0)
  })

  it('saber competition → saber demand = 5, foil_epee demand = 0', () => {
    const config = makeConfig({ days_available: 1 })
    // 20-fencer saber comp: same structure as foil, peak from DE phase = 5
    const comp = makeCompetition({ id: 'saber-1', weapon: Weapon.SABRE, fencer_count: 20, earliest_start: 0, latest_end: 840 })
    const result = calculateOptimalRefs([comp], config)
    expect(result[0].saber_refs).toBe(5)
    expect(result[0].foil_epee_refs).toBe(0)
  })

  it('3 foil + 3 epee competitions on day 0 → summed foil_epee demand = 30', () => {
    // Single-day config so all comps land on day 0
    const config = makeConfig({ days_available: 1 })
    // Each 18-fencer comp: 3 pools (pool demand=3), DE bracket=32 w/ 4 R16 strips + 1 captain = 5
    // Peak per comp = max(3, 5) = 5. Sum across 6 foil/epee comps = 30.
    // (Conservative: assumes all peaks concurrent — the TODO for time-slot simulation will refine this)
    const comps = [
      makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'foil-2', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'foil-3', weapon: Weapon.FOIL, fencer_count: 18 }),
      makeCompetition({ id: 'epee-1', weapon: Weapon.EPEE, fencer_count: 18 }),
      makeCompetition({ id: 'epee-2', weapon: Weapon.EPEE, fencer_count: 18 }),
      makeCompetition({ id: 'epee-3', weapon: Weapon.EPEE, fencer_count: 18 }),
    ]
    const result = calculateOptimalRefs(comps, config)
    expect(result[0].foil_epee_refs).toBe(30)
    expect(result[0].saber_refs).toBe(0)
  })

  it('2 saber competitions on day 0 → summed saber demand = 10', () => {
    const config = makeConfig({ days_available: 1 })
    // Each 18-fencer saber comp: peak = max(3 pools, 5 DE refs) = 5. Sum = 10.
    const comps = [
      makeCompetition({ id: 'saber-1', weapon: Weapon.SABRE, fencer_count: 18 }),
      makeCompetition({ id: 'saber-2', weapon: Weapon.SABRE, fencer_count: 18 }),
    ]
    const result = calculateOptimalRefs(comps, config)
    expect(result[0].saber_refs).toBe(10)
    expect(result[0].foil_epee_refs).toBe(0)
  })

  it('no competitions → zero demand on all days', () => {
    const config = makeConfig({ days_available: 2 })
    const result = calculateOptimalRefs([], config)
    expect(result[0].foil_epee_refs).toBe(0)
    expect(result[0].saber_refs).toBe(0)
    expect(result[1].foil_epee_refs).toBe(0)
    expect(result[1].saber_refs).toBe(0)
  })

  it('known small config: 1 foil comp, 3 pools → pool demand is 3, DE demand may exceed', () => {
    const config = makeConfig({ days_available: 1 })
    // 18 fencers → 3 pools of 6 (pool demand = 3)
    // DE: bracket=32, de_round_of_16_strips=4, AUTO pod captains → ceil(4/4)=1 captain + 4 strip refs = 5
    // Peak = max(3, 5) = 5
    const comp = makeCompetition({ id: 'foil-1', weapon: Weapon.FOIL, fencer_count: 18, strips_allocated: 3 })
    const result = calculateOptimalRefs([comp], config)
    // DE phase is the bottleneck (4 strips + 1 pod captain = 5 refs)
    expect(result[0].foil_epee_refs).toBe(5)
  })

  it('known small config: 1 foil comp with no DE strips → pool demand drives foil_epee_refs', () => {
    const config = makeConfig({ days_available: 1 })
    // 18 fencers → 3 pools of 6 (pool demand = 3)
    // DE: de_round_of_16_strips=0, de_finals_strips=0 → only finals phase → 0 strips = 0 DE demand
    const comp = makeCompetition({
      id: 'foil-1',
      weapon: Weapon.FOIL,
      fencer_count: 18,
      strips_allocated: 3,
      de_round_of_16_strips: 0,
      de_finals_strips: 0,
    })
    const result = calculateOptimalRefs([comp], config)
    // Pool phase is the bottleneck: 3 pools → 3 refs
    expect(result[0].foil_epee_refs).toBe(3)
  })
})
