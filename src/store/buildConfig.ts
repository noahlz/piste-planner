import type {
  Competition,
  TournamentConfig,
  PinnedPlacement,
} from '../engine/types.ts'
import { CutMode, DeStripRequirement, EventType } from '../engine/types.ts'
import { findCompetition } from '../engine/catalogue.ts'
import {
  DAY_START_MINS,
  DAY_END_MINS,
  LATEST_START_MINS,
  LATEST_START_OFFSET,
  DAY_LENGTH_MINS,
  DE_REFS,
  SAME_TIME_WINDOW_MINS,
  INDIV_TEAM_MIN_GAP_MINS,
  EARLY_START_THRESHOLD,
  MAX_RESCHEDULE_ATTEMPTS,
  MAX_FENCERS,
  MIN_FENCERS,
  DEFAULT_DE_DURATION_TABLE,
  DEFAULT_VIDEO_POLICY_BY_CATEGORY,
  REGIONAL_CUT_OVERRIDES,
  REGIONAL_CUT_TOURNAMENT_TYPES,
  ADMIN_GAP_MINS,
  FLIGHT_BUFFER_MINS,
  THRESHOLD_MINS,
  SLOT_MINS,
  DE_BOUT_DURATION,
  YOUTH_VET_BOUT_DELTA,
  DEFAULT_DE_STRIP_FOOTPRINT,
} from '../engine/constants.ts'
import type { StoreState } from './store.ts'
import { defaultCutForEntry } from './competitionDefaults.ts'
import { TYPE_DEFAULTS, resolveVideoStrips } from './typeDefaults.ts'
import { buildStrips } from '../engine/stripBudget.ts'

/**
 * Calendar-day spacing between scheduler-axis day windows (research.md D5).
 * Day d's window is [d*DAY_AXIS_SPACING_MINS + start_d, d*DAY_AXIS_SPACING_MINS + end_d) —
 * see contracts/day-axis.md C1. `runActions.ts` imports this to reverse the
 * conversion when a schedule result becomes a Placement (C2).
 */
export const DAY_AXIS_SPACING_MINS = 1440

/**
 * Bridges the Zustand store shape to the engine's TournamentConfig + Competition[] interfaces.
 * Pure function — takes store state as parameter for testability.
 */
export function buildTournamentConfig(state: StoreState): {
  config: TournamentConfig
  competitions: Competition[]
} {
  // Resolved once into a local because two sites downstream need the resolved
  // number, the strip list and `config.video_strips_total`. The rule itself
  // lives in `resolveVideoStrips` (typeDefaults.ts), shared with the rail's two
  // panels so the app cannot state one count and schedule another.
  const videoStrips = resolveVideoStrips(state.video_strips_total, state.tournament_type)
  const strips = buildStrips(state.strips_total, videoStrips)

  const config: TournamentConfig = {
    tournament_type: state.tournament_type,
    days_available: state.days_available,
    strips,
    strips_total: state.strips_total,
    video_strips_total: videoStrips,
    // Store's dayConfigs are clock axis (0-1439 within each day). scheduleAll
    // requires the scheduler axis instead — day d's window shifted by
    // d*DAY_AXIS_SPACING_MINS so no two days' windows overlap on the absolute
    // minute axis strip_allocations uses (contracts/day-axis.md C1). The
    // store's own state.dayConfigs is left untouched — only this config copy
    // carries the shift.
    dayConfigs: state.dayConfigs.map((day, d) => ({
      day_start_time: d * DAY_AXIS_SPACING_MINS + day.day_start_time,
      day_end_time: d * DAY_AXIS_SPACING_MINS + day.day_end_time,
    })),

    // These seven used to come from the store's global-overrides slice, which 013 T022
    // deleted with the panel that wrote to it (research D7): two had rows, five
    // were carried but unreachable, and no control writes any of them now. They
    // are ordinary engine constants again — kept in their own block only
    // because a future setting that earns a row back would land here, and
    // `docs/design/backlog.md` records what each would need first.
    ADMIN_GAP_MINS,
    FLIGHT_BUFFER_MINS,
    THRESHOLD_MINS,
    SLOT_MINS,
    // Copied so no consumer spreading the config can reach the module constant.
    DE_BOUT_DURATION: { ...DE_BOUT_DURATION },
    YOUTH_VET_BOUT_DELTA,
    DEFAULT_DE_STRIP_FOOTPRINT,

    // Engine constants
    DAY_START_MINS,
    DAY_END_MINS,
    LATEST_START_MINS,
    LATEST_START_OFFSET,
    DAY_LENGTH_MINS,
    DE_REFS,
    SAME_TIME_WINDOW_MINS,
    INDIV_TEAM_MIN_GAP_MINS,
    EARLY_START_THRESHOLD,
    MAX_RESCHEDULE_ATTEMPTS,
    MAX_FENCERS,
    MIN_FENCERS,
    pool_round_duration_table: state.pool_round_duration_table,
    de_duration_table: DEFAULT_DE_DURATION_TABLE,

    // Strip budget defaults — per-event UI overrides to be added in a future task
    max_pool_strip_pct: 0.80,
    max_de_strip_pct: 0.80,
  }

  const competitions = buildCompetitions(state)

  return { config, competitions }
}

