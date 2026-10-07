import { deriveEventSchedule } from '../engine/derive.ts'
import type { DerivedEventSchedule } from '../engine/derive.ts'
import { validateConfig } from '../engine/validation.ts'
import { initialAnalysis } from '../engine/analysis.ts'
import { computeRefRequirements, refDemandFromSchedule } from '../engine/refs.ts'
import { checkPlacementRules } from '../engine/placementRules.ts'
import type { PlacedEvent } from '../engine/placementRules.ts'
import { firstLastDayWarnings } from '../engine/concurrentScheduler.ts'
import { BottleneckRule, BottleneckSeverity, DAY_AXIS_SPACING_MINS, ValidationMode } from '../engine/types.ts'
import type {
  AnalysisResult,
  Bottleneck,
  Competition,
  ScheduleResult,
  TournamentType,
  RefDemandByDay,
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
// Pure string helpers, no React and no store read. They lived under
// `src/components/` until 013 T031 moved them to `src/lib/`: the store may not
// import from the component tree (research D6 fixes the direction as
// store → layout/lib ← components), and `selectFindings` needs both.
import { phaseDisplay } from '../lib/placementLabels.ts'
import { competitionLabel } from '../lib/competitionLabels.ts'
import { formatClock } from '../lib/time.ts'
import { buildTournamentConfig } from './buildConfig.ts'
import type { StoreState } from './store.ts'

/**
 * Derived read selectors — research D2, data-model.md §Store slice changes.
 *
 * Each selector is a pure function of store inputs: placements are the
 * source of truth (never `scheduleAll`), so a hand-edited placement shows up
 * immediately. Nothing here is written back to state.
 */

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

function scheduleDeps(state: StoreState): unknown[] {
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
  ]
}

