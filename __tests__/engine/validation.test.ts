import { describe, it, expect } from 'vitest'
import { validateConfig, validateSameDayCompletion, validateFeasibility } from '../../src/engine/validation.ts'
import * as validationEngine from '../../src/engine/validation.ts'
import type { TournamentConfig, ValidationError, Competition } from '../../src/engine/types.ts'
import {
  Category, CutMode, DeMode, EventType, Gender, TournamentType, VideoPolicy, Weapon,
  BottleneckSeverity, RuleKind, ValidationMode,
} from '../../src/engine/types.ts'
import { makeConfig, makeCompetition, makeStrips } from '../helpers/factories.ts'
import { deBlocksFor } from '../../src/engine/de.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { useStore, type StoreState } from '../../src/store/store.ts'

/**
 * `findingIdentity` — the identity helper T021 adds to validation.ts
 * (research D4, data-model.md §Finding): `${rule}:${subjects.join('+')}`.
 * This name IS the contract T021 must satisfy — do not rename it here to
 * make a test pass; change validation.ts to export this name instead.
 * Referenced through an `unknown` cast (same pattern as
 * __tests__/store/placements.test.ts's FutureState) so this file keeps
 * compiling clean before the export exists — the TDD failure is a runtime
 * error here, not a tsc error.
 */
function findingIdentity(finding: ValidationError): string {
  const engine = validationEngine as unknown as { findingIdentity?: (f: ValidationError) => string }
  if (!engine.findingIdentity) {
    throw new Error('validation.ts does not yet export findingIdentity (T021)')
  }
  return engine.findingIdentity(finding)
}

// ──────────────────────────────────────────────
// Rule → kind catalogue (research.md D3 + Correction 2026-08-29,
// data-model.md "Finding")
//
// STRUCTURAL — leaves nothing to draw; ERROR in both modes. D3-explicit:
//   fencer_count bounds, days_available outside 1–14, strips_total below 1.
//   (The de_duration_table missing-entry rule went with the table in 024.)
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
//   - team-staged-or-video (de_mode): a TEAM event that is STAGED or REQUIRED
//     (024 D4). The app and the ledger never build one, so it can only be a
//     hand-built config carrying a second DE model for one event.
//
// POLICY — advisable, not physically blocking; ERROR(binding) / WARN(advisory).
// D3-explicit: same_population, team-requires-individual (event_type),
//   strip minimum shortfalls (resource_precondition), feasibility.
// Self-classified:
//   - flighting_group strip shortfalls — same resource-capacity class as
//     resource_precondition's "strip minimum shortfalls", D3's explicit policy
//     item; grouped with it rather than invented as a new bucket.
//   - feasibility_video — not named separately in D3's text; produced by the
//     same validateFeasibility() sub-validator as feasibility, on the
//     identical FEASIBILITY_SLACK-tolerant resource-insufficiency computation
//     applied to the video-strip-hours axis. Grouped with feasibility rather
//     than invented as a new bucket.
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
//   - r16-over-cap (the video ask over the DE strip cap) — soft
//     resource-tuning guidance; the code's own comment already calls these
//     "soft warnings... the user may have intentionally overridden." Fires 0
//     times across B1–B8 (no drift risk of its own) but moved for
//     consistency with the same "soft, may be intentional" class.
//   - days_available outside 2–4 (within structural 1–14) — advisory-only
//     per spec acceptance scenario 3 (spec.md:106-108): a 5-day tournament
//     warns and the schedule can still be computed.
//   - cut-on-team (cut_mode) — moved off POLICY by R3/FR-011 (specs/010-wave-1-reconciliation/research.md
//     D4, removed; git show 0ab5bd2dc9:specs/010-wave-1-reconciliation/research.md): team events reach the engine
//     DISABLED because defaultCutForEntry answers DISABLED/100 for every team
//     entry, so the finding is a heads-up on a cosmetic field, not a gate.
// 015, 2026-10-05 – with the converged factory (every event built by the app's
// per-type rules) the regional-cut override rule fires 0x on B1–B8, and the
// video dead-config rule fires on B4 (6x), B5 (12x) and B6 (12x).
// 024 group C, 2026-10-06 – the video dead-config rule no longer fires on B4, B5 or B6: regional individual events are BEST_EFFORT (D9).
//
// OUT OF SCOPE for this catalogue: `validateSameDayCompletion` is exported
// and directly tested, but has zero callers anywhere in src/ (confirmed by
// grep) — it is not wired into validateConfig's pipeline, so the kind/mode
// split does not reach it. Its existing direct-call tests are left as-is.
// `validateFeasibility` is a sub-validator assembled into validateConfig's
// pipeline, called with the 2-arg signature since only validateConfig's
// signature is contractually stated to gain the mode parameter (research
// D3, tasks.md T017). Its findings are NOTICE-kind as of 011 (FR-001/FR-002,
// research D1/D2): the demotion lives in the finding constructor, not in a
// re-derivation inside validateConfig, so the direct-call tests below see
// WARN too. That correction supersedes this note's earlier prediction that
// they would keep ERROR — measured, not predicted (011 tasks.md rule 8).
// ──────────────────────────────────────────────

