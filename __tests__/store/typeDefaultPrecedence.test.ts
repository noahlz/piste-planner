import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { TournamentType, RefPolicy, DeMode, CutMode } from '../../src/engine/types.ts'

/**
 * Two precedence rules that run in opposite directions (data-model.md
 * §Resolution rules, FR-037/FR-040, SC-012):
 *
 * 1. An explicit ref_policy / de_mode / video_strips_total beats its
 *    tournament type's default — the organizer's setting survives any
 *    number of type changes, even one whose default happens to equal it.
 * 2. The regional cut override beats an explicit cut_mode / cut_value —
 *    the opposite direction, because it is a USA Fencing handbook rule
 *    rather than a convenience.
 *
 * The per-type default table (data-model.md §Per-type default table):
 *
 * | Type  | Refs/pool    | Video strips | DE mode      |
 * |-------|--------------|--------------|--------------|
 * | NAC   | 2 (TWO)      | 8            | STAGED       |
 * | SJCC  | 2 (TWO)      | 0            | SINGLE_STAGE |
 * | SYC   | 2 (TWO)      | 0            | SINGLE_STAGE |
 * | ROC   | 1 (ONE)      | 0            | SINGLE_STAGE |
 * | RYC   | 1 (ONE)      | 0            | SINGLE_STAGE |
 * | RJCC  | 1 (ONE)      | 0            | SINGLE_STAGE |
 *
 * None of this exists yet: the table lives in `src/store/typeDefaults.ts`
 * (T059, not created), resolution joins `buildConfig.ts` (T059/T060, not
 * wired), and `de_mode`/`video_strips_total` are not yet widened to accept
 * `AUTO`/`null` (T060). This file is red against today's code — see the
 * per-test comments for which half of each pair fails to compile and which
 * fails at runtime once it does.
 */

// A DIV1A individual event — DIV1A carries no REGIONAL_CUT_OVERRIDES entry
// (src/engine/constants.ts), so the type walk below never crosses the
// regional-cut seam and stays isolated to the ref/de-mode/video precedence
// rule it is testing.
const UNOVERRIDDEN_ID = 'D1A-M-EPEE-IND'

// A JUNIOR individual event — JUNIOR is one of the four REGIONAL_CUT_OVERRIDES
// categories (Y14, CADET, JUNIOR, DIV1), which is what rule 2 exercises.
const OVERRIDDEN_CATEGORY_ID = 'JR-M-EPEE-IND'

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

describe('an explicit value survives any number of type changes (FR-037, SC-012)', () => {
  it('ref_policy TWO survives a walk that includes a type whose default is also TWO', () => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
    useStore.getState().updateCompetition(UNOVERRIDDEN_ID, { ref_policy: 'TWO' })

    // ROC's default is ONE (differs) -> SJCC's default is TWO (equals, mid-walk)
    // -> RYC's default is ONE (differs). A resolver that writes the resolved
    // default back to the store would slip through a walk that never landed
    // on the equals row in the middle — this one does.
    const walk = [TournamentType.ROC, TournamentType.SJCC, TournamentType.RYC]
    for (const type of walk) {
      useStore.getState().setTournamentType(type)

      const { competitions } = buildTournamentConfig(useStore.getState())
      const comp = competitions.find((c) => c.id === UNOVERRIDDEN_ID)
      expect(comp?.ref_policy, `resolved ref_policy at ${type}`).toBe('TWO')
      expect(
        useStore.getState().selectedCompetitions[UNOVERRIDDEN_ID].ref_policy,
        `stored ref_policy at ${type} (must stay unresolved)`,
      ).toBe('TWO')
    }
  })

  it('de_mode STAGED survives a walk that includes a type whose default is also STAGED', () => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
    useStore.getState().updateCompetition(UNOVERRIDDEN_ID, { de_mode: 'STAGED' })

    // ROC's default is SINGLE_STAGE (differs) -> NAC's default is STAGED
    // (equals, mid-walk) -> RJCC's default is SINGLE_STAGE (differs).
    const walk = [TournamentType.ROC, TournamentType.NAC, TournamentType.RJCC]
    for (const type of walk) {
      useStore.getState().setTournamentType(type)

      const { competitions } = buildTournamentConfig(useStore.getState())
      const comp = competitions.find((c) => c.id === UNOVERRIDDEN_ID)
      expect(comp?.de_mode, `resolved de_mode at ${type}`).toBe('STAGED')
      expect(
        useStore.getState().selectedCompetitions[UNOVERRIDDEN_ID].de_mode,
        `stored de_mode at ${type} (must stay unresolved)`,
      ).toBe('STAGED')
    }
  })

  it('video_strips_total 0 survives a walk that includes a type whose default is also 0', () => {
    // 0 is a deliberate, legitimate value (no video strips) and must not be
    // confused with unset, which is `null` (data-model.md; T060).
    useStore.getState().setVideoStrips(0)

    // NAC's default is 8 (differs) -> ROC's default is 0 (equals, mid-walk)
    // -> NAC's default is 8 again (differs).
    const walk = [TournamentType.NAC, TournamentType.ROC, TournamentType.NAC]
    for (const type of walk) {
      useStore.getState().setTournamentType(type)

      const { config } = buildTournamentConfig(useStore.getState())
      expect(config.video_strips_total, `resolved video_strips_total at ${type}`).toBe(0)
      expect(
        useStore.getState().video_strips_total,
        `stored video_strips_total at ${type} (must stay unresolved)`,
      ).toBe(0)
    }
  })
})

