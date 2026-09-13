import { deriveEventSchedule } from '../engine/derive.ts'
import type { DerivedEventSchedule } from '../engine/derive.ts'
import { validateConfig } from '../engine/validation.ts'
import { initialAnalysis } from '../engine/analysis.ts'
import { computeRefRequirements } from '../engine/refs.ts'
import { ValidationMode } from '../engine/types.ts'
import type {
  AnalysisResult,
  Competition,
  FlightingGroup,
  Placement,
  RefDemandByDay,
  RefDemandInterval,
  RefRequirementsByDay,
  TournamentConfig,
  ValidationError,
} from '../engine/types.ts'
// The footer and the canvas must agree on which blocks exist, so both read
// `assignStripLanes` rather than each flattening the derived schedule its own
// way (constitution, "each fact has exactly one home"). `layout/lanes.ts` is
// pure arithmetic with no React and no store read, so the import carries
// nothing back the other way.
import { assignStripLanes } from '../layout/lanes.ts'
import type { BlockPlacement } from '../layout/lanes.ts'
import { findingIdentity } from '../engine/validation.ts'
import { buildTournamentConfig } from './buildConfig.ts'
import type { StoreState } from './store.ts'

/**
 * Derived read selectors — research D2, data-model.md §Store slice changes.
 *
 * Each selector is a pure function of store inputs: placements are the
 * source of truth (never `scheduleAll`), so a hand-edited placement shows up
 * immediately. Nothing here is written back to state.
 */

// Stable default so callers that omit flightingSuggestions get the same
// reference on every call — a fresh `[]` literal per call would defeat the
// memoization below even when nothing actually changed.
const EMPTY_FLIGHTING: FlightingGroup[] = []

export interface DerivedSchedule {
  config: TournamentConfig
  competitions: Competition[]
  /** Keyed by competition id. Only competitions with a placement appear. */
  events: Record<string, DerivedEventSchedule>
}

export interface DerivedFindings {
  validationErrors: ValidationError[]
  analysis: AnalysisResult
}

/**
 * Caches the single most recent call, keyed on `Object.is` equality of a
 * dependency array — not on the `state` argument's own identity. Zustand
 * hands out a new top-level state object on every `set()` call, even when
 * the fields a selector cares about are untouched, so keying on `state`
 * itself would recompute on every unrelated store change.
 */
function memoizeOnDeps<TArgs extends unknown[], TResult>(
  depsFn: (...args: TArgs) => unknown[],
  compute: (...args: TArgs) => TResult,
): (...args: TArgs) => TResult {
  let lastDeps: unknown[] | null = null
  let lastResult: TResult

  return (...args: TArgs): TResult => {
    const deps = depsFn(...args)
    if (
      lastDeps !== null &&
      lastDeps.length === deps.length &&
      lastDeps.every((d, i) => Object.is(d, deps[i]))
    ) {
      return lastResult
    }
    lastDeps = deps
    lastResult = compute(...args)
    return lastResult
  }
}

function scheduleDeps(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): unknown[] {
  return [
    state.placements,
    state.selectedCompetitions,
    state.tournament_type,
    state.days_available,
    state.dayConfigs,
    state.strips_total,
    state.video_strips_total,
    state.pool_round_duration_table,
    // Replaced the store's global-overrides record in 013 T022: the slice is gone and its
    // seven values are constants again, so nothing about them can change
    // between two renders. This is the one setting left that can.
    state.de_mode_override,
    // Read inside buildCompetitions when applying accepted suggestions, so an
    // accept/reject click must invalidate even though nothing here touches it.
    state.flightingSuggestionStates,
    flightingSuggestions,
  ]
}

function computeDerivedSchedule(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): DerivedSchedule {
  const { config, competitions } = buildTournamentConfig(state, flightingSuggestions)

  const events: Record<string, DerivedEventSchedule> = {}
  for (const competition of competitions) {
    const placement = state.placements[competition.id]
    if (!placement) continue
    events[competition.id] = deriveEventSchedule(placement, competition, config)
  }

  return { config, competitions, events }
}

