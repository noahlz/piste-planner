/**
 * One edit per engine input, for every test that asks "does this edit reach
 * the engine's key" (017 T4's stale sweep, 020's re-run rule). Data only: the
 * proxy check that keeps FIELD_EDITS complete stays an `it` in
 * `drawnSchedule.test.ts`, since an `it` exported from here would register once
 * per importing file.
 */
import { useStore, type StoreState } from '../../src/store/store.ts'
import { DeMode, Weapon } from '../../src/engine/types.ts'
import { FLIGHTED_FIXTURES } from './flightedFixtures.ts'

const store = (): StoreState => useStore.getState()

/** The first placed event, by code point, so every edit touches the same one. */
function firstPlacedId(): string {
  return Object.keys(store().placements).sort()[0]
}

/** One store action per user-facing input edit (017 spec §5's stale row). */
export const ACTION_EDITS: Record<string, () => void> = {
  'fencer count': () => {
    const id = firstPlacedId()
    store().updateCompetition(id, { fencer_count: store().selectedCompetitions[id].fencer_count + 10 })
  },
  'flighted': () => {
    const { id, partial } = FLIGHTED_FIXTURES.MANY_POOLS
    store().updateCompetition(id, partial)
  },
  'deselect': () => store().removeCompetition(firstPlacedId()),
  'a setting': () => store().setDeModeOverride(DeMode.SINGLE_STAGE),
  'day count': () => store().setDays(store().days_available + 1),
  'video count': () => store().setVideoStrips((store().video_strips_total ?? 0) - 2),
}

/**
 * One raw write per `StoreState` field `buildTournamentConfig` reads, so a
 * field missing from a selector's memo deps leaves the selector's answer
 * unchanged and fails. The completeness check in `drawnSchedule.test.ts` keeps
 * this list honest.
 */
export const FIELD_EDITS: Record<string, (s: StoreState) => Partial<StoreState>> = {
  tournament_type: (s) => ({ tournament_type: s.tournament_type === 'ROC' ? 'NAC' : 'ROC' }),
  days_available: (s) => ({ days_available: s.days_available + 1 }),
  dayConfigs: (s) => ({
    dayConfigs: s.dayConfigs.map((d, i) => (i === 0 ? { ...d, day_end_time: d.day_end_time - 30 } : d)),
  }),
  strips_total: (s) => ({ strips_total: s.strips_total + 1 }),
  video_strips_total: (s) => ({ video_strips_total: (s.video_strips_total ?? 0) - 2 }),
  pool_round_duration_table: (s) => ({
    pool_round_duration_table: {
      ...s.pool_round_duration_table,
      [Weapon.EPEE]: s.pool_round_duration_table[Weapon.EPEE] + 15,
    },
  }),
  de_mode_override: () => ({ de_mode_override: DeMode.SINGLE_STAGE }),
  selectedCompetitions: (s) => {
    const id = Object.keys(s.selectedCompetitions)[0]
    const existing = s.selectedCompetitions[id]
    return { selectedCompetitions: { ...s.selectedCompetitions, [id]: { ...existing, fencer_count: existing.fencer_count + 10 } } }
  },
}
