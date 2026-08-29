import { describe, it, expect } from 'vitest'
import { validateConfig, validateSameDayCompletion, validateFeasibility } from '../../src/engine/validation.ts'
import type { TournamentConfig, ValidationError, Competition } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType, Gender, TournamentType, VideoPolicy, Weapon,
  BottleneckSeverity, RuleKind, ValidationMode,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'

// ──────────────────────────────────────────────
// Rule → kind catalogue (research.md D3 + Correction 2026-08-29,
// data-model.md "Finding")
//
// STRUCTURAL — leaves nothing to draw; ERROR in both modes. D3-explicit:
//   fencer_count bounds, days_available outside 1–14, strips_total below 1,
//   de_duration_table missing entries (individual + team paths).
// Self-classified (not named in D3's lists, judged against the same
// "leaves nothing to draw" criterion):
//   - duplicate competition.id — corrupts the schedule's identity key
//     (GlobalState.schedule and ScheduleResult are keyed by competition id).
//   - cut_value out of range (PERCENTAGE outside (0,100], COUNT > fencer_count)
//     — the promoted-fencer computation is undefined/nonsensical.
//   - cut produces < 2 promoted fencers — a DE bracket needs >= 2 entrants.
//   - de_video_policy: STAGED + REQUIRED with insufficient video strips for
//     R16 — a physical resource impossibility for that DE stage (already an
//     ERROR today via err(), unlike the two WARN-today video/strip checks).
//
// POLICY — advisable, not physically blocking; ERROR(binding) / WARN(advisory).
// D3-explicit: same_population, team-requires-individual (event_type),
//   cut-on-team (cut_mode), strip minimum shortfalls (resource_precondition),
//   feasibility.
// Self-classified:
//   - flighting_group strip shortfalls — same resource-capacity class as
//     resource_precondition's "strip minimum shortfalls", D3's explicit policy
//     item; grouped with it rather than invented as a new bucket.
//   - feasibility_video — not named separately in D3's text; produced by the
//     same validateFeasibility() sub-validator as feasibility, on the
//     identical FEASIBILITY_SLACK-tolerant resource-insufficiency computation
//     applied to the video-strip-hours axis. Grouped with feasibility rather
//     than invented as a new bucket.
//   - indiv_team_same_day — a worst-case combined-duration ESTIMATE (like
//     feasibility's FEASIBILITY_SLACK-tolerant estimate), not an absolute
//     physical block; an organizer may accept the risk.
//
// NOTICE — WARN in BOTH modes, never escalates to ERROR, never blocks.
// Moved off POLICY by research D3's 2026-08-29 correction: probing
// validateConfig over the B1–B8 drift-ledger fixtures under the original
// flat structural/policy model found the regional-cut override rule firing
// on B4 (12x), B5 (12x), B6 (18x), and the video dead-config rule firing on
// B2 (6x), B8 (5x) — both were classified POLICY, so binding mode would have
// escalated them to ERROR and, since the scheduler aborts on any ERROR
// (concurrentScheduler.ts:195), newly collapsed B2/B5/B6/B8 (nonzero
// SCHEDULED_FLOORS) and inflated B4's pinned "0 scheduled, 1 validation
// error" test. See research.md D3's correction subsection for the full
// evidence and the days_available/spec-acceptance-3 conflict that moved with
// them:
//   - regional-cut-override (cut_mode) — buildConfig applies the override
//     automatically regardless; this is a heads-up, not a gate.
//   - video-dead-config (de_video_policy: REQUIRED + SINGLE_STAGE) — a soft
//     "this setting has no effect" hint, blocks nothing.
//   - r16-over-cap (de_round_of_16_strips over the DE strip cap) — soft
//     resource-tuning guidance; the code's own comment already calls these
//     "soft warnings... the user may have intentionally overridden." Fires 0
//     times across B1–B8 (no drift risk of its own) but moved for
//     consistency with the same "soft, may be intentional" class.
//   - days_available outside 2–4 (within structural 1–14) — advisory-only
//     per spec acceptance scenario 3 (spec.md:106-108): a 5-day tournament
//     warns and the schedule can still be computed.
//
// OUT OF SCOPE for this catalogue: `validateSameDayCompletion` is exported
// and directly tested, but has zero callers anywhere in src/ (confirmed by
// grep) — it is not wired into validateConfig's pipeline, so the kind/mode
// split does not reach it. Its existing direct-call tests are left as-is.
// `validateFeasibility` is a sub-validator assembled into validateConfig's
// pipeline; its own direct-call tests are also left as-is (still ERROR,
// called with the current 2-arg signature) since only validateConfig's
// signature is contractually stated to gain the mode parameter (research
// D3, tasks.md T017) — mode-based feasibility severity is tested only
// through validateConfig below.
// ──────────────────────────────────────────────

