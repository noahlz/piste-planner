import { BottleneckCause, BottleneckSeverity, Phase } from './types.ts'
import type {
  GlobalState,
  TournamentConfig,
  Bottleneck,
  RefDemandByDay,
  RefDemandInterval,
  EventTxLog,
  Strip,
  Weapon,
} from './types.ts'
import { dayStart } from './types.ts'
import { MORNING_WAVE_WINDOW_MINS, SLOT_MINS } from './constants.ts'

// ──────────────────────────────────────────────
// PoolContext — video-strip preservation for pool phases
// ──────────────────────────────────────────────

/**
 * Passed by pool-phase callers into findAvailableStrips and earliestResourceWindow
 * to enable the video-strip-preservation rule (METHODOLOGY.md §Video Strip Preservation).
 *
 * When isPoolPhase=true the rule applies: video strips may only be used as overflow
 * during the morning wave OR when the event is the only one on its day. Outside those
 * conditions, pools are restricted to non-video strips only.
 */
export type PoolContext = {
  /** Must be true to activate the video-strip restriction for pools. */
  isPoolPhase: boolean
  /** True when only one competition is scheduled on this day. */
  isSingleEventDay: boolean
  /** Day index (0-based) — used to compute the morning-wave boundary. */
  day: number
}

// ──────────────────────────────────────────────
// Return types for strip selection and resource windows
// ──────────────────────────────────────────────

type FindStripsResult =
  | { type: 'FOUND'; stripIndices: number[] }
  | { type: 'WAIT_UNTIL'; waitUntil: number }

export type NoWindowReason =
  | { kind: 'STRIPS'; needed: number; available: number; earliest_free: number }
  | { kind: 'TIME'; candidate: number; latest_start: number }

export type ResourceWindowResult =
  | { type: 'FOUND'; startTime: number; stripIndices: number[]; bottlenecks: Bottleneck[] }
  | { type: 'NO_WINDOW'; reason?: NoWindowReason }

// ──────────────────────────────────────────────
// snapshotState / restoreState
// ──────────────────────────────────────────────

/**
 * Creates a targeted snapshot of mutable GlobalState fields for rollback during
 * retry loops. Avoids JSON.parse/stringify overhead by cloning only what changes:
 *
 * - strip_free_at: shallow array copy (numbers are primitives)
 * - ref_demand_by_day: each day's intervals array is shallow-copied so rollback via
 *   txLog (object identity splice) is unaffected — the interval objects themselves
 *   are shared across snapshot and live state, which is intentional.
 * - schedule: shallow Record copy (ScheduleResult objects are write-once / immutable)
 * - bottlenecks: shallow array copy (Bottleneck objects are write-once / immutable)
 */
export function snapshotState(state: GlobalState): GlobalState {
  const refs: GlobalState['ref_demand_by_day'] = {}
  for (const dayKey of Object.keys(state.ref_demand_by_day)) {
    const day = Number(dayKey)
    refs[day] = { intervals: [...state.ref_demand_by_day[day].intervals] }
  }
  return {
    strip_free_at: [...state.strip_free_at],
    ref_demand_by_day: refs,
    schedule: { ...state.schedule },
    bottlenecks: [...state.bottlenecks],
  }
}

/**
 * Restores a GlobalState in-place to match a snapshot produced by snapshotState.
 * Mutates target so that callers holding a reference to the original state object
 * see the rolled-back values (scheduleOne passes state by reference).
 */
export function restoreState(target: GlobalState, snapshot: GlobalState): void {
  target.strip_free_at = snapshot.strip_free_at
  target.ref_demand_by_day = snapshot.ref_demand_by_day
  target.schedule = snapshot.schedule
  target.bottlenecks = snapshot.bottlenecks
}

// ──────────────────────────────────────────────
// createGlobalState
// ──────────────────────────────────────────────

