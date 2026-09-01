import { deriveEventSchedule } from '../engine/derive.ts'
import type { DerivedEventSchedule } from '../engine/derive.ts'
import { validateConfig } from '../engine/validation.ts'
import { initialAnalysis } from '../engine/analysis.ts'
import { computeRefRequirements } from '../engine/refs.ts'
import { BottleneckSeverity, ValidationMode, Weapon } from '../engine/types.ts'
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
// Store → components/canvas, the reverse of this app's usual direction. Chosen,
// not stumbled into: the scorecard names blocks by the key the canvas draws
// them under, so the two must agree on which segments an event has. Re-deriving
// the phase list here would be a second home for that fact and the two copies
// would drift silently (constitution, "each fact has exactly one home").
// `geometry.ts` is pure arithmetic with no React and no store read, so the
// import carries nothing back the other way.
import { eventTimeSegments } from '../components/canvas/geometry.ts'
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
// Scorecard metrics (US3, T048)
// ──────────────────────────────────────────────

/**
 * One row of the scorecard. Reads only: every `value` below is either lifted
 * straight off engine output (`ScheduleResult.de_total_end`,
 * `RefRequirementsByDay.peak_*`, a finding's severity) or a sum, max or min
 * over it. No scheduling arithmetic lives here — that belongs in `src/engine/`
 * (constitution I).
 */
export interface ScorecardMetric {
  /** Stable id. Also the value of the rendered row's `data-metric`. */
  id: string
  label: string
  kind: 'time' | 'count' | 'percent'
  /** Collapsed rows render first and are the only ones shown collapsed. */
  tier: 'collapsed' | 'expanded'
  /** null means the metric has no value at all (nothing placed, no days). */
  value: number | null
  /** `${competitionId}:${phase}` — the same key `data-event-block` carries. */
  blockKeys: string[]
}

/**
 * A frozen scorecard snapshot: values only.
 *
 * Block keys are geometry — they move whenever the user moves an event — so
 * freezing them would pin a highlight to where the preset happened to sit
 * rather than to what the metric currently drives (research D9).
 */
export type ScorecardBaseline = Record<string, number | null>

/** One drawable block, flattened out of the derived schedule. */
interface ScorecardBlock {
  key: string
  competitionId: string
  day: number
  startMinutes: number
  endMinutes: number
  stripCount: number
}

/**
 * Every block the canvas draws for this state, in the canvas's own terms.
 *
 * The two rules here — skip an event whose `day_out_of_range` is set, and take
 * its segments from `eventTimeSegments` — are deliberately the same two
 * `assignStripLanes` (`src/components/canvas/lanes.ts`) uses, so a metric can
 * never name a block that is not on screen to highlight.
 */
