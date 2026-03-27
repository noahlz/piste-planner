import { describe, it, expect } from 'vitest'
import { validateConfig, validateSameDayCompletion } from '../../src/engine/validation.ts'
import type { TournamentConfig, ValidationError } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType,
  TournamentType, VideoPolicy,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'


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
  it('returns warning when REQUIRED video policy used with SINGLE_BLOCK mode', () => {
    const comp = makeCompetition({
      de_mode: DeMode.SINGLE_BLOCK,
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
