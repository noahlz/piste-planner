import { describe, it, expect } from 'vitest'
import { TournamentType, RefPolicy, DeMode, EventType, VideoPolicy } from '../../src/engine/types.ts'
import {
  TYPE_DEFAULTS, resolveVideoStrips, resolveDeMode, resolveVideoPolicy,
} from '../../src/store/typeDefaults.ts'

/**
 * METHODOLOGY.md §Tournament-Type Policies, transcribed as the expectation this
 * suite checks TYPE_DEFAULTS against. RefPolicy/DeMode/VideoPolicy values stand
 * in for "2 refs" / "1 ref", "Staged" / "Single-stage" and "Required" /
 * "Best effort" per the table's own key. The individual video policy is
 * REQUIRED at a NAC and BEST_EFFORT elsewhere (Ops Manual 2026-27 p.19; 024
 * plan D9).
 */
const EXPECTED_ROWS: Record<TournamentType, {
  ref_policy: RefPolicy
  video_strips_total: number
  de_mode: DeMode
  individual_video_policy: VideoPolicy
}> = {
  [TournamentType.NAC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 8, de_mode: DeMode.STAGED,
    individual_video_policy: VideoPolicy.REQUIRED,
  },
  [TournamentType.SJCC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.SYC]: {
    ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.ROC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RYC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
  [TournamentType.RJCC]: {
    ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE,
    individual_video_policy: VideoPolicy.BEST_EFFORT,
  },
}

describe('TYPE_DEFAULTS', () => {
  it('has exactly one row per TournamentType member', () => {
    // Catches an omitted type outright, rather than relying on the per-type
    // rows below (each of which would just see `undefined` for a missing key).
    expect(Object.keys(TYPE_DEFAULTS).sort()).toEqual(Object.values(TournamentType).sort())
  })

  it.each(Object.values(TournamentType))('resolves %s to its METHODOLOGY.md §Tournament-Type Policies row', (type) => {
    expect(TYPE_DEFAULTS[type]).toEqual(EXPECTED_ROWS[type])
  })

  it.each(Object.values(TournamentType))(
    'never gives %s a referee default of RefPolicy.AUTO (AUTO is the unset marker, not a resolved value)',
    (type) => {
      expect(TYPE_DEFAULTS[type].ref_policy).not.toBe(RefPolicy.AUTO)
    },
  )

  it.each(Object.values(TournamentType))(
    "gives %s a DE mode default that is one of the engine's two DeMode values",
    (type) => {
      expect([DeMode.SINGLE_STAGE, DeMode.STAGED]).toContain(TYPE_DEFAULTS[type].de_mode)
    },
  )
})

/**
 * 004 T068 finding 3. The `null` → type-default resolution had three
 * independent copies across the store bridge and two rail sections, one of
 * which resolved to `0` instead of the type's row and made the rail state two
 * different counts from one field. Constitution §Planning Artifacts gives the
 * rule one home; this suite is its contract.
 */
describe('resolveVideoStrips', () => {
  it.each(Object.values(TournamentType))(
    'resolves a null count at %s to that type\'s row',
    (type) => {
      expect(resolveVideoStrips(null, type)).toBe(TYPE_DEFAULTS[type].video_strips_total)
    },
  )

  it.each(Object.values(TournamentType))(
    'leaves an explicit 0 at %s alone rather than reading the type\'s row',
    (type) => {
      // `??` and not `||` (research D7): a tournament that deliberately runs no
      // video strips must survive a type whose row is 8. Only NAC's row is
      // non-zero, so NAC is the only type where this can fail loudly — the
      // other five are held here so a future non-zero row inherits the case.
      expect(resolveVideoStrips(0, type)).toBe(0)
    },
  )

  it('leaves an explicit non-zero count alone at a type whose row differs', () => {
    expect(resolveVideoStrips(3, TournamentType.NAC)).toBe(3)
    expect(resolveVideoStrips(3, TournamentType.ROC)).toBe(3)
  })

  it('is the resolution buildConfig performs, not a second rule: NAC null is 8 and ROC null is 0', () => {
    // Pins the two rows the UI reads back, so a change to TYPE_DEFAULTS that
    // silently flattens the per-type distinction fails here as well as above.
    expect(resolveVideoStrips(null, TournamentType.NAC)).toBe(8)
    expect(resolveVideoStrips(null, TournamentType.ROC)).toBe(0)
  })
})

/**
 * 024 D4, the owner's team ruling (METHODOLOGY.md §DE Modes, §Video Replay
 * Policy): a team event runs Single Stage and plans BEST_EFFORT video at every
 * tournament type, NACs included, even when the organizer's DE-mode setting
 * is Staged. Individual events keep the type row (or the override) for DE
 * mode, and the type row alone for video (024 D9).
 */
const DE_MODE_OVERRIDES: readonly (DeMode | null)[] = [null, DeMode.STAGED, DeMode.SINGLE_STAGE]
const RESOLVER_CASES = Object.values(TournamentType).flatMap((type) =>
  DE_MODE_OVERRIDES.map((override) => [type, override] as const),
)

describe('resolveDeMode', () => {
  it.each(RESOLVER_CASES)('runs a team event Single Stage at %s with override %s', (type, override) => {
    expect(resolveDeMode(type, EventType.TEAM, override)).toBe(DeMode.SINGLE_STAGE)
  })

  it.each(RESOLVER_CASES)(
    'gives an individual event the override, else the type row, at %s with override %s',
    (type, override) => {
      expect(resolveDeMode(type, EventType.INDIVIDUAL, override)).toBe(override ?? EXPECTED_ROWS[type].de_mode)
    },
  )
})

describe('resolveVideoPolicy', () => {
  // Guard (024 plan Task C, from A): a team event plans with no video at every type.
  it.each(Object.values(TournamentType))('plans every team event BEST_EFFORT at %s', (type) => {
    expect(resolveVideoPolicy(type, EventType.TEAM)).toBe(VideoPolicy.BEST_EFFORT)
  })

  it.each(Object.values(TournamentType))(
    'plans every individual event with the type row at %s',
    (type) => {
      expect(resolveVideoPolicy(type, EventType.INDIVIDUAL)).toBe(EXPECTED_ROWS[type].individual_video_policy)
    },
  )

  it('requires video for individual events at a NAC only', () => {
    const required = Object.values(TournamentType)
      .filter((type) => resolveVideoPolicy(type, EventType.INDIVIDUAL) === VideoPolicy.REQUIRED)
    expect(required).toEqual([TournamentType.NAC])
  })
})