/** Derived schedule view model: per-event `ScheduleResult` + `day_out_of_range`, from placements. */
export const selectDerivedSchedule = memoizeOnDeps(scheduleDeps, computeDerivedSchedule)

function computeDerivedFindings(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): DerivedFindings {
  const { config, competitions } = buildTournamentConfig(state, flightingSuggestions)

  // initialAnalysis needs a day per competition. A placed event uses its
  // placement's day; an unplaced one falls back to a round-robin spread
  // (i % days_available) so analysis still has something to reason about
  // before the user (or auto-schedule) has placed everything.
  const dayAssignments: Record<string, number> = {}
  competitions.forEach((competition, i) => {
    const placement = state.placements[competition.id]
    dayAssignments[competition.id] = placement ? placement.day : i % state.days_available
  })

  // Binding mode in P2 — tasks.md T017: advisory-mode UI wiring is later work.
  const validationErrors = validateConfig(config, competitions, ValidationMode.BINDING)
  const analysis = initialAnalysis(config, competitions, dayAssignments)

  return { validationErrors, analysis }
}

/** Derived findings: validation errors plus pre-scheduling analysis, from current inputs. */
export const selectDerivedFindings = memoizeOnDeps(scheduleDeps, computeDerivedFindings)

/**
 * Builds ref-demand intervals directly from the derived per-event
 * `ScheduleResult`s (pool/flight/DE start-end-refs, already computed by
 * `deriveEventSchedule`) rather than re-deriving them. This is the
 * placement-driven counterpart to `concurrentScheduler.ts`'s
 * `computePostScheduleRefDemand`: that function additionally resolves
 * cross-event strip contention via `peakConcurrentStrips`, which only exists
 * inside a live scheduler run's `GlobalState` — no such state exists here, so
 * demand is summed per placed event instead of peak-measured across events.
 * Out-of-range placements are skipped: their `assigned_day` cannot address a
 * day bucket in `config.days_available`.
 */
function buildRefDemandByDay(schedule: DerivedSchedule): Record<number, RefDemandByDay> {
  const byDay: Record<number, RefDemandByDay> = {}
  const compById = new Map(schedule.competitions.map((c) => [c.id, c]))

  function push(day: number, interval: RefDemandInterval): void {
    if (!byDay[day]) byDay[day] = { intervals: [] }
    byDay[day].intervals.push(interval)
  }

  for (const [id, { result, day_out_of_range }] of Object.entries(schedule.events)) {
    if (day_out_of_range) continue
    const competition = compById.get(id)
    if (!competition) continue

    const day = result.assigned_day
    const weapon = competition.weapon
    const deRefCount = (strips: number) => strips * schedule.config.DE_REFS

    if (result.flight_a_start !== null && result.flight_a_end !== null) {
      push(day, { startTime: result.flight_a_start, endTime: result.flight_a_end, count: result.flight_a_refs, weapon })
      if (result.flight_b_start !== null && result.flight_b_end !== null) {
        push(day, { startTime: result.flight_b_start, endTime: result.flight_b_end, count: result.flight_b_refs, weapon })
      }
    } else if (result.pool_start !== null && result.pool_end !== null) {
      push(day, { startTime: result.pool_start, endTime: result.pool_end, count: result.pool_refs_count, weapon })
    }

    if (result.de_start !== null && result.de_end !== null) {
      push(day, { startTime: result.de_start, endTime: result.de_end, count: deRefCount(result.de_strip_count), weapon })
    }
    if (result.de_prelims_start !== null && result.de_prelims_end !== null) {
      push(day, {
        startTime: result.de_prelims_start,
        endTime: result.de_prelims_end,
        count: deRefCount(result.de_prelims_strip_count),
        weapon,
      })
    }
    if (result.de_round_of_16_start !== null && result.de_round_of_16_end !== null) {
      push(day, {
        startTime: result.de_round_of_16_start,
        endTime: result.de_round_of_16_end,
        count: deRefCount(result.de_round_of_16_strip_count),
        weapon,
      })
    }
  }

  return byDay
}