/**
 * Initialises a fresh GlobalState from tournament config.
 * All strips are free at DAY_START_MINS (day 0 start).
 * Refs, schedule, and bottlenecks start empty.
 */
export function createGlobalState(config: TournamentConfig): GlobalState {
  return {
    // Strips become available at the start of day 0 in the scheduling time model
    strip_free_at: config.strips.map(() => dayStart(0, config)),
    ref_demand_by_day: {},
    schedule: {},
    bottlenecks: [],
  }
}

// ──────────────────────────────────────────────
// Strip allocation helpers
// ──────────────────────────────────────────────

/**
 * Marks the given strip indices as occupied until endTime.
 * Later allocations always win — endTime is set directly (no max-guard needed
 * since the scheduler never allocates a strip that is still busy).
 *
 * If txLog is provided, the prior free_at value for each strip is recorded
 * before mutation so the allocation can be rolled back.
 */
export function allocateStrips(state: GlobalState, stripIds: number[], endTime: number, txLog?: EventTxLog): void {
  for (const idx of stripIds) {
    if (txLog) {
      txLog.stripChanges.push({ stripIdx: idx, oldFreeAt: state.strip_free_at[idx] })
    }
    state.strip_free_at[idx] = endTime
  }
}

/**
 * No-op if the strip's free_at is already past endTime (the release is stale).
 * Only resets to endTime if the strip's current free_at equals endTime exactly,
 * which is the idempotent release case used by the scheduler.
 *
 * In practice this is not called during normal scheduling — strips expire
 * naturally when their free_at is reached. Kept for correctness and testing.
 */
export function releaseStrips(state: GlobalState, stripIds: number[], endTime: number): void {
  // Strips expire naturally via allocateStrips setting free_at. This function exists for
  // completeness but is effectively a no-op in normal scheduling — strip_free_at is already
  // set to the correct end time during allocation. We never roll back a later allocation
  // or advance a strip that's already free.
  for (const idx of stripIds) {
    if (state.strip_free_at[idx] === endTime) {
      // Already at the expected release time — no-op (idempotent)
    }
  }
}

// ──────────────────────────────────────────────
// findAvailableStrips
// ──────────────────────────────────────────────

/**
 * Finds `count` available strip indices at `atTime`, applying video preference rules.
 *
 * METHODOLOGY.md §Video Strip Preservation:
 * - videoRequired=true: only video-capable strips; WAIT_UNTIL if not enough free
 * - videoRequired=false: prefer non-video strips first (preserves video strips for
 *   phases that need them); falls back to video strips if non-video is insufficient
 *
 * When poolContext is provided with isPoolPhase=true, the pool video-strip rule applies:
 * video strips are excluded as overflow UNLESS the candidate time is within the morning
 * wave (atTime <= dayStart(day) + MORNING_WAVE_WINDOW_MINS) OR isSingleEventDay=true.
 * If excluded and insufficient non-video strips are free, returns WAIT_UNTIL based on
 * non-video release times (Infinity if there are never enough non-video strips).
 *
 * Returns WAIT_UNTIL with the earliest time when enough suitable strips become free.
 */
type IndexedStrip = { i: number; s: Strip; freeAt: number }

/**
 * Annotate each strip with its index and current free_at time. Sorts by freeAt
 * when sort=true so callers can pick the earliest-free strips.
 */
function indexStrips(
  strips: readonly Strip[],
  freeAt: readonly number[],
  predicate: (s: Strip, freeAt: number) => boolean,
  sort = false,
): IndexedStrip[] {
  const result = strips
    .map((s, i): IndexedStrip => ({ i, s, freeAt: freeAt[i] }))
    .filter(x => predicate(x.s, x.freeAt))
  return sort ? result.sort((a, b) => a.freeAt - b.freeAt) : result
}

/** Earliest time `count` strips matching the predicate become free, or Infinity. */
function waitUntilForCount(
  strips: readonly Strip[],
  freeAt: readonly number[],
  count: number,
  predicate: (s: Strip) => boolean,
): number {
  const sorted = indexStrips(strips, freeAt, (s) => predicate(s), true)
  return sorted.length >= count ? sorted[count - 1].freeAt : Infinity
}

