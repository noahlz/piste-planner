import { describe, it, expect } from 'vitest'
import { TournamentType, RefPolicy, DeMode } from '../../src/engine/types.ts'
import { TYPE_DEFAULTS, resolveVideoStrips } from '../../src/store/typeDefaults.ts'

/**
 * data-model.md §Per-type default table, transcribed as the expectation this
 * suite checks TYPE_DEFAULTS against. RefPolicy/DeMode values stand in for
 * "2 refs" / "1 ref" and "Staged" / "Single-stage" per the table's own key
 * (data-model.md §Per-type default table).
 */
const EXPECTED_ROWS: Record<TournamentType, { ref_policy: RefPolicy; video_strips_total: number; de_mode: DeMode }> = {
  [TournamentType.NAC]: { ref_policy: RefPolicy.TWO, video_strips_total: 8, de_mode: DeMode.STAGED },
  [TournamentType.SJCC]: { ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.SYC]: { ref_policy: RefPolicy.TWO, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.ROC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RYC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
  [TournamentType.RJCC]: { ref_policy: RefPolicy.ONE, video_strips_total: 0, de_mode: DeMode.SINGLE_STAGE },
}

describe('TYPE_DEFAULTS', () => {
  it('has exactly one row per TournamentType member', () => {
    // Catches an omitted type outright, rather than relying on the per-type
    // rows below (each of which would just see `undefined` for a missing key).
    expect(Object.keys(TYPE_DEFAULTS).sort()).toEqual(Object.values(TournamentType).sort())
  })

  it.each(Object.values(TournamentType))('resolves %s to its data-model.md row', (type) => {
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
 * independent copies — `buildConfig.ts:60`, `AdvancedPanel.tsx:49`, and
 * `StripSetup.tsx:53`, the last of which resolved to `0` instead of the type's
 * row and made the rail state two different counts from one field. Constitution
 * §Planning Artifacts gives the rule one home; this suite is its contract.
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