/**
 * The pins the engine schedules around (013 FR-054, FR-060, research D1).
 *
 * Three conditions, all of them the caller's job rather than the engine's: the
 * placement is pinned, its event is still selected, and its day is inside the
 * current range. A pin on a day the organizer has since removed is **left
 * out**, so the run re-places that event afresh and unpinned (FR-060) rather
 * than fixing it to a day that no longer exists.
 *
 * `start_time` crosses to the scheduler axis here — `day × DAY_AXIS_SPACING_MINS
 * + clock start`, the exact inverse of the conversion `runActions.ts` applies
 * when a result comes back. This is the only bridge (constitution I): the
 * engine never converts.
 */
export function buildPinnedPlacements(state: StoreState): PinnedPlacement[] {
  const pinned: PinnedPlacement[] = []
  for (const [id, placement] of Object.entries(state.placements)) {
    if (!placement.pinned) continue
    if (state.selectedCompetitions[id] === undefined) continue
    // Same existence test `buildCompetitions` applies below: a selected id
    // with no catalogue entry (a hand-edited or corrupted save can carry one
    // past `deserializeState`, which checks shape, not catalogue membership)
    // must not reach the pinned list, or `attempted = competitions.length -
    // pinned.length` in runActions.ts undercounts by one.
    if (!findCompetition(id)) continue
    if (placement.day < 0 || placement.day >= state.days_available) continue
    pinned.push({
      competition_id: id,
      day: placement.day,
      start_time: placement.day * DAY_AXIS_SPACING_MINS + placement.start_time,
      strip_count: placement.strip_count,
    })
  }
  // Sorted here as well as inside the engine's pre-claim pass, so the list the
  // store hands over reads the same way the engine walks it.
  pinned.sort(
    (a, b) =>
      a.day - b.day ||
      a.start_time - b.start_time ||
      a.competition_id.localeCompare(b.competition_id),
  )
  return pinned
}