export function findAvailableStrips(
  state: GlobalState,
  config: TournamentConfig,
  count: number,
  atTime: number,
  videoRequired: boolean,
  poolContext?: PoolContext,
): FindStripsResult {
  const strips = config.strips
  const freeAt = state.strip_free_at

  if (videoRequired) {
    const candidates = indexStrips(strips, freeAt, (s, t) => s.video_capable && t <= atTime)
    if (candidates.length >= count) {
      return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
    }
    return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(strips, freeAt, count, (s) => s.video_capable) }
  }

  // Pool video-strip preservation rule:
  // When isPoolPhase=true, video strips are excluded unless we're in the morning wave
  // or this is the only event on the day.
  const applyPoolVideoExclusion = poolContext?.isPoolPhase === true
    && !poolContext.isSingleEventDay
    && atTime > dayStart(poolContext.day, config) + MORNING_WAVE_WINDOW_MINS

  if (applyPoolVideoExclusion) {
    // Non-video strips only — exclude video entirely
    const freeNonVideo = indexStrips(strips, freeAt, (s, t) => !s.video_capable && t <= atTime, true)
    if (freeNonVideo.length >= count) {
      return { type: 'FOUND', stripIndices: freeNonVideo.slice(0, count).map(x => x.i) }
    }
    return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(strips, freeAt, count, (s) => !s.video_capable) }
  }

  // Non-video preferred: collect free non-video strips first, then free video strips
  const freeNonVideo = indexStrips(strips, freeAt, (s, t) => !s.video_capable && t <= atTime, true)
  const freeVideo = indexStrips(strips, freeAt, (s, t) => s.video_capable && t <= atTime, true)
  const candidates = [...freeNonVideo, ...freeVideo]

  if (candidates.length >= count) {
    return { type: 'FOUND', stripIndices: candidates.slice(0, count).map(x => x.i) }
  }

  return { type: 'WAIT_UNTIL', waitUntil: waitUntilForCount(strips, freeAt, count, () => true) }
}

// ──────────────────────────────────────────────
// Refs per-day state helpers
// ──────────────────────────────────────────────

/**
 * Lazily initialises the per-day ref demand record if not yet present.
 */
function ensureDayRefs(state: GlobalState, day: number): RefDemandByDay {
  if (!state.ref_demand_by_day[day]) {
    state.ref_demand_by_day[day] = { intervals: [] }
  }
  return state.ref_demand_by_day[day]
}

// ──────────────────────────────────────────────
// allocateRefs
// ──────────────────────────────────────────────

/**
 * Records ref allocation for a phase by pushing a RefDemandInterval into the
 * day's intervals array. The interval records ref demand for post-schedule reporting
 * (computeRefRequirements sweep-line analysis).
 *
 * If txLog is provided, the pushed interval object reference is recorded so
 * rollbackEvent can splice it out by identity.
 */
export function allocateRefs(
  state: GlobalState,
  day: number,
  weapon: Weapon,
  count: number,
  startTime: number,
  endTime: number,
  txLog?: EventTxLog,
): void {
  const dayRefs = ensureDayRefs(state, day)
  const interval: RefDemandInterval = { startTime, endTime, count, weapon }
  dayRefs.intervals.push(interval)

  if (txLog) {
    txLog.refEvents.push({ day, event: interval })
  }
}

/**
 * Reverses all strip and ref allocations recorded in txLog.
 *
 * Strip changes: processed in reverse so that a strip allocated twice in one event
 * restores to its earliest observed value.
 *
 * Ref changes: find-and-remove the recorded RefDemandInterval by object identity.
 * Object-reference tracking is required for phase-major scheduling where multiple
 * events' txLogs interleave entries in the same intervals array — positional indices
 * recorded by one event would be shifted by concurrent rollbacks.
 */