function computeDerivedRefRequirements(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): RefRequirementsByDay[] {
  const schedule = selectDerivedSchedule(state, flightingSuggestions)
  const demandByDay = buildRefDemandByDay(schedule)
  return computeRefRequirements(demandByDay, schedule.config.days_available)
}

/** Derived ref requirements: peak concurrent refs per day, from the derived schedule (not a fresh scheduleAll run). */
export const selectDerivedRefRequirements = memoizeOnDeps(scheduleDeps, computeDerivedRefRequirements)

// ──────────────────────────────────────────────
// Footer metrics (US1, T011 — decision 5, research D7/D18)
// ──────────────────────────────────────────────

/**
 * One row of the status footer. Reads only: every `value` below is either
 * lifted straight off engine output (`ScheduleResult.de_total_end`,
 * `RefRequirementsByDay.peak_total_refs`) or a sum over it. No scheduling
 * arithmetic lives here — that belongs in `src/engine/` (constitution I).
 *
 * The retired scorecard this replaces (T048) carried eleven rows, a
 * collapsed/expanded tier, a frozen baseline and per-metric block keys for
 * hover highlighting. D7 drops the disclosure, the baseline and the hover
 * along with it — the footer is three rows, always visible, with nothing to
 * compare against.
 */
export interface FooterMetric {
  /** Stable id. Also the value of the rendered row's `data-metric`. */
  id: string
  label: string
  kind: 'time' | 'count' | 'percent'
  /** null means the metric has no value at all (nothing placed, no days). */
  value: number | null
}

/** The row with the highest `read(row)`. Ties go to the earliest day, since rows arrive day-ordered. */
function peakRow(
  rows: RefRequirementsByDay[],
  read: (row: RefRequirementsByDay) => number,
): RefRequirementsByDay | null {
  let best: RefRequirementsByDay | null = null
  for (const row of rows) {
    if (best === null || read(row) > read(best)) best = row
  }
  return best
}

function computeFooterMetrics(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): FooterMetric[] {
  const schedule = selectDerivedSchedule(state, flightingSuggestions)
  const refRows = selectDerivedRefRequirements(state, flightingSuggestions)

  // ── Finish: the latest de_total_end, tournament-wide ──

  let finish: number | null = null
  for (const derived of Object.values(schedule.events)) {
    if (derived.day_out_of_range) continue
    const end = derived.result.de_total_end
    if (end === null) continue
    if (finish === null || end > finish) finish = end
  }

  // ── Referees: the peak across days ──

  const totalPeak = peakRow(refRows, (row) => row.peak_total_refs)

  // ── Strips: used strip-minutes over available, across all in-range blocks ──
  //
  // `assignStripLanes` is the canvas's own answer to "which blocks exist"
  // (`src/layout/lanes.ts`): it already skips `day_out_of_range` events and
  // reads segments off `eventTimeSegments`, so this does not restate either
  // rule in a private flattening.
  const blocks = assignStripLanes(schedule.events, state.strips_total)

  let totalAvailable = 0
  for (let day = 0; day < state.days_available; day++) {
    // `state.dayConfigs`, never `schedule.config.dayConfigs`: the store's is the
    // authoring home and is always clock time, while the config copy carries the
    // scheduler's own day axis (research D4/D5). A missing or non-positive
    // window contributes nothing rather than a negative denominator.
    const dayConfig = state.dayConfigs[day]
    const window = dayConfig ? dayConfig.day_end_time - dayConfig.day_start_time : 0
    if (window > 0) totalAvailable += state.strips_total * window
  }

  let totalUsed = 0
  for (const block of blocks) {
    totalUsed += (block.endMinutes - block.startMinutes) * block.stripCount
  }

  return [
    {
      id: 'finish:tournament',
      label: 'Tournament finish',
      kind: 'time',
      value: finish,
    },
    {
      id: 'refs:peak-total',
      label: 'Peak referees',
      kind: 'count',
      value: totalPeak === null ? null : totalPeak.peak_total_refs,
    },
    {
      id: 'strips:utilization',
      label: 'Strip utilization',
      kind: 'percent',
      value: totalAvailable > 0 ? (totalUsed / totalAvailable) * 100 : null,
    },
  ]
}

