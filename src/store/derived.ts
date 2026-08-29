import { deriveEventSchedule } from '../engine/derive.ts'
import type { DerivedEventSchedule } from '../engine/derive.ts'
import { validateConfig } from '../engine/validation.ts'
import { initialAnalysis } from '../engine/analysis.ts'
import { computeRefRequirements } from '../engine/refs.ts'
import type {
  AnalysisResult,
  Competition,
  FlightingGroup,
  RefDemandByDay,
  RefDemandInterval,
  RefRequirementsByDay,
  TournamentConfig,
  ValidationError,
} from '../engine/types.ts'
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
    state.globalOverrides,
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

  const validationErrors = validateConfig(config, competitions)
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