/**
 * Control cases for the same rule, from the other side: a setting left at
 * its "follow the type" sentinel (`AUTO` / `null`) DOES track the type's
 * default as it changes. Without this half, "an explicit value survives"
 * would hold vacuously today, where nothing resolves per-type defaults at
 * all — these are what make FR-037 a real precedence rule instead of a
 * no-op.
 *
 * `de_mode: 'AUTO'` and `setVideoStrips(null)` do not typecheck until T060
 * widens `CompetitionConfig.de_mode` to `DeModeSetting` and
 * `video_strips_total` to `number | null`. `ref_policy: 'AUTO'` already
 * typechecks (RefPolicy already includes AUTO) but is red at runtime today:
 * buildConfig passes `overrides.ref_policy` straight through with no
 * per-type resolution.
 */
describe('an AUTO / null setting resolves to the tournament type\'s default', () => {
  const PER_TYPE_DEFAULTS: Array<{
    type: TournamentType
    refPolicy: RefPolicy
    deMode: DeMode
    videoStrips: number
  }> = [
    { type: TournamentType.NAC, refPolicy: 'TWO', deMode: 'STAGED', videoStrips: 8 },
    { type: TournamentType.SJCC, refPolicy: 'TWO', deMode: 'SINGLE_STAGE', videoStrips: 0 },
    { type: TournamentType.SYC, refPolicy: 'TWO', deMode: 'SINGLE_STAGE', videoStrips: 0 },
    { type: TournamentType.ROC, refPolicy: 'ONE', deMode: 'SINGLE_STAGE', videoStrips: 0 },
    { type: TournamentType.RYC, refPolicy: 'ONE', deMode: 'SINGLE_STAGE', videoStrips: 0 },
    { type: TournamentType.RJCC, refPolicy: 'ONE', deMode: 'SINGLE_STAGE', videoStrips: 0 },
  ]

  it.each(PER_TYPE_DEFAULTS)('$type: AUTO ref_policy resolves to $refPolicy', ({ type, refPolicy }) => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
    useStore.getState().updateCompetition(UNOVERRIDDEN_ID, { ref_policy: 'AUTO' })
    useStore.getState().setTournamentType(type)

    const { competitions } = buildTournamentConfig(useStore.getState())
    const comp = competitions.find((c) => c.id === UNOVERRIDDEN_ID)
    expect(comp?.ref_policy).toBe(refPolicy)
  })

  it.each(PER_TYPE_DEFAULTS)('$type: AUTO de_mode resolves to $deMode', ({ type, deMode }) => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
    // Target shape (T060 widens de_mode to DeModeSetting = 'AUTO' | DeMode) —
    // does not typecheck yet, by design (see file header).
    useStore.getState().updateCompetition(UNOVERRIDDEN_ID, { de_mode: 'AUTO' })
    useStore.getState().setTournamentType(type)

    const { competitions } = buildTournamentConfig(useStore.getState())
    const comp = competitions.find((c) => c.id === UNOVERRIDDEN_ID)
    expect(comp?.de_mode).toBe(deMode)
  })

  it.each(PER_TYPE_DEFAULTS)('$type: null video_strips_total resolves to $videoStrips', ({ type, videoStrips }) => {
    // Target shape (T060 widens video_strips_total to number | null) — does
    // not typecheck yet, by design (see file header).
    useStore.getState().setVideoStrips(null)
    useStore.getState().setTournamentType(type)

    const { config } = buildTournamentConfig(useStore.getState())
    expect(config.video_strips_total).toBe(videoStrips)
  })
})

describe('the regional cut override still beats an explicit cut setting (FR-040)', () => {
  it('overridden category at a regional type: the override replaces the explicit cut', () => {
    useStore.getState().addCompetition(OVERRIDDEN_CATEGORY_ID)
    useStore.getState().updateCompetition(OVERRIDDEN_CATEGORY_ID, {
      cut_mode: CutMode.COUNT,
      cut_value: 8,
    })
    useStore.getState().setTournamentType(TournamentType.ROC)

    const { competitions } = buildTournamentConfig(useStore.getState())
    const comp = competitions.find((c) => c.id === OVERRIDDEN_CATEGORY_ID)
    // REGIONAL_CUT_OVERRIDES[JUNIOR] (src/engine/constants.ts) is
    // { mode: DISABLED, value: 100 } — not the organizer's COUNT/8.
    expect(comp?.cut_mode, 'cut_mode overridden at a regional type').toBe(CutMode.DISABLED)
    expect(comp?.cut_value, 'cut_value overridden at a regional type').toBe(100)
  })

  it('the same overridden category at a non-regional type: the explicit cut survives', () => {
    // Mirror case: same category as above, but NAC is not in
    // REGIONAL_CUT_TOURNAMENT_TYPES, so the override must not apply here.
    // This is what distinguishes "the override applies" from "cut_mode is
    // always clobbered".
    useStore.getState().addCompetition(OVERRIDDEN_CATEGORY_ID)
    useStore.getState().updateCompetition(OVERRIDDEN_CATEGORY_ID, {
      cut_mode: CutMode.COUNT,
      cut_value: 8,
    })
    useStore.getState().setTournamentType(TournamentType.NAC)

    const { competitions } = buildTournamentConfig(useStore.getState())
    const comp = competitions.find((c) => c.id === OVERRIDDEN_CATEGORY_ID)
    expect(comp?.cut_mode, 'cut_mode at a non-regional type').toBe(CutMode.COUNT)
    expect(comp?.cut_value, 'cut_value at a non-regional type').toBe(8)
  })
})