function computeDerivedSchedule(state: StoreState): DerivedSchedule {
  const { config, competitions } = buildTournamentConfig(state)

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

/**
 * The derived results (`deriveEventSchedule`) sit on the clock axis – minutes
 * from midnight of their own store day – while `buildTournamentConfig`'s
 * `dayConfigs` sit on the scheduler axis (day d shifted by
 * d × DAY_AXIS_SPACING_MINS, `buildConfig.ts`). This is the one place the two
 * meet: a copy of the config whose day windows are shifted back onto the clock
 * axis, so every engine function handed derived results reads a day start the
 * results can be measured from. A day with no window (no `setDays` yet) falls
 * back to the default clock hours.
 */
function clockAxisConfig(config: TournamentConfig): TournamentConfig {
  return {
    ...config,
    dayConfigs: Array.from({ length: config.days_available }, (_, d) => {
      const window = config.dayConfigs[d]
      if (window === undefined) {
        return {
          day_start_time: config.DAY_START_MINS,
          day_end_time: config.DAY_END_MINS,
          day_hard_end_time: config.DAY_HARD_END_MINS,
        }
      }
      const shift = d * DAY_AXIS_SPACING_MINS
      return {
        day_start_time: window.day_start_time - shift,
        day_end_time: window.day_end_time - shift,
        day_hard_end_time: window.day_hard_end_time - shift,
      }
    }),
  }
}

/**
 * Engine findings over the placements as drawn (016 spec §1, §3): the
 * same-day rule check (`checkPlacementRules`) and the first/last day WARN
 * (`firstLastDayWarnings`, the scheduler's own function). Events with no
 * placement or with a day the tournament no longer has are left out of both
 * (review focus 1). The engine's late-day finding is not run here: the store's
 * `late-finish:day:<n>` row is the app's late-day finding (R2).
 */
function placementFindings(schedule: DerivedSchedule, tournamentType: TournamentType): Bottleneck[] {
  const clockConfig = clockAxisConfig(schedule.config)
  const inRange: Record<string, ScheduleResult> = {}
  const placed: PlacedEvent[] = []
  for (const [id, { result, day_out_of_range }] of Object.entries(schedule.events)) {
    if (day_out_of_range) continue
    inRange[id] = result
    // A flighted event's pools start with flight A.
    const poolStart = result.flight_a_start ?? result.pool_start
    if (poolStart === null) continue
    placed.push({ competition_id: id, day: result.assigned_day, pool_start: poolStart })
  }

  return [
    ...checkPlacementRules(
      schedule.competitions,
      placed,
      tournamentType,
      (day) => clockConfig.dayConfigs[day].day_start_time,
      competitionLabel,
    ),
    ...firstLastDayWarnings(inRange, clockConfig),
  ]
}

function computeDerivedFindings(state: StoreState): DerivedFindings {
  const schedule = selectDerivedSchedule(state)
  const { config, competitions } = schedule

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
  const preSchedule = initialAnalysis(config, competitions, dayAssignments)
  const analysis: AnalysisResult = {
    ...preSchedule,
    warnings: [...preSchedule.warnings, ...placementFindings(schedule, state.tournament_type)],
  }

  return { validationErrors, analysis }
}

/** Derived findings: validation errors plus pre-scheduling analysis, from current inputs. */
export const selectDerivedFindings = memoizeOnDeps(scheduleDeps, computeDerivedFindings)

/**
 * Ref-demand intervals for the placements as drawn: the derived per-event
 * `ScheduleResult`s handed to the engine's `refDemandFromSchedule`, the same
 * function the scheduler calls on its own schedule (016 spec §5), so the
 * footer's peak and the reported peak are one number. Out-of-range placements
 * are skipped here: their `assigned_day` cannot address a day bucket in
 * `config.days_available`.
 */
export function buildRefDemandByDay(schedule: DerivedSchedule): Record<number, RefDemandByDay> {
  const inRange = Object.values(schedule.events)
    .filter(({ day_out_of_range }) => !day_out_of_range)
    .map(({ result }) => result)
  return refDemandFromSchedule(inRange, schedule.config, schedule.competitions)
}

function computeDerivedRefRequirements(state: StoreState): RefRequirementsByDay[] {
  const schedule = selectDerivedSchedule(state)
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

function computeFooterMetrics(state: StoreState): FooterMetric[] {
  const schedule = selectDerivedSchedule(state)
  const refRows = selectDerivedRefRequirements(state)

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

function computePlacementCounts(state: StoreState): PlacementCounts {
  // An event the packer could not fit is unplaced from the canvas's point of
  // view even though its own placement is in range (data-model.md §10: "an
  // event the packer could not fit is unplaced whatever the store says") — so
  // it counts once, in `unplaced`, and is excluded from `placed`, never both.
  // A single event can emit up to three segments (`eventTimeSegments`), so
  // this is keyed by competition id, not block count, or one event with two
  // overflowing segments would count twice.
  const schedule = selectDerivedSchedule(state)
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
// The unified findings list (data-model.md §5, research D6, 013 T031)
// ──────────────────────────────────────────────

/**
 * How loudly a row speaks. `Unplaced` is its own severity rather than a
 * `Warning` with a flag: it is the one finding the organizer can act on by
 * moving something, and the panel and the tool rail both style it apart.
 * Its underlying engine severity is still WARN, which is what makes it
 * dismissable (§2.2).
 */
export const FindingSeverity = {
  BLOCKING: 'Blocking',
  WARNING: 'Warning',
  NOTE: 'Note',
  UNPLACED: 'Unplaced',
} as const
export type FindingSeverity = (typeof FindingSeverity)[keyof typeof FindingSeverity]

/**
 * How close to the day's target a finish has to be before it is worth saying
 * (data-model.md §5). A UI constant, not an engine one: the engine has no
 * opinion about slack, and nothing in `src/engine/` reads this.
 */
export const LATE_FINISH_WINDOW_MINS = 45

/** One row of the Findings panel — every surface that shows a finding reads this shape. */
export interface Finding {
  /** Stable across recomputes of the same condition, so a dismissal keeps matching. */
  id: string
  severity: FindingSeverity
  /** Where the reader should look: "Day 2 · Pools", "strips_total", "Venue". */
  where: string
  /** 0-based store day, or null when the row belongs to no drawn day. */
  day: number | null
  message: string
  /** Competition id when the row names one, for the canvas jump. */
  target: string | null
  /**
   * Every competition on the board the row names, sorted and unique, so the
   * gutter flag and the findings edge mark both events of a two-event finding.
   * `target` stays the single event the jump goes to.
   */
  subjects: string[]
  /**
   * Whether the organizer may wave the row off: Warning and Unplaced rows, except
   * a `hard-separation-violated` Warning (016 R1). Blocking and Note rows never.
   * `dismissFinding` and the panel's dismiss control both read this.
   */
  dismissable: boolean
}

/** ERROR → Blocking, WARN → Warning, INFO → Note (contract §1.1, shared by §1.2). */
function severityOf(severity: BottleneckSeverity): FindingSeverity {
  if (severity === BottleneckSeverity.ERROR) return FindingSeverity.BLOCKING
  if (severity === BottleneckSeverity.WARN) return FindingSeverity.WARNING
  return FindingSeverity.NOTE
}

/** Warning and Unplaced rows may be dismissed, unless their rule says otherwise (016 R1). */
function dismissableOf(severity: FindingSeverity, rule?: string): boolean {
  if (rule === BottleneckRule.HARD_SEPARATION_VIOLATED) return false
  return severity === FindingSeverity.WARNING || severity === FindingSeverity.UNPLACED
}

/**
 * The order the panel reads in: what stops the tournament, then what is not
 * drawn, then what is merely tight, then what is only worth knowing.
 */
const SEVERITY_RANK: Record<FindingSeverity, number> = {
  [FindingSeverity.BLOCKING]: 0,
  [FindingSeverity.UNPLACED]: 1,
  [FindingSeverity.WARNING]: 2,
  [FindingSeverity.NOTE]: 3,
}

/**
 * Every row the current inputs raise, dismissed ones included.
 *
 * Four sources, appended in a fixed order (contract §1.6) and then stably
 * sorted by severity, so within a severity group the source order survives:
 * validation errors, then bottleneck warnings, then the lane packer's
 * overflow and out-of-range events, then one late-finish row per day.
 *
 * Bounded by construction (constitution IV): every loop runs once over a list
 * whose length is already fixed — the errors, the warnings, the blocks, the
 * days. Nothing here retries and nothing converges.
 */
function computeAllFindings(state: StoreState): Finding[] {
  const schedule = selectDerivedSchedule(state)
  const derivedFindings = selectDerivedFindings(state)
  const competitionsById = new Map(schedule.competitions.map((c) => [c.id, c]))

  /** A subject is a target only when it names a competition the board actually has. */
  function resolveTarget(id: string | undefined): string | null {
    if (id === undefined || id === '') return null
    return competitionsById.has(id) ? id : null
  }

  function labelOf(target: string): string {
    const competition = competitionsById.get(target)
    return competition ? competitionLabel(competition) : target
  }

  /**
   * The store day a target sits on, or null when it has no placement or an
   * out-of-range one. `state.placements` and `state.days_available` — the
   * store's own day axis, never `config.days_available`, which carries the
   * scheduler's compacted one (research D4/D5).
   */
  function dayOf(target: string): number | null {
    const placement = state.placements[target]
    if (placement === undefined) return null
    if (placement.day < 0 || placement.day >= state.days_available) return null
    return placement.day
  }

  /** Contract §1.5, shared by the validation and bottleneck rows. */
  function whereOf(target: string | null, day: number | null, fallback: string): string {
    if (target === null) return fallback
    if (day === null) return labelOf(target)
    return `Day ${day + 1} · ${labelOf(target)}`
  }

  /** The on-board competitions among `ids`, sorted and unique. */
  function subjectsOf(ids: string[]): string[] {
    return [...new Set(ids.filter((id) => competitionsById.has(id)))].sort()
  }

  const rows: Finding[] = []

  // ── §1.1 validation errors ──
  for (const error of derivedFindings.validationErrors) {
    const target = resolveTarget(error.subjects[0])
    const day = target === null ? null : dayOf(target)
    rows.push({
      id: findingIdentity(error),
      severity: severityOf(error.severity),
      where: whereOf(target, day, error.field),
      day,
      message: error.message,
      target,
      subjects: subjectsOf(error.subjects),
      dismissable: dismissableOf(severityOf(error.severity)),
    })
  }

  // ── §1.2 bottleneck warnings ──
  //
  // The row id is `analysis:<rule>:<competition_id>:<subjects joined by +>:<day or ->`
  // (016 spec §2): the condition itself, so a dismissal stays with its finding
  // when a sibling appears or goes away, and a day-scoped warning dismissed on
  // one day does not hide the same warning on another. The day is the raw
  // `Bottleneck.day`, even outside `days_available`: two stranded day-scoped
  // findings (days 4 and 5 after the days are cut) stay distinct.
  //
  // No two producers reaching these rows share rule, owner, subjects and day,
  // so the id needs no tie-break: each `initialAnalysis` pass emits at most one
  // finding per day (venue passes), per competition, per competition and day,
  // or per unordered pair; `checkPlacementRules` one per pair and rule, owned
  // by the older side for the window; `firstLastDayWarnings` one per rule.
  //
  // `day` and `where` come from `Bottleneck.day` when it names a day the board
  // has, so a Day 2 venue warning reads "Day 2"; otherwise from the target's
  // placement, as before.
  for (const warning of derivedFindings.analysis.warnings) {
    const target = resolveTarget(warning.competition_id)
    const ownDay =
      warning.day !== undefined && warning.day >= 0 && warning.day < state.days_available ? warning.day : null
    const day = ownDay ?? (target === null ? null : dayOf(target))
    const severity = severityOf(warning.severity)
    const venue = day === null ? 'Venue' : `Day ${day + 1}`
    rows.push({
      id: `analysis:${warning.rule}:${warning.competition_id}:${warning.subjects.join('+')}:${warning.day ?? '-'}`,
      severity,
      where: whereOf(target, day, venue),
      day,
      message: warning.message,
      target,
      subjects: subjectsOf([warning.competition_id, ...warning.subjects]),
      dismissable: dismissableOf(severity, warning.rule),
    })
  }

  // ── §1.3 Unplaced: one row per overflowing block ──
  //
  // The same `assignStripLanes` call the canvas draws from and the footer
  // measures, so a row can never claim an overflow the grid does not show.
  const blocks = assignStripLanes(schedule.events, state.strips_total)
  for (const block of blocks) {
    if (!block.overflow) continue
    const phase = phaseDisplay(block.phase)
    const strips = `${block.stripCount} strip${block.stripCount === 1 ? '' : 's'}`
    rows.push({
      id: `unplaced:${block.competitionId}:${block.phase}`,
      severity: FindingSeverity.UNPLACED,
      where: `Day ${block.day + 1} · ${phase}`,
      day: block.day,
      message:
        `${labelOf(block.competitionId)} needs ${strips} for ${phase} on Day ${block.day + 1} ` +
        `and none are free for ${formatClock(block.startMinutes)}–${formatClock(block.endMinutes)}. ` +
        'It is drawn at strip 1, over the events that hold those strips.',
      target: block.competitionId,
      subjects: [block.competitionId],
      dismissable: true,
    })
  }

  // ── §1.3 Unplaced: one row per stranded event (FR-060) ──
  //
  // `assignStripLanes` skips these outright — there is no day row to draw them
  // on — so they raise no overflow row and would otherwise be invisible.
  // `day` is null for the same reason: no band can carry the count.
  for (const [id, derived] of Object.entries(schedule.events)) {
    if (!derived.day_out_of_range) continue
    const assignedDay = derived.result.assigned_day
    rows.push({
      id: `unplaced:${id}:day`,
      severity: FindingSeverity.UNPLACED,
      where: `Day ${assignedDay + 1} out of range`,
      day: null,
      message:
        `${labelOf(id)} is placed on Day ${assignedDay + 1}, which the tournament no longer has. ` +
        'The next Auto-assign places it afresh.',
      target: id,
      subjects: subjectsOf([id]),
      dismissable: true,
    })
  }

  // ── §1.4 Late finish: at most one row per day ──
  //
  // `finish` is the maximum block end on the day — the same number the day
  // band prints, never `de_total_end`, which is the footer's tournament-wide
  // fact and would let the panel warn about a time the grid does not show.
  // `target` is the day's `day_end_time` in `state.dayConfigs`, the store's
  // clock-time day hours: the soft target (default 7:00 PM, Ops Manual 2026-27
  // p.17), not the 10:00 PM hard end. Work may run past it, so this row is the
  // app's version of the engine's late-day WARN (METHODOLOGY.md §Same-Day
  // Completion, 024 D7).
  //
  // This is the only row a hand move past the day's target can raise: it is a
  // Warning, so the Blocking count — and therefore Auto-assign's disabled
  // state — is untouched by the move (FR-025). Nothing here compares referees
  // needed against referees available either (FR-026).
  for (let day = 0; day < state.days_available; day++) {
    const dayBlocks = blocks.filter((block) => block.day === day)
    if (dayBlocks.length === 0) continue
    const dayConfig = state.dayConfigs[day]
    if (dayConfig === undefined) continue

    const target = dayConfig.day_end_time
    let finish = dayBlocks[0].endMinutes
    for (const block of dayBlocks) {
      if (block.endMinutes > finish) finish = block.endMinutes
    }
    if (finish <= target - LATE_FINISH_WINDOW_MINS) continue

    // Ties go to the lowest competition id so the row names the same event
    // between two renders of the same board.
    let culprit = null as BlockPlacement | null
    for (const block of dayBlocks) {
      if (block.endMinutes !== finish) continue
      if (culprit === null || block.competitionId < culprit.competitionId) culprit = block
    }
    if (culprit === null) continue

    const phase = phaseDisplay(culprit.phase)
    const message =
      finish > target
        ? `${phase} finishes at ${formatClock(finish)}, ${finish - target} minutes past the day's target of ${formatClock(target)}.`
        : `${phase} finishes at ${formatClock(finish)}, ${target - finish} minutes before the day's target of ${formatClock(target)}. No slack for a delayed round.`

    rows.push({
      id: `late-finish:day:${day}`,
      severity: FindingSeverity.WARNING,
      where: `Day ${day + 1} · ${labelOf(culprit.competitionId)}`,
      day,
      message,
      target: culprit.competitionId,
      subjects: [culprit.competitionId],
      dismissable: true,
    })
  }

  // `Array.prototype.sort` is stable, so rows keep their source order inside a
  // severity group — which is the whole of §1.6's within-group rule.
  return rows.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
}

/**
 * Every row, dismissed ones included — what `dismissFinding` decides against
 * (contract §2.2). Memoised on `scheduleDeps` alone: a dismissal changes which
 * rows are *shown*, never which rows exist.
 */
export const selectAllFindings = memoizeOnDeps(scheduleDeps, computeAllFindings)

/**
 * `scheduleDeps` plus the dismissal set.
 *
 * Dismissing a finding changes nothing about the schedule, so `scheduleDeps`
 * alone would hand back the pre-dismissal rows and both the panel and the day
 * band would go on showing a finding the user has already dealt with.
 */
function daySummaryDeps(state: StoreState): unknown[] {
  return [...scheduleDeps(state), state.dismissedFindings]
}

/**
 * A stored dismissal hides only a row that is dismissable now. A save or shared
 * URL may carry any id as a sticky record (`serialization.ts`), so the read side
 * holds 016 R1 too: a hard same-day rule break, a Blocking or a Note row stays
 * shown whatever `dismissedFindings` says.
 */
function computeFindings(state: StoreState): Finding[] {
  return selectAllFindings(state).filter((row) => !row.dismissable || !state.dismissedFindings[row.id])
}

/** The rows the UI shows: every current finding, severity-ordered, less the dismissable ones the user has waved off. */
export const selectFindings = memoizeOnDeps(daySummaryDeps, computeFindings)

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
  /** Undismissed `selectFindings` rows whose `day` is this day (contract §1.7). */
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
 * One `DaySummary` per day in `[0, daysAvailable)`, day ascending
 * (data-model.md §9), computed entirely from `blocks` and the findings rows a
 * caller already has — no store read of its own.
 *
 * 013 T031 replaced the old `validationErrors` + `dismissedFindings` +
 * `placementDays` triple with the finished `Finding[]`. The band's count is
 * now literally "rows the Findings panel shows against this day", so the two
 * surfaces cannot disagree, and the per-day identity de-duplication the triple
 * needed is gone with it: a `Finding` id is already unique per row.
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
  findings: Finding[],
): DaySummary[] {
  // One pass over the rows rather than a filter per day (constitution IV).
  const findingsOnDay = new Map<number, number>()
  for (const finding of findings) {
    if (finding.day === null) continue
    findingsOnDay.set(finding.day, (findingsOnDay.get(finding.day) ?? 0) + 1)
  }

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
      findings: findingsOnDay.get(day) ?? 0,
    })
  }

  return summaries
}

function computeDaySummaries(state: StoreState): DaySummary[] {
  const schedule = selectDerivedSchedule(state)
  const blocks = assignStripLanes(schedule.events, state.strips_total)
  return daySummariesFromBlocks(blocks, state.days_available, selectFindings(state))
}

/** One summary per day in `[0, days_available)`, day ascending (data-model.md §9). */
export const selectDaySummaries = memoizeOnDeps(daySummaryDeps, computeDaySummaries)