/** Footer rows: the three metrics `StatusFooter` shows. */
export const selectFooterMetrics = memoizeOnDeps(scheduleDeps, computeFooterMetrics)

// ──────────────────────────────────────────────
// Placement counts (data-model.md §10)
// ──────────────────────────────────────────────

export interface PlacementCounts {
  placed: number
  unplaced: number
  pinned: number
}

function computePlacementCounts(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): PlacementCounts {
  // An event the packer could not fit is unplaced from the canvas's point of
  // view even though its own placement is in range (data-model.md §10: "an
  // event the packer could not fit is unplaced whatever the store says") — so
  // it counts once, in `unplaced`, and is excluded from `placed`, never both.
  // A single event can emit up to three segments (`eventTimeSegments`), so
  // this is keyed by competition id, not block count, or one event with two
  // overflowing segments would count twice.
  const schedule = selectDerivedSchedule(state, flightingSuggestions)
  const overflowing = new Set(
    assignStripLanes(schedule.events, state.strips_total)
      .filter((block) => block.overflow)
      .map((block) => block.competitionId),
  )

  let placed = 0
  let unplaced = 0
  let pinned = 0

  for (const id of Object.keys(state.selectedCompetitions)) {
    const placement = state.placements[id]
    const inRange =
      placement !== undefined && placement.day >= 0 && placement.day < state.days_available
    if (inRange && !overflowing.has(id)) placed++
    else if (!inRange) unplaced++
    if (placement?.pinned) pinned++
  }

  unplaced += overflowing.size

  return { placed, unplaced, pinned }
}

/** Placed / unplaced / pinned counts over the selected events (data-model.md §10). */
export const selectPlacementCounts = memoizeOnDeps(scheduleDeps, computePlacementCounts)

// ──────────────────────────────────────────────
// Day summaries (data-model.md §9, 013 T026)
// ──────────────────────────────────────────────

/**
 * What one day band on the canvas says about its day (FR-039).
 *
 * Every field is read off the same `assignStripLanes` output the canvas draws
 * and the footer measures (constitution, "each fact has exactly one home"), so
 * a band cannot claim a peak the grid does not show — provided the caller
 * hands `daySummariesFromBlocks` its own committed blocks, which is what
 * `Canvas` does. `selectDaySummaries` below is the *live* convenience
 * wrapper: it packs the live schedule itself, so a caller that mixes it with
 * a committed set of blocks (as `Canvas` used to) is the one place this
 * guarantee can still be broken.
 */
export interface DaySummary {
  day: number
  /** Distinct competitions with at least one block on this day. */
  events: number
  /** The latest block end on this day, or null when nothing is on it. */
  finish: number | null
  /** Peak concurrent strip demand, sampled at every block start. */
  peakStrips: number
  /** Blocks the lane packer could not fit. */
  unplaced: number
  /** Undismissed validation findings whose first subject is placed on this day. */
  findings: number
}

/**
 * Peak concurrent strip demand on one day, sampled at every block start.
 *
 * Demand is a step function that only ever rises where a block begins, so the
 * maximum is attained at one of those instants and sampling them all finds it.
 * Bounded by construction: the outer loop runs once per block of the day and
 * the inner once per block, never on a condition that has to converge
 * (constitution IV). The interval is half-open — a block ending exactly where
 * another starts is not concurrent with it, matching `assignStripLanes`'s own
 * overlap rule.
 */
function peakStripsOnDay(dayBlocks: BlockPlacement[]): number {
  let peak = 0
  for (const sample of dayBlocks) {
    let at = 0
    for (const block of dayBlocks) {
      if (block.startMinutes <= sample.startMinutes && block.endMinutes > sample.startMinutes) {
        at += block.stripCount
      }
    }
    if (at > peak) peak = at
  }
  return peak
}