/** Runs validateConfig once per mode; only severity (and now kind) should differ. */
function validateBoth(config: TournamentConfig, competitions: Competition[]) {
  return {
    binding: validateConfig(config, competitions, ValidationMode.BINDING),
    advisory: validateConfig(config, competitions, ValidationMode.ADVISORY),
  }
}

/** Structural rule: ERROR in both modes, kind === STRUCTURAL in both. */
function expectStructural(field: string, binding: ValidationError[], advisory: ValidationError[]) {
  const b = binding.find(e => e.field === field)
  const a = advisory.find(e => e.field === field)
  expect(b, `binding: expected a finding for field "${field}"`).toBeDefined()
  expect(a, `advisory: expected a finding for field "${field}"`).toBeDefined()
  expect(b!.severity).toBe(BottleneckSeverity.ERROR)
  expect(a!.severity).toBe(BottleneckSeverity.ERROR)
  expect(b!.kind).toBe(RuleKind.STRUCTURAL)
  expect(a!.kind).toBe(RuleKind.STRUCTURAL)
}

/**
 * Policy rule: ERROR under binding, WARN under advisory, same field/message
 * substance in both (research D3 — "the two modes MUST agree on everything
 * except severity").
 */
function expectPolicyPair(field: string, binding: ValidationError[], advisory: ValidationError[], messageIncludes?: string) {
  const matches = (e: ValidationError) => e.field === field && (messageIncludes === undefined || e.message.includes(messageIncludes))
  const b = binding.find(matches)
  const a = advisory.find(matches)
  expect(b, `binding: expected a finding for field "${field}"`).toBeDefined()
  expect(a, `advisory: expected a finding for field "${field}"`).toBeDefined()
  expect(b!.severity).toBe(BottleneckSeverity.ERROR)
  expect(a!.severity).toBe(BottleneckSeverity.WARN)
  expect(b!.kind).toBe(RuleKind.POLICY)
  expect(a!.kind).toBe(RuleKind.POLICY)
  expect(b!.message).toBe(a!.message)
}

/**
 * Notice rule: WARN in both modes, kind === 'notice' in both, same
 * field/message substance in both (research D3 correction, 2026-08-29 — a
 * mode-independent WARN that never escalates to ERROR). RuleKind on
 * src/engine/types.ts does not yet have a NOTICE member (T017 adds it), so
 * this asserts the string literal directly rather than via RuleKind.NOTICE.
 */
function expectNoticePair(field: string, binding: ValidationError[], advisory: ValidationError[], messageIncludes?: string) {
  const matches = (e: ValidationError) => e.field === field && (messageIncludes === undefined || e.message.includes(messageIncludes))
  const b = binding.find(matches)
  const a = advisory.find(matches)
  expect(b, `binding: expected a finding for field "${field}"`).toBeDefined()
  expect(a, `advisory: expected a finding for field "${field}"`).toBeDefined()
  expect(b!.severity).toBe(BottleneckSeverity.WARN)
  expect(a!.severity).toBe(BottleneckSeverity.WARN)
  expect(b!.kind).toBe('notice')
  expect(a!.kind).toBe('notice')
  expect(b!.message).toBe(a!.message)
}

/**
 * A DIV1/MEN/FOIL individual+team pair sharing one population key — the
 * shape team-requires-individual, cut-on-team, and indiv-team-same-day all
 * pair against. `overrides.individual`/`overrides.team` extend the fixture
 * per test (e.g. fencer_count, cut_mode) without repeating the shared
 * category/gender/weapon fields at each call site.
 */
function makeIndividualTeamPair(overrides: { individual?: Partial<Competition>; team?: Partial<Competition> } = {}) {
  const individual = makeCompetition({
    id: 'indiv',
    event_type: EventType.INDIVIDUAL,
    gender: Gender.MEN,
    category: Category.DIV1,
    weapon: Weapon.FOIL,
    ...overrides.individual,
  })
  const team = makeCompetition({
    id: 'team',
    event_type: EventType.TEAM,
    gender: Gender.MEN,
    category: Category.DIV1,
    weapon: Weapon.FOIL,
    ...overrides.team,
  })
  return { individual, team }
}

// ──────────────────────────────────────────────
// validateConfig — structural rules (ERROR in both modes)
// ──────────────────────────────────────────────

