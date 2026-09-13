import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from '../../src/store/store.ts'
import { buildTournamentConfig } from '../../src/store/buildConfig.ts'
import { TournamentType, RefPolicy, DeMode } from '../../src/engine/types.ts'

/**
 * One precedence rule survives 013's per-event shrink (data-model.md
 * §Resolution rules, FR-037, SC-012): an explicit video_strips_total beats
 * its tournament type's default — the organizer's setting survives any
 * number of type changes, even one whose default happens to equal it.
 * video_strips_total lives on TournamentSlice, not per-competition, so the
 * shrink doesn't touch it. ref_policy and de_mode no longer have an
 * "explicit" side to prove precedence over (FR-021: no per-event control for
 * either survives) — they resolve to TYPE_DEFAULTS[type] unconditionally,
 * covered below as plain resolution, not precedence. The regional-cut-vs-
 * explicit-cut rule this file used to cover here is gone the same way (see
 * the dropped-without-successor comment further down).
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

beforeEach(() => {
  useStore.setState(useStore.getInitialState(), true)
})

// 013 T019 (research D7): "ref_policy TWO survives a walk..." and "de_mode
// STAGED survives a walk..." dropped without successor. Both proved an
// explicit per-event value beats the type default across a type change —
// T020's shrink removes ref_policy and de_mode from CompetitionConfig
// entirely (FR-021: no per-event control for either survives), so there is
// no explicit value left to set and nothing for this precedence rule to be
// about. video_strips_total is unaffected — it lives on TournamentSlice, not
// per-competition, and the shrink doesn't touch it.
describe('an explicit value survives any number of type changes (FR-037, SC-012)', () => {
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
 * Since 013 T020 the per-event half of that sentinel is gone: neither
 * `ref_policy` nor `de_mode` is a store field any more, so every event follows
 * its tournament type unconditionally and `setVideoStrips(null)` is the only
 * settable "follow the type" marker left.
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

  // 013 T019 (research D7): re-targeted — ref_policy has no store override
  // left to set to 'AUTO' post-shrink (FR-021); every competition resolves
  // to TYPE_DEFAULTS[type].ref_policy unconditionally now, so this is the
  // whole rule, not one half of a two-value comparison.
  it.each(PER_TYPE_DEFAULTS)('$type: ref_policy resolves to $refPolicy', ({ type, refPolicy }) => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
    useStore.getState().setTournamentType(type)

    const { competitions } = buildTournamentConfig(useStore.getState())
    const comp = competitions.find((c) => c.id === UNOVERRIDDEN_ID)
    expect(comp?.ref_policy).toBe(refPolicy)
  })

  // Same re-targeting, same reasoning, one field over.
  it.each(PER_TYPE_DEFAULTS)('$type: de_mode resolves to $deMode', ({ type, deMode }) => {
    useStore.getState().addCompetition(UNOVERRIDDEN_ID)
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

// 013 T019 (research D7): both cases here dropped without successor. Each
// proved an explicit per-event cut_mode/cut_value either beaten by the
// regional override or surviving at a non-regional type — T020's shrink
// removes cut_mode/cut_value from CompetitionConfig entirely (FR-021: no
// per-event cut control survives), so "explicit" cases have nothing left to
// set. The regional override applying to the *default* cut (not an explicit
// one) is exercised directly by buildConfig.test.ts's own "regional cut
// overrides" describe, which T020 re-targets onto the two-field store shape
// alongside this file.