/**
 * Which day each undismissed validation finding belongs to.
 *
 * Only `validationErrors` are counted, and that is a statement about
 * dismissal rather than about severity. `findingIdentity` gives a
 * `ValidationError` the stable id `dismissFinding` and `state.dismissedFindings`
 * key on; `analysis.warnings` (the bottleneck surface) has no identity function
 * and nothing in the app can dismiss one, so counting them here would put a
 * number in the band that no user action can ever reduce.
 *
 * A finding is attributed to the day its first subject is placed on — the
 * subject is the event the rule is about, and the band is the place a reader
 * looks for "what is wrong with this day". A finding naming no subject, or one
 * whose subject has no placement, belongs to no day and is counted nowhere.
 * `placementDays` only ever needs the `day` a subject sits on, so a caller
 * drawing from committed blocks (`Canvas`) can build it from its own blocks
 * rather than reaching for `state.placements`, which may be a settle ahead.
 *
 * Identities are de-duplicated per day: two errors that dismiss together are
 * one thing a reader can act on, so they read as one.
 */
function findingsByDay(
  validationErrors: ValidationError[],
  dismissedFindings: Record<string, true>,
  placementDays: Record<string, Pick<Placement, 'day'>>,
): Map<number, Set<string>> {
  const byDay = new Map<number, Set<string>>()

  for (const error of validationErrors) {
    const subject = error.subjects?.[0]
    if (subject === undefined) continue
    const placement = placementDays[subject]
    if (placement === undefined) continue

    const identity = findingIdentity(error)
    if (dismissedFindings[identity]) continue

    let identities = byDay.get(placement.day)
    if (!identities) {
      identities = new Set<string>()
      byDay.set(placement.day, identities)
    }
    identities.add(identity)
  }

  return byDay
}

/**
 * `scheduleDeps` plus the dismissal set.
 *
 * Dismissing a finding changes nothing about the schedule, so `scheduleDeps`
 * alone would hand back the pre-dismissal summaries and the band would go on
 * counting a finding the user has already dealt with.
 */
function daySummaryDeps(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): unknown[] {
  return [...scheduleDeps(state, flightingSuggestions), state.dismissedFindings]
}

/**
 * One `DaySummary` per day in `[0, daysAvailable)`, day ascending
 * (data-model.md §9), computed entirely from `blocks` and the finding/dismissal
 * inputs a caller already has — no store read of its own.
 *
 * This is what makes the day band safe to draw from a *committed* model
 * (FR-042, react-code-reviewer finding 1 on 05103d5ff4): `Canvas` calls this
 * directly with the same `assignStripLanes` output it draws blocks from, so
 * the band's numbers and the grid's blocks can never disagree about which
 * schedule they describe. `selectDaySummaries` below is the thin live
 * wrapper other callers use when there is no committed model to prefer.
 */
export function daySummariesFromBlocks(
  blocks: BlockPlacement[],
  daysAvailable: number,
  validationErrors: ValidationError[],
  dismissedFindings: Record<string, true>,
  placementDays: Record<string, Pick<Placement, 'day'>>,
): DaySummary[] {
  const findingIds = findingsByDay(validationErrors, dismissedFindings, placementDays)

  const summaries: DaySummary[] = []
  for (let day = 0; day < daysAvailable; day++) {
    const dayBlocks = blocks.filter((block) => block.day === day)
    const events = new Set(dayBlocks.map((block) => block.competitionId)).size

    let finish: number | null = null
    for (const block of dayBlocks) {
      if (finish === null || block.endMinutes > finish) finish = block.endMinutes
    }

    summaries.push({
      day,
      events,
      finish,
      peakStrips: peakStripsOnDay(dayBlocks),
      unplaced: dayBlocks.filter((block) => block.overflow).length,
      findings: findingIds.get(day)?.size ?? 0,
    })
  }

  return summaries
}

function computeDaySummaries(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): DaySummary[] {
  const schedule = selectDerivedSchedule(state, flightingSuggestions)
  const findings = selectDerivedFindings(state, flightingSuggestions)
  const blocks = assignStripLanes(schedule.events, state.strips_total)
  return daySummariesFromBlocks(
    blocks,
    state.days_available,
    findings.validationErrors,
    state.dismissedFindings,
    state.placements,
  )
}

/** One summary per day in `[0, days_available)`, day ascending (data-model.md §9). */
export const selectDaySummaries = memoizeOnDeps(daySummaryDeps, computeDaySummaries)