export function rollbackEvent(state: GlobalState, txLog: EventTxLog): void {
  // Restore strips in reverse order
  for (let i = txLog.stripChanges.length - 1; i >= 0; i--) {
    const { stripIdx, oldFreeAt } = txLog.stripChanges[i]
    state.strip_free_at[stripIdx] = oldFreeAt
  }

  // Remove ref intervals by object identity
  for (let i = txLog.refEvents.length - 1; i >= 0; i--) {
    const { day, event } = txLog.refEvents[i]
    const dayRefs = state.ref_demand_by_day[day]
    if (!dayRefs) continue

    const idx = dayRefs.intervals.indexOf(event)
    if (idx >= 0) {
      dayRefs.intervals.splice(idx, 1)
    }
  }

  txLog.stripChanges = []
  txLog.refEvents = []
}

// ──────────────────────────────────────────────
// snapToSlot
// ──────────────────────────────────────────────

/**
 * Rounds t up to the next SLOT_MINS boundary.
 * snapToSlot(0)=0, snapToSlot(15)=30, snapToSlot(30)=30, snapToSlot(31)=60.
 *
 * METHODOLOGY.md §Slot Granularity: applied to phase start times; NOT applied to phase end times.
 */
export function snapToSlot(t: number): number {
  const r = t % SLOT_MINS
  if (r === 0) return t
  return t + (SLOT_MINS - r)
}

// ──────────────────────────────────────────────
// NO_WINDOW diagnostic helpers
// ──────────────────────────────────────────────

/**
 * Counts how many strips are free at `atTime`, optionally filtering to video-capable strips only.
 */
function countFreeStrips(
  state: GlobalState,
  config: TournamentConfig,
  atTime: number,
  videoRequired: boolean,
): number {
  return config.strips.filter(
    (s, i) => (!videoRequired || s.video_capable) && state.strip_free_at[i] <= atTime,
  ).length
}

/**
 * Determines the limiting NoWindowReason when no window could be found.
 * Returns TIME if the candidate is already past the deadline, otherwise STRIPS.
 */
function diagNoWindowReason(
  candidate: number,
  latestStart: number,
  stripsNeeded: number,
  stripsAvailable: number,
  lastStripFreeMax: number,
): NoWindowReason {
  if (candidate > latestStart) {
    return { kind: 'TIME', candidate, latest_start: latestStart }
  }
  return { kind: 'STRIPS', needed: stripsNeeded, available: stripsAvailable, earliest_free: lastStripFreeMax }
}

// ──────────────────────────────────────────────
// earliestResourceWindow
// ──────────────────────────────────────────────

/**
 * Finds the earliest start time at or after notBefore where strip requirements
 * can be met. Refs are always assumed available — only strips and time gate scheduling.
 * METHODOLOGY.md §Resource Windows.
 *
 * Algorithm:
 * 1. Snap notBefore to slot boundary.
 * 2. Try to find strips at candidate time.
 * 3. If WAIT_UNTIL, advance candidate and retry (bounded by strip count limit).
 * 4. Snap resulting time to slot.
 * 5. Emit STRIP_CONTENTION bottleneck if delay exceeds THRESHOLD_MINS.
 * 6. Return NO_WINDOW if time exceeds DAY_START + LATEST_START_OFFSET or DAY_END.
 *
 * The MAX_RESCHEDULE_ATTEMPTS guard prevents unbounded iteration.
 */
