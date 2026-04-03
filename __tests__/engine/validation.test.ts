import { describe, it, expect } from 'vitest'
import { validateConfig, validateSameDayCompletion } from '../../src/engine/validation.ts'
import type { TournamentConfig, ValidationError } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType, VideoPolicy,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'
import { BottleneckSeverity } from '../../src/engine/types.ts'


// ──────────────────────────────────────────────
// validateConfig — hard error conditions
// ──────────────────────────────────────────────

describe('validateConfig — fencer count', () => {
  it('returns error when fencer_count is 0', () => {
    const comp = makeCompetition({ fencer_count: 0 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'fencer_count' && e.severity === 'ERROR')).toBe(true)
  })

  it('returns error when fencer_count is 1 (< MIN_FENCERS)', () => {
    const comp = makeCompetition({ fencer_count: 1 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'fencer_count' && e.severity === 'ERROR')).toBe(true)
  })

  it('returns error when fencer_count exceeds MAX_FENCERS (500)', () => {
    const comp = makeCompetition({ fencer_count: 501 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'fencer_count' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error for fencer_count at boundary values (2 and 500)', () => {
    const low = makeCompetition({ id: 'low', fencer_count: 2 })
    const high = makeCompetition({ id: 'high', fencer_count: 500 })
    const errors = validateConfig(makeConfig(), [low, high])
    expect(errors.filter((e: ValidationError) => e.field === 'fencer_count' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — strip count', () => {
  it('returns error when strips_total is 0', () => {
    const config = makeConfig({ strips: [], strips_total: 0, video_strips_total: 0 })
    const errors = validateConfig(config, [makeCompetition()])
    expect(errors.some((e: ValidationError) => e.field === 'strips_total' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not require strips_total to be divisible by 4', () => {
    // 5 strips is valid (odd totals permitted due to finals strip)
    const strips = makeStrips(5, 1)
    const config = makeConfig({ strips, strips_total: 5, video_strips_total: 1 })
    const errors = validateConfig(config, [makeCompetition()])
    expect(errors.filter((e: ValidationError) => e.field === 'strips_total' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — days_available', () => {
  it.each([
    { days: 1, label: 'below minimum (1)' },
    { days: 5, label: 'above maximum (5)' },
  ])('returns error for $label', ({ days }) => {
    const config = makeConfig({ days_available: days })
    const errors = validateConfig(config, [makeCompetition()])
    expect(errors.some((e: ValidationError) => e.field === 'days_available' && e.severity === 'ERROR')).toBe(true)
  })

  it.each([2, 3, 4])('does not error for valid days_available=%i', (days) => {
    const config = makeConfig({ days_available: days })
    const errors = validateConfig(config, [makeCompetition()])
    expect(errors.filter((e: ValidationError) => e.field === 'days_available' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — duplicate competition IDs', () => {
  it('returns error for duplicate IDs', () => {
    const c1 = makeCompetition({ id: 'dup' })
    const c2 = makeCompetition({ id: 'dup', gender: 'WOMEN' })
    const errors = validateConfig(makeConfig(), [c1, c2])
    expect(errors.some((e: ValidationError) => e.field === 'competition.id' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error for unique IDs', () => {
    const c1 = makeCompetition({ id: 'comp-1' })
    const c2 = makeCompetition({ id: 'comp-2', gender: 'WOMEN' })
    const errors = validateConfig(makeConfig(), [c1, c2])
    expect(errors.filter((e: ValidationError) => e.field === 'competition.id')).toHaveLength(0)
  })
})

describe('validateConfig — team event without matching individual', () => {
  it('returns error when team event has no matching individual', () => {
    const team = makeCompetition({
      id: 'team-foil-men',
      event_type: EventType.TEAM,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
    })
    const errors = validateConfig(makeConfig(), [team])
    expect(errors.some((e: ValidationError) => e.field === 'event_type' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when matching individual exists', () => {
    const individual = makeCompetition({
      id: 'indiv-foil-men',
      event_type: EventType.INDIVIDUAL,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
    })
    const team = makeCompetition({
      id: 'team-foil-men',
      event_type: EventType.TEAM,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
    })
    const errors = validateConfig(makeConfig(), [individual, team])
    expect(errors.filter((e: ValidationError) => e.field === 'event_type' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — team event cut_mode', () => {
  it('returns error when team event has cut_mode != DISABLED', () => {
    const individual = makeCompetition({
      id: 'indiv',
      event_type: EventType.INDIVIDUAL,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
    })
    const team = makeCompetition({
      id: 'team',
      event_type: EventType.TEAM,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 50,
    })
    const errors = validateConfig(makeConfig(), [individual, team])
    expect(errors.some((e: ValidationError) => e.field === 'cut_mode' && e.severity === 'ERROR')).toBe(true)
  })
})

describe('validateConfig — cut_mode parameter validation', () => {
  it('returns error for PERCENTAGE cut_mode with value <= 0', () => {
    const comp = makeCompetition({ cut_mode: CutMode.PERCENTAGE, cut_value: 0 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toBe(true)
  })

  it('returns error for PERCENTAGE cut_mode with value > 100', () => {
    const comp = makeCompetition({ cut_mode: CutMode.PERCENTAGE, cut_value: 101 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toBe(true)
  })

  it('returns error for COUNT cut_mode with value > fencer_count', () => {
    const comp = makeCompetition({ cut_mode: CutMode.COUNT, cut_value: 25, fencer_count: 24 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error for COUNT cut_mode with value == fencer_count', () => {
    const comp = makeCompetition({ cut_mode: CutMode.COUNT, cut_value: 24, fencer_count: 24 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.filter((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — cut produces < 2 promoted', () => {
  it('returns error when PERCENTAGE cut produces < 2 promoted', () => {
    // 3 fencers * 10% = 0 promoted → error
    const comp = makeCompetition({ fencer_count: 3, cut_mode: CutMode.PERCENTAGE, cut_value: 10 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toBe(true)
  })

  it('returns error when COUNT cut produces < 2 promoted', () => {
    // count=1 promotes only 1 fencer → error
    const comp = makeCompetition({ fencer_count: 10, cut_mode: CutMode.COUNT, cut_value: 1 })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'cut_value' && e.severity === 'ERROR')).toBe(true)
  })
})

describe('validateConfig — DE duration table', () => {
  it('returns error when bracket size has no entry in de_duration_table', () => {
    // bracket size 2 = 2 fencers, DISABLED cut → bracket=2; remove 2 from the table
    const tableWithMissing = {
      FOIL: { 4: 30, 8: 45, 16: 60, 32: 90, 64: 120, 128: 180, 256: 240 },
      EPEE: { 2: 15, 4: 30, 8: 45, 16: 60, 32: 90, 64: 120, 128: 180, 256: 240 },
      SABRE: { 2: 15, 4: 20, 8: 30, 16: 45, 32: 60, 64: 90, 128: 120, 256: 120 },
    } as unknown as TournamentConfig['de_duration_table']
    const config = makeConfig({ de_duration_table: tableWithMissing })
    // fencer_count=2, cut=DISABLED → bracket size = nextPowerOf2(2) = 2; missing from FOIL table
    const comp = makeCompetition({ fencer_count: 2, weapon: 'FOIL', cut_mode: CutMode.DISABLED })
    const errors = validateConfig(config, [comp])
    expect(errors.some((e: ValidationError) => e.field === 'de_duration_table' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when all bracket sizes are in table', () => {
    const comp = makeCompetition({ fencer_count: 24, weapon: 'FOIL', cut_mode: CutMode.DISABLED })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.filter((e: ValidationError) => e.field === 'de_duration_table')).toHaveLength(0)
  })
})

describe('validateConfig — video policy warnings and errors', () => {
  it('returns warning when REQUIRED video policy used with SINGLE_STAGE mode', () => {
    const comp = makeCompetition({
      de_mode: DeMode.SINGLE_STAGE,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const errors = validateConfig(makeConfig(), [comp])
    expect(errors.some((e: ValidationError) => e.field === 'de_video_policy' && e.severity === 'WARN')).toBe(true)
  })

  it('returns error for STAGED_DE_BLOCKS + REQUIRED + video_strips < de_round_of_16_strips', () => {
    // 2 video strips but de_round_of_16_strips = 4 → not enough video strips for R16
    const config = makeConfig({ video_strips_total: 2 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const errors = validateConfig(config, [comp])
    expect(errors.some((e: ValidationError) => e.field === 'de_video_policy' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when STAGED_DE_BLOCKS + REQUIRED + enough video strips', () => {
    const config = makeConfig({ video_strips_total: 4 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED_DE_BLOCKS,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const errors = validateConfig(config, [comp])
    expect(errors.filter((e: ValidationError) => e.field === 'de_video_policy' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — same population individuals exceed days_available', () => {
  it('returns error when same-population individuals > days_available', () => {
    // Same category + gender + weapon, 4 individual events but only 3 days
    const config = makeConfig({ days_available: 3 })
    const comps = [1, 2, 3, 4].map(i =>
      makeCompetition({
        id: `indiv-${i}`,
        gender: 'MEN',
        category: Category.DIV1,
        weapon: 'FOIL',
        event_type: EventType.INDIVIDUAL,
      }),
    )
    const errors = validateConfig(config, comps)
    expect(errors.some((e: ValidationError) => e.field === 'same_population' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when same-population count <= days_available', () => {
    const config = makeConfig({ days_available: 3 })
    const comps = [1, 2, 3].map(i =>
      makeCompetition({
        id: `indiv-${i}`,
        gender: 'MEN',
        category: Category.DIV1,
        weapon: 'FOIL',
        event_type: EventType.INDIVIDUAL,
      }),
    )
    const errors = validateConfig(config, comps)
    expect(errors.filter((e: ValidationError) => e.field === 'same_population')).toHaveLength(0)
  })
})

describe('validateConfig — flighting group strips exceed strips_total', () => {
  it('returns error when flighting group strips_allocated sum exceeds strips_total', () => {
    // Two competitions in the same flighting group with combined strips > total
    const config = makeConfig({ strips_total: 10 })
    const c1 = makeCompetition({
      id: 'fg-1',
      flighted: true,
      flighting_group_id: 'group-A',
      strips_allocated: 8,
    })
    const c2 = makeCompetition({
      id: 'fg-2',
      flighted: true,
      flighting_group_id: 'group-A',
      strips_allocated: 6,
    })
    const errors = validateConfig(config, [c1, c2])
    expect(errors.some((e: ValidationError) => e.field === 'flighting_group' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when flighting group strips fit within strips_total', () => {
    const config = makeConfig({ strips_total: 24 })
    const c1 = makeCompetition({
      id: 'fg-1',
      flighted: true,
      flighting_group_id: 'group-A',
      strips_allocated: 8,
    })
    const c2 = makeCompetition({
      id: 'fg-2',
      flighted: true,
      flighting_group_id: 'group-A',
      strips_allocated: 8,
    })
    const errors = validateConfig(config, [c1, c2])
    expect(errors.filter((e: ValidationError) => e.field === 'flighting_group' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — valid config returns no errors', () => {
  it('returns empty array for a well-formed NAC config with one competition', () => {
    const config = makeConfig()
    const comp = makeCompetition()
    const errors = validateConfig(config, [comp])
    expect(errors.filter((e: ValidationError) => e.severity === 'ERROR')).toHaveLength(0)
  })
})

describe('validateConfig — global referee headcount check', () => {
  it('warns when foil_epee_refs + three_weapon_refs < strips_total on any day', () => {
    // 10 total refs on day 1 < strips_total 24 → WARN
    const config = makeConfig({
      strips_total: 24,
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 6, three_weapon_refs: 4, source: 'ACTUAL' }, // 10 < 24
        { day: 2, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
      ],
    })
    const comp = makeCompetition()
    const errors = validateConfig(config, [comp])

    const allRefWarns = errors.filter(e => e.field === 'referee_availability' && e.severity === 'WARN')
    expect(allRefWarns).toHaveLength(1)

    const refWarn = allRefWarns[0]
    expect(refWarn).toBeDefined()
    expect(refWarn?.message).toMatch(/Day 1/)
  })

  it('does not warn when foil_epee_refs + three_weapon_refs >= strips_total on all days', () => {
    const config = makeConfig({
      strips_total: 24,
      days_available: 3,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
        { day: 2, foil_epee_refs: 20, three_weapon_refs: 10, source: 'ACTUAL' },
      ],
    })
    const comp = makeCompetition()
    const errors = validateConfig(config, [comp])

    const refWarns = errors.filter(
      (e: ValidationError) => e.field === 'referee_availability' && e.severity === 'WARN',
    )
    expect(refWarns).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateSameDayCompletion
// ──────────────────────────────────────────────

describe('validateSameDayCompletion', () => {
  it('returns null when competition fits comfortably within DAY_LENGTH_MINS', () => {
    const comp = makeCompetition({ fencer_count: 24, weapon: 'FOIL', cut_mode: CutMode.DISABLED })
    const result = validateSameDayCompletion(comp, makeConfig())
    expect(result).toBeNull()
  })

  it('returns error when pool + admin + DE exceeds DAY_LENGTH_MINS', () => {
    // Craft a config with a very short day but normal competition size
    const config = makeConfig({ DAY_LENGTH_MINS: 10 })
    const comp = makeCompetition({ fencer_count: 64, weapon: 'EPEE', cut_mode: CutMode.DISABLED })
    const result = validateSameDayCompletion(comp, config)
    expect(result).not.toBeNull()
    expect(result?.severity).toBe('ERROR')
    expect(result?.field).toBe('same_day_completion')
  })
})

// ──────────────────────────────────────────────
// validateConfig — individual + team same-day duration check
// ──────────────────────────────────────────────

describe('validateConfig — individual+team same-day duration', () => {
  it('returns error when individual + gap + team exceeds DAY_LENGTH_MINS', () => {
    // Use a very short day to force the violation
    const config = makeConfig({ DAY_LENGTH_MINS: 50 })
    const individual = makeCompetition({
      id: 'indiv',
      event_type: EventType.INDIVIDUAL,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
      fencer_count: 24,
    })
    const team = makeCompetition({
      id: 'team',
      event_type: EventType.TEAM,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
      fencer_count: 8,
    })
    const errors = validateConfig(config, [individual, team])
    expect(errors.some((e: ValidationError) => e.field === 'indiv_team_same_day' && e.severity === 'ERROR')).toBe(true)
  })

  it('does not error when individual + gap + team fits within DAY_LENGTH_MINS', () => {
    const config = makeConfig()
    const individual = makeCompetition({
      id: 'indiv',
      event_type: EventType.INDIVIDUAL,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
      fencer_count: 24,
    })
    const team = makeCompetition({
      id: 'team',
      event_type: EventType.TEAM,
      gender: 'MEN',
      category: Category.DIV1,
      weapon: 'FOIL',
      fencer_count: 8,
    })
    const errors = validateConfig(config, [individual, team])
    expect(errors.filter((e: ValidationError) => e.field === 'indiv_team_same_day')).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateConfig — resource precondition checks
// ──────────────────────────────────────────────

describe('validateConfig — resource precondition: strips', () => {
  it('returns error when competition needs more strips than configured (70 fencers → 10 pools, only 8 strips)', () => {
    // ceil(70/7) = 10 pools, but strips_total = 8
    const strips = makeStrips(8, 1)
    const config = makeConfig({ strips })
    const comp = makeCompetition({ id: 'MEN-JR-EPEE-IND', fencer_count: 70, weapon: 'EPEE' })
    const errors = validateConfig(config, [comp])
    const error = errors.find(e => e.field === 'resource_precondition' && e.severity === 'ERROR')
    expect(error).toBeDefined()
    expect(error?.message).toContain('MEN-JR-EPEE-IND')
    expect(error?.message).toMatch(/requires 10 strips/)
    expect(error?.message).toMatch(/only 8 total strips/)
  })

  it('does not error when competition pool count fits within strips_total', () => {
    // ceil(70/7) = 10 pools, strips_total = 24 → ok
    const config = makeConfig()
    const comp = makeCompetition({ fencer_count: 70, weapon: 'EPEE' })
    const errors = validateConfig(config, [comp])
    expect(errors.filter(e => e.field === 'resource_precondition' && e.severity === 'ERROR')).toHaveLength(0)
  })

  it('does not error for competitions below MIN_FENCERS', () => {
    // fencer_count=1 is below MIN_FENCERS=2, already invalid — skip resource check
    const strips = makeStrips(1, 0)
    const config = makeConfig({ strips })
    const comp = makeCompetition({ fencer_count: 1 })
    const errors = validateConfig(config, [comp])
    // Should get fencer_count error, but NOT resource_precondition error
    expect(errors.filter(e => e.field === 'resource_precondition')).toHaveLength(0)
  })
})

describe('validateConfig — resource precondition: referee availability', () => {
  it('returns error when saber event needs more saber refs than available on any day', () => {
    // ceil(105/7) = 15 pools, but max three_weapon_refs across days = 10
    const config = makeConfig()  // default: three_weapon_refs=10 per day
    const comp = makeCompetition({ id: 'MEN-JR-SABRE-IND', fencer_count: 105, weapon: 'SABRE' })
    const errors = validateConfig(config, [comp])
    const error = errors.find(e => e.field === 'resource_precondition' && e.severity === 'ERROR')
    expect(error).toBeDefined()
    expect(error?.message).toContain('MEN-JR-SABRE-IND')
    expect(error?.message).toContain('saber')
    expect(error?.message).toContain('15')  // required refs
    expect(error?.message).toContain('10')  // max available
  })

  it('returns error when foil event needs more foil/epee refs than available on any day', () => {
    // ceil(168/7) = 24 pools, but max foil_epee_refs = 20
    const config = makeConfig()  // default: foil_epee_refs=20 per day
    const comp = makeCompetition({ id: 'MEN-DIV1-FOIL-IND', fencer_count: 168, weapon: 'FOIL' })
    const errors = validateConfig(config, [comp])
    const error = errors.find(e => e.field === 'resource_precondition' && e.severity === 'ERROR')
    expect(error).toBeDefined()
    expect(error?.message).toContain('MEN-DIV1-FOIL-IND')
    expect(error?.message).toContain('foil/epee')
    expect(error?.message).toContain('24')  // required refs
    expect(error?.message).toContain('20')  // max available
  })

  it('does not error when saber refs are sufficient on at least one day', () => {
    // ceil(70/7) = 10 pools, at least one day has three_weapon_refs=10 → ok
    const config = makeConfig()  // default: three_weapon_refs=10
    const comp = makeCompetition({ fencer_count: 70, weapon: 'SABRE' })
    const errors = validateConfig(config, [comp])
    expect(errors.filter(e => e.field === 'resource_precondition' && e.severity === 'ERROR')).toHaveLength(0)
  })

  it('does not error when foil/epee refs are sufficient on at least one day', () => {
    // ceil(70/7) = 10 pools, at least one day has foil_epee_refs=20 → ok
    const config = makeConfig()
    const comp = makeCompetition({ fencer_count: 70, weapon: 'FOIL' })
    const errors = validateConfig(config, [comp])
    expect(errors.filter(e => e.field === 'resource_precondition' && e.severity === 'ERROR')).toHaveLength(0)
  })

  it('passes when one day has sufficient saber refs even if others do not', () => {
    // Two days: day 0 has three_weapon_refs=5, day 1 has three_weapon_refs=15 → ok for 15 pools
    const config = makeConfig({
      days_available: 2,
      referee_availability: [
        { day: 0, foil_epee_refs: 20, three_weapon_refs: 5, source: 'ACTUAL' as const },
        { day: 1, foil_epee_refs: 20, three_weapon_refs: 15, source: 'ACTUAL' as const },
      ],
    })
    const comp = makeCompetition({ fencer_count: 105, weapon: 'SABRE' })
    const errors = validateConfig(config, [comp])
    expect(errors.filter(e => e.field === 'resource_precondition' && e.severity === 'ERROR')).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateConfig — regional cut override warnings
// ──────────────────────────────────────────────

describe('validateConfig — regional cut override warnings', () => {
  it('emits a WARN when a regional tournament has a JUNIOR competition with non-DISABLED cut', () => {
    const config = makeConfig({ tournament_type: 'ROC' })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const errors = validateConfig(config, [comp])
    const warning = errors.find(e => e.field === 'cut_mode' && e.severity === BottleneckSeverity.WARN && e.message.includes('JR-M-FOIL-IND'))
    expect(warning).toBeDefined()
  })

  it('does not warn when regional tournament JUNIOR competition has DISABLED cut', () => {
    const config = makeConfig({ tournament_type: 'ROC' })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
    })
    const errors = validateConfig(config, [comp])
    const warnings = errors.filter(e => e.field === 'cut_mode' && e.severity === BottleneckSeverity.WARN && e.message.includes('override'))
    expect(warnings).toHaveLength(0)
  })

  it('does not warn for NAC tournament with non-DISABLED cut on JUNIOR', () => {
    const config = makeConfig({ tournament_type: 'NAC' })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const errors = validateConfig(config, [comp])
    const warnings = errors.filter(e => e.field === 'cut_mode' && e.severity === BottleneckSeverity.WARN && e.message.includes('override'))
    expect(warnings).toHaveLength(0)
  })

  it('does not warn for regional tournament with non-override category (VETERAN)', () => {
    const config = makeConfig({ tournament_type: 'SYC' })
    const comp = makeCompetition({
      id: 'VET-M-FOIL-IND',
      category: Category.VETERAN,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const errors = validateConfig(config, [comp])
    const warnings = errors.filter(e => e.field === 'cut_mode' && e.severity === BottleneckSeverity.WARN && e.message.includes('override'))
    expect(warnings).toHaveLength(0)
  })
})
