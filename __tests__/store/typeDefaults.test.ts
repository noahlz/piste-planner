import { describe, it, expect } from 'vitest'
import { TournamentType, RefPolicy, DeMode } from '../../src/engine/types.ts'
import { TYPE_DEFAULTS } from '../../src/store/typeDefaults.ts'

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