function buildCompetitions(state: StoreState): Competition[] {
  const competitions: Competition[] = []

  // Every per-event field but the two the store still holds is derived here
  // (013 research D7, data-model §4). The referee policy and DE mode come from
  // the tournament type's defaults: the store no longer carries an `AUTO`
  // marker to resolve because it no longer carries the settings at all, and
  // the engine never learns about tournament types (constitution I).
  const typeDefaults = TYPE_DEFAULTS[state.tournament_type]

  for (const [id, overrides] of Object.entries(state.selectedCompetitions)) {
    const entry = findCompetition(id)
    if (!entry) continue

    // First of the three cut rules, in the order data-model §4 states them:
    // the catalogue default here, the regional override below, then the team
    // coercion. `defaultConfigForId` no longer applies this — the store record
    // has no cut pair to seed.
    const cut = defaultCutForEntry(entry)

    competitions.push({
      id: entry.id,
      gender: entry.gender,
      category: entry.category,
      weapon: entry.weapon,
      event_type: entry.event_type,
      vet_age_group: entry.vet_age_group,

      // From the store — the only two values no rule can compute.
      fencer_count: overrides.fencer_count,

      // Derived (data-model §4). The tournament type decides both policies for
      // every event alike; no per-event control remains to depart from them.
      ref_policy: typeDefaults.ref_policy,
      cut_mode: cut.mode,
      cut_value: cut.value,
      // The one derived field the organizer can still depart from, and it
      // departs for the whole tournament at once (013 T022, FR-029): the
      // Settings panel writes `de_mode_override`, `null` meaning follow the
      // type. Resolved here rather than in the store so the store keeps the
      // organizer's intent — "follow the type" — instead of a snapshot of what
      // the type meant when they chose it.
      de_mode: state.de_mode_override ?? typeDefaults.de_mode,
      de_video_policy: DEFAULT_VIDEO_POLICY_BY_CATEGORY[entry.category],
      use_single_pool_override: false,

      // Sensible defaults
      earliest_start: 0,
      // Genuinely unconstrained (research.md D6) — a finite sentinel like the
      // old 9999 binds once a day's scheduler-axis end (d*DAY_AXIS_SPACING_MINS
      // + day_end_time) passes it, which under 1440-minute spacing starts at
      // day 7. Infinity can never be the minimum in
      // Math.min(dayEnd(day, config), latest_end), for any day count.
      latest_end: Infinity,
      optional: false,
      de_round_of_16_strips: 4,
      de_round_of_16_requirement: DeStripRequirement.HARD,
      // The store's own flag. `flighted: true` with a null group is exactly the
      // shape `derive.ts` splits into Flight A and Flight B, so the flag needs
      // no further derivation (data-model §4). `flighting_group_id` stays null:
      // the accept/reject flow that used to fill it in was retired (FR-028).
      flighted: overrides.flighted,
      flighting_group_id: null,
      is_priority: false,
      // The fourth seam parity-exceptions.md names. A `0` here zeroes the DE
      // term of `estimateCompetitionStripHours`
      // (`strips_allocated × de_duration / 60`, src/engine/capacity.ts:146),
      // so every individual event contributed nothing to the upfront
      // feasibility estimate and the gate at src/engine/validation.ts:405
      // never fired on the app path. This is the ledger factory's own
      // pre-allocation (`__tests__/helpers/scenarios.ts:69`) — a default, not
      // a decision.
      strips_allocated: Math.max(2, Math.ceil(overrides.fencer_count / 7)),

      // Per-event strip budget overrides — always null until UI exposes them
      max_pool_strip_pct_override: null,
      max_de_strip_pct_override: null,
    })
  }

  // For regional tournament types (ROC, SYC, RJCC, SJCC), force DISABLED cuts on categories
  // that must advance all fencers to DEs per the USA Fencing Athlete Handbook.
  if (REGIONAL_CUT_TOURNAMENT_TYPES.has(state.tournament_type)) {
    for (const comp of competitions) {
      const override = REGIONAL_CUT_OVERRIDES[comp.category]
      if (override) {
        comp.cut_mode = override.mode
        comp.cut_value = override.value
      }
    }
  }

  // Team events never cut (R3, FR-010): coerce cut_mode to DISABLED before the
  // competition reaches the engine, mirroring the regional-cut loop above.
  // cut_value follows to 100, the TEAM default pair competitionDefaults.ts
  // already establishes — DISABLED makes the value inert either way, but the
  // pair is what the fixtures and the ledger compare against, so a stray
  // non-default number left behind would read as a real difference.
  // `validation.ts`'s `cut-on-team` is a notice, not a blocker (FR-011),
  // because this coercion already makes the engine's arithmetic ignore the
  // field (research.md D4).
  for (const comp of competitions) {
    if (comp.event_type === EventType.TEAM && comp.cut_mode !== CutMode.DISABLED) {
      comp.cut_mode = CutMode.DISABLED
      comp.cut_value = 100
    }
  }

  return competitions
}