function scorecardBlocks(schedule: DerivedSchedule): ScorecardBlock[] {
  const blocks: ScorecardBlock[] = []
  for (const [competitionId, derived] of Object.entries(schedule.events)) {
    if (derived.day_out_of_range) continue
    const day = derived.result.assigned_day
    for (const segment of eventTimeSegments(derived)) {
      blocks.push({
        key: `${competitionId}:${segment.phase}`,
        competitionId,
        day,
        startMinutes: segment.startMinutes,
        endMinutes: segment.endMinutes,
        stripCount: segment.stripCount,
      })
    }
  }
  return blocks
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

/** Blocks open across `minute`, half-open `[start, end)` so a block ending exactly then is already done. */
function blocksOpenAt(blocks: ScorecardBlock[], day: number, minute: number): ScorecardBlock[] {
  return blocks.filter(
    (block) =>
      block.day === day && block.startMinutes <= minute && minute < block.endMinutes,
  )
}

const SEVERITY_ORDER = [
  BottleneckSeverity.ERROR,
  BottleneckSeverity.WARN,
  BottleneckSeverity.INFO,
] as const

function computeScorecardMetrics(
  state: StoreState,
  flightingSuggestions: FlightingGroup[] = EMPTY_FLIGHTING,
): ScorecardMetric[] {
  const schedule = selectDerivedSchedule(state, flightingSuggestions)
  const refRows = selectDerivedRefRequirements(state, flightingSuggestions)
  const findings = selectDerivedFindings(state, flightingSuggestions)
  const blocks = scorecardBlocks(schedule)

  const keysByCompetition = new Map<string, string[]>()
  for (const block of blocks) {
    const existing = keysByCompetition.get(block.competitionId)
    if (existing) existing.push(block.key)
    else keysByCompetition.set(block.competitionId, [block.key])
  }

  // ── Finish times: the latest de_total_end, tournament-wide or on one day ──

  function latestFinish(day: number | null): { value: number | null; blockKeys: string[] } {
    let latest: number | null = null
    let latestId: string | null = null
    for (const [id, derived] of Object.entries(schedule.events)) {
      if (derived.day_out_of_range) continue
      if (day !== null && derived.result.assigned_day !== day) continue
      const end = derived.result.de_total_end
      if (end === null) continue
      if (latest === null || end > latest) {
        latest = end
        latestId = id
      }
    }
    return {
      value: latest,
      blockKeys: latestId === null ? [] : (keysByCompetition.get(latestId) ?? []),
    }
  }

  // ── Strip-minutes, per day and in total ──

  const dayAvailable: number[] = []
  for (let day = 0; day < state.days_available; day++) {
    // `state.dayConfigs`, never `schedule.config.dayConfigs`: the store's is the
    // authoring home and is always clock time, while the config copy carries the
    // scheduler's own day axis (research D4/D5). A missing or non-positive
    // window contributes nothing rather than a negative denominator.
    const dayConfig = state.dayConfigs[day]
    const window = dayConfig ? dayConfig.day_end_time - dayConfig.day_start_time : 0
    dayAvailable.push(window > 0 ? state.strips_total * window : 0)
  }

  const dayUsed = dayAvailable.map(() => 0)
  let totalUsed = 0
  for (const block of blocks) {
    const stripMinutes = (block.endMinutes - block.startMinutes) * block.stripCount
    totalUsed += stripMinutes
    if (block.day >= 0 && block.day < dayUsed.length) dayUsed[block.day] += stripMinutes
  }
  const totalAvailable = dayAvailable.reduce((sum, minutes) => sum + minutes, 0)

  // A day with no strip-minutes on offer has no utilization to compare, so it
  // is not one of the days a spread can be taken between.
  const usableDays = dayAvailable
    .map((_available, day) => day)
    .filter((day) => dayAvailable[day] > 0)
  const utilizationOf = (day: number): number => (dayUsed[day] / dayAvailable[day]) * 100

  let spread: number | null = null
  let spreadKeys: string[] = []
  if (usableDays.length >= 2) {
    let maxDay = usableDays[0]
    let minDay = usableDays[0]
    for (const day of usableDays) {
      if (utilizationOf(day) > utilizationOf(maxDay)) maxDay = day
      if (utilizationOf(day) < utilizationOf(minDay)) minDay = day
    }
    spread = utilizationOf(maxDay) - utilizationOf(minDay)
    // A Set because the two can be the same day when every day is level, and a
    // metric must never name one block twice.
    const spreadDays = new Set([maxDay, minDay])
    spreadKeys = blocks.filter((block) => spreadDays.has(block.day)).map((block) => block.key)
  }

  // ── Referees ──

  const totalPeak = peakRow(refRows, (row) => row.peak_total_refs)
  const sabrePeak = peakRow(refRows, (row) => row.peak_saber_refs)
  const sabreIds = new Set(
    schedule.competitions.filter((c) => c.weapon === Weapon.SABRE).map((c) => c.id),
  )

  // The sabre row's day is the day whose `peak_saber_refs` is the maximum — the
  // same row the reported value comes from. `RefRequirementsByDay` carries no
  // sabre-specific peak time (`src/engine/refs.ts` sweeps the total for
  // `peak_time`), so that row's own `peak_time` is the closest instant
  // available. Using the *total* peak day's time instead would light blocks on
  // a day whose sabre peak is not the number the row is reporting.
  const sabreKeys =
    sabrePeak === null
      ? []
      : blocksOpenAt(blocks, sabrePeak.day, sabrePeak.peak_time)
          .filter((block) => sabreIds.has(block.competitionId))
          .map((block) => block.key)

  // ── Findings: validation errors and analysis warnings, counted together ──

  const findingCounts = new Map<BottleneckSeverity, number>()
  const findingSubjects = new Map<BottleneckSeverity, Set<string>>()
  for (const severity of SEVERITY_ORDER) {
    findingCounts.set(severity, 0)
    findingSubjects.set(severity, new Set<string>())
  }

  // `BottleneckSeverity`, not `string`: a severity outside SEVERITY_ORDER would
  // otherwise mint its own map key and be silently dropped from every rendered
  // row — under-counting with a green suite. Typed this way, widening the union
  // breaks `tsc` here instead.
  function noteFinding(severity: BottleneckSeverity, subjects: readonly string[]): void {
    findingCounts.set(severity, (findingCounts.get(severity) ?? 0) + 1)
    const named = findingSubjects.get(severity)
    if (!named) return
    for (const subject of subjects) named.add(subject)
  }

  for (const error of findings.validationErrors) {
    // A global rule's `subjects` is `[field]` (e.g. `['strips_total']`), which
    // names no competition and so resolves to no blocks below.
    noteFinding(error.severity, error.subjects ?? [])
  }
  for (const warning of findings.analysis.warnings) {
    // Day-level causes (`STRIP_CONTENTION` on `Phase.CAPACITY`) arrive with an
    // empty `competition_id`: counted, but naming nobody to highlight.
    noteFinding(warning.severity, warning.competition_id ? [warning.competition_id] : [])
  }

  function findingKeys(severity: BottleneckSeverity): string[] {
    const keys: string[] = []
    for (const subject of findingSubjects.get(severity) ?? []) {
      const blockKeys = keysByCompetition.get(subject)
      if (blockKeys) keys.push(...blockKeys)
    }
    return keys
  }

  // ── Assembly, in render order: collapsed rows first ──

  const tournamentFinish = latestFinish(null)
  const metrics: ScorecardMetric[] = [
    {
      id: 'finish:tournament',
      label: 'Tournament finish',
      kind: 'time',
      tier: 'collapsed',
      value: tournamentFinish.value,
      blockKeys: tournamentFinish.blockKeys,
    },
    {
      id: 'refs:peak-total',
      label: 'Peak referees',
      kind: 'count',
      tier: 'collapsed',
      value: totalPeak === null ? null : totalPeak.peak_total_refs,
      blockKeys:
        totalPeak === null
          ? []
          : blocksOpenAt(blocks, totalPeak.day, totalPeak.peak_time).map((block) => block.key),
    },
  ]

  for (let day = 0; day < state.days_available; day++) {
    const dayFinish = latestFinish(day)
    metrics.push({
      id: `finish:day:${day}`,
      label: `Day ${day + 1} finish`,
      kind: 'time',
      tier: 'expanded',
      value: dayFinish.value,
      blockKeys: dayFinish.blockKeys,
    })
  }

  metrics.push(
    {
      id: 'refs:peak-sabre',
      label: 'Peak sabre referees',
      kind: 'count',
      tier: 'expanded',
      value: sabrePeak === null ? null : sabrePeak.peak_saber_refs,
      blockKeys: sabreKeys,
    },
    {
      id: 'strips:utilization',
      label: 'Strip utilization',
      kind: 'percent',
      tier: 'expanded',
      value: totalAvailable > 0 ? (totalUsed / totalAvailable) * 100 : null,
      blockKeys: blocks.map((block) => block.key),
    },
    {
      id: 'days:balance-spread',
      label: 'Day balance spread',
      kind: 'percent',
      tier: 'expanded',
      value: spread,
      blockKeys: spreadKeys,
    },
  )

  for (const severity of SEVERITY_ORDER) {
    metrics.push({
      id: `findings:${severity}`,
      label: `${severity} findings`,
      kind: 'count',
      tier: 'expanded',
      value: findingCounts.get(severity) ?? 0,
      blockKeys: findingKeys(severity),
    })
  }

  return metrics
}

/** Scorecard rows: the metrics the drawer shows and the blocks each one drives. */
export const selectScorecardMetrics = memoizeOnDeps(scheduleDeps, computeScorecardMetrics)