describe('validateConfig — fencer count (structural)', () => {
  it('returns ERROR in both modes when fencer_count is 0', () => {
    const comp = makeCompetition({ fencer_count: 0 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('fencer_count', binding, advisory)
  })

  it('returns ERROR in both modes when fencer_count is 1 (< MIN_FENCERS)', () => {
    const comp = makeCompetition({ fencer_count: 1 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('fencer_count', binding, advisory)
  })

  it('returns ERROR in both modes when fencer_count exceeds MAX_FENCERS (500)', () => {
    const comp = makeCompetition({ fencer_count: 501 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('fencer_count', binding, advisory)
  })

  it('does not error for fencer_count at boundary values (2 and 500)', () => {
    const low = makeCompetition({ id: 'low', fencer_count: 2 })
    const high = makeCompetition({ id: 'high', fencer_count: 500 })
    const { binding, advisory } = validateBoth(makeConfig(), [low, high])
    expect(binding.filter(e => e.field === 'fencer_count' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'fencer_count' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })
})

describe('validateConfig — strip count (structural)', () => {
  it('returns ERROR in both modes when strips_total is 0', () => {
    const config = makeConfig({ strips: [], strips_total: 0, video_strips_total: 0 })
    const { binding, advisory } = validateBoth(config, [makeCompetition()])
    expectStructural('strips_total', binding, advisory)
  })

  it('does not require strips_total to be divisible by 4', () => {
    // 5 strips is valid (odd totals are permitted)
    const strips = makeStrips(5, 1)
    const config = makeConfig({ strips, strips_total: 5, video_strips_total: 1 })
    const { binding, advisory } = validateBoth(config, [makeCompetition()])
    expect(binding.filter(e => e.field === 'strips_total' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'strips_total' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })
})

describe('validateConfig — days_available structural bounds (1–14)', () => {
  it.each([
    { days: 0, label: 'below structural minimum (0)' },
    { days: 15, label: 'above structural maximum (15)' },
  ])('returns a structural ERROR in both modes for $label', ({ days }) => {
    const config = makeConfig({ days_available: days })
    const { binding, advisory } = validateBoth(config, [makeCompetition()])
    expectStructural('days_available', binding, advisory)
  })
})

describe('validateConfig — duplicate competition IDs (structural)', () => {
  it('returns ERROR in both modes for duplicate IDs', () => {
    const c1 = makeCompetition({ id: 'dup' })
    const c2 = makeCompetition({ id: 'dup', gender: Gender.WOMEN })
    const { binding, advisory } = validateBoth(makeConfig(), [c1, c2])
    expectStructural('competition.id', binding, advisory)
  })

  it('does not error for unique IDs', () => {
    const c1 = makeCompetition({ id: 'comp-1' })
    const c2 = makeCompetition({ id: 'comp-2', gender: Gender.WOMEN })
    const { binding, advisory } = validateBoth(makeConfig(), [c1, c2])
    expect(binding.filter(e => e.field === 'competition.id')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'competition.id')).toHaveLength(0)
  })
})

describe('validateConfig — cut_value parameter validation (structural)', () => {
  it('returns ERROR in both modes for PERCENTAGE cut_mode with value <= 0', () => {
    const comp = makeCompetition({ cut_mode: CutMode.PERCENTAGE, cut_value: 0 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('cut_value', binding, advisory)
  })

  it('returns ERROR in both modes for PERCENTAGE cut_mode with value > 100', () => {
    const comp = makeCompetition({ cut_mode: CutMode.PERCENTAGE, cut_value: 101 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('cut_value', binding, advisory)
  })

  it('returns ERROR in both modes for COUNT cut_mode with value > fencer_count', () => {
    const comp = makeCompetition({ cut_mode: CutMode.COUNT, cut_value: 25, fencer_count: 24 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('cut_value', binding, advisory)
  })

  it('does not error for COUNT cut_mode with value == fencer_count', () => {
    const comp = makeCompetition({ cut_mode: CutMode.COUNT, cut_value: 24, fencer_count: 24 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expect(binding.filter(e => e.field === 'cut_value' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'cut_value' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })
})

describe('validateConfig — cut produces < 2 promoted (structural)', () => {
  it('returns ERROR in both modes when PERCENTAGE cut produces < 2 promoted', () => {
    // 3 fencers * 10% = 0 promoted → structural error
    const comp = makeCompetition({ fencer_count: 3, cut_mode: CutMode.PERCENTAGE, cut_value: 10 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('cut_value', binding, advisory)
  })

  it('returns ERROR in both modes when COUNT cut produces < 2 promoted', () => {
    // count=1 promotes only 1 fencer → structural error
    const comp = makeCompetition({ fencer_count: 10, cut_mode: CutMode.COUNT, cut_value: 1 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('cut_value', binding, advisory)
  })
})

describe('validateConfig — DE duration table (structural)', () => {
  it('returns ERROR in both modes when bracket size has no entry in de_duration_table', () => {
    // bracket size 2 = 2 fencers, DISABLED cut → bracket=2; remove 2 from the table
    const tableWithMissing = {
      FOIL: { 4: 30, 8: 45, 16: 60, 32: 90, 64: 120, 128: 180, 256: 240 },
      EPEE: { 2: 15, 4: 30, 8: 45, 16: 60, 32: 90, 64: 120, 128: 180, 256: 240 },
      SABRE: { 2: 15, 4: 20, 8: 30, 16: 45, 32: 60, 64: 90, 128: 120, 256: 120 },
    } as unknown as TournamentConfig['de_duration_table']
    const config = makeConfig({ de_duration_table: tableWithMissing })
    // fencer_count=2, cut=DISABLED → bracket size = nextPowerOf2(2) = 2; missing from FOIL table
    const comp = makeCompetition({ fencer_count: 2, weapon: Weapon.FOIL, cut_mode: CutMode.DISABLED })
    const { binding, advisory } = validateBoth(config, [comp])
    expectStructural('de_duration_table', binding, advisory)
  })

  it('does not error when all bracket sizes are in table', () => {
    const comp = makeCompetition({ fencer_count: 24, weapon: Weapon.FOIL, cut_mode: CutMode.DISABLED })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expect(binding.filter(e => e.field === 'de_duration_table')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'de_duration_table')).toHaveLength(0)
  })
})

describe('validateConfig — video R16 strip shortfall (structural: resource impossibility)', () => {
  it('returns ERROR in both modes for STAGED + REQUIRED + video_strips < de_round_of_16_strips', () => {
    // 2 video strips but de_round_of_16_strips = 4 → not enough video strips for R16
    const config = makeConfig({ video_strips_total: 2 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expectStructural('de_video_policy', binding, advisory)
  })

  it('does not error when STAGED + REQUIRED + enough video strips', () => {
    const config = makeConfig({ video_strips_total: 4 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
      de_round_of_16_strips: 4,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'de_video_policy' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'de_video_policy' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateConfig — notice rules (WARN in both modes, never escalates)
// ──────────────────────────────────────────────

describe('validateConfig — days_available notice range (2–4)', () => {
  it.each([1, 5, 14])('returns WARN in both modes for days_available=%i (outside 2–4, inside structural 1–14)', (days) => {
    const config = makeConfig({ days_available: days })
    const { binding, advisory } = validateBoth(config, [makeCompetition()])
    expectNoticePair('days_available', binding, advisory)
  })

  it.each([2, 3, 4])('produces no days_available finding for days_available=%i', (days) => {
    const config = makeConfig({ days_available: days })
    const { binding, advisory } = validateBoth(config, [makeCompetition()])
    expect(binding.filter(e => e.field === 'days_available')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'days_available')).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateConfig — policy rules (ERROR binding / WARN advisory, same substance)
// ──────────────────────────────────────────────

describe('validateConfig — team event without matching individual (policy: team-requires-individual)', () => {
  it('binding ERROR / advisory WARN with identical substance', () => {
    const team = makeCompetition({
      id: 'team-foil-men',
      event_type: EventType.TEAM,
      gender: Gender.MEN,
      category: Category.DIV1,
      weapon: Weapon.FOIL,
    })
    const { binding, advisory } = validateBoth(makeConfig(), [team])
    expectPolicyPair('event_type', binding, advisory)
  })

  it('does not error when matching individual exists', () => {
    const { individual, team } = makeIndividualTeamPair()
    const { binding, advisory } = validateBoth(makeConfig(), [individual, team])
    expect(binding.filter(e => e.field === 'event_type')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'event_type')).toHaveLength(0)
  })
})

describe('validateConfig — team event cut_mode (policy: cut-on-team)', () => {
  it('binding ERROR / advisory WARN when team event has cut_mode != DISABLED', () => {
    const { individual, team } = makeIndividualTeamPair({ team: { cut_mode: CutMode.PERCENTAGE, cut_value: 50 } })
    const { binding, advisory } = validateBoth(makeConfig(), [individual, team])
    expectPolicyPair('cut_mode', binding, advisory, 'must have cut_mode=DISABLED')
  })
})

describe('validateConfig — same population individuals exceed days_available (policy: same-population)', () => {
  it('binding ERROR / advisory WARN when same-population individuals > days_available', () => {
    // Same category + gender + weapon, 4 individual events but only 3 days
    const config = makeConfig({ days_available: 3 })
    const comps = [1, 2, 3, 4].map(i =>
      makeCompetition({
        id: `indiv-${i}`,
        gender: Gender.MEN,
        category: Category.DIV1,
        weapon: Weapon.FOIL,
        event_type: EventType.INDIVIDUAL,
      }),
    )
    const { binding, advisory } = validateBoth(config, comps)
    expectPolicyPair('same_population', binding, advisory)
  })

  it('does not error when same-population count <= days_available', () => {
    const config = makeConfig({ days_available: 3 })
    const comps = [1, 2, 3].map(i =>
      makeCompetition({
        id: `indiv-${i}`,
        gender: Gender.MEN,
        category: Category.DIV1,
        weapon: Weapon.FOIL,
        event_type: EventType.INDIVIDUAL,
      }),
    )
    const { binding, advisory } = validateBoth(config, comps)
    expect(binding.filter(e => e.field === 'same_population')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'same_population')).toHaveLength(0)
  })
})

describe('validateConfig — flighting group strips exceed strips_total (policy: strip minimum shortfalls)', () => {
  it('binding ERROR / advisory WARN when flighting group strips_allocated sum exceeds strips_total', () => {
    const config = makeConfig({ strips_total: 10 })
    const c1 = makeCompetition({ id: 'fg-1', flighted: true, flighting_group_id: 'group-A', strips_allocated: 8 })
    const c2 = makeCompetition({ id: 'fg-2', flighted: true, flighting_group_id: 'group-A', strips_allocated: 6 })
    const { binding, advisory } = validateBoth(config, [c1, c2])
    expectPolicyPair('flighting_group', binding, advisory)
  })

  it('does not error when flighting group strips fit within strips_total', () => {
    const config = makeConfig({ strips_total: 24 })
    const c1 = makeCompetition({ id: 'fg-1', flighted: true, flighting_group_id: 'group-A', strips_allocated: 8 })
    const c2 = makeCompetition({ id: 'fg-2', flighted: true, flighting_group_id: 'group-A', strips_allocated: 8 })
    const { binding, advisory } = validateBoth(config, [c1, c2])
    expect(binding.filter(e => e.field === 'flighting_group')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'flighting_group')).toHaveLength(0)
  })
})

describe('validateConfig — video dead-config warning (notice: video-dead-config)', () => {
  it('WARN in both modes for REQUIRED video policy with SINGLE_STAGE de_mode', () => {
    const comp = makeCompetition({
      de_mode: DeMode.SINGLE_STAGE,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectNoticePair('de_video_policy', binding, advisory, 'no effect')
  })
})

describe('validateConfig — individual+team same-day duration (policy: indiv-team-same-day)', () => {
  it('binding ERROR / advisory WARN when individual + gap + team exceeds DAY_LENGTH_MINS', () => {
    // Use a very short day to force the violation
    const config = makeConfig({ DAY_LENGTH_MINS: 50 })
    const { individual, team } = makeIndividualTeamPair({
      individual: { fencer_count: 24 },
      team: { fencer_count: 8 },
    })
    const { binding, advisory } = validateBoth(config, [individual, team])
    expectPolicyPair('indiv_team_same_day', binding, advisory)
  })

  it('does not error when individual + gap + team fits within DAY_LENGTH_MINS', () => {
    const config = makeConfig()
    const { individual, team } = makeIndividualTeamPair({
      individual: { fencer_count: 24 },
      team: { fencer_count: 8 },
    })
    const { binding, advisory } = validateBoth(config, [individual, team])
    expect(binding.filter(e => e.field === 'indiv_team_same_day')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'indiv_team_same_day')).toHaveLength(0)
  })
})

describe('validateConfig — resource precondition: strips (policy: strip minimum shortfalls)', () => {
  it('binding ERROR / advisory WARN when competition needs more strips than configured (70 fencers → 10 pools, only 8 strips)', () => {
    // ceil(70/7) = 10 pools, but strips_total = 8
    const strips = makeStrips(8, 1)
    const config = makeConfig({ strips })
    const comp = makeCompetition({ id: 'MEN-JR-EPEE-IND', fencer_count: 70, weapon: Weapon.EPEE })
    const { binding, advisory } = validateBoth(config, [comp])
    expectPolicyPair('resource_precondition', binding, advisory)
    const bFinding = binding.find(e => e.field === 'resource_precondition')!
    expect(bFinding.message).toContain('MEN-JR-EPEE-IND')
    expect(bFinding.message).toMatch(/requires 10 strips/)
    expect(bFinding.message).toMatch(/only 8 total strips/)
  })

  it('does not error when competition pool count fits within strips_total', () => {
    // ceil(70/7) = 10 pools, strips_total = 24 → ok
    const config = makeConfig()
    const comp = makeCompetition({ fencer_count: 70, weapon: Weapon.EPEE })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'resource_precondition')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'resource_precondition')).toHaveLength(0)
  })

  it('does not error for competitions below MIN_FENCERS', () => {
    // fencer_count=1 is below MIN_FENCERS=2, already invalid — skip resource check
    const strips = makeStrips(1, 0)
    const config = makeConfig({ strips })
    const comp = makeCompetition({ fencer_count: 1 })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'resource_precondition')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'resource_precondition')).toHaveLength(0)
  })
})

describe('validateConfig — DE strip cap (notice: r16-over-cap)', () => {
  it('WARN in both modes when de_round_of_16_strips exceeds DE strip cap', () => {
    // strips_total=24, max_de_strip_pct=0.33 → cap=floor(24*0.33)=7. R16 requests 10.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.33 })
    const comp = makeCompetition({ id: 'comp-r16-over', de_round_of_16_strips: 10 })
    const { binding, advisory } = validateBoth(config, [comp])
    expectNoticePair('de_round_of_16_strips', binding, advisory)
    const bFinding = binding.find(e => e.field === 'de_round_of_16_strips')!
    expect(bFinding.message).toContain('comp-r16-over')
    expect(bFinding.message).toContain('R16')
  })

  it('does not error when de_round_of_16_strips is within DE strip cap', () => {
    // strips_total=24, max_de_strip_pct=0.80 → cap=19. R16 requests 4 → ok.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.80 })
    const comp = makeCompetition({ id: 'comp-r16-ok', de_round_of_16_strips: 4 })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'de_round_of_16_strips')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'de_round_of_16_strips')).toHaveLength(0)
  })

  it('per-competition max_de_strip_pct_override takes precedence over global pct', () => {
    // Global pct=0.33 (cap=7), but override=0.80 (cap=19). R16 requests 10 → fits under 19.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.33 })
    const comp = makeCompetition({ id: 'comp-de-override', de_round_of_16_strips: 10, max_de_strip_pct_override: 0.80 })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'de_round_of_16_strips')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'de_round_of_16_strips')).toHaveLength(0)
  })
})

describe('validateConfig — regional cut override (notice: regional-cut-override)', () => {
  it('WARN in both modes when a regional tournament has a JUNIOR competition with non-DISABLED cut', () => {
    const config = makeConfig({ tournament_type: TournamentType.ROC })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expectNoticePair('cut_mode', binding, advisory, 'JR-M-FOIL-IND')
  })

  it('does not warn when regional tournament JUNIOR competition has DISABLED cut', () => {
    const config = makeConfig({ tournament_type: TournamentType.ROC })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.DISABLED,
      cut_value: 100,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
  })

  it('does not warn for NAC tournament with non-DISABLED cut on JUNIOR', () => {
    const config = makeConfig({ tournament_type: TournamentType.NAC })
    const comp = makeCompetition({
      id: 'JR-M-FOIL-IND',
      category: Category.JUNIOR,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
  })

  it('does not warn for regional tournament with non-override category (VETERAN)', () => {
    const config = makeConfig({ tournament_type: TournamentType.SYC })
    const comp = makeCompetition({
      id: 'VET-M-FOIL-IND',
      category: Category.VETERAN,
      cut_mode: CutMode.PERCENTAGE,
      cut_value: 20,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'cut_mode' && e.message.includes('override'))).toHaveLength(0)
  })
})

describe('validateConfig — feasibility (policy: feasibility)', () => {
  it('binding ERROR / advisory WARN when total strip-hours exceed total capacity', () => {
    const config = makeConfig({ days_available: 2, strips: makeStrips(2, 0) })
    const comps = Array.from({ length: 20 }, (_, i) => makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }))
    const { binding, advisory } = validateBoth(config, comps)
    expectPolicyPair('feasibility', binding, advisory)
    const bFinding = binding.find(e => e.field === 'feasibility')!
    expect(bFinding.message).toMatch(/RESOURCE_INSUFFICIENT/)
  })
})

describe('validateConfig — feasibility_video (policy: feasibility)', () => {
  it('binding ERROR / advisory WARN when staged events need more video strip-hours than available', () => {
    const config = makeConfig({ days_available: 4, strips: makeStrips(80, 1) })
    const comps = Array.from({ length: 40 }, (_, i) =>
      makeCompetition({
        id: `EVT-${i}`,
        fencer_count: 200,
        de_mode: DeMode.STAGED,
        de_video_policy: VideoPolicy.REQUIRED,
        de_round_of_16_strips: 4,
      }),
    )
    const { binding, advisory } = validateBoth(config, comps)
    expectPolicyPair('feasibility_video', binding, advisory)
  })
})

// ──────────────────────────────────────────────
// validateConfig — valid config returns no errors
// ──────────────────────────────────────────────

describe('validateConfig — valid config returns no errors', () => {
  it('returns no ERROR findings in either mode for a well-formed NAC config with one competition', () => {
    const config = makeConfig()
    const comp = makeCompetition()
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })
})

// ──────────────────────────────────────────────
// validateConfig — rule catalogue equality across modes (SC-003/SC-004)
// ──────────────────────────────────────────────

describe('validateConfig — rule catalogue is equal across modes', () => {
  it('every finding carries a kind; structural is ERROR in both modes, policy is ERROR(binding)/WARN(advisory), notice is WARN in both modes', () => {
    // A config firing several structural, policy, and notice rules at once
    // (days_available=1 is a notice — outside 2–4, inside structural 1–14;
    // strips_total=0 also drops the DE strip cap to 0, so the default
    // de_round_of_16_strips=4 on every competition fires the r16-over-cap
    // notice too).
    const config = makeConfig({ days_available: 1, strips_total: 0, strips: [] })
    const { individual, team } = makeIndividualTeamPair({ team: { cut_mode: CutMode.PERCENTAGE, cut_value: 50 } })
    const badCutValue = makeCompetition({ id: 'bad-cut', cut_mode: CutMode.PERCENTAGE, cut_value: 0 })
    const { binding, advisory } = validateBoth(config, [individual, team, badCutValue])

    // Rule catalogue equality: same count, same fields fired, in both modes —
    // only severity (and, transitively, kind-driven severity) differs.
    expect(binding).toHaveLength(advisory.length)
    expect(binding.map(e => e.field).sort()).toEqual(advisory.map(e => e.field).sort())

    // Every finding must be tagged with a kind (fails today — kind is always
    // undefined until T017 populates it).
    expect(binding.every(e => e.kind !== undefined)).toBe(true)
    expect(advisory.every(e => e.kind !== undefined)).toBe(true)

    const structuralBinding = binding.filter(e => e.kind === RuleKind.STRUCTURAL)
    const structuralAdvisory = advisory.filter(e => e.kind === RuleKind.STRUCTURAL)
    expect(structuralBinding.length).toBeGreaterThan(0)
    expect(structuralBinding.every(e => e.severity === BottleneckSeverity.ERROR)).toBe(true)
    expect(structuralAdvisory.every(e => e.severity === BottleneckSeverity.ERROR)).toBe(true)

    const policyBinding = binding.filter(e => e.kind === RuleKind.POLICY)
    const policyAdvisory = advisory.filter(e => e.kind === RuleKind.POLICY)
    expect(policyBinding.length).toBeGreaterThan(0)
    expect(policyBinding.every(e => e.severity === BottleneckSeverity.ERROR)).toBe(true)
    expect(policyAdvisory.every(e => e.severity === BottleneckSeverity.WARN)).toBe(true)

    // Notice findings (research D3 correction, 2026-08-29): WARN in both
    // modes, never ERROR. RuleKind has no NOTICE member yet (T017), so this
    // asserts the string literal directly.
    const noticeBinding = binding.filter(e => e.kind === 'notice')
    const noticeAdvisory = advisory.filter(e => e.kind === 'notice')
    expect(noticeBinding.length).toBeGreaterThan(0)
    expect(noticeBinding.every(e => e.severity === BottleneckSeverity.WARN)).toBe(true)
    expect(noticeAdvisory.every(e => e.severity === BottleneckSeverity.WARN)).toBe(true)
  })
})

// ──────────────────────────────────────────────
// validateSameDayCompletion — exported but not wired into validateConfig's
// pipeline (no callers in src/); out of scope for the kind/mode split.
// Signature and behavior unchanged by this feature.
// ──────────────────────────────────────────────

describe('validateSameDayCompletion', () => {
  it('returns null when competition fits comfortably within DAY_LENGTH_MINS', () => {
    const comp = makeCompetition({ fencer_count: 24, weapon: Weapon.FOIL, cut_mode: CutMode.DISABLED })
    const result = validateSameDayCompletion(comp, makeConfig())
    expect(result).toBeNull()
  })

  it('returns error when pool + admin + DE exceeds DAY_LENGTH_MINS', () => {
    // Craft a config with a very short day but normal competition size
    const config = makeConfig({ DAY_LENGTH_MINS: 10 })
    const comp = makeCompetition({ fencer_count: 64, weapon: Weapon.EPEE, cut_mode: CutMode.DISABLED })
    const result = validateSameDayCompletion(comp, config)
    expect(result).not.toBeNull()
    expect(result?.severity).toBe(BottleneckSeverity.ERROR)
    expect(result?.field).toBe('same_day_completion')
  })
})

// ──────────────────────────────────────────────
// validateFeasibility — sub-validator direct-call tests, signature unchanged
// (only validateConfig gains the mode parameter — see catalogue note above).
// ──────────────────────────────────────────────

describe('validateFeasibility', () => {
  it('returns no errors when total strip-hour demand fits within capacity', () => {
    const config = makeConfig({
      days_available: 4,
      strips: makeStrips(40, 4),
    })
    const comps = [
      makeCompetition({ id: 'A', fencer_count: 24 }),
      makeCompetition({ id: 'B', fencer_count: 24 }),
    ]
    expect(validateFeasibility(config, comps)).toHaveLength(0)
  })

  it('flags RESOURCE_INSUFFICIENT when total strip-hours exceed total capacity', () => {
    // Tiny tournament + many large events → guaranteed shortfall.
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(2, 0),
    })
    const comps = Array.from({ length: 20 }, (_, i) =>
      makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }),
    )
    const errors = validateFeasibility(config, comps)
    const error = errors.find(e => e.field === 'feasibility')
    expect(error).toBeDefined()
    expect(error!.severity).toBe(BottleneckSeverity.ERROR)
    expect(error!.message).toMatch(/RESOURCE_INSUFFICIENT/)
    expect(error!.message).toMatch(/Add \d+ more day\(s\)/)
    expect(error!.message).toMatch(/OR \d+ more strip\(s\)/)
  })

  it('reports a non-zero shortfall percentage in the diagnostic message', () => {
    const config = makeConfig({
      days_available: 2,
      strips: makeStrips(4, 0),
    })
    const comps = Array.from({ length: 10 }, (_, i) =>
      makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }),
    )
    const errors = validateFeasibility(config, comps)
    const error = errors.find(e => e.field === 'feasibility')!
    expect(error.message).toMatch(/Shortfall \d+ \(~\d+%\)/)
  })

  it('skips silently when no competitions are provided', () => {
    const config = makeConfig({ days_available: 4, strips: makeStrips(80, 8) })
    expect(validateFeasibility(config, [])).toHaveLength(0)
  })

  it('skips silently when strips_total is zero (handled by strip-config validator)', () => {
    const config = makeConfig({ days_available: 4, strips: [] })
    const comps = [makeCompetition({ id: 'EVT', fencer_count: 100 })]
    expect(validateFeasibility(config, comps)).toHaveLength(0)
  })

  it('flags video shortfall separately when staged events need more video strip-hours than available', () => {
    // Many staged DE events, very few video strips. With bracket=256 sabre and
    // 4 R16 strips per event, video need swamps the single video strip's
    // 56 hours of capacity once we cross ~25 events.
    const config = makeConfig({
      days_available: 4,
      strips: makeStrips(80, 1),
    })
    const comps = Array.from({ length: 40 }, (_, i) =>
      makeCompetition({
        id: `EVT-${i}`,
        fencer_count: 200,
        de_mode: DeMode.STAGED,
        de_video_policy: VideoPolicy.REQUIRED,
        de_round_of_16_strips: 4,
      }),
    )
    const errors = validateFeasibility(config, comps)
    const videoError = errors.find(e => e.field === 'feasibility_video')
    expect(videoError).toBeDefined()
    expect(videoError!.message).toMatch(/RESOURCE_INSUFFICIENT \(video\)/)
  })
})

describe('validateConfig integrates feasibility', () => {
  it('surfaces RESOURCE_INSUFFICIENT errors via the main validateConfig pipeline (binding mode)', () => {
    const config = makeConfig({ days_available: 2, strips: makeStrips(2, 0) })
    const comps = Array.from({ length: 20 }, (_, i) =>
      makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }),
    )
    const { binding } = validateBoth(config, comps)
    const error = binding.find(e => e.field === 'feasibility')
    expect(error).toBeDefined()
    expect(error!.severity).toBe(BottleneckSeverity.ERROR)
  })

  it('does not flag B-series-style realistic configs', () => {
    // Approximate B7: 4d, 80 strips, 8 video, 18 large events.
    const config = makeConfig({ days_available: 4, strips: makeStrips(80, 8) })
    const comps = Array.from({ length: 18 }, (_, i) =>
      makeCompetition({ id: `EVT-${i}`, fencer_count: 240 }),
    )
    const { binding, advisory } = validateBoth(config, comps)
    expect(binding.filter(e => e.field === 'feasibility' || e.field === 'feasibility_video')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'feasibility' || e.field === 'feasibility_video')).toHaveLength(0)
  })
})