/** Runs validateConfig once per mode; only severity (and now kind) should differ. */
function validateBoth(config: TournamentConfig, competitions: Competition[]) {
  return {
    binding: validateConfig(config, competitions, ValidationMode.BINDING),
    advisory: validateConfig(config, competitions, ValidationMode.ADVISORY),
  }
}

/** 24 fencers fill a 32 bracket, which asks 4 video strips. */
const BRACKET_32_FENCERS = 24

/**
 * The competitions the store bridge builds for these ids at a tournament type
 * under a DE-mode override, so a test reads the policy the app really derives
 * (024 plan D9) and not a hand-built copy of it.
 */
function buildTypeCompetitions(type: TournamentType, deModeOverride: DeMode, ids: string[]): Competition[] {
  const initial = useStore.getState()
  useStore.setState({
    tournament_type: type,
    de_mode_override: deModeOverride,
    selectedCompetitions: Object.fromEntries(ids.map(id => [id, { fencer_count: BRACKET_32_FENCERS, flighted: false }])),
  } as Partial<StoreState>)
  try {
    return buildTournamentConfig(useStore.getState()).competitions
  } finally {
    useStore.setState(initial)
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
 * shape team-requires-individual and cut-on-team pair against, and the shape
 * the deleted indiv-team-same-day rule used to fire on (FR-001).
 * `overrides.individual`/`overrides.team` extend the fixture per test (e.g.
 * fencer_count, cut_mode) without repeating the shared category/gender/weapon
 * fields at each call site.
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

  it('returns ERROR in both modes when fencer_count exceeds MAX_FENCERS (336)', () => {
    const comp = makeCompetition({ fencer_count: 337 })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expectStructural('fencer_count', binding, advisory)
  })

  it('does not error for fencer_count at boundary values (2 and 336)', () => {
    const low = makeCompetition({ id: 'low', fencer_count: 2 })
    const high = makeCompetition({ id: 'high', fencer_count: 336 })
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

describe('validateConfig — no DE duration table rule (024: DEs derive from bout time)', () => {
  it('raises no de-duration-table finding, even for a config still carrying a table that lacks the bracket', () => {
    // METHODOLOGY.md §DE Duration derives every DE from its rounds and bout
    // time, so no bracket can be missing an entry. A config carrying the old
    // key – here with no bracket of 2 for foil – is read past, not checked.
    const legacyTable = {
      FOIL: { 4: 30, 8: 45, 16: 60, 32: 90, 64: 120, 128: 180, 256: 240 },
      EPEE: {},
      SABRE: {},
    }
    const config = { ...makeConfig(), de_duration_table: legacyTable } as TournamentConfig
    const individual = makeCompetition({ id: 'indiv', fencer_count: 2, weapon: Weapon.FOIL, cut_mode: CutMode.DISABLED })
    const team = makeCompetition({ id: 'team', fencer_count: 2, weapon: Weapon.FOIL, event_type: EventType.TEAM })
    const { binding, advisory } = validateBoth(config, [individual, team])
    expect(binding.filter(e => e.rule === 'de-duration-table-missing-entry')).toEqual([])
    expect(advisory.filter(e => e.rule === 'de-duration-table-missing-entry')).toEqual([])
  })
})

describe('validateConfig — video R16 strip shortfall (structural: resource impossibility)', () => {
  it('returns ERROR in both modes for STAGED + REQUIRED + video_strips < the video ask', () => {
    // 24 fencers → bracket 32, so the video block asks min(4, 32/2) = 4 video
    // strips (METHODOLOGY.md §DE Modes, §DE Phase Breakdown). 2 are not enough.
    const config = makeConfig({ video_strips_total: 2 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expectStructural('de_video_policy', binding, advisory)
  })

  it('does not error when STAGED + REQUIRED + enough video strips', () => {
    // Bracket 32 asks 4 video strips, and 4 are available.
    const config = makeConfig({ video_strips_total: 4 })
    const comp = makeCompetition({
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'de_video_policy' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'de_video_policy' && e.severity === BottleneckSeverity.ERROR)).toHaveLength(0)
  })

  it('a bracket of 2 asks no video strips, so 0 available is no shortfall', () => {
    // METHODOLOGY.md §DE Duration 'No counted round': a bracket of 2 asks no
    // strips, general or video (024 plan D5).
    const config = makeConfig({ video_strips_total: 0 })
    const comp = makeCompetition({
      fencer_count: 2,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
    expect(advisory.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
  })

  it('a bracket of 4 asks 2 video strips: 1 is a shortfall, 2 is not', () => {
    // Guard (024 plan Task C, from A): a small bracket asks fewer than 4 strips, never more than it can seat.
    // METHODOLOGY.md §DE Modes: the video block asks min(4, bracket/2) strips.
    const comp = makeCompetition({
      fencer_count: 4,
      cut_mode: CutMode.DISABLED,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const short = validateBoth(makeConfig({ video_strips_total: 1 }), [comp])
    const enough = validateBoth(makeConfig({ video_strips_total: 2 }), [comp])
    expect(short.binding.filter(e => e.rule === 'video-r16-strip-shortfall')).toHaveLength(1)
    expect(enough.binding.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
    expect(enough.advisory.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
  })

  it('the message names the video stage, not R16', () => {
    // 024 plan D9 and rulings D13: the stage is the video stage whatever its
    // first round, so the message does not name R16.
    const comp = makeCompetition({
      id: 'comp-video-short',
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding } = validateBoth(makeConfig({ video_strips_total: 2 }), [comp])
    const finding = binding.find(e => e.rule === 'video-r16-strip-shortfall')!
    expect(finding.message).toContain('video stage')
    expect(finding.message).not.toContain('R16')
  })

  it('a regional event under a Staged override draws no shortfall error', () => {
    // The policy follows the type (METHODOLOGY.md §Tournament-Type Policies;
    // 024 plan D9): a regional event is BEST_EFFORT even when the override
    // makes it Staged, so zero video strips is no impossibility.
    const config = makeConfig({ video_strips_total: 0 })
    const competitions = buildTypeCompetitions(TournamentType.ROC, DeMode.STAGED, [
      'D1-M-FOIL-IND', 'JR-M-FOIL-IND', 'CDT-M-FOIL-IND',
    ])
    expect(competitions.map(c => c.de_mode), 'override reached every event')
      .toEqual(competitions.map(() => DeMode.STAGED))
    const { binding, advisory } = validateBoth(config, competitions)
    expect(binding.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
    expect(advisory.filter(e => e.rule === 'video-r16-strip-shortfall')).toEqual([])
  })
})

// 024 D4, the owner's team ruling (METHODOLOGY.md §DE Modes, §Video Replay
// Policy): a team event is Single Stage and BEST_EFFORT at every type. The
// store bridge and the ledger factory never build anything else, so a team
// event carrying STAGED or REQUIRED is a hand-built second model of one event.
describe('validateConfig — team event staged or video-required (structural: team-staged-or-video, 024 D4)', () => {
  const RULE = 'team-staged-or-video'

  function teamFindings(team: Partial<Competition>) {
    const comp = makeCompetition({ id: 'team', event_type: EventType.TEAM, ...team })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    return { binding: binding.filter(e => e.rule === RULE), advisory: advisory.filter(e => e.rule === RULE) }
  }

  it.each([
    ['STAGED', { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.BEST_EFFORT }],
    ['REQUIRED', { de_mode: DeMode.SINGLE_STAGE, de_video_policy: VideoPolicy.REQUIRED }],
    ['STAGED and REQUIRED', { de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED }],
  ] as const)('returns one ERROR in both modes for a team event that is %s', (_label, team) => {
    const { binding, advisory } = teamFindings(team)
    expect(binding).toHaveLength(1)
    expect(advisory).toHaveLength(1)
    expectStructural(binding[0].field, binding, advisory)
    expect(binding[0].subjects).toEqual(['team'])
  })

  it('(guard) raises nothing for a Single Stage, BEST_EFFORT team event', () => {
    const { binding, advisory } = teamFindings({ de_mode: DeMode.SINGLE_STAGE, de_video_policy: VideoPolicy.BEST_EFFORT })
    expect(binding).toEqual([])
    expect(advisory).toEqual([])
  })

  it('(guard) raises nothing for a STAGED, REQUIRED individual event', () => {
    const comp = makeCompetition({ id: 'indiv', de_mode: DeMode.STAGED, de_video_policy: VideoPolicy.REQUIRED })
    const { binding, advisory } = validateBoth(makeConfig(), [comp])
    expect(binding.filter(e => e.rule === RULE)).toEqual([])
    expect(advisory.filter(e => e.rule === RULE)).toEqual([])
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

describe('validateConfig — team event cut_mode (notice: cut-on-team, FR-011)', () => {
  it('WARN in both modes, never ERROR, when a team event has cut_mode != DISABLED', () => {
    // Was a policy pair (binding ERROR / advisory WARN) before FR-011 — R3
    // demotes it to a notice so a cosmetic field can never discard a
    // schedule (research.md D4). Asserted on rule id, severity and kind,
    // never message text, matching how regional-cut-override is tested.
    const { individual, team } = makeIndividualTeamPair({ team: { cut_mode: CutMode.PERCENTAGE, cut_value: 50 } })
    const { binding, advisory } = validateBoth(makeConfig(), [individual, team])
    const b = binding.find(e => e.rule === 'cut-on-team')
    const a = advisory.find(e => e.rule === 'cut-on-team')
    expect(b, 'binding: expected a cut-on-team finding').toBeDefined()
    expect(a, 'advisory: expected a cut-on-team finding').toBeDefined()
    expect(b!.severity).toBe(BottleneckSeverity.WARN)
    expect(a!.severity).toBe(BottleneckSeverity.WARN)
    expect(b!.kind).toBe(RuleKind.NOTICE)
    expect(a!.kind).toBe(RuleKind.NOTICE)
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

  it('a NAC under a Single Stage override keeps every individual event REQUIRED, with one notice each and none for teams', () => {
    // The policy follows the type, never the DE-mode setting (METHODOLOGY.md
    // §Tournament-Type Policies, §Video Policy Interaction; 024 plan D9).
    const individualIds = ['Y10-M-FOIL-IND', 'CDT-M-FOIL-IND', 'VET-M-FOIL-IND-V40', 'D1-M-FOIL-IND']
    const teamIds = ['CDT-M-FOIL-TEAM', 'D1-M-FOIL-TEAM']
    const competitions = buildTypeCompetitions(TournamentType.NAC, DeMode.SINGLE_STAGE, [...individualIds, ...teamIds])
    for (const comp of competitions) {
      const expected = comp.event_type === EventType.TEAM ? VideoPolicy.BEST_EFFORT : VideoPolicy.REQUIRED
      expect(comp.de_video_policy, comp.id).toBe(expected)
    }

    const { binding, advisory } = validateBoth(makeConfig({ video_strips_total: 8 }), competitions)
    for (const findings of [binding, advisory]) {
      const dead = findings.filter(e => e.rule === 'video-dead-config')
      expect(dead.map(e => e.subjects).sort()).toEqual(individualIds.map(id => [id]).sort())
    }
  })
})

describe('validateConfig — individual+team same-day duration (rule deleted, FR-001)', () => {
  it('produces no indiv-team-same-day finding even when the combined worst-case duration exceeds DAY_LENGTH_MINS', () => {
    // Same fixture the deleted rule used to fire on: a very short day forces
    // the combined worst-case duration over DAY_LENGTH_MINS. Every such pair
    // is same-population, so crossoverPenalty is Infinity and the day
    // assigner can never place them on the same day — the rule reasoned
    // about a hypothetical the engine forbids (methodology-reconciliation.md
    // §1.2.4). Asserted on rule id, never message text.
    const config = makeConfig({ DAY_LENGTH_MINS: 50 })
    const { individual, team } = makeIndividualTeamPair({
      individual: { fencer_count: 24 },
      team: { fencer_count: 8 },
    })
    const { binding, advisory } = validateBoth(config, [individual, team])
    expect(binding.filter(e => e.rule === 'indiv-team-same-day')).toHaveLength(0)
    expect(advisory.filter(e => e.rule === 'indiv-team-same-day')).toHaveLength(0)
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
  // The video block asks min(4, bracket/2) strips (METHODOLOGY.md §DE Modes,
  // §DE Phase Breakdown), so at 24 fencers (bracket 32) it asks 4, and only a
  // DE cap below 4 can be exceeded.
  it('WARN in both modes when the video ask exceeds DE strip cap', () => {
    // The field names the per-event lever that clears the notice.
    // strips_total=24, max_de_strip_pct=0.1 → cap=floor(24*0.1)=2. R16 asks 4.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.1 })
    const comp = makeCompetition({ id: 'comp-r16-over' })
    const { binding, advisory } = validateBoth(config, [comp])
    expectNoticePair('max_de_strip_pct_override', binding, advisory)
    const bFinding = binding.find(e => e.field === 'max_de_strip_pct_override')!
    expect(bFinding.message).toContain('comp-r16-over')
    expect(bFinding.message).toContain('video stage')
    expect(bFinding.message).not.toContain('R16')
  })

  it('does not error when the video ask is within DE strip cap', () => {
    // strips_total=24, max_de_strip_pct=0.80 → cap=19. R16 asks 4 → ok.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.80 })
    const comp = makeCompetition({ id: 'comp-r16-ok' })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'max_de_strip_pct_override')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'max_de_strip_pct_override')).toHaveLength(0)
  })

  it('per-competition max_de_strip_pct_override takes precedence over global pct', () => {
    // Global pct=0.1 (cap=2), but override=0.80 (cap=19). R16 asks 4 → fits under 19.
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0.1 })
    const comp = makeCompetition({ id: 'comp-de-override', max_de_strip_pct_override: 0.80 })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.field === 'max_de_strip_pct_override')).toHaveLength(0)
    expect(advisory.filter(e => e.field === 'max_de_strip_pct_override')).toHaveLength(0)
  })

  it('a bracket of 2 asks no strips, so a DE cap of 0 is not exceeded', () => {
    // max_de_strip_pct=0 → cap=0. A bracket of 2 has no counted round and asks
    // nothing (METHODOLOGY.md §DE Duration 'No counted round'; 024 plan D5).
    const config = makeConfig({ strips_total: 24, max_de_strip_pct: 0 })
    const comp = makeCompetition({
      fencer_count: 2,
      de_mode: DeMode.STAGED,
      de_video_policy: VideoPolicy.REQUIRED,
    })
    const { binding, advisory } = validateBoth(config, [comp])
    expect(binding.filter(e => e.rule === 'r16-over-cap')).toEqual([])
    expect(advisory.filter(e => e.rule === 'r16-over-cap')).toEqual([])
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

// ──────────────────────────────────────────────
// Feasibility demotes to notice-kind (011, FR-001/FR-002, research D1/D2) —
// TDD red for T003/T004. Today validateConfig re-derives feasibility's
// severity from mode (ERROR under binding, WARN under advisory), the same
// policy-kind mapping asserted two describe blocks up. FR-001/FR-002 replace
// that with WARN in EVERY mode, never escalating — the notice-kind shape
// `expectNoticePair` already asserts for other rules above. Rule id, field
// and message text must survive the demotion unchanged, so both are pinned
// explicitly below rather than left to `expectNoticePair`'s field-only match.
// ──────────────────────────────────────────────

describe('validateConfig — feasibility demotes to notice in every mode (011 FR-001)', () => {
  it('feasibility-strip-hours is WARN under binding AND advisory, rule id/field/message unchanged', () => {
    const config = makeConfig({ days_available: 2, strips: makeStrips(2, 0) })
    const comps = Array.from({ length: 20 }, (_, i) => makeCompetition({ id: `EVT-${i}`, fencer_count: 200 }))
    const { binding, advisory } = validateBoth(config, comps)

    // Fails today: validateConfig sets binding severity to ERROR (validation.ts:433-436).
    expectNoticePair('feasibility', binding, advisory)

    const b = binding.find(e => e.field === 'feasibility')!
    const a = advisory.find(e => e.field === 'feasibility')!
    expect(b.rule).toBe('feasibility-strip-hours')
    expect(a.rule).toBe('feasibility-strip-hours')
    // 024, 2026-10-06 – re-derived from METHODOLOGY.md §Strip-Hour Capacity
    // under the 2026-27 planning times (Ops Manual p.17). Each 200-fencer foil
    // event: 29 pools (26 of 7 at 120 min, 3 of 6 at 86), weighted round(3378 /
    // 29) = 116 min, so 29 × 116 / 60 = 56.07 pool strip-hours. Its single
    // stage DE: 200 promoted, bracket 256, 72 + 64 + 32 + 16 + 8 + 4 + 2 = 198
    // bouts × 20 min / 60 = 66 (§DE Capacity Estimation). 20 × 122.07 = 2441,
    // against 2 days × 2 strips × the 10-hour planning day (§Strip-Hour
    // Capacity, Ops Manual p.17) = 40: shortfall 2401 (6003.3% → 6003), and
    // ceil(2401.3 / 20) = 121 more days or strips.
    expect(b.message).toBe(
      'RESOURCE_INSUFFICIENT: 2441 general strip-hours needed over 20 events; 40 available (2d × 2s × 10h). Shortfall 2401 (~6003%). Add 121 more day(s) OR 121 more strip(s).',
    )
  })
})

describe('validateConfig — feasibility_video demotes to notice in every mode (011 FR-002)', () => {
  it('feasibility-video-strip-hours is WARN under binding AND advisory, rule id/field/message unchanged', () => {
    const config = makeConfig({ days_available: 4, strips: makeStrips(80, 1) })
    const comps = Array.from({ length: 40 }, (_, i) =>
      makeCompetition({
        id: `EVT-${i}`,
        fencer_count: 200,
        de_mode: DeMode.STAGED,
        de_video_policy: VideoPolicy.REQUIRED,
      }),
    )
    const { binding, advisory } = validateBoth(config, comps)

    // Fails today: validateConfig sets binding severity to ERROR (validation.ts:433-436).
    expectNoticePair('feasibility_video', binding, advisory)

    const b = binding.find(e => e.field === 'feasibility_video')!
    const a = advisory.find(e => e.field === 'feasibility_video')!
    expect(b.rule).toBe('feasibility-video-strip-hours')
    expect(a.rule).toBe('feasibility-video-strip-hours')
    // 024, 2026-10-06 – re-derived from METHODOLOGY.md §DE Capacity Estimation
    // → Individual Events: a staged Div 1 event's video stage starts at the
    // round of 16 (Ops Manual 2026-27 p.19), so only R16 + QF + SF = 8 + 4 + 2
    // = 14 bouts bill video, × 20 min / 60 = 4.67 h. 40 × 4.67 = 187 against
    // 4 × 1 × 10 = 40 (the 10-hour planning day, §Strip-Hour Capacity):
    // shortfall 147, ceil(146.7 / 10) = 15 more days, ceil(146.7 / 40) = 4
    // more video strips.
    expect(b.message).toBe(
      'RESOURCE_INSUFFICIENT (video): 187 video strip-hours needed; 40 available (4d × 1vs × 10h). Shortfall 147. 15 more day(s) OR 4 more video strip(s).',
    )
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
    // the video block's ask of 4 strips on every competition fires the r16-over-cap
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
// Finding identity (US3, research D4, data-model.md §Finding) — rule id
// plus subjects, stable across recomputes, independent of message
// magnitudes, distinct per subject, never colliding within one recompute.
// ──────────────────────────────────────────────

describe('finding identity — stable across recomputes (US3, research D4)', () => {
  it('is equal across two recomputes of the same config for the same finding', () => {
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
    const first = validateConfig(config, comps, ValidationMode.BINDING)
    const second = validateConfig(config, comps, ValidationMode.BINDING)

    const firstFinding = first.find(e => e.field === 'same_population')
    const secondFinding = second.find(e => e.field === 'same_population')
    expect(firstFinding, 'first recompute should still fire same_population').toBeDefined()
    expect(secondFinding, 'second recompute should still fire same_population').toBeDefined()
    expect(findingIdentity(firstFinding!)).toBe(findingIdentity(secondFinding!))
  })

  it('is unchanged when only a magnitude in the message changes, not the violating subject', () => {
    // MEN-JR-EPEE-IND, 70 fencers → ceil(70/7)=10 pools, fires
    // resource_precondition at both strips_total=8 and strips_total=9 — same
    // rule, same violating competition, only the "only N total strips"
    // magnitude in the message differs.
    const comp = makeCompetition({ id: 'MEN-JR-EPEE-IND', fencer_count: 70, weapon: Weapon.EPEE })
    const lowStrips = validateConfig(makeConfig({ strips: makeStrips(8, 1) }), [comp], ValidationMode.BINDING)
    const higherStrips = validateConfig(makeConfig({ strips: makeStrips(9, 1) }), [comp], ValidationMode.BINDING)

    const findingLow = lowStrips.find(e => e.field === 'resource_precondition')
    const findingHigh = higherStrips.find(e => e.field === 'resource_precondition')
    expect(findingLow, 'strips_total=8 should still fire resource_precondition').toBeDefined()
    expect(findingHigh, 'strips_total=9 should still fire resource_precondition').toBeDefined()
    expect(findingLow!.message).not.toBe(findingHigh!.message) // sanity: the magnitude actually changed
    expect(findingIdentity(findingLow!)).toBe(findingIdentity(findingHigh!))
  })

  it('is distinct for the same rule fired on different subjects, and no two findings in one recompute collide', () => {
    // Two independent competitions each exceeding strips_total=5 on the same
    // resource_precondition rule: EVT-A needs 10 pools (70 fencers), EVT-B
    // needs 8 pools (50 fencers).
    const config = makeConfig({ strips: makeStrips(5, 1) })
    const compA = makeCompetition({ id: 'EVT-A', fencer_count: 70, weapon: Weapon.EPEE })
    const compB = makeCompetition({ id: 'EVT-B', fencer_count: 50, weapon: Weapon.EPEE })
    const findings = validateConfig(config, [compA, compB], ValidationMode.BINDING)

    const resourceFindings = findings.filter(e => e.field === 'resource_precondition')
    expect(resourceFindings).toHaveLength(2)
    expect(findingIdentity(resourceFindings[0])).not.toBe(findingIdentity(resourceFindings[1]))

    const identities = findings.map(findingIdentity)
    expect(new Set(identities).size).toBe(identities.length)
  })
})

describe('finding identity — rule and subjects per kind (US3, data-model.md §Finding)', () => {
  const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/

  it('structural: rule is kebab-case, stable across recomputes, subjects is the violating competition id', () => {
    const comp = makeCompetition({ id: 'bad-fencer-count', fencer_count: 0 })
    const first = validateConfig(makeConfig(), [comp], ValidationMode.BINDING)
    const second = validateConfig(makeConfig(), [comp], ValidationMode.BINDING)
    const f1 = first.find(e => e.field === 'fencer_count')
    const f2 = second.find(e => e.field === 'fencer_count')
    expect(f1).toBeDefined()
    expect(f2).toBeDefined()
    expect(f1!.kind).toBe(RuleKind.STRUCTURAL)
    expect(f1!.rule).toMatch(KEBAB_CASE)
    expect(f1!.rule).toBe(f2!.rule)
    expect(f1!.subjects).toEqual(['bad-fencer-count'])
  })

  // specs/003-p2-derived-state/contracts/serialization-v2.md (removed; git show 0ab5bd2dc9:specs/003-p2-derived-state/contracts/serialization-v2.md)
  it('policy: same-population rule id is exactly "same-population" — already pinned by serialization-v2 and placements.test.ts dismissal fixtures', () => {
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
    const findings = validateConfig(config, comps, ValidationMode.BINDING)
    const finding = findings.find(e => e.field === 'same_population')
    expect(finding).toBeDefined()
    expect(finding!.kind).toBe(RuleKind.POLICY)
    expect(finding!.rule).toBe('same-population')
    expect(finding!.subjects).toEqual(['indiv-1', 'indiv-2', 'indiv-3', 'indiv-4'])
  })

  it('notice: days_available rule is kebab-case, stable, and subjects is [field] for this global rule', () => {
    const config = makeConfig({ days_available: 1 })
    const first = validateConfig(config, [makeCompetition()], ValidationMode.BINDING)
    const second = validateConfig(config, [makeCompetition()], ValidationMode.BINDING)
    const f1 = first.find(e => e.field === 'days_available')
    const f2 = second.find(e => e.field === 'days_available')
    expect(f1).toBeDefined()
    expect(f2).toBeDefined()
    expect(f1!.kind).toBe('notice')
    expect(f1!.rule).toMatch(KEBAB_CASE)
    expect(f1!.rule).toBe(f2!.rule)
    expect(f1!.subjects).toEqual(['days_available'])
  })
})

// ──────────────────────────────────────────────
// validateSameDayCompletion — exported but not wired into validateConfig's
// pipeline (no callers in src/, 024 D14); out of scope for the kind/mode split.
//
// 024 D7: Single-Day Fit measures the worst case (pool round + admin gap + full
// DE) against the day's hard window, start to hard end – 9:00 to 22:00, 780
// minutes, at default hours – or the widest day's when the organizer edits
// hours. Running past the 19:00 soft target is a warning elsewhere, not a
// Single-Day Fit failure (METHODOLOGY.md §Single-Day Fit, §Same-Day Completion).
// ──────────────────────────────────────────────

describe('validateSameDayCompletion — the hard window (024 D7)', () => {
  const ID = 'X-M-FOIL-IND'

  /**
   * A competition whose worst case is exactly `total` minutes. Seven fencers
   * make one pool of 7, which takes the table's own entry (§Pool Duration
   * Estimation), so the foil entry is set to `total` less the admin gap and
   * the DE's full-ask minutes.
   */
  function worstCaseOf(total: number, overrides: Partial<TournamentConfig> = {}) {
    const base = makeConfig(overrides)
    const competition = makeCompetition({
      id: ID, fencer_count: 7, weapon: Weapon.FOIL, cut_mode: CutMode.DISABLED, de_mode: DeMode.SINGLE_STAGE,
    })
    const de = deBlocksFor(competition, base).baselineMinutes
    const config: TournamentConfig = {
      ...base,
      pool_round_duration_table: { ...base.pool_round_duration_table, [Weapon.FOIL]: total - base.ADMIN_GAP_MINS - de },
    }
    return validateSameDayCompletion(competition, config)
  }

  // Day 2 opens at 9:00 and ends at 23:00, which is also its hard end:
  // an 840-minute window, the widest of the two.
  const WIDENED = {
    days_available: 2,
    dayConfigs: [
      { day_start_time: 540, day_end_time: 1140, day_hard_end_time: 1320 },
      { day_start_time: 1980, day_end_time: 2820, day_hard_end_time: 2820 },
    ],
  }

  it('passes a 700-minute worst case at default hours, past the 600-minute target day', () => {
    expect(worstCaseOf(700)).toBeNull()
  })

  it('fails a 790-minute worst case at default hours, naming the 780-minute hard window', () => {
    const result = worstCaseOf(790)
    expect(result).not.toBeNull()
    expect(result?.severity).toBe(BottleneckSeverity.ERROR)
    expect(result?.field).toBe('same_day_completion')
    expect(result?.rule).toBe('same-day-completion')
    expect(result?.subjects).toEqual([ID])
    expect(result?.message).toMatch(/\b790 min\b.*\b780 min\b/)
  })

  it('allows more when the organizer widens a day: 830 minutes fit the widest day\'s 840', () => {
    expect(worstCaseOf(830, WIDENED)).toBeNull()
  })

  it('still fails past the widest day\'s hard window', () => {
    expect(worstCaseOf(850, WIDENED)?.message).toMatch(/\b850 min\b.*\b840 min\b/)
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
    // WARN, not ERROR: 011 FR-001 moved the demotion into the finding itself,
    // so the sub-validator's own output carries it (see catalogue note above).
    expect(error!.severity).toBe(BottleneckSeverity.WARN)
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
    // Many staged DE events, very few video strips. Each 200-fencer foil
    // event's video stage (R16–SF, 14 bouts × 20 min) bills 4.67 video
    // strip-hours, so the need swamps the single video strip's 56 hours once
    // we cross 12 events.
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
      }),
    )
    const errors = validateFeasibility(config, comps)
    const videoError = errors.find(e => e.field === 'feasibility_video')
    expect(videoError).toBeDefined()
    expect(videoError!.message).toMatch(/RESOURCE_INSUFFICIENT \(video\)/)
  })
})

describe('validateConfig integrates feasibility', () => {
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