export function earliestResourceWindow(
  stripsNeeded: number,
  videoRequired: boolean,
  notBefore: number,
  day: number,
  state: GlobalState,
  config: TournamentConfig,
  competitionId: string,
  phase: Phase,
  poolContext?: PoolContext,
): ResourceWindowResult {
  const latestStart = dayStart(day, config) + config.LATEST_START_OFFSET
  const dayEndTime = dayStart(day, config) + config.DAY_LENGTH_MINS

  const buildNoWindow = (cand: number, stripFreeMax: number): ResourceWindowResult => ({
    type: 'NO_WINDOW',
    reason: diagNoWindowReason(
      cand,
      latestStart,
      stripsNeeded,
      countFreeStrips(state, config, cand, videoRequired),
      stripFreeMax,
    ),
  })

  let candidate = snapToSlot(notBefore)

  // Resource-window search uses more attempts than the outer reschedule loop (MAX_RESCHEDULE_ATTEMPTS)
  // because each 30-min slot scan may need multiple probes to find strip availability.
  // The multiplier and offset provide headroom for dense schedules.
  // Each iteration must advance candidate to guard against stalls.
  const maxAttempts = config.MAX_RESCHEDULE_ATTEMPTS * 2 + 10
  let attempts = 0

  // Hoisted to capture the last known strip free time for diagnostics on loop exhaustion.
  let lastStripFreeMax = 0

  while (attempts < maxAttempts) {
    attempts++

    if (candidate > latestStart || candidate > dayEndTime) {
      return {
        type: 'NO_WINDOW',
        reason: { kind: 'TIME', candidate, latest_start: latestStart },
      }
    }

    const stripResult = findAvailableStrips(state, config, stripsNeeded, candidate, videoRequired, poolContext)

    if (stripResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(stripResult.waitUntil)
      if (next <= candidate) {
        // Shouldn't happen, but guard against infinite loop
        return {
          type: 'NO_WINDOW',
          reason: {
            kind: 'STRIPS',
            needed: stripsNeeded,
            available: countFreeStrips(state, config, candidate, videoRequired),
            earliest_free: stripResult.waitUntil,
          },
        }
      }
      candidate = next
      continue
    }

    const selectedStrips = stripResult.stripIndices

    // T is the latest of: candidate and all selected strip free_at values
    const stripFreeMax = selectedStrips.reduce(
      (max, i) => Math.max(max, state.strip_free_at[i]),
      0,
    )
    lastStripFreeMax = stripFreeMax

    const T = snapToSlot(Math.max(candidate, stripFreeMax))

    if (T > latestStart || T > dayEndTime) {
      return buildNoWindow(candidate, stripFreeMax)
    }

    // Verify strips are still available at T (they may have been claimed by a concurrent phase)
    const verifyResult = findAvailableStrips(state, config, stripsNeeded, T, videoRequired, poolContext)
    if (verifyResult.type === 'WAIT_UNTIL') {
      const next = snapToSlot(verifyResult.waitUntil)
      if (next <= candidate) {
        return {
          type: 'NO_WINDOW',
          reason: {
            kind: 'STRIPS',
            needed: stripsNeeded,
            available: countFreeStrips(state, config, T, videoRequired),
            earliest_free: verifyResult.waitUntil,
          },
        }
      }
      candidate = next
      continue
    }

    // Compute bottlenecks for contention delays
    const delay = T - notBefore
    const bottlenecks: Bottleneck[] = []

    if (delay >= config.THRESHOLD_MINS) {
      bottlenecks.push({
        competition_id: competitionId,
        phase,
        cause: BottleneckCause.STRIP_CONTENTION,
        severity: BottleneckSeverity.WARN,
        delay_mins: delay,
        message: `${competitionId} ${phase}: delayed ${delay} min due to strip contention`,
      })

      if (videoRequired) {
        bottlenecks.push({
          competition_id: competitionId,
          phase,
          cause: BottleneckCause.VIDEO_STRIP_CONTENTION,
          severity: BottleneckSeverity.WARN,
          delay_mins: delay,
          message: `${competitionId} ${phase}: video strip contention caused ${delay} min delay`,
        })
      }
    }

    return {
      type: 'FOUND',
      startTime: T,
      stripIndices: verifyResult.stripIndices,
      bottlenecks,
    }
  }

  return buildNoWindow(candidate, lastStripFreeMax)
}
